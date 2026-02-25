import { createClient } from '@supabase/supabase-js';
import { generateWordInsightsForWords } from '../src/lib/ai/generate-word-insights';

type WordRow = {
  id: string;
  english: string;
  japanese: string;
};

function readEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function parseNumberArg(name: string, defaultValue: number): number {
  const arg = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (!arg) return defaultValue;
  const parsed = Number(arg.split('=')[1]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : defaultValue;
}

async function run() {
  const supabaseUrl = readEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  const maxRows = parseNumberArg('limit', 200);
  const batchSize = parseNumberArg('batch-size', 40);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: rows, error } = await supabase
    .from('words')
    .select('id, english, japanese')
    .is('insights_generated_at', null)
    .order('created_at', { ascending: true })
    .limit(maxRows);

  if (error) {
    throw new Error(`Failed to load words: ${error.message}`);
  }

  const targets = (rows ?? []) as WordRow[];
  if (targets.length === 0) {
    console.log('No words to backfill.');
    return;
  }

  let totalSuccess = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (let i = 0; i < targets.length; i += batchSize) {
    const batch = targets.slice(i, i + batchSize);
    const generated = await generateWordInsightsForWords(batch);

    if (generated.successes.length > 0) {
      await Promise.all(generated.successes.map(async (item) => {
        const { error: updateError } = await supabase
          .from('words')
          .update({
            part_of_speech_tags: item.insight.partOfSpeechTags,
            related_words: item.insight.relatedWords,
            usage_patterns: item.insight.usagePatterns,
            insights_generated_at: item.insight.insightsGeneratedAt,
            insights_version: item.insight.insightsVersion,
          })
          .eq('id', item.wordId);

        if (updateError) {
          throw new Error(`Failed to update ${item.wordId}: ${updateError.message}`);
        }
      }));
    }

    totalSuccess += generated.successes.length;
    totalSkipped += generated.skipped.length;
    totalFailed += generated.failed.length;

    console.log(
      `Batch ${Math.floor(i / batchSize) + 1}: success=${generated.successes.length}, skipped=${generated.skipped.length}, failed=${generated.failed.length}`,
    );
  }

  console.log(`Backfill complete. success=${totalSuccess}, skipped=${totalSkipped}, failed=${totalFailed}`);
}

run().catch((error) => {
  console.error('Backfill failed:', error);
  process.exit(1);
});
