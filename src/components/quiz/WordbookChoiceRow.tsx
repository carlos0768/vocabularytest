'use client';

// 単語帳を選ぶ行。クイズの「出題する単語帳を選ぶ」と目標の設定で同じものを使う。
import { Icon } from '@/components/ui/Icon';

export function WordbookChoiceRow({
  label,
  selected,
  onClick,
  emphasized = false,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  /** 「すべての単語帳」のような先頭の行。選択中は影を付けて一段強く見せる */
  emphasized?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-[12px] border-2 px-3.5 text-left ${emphasized ? 'py-3' : 'py-2.5'}`}
      style={{
        borderColor: selected ? 'var(--solid-ink)' : 'var(--color-border)',
        boxShadow: emphasized && selected ? '2px 2px 0 var(--solid-ink)' : 'none',
        background: 'var(--color-surface)',
      }}
    >
      <span
        className="flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full"
        style={{
          border: `1.5px solid ${selected ? 'var(--color-accent)' : 'var(--color-border)'}`,
          background: selected ? 'var(--color-accent)' : 'var(--color-surface)',
        }}
      >
        {selected && <Icon name="check" size={13} className="text-white" />}
      </span>
      <span
        className={`min-w-0 flex-1 truncate font-display font-bold text-[var(--solid-ink)] ${emphasized ? 'text-[14px]' : 'text-[13.5px]'}`}
      >
        {label}
      </span>
    </button>
  );
}
