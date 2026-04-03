export default function Loading() {
  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      {/* Header skeleton */}
      <header className="sticky top-0 bg-[var(--color-background)]/95 z-40 border-b border-[var(--color-border)]">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-[var(--color-surface-secondary)] animate-pulse" />
          <div className="h-5 w-24 rounded bg-[var(--color-surface-secondary)] animate-pulse" />
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Plan card skeleton */}
        <div className="card p-6 space-y-4">
          <div className="h-6 w-32 rounded bg-[var(--color-surface-secondary)] animate-pulse" />
          <div className="h-10 w-40 rounded bg-[var(--color-surface-secondary)] animate-pulse" />
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-4 w-full rounded bg-[var(--color-surface-secondary)] animate-pulse" />
            ))}
          </div>
          <div className="h-12 rounded-xl bg-[var(--color-surface-secondary)] animate-pulse" />
        </div>
      </div>
    </div>
  );
}
