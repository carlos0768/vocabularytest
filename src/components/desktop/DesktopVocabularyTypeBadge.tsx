import { getNextVocabularyType, getVocabularyTypeLabel, getVocabularyTypeShortLabel } from '@/lib/vocabulary-type';
import type { VocabularyType } from '@/types';

export function DesktopVocabularyTypeBadge({
  vocabularyType,
  onClick,
}: {
  vocabularyType: VocabularyType | null | undefined;
  onClick?: () => void;
}) {
  const label = getVocabularyTypeLabel(vocabularyType);
  const nextLabel = getVocabularyTypeLabel(getNextVocabularyType(vocabularyType));
  const className = 'ds-ap ' + (vocabularyType || 'none');

  if (onClick) {
    return (
      <button
        type="button"
        className={`${className} ds-ap-btn`}
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
        aria-label={`語彙モード: ${label}。押すと ${nextLabel} に変更`}
        title={`語彙モード: ${label} → ${nextLabel}`}
      >
        {getVocabularyTypeShortLabel(vocabularyType)}
      </button>
    );
  }

  return (
    <span
      className={className}
      aria-label={`語彙モード: ${label}`}
      title={`語彙モード: ${label}`}
    >
      {getVocabularyTypeShortLabel(vocabularyType)}
    </span>
  );
}
