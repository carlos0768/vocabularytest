export default function Loading() {
  return (
    <div className="min-h-screen bg-[var(--color-background)] flex flex-col">
      {/* Header skeleton */}
      <header className="px-4 py-3 flex items-center gap-3 border-b border-[var(--color-border)]">
        <div className="w-8 h-8 rounded-md bg-[var(--color-surface-secondary)] animate-pulse" />
        <div className="h-5 w-20 rounded bg-[var(--color-surface-secondary)] animate-pulse" />
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md space-y-6">
          {/* Question skeleton */}
          <div className="space-y-3 text-center">
            <div className="h-4 w-20 mx-auto rounded bg-[var(--color-surface-secondary)] animate-pulse" />
            <div className="h-8 w-48 mx-auto rounded bg-[var(--color-surface-secondary)] animate-pulse" />
          </div>

          {/* Options skeleton */}
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-[var(--color-surface-secondary)] animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
