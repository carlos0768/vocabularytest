// 単語帳ごと別の単語帳に統合する (単語帳ページのメニュー「他の単語帳に統合」)。
//
// 統合元の語は統合先へ「移す」(行の project_id を付け替える) ので、学習の進み具合は
// そのまま残る。移した語は統合元の単語帳名のセクションに入り、統合元は消える。
// サーバー側は RPC `merge_project_into` が1トランザクションで行い
// (`20261015120000_merge_project_into.sql`)、終わったらこの端末の IndexedDB にも
// 同じ変更を当てる (他の端末は差分同期で追いつく)。
import type { Project } from '@/types';
import {
  insertSectionName,
  normalizeSectionName,
  normalizeSectionNames,
} from '@/lib/project/word-sections';
import { excludeReelSavedProjects } from '@/lib/reels/saved-words';
import { SECTION_NAME_MAX_LENGTH } from '../../../shared/word-sections';

/** 統合先の候補。自分自身と、種別 (英語 / 古典) の違う単語帳は出さない。 */
export function listMergeTargetProjects(projects: readonly Project[], source: Pick<Project, 'id' | 'kind'>): Project[] {
  const sourceKind = source.kind ?? 'english';
  return excludeReelSavedProjects([...projects]).filter(
    (project) => project.id !== source.id && (project.kind ?? 'english') === sourceKind,
  );
}

/**
 * 統合した語を入れるセクションの名前。統合元の単語帳名をそのまま使い、
 * 統合先に同じ名前のセクションがすでにあれば「名前 2」「名前 3」… にする
 * (既存のセクションに混ぜない)。
 */
export function resolveMergeSectionName(targetSectionNames: readonly string[], sourceTitle: string): string {
  const base = normalizeSectionName(sourceTitle) ?? '統合した単語';
  const used = new Set(normalizeSectionNames(targetSectionNames));
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const suffix = ` ${n}`;
    const head = Array.from(base).slice(0, SECTION_NAME_MAX_LENGTH - suffix.length).join('');
    const candidate = `${head}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

type MergeRpcClient = {
  rpc: (
    fn: 'merge_project_into',
    args: { p_source_project_id: string; p_target_project_id: string; p_section_name: string },
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

/** RPC で統合し、移した語数を返す。 */
export async function mergeProjectIntoRemote(
  client: MergeRpcClient,
  params: { sourceProjectId: string; targetProjectId: string; sectionName: string },
): Promise<number> {
  const { data, error } = await client.rpc('merge_project_into', {
    p_source_project_id: params.sourceProjectId,
    p_target_project_id: params.targetProjectId,
    p_section_name: params.sectionName,
  });
  if (error) throw new Error(`Failed to merge wordbook: ${error.message}`);
  return typeof data === 'number' ? data : 0;
}

type LocalWordsTable = {
  where(index: 'projectId'): {
    equals(value: string): { modify(changes: { projectId: string; sectionName: string }): Promise<number> };
  };
};
type LocalProjectsTable = {
  get(id: string): Promise<Project | undefined>;
  put(project: Project): Promise<unknown>;
  delete(id: string): Promise<void>;
};
export type MergeLocalDb = {
  projects: LocalProjectsTable;
  words: LocalWordsTable;
  // メソッド記法にしておく (Dexie の transaction の多重定義をそのまま受けられる)
  transaction(mode: 'rw', tables: readonly unknown[], scope: () => Promise<void>): PromiseLike<void>;
};

/** サーバーで済んだ統合を、この端末のキャッシュ (IndexedDB) にも当てる。 */
export async function applyProjectMergeToLocalCache(
  db: MergeLocalDb,
  params: { sourceProjectId: string; targetProjectId: string; sectionName: string },
): Promise<void> {
  await db.transaction('rw', [db.projects, db.words], async () => {
    await db.words.where('projectId').equals(params.sourceProjectId).modify({
      projectId: params.targetProjectId,
      sectionName: params.sectionName,
    });
    const target = await db.projects.get(params.targetProjectId);
    if (target) {
      await db.projects.put({
        ...target,
        sectionNames: insertSectionName(target.sectionNames ?? [], params.sectionName, 'end'),
      });
    }
    await db.projects.delete(params.sourceProjectId);
  });
}
