import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildOfficialWordbookWordRows,
  chunkWordRows,
  findDuplicateEnglishTerms,
  type OfficialWordbookWordInput,
} from '@/lib/official-wordbooks/editor';

// 公式単語帳の単語書き込みまわりの共通処理。POST(新規作成)と
// PATCH(単語の総入れ替え)で同じ挙動にするために切り出している。

export class OfficialWordbookValidationError extends Error {}

/**
 * 単語をまとめて書き込む。DBのユニークインデックス
 * (official_wordbook_id, lower(btrim(english))) に触れると
 * バルクinsertが丸ごと失敗するので、先に重複を検出して
 * どの単語が重複しているかを管理者に返す。
 */
export async function insertOfficialWordbookWords(
  supabase: SupabaseClient,
  officialWordbookId: string,
  words: OfficialWordbookWordInput[],
): Promise<void> {
  if (words.length === 0) return;

  const duplicates = findDuplicateEnglishTerms(words);
  if (duplicates.length > 0) {
    throw new OfficialWordbookValidationError(
      `同じ英単語が複数行あります: ${duplicates.slice(0, 10).join(', ')}`,
    );
  }

  const rows = buildOfficialWordbookWordRows(officialWordbookId, words);
  for (const chunk of chunkWordRows(rows)) {
    const { error } = await supabase.from('official_wordbook_words').insert(chunk);
    if (error) throw new Error(error.message);
  }
}

/**
 * 単語を総入れ替えする。PostgREST にトランザクションが無いため
 * 「全削除 → 再挿入」で行う。挿入が失敗した場合は元に戻せないので、
 * 呼び出し側にエラーを伝えて管理者に再送してもらう(公式単語帳は
 * ユーザーデータではなく管理者が保持しているソースなので再送で復旧できる)。
 */
export async function replaceOfficialWordbookWords(
  supabase: SupabaseClient,
  officialWordbookId: string,
  words: OfficialWordbookWordInput[],
): Promise<void> {
  const duplicates = findDuplicateEnglishTerms(words);
  if (duplicates.length > 0) {
    throw new OfficialWordbookValidationError(
      `同じ英単語が複数行あります: ${duplicates.slice(0, 10).join(', ')}`,
    );
  }

  const { error: deleteError } = await supabase
    .from('official_wordbook_words')
    .delete()
    .eq('official_wordbook_id', officialWordbookId);
  if (deleteError) throw new Error(deleteError.message);

  await insertOfficialWordbookWords(supabase, officialWordbookId, words);
}
