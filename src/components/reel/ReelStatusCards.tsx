'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import type { HomeReelPreviewItem } from '@/lib/home/recommendations-types';

function StatusShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-[var(--solid-radius)] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] p-8 text-center">
        {children}
      </div>
    </div>
  );
}

function UpgradeButton() {
  return (
    <Link
      href="/subscription"
      className="mt-5 inline-flex items-center justify-center gap-1 rounded-[var(--solid-radius-sm)] border-2 border-[var(--color-accent-ink)] bg-[var(--color-accent)] px-6 py-3 text-sm font-bold text-white transition-transform duration-100 active:translate-x-px active:translate-y-px"
    >
      Proプランで無制限に見る
    </Link>
  );
}

/** Shown as the final snap card when the free daily view limit is hit. */
export function ReelLimitCard({ limit }: { limit: number | null }) {
  return (
    <StatusShell>
      <Icon name="hourglass_top" size={40} className="text-[var(--color-muted)]" />
      <h2 className="mt-3 font-display text-lg font-bold text-[var(--color-foreground)]">
        今日の上限に達しました
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-secondary-text)]">
        無料プランで見られるリールは1日{limit ?? 50}枚までです。また明日戻ってくるか、Proプランで無制限に学習を続けましょう。
      </p>
      <UpgradeButton />
    </StatusShell>
  );
}

/** Shown when there are no candidates at all. */
export function ReelEmptyState() {
  return (
    <StatusShell>
      <Icon name="movie" size={40} className="text-[var(--color-muted)]" />
      <h2 className="mt-3 font-display text-lg font-bold text-[var(--color-foreground)]">
        まだリールがありません
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-secondary-text)]">
        公開されている単語帳がまだ少ないようです。共有ページから単語帳を公開してみましょう。
      </p>
    </StatusShell>
  );
}

/** Shown while the feed fails to load. */
export function ReelErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <StatusShell>
      <Icon name="error" size={40} className="text-[var(--color-error)]" />
      <h2 className="mt-3 font-display text-lg font-bold text-[var(--color-foreground)]">
        リールを読み込めませんでした
      </h2>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex items-center justify-center rounded-[var(--solid-radius-sm)] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-6 py-3 text-sm font-bold text-[var(--color-foreground)] transition-transform duration-100 active:translate-x-px active:translate-y-px"
      >
        再読み込み
      </button>
    </StatusShell>
  );
}

/** Initial-load shimmer. */
export function ReelSkeleton() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-8">
      <div className="h-10 w-52 animate-pulse rounded-lg bg-[var(--color-surface-secondary)]" />
      <div className="h-5 w-32 animate-pulse rounded-lg bg-[var(--color-surface-secondary)]" />
      <div className="mt-8 h-16 w-full max-w-sm animate-pulse rounded-[var(--solid-radius-sm)] bg-[var(--color-surface-secondary)]" />
    </div>
  );
}

/**
 * ホームのリールカードから遷移した直後、フィードAPIの応答を待つ間に
 * pin された単語（英単語・訳・語源）を即時表示するプレビュー。
 * レイアウトは ReelEtymologyPanel の統合面と揃えている。
 */
export function ReelPinnedPreviewCard({ item }: { item: HomeReelPreviewItem }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="flex flex-col items-center gap-1">
        <p className="font-display text-3xl font-bold text-[var(--color-foreground)]">
          {item.english}
        </p>
        {item.pronunciation && (
          <p className="font-mono text-base text-[var(--color-secondary-text)]">
            {item.pronunciation}
          </p>
        )}
      </div>

      <div className="text-2xl font-bold leading-snug text-[var(--color-foreground)]">
        {item.japanese}
      </div>

      {!item.morphology.none && item.morphology.formula.length > 0 && (
        <div className="flex w-full max-w-md flex-col items-center gap-3 border-t border-[var(--color-border)] pt-4">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--color-muted)]">
            語源
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-2">
            {item.morphology.formula.map((part, index) => (
              <span key={`${part.text}-${index}`} className="flex items-center gap-1.5">
                {index > 0 && (
                  <span className="text-base font-bold text-[var(--color-muted)]">＋</span>
                )}
                <span
                  className={`rounded-full border px-3 py-1 text-sm font-bold ${
                    part.kind === 'root'
                      ? 'border-[var(--color-border)] bg-[var(--color-surface-secondary)] text-[var(--color-foreground)]'
                      : 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent-ink)]'
                  }`}
                >
                  {part.text}
                  <span className="ml-1 text-xs font-semibold opacity-80">({part.meaningJa})</span>
                </span>
              </span>
            ))}
          </div>
          {item.morphology.explanation && (
            <p className="whitespace-pre-line text-base leading-relaxed text-[var(--color-secondary-text)]">
              {item.morphology.explanation}
            </p>
          )}
        </div>
      )}

      <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-[var(--color-muted)]">
        <Icon name="progress_activity" size={14} className="animate-spin" />
        フィードを読み込み中...
      </div>
    </div>
  );
}
