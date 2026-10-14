'use client';

import { Icon } from '@/components/ui';
import { useHideWordSection } from '@/hooks/use-hide-word-section';
import type { HideableWordSection } from '@/lib/preferences/word-display';
import { cn } from '@/lib/utils';

type WordDisplaySettingsProps = {
  variant?: 'mobile' | 'desktop';
};

const ROWS: ReadonlyArray<{
  section: HideableWordSection;
  title: string;
  /** 隠している / 表示している ときの補足 */
  detailHidden: string;
  detailShown: string;
}> = [
  {
    section: 'relatedWords',
    title: '派生語を非表示にする',
    detailHidden: '単語詳細に派生語（関連語）を表示しません',
    detailShown: '単語詳細に派生語（関連語）を表示します',
  },
  {
    section: 'etymology',
    title: '語源を非表示にする',
    detailHidden: '単語詳細・フラッシュカードに語源を表示しません',
    detailShown: '単語詳細・フラッシュカードに語源を表示します',
  },
];

function SettingRow({
  section,
  title,
  detailHidden,
  detailShown,
  variant,
  first,
}: (typeof ROWS)[number] & { variant: 'mobile' | 'desktop'; first: boolean }) {
  const { hidden, setHidden } = useHideWordSection(section);
  const detail = hidden ? detailHidden : detailShown;

  const toggle = (
    <button
      type="button"
      aria-label={title}
      aria-pressed={hidden}
      onClick={() => setHidden(!hidden)}
      className={cn('ds-toggle', hidden && 'on')}
    />
  );

  if (variant === 'desktop') {
    return (
      <div className="ds-set-row">
        <div className="ic">
          <Icon name="visibility_off" style={hidden ? { color: 'var(--color-accent)' } : undefined} />
        </div>
        <div className="lab">
          <div className="t">{title}</div>
          <div className="d">{detail}</div>
        </div>
        {toggle}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2.5 px-3 py-[11px]',
        !first && 'border-t border-[var(--color-border-light)]',
      )}
    >
      <span className="inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] bg-[color-mix(in_srgb,_var(--solid-ink)_5%,_transparent)]">
        <Icon
          name="visibility_off"
          size={16}
          className={hidden ? 'text-[var(--color-accent)]' : 'text-[var(--solid-ink)]'}
        />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-[var(--solid-ink)]">{title}</p>
        <p className="mt-px truncate text-[11px] leading-4 text-[var(--color-muted)]">{detail}</p>
      </div>
      {toggle}
    </div>
  );
}

export function WordDisplaySettings({ variant = 'mobile' }: WordDisplaySettingsProps) {
  const rows = ROWS.map((row, index) => (
    <SettingRow key={row.section} {...row} variant={variant} first={index === 0} />
  ));

  if (variant === 'desktop') {
    return (
      <div className="ds-set-group">
        <div className="gh">単語の表示</div>
        {rows}
      </div>
    );
  }

  return (
    <section>
      <div className="px-1 pb-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">単語の表示</div>
      <div className="overflow-hidden rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)]">
        {rows}
      </div>
    </section>
  );
}
