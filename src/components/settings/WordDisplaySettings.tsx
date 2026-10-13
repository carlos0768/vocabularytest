'use client';

import { Icon } from '@/components/ui';
import { useHideRelatedWords } from '@/hooks/use-hide-related-words';
import { cn } from '@/lib/utils';

type WordDisplaySettingsProps = {
  variant?: 'mobile' | 'desktop';
};

export function WordDisplaySettings({ variant = 'mobile' }: WordDisplaySettingsProps) {
  const { hideRelatedWords, setHideRelatedWords } = useHideRelatedWords();

  const toggle = (
    <button
      type="button"
      aria-label="派生語を非表示にする"
      aria-pressed={hideRelatedWords}
      onClick={() => setHideRelatedWords(!hideRelatedWords)}
      className={cn('ds-toggle', hideRelatedWords && 'on')}
    />
  );
  const detail = hideRelatedWords
    ? '単語詳細に派生語（関連語）を表示しません'
    : '単語詳細に派生語（関連語）を表示します';

  if (variant === 'desktop') {
    return (
      <div className="ds-set-group">
        <div className="gh">単語の表示</div>
        <div className="ds-set-row">
          <div className="ic">
            <Icon
              name="visibility_off"
              style={hideRelatedWords ? { color: 'var(--color-accent)' } : undefined}
            />
          </div>
          <div className="lab">
            <div className="t">派生語を非表示にする</div>
            <div className="d">{detail}</div>
          </div>
          {toggle}
        </div>
      </div>
    );
  }

  return (
    <section>
      <div className="px-1 pb-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">単語の表示</div>
      <div className="overflow-hidden rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)]">
        <div className="flex items-center gap-2.5 px-3 py-[11px]">
          <span className="inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] bg-[color-mix(in_srgb,_var(--solid-ink)_5%,_transparent)]">
            <Icon
              name="visibility_off"
              size={16}
              className={hideRelatedWords ? 'text-[var(--color-accent)]' : 'text-[var(--solid-ink)]'}
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-[var(--solid-ink)]">派生語を非表示にする</p>
            <p className="mt-px truncate text-[11px] leading-4 text-[var(--color-muted)]">{detail}</p>
          </div>
          {toggle}
        </div>
      </div>
    </section>
  );
}
