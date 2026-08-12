'use client';

/**
 * 通常クイズ / 音読チャレンジ の切り替えタブ。
 *
 * 両方の開始画面に同じ見た目で出すための共有コンポーネント。
 * 選択状態はサーバーにもDBにも保存せず、遷移先のURLだけで表現する
 * (既定は常に通常クイズ)。
 */

export type QuizModeTabKey = 'normal' | 'voice';

const TABS: ReadonlyArray<{ key: QuizModeTabKey; label: string }> = [
  { key: 'normal', label: '通常クイズ' },
  { key: 'voice', label: '音読チャレンジ' },
];

export function QuizModeTabs({
  active,
  onSelect,
}: {
  active: QuizModeTabKey;
  /** 選択済みタブを押したときは呼ばれない。 */
  onSelect: (mode: QuizModeTabKey) => void;
}) {
  return (
    <div className="flex justify-center">
      <div
        className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-1"
        role="tablist"
        aria-label="クイズの種類"
      >
        {TABS.map((tab) => {
          const selected = active === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => { if (!selected) onSelect(tab.key); }}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                selected ? 'bg-[var(--solid-ink)] text-white' : 'text-[var(--color-muted)]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
