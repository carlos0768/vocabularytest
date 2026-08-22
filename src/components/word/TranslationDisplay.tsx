import type { Word } from '@/types';
import { getDisplayTranslations } from '@/lib/words/display';

type TranslationDisplayProps = {
  word: Pick<Word, 'japanese' | 'translations'>;
  className?: string;
  itemClassName?: string;
  compact?: boolean;
  /**
   * 複数語義を横並びではなく1語義1行で縦に積む。
   * 幅に収まらない語義はその行だけ `...` で省略する (折り返して行が増えない)。
   */
  stacked?: boolean;
};

export function TranslationDisplay({
  word,
  className = '',
  itemClassName = '',
  compact = false,
  stacked = false,
}: TranslationDisplayProps) {
  const translations = getDisplayTranslations(word);
  if (translations.length === 0) return null;

  if (translations.length === 1) {
    return (
      <span className={`${stacked ? 'block truncate' : ''} ${className}`.trim()} title={translations[0].text}>
        {translations[0].text}
      </span>
    );
  }

  const listClassName = stacked
    ? 'flex min-w-0 flex-col items-stretch gap-y-0.5'
    : 'inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5';

  return (
    <span className={`${listClassName} ${className}`.trim()}>
      {translations.map((translation) => (
        <span
          key={`${translation.label}-${translation.text}`}
          className={`${stacked ? 'flex min-w-0' : 'inline-flex'} items-baseline gap-0.5 ${itemClassName}`.trim()}
          style={{ opacity: translation.opacity }}
          title={`${translation.label} ${translation.text}`}
        >
          <span className={`${compact ? 'text-[0.85em]' : 'text-[0.8em]'}${stacked ? ' shrink-0' : ''}`}>
            {translation.label}
          </span>
          <span className={stacked ? 'truncate' : undefined}>{translation.text}</span>
        </span>
      ))}
    </span>
  );
}
