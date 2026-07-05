import { createClient } from '@supabase/supabase-js';
import {
  normalizeHeadword,
  normalizeLexiconDatasetSources,
  type LexiconCefrLevel,
  type LexiconPos,
} from '../shared/lexicon';

// Words-CEFR-Dataset (MIT): CEFR-J をベースに Google 1-gram 頻度・レンマ・品詞から
// CEFR レベルを外挿した約17万語のデータセット。
// https://github.com/Maximax67/Words-CEFR-Dataset
//
// インポート方針:
// - レベルは小数(外挿値)なので四捨五入して A1-C2 を取り込む。
//   C2 バケットは「稀語のデフォルト値」を多く含むが、英検フィルタが lexicon 未登録語を
//   除外する(ホワイトリスト方式)ため、本物の難語を lexicon に載せておく必要がある。
//   C2 はどの英検級のしきい値も通過するので、レベルの精度は問題にならない。
// - 固有名詞 (Penn: NNP/NNPS) はスキップする。
// - 既存行のうち OLP (CEFR-J / Octanove) 由来の cefr_level は人手キュレーション値なので
//   上書きしない。それ以外(cefr_level が NULL、または runtime/AI 経由で作られた行)は
//   本データセットの値で補完・上書きする。
// - 翻訳関連カラムには一切触れない。

type CsvRow = Record<string, string>;

type ImportSeed = {
  headword: string;
  normalized_headword: string;
  pos: LexiconPos;
  cefr_level: LexiconCefrLevel;
};

type ExistingLexiconRow = {
  id: string;
  headword: string;
  normalized_headword: string;
  pos: LexiconPos;
  cefr_level: LexiconCefrLevel | null;
  dataset_sources: string[] | null;
  translation_ja: string | null;
  translation_source: string | null;
};

const DATASET_SOURCE = 'words-cefr-dataset';
const BASE_URL = 'https://raw.githubusercontent.com/Maximax67/Words-CEFR-Dataset/main/csv';
const UPSERT_BATCH_SIZE = 250;

const CEFR_BY_BUCKET: Record<number, LexiconCefrLevel> = {
  1: 'A1',
  2: 'A2',
  3: 'B1',
  4: 'B2',
  5: 'C1',
  6: 'C2',
};

const CEFR_INDEX: Record<LexiconCefrLevel, number> = {
  A1: 0,
  A2: 1,
  B1: 2,
  B2: 3,
  C1: 4,
  C2: 5,
};

// Penn Treebank タグ -> lexicon pos。undefined は 'other'、null はスキップ(固有名詞)。
const PENN_TO_LEXICON_POS: Record<string, LexiconPos | null> = {
  NN: 'noun',
  NNS: 'noun',
  NNP: null,
  NNPS: null,
  VB: 'verb',
  VBD: 'verb',
  VBG: 'verb',
  VBN: 'verb',
  VBP: 'verb',
  VBZ: 'verb',
  JJ: 'adjective',
  JJR: 'adjective',
  JJS: 'adjective',
  RB: 'adverb',
  RBR: 'adverb',
  RBS: 'adverb',
  IN: 'preposition',
  CC: 'conjunction',
  PRP: 'pronoun',
  'PRP$': 'pronoun',
  WP: 'pronoun',
  'WP$': 'pronoun',
  DT: 'determiner',
  PDT: 'determiner',
  WDT: 'determiner',
  UH: 'interjection',
  MD: 'auxiliary',
};

function readEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentValue += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        i += 1;
      }
      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = '';
      continue;
    }

    currentValue += char;
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  const [headerRow, ...dataRows] = rows;
  const headers = (headerRow ?? []).map((value) => value.trim());
  return dataRows
    .filter((row) => row.some((value) => value.trim().length > 0))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
}

async function fetchCsv(fileName: string): Promise<CsvRow[]> {
  const url = `${BASE_URL}/${fileName}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return parseCsv(await response.text());
}

async function fetchSeeds(): Promise<Map<string, ImportSeed>> {
  const [wordRows, posTagRows, wordPosRows] = await Promise.all([
    fetchCsv('words.csv'),
    fetchCsv('pos_tags.csv'),
    fetchCsv('word_pos.csv'),
  ]);

  const wordById = new Map<string, string>();
  for (const row of wordRows) {
    const wordId = row.word_id?.trim();
    const word = row.word?.trim();
    if (wordId && word) {
      wordById.set(wordId, word);
    }
  }

  const pennTagById = new Map<string, string>();
  for (const row of posTagRows) {
    const tagId = row.tag_id?.trim();
    const tag = row.tag?.trim();
    if (tagId && tag) {
      pennTagById.set(tagId, tag);
    }
  }

  const merged = new Map<string, ImportSeed>();
  let skippedProperNouns = 0;

  for (const row of wordPosRows) {
    const word = wordById.get(row.word_id?.trim() ?? '');
    if (!word) continue;

    const pennTag = pennTagById.get(row.pos_tag_id?.trim() ?? '') ?? '';
    const mappedPos = PENN_TO_LEXICON_POS[pennTag];
    if (mappedPos === null) {
      skippedProperNouns += 1;
      continue;
    }
    const pos: LexiconPos = mappedPos ?? 'other';

    const level = Number.parseFloat(row.level ?? '');
    if (!Number.isFinite(level)) continue;
    const bucket = Math.min(6, Math.max(1, Math.round(level)));
    const cefrLevel = CEFR_BY_BUCKET[bucket];

    const normalized_headword = normalizeHeadword(word);
    if (!normalized_headword) continue;

    const key = `${normalized_headword}::${pos}`;
    const existing = merged.get(key);
    if (existing) {
      // 同じ (見出し語, 品詞) に複数の Penn タグ由来の行がある場合は最も易しいレベルを採用
      // (易しい語義が1つでもあれば学習者にとって既知の可能性が高い)
      if (CEFR_INDEX[cefrLevel] < CEFR_INDEX[existing.cefr_level]) {
        existing.cefr_level = cefrLevel;
      }
      continue;
    }

    merged.set(key, {
      headword: word,
      normalized_headword,
      pos,
      cefr_level: cefrLevel,
    });
  }

  console.log(
    `Prepared ${merged.size} seeds (skipped ${skippedProperNouns} proper-noun rows)`,
  );
  return merged;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function hasCuratedCefrLevel(existing: ExistingLexiconRow | undefined): boolean {
  if (!existing?.cefr_level) return false;
  return (existing.dataset_sources ?? []).some((source) => source.toLowerCase().startsWith('olp:'));
}

async function run() {
  const supabaseUrl = readEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const mergedSeeds = await fetchSeeds();
  const allSeeds = Array.from(mergedSeeds.values());
  let processed = 0;
  let preservedCurated = 0;

  for (const batch of chunkArray(allSeeds, UPSERT_BATCH_SIZE)) {
    const normalizedHeadwords = Array.from(new Set(batch.map((row) => row.normalized_headword)));
    const { data: existingRows, error: existingError } = await supabase
      .from('lexicon_entries')
      .select('id, headword, normalized_headword, pos, cefr_level, dataset_sources, translation_ja, translation_source')
      .in('normalized_headword', normalizedHeadwords);

    if (existingError) {
      throw new Error(`Failed to fetch existing lexicon rows: ${existingError.message}`);
    }

    const existingMap = new Map<string, ExistingLexiconRow>();
    for (const row of (existingRows ?? []) as ExistingLexiconRow[]) {
      existingMap.set(`${row.normalized_headword}::${row.pos}`, row);
    }

    const payload = batch.map((seed) => {
      const existing = existingMap.get(`${seed.normalized_headword}::${seed.pos}`);
      const keepExistingLevel = hasCuratedCefrLevel(existing);
      if (keepExistingLevel) {
        preservedCurated += 1;
      }

      return {
        headword: existing?.headword || seed.headword,
        normalized_headword: seed.normalized_headword,
        pos: seed.pos,
        // OLP 由来のキュレーション済みレベルは保持。NULL や runtime/AI 経由の行は本データセットで補完する。
        cefr_level: keepExistingLevel ? existing!.cefr_level : seed.cefr_level,
        dataset_sources: normalizeLexiconDatasetSources([
          ...(existing?.dataset_sources ?? []),
          DATASET_SOURCE,
        ]),
        translation_ja: existing?.translation_ja ?? undefined,
        translation_source: existing?.translation_source ?? undefined,
      };
    });

    const { error: upsertError } = await supabase
      .from('lexicon_entries')
      .upsert(payload, { onConflict: 'normalized_headword,pos' });

    if (upsertError) {
      throw new Error(`Failed to upsert lexicon rows: ${upsertError.message}`);
    }

    processed += batch.length;
    if (processed % 5000 < UPSERT_BATCH_SIZE || processed === allSeeds.length) {
      console.log(`Processed ${processed}/${allSeeds.length} lexicon rows`);
    }
  }

  console.log(
    `Words-CEFR-Dataset import complete: ${allSeeds.length} rows merged (${preservedCurated} curated levels preserved)`,
  );
}

run().catch((error) => {
  console.error('Words-CEFR-Dataset import failed:', error);
  process.exit(1);
});
