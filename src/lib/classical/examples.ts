// 古典語の例文を共通辞書（classical_entries）にキャッシュする。
//
// 訳のヒント流用と同じ思想。いちど生成した古文の例文は全ユーザー共通の
// 見出し語に紐づけて貯め、次からは誰のスキャンでも AI を呼ばずに流用する。
// 古文の例文は英語と違って「ユーザーの興味ジャンルに寄せる」余地が無いので、
// 個人向けに作り分ける理由もない。
//
// 書き込みは service role のみ（INV-12）。列（example_sentence /
// example_sentence_ja）は 20260912120000 で足したので、未適用のDBでは
// SELECT / UPDATE が 42703 で落ちる。その場合は黙って諦める — 例文が
// 付かないだけで、スキャンは通す。

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  generateClassicalExamples,
  type ClassicalExampleSeedWord,
} from '@/lib/ai/generate-classical-examples';

export interface CachedClassicalExample {
  exampleSentence: string;
  exampleSentenceJa: string;
}

export interface ClassicalExampleTarget {
  headword: string;
  meaning: string;
  reading?: string | null;
  /** 共通辞書のエントリID。解決できていない語は null（キャッシュ対象外）。 */
  classicalEntryId?: string | null;
}

interface EntryExampleRow {
  id: string;
  example_sentence: string | null;
  example_sentence_ja: string | null;
}

function isMissingExampleColumnError(error: { code?: unknown } | null): boolean {
  if (!error) return false;
  const { code } = error;
  return code === '42703' || code === 'PGRST204' || code === 'PGRST200';
}

/**
 * 共通辞書に貯まっている例文を entryId 単位で引く。
 *
 * 見つからない entryId は単に欠落する。呼び出し側は「欠落＝生成が要る」
 * として扱えばよい。
 */
export async function fetchCachedClassicalExamples(
  supabaseAdmin: SupabaseClient,
  entryIds: readonly string[],
): Promise<Map<string, CachedClassicalExample>> {
  const byEntry = new Map<string, CachedClassicalExample>();
  const ids = Array.from(new Set(entryIds.filter((id) => id.length > 0)));
  if (ids.length === 0) return byEntry;

  const { data, error } = await supabaseAdmin
    .from('classical_entries')
    .select('id, example_sentence, example_sentence_ja')
    .in('id', ids);

  if (error) {
    if (!isMissingExampleColumnError(error)) {
      console.warn('[classical] Example cache lookup failed:', error.message);
    }
    return byEntry;
  }

  for (const row of (data ?? []) as EntryExampleRow[]) {
    const sentence = row.example_sentence?.trim();
    const sentenceJa = row.example_sentence_ja?.trim();
    if (!sentence || !sentenceJa) continue;
    byEntry.set(row.id, { exampleSentence: sentence, exampleSentenceJa: sentenceJa });
  }

  return byEntry;
}

/**
 * 生成した例文を共通辞書に書き戻す。
 *
 * 既に例文があるエントリは上書きしない（`.is('example_sentence', null)`）。
 * 英語側の saveExamplesToLexicon と同じ規約で、後から来たスキャンが
 * 貯まった例文を差し替えてしまわないようにするため。
 */
export async function saveClassicalExamplesToDictionary(
  supabaseAdmin: SupabaseClient,
  items: ReadonlyArray<{ entryId: string } & CachedClassicalExample>,
): Promise<{ updated: number; errors: number }> {
  if (items.length === 0) return { updated: 0, errors: 0 };

  let updated = 0;
  let errors = 0;

  for (const item of items) {
    try {
      const { error } = await supabaseAdmin
        .from('classical_entries')
        .update({
          example_sentence: item.exampleSentence,
          example_sentence_ja: item.exampleSentenceJa,
        })
        .eq('id', item.entryId)
        .is('example_sentence', null);

      if (error) {
        if (!isMissingExampleColumnError(error)) {
          console.warn('[classical] Example cache write failed:', error.message);
        }
        errors += 1;
      } else {
        updated += 1;
      }
    } catch (thrown) {
      console.warn(
        '[classical] Example cache write threw:',
        thrown instanceof Error ? thrown.message : thrown,
      );
      errors += 1;
    }
  }

  return { updated, errors };
}

/**
 * 古典語に古文の例文を用意する。キャッシュ優先で、足りないぶんだけ生成する。
 *
 * 返り値は**入力と同じ長さ・同じ順**の配列。用意できなかった語は null。
 * 呼び出し側が index で当てられるようにするためで、フィルタして詰めてはいけない。
 *
 * `/api/extract`（同期）と `scan-jobs/process`（非同期）の両方から呼ぶ。
 * 失敗はすべて握りつぶす — 例文が付かないだけで、スキャンは成功させる。
 */
export async function applyClassicalExamples(
  targets: readonly ClassicalExampleTarget[],
  apiKeys: { gemini?: string; openai?: string },
  deps: {
    supabaseAdmin?: SupabaseClient;
    generateExamples?: typeof generateClassicalExamples;
  } = {},
): Promise<Array<CachedClassicalExample | null>> {
  const results: Array<CachedClassicalExample | null> = targets.map(() => null);
  if (targets.length === 0) return results;

  const supabaseAdmin = deps.supabaseAdmin ?? getSupabaseAdmin();
  const generate = deps.generateExamples ?? generateClassicalExamples;

  // 1. 共通辞書のキャッシュを引く（辞書に解決できた語だけ）
  const entryIds = targets
    .map((target) => target.classicalEntryId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  let cached = new Map<string, CachedClassicalExample>();
  try {
    cached = await fetchCachedClassicalExamples(supabaseAdmin, entryIds);
  } catch (thrown) {
    console.warn(
      '[classical] Example cache lookup threw, generating from scratch:',
      thrown instanceof Error ? thrown.message : thrown,
    );
  }

  // 2. キャッシュに無いぶんだけ生成対象にする
  const seeds: ClassicalExampleSeedWord[] = [];
  const seedIndexToTargetIndex = new Map<string, number>();

  targets.forEach((target, index) => {
    const entryId = target.classicalEntryId;
    const hit = entryId ? cached.get(entryId) : undefined;
    if (hit) {
      results[index] = hit;
      return;
    }

    const headword = target.headword.trim();
    const meaning = target.meaning.trim();
    if (!headword || !meaning) return;

    const seedId = String(seeds.length);
    seedIndexToTargetIndex.set(seedId, index);
    seeds.push({
      id: seedId,
      headword,
      meaning,
      ...(target.reading ? { reading: target.reading } : {}),
    });
  });

  if (seeds.length === 0) return results;

  let generated: Awaited<ReturnType<typeof generateClassicalExamples>>;
  try {
    generated = await generate(seeds, apiKeys);
  } catch (thrown) {
    console.warn(
      '[classical] Example generation threw, continuing without examples:',
      thrown instanceof Error ? thrown.message : thrown,
    );
    return results;
  }

  // 3. 結果を当て、共通辞書へ書き戻す
  const cacheWrites: Array<{ entryId: string } & CachedClassicalExample> = [];

  for (const example of generated.examples) {
    const targetIndex = seedIndexToTargetIndex.get(example.wordId);
    if (targetIndex === undefined) continue;

    const value: CachedClassicalExample = {
      exampleSentence: example.exampleSentence,
      exampleSentenceJa: example.exampleSentenceJa,
    };
    results[targetIndex] = value;

    const entryId = targets[targetIndex]?.classicalEntryId;
    if (entryId) cacheWrites.push({ entryId, ...value });
  }

  if (cacheWrites.length > 0) {
    // ベストエフォート。書けなくても手元の例文はそのまま使う。
    await saveClassicalExamplesToDictionary(supabaseAdmin, cacheWrites);
  }

  return results;
}
