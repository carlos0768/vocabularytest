export default function Loading() {
  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <div className="mx-auto max-w-lg space-y-3 px-4 py-6">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 animate-pulse rounded-full bg-[var(--color-surface-secondary)]" />
          <div className="h-6 w-40 animate-pulse rounded bg-[var(--color-surface-secondary)]" />
        </div>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-[var(--color-surface-secondary)]" />
        ))}
      </div>
    </div>
  );
}
