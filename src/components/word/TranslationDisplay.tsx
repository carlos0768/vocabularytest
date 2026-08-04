import type { Word } from '@/types';
import { getDisplayTranslations } from '@/lib/words/display';

type TranslationDisplayProps = {
  word: Pick<Word, 'japanese' | 'translations'>;
  className?: string;
  itemClassName?: string;
  compact?: boolean;
};

export function TranslationDisplay({
  word,
  className = '',
  itemClassName = '',
  compact = false,
}: TranslationDisplayProps) {
  const translations = getDisplayTranslations(word);
  if (translations.length === 0) return null;

  if (translations.length === 1) {
    return (
      <span className={className} title={translations[0].text}>
        {translations[0].text}
      </span>
    );
  }

  // Compact rows (word lists, result tables) are single-line and rely on the
  // parent's truncate. An inline-flex box would defeat that -- it wraps into a
  // second line and pushes the row into the trailing action buttons -- so keep
  // the compact variant as plain inline text that ellipsizes.
  if (compact) {
    return (
      <span className={className}>
        {translations.map((translation, index) => (
          <span
            key={`${translation.label}-${translation.text}`}
            className={itemClassName}
            style={{ opacity: translation.opacity, marginLeft: index > 0 ? '0.5em' : undefined }}
            title={`${translation.label} ${translation.text}`}
          >
            <span className="text-[0.85em]">{translation.label}</span>
            {' '}
            {translation.text}
          </span>
        ))}
      </span>
    );
  }

  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5 ${className}`.trim()}>
      {translations.map((translation) => (
        <span
          key={`${translation.label}-${translation.text}`}
          className={`inline-flex items-baseline gap-0.5 ${itemClassName}`.trim()}
          style={{ opacity: translation.opacity }}
          title={`${translation.label} ${translation.text}`}
        >
          <span className="text-[0.8em]">{translation.label}</span>
          <span>{translation.text}</span>
        </span>
      ))}
    </span>
  );
}
