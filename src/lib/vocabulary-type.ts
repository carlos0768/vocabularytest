import type { VocabularyType } from '@/types';

/**
 * スキャンで取り込んだ語の既定の語彙モード。
 *
 * 拾ったばかりの語はまず「見て分かればいい語 (passive)」から始めて、
 * 自分で使えるようにしたい語だけ手で active に上げてもらう。
 * ローカル保存 (`local-repository`)・`/api/words/create`・バックグラウンド
 * スキャンの直挿し (`server-cloud-persistence`) の3経路で同じ値を使う。
 */
export const DEFAULT_SCANNED_VOCABULARY_TYPE: VocabularyType = 'passive';

export function getNextVocabularyType(
  current: VocabularyType | null | undefined,
): VocabularyType | null {
  if (current === 'active') return 'passive';
  if (current === 'passive') return null;
  return 'active';
}

export function getVocabularyTypeShortLabel(
  current: VocabularyType | null | undefined,
): 'A' | 'P' | '—' {
  if (current === 'active') return 'A';
  if (current === 'passive') return 'P';
  return '—';
}

export function getVocabularyTypeLabel(
  current: VocabularyType | null | undefined,
): 'Active' | 'Passive' | '未設定' {
  if (current === 'active') return 'Active';
  if (current === 'passive') return 'Passive';
  return '未設定';
}
