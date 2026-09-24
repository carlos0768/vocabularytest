/**
 * ルート直下のローディング境界。
 *
 * これが無いと、動的ルート（ホーム `/`、共有 `/shared`、`/project/[id]` など）へ
 * 遷移したとき RSC の応答が届くまで前の画面が固まったままになり、Link の
 * プリフェッチも効かない。Suspense 境界があれば遷移の瞬間にこのスケルトンへ
 * 切り替わり、プリフェッチもこの境界までは事前に済む。
 * 独自の loading.tsx を持つルート（クイズ・フラッシュカードなど）はそちらが優先。
 */
export default function Loading() {
  return (
    <div
      className="min-h-screen bg-[var(--color-background)] px-4 pb-24 pt-6"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="mx-auto w-full max-w-3xl space-y-5">
        <div className="flex items-center justify-between">
          <div className="h-7 w-32 rounded-lg bg-[var(--color-surface-secondary)] animate-pulse" />
          <div className="h-9 w-9 rounded-full bg-[var(--color-surface-secondary)] animate-pulse" />
        </div>
        <div className="h-24 rounded-2xl bg-[var(--color-surface-secondary)] animate-pulse" />
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-[var(--color-surface-secondary)] animate-pulse" />
          ))}
        </div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-2xl bg-[var(--color-surface-secondary)] animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
