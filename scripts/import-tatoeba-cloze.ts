/**
 * 空所補充クイズの出題文マスター (public.cloze_sentences) を Tatoeba から取り込む。
 *
 * 事前に https://tatoeba.org/ja/downloads から次を落として解凍しておく (.bz2 → bunzip2):
 *   - eng_sentences_detailed.tsv   (per_language/eng/)
 *   - jpn_sentences_detailed.tsv   (per_language/jpn/)
 *   - links.csv                    (links.tar.bz2)
 *   - sentences_CC0.csv            (sentences_CC0.tar.bz2)  任意。無ければ全文 CC BY 2.0 FR 扱い
 *   - tags.csv                     (tags.tar.bz2)           任意。"@..." タグ付きの文を除外する
 *
 * 使い方:
 *   npx tsx scripts/import-tatoeba-cloze.ts \
 *     --eng eng_sentences_detailed.tsv --jpn jpn_sentences_detailed.tsv --links links.csv \
 *     [--cc0 sentences_CC0.csv] [--tags tags.csv] [--limit 1000] [--dry-run] [--out preview.jsonl]
 *
 * --dry-run のときは DB に書かず件数だけ出す (--out を付けると JSONL で書き出す)。
 * 書き込み時は NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要。
 * id (英文ID) で upsert するので、何度流しても重複しない。
 */
import { createReadStream, createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createClient } from '@supabase/supabase-js';
import {
  isQualityWarningTag,
  isUsableEnglishSentence,
  licenseFor,
  parseCc0Line,
  parseLinkLine,
  parseSentenceLine,
  parseTagLine,
  pickJapaneseTranslation,
  type TatoebaSentence,
} from '../src/lib/cloze/tatoeba';
import { tokenizeForIndex } from '../src/lib/cloze/tokenize';

const UPSERT_BATCH_SIZE = 500;

type Args = {
  eng: string;
  jpn: string;
  links: string;
  cc0: string | null;
  tags: string | null;
  limit: number | null;
  dryRun: boolean;
  out: string | null;
};

function parseArgs(argv: string[]): Args {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      values.set(key, next);
      i += 1;
    } else {
      flags.add(key);
    }
  }

  const required = (key: string) => {
    const value = values.get(key);
    if (!value) throw new Error(`--${key} <path> is required`);
    return value;
  };
  const limitText = values.get('limit');
  const limit = limitText ? Number.parseInt(limitText, 10) : null;

  return {
    eng: required('eng'),
    jpn: required('jpn'),
    links: required('links'),
    cc0: values.get('cc0') ?? null,
    tags: values.get('tags') ?? null,
    limit: limit && limit > 0 ? limit : null,
    dryRun: flags.has('dry-run'),
    out: values.get('out') ?? null,
  };
}

async function forEachLine(path: string, onLine: (line: string) => void): Promise<void> {
  const reader = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity });
  for await (const line of reader) {
    if (line) onLine(line);
  }
}

function readEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

type ClozeSentenceInsert = {
  id: number;
  sentence_en: string;
  sentence_ja: string;
  ja_sentence_id: number;
  author_en: string | null;
  author_ja: string | null;
  license_en: string;
  license_ja: string;
  tokens: string[];
  word_count: number;
  source: 'tatoeba';
};

async function run() {
  const args = parseArgs(process.argv.slice(2));

  // 1. 除外する文 (品質警告タグ付き)
  const flagged = new Set<number>();
  if (args.tags) {
    await forEachLine(args.tags, (line) => {
      const parsed = parseTagLine(line);
      if (parsed && isQualityWarningTag(parsed.tag)) flagged.add(parsed.sentenceId);
    });
    console.log(`flagged sentences: ${flagged.size}`);
  }

  // 2. CC0 で公開されている英文・和文
  const cc0Ids = new Set<number>();
  if (args.cc0) {
    const langs = new Set(['eng', 'jpn']);
    await forEachLine(args.cc0, (line) => {
      const id = parseCc0Line(line, langs);
      if (id) cc0Ids.add(id);
    });
    console.log(`CC0 eng/jpn sentences: ${cc0Ids.size}`);
  }

  // 3. 和文 (数十万件なので全部メモリに載せてよい)
  const japanese = new Map<number, TatoebaSentence>();
  await forEachLine(args.jpn, (line) => {
    const sentence = parseSentenceLine(line);
    if (sentence && sentence.lang === 'jpn' && !flagged.has(sentence.id)) {
      japanese.set(sentence.id, sentence);
    }
  });
  console.log(`japanese sentences: ${japanese.size}`);

  // 4. 英文ID → 和訳候補。links.csv は全言語ぶんで巨大なので、和文側に当たる行だけ残す。
  //    英文かどうかはまだ分からないが、次の手順で英文ファイルに無いIDは捨てられる。
  const translationsBySource = new Map<number, number[]>();
  await forEachLine(args.links, (line) => {
    const link = parseLinkLine(line);
    if (!link) return;
    const [from, to] = link;
    if (!japanese.has(to)) return;
    const existing = translationsBySource.get(from);
    if (existing) existing.push(to);
    else translationsBySource.set(from, [to]);
  });
  console.log(`sentences linked to japanese: ${translationsBySource.size}`);

  // 5. 英文を読み、使える文と和訳を組にする
  const rows: ClozeSentenceInsert[] = [];
  let seenEnglish = 0;
  let rejectedShape = 0;
  let rejectedTranslation = 0;
  await forEachLine(args.eng, (line) => {
    if (args.limit && rows.length >= args.limit) return;
    const sentence = parseSentenceLine(line);
    if (!sentence || sentence.lang !== 'eng') return;
    const jaIds = translationsBySource.get(sentence.id);
    if (!jaIds || flagged.has(sentence.id)) return;
    seenEnglish += 1;

    if (!isUsableEnglishSentence(sentence.text)) {
      rejectedShape += 1;
      return;
    }
    const ja = pickJapaneseTranslation(
      jaIds.map((id) => japanese.get(id)).filter((s): s is TatoebaSentence => !!s),
    );
    if (!ja) {
      rejectedTranslation += 1;
      return;
    }

    const tokens = tokenizeForIndex(sentence.text);
    rows.push({
      id: sentence.id,
      sentence_en: sentence.text,
      sentence_ja: ja.text,
      ja_sentence_id: ja.id,
      author_en: sentence.username,
      author_ja: ja.username,
      license_en: licenseFor(sentence.id, cc0Ids),
      license_ja: licenseFor(ja.id, cc0Ids),
      tokens,
      word_count: tokens.length,
      source: 'tatoeba',
    });
  });
  console.log(
    `english with japanese: ${seenEnglish}, usable: ${rows.length}, ` +
      `rejected (shape): ${rejectedShape}, rejected (translation): ${rejectedTranslation}`,
  );

  if (args.out) {
    const out = createWriteStream(args.out, 'utf8');
    for (const row of rows) out.write(`${JSON.stringify(row)}\n`);
    await new Promise<void>((resolve, reject) => out.end((error?: Error | null) => (error ? reject(error) : resolve())));
    console.log(`wrote ${rows.length} rows to ${args.out}`);
  }

  if (args.dryRun) {
    console.log('dry run: nothing written to the database');
    return;
  }

  const supabase = createClient(readEnv('NEXT_PUBLIC_SUPABASE_URL'), readEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let written = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + UPSERT_BATCH_SIZE);
    const { error } = await supabase.from('cloze_sentences').upsert(batch, { onConflict: 'id' });
    if (error) throw new Error(`Failed to upsert cloze_sentences: ${error.message}`);
    written += batch.length;
    console.log(`upserted ${written}/${rows.length}`);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
