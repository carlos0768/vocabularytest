import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildLexiconCleanupPlan,
  type LexiconCleanupRow,
  type LexiconCleanupWordRef,
} from '../src/lib/lexicon/cleanup';

const PAGE_SIZE = 1000;

function readEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function fetchAllLexiconEntries(supabase: SupabaseClient) {
  const rows: LexiconCleanupRow[] = [];
  for (let page = 0; ; page += 1) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('lexicon_entries')
      .select('id, headword, normalized_headword, pos, dataset_sources, translation_ja, translation_source')
      .order('id', { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Failed to fetch lexicon entries: ${error.message}`);
    }

    const batch = (data ?? []) as LexiconCleanupRow[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) {
      break;
    }
  }
  return rows;
}

async function fetchWordRefsForLexiconEntries(
  supabase: SupabaseClient,
  lexiconEntryIds: string[],
) {
  const rows: LexiconCleanupWordRef[] = [];
  for (const chunk of chunkArray(lexiconEntryIds, 200)) {
    for (let page = 0; ; page += 1) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from('words')
        .select('id, lexicon_entry_id')
        .in('lexicon_entry_id', chunk)
        .order('id', { ascending: true })
        .range(from, to);

      if (error) {
        throw new Error(`Failed to fetch words for cleanup: ${error.message}`);
      }

      const batch = (data ?? []) as LexiconCleanupWordRef[];
      rows.push(...batch);
      if (batch.length < PAGE_SIZE) {
        break;
      }
    }
  }
  return rows;
}

async function run() {
  loadEnvConfig(process.cwd());
  const apply = process.argv.includes('--apply');
  const supabase = createClient(
    readEnv('NEXT_PUBLIC_SUPABASE_URL'),
    readEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  const lexiconEntries = await fetchAllLexiconEntries(supabase);
  const wordRefs = await fetchWordRefsForLexiconEntries(
    supabase,
    lexiconEntries.filter((row) => row.dataset_sources?.includes('runtime')).map((row) => row.id),
  );
  const plan = buildLexiconCleanupPlan(lexiconEntries, wordRefs);

  console.log('[cleanup-lexicon-runtime] Summary', {
    mode: apply ? 'apply' : 'dry-run',
    ...plan.summary,
  });
  console.log('[cleanup-lexicon-runtime] Ambiguous runtime rows', plan.ambiguousRuntimeEntryIds.slice(0, 20));

  if (!apply) {
    return;
  }

  for (const update of plan.translationUpdates) {
    const { error } = await supabase
      .from('lexicon_entries')
      .update({
        translation_ja: update.translationJa,
        translation_source: update.translationSource,
      })
      .eq('id', update.lexiconEntryId);

    if (error) {
      throw new Error(`Failed to sanitize lexicon entry ${update.lexiconEntryId}: ${error.message}`);
    }
  }

  for (const relink of plan.wordRelinks) {
    const { error } = await supabase
      .from('words')
      .update({ lexicon_entry_id: relink.targetLexiconEntryId })
      .in('id', relink.wordIds);

    if (error) {
      throw new Error(`Failed to relink words for ${relink.runtimeLexiconEntryId}: ${error.message}`);
    }
  }

  for (const migration of plan.translationMigrations) {
    const { error } = await supabase
      .from('lexicon_entries')
      .update({
        translation_ja: migration.translationJa,
        translation_source: migration.translationSource,
      })
      .eq('id', migration.targetLexiconEntryId);

    if (error) {
      throw new Error(`Failed to migrate translation to ${migration.targetLexiconEntryId}: ${error.message}`);
    }
  }

  if (plan.orphanRuntimeEntryIds.length > 0) {
    const { error } = await supabase
      .from('lexicon_entries')
      .delete()
      .in('id', plan.orphanRuntimeEntryIds);

    if (error) {
      throw new Error(`Failed to delete orphan runtime rows: ${error.message}`);
    }
  }

  console.log('[cleanup-lexicon-runtime] Apply complete');
}

run().catch((error) => {
  console.error('[cleanup-lexicon-runtime] Failed:', error);
  process.exit(1);
});
