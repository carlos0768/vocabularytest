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

  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5 ${className}`.trim()}>
      {translations.map((translation) => (
        <span
          key={`${translation.label}-${translation.text}`}
          className={`inline-flex items-baseline gap-0.5 ${itemClassName}`.trim()}
          style={{ opacity: translation.opacity }}
          title={`${translation.label} ${translation.text}`}
        >
          <span className={compact ? 'text-[0.85em]' : 'text-[0.8em]'}>{translation.label}</span>
          <span>{translation.text}</span>
        </span>
      ))}
    </span>
  );
}
