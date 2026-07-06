import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

type EikenLevel = '5' | '4' | '3' | 'pre2' | '2' | 'pre1' | '1';

type SourceWord = {
  english: string;
  japanese: string;
  source: 'eigo-duke' | 'motitown';
  partOfSpeech?: string;
  exampleSentence?: string;
  exampleSentenceJa?: string;
};

type MotitownWord = {
  english?: string;
  translation?: string;
  part_of_speech?: string;
  example?: string;
  example_translation?: string;
  importance?: number | string;
};

const EIKEN_LEVELS: Array<{
  level: EikenLevel;
  label: string;
  slugPart: string;
  eigoDukeUrl: string;
  motitownUrl: string;
}> = [
  {
    level: '5',
    label: '5級',
    slugPart: '5',
    eigoDukeUrl: 'https://www.eigo-duke.com/tango/eiken5.html',
    motitownUrl: 'https://motitown.com/vocabulary/eiken/grade-5/',
  },
  {
    level: '4',
    label: '4級',
    slugPart: '4',
    eigoDukeUrl: 'https://www.eigo-duke.com/tango/eiken4.html',
    motitownUrl: 'https://motitown.com/vocabulary/eiken/grade-4/',
  },
  {
    level: '3',
    label: '3級',
    slugPart: '3',
    eigoDukeUrl: 'https://www.eigo-duke.com/tango/eiken3.html',
    motitownUrl: 'https://motitown.com/vocabulary/eiken/grade-3/',
  },
  {
    level: 'pre2',
    label: '準2級',
    slugPart: 'pre2',
    eigoDukeUrl: 'https://www.eigo-duke.com/tango/eikenjun2.html',
    motitownUrl: 'https://motitown.com/vocabulary/eiken/grade-p2/',
  },
  {
    level: '2',
    label: '2級',
    slugPart: '2',
    eigoDukeUrl: 'https://www.eigo-duke.com/tango/eiken2.html',
    motitownUrl: 'https://motitown.com/vocabulary/eiken/grade-2/',
  },
  {
    level: 'pre1',
    label: '準1級',
    slugPart: 'pre1',
    eigoDukeUrl: 'https://www.eigo-duke.com/tango/eikenjun1.html',
    motitownUrl: 'https://motitown.com/vocabulary/eiken/grade-p1/',
  },
  {
    level: '1',
    label: '1級',
    slugPart: '1',
    eigoDukeUrl: 'https://www.eigo-duke.com/tango/eiken1.html',
    motitownUrl: 'https://motitown.com/vocabulary/eiken/grade-1/',
  },
];

const BOOKS_PER_LEVEL = 5;
const WORDS_PER_BOOK = 50;
const TARGET_WORDS_PER_LEVEL = BOOKS_PER_LEVEL * WORDS_PER_BOOK;
const LEGACY_PRE1_SLUGS = [
  'eiken-pre1-default-1',
  'eiken-pre1-default-2',
  'eiken-pre1-default-3',
  'eiken-pre1-default-4',
];

function loadDotEnvLocal(): void {
  if (!existsSync('.env.local')) return;

  const lines = readFileSync('.env.local', 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;

    const equalsIndex = trimmed.indexOf('=');
    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function normalizeEnvValue(value: string | undefined): string {
  return (value ?? '').replace(/\\n/g, '').replace(/[\r\n]+/g, '').trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTerm(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function cleanExample(value: string | undefined): string | undefined {
  const cleaned = decodeHtml(value ?? '').replace(/\|/g, '').replace(/\s+/g, ' ').trim();
  return cleaned || undefined;
}

function normalizeJapanese(value: string | undefined): string {
  return decodeHtml(value ?? '')
    .replace(/^｜/, '')
    .replace(/[，]/g, '、')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }
  return await response.text();
}

async function fetchEigoDukeWords(url: string): Promise<SourceWord[]> {
  const html = await fetchText(url);
  const words: SourceWord[] = [];

  for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => decodeHtml(match[1]));
    if (cells.length < 3 || !/^\d+$/.test(cells[0])) continue;

    const english = cells[1].trim();
    const japanese = normalizeJapanese(cells[2]);
    if (!english || !japanese) continue;
    words.push({ english, japanese, source: 'eigo-duke' });
  }

  return words;
}

async function fetchMotitownWords(url: string): Promise<SourceWord[]> {
  const html = await fetchText(url);
  const bookId = html.match(/window\.BOOK_ID\s*=\s*"(\d+)"/)?.[1];
  if (!bookId) {
    throw new Error(`Could not find Motitown BOOK_ID in ${url}`);
  }

  const apiUrl = `https://motitown.com/vocabulary/api/book_word.php?id=${encodeURIComponent(bookId)}`;
  const response = await fetch(apiUrl, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${apiUrl}: HTTP ${response.status}`);
  }

  const rows = (await response.json()) as MotitownWord[];
  return rows
    .slice()
    .sort((a, b) => Number(a.importance ?? 999999) - Number(b.importance ?? 999999))
    .map((word) => ({
      english: decodeHtml(word.english ?? ''),
      japanese: normalizeJapanese(word.translation),
      source: 'motitown' as const,
      ...(word.part_of_speech ? { partOfSpeech: word.part_of_speech } : {}),
      ...(cleanExample(word.example) ? { exampleSentence: cleanExample(word.example) } : {}),
      ...(cleanExample(word.example_translation) ? { exampleSentenceJa: cleanExample(word.example_translation) } : {}),
    }))
    .filter((word) => word.english && word.japanese);
}

async function buildLevelWords(config: (typeof EIKEN_LEVELS)[number]): Promise<SourceWord[]> {
  const [eigoDukeWords, motitownWords] = await Promise.all([
    fetchEigoDukeWords(config.eigoDukeUrl),
    fetchMotitownWords(config.motitownUrl),
  ]);

  const motitownByTerm = new Map(motitownWords.map((word) => [normalizeTerm(word.english), word]));
  const merged: SourceWord[] = [];
  const seen = new Set<string>();

  for (const word of eigoDukeWords) {
    const key = normalizeTerm(word.english);
    if (seen.has(key)) continue;
    seen.add(key);

    const enrichment = motitownByTerm.get(key);
    merged.push({
      ...word,
      ...(enrichment?.partOfSpeech ? { partOfSpeech: enrichment.partOfSpeech } : {}),
      ...(enrichment?.exampleSentence ? { exampleSentence: enrichment.exampleSentence } : {}),
      ...(enrichment?.exampleSentenceJa ? { exampleSentenceJa: enrichment.exampleSentenceJa } : {}),
    });
  }

  for (const word of motitownWords) {
    if (merged.length >= TARGET_WORDS_PER_LEVEL) break;
    const key = normalizeTerm(word.english);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(word);
  }

  if (merged.length < TARGET_WORDS_PER_LEVEL) {
    throw new Error(`${config.label} only has ${merged.length} words after merge`);
  }

  return merged.slice(0, TARGET_WORDS_PER_LEVEL);
}

function buildDistractors(words: readonly SourceWord[], index: number): string[] {
  const distractors: string[] = [];
  const seen = new Set([words[index].japanese]);
  let offset = 7;

  while (distractors.length < 3 && offset < words.length + 20) {
    const candidate = words[(index + offset) % words.length]?.japanese;
    if (candidate && !seen.has(candidate)) {
      seen.add(candidate);
      distractors.push(candidate);
    }
    offset += 11;
  }

  return distractors;
}

function chunkWords(words: readonly SourceWord[]): SourceWord[][] {
  const chunks: SourceWord[][] = [];
  for (let index = 0; index < words.length; index += WORDS_PER_BOOK) {
    chunks.push(words.slice(index, index + WORDS_PER_BOOK));
  }
  return chunks;
}

function getTargetLevelConfigs(): typeof EIKEN_LEVELS {
  const requestedValues = process.argv
    .slice(2)
    .flatMap((arg) => {
      if (arg.startsWith('--levels=')) return arg.slice('--levels='.length).split(',');
      if (arg.startsWith('--')) return [];
      return arg.split(',');
    })
    .map((value) => value.trim())
    .filter(Boolean);

  if (requestedValues.length === 0 || requestedValues.includes('all')) {
    return EIKEN_LEVELS;
  }

  const configsByLevel = new Map(EIKEN_LEVELS.map((config) => [config.level, config]));
  const targets = requestedValues.map((value) => {
    const config = configsByLevel.get(value as EikenLevel);
    if (!config) {
      throw new Error(`Unknown EIKEN level "${value}". Use one of: ${EIKEN_LEVELS.map((item) => item.level).join(', ')}`);
    }
    return config;
  });

  return [...new Map(targets.map((config) => [config.level, config])).values()];
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const targetConfigs = getTargetLevelConfigs();

  const url = normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !serviceRoleKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  const supabase = createClient(url.startsWith('http') ? url : `https://${url}`, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const desiredSlugs = targetConfigs.flatMap((config) =>
    Array.from({ length: BOOKS_PER_LEVEL }, (_, index) => `merken-eiken-${config.slugPart}-${index + 1}`),
  );

  const { data: existingWordbooks, error: existingError } = await supabase
    .from('official_wordbooks')
    .select('id,slug')
    .in('slug', desiredSlugs);

  if (existingError) throw new Error(`Failed to fetch existing official wordbooks: ${existingError.message}`);

  const existingBySlug = new Map(
    ((existingWordbooks ?? []) as Array<{ id: string; slug: string | null }>)
      .filter((wordbook): wordbook is { id: string; slug: string } => Boolean(wordbook.slug))
      .map((wordbook) => [wordbook.slug, wordbook.id]),
  );

  if (existingBySlug.size > 0) {
    const { error: deleteWordsError } = await supabase
      .from('official_wordbook_words')
      .delete()
      .in('official_wordbook_id', Array.from(existingBySlug.values()));
    if (deleteWordsError) throw new Error(`Failed to clear existing official words: ${deleteWordsError.message}`);
  }

  const { error: legacyError } = await supabase
    .from('projects')
    .update({
      official_slug: null,
      official_title: null,
      official_description: null,
      official_eiken_level: null,
      official_is_default: false,
      official_is_active: false,
      official_sort_order: 0,
      updated_at: new Date().toISOString(),
    })
    .in('official_slug', LEGACY_PRE1_SLUGS);

  if (legacyError) {
    throw new Error(`Failed to clear legacy project official metadata: ${legacyError.message}`);
  }

  const now = new Date();
  const summary: Array<{ level: EikenLevel; books: number; words: number }> = [];

  for (let levelIndex = 0; levelIndex < targetConfigs.length; levelIndex += 1) {
    const config = targetConfigs[levelIndex];
    const levelWords = await buildLevelWords(config);
    const books = chunkWords(levelWords);

    for (let bookIndex = 0; bookIndex < books.length; bookIndex += 1) {
      const slug = `merken-eiken-${config.slugPart}-${bookIndex + 1}`;
      const wordbookId = existingBySlug.get(slug) ?? randomUUID();
      const title = `Merken公式 英検${config.label}単語帳${bookIndex + 1}`;
      const createdAt = new Date(now.getTime() + ((levelIndex * BOOKS_PER_LEVEL + bookIndex) * 60_000)).toISOString();

      const wordbookPayload = {
        id: wordbookId,
        slug,
        title,
        description: `英検${config.label}向けのMerken公式単語帳です。`,
        source_labels: ['official', `eiken:${config.level}`],
        eiken_level: config.level,
        is_default: true,
        is_active: true,
        sort_order: bookIndex + 1,
        created_at: createdAt,
        updated_at: createdAt,
      };

      if (existingBySlug.has(slug)) {
        const { error } = await supabase.from('official_wordbooks').update(wordbookPayload).eq('id', wordbookId);
        if (error) throw new Error(`Failed to update official wordbook ${slug}: ${error.message}`);
      } else {
        const { error } = await supabase.from('official_wordbooks').insert(wordbookPayload);
        if (error) throw new Error(`Failed to insert official wordbook ${slug}: ${error.message}`);
      }

      const bookWords = books[bookIndex];
      const wordRows = bookWords.map((word, wordIndex) => {
        const wordId = randomUUID();
        return {
          id: wordId,
          official_wordbook_id: wordbookId,
          english: word.english,
          japanese: word.japanese,
          translations: [{
            translationJa: word.japanese,
            normalizedTranslationJa: word.japanese,
            source: 'scan',
            meaningRank: 1,
            position: 0,
            isPrimary: true,
          }],
          distractors: buildDistractors(bookWords, wordIndex),
          vocabulary_type: 'passive',
          japanese_source: 'scan',
          custom_sections: [],
          sort_order: wordIndex + 1,
          ...(word.partOfSpeech ? { part_of_speech_tags: [word.partOfSpeech] } : {}),
          ...(word.exampleSentence ? { example_sentence: word.exampleSentence } : {}),
          ...(word.exampleSentenceJa ? { example_sentence_ja: word.exampleSentenceJa } : {}),
          created_at: new Date(Date.parse(createdAt) + wordIndex * 1000).toISOString(),
          updated_at: createdAt,
        };
      });

      const { error: wordsError } = await supabase.from('official_wordbook_words').insert(wordRows);
      if (wordsError) throw new Error(`Failed to insert official words for ${slug}: ${wordsError.message}`);
    }

    summary.push({ level: config.level, books: books.length, words: levelWords.length });
    console.log(`${config.label}: ${books.length} books, ${levelWords.length} words`);
  }

  const { data: verification, error: verifyError } = await supabase
    .from('official_wordbooks')
    .select('id,eiken_level,slug')
    .in('slug', desiredSlugs)
    .eq('is_active', true)
    .eq('is_default', true);

  if (verifyError) throw new Error(`Failed to verify official wordbooks: ${verifyError.message}`);

  const verifiedWordbooks = (verification ?? []) as Array<{
    id: string;
    eiken_level: EikenLevel | null;
  }>;
  const counts = new Map<EikenLevel, { books: number; words: number }>();
  for (const row of verifiedWordbooks) {
    if (!row.eiken_level) continue;
    const current = counts.get(row.eiken_level) ?? { books: 0, words: 0 };
    current.books += 1;
    counts.set(row.eiken_level, current);

    const { count, error: wordCountError } = await supabase
      .from('official_wordbook_words')
      .select('id', { count: 'exact', head: true })
      .eq('official_wordbook_id', row.id);
    if (wordCountError) {
      throw new Error(`Failed to verify official word count for ${row.id}: ${wordCountError.message}`);
    }
    current.words += count ?? 0;
  }

  for (const config of targetConfigs) {
    const actual = counts.get(config.level);
    if (!actual || actual.books !== BOOKS_PER_LEVEL || actual.words !== TARGET_WORDS_PER_LEVEL) {
      throw new Error(
        `Verification failed for ${config.label}: ${actual?.books ?? 0} books, ${actual?.words ?? 0} words`,
      );
    }
  }

  console.log('Verification OK');
  console.table(summary);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
