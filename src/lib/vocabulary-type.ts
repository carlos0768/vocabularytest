import type { VocabularyType } from '@/types';

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
