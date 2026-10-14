'use client';

// 単語帳ページ (`/project/[id]`) の空の単語帳の案内。
import { Icon } from '@/components/ui/Icon';

export function EmptyWordbookState({
  isPro,
  onScan,
  onManualAdd,
  onVoiceAdd,
}: {
  isPro: boolean;
  onScan: () => void;
  onManualAdd: () => void;
  onVoiceAdd?: () => void;
}) {
  // Free users get manual entry first (scanning is Pro-only);
  // Pro users get scan as the recommended first action.
  const actions: {
    key: string;
    icon: string;
    label: string;
    hint: string;
    primary?: boolean;
    pro?: boolean;
    onClick: () => void;
  }[] = isPro
    ? [
        { key: 'scan', icon: 'photo_camera', label: 'スキャンで追加', hint: '写真から自動で単語を抽出', primary: true, onClick: onScan },
        { key: 'manual', icon: 'edit', label: '手で入力', hint: '続けて何語でも入力できます', onClick: onManualAdd },
      ]
    : [
        { key: 'manual', icon: 'edit', label: '手で入力', hint: '続けて何語でも入力できます', primary: true, onClick: onManualAdd },
        { key: 'scan', icon: 'photo_camera', label: 'スキャンで追加', hint: '写真から自動抽出（Pro限定）', pro: true, onClick: onScan },
      ];
  if (onVoiceAdd) {
    // 手入力のすぐ後ろに置く (どちらも無料で使える追加方法)。
    const manualIndex = actions.findIndex((action) => action.key === 'manual');
    actions.splice(manualIndex + 1, 0, {
      key: 'voice', icon: 'mic', label: '音声で追加', hint: '読み上げた単語をまとめて追加', onClick: onVoiceAdd,
    });
  }

  return (
    <div
      className="rounded-[14px] border-2 border-dashed border-[var(--solid-ink)] bg-[var(--color-surface)] px-5 py-7 text-center"
      style={{ background: 'color-mix(in srgb, var(--solid-ink) 2%, transparent)' }}
    >
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-accent-light)]">
        <Icon name="menu_book" size={20} className="text-[var(--color-accent-ink)]" />
      </div>
      <div className="mt-3 font-display text-[16px] font-extrabold text-[var(--solid-ink)]">
        まだ単語がありません
      </div>
      <p className="mt-1.5 text-[12px] leading-[1.6] text-[var(--color-muted)]">
        単語を追加すると、クイズやカードで学習を始められます。
      </p>
      <div className="mt-4 flex flex-col gap-2.5 text-left">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={action.onClick}
            className="flex items-center gap-3 rounded-[12px] border-2 px-3.5 py-3 transition-all duration-100 active:translate-x-px active:translate-y-px"
            style={{
              borderColor: 'var(--solid-ink)',
              background: action.primary ? 'var(--color-accent)' : 'var(--color-surface)',
              boxShadow: '2px 2px 0 var(--solid-ink)',
            }}
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px]"
              style={{
                background: action.primary ? 'rgba(255,255,255,0.18)' : 'var(--color-surface-secondary)',
                color: action.primary ? 'var(--color-on-accent)' : 'var(--solid-ink)',
              }}
            >
              <Icon name={action.icon} size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span
                className="flex items-center gap-1.5 text-[13.5px] font-bold"
                style={{ color: action.primary ? 'var(--color-on-accent)' : 'var(--solid-ink)' }}
              >
                {action.label}
                {action.pro && (
                  <span className="rounded-[3px] border border-[var(--solid-ink)] bg-[var(--color-surface)] px-[5px] py-[1px] font-mono text-[8px] font-bold tracking-[0.04em] text-[var(--color-accent)]">
                    PRO
                  </span>
                )}
              </span>
              <span
                className="mt-0.5 block text-[10.5px] font-medium"
                style={{ color: action.primary ? 'rgba(255,255,255,0.8)' : 'var(--color-muted)' }}
              >
                {action.hint}
              </span>
            </span>
            <Icon
              name="chevron_right"
              size={16}
              style={{ color: action.primary ? 'var(--color-on-accent)' : 'var(--color-muted)' }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
