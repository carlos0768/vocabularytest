export default function Loading() {
  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <div className="mx-auto max-w-[560px] px-[14px] py-3">
        <div className="flex items-center gap-2.5 pb-4">
          <div className="h-9 w-9 animate-pulse rounded-full bg-[var(--color-surface-secondary)]" />
          <div className="h-5 w-40 animate-pulse rounded bg-[var(--color-surface-secondary)]" />
        </div>
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-[12px] bg-[var(--color-surface-secondary)]" />
          ))}
        </div>
      </div>
    </div>
  );
}
