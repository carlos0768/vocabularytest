export default function Loading() {
  return (
    <div className="min-h-screen bg-[var(--color-background)] pb-24 lg:pb-6">
      <header className="px-5 pt-6 pb-4">
        <div className="max-w-lg mx-auto">
          <div className="h-8 w-16 rounded bg-[var(--color-surface-secondary)] animate-pulse" />
        </div>
      </header>

      <div className="max-w-lg mx-auto px-5 space-y-5">
        {/* Stat cards skeleton */}
        <div className="grid grid-cols-2 gap-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="card p-5 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--color-surface-secondary)] animate-pulse" />
              <div className="h-8 w-16 rounded bg-[var(--color-surface-secondary)] animate-pulse" />
              <div className="h-4 w-20 rounded bg-[var(--color-surface-secondary)] animate-pulse" />
            </div>
          ))}
        </div>

        {/* Chart skeleton */}
        <div className="card p-5">
          <div className="h-4 w-24 rounded bg-[var(--color-surface-secondary)] animate-pulse mb-4" />
          <div className="h-40 rounded-lg bg-[var(--color-surface-secondary)] animate-pulse" />
        </div>

        {/* Mastery bar skeleton */}
        <div className="card p-5 space-y-3">
          <div className="h-4 w-20 rounded bg-[var(--color-surface-secondary)] animate-pulse" />
          <div className="h-6 rounded-full bg-[var(--color-surface-secondary)] animate-pulse" />
        </div>
      </div>
    </div>
  );
}
