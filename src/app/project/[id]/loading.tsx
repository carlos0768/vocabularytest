export default function Loading() {
  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      {/* Header skeleton */}
      <header className="sticky top-0 z-40 bg-[var(--color-background)]/95 border-b border-[var(--color-border)]">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-[var(--color-surface-secondary)] animate-pulse" />
          <div className="h-5 w-32 rounded bg-[var(--color-surface-secondary)] animate-pulse" />
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Study mode cards skeleton */}
        <div className="grid grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-[var(--color-surface-secondary)] animate-pulse" />
          ))}
        </div>

        {/* Word list skeleton */}
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--color-surface-secondary)] animate-pulse shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-24 rounded bg-[var(--color-surface-secondary)] animate-pulse" />
              <div className="h-3 w-16 rounded bg-[var(--color-surface-secondary)] animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
