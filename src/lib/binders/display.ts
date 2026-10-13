/**
 * バインダーの見た目まわりの小物。バインダー詳細と設定ページで共有する。
 */

export { THUMBS, thumbColor } from '@/lib/ui/thumb-color';

/** `projects.binder` の値を突き合わせ用に正規化する (未設定は空文字)。 */
export function normalizeBinder(value: string | null | undefined): string {
  return value?.trim() ?? '';
}
