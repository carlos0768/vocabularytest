// 単語帳の統合をこの端末から実行する (単語帳ページと /projects の「…」メニューが使う)。
// 純粋な部分は merge-projects.ts。ここは同期キュー・Supabase・IndexedDB をつなぐだけ。
import type { Project } from '@/types';
import { getDb, hybridRepository } from '@/lib/db';
import { createBrowserClient } from '@/lib/supabase';
import { invalidateHomeCache } from '@/lib/home-cache';
import {
  applyProjectMergeToLocalCache,
  mergeProjectIntoRemote,
  resolveMergeSectionName,
} from '@/lib/project/merge-projects';

/**
 * source を target に統合し、移した語数を返す。サーバーで失敗したら投げる
 * (そのときは何も変わっていない)。オンラインかどうかは呼び出し側で確かめる。
 */
export async function mergeProjectWithLocalCache(
  source: Pick<Project, 'id' | 'title'>,
  target: Pick<Project, 'id' | 'sectionNames'>,
): Promise<number> {
  // 統合元で未送信の追加・編集を先にサーバーへ送る (送る前に統合元が消えると行き場を失う)
  try {
    await hybridRepository.processSyncQueue();
  } catch (syncError) {
    console.warn('Failed to flush sync queue before merging:', syncError);
  }
  const sectionName = resolveMergeSectionName(target.sectionNames ?? [], source.title);
  const params = { sourceProjectId: source.id, targetProjectId: target.id, sectionName };
  const moved = await mergeProjectIntoRemote(createBrowserClient(), params);
  try {
    await applyProjectMergeToLocalCache(getDb(), params);
  } catch (cacheError) {
    // サーバーは統合済み。キャッシュは次の同期で追いつく
    console.warn('Failed to apply merge to local cache:', cacheError);
  }
  invalidateHomeCache();
  return moved;
}
