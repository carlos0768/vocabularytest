import { getVocabularyTypeLabel, getVocabularyTypeShortLabel } from '@/lib/vocabulary-type';
import type { VocabularyType } from '@/types';

export function DesktopVocabularyTypeBadge({
  vocabularyType,
}: {
  vocabularyType: VocabularyType | null | undefined;
}) {
  const label = getVocabularyTypeLabel(vocabularyType);

  return (
    <span
      className={'ds-ap ' + (vocabularyType || 'none')}
      aria-label={`語彙モード: ${label}`}
      title={`語彙モード: ${label}`}
    >
      {getVocabularyTypeShortLabel(vocabularyType)}
    </span>
  );
}
