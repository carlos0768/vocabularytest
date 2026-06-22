'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/use-auth';

type HistoryItem = {
  id: string;
  purpose: string;
  preview: string;
  score: number;
  wordCount: number;
  issueCount: number;
  createdAt: string;
};

type CorrectionStats = {
  total: number;
  monthDelta: number;
  avgScore: number;
  savedWordsTotal: number;
};

const EMPTY_STATS: CorrectionStats = { total: 0, monthDelta: 0, avgScore: 0, savedWordsTotal: 0 };

function scoreColor(score: number): string {
  if (score >= 85) return 'var(--color-success)';
  if (score >= 70) return 'var(--color-accent)';
  if (score >= 60) return '#c8a02e';
  return '#c43d3d';
}

function formatWhen(value: string) {
  const diff = Date.now() - Date.parse(value);
  if (!Number.isFinite(diff)) return '';
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes} 分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 時間前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 日前`;
  return new Date(value).toLocaleDateString('ja-JP');
}

export default function CorrectionHistoryPage() {
  const router = useRouter();
  const { user, isPro, loading: authLoading } = useAuth();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [stats, setStats] = useState<CorrectionStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !isPro) return;

    let active = true;
    Promise.all([
      fetch('/api/correction/history').then((response) => response.json()),
      fetch('/api/correction/stats').then((response) => response.json()),
    ])
      .then(([history, statPayload]) => {
        if (!active) return;
        if (!history.success) throw new Error(history.error || '履歴の取得に失敗しました');
        setError(null);
        setItems(history.items ?? []);
        setStats(statPayload.success ? statPayload.stats : EMPTY_STATS);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : '添削履歴の取得に失敗しました');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [authLoading, isPro, user]);

  return (
    <div className="relative min-h-full pb-[80px] pt-3 font-[var(--font-body)] lg:pt-0" style={{ background: 'var(--color-background)' }}>
      <div className="lg:hidden flex items-center gap-2.5 px-[14px] pb-1.5 pt-1">
        <button type="button" onClick={() => router.back()} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center border-none bg-transparent p-0 text-[var(--solid-ink)]">
          <Icon name="chevron_left" size={18} />
        </button>
        <div className="mr-8 flex-1 text-center text-base font-bold text-[var(--solid-ink)]" style={{ fontFamily: 'var(--font-display)' }}>英作文の添削</div>
      </div>

      <div className="px-[18px] pb-3 pt-2">
        <div className="inline-flex items-center gap-[5px] rounded bg-[var(--solid-ink)] px-2 py-[3px] font-mono text-[9px] font-bold tracking-[0.08em] text-white">
          <Icon name="edit_note" size={11} />
          CORRECTION
        </div>
        <div className="mt-2 text-[22px] font-extrabold leading-[1.25] tracking-[-0.02em] text-[var(--solid-ink)]" style={{ fontFamily: 'var(--font-display)' }}>
          これまでの添削
        </div>
      </div>

      <div className="px-[18px] pb-3">
        <div className="grid grid-cols-3 overflow-hidden rounded-xl border-2 border-[var(--solid-ink)] bg-white">
          {[
            { label: '添削回数', value: stats.total, sub: `今月 +${stats.monthDelta}` },
            { label: '平均スコア', value: stats.avgScore, sub: 'score' },
            { label: '単語帳化', value: stats.savedWordsTotal, sub: 'words' },
          ].map((s, i) => (
            <div key={s.label} className="py-[11px] text-center" style={{ borderRight: i < 2 ? '1px solid var(--color-border)' : 'none' }}>
              <div className="mb-1 font-mono text-[8.5px] font-bold tracking-[0.08em] text-[var(--color-muted)]">{s.label}</div>
              <div className="tabular-nums text-[22px] font-extrabold leading-none text-[var(--solid-ink)]" style={{ fontFamily: 'var(--font-display)' }}>{s.value}</div>
              <div className="mt-[3px] font-mono text-[9px] text-[var(--color-muted)]">{s.sub}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-[18px] pb-3.5">
        <Link href={user ? (isPro ? '/correction/new' : '/subscription') : '/login?redirect=/correction'} className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-[11px]" style={{ border: '1.25px dashed var(--solid-ink)' }}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--solid-ink)] text-white">
            <Icon name={user && !isPro ? 'workspace_premium' : 'add'} size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-[var(--solid-ink)]">{user && !isPro ? 'Proで添削を使う' : '新しく添削する'}</div>
            <div className="mt-0.5 text-[10.5px] text-[var(--color-muted)]">テキスト入力からAI添削を開始</div>
          </div>
          <div className="inline-flex items-center gap-[5px] rounded-lg border-2 border-[var(--solid-ink)] bg-[var(--color-background)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--solid-ink)]">
            <Icon name="edit" size={11} />
            入力
          </div>
        </Link>
      </div>

      {error && <div className="px-[18px] pb-3 text-xs font-bold text-[var(--color-error)]">{error}</div>}

      <div className="flex items-center justify-between px-[18px] pb-2">
        <div className="font-mono text-[9px] font-bold tracking-[0.08em] text-[var(--color-muted)]">履歴 ({items.length})</div>
        <div className="inline-flex items-center gap-1 font-mono text-[9px] font-bold tracking-[0.04em] text-[var(--solid-ink)]">
          <Icon name="sort" size={11} /> 新しい順
        </div>
      </div>

      <div className="flex flex-col gap-2 px-[18px]">
        {authLoading || (user && isPro && loading) ? (
          <div className="rounded-xl border-2 border-[var(--color-border)] bg-white px-3 py-5 text-center text-xs font-bold text-[var(--color-muted)]">読み込み中...</div>
        ) : !user ? (
          <Link href="/login?redirect=/correction" className="rounded-xl border-2 border-[var(--color-border)] bg-white px-3 py-5 text-center text-xs font-bold text-[var(--solid-ink)]">ログインして履歴を見る</Link>
        ) : !isPro ? (
          <Link href="/subscription" className="rounded-xl border-2 border-[var(--solid-ink)] bg-white px-3 py-5 text-center text-xs font-bold text-[var(--solid-ink)]">Proで添削APIを有効化</Link>
        ) : items.length === 0 ? (
          <div className="rounded-xl border-2 border-[var(--color-border)] bg-white px-3 py-5 text-center text-xs font-bold text-[var(--color-muted)]">まだ添削履歴がありません</div>
        ) : (
          items.map((item) => (
            <Link key={item.id} href={`/correction/result?id=${item.id}`} className="relative flex items-stretch gap-[11px] rounded-xl bg-white px-3 py-[11px]" style={{ border: '2px solid var(--color-border)' }}>
              <div className="flex w-12 shrink-0 flex-col items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-background)]">
                <div className="tabular-nums text-[19px] font-extrabold leading-none" style={{ fontFamily: 'var(--font-display)', color: scoreColor(item.score) }}>{item.score}</div>
                <div className="mt-0.5 font-mono text-[7.5px] font-bold tracking-[0.08em] text-[var(--color-muted)]">SCORE</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-[3px] flex items-center gap-1.5">
                  <span className="rounded bg-[var(--solid-ink)] px-[5px] py-[1.5px] font-mono text-[8px] font-bold tracking-[0.06em] text-white">{item.purpose}</span>
                  <span className="font-mono text-[9px] text-[var(--color-muted)]">{formatWhen(item.createdAt)}</span>
                </div>
                <div className="line-clamp-2 text-[11.5px] italic leading-[1.5] text-[var(--solid-ink)]">{item.preview}</div>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="inline-flex items-center gap-[3px] font-mono text-[9px] font-bold text-[var(--color-muted)]"><span className="inline-block h-[5px] w-[5px] rounded-full bg-[#c43d3d]" />{item.issueCount} 指摘</span>
                  <span className="inline-block h-[3px] w-[3px] rounded-full bg-[var(--color-muted)]" />
                  <span className="font-mono text-[9px] font-semibold text-[var(--color-muted)]">{item.wordCount} 語</span>
                </div>
              </div>
              <div className="shrink-0 self-center text-[var(--color-muted)]"><Icon name="chevron_right" size={14} /></div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
