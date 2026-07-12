/**
 * 接辞カタログ（AFFIX_CATALOG）を public.affixes テーブルへ upsert する。
 *
 * 使い方:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/import-affixes.ts
 *
 * マイグレーション 20260712100000_add_morphology_support.sql 適用後に実行する。
 * TS カタログが正本で、このスクリプトは何度実行しても安全（id で upsert）。
 */

import { createClient } from '@supabase/supabase-js';
import { AFFIX_CATALOG } from '../src/lib/morphology/affix-catalog';

const UPSERT_BATCH_SIZE = 100;

function readEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
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

  const rows = AFFIX_CATALOG.map((sense) => ({
    id: sense.id,
    form: sense.form,
    kind: sense.kind,
    meaning_ja: sense.meaningJa,
    nuance_ja: sense.nuanceJa ?? null,
    connotation: sense.connotation ?? null,
    examples: sense.examples,
    level: sense.level ?? null,
  }));

  let upserted = 0;
  for (let index = 0; index < rows.length; index += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(index, index + UPSERT_BATCH_SIZE);
    const { error } = await supabase.from('affixes').upsert(batch, { onConflict: 'id' });
    if (error) {
      throw new Error(`Failed to upsert affixes batch at ${index}: ${error.message}`);
    }
    upserted += batch.length;
    console.log(`Upserted ${upserted}/${rows.length} affixes`);
  }

  console.log(`Done. ${upserted} affix senses imported.`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
