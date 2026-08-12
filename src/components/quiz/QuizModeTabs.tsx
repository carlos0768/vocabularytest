'use client';

/**
 * 通常クイズ / 音読チャレンジ の切り替えタブ。
 *
 * 両方の開始画面に同じ見た目で出すための共有コンポーネント。
 * 表示はいまいる画面 (URL) をそのまま映すだけ。選んだ結果を端末に覚えるのは
 * 遷移側の責務で、`lib/quiz/quiz-mode-preference` が担当する。
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
                // ダークでは --solid-ink が明色に反転するので、前景は白固定にしない。
                selected ? 'bg-[var(--solid-ink)] text-[var(--color-surface)]' : 'text-[var(--color-muted)]'
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
