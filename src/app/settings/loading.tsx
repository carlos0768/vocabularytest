export default function Loading() {
  return (
    <div className="min-h-screen bg-[var(--color-background)] pb-24 lg:pb-6">
      <header className="px-5 pt-6 pb-4">
        <div className="max-w-lg mx-auto">
          <div className="h-8 w-16 rounded bg-[var(--color-surface-secondary)] animate-pulse" />
        </div>
      </header>

      <div className="max-w-lg mx-auto px-5 space-y-4">
        {/* Settings sections skeleton */}
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card p-4 space-y-3">
            <div className="h-4 w-20 rounded bg-[var(--color-surface-secondary)] animate-pulse" />
            <div className="space-y-2">
              <div className="h-12 rounded-lg bg-[var(--color-surface-secondary)] animate-pulse" />
              <div className="h-12 rounded-lg bg-[var(--color-surface-secondary)] animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
