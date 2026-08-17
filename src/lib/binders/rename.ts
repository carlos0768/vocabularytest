/**
 * バインダー名の変更。
 *
 * バインダーは専用テーブルを持たず `projects.binder` の文字列でしかないので、
 * 「名前を変える」は「そのバインダーに属する単語帳全部の binder 列を書き換える」
 * ことになる。リポジトリ層に一括更新は無いので1冊ずつ更新する。
 *
 * アイコン (`binder_icons`) も名前がキーなので、一緒に移送しないと孤児になる。
 */

import { loadBinderIcons, saveBinderIcon } from '@/lib/binders/icons';
import type { Project } from '@/types';

/** DBの制約に合わせた上限 (`projects.binder` / `binder_icons.name` ともに 1〜40文字) */
export const BINDER_NAME_MAX_LENGTH = 40;

export type BinderNameResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

/** 入力欄の値をバインダー名として正規化する。 */
export function normalizeBinderName(input: string): BinderNameResult {
  const value = input.trim();
  if (value.length === 0) {
    return { ok: false, error: 'バインダー名を入力してください' };
  }
  if (value.length > BINDER_NAME_MAX_LENGTH) {
    return { ok: false, error: `バインダー名は${BINDER_NAME_MAX_LENGTH}文字までです` };
  }
  return { ok: true, value };
}

export interface BinderRenameRepository {
  updateProject(projectId: string, updates: { binder: string }): Promise<unknown>;
}

export interface RenameBinderResult {
  /** 書き換えに成功した単語帳の数 */
  renamed: number;
  /** 書き換えの対象だった単語帳の数 */
  total: number;
}

/**
 * `oldName` のバインダーに入っている単語帳を全部 `newName` に移す。
 *
 * 1冊でも失敗したらアイコンは動かさない。中途半端に移すと、残った単語帳が
 * 旧名のまま絵柄だけ失うことになるため。
 */
export async function renameBinder({
  repository,
  projects,
  oldName,
  newName,
}: {
  repository: BinderRenameRepository;
  /** ユーザの全単語帳。この中から `oldName` のものだけを対象にする。 */
  projects: Project[];
  oldName: string;
  newName: string;
}): Promise<RenameBinderResult> {
  const targets = projects.filter((project) => (project.binder?.trim() ?? '') === oldName);

  let renamed = 0;
  for (const project of targets) {
    try {
      await repository.updateProject(project.id, { binder: newName });
      renamed += 1;
    } catch {
      // 残りも試す。成功数は呼び出し側に返して報告させる。
    }
  }

  if (renamed === targets.length) {
    await moveBinderIcon(oldName, newName);
  }

  return { renamed, total: targets.length };
}

/**
 * アイコン行を旧名から新名へ移す。
 * 移送先に既にアイコンがあるとき (既存バインダーへの統合) は上書きしない。
 * アイコンは飾りなので、ここで失敗しても名前の変更自体は成功として扱う。
 */
async function moveBinderIcon(oldName: string, newName: string): Promise<void> {
  try {
    const icons = await loadBinderIcons();
    const icon = icons[oldName];
    if (!icon) return;
    if (!icons[newName]) await saveBinderIcon(newName, icon);
    await saveBinderIcon(oldName, null);
  } catch {
    // 絵柄が旧名に残るだけなので握りつぶす
  }
}
