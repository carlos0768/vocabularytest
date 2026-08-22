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
  /**
   * `stacked` のとき縦に積む行数の上限。行が増えて一覧の行の高さが変わらないよう、
   * 呼び出し側で「元の高さに収まる行数」を渡す。あふれた語義は最終行の末尾の
   * `...` で示す (全語義は単語詳細で見られる)。
   */
  maxLines?: number;
};

export function TranslationDisplay({
  word,
  className = '',
  itemClassName = '',
  compact = false,
  stacked = false,
  maxLines,
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

  // 行数上限を超えた語義は畳んで、最終行の末尾に `...` を出す。
  const visible = stacked && maxLines && maxLines > 0 ? translations.slice(0, maxLines) : translations;
  const hasHiddenTranslations = visible.length < translations.length;

  // 行送りを詰めているのは、縦積みにしても一覧の行の高さが変わらないようにするため。
  const listClassName = stacked
    ? 'flex min-w-0 flex-col items-stretch gap-y-px leading-[1.35]'
    : 'inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5';

  return (
    <span
      className={`${listClassName} ${className}`.trim()}
      title={hasHiddenTranslations
        ? translations.map((translation) => `${translation.label}${translation.text}`).join(' ')
        : undefined}
    >
      {visible.map((translation, index) => (
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
          {hasHiddenTranslations && index === visible.length - 1 && (
            <span className="shrink-0" aria-label={`ほか${translations.length - visible.length}語義`}>...</span>
          )}
        </span>
      ))}
    </span>
  );
}
