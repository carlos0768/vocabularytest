export default function Loading() {
  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <div className="mx-auto max-w-[560px] px-[14px] py-3">
        {/* ヘッダ（戻る + ルーム名 + メンバーアイコン） */}
        <div className="flex items-center gap-2 pb-3">
          <div className="h-9 w-9 animate-pulse rounded-full bg-[var(--color-surface-secondary)]" />
          <div className="h-[34px] w-[34px] animate-pulse rounded-full bg-[var(--color-surface-secondary)]" />
          <div className="h-5 flex-1 animate-pulse rounded bg-[var(--color-surface-secondary)]" />
          <div className="h-7 w-20 animate-pulse rounded-full bg-[var(--color-surface-secondary)]" />
        </div>
        {/* 2×2 のハブタイル */}
        <div className="grid grid-cols-2 grid-rows-2 gap-2.5">
          {[0, 1, 2, 3].map((slot) => (
            <div key={slot} className="h-[150px] animate-pulse rounded-[18px] bg-[var(--color-surface-secondary)]" />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[0, 1, 2].map((slot) => (
            <div key={slot} className="h-[42px] animate-pulse rounded-[12px] bg-[var(--color-surface-secondary)]" />
          ))}
        </div>
      </div>
    </div>
  );
}
