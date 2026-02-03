// Loading UI for /scan/confirm page
// This prevents any flash during page transition
export default function Loading() {
  return (
    <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center">
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] p-6 w-full max-w-sm shadow-card border border-[var(--color-border)]">
        <h2 className="text-base font-medium mb-4 text-center text-[var(--color-foreground)]">
          読み込み中
        </h2>
        <div className="flex justify-center">
          <div className="w-8 h-8 border-2 border-[var(--color-border)] border-t-[var(--color-primary)] rounded-full animate-spin" />
        </div>
      </div>
    </div>
  );
}
