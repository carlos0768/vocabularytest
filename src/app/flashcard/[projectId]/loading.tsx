export default function Loading() {
  return (
    <div className="min-h-screen bg-[var(--color-background)] flex flex-col">
      {/* Header skeleton */}
      <header className="px-4 py-3 flex items-center gap-3 border-b border-[var(--color-border)]">
        <div className="w-8 h-8 rounded-md bg-[var(--color-surface-secondary)] animate-pulse" />
        <div className="h-5 w-28 rounded bg-[var(--color-surface-secondary)] animate-pulse" />
      </header>

      {/* Card skeleton */}
      <div className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-sm aspect-[3/4] rounded-2xl bg-[var(--color-surface-secondary)] animate-pulse" />
      </div>

      {/* Controls skeleton */}
      <div className="px-6 pb-8 flex justify-center gap-4">
        <div className="w-12 h-12 rounded-full bg-[var(--color-surface-secondary)] animate-pulse" />
        <div className="w-12 h-12 rounded-full bg-[var(--color-surface-secondary)] animate-pulse" />
        <div className="w-12 h-12 rounded-full bg-[var(--color-surface-secondary)] animate-pulse" />
      </div>
    </div>
  );
}
