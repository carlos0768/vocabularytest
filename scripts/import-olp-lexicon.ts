import { createClient } from '@supabase/supabase-js';
import {
  normalizeCefrLevel,
  normalizeHeadword,
  normalizeLexiconDatasetSources,
  normalizeLexiconPos,
  pickHarderCefrLevel,
  type LexiconCefrLevel,
  type LexiconPos,
} from '../shared/lexicon';

type CsvRow = Record<string, string>;

type ImportSeed = {
  headword: string;
  normalized_headword: string;
  pos: LexiconPos;
  cefr_level: LexiconCefrLevel | null;
  dataset_sources: string[];
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

const DATASETS = [
  {
    source: 'olp:cefrj-vocabulary-profile-1.5',
    url: 'https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/master/cefrj-vocabulary-profile-1.5.csv',
  },
  {
    source: 'olp:octanove-vocabulary-profile-c1c2-1.0',
    url: 'https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/master/octanove-vocabulary-profile-c1c2-1.0.csv',
  },
] as const;

const UPSERT_BATCH_SIZE = 250;

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

async function fetchSeeds(): Promise<Map<string, ImportSeed>> {
  const merged = new Map<string, ImportSeed>();

  for (const dataset of DATASETS) {
    const response = await fetch(dataset.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${dataset.url}: ${response.status}`);
    }

    const rows = parseCsv(await response.text());
    for (const row of rows) {
      const headword = row.headword?.trim() ?? '';
      if (!headword) continue;

      const normalized_headword = normalizeHeadword(headword);
      if (!normalized_headword) continue;

      const pos = normalizeLexiconPos(row.pos);
      const cefrLevel = normalizeCefrLevel(row.CEFR);
      const key = `${normalized_headword}::${pos}`;
      const existing = merged.get(key);

      if (existing) {
        existing.cefr_level = pickHarderCefrLevel(existing.cefr_level, cefrLevel);
        existing.dataset_sources = normalizeLexiconDatasetSources([
          ...existing.dataset_sources,
          dataset.source,
        ]);
        continue;
      }

      merged.set(key, {
        headword,
        normalized_headword,
        pos,
        cefr_level: cefrLevel,
        dataset_sources: [dataset.source],
      });
    }
  }

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
      return {
        headword: existing?.headword || seed.headword,
        normalized_headword: seed.normalized_headword,
        pos: seed.pos,
        cefr_level: pickHarderCefrLevel(existing?.cefr_level, seed.cefr_level),
        dataset_sources: normalizeLexiconDatasetSources([
          ...(existing?.dataset_sources ?? []),
          ...seed.dataset_sources,
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
    console.log(`Processed ${processed}/${allSeeds.length} lexicon rows`);
  }

  console.log(`OLP import complete: ${allSeeds.length} rows merged`);
}

run().catch((error) => {
  console.error('OLP import failed:', error);
  process.exit(1);
});
