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

  const { data: ownerProject, error: ownerError } = await supabase
    .from('projects')
    .select('user_id')
    .not('official_slug', 'is', null)
    .limit(1)
    .maybeSingle<{ user_id: string }>();

  if (ownerError) throw new Error(`Failed to resolve official owner: ${ownerError.message}`);
  if (!ownerProject?.user_id) throw new Error('Could not resolve an owner user_id for official projects');
  const ownerUserId = ownerProject.user_id;

  const desiredSlugs = targetConfigs.flatMap((config) =>
    Array.from({ length: BOOKS_PER_LEVEL }, (_, index) => `merken-eiken-${config.slugPart}-${index + 1}`),
  );

  const { data: existingProjects, error: existingError } = await supabase
    .from('projects')
    .select('id,official_slug')
    .in('official_slug', desiredSlugs);

  if (existingError) throw new Error(`Failed to fetch existing official projects: ${existingError.message}`);

  const existingBySlug = new Map(
    ((existingProjects ?? []) as Array<{ id: string; official_slug: string | null }>)
      .filter((project): project is { id: string; official_slug: string } => Boolean(project.official_slug))
      .map((project) => [project.official_slug, project.id]),
  );

  if (existingBySlug.size > 0) {
    const { error: deleteWordsError } = await supabase
      .from('words')
      .delete()
      .in('project_id', Array.from(existingBySlug.values()));
    if (deleteWordsError) throw new Error(`Failed to clear existing words: ${deleteWordsError.message}`);
  }

  if (targetConfigs.some((config) => config.level === 'pre1')) {
    const { error: legacyError } = await supabase
      .from('projects')
      .update({
        official_is_default: false,
        official_is_active: false,
        updated_at: new Date().toISOString(),
      })
      .in('official_slug', LEGACY_PRE1_SLUGS);

    if (legacyError) throw new Error(`Failed to deactivate legacy pre1 books: ${legacyError.message}`);
  }

  const now = new Date();
  const summary: Array<{ level: EikenLevel; books: number; words: number }> = [];

  for (let levelIndex = 0; levelIndex < targetConfigs.length; levelIndex += 1) {
    const config = targetConfigs[levelIndex];
    const levelWords = await buildLevelWords(config);
    const books = chunkWords(levelWords);

    for (let bookIndex = 0; bookIndex < books.length; bookIndex += 1) {
      const slug = `merken-eiken-${config.slugPart}-${bookIndex + 1}`;
      const projectId = existingBySlug.get(slug) ?? randomUUID();
      const title = `Merken公式 英検${config.label}単語帳${bookIndex + 1}`;
      const createdAt = new Date(now.getTime() + ((levelIndex * BOOKS_PER_LEVEL + bookIndex) * 60_000)).toISOString();

      const projectPayload = {
        id: projectId,
        user_id: ownerUserId,
        title,
        description: `英検${config.label}向けのMerken公式単語帳です。`,
        source_labels: ['official', `eiken:${config.level}`],
        shared_tags: ['公式', `英検${config.label}`, 'Merken'],
        official_slug: slug,
        official_title: title,
        official_description: `英語漬け.comとモチタンの公開英検語彙リストを参照した、英検${config.label}向けのMerken公式単語帳です。`,
        official_eiken_level: config.level,
        official_is_default: true,
        official_is_active: true,
        official_sort_order: bookIndex + 1,
        created_at: createdAt,
        updated_at: createdAt,
      };

      if (existingBySlug.has(slug)) {
        const { error } = await supabase.from('projects').update(projectPayload).eq('id', projectId);
        if (error) throw new Error(`Failed to update project ${slug}: ${error.message}`);
      } else {
        const { error } = await supabase.from('projects').insert(projectPayload);
        if (error) throw new Error(`Failed to insert project ${slug}: ${error.message}`);
      }

      const bookWords = books[bookIndex];
      const wordRows = bookWords.map((word, wordIndex) => {
        const wordId = randomUUID();
        return {
          id: wordId,
          project_id: projectId,
          user_id: ownerUserId,
          english: word.english,
          japanese: word.japanese,
          distractors: buildDistractors(bookWords, wordIndex),
          status: 'new',
          source_modes: ['eiken'],
          custom_sections: [],
          ...(word.partOfSpeech ? { part_of_speech_tags: [word.partOfSpeech] } : {}),
          ...(word.exampleSentence ? { example_sentence: word.exampleSentence } : {}),
          ...(word.exampleSentenceJa ? { example_sentence_ja: word.exampleSentenceJa } : {}),
          created_at: new Date(Date.parse(createdAt) + wordIndex * 1000).toISOString(),
          updated_at: createdAt,
        };
      });

      const { error: wordsError } = await supabase.from('words').insert(wordRows);
      if (wordsError) throw new Error(`Failed to insert words for ${slug}: ${wordsError.message}`);

      const translationRows = wordRows.map((wordRow, wordIndex) => ({
        word_id: wordRow.id,
        translation_ja: bookWords[wordIndex].japanese,
        normalized_translation_ja: bookWords[wordIndex].japanese,
        source: 'scan',
        meaning_rank: 1,
        position: 0,
        is_primary: true,
        status: 'new',
      }));

      const { error: translationsError } = await supabase.from('word_translations').insert(translationRows);
      if (translationsError) {
        throw new Error(`Failed to insert translations for ${slug}: ${translationsError.message}`);
      }
    }

    summary.push({ level: config.level, books: books.length, words: levelWords.length });
    console.log(`${config.label}: ${books.length} books, ${levelWords.length} words`);
  }

  const { data: verification, error: verifyError } = await supabase
    .from('projects')
    .select('id,official_eiken_level,official_slug,words(id)')
    .in('official_slug', desiredSlugs)
    .eq('official_is_active', true)
    .eq('official_is_default', true);

  if (verifyError) throw new Error(`Failed to verify official projects: ${verifyError.message}`);

  const counts = new Map<EikenLevel, { books: number; words: number }>();
  for (const row of (verification ?? []) as Array<{
    official_eiken_level: EikenLevel | null;
    words?: Array<{ id: string }>;
  }>) {
    if (!row.official_eiken_level) continue;
    const current = counts.get(row.official_eiken_level) ?? { books: 0, words: 0 };
    current.books += 1;
    current.words += row.words?.length ?? 0;
    counts.set(row.official_eiken_level, current);
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
