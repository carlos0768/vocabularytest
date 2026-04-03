export default function Loading() {
  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      {/* Header skeleton */}
      <header className="sticky top-0 z-40 bg-[var(--color-background)]/95 border-b border-[var(--color-border)]">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-[var(--color-surface-secondary)] animate-pulse" />
          <div className="h-5 w-24 rounded bg-[var(--color-surface-secondary)] animate-pulse" />
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Mode selector skeleton */}
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-[var(--color-surface-secondary)] animate-pulse" />
          ))}
        </div>

        {/* Upload area skeleton */}
        <div className="h-48 rounded-2xl border-2 border-dashed border-[var(--color-border)] bg-[var(--color-surface-secondary)] animate-pulse" />
      </div>
    </div>
  );
}
