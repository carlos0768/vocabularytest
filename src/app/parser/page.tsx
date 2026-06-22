'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/use-auth';

type ParserItem = {
  id: string;
  depth: 'simple' | 'clause' | 'tree';
  preview: string;
  wordCount: number;
  clauseCount: number;
  createdAt: string;
};

type ParserStats = {
  totalAnalyses: number;
  monthDelta: number;
  avgClauseCount: number;
  savedWordsTotal: number;
};

const EMPTY_STATS: ParserStats = { totalAnalyses: 0, monthDelta: 0, avgClauseCount: 0, savedWordsTotal: 0 };
const DEPTH_LABELS = { simple: 'SVOのみ', clause: '節を分ける', tree: 'ツリー詳細' };

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

export default function ParserHistoryPage() {
  const router = useRouter();
  const { user, isPro, loading: authLoading } = useAuth();
  const [items, setItems] = useState<ParserItem[]>([]);
  const [stats, setStats] = useState<ParserStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !isPro) return;

    let active = true;
    Promise.all([
      fetch('/api/parser/history').then((response) => response.json()),
      fetch('/api/parser/stats').then((response) => response.json()),
    ])
      .then(([history, statPayload]) => {
        if (!active) return;
        if (!history.success) throw new Error(history.error || '履歴の取得に失敗しました');
        setError(null);
        setItems(history.items ?? []);
        setStats(statPayload.success ? statPayload.stats : EMPTY_STATS);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : '解析履歴の取得に失敗しました');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [authLoading, isPro, user]);

  return (
    <div className="relative min-h-screen bg-[var(--color-background)] pb-[80px] pt-3 font-[var(--font-body)] lg:pt-0">
      <div className="lg:hidden flex items-center gap-2.5 px-[14px] pb-1.5 pt-1">
        <button type="button" onClick={() => router.back()} className="inline-flex h-8 w-8 items-center justify-center text-[var(--solid-ink)]">
          <Icon name="chevron_left" size={18} />
        </button>
        <div className="mr-8 flex-1 text-center font-display text-base font-bold text-[var(--solid-ink)]">英文の構造解析</div>
      </div>

      <div className="px-[18px] pb-3 pt-2">
        <div className="inline-flex items-center gap-1.5 rounded-[4px] bg-[var(--solid-ink)] px-2 py-[3px] font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-white">
          <Icon name="account_tree" size={11} />
          PARSER
        </div>
        <div className="mt-2 font-display text-[22px] font-extrabold leading-[1.25] tracking-[-0.02em] text-[var(--solid-ink)]">これまでの解析</div>
      </div>

      <div className="px-[18px] pb-3">
        <div className="grid grid-cols-3 overflow-hidden rounded-[12px] border-2 border-[var(--solid-ink)] bg-white">
          {[
            { label: '解析回数', value: stats.totalAnalyses, sub: `今月 +${stats.monthDelta}` },
            { label: '平均節数', value: stats.avgClauseCount, sub: '/ 文' },
            { label: '保存単語', value: stats.savedWordsTotal, sub: 'words' },
          ].map((s, i) => (
            <div key={s.label} className={`px-3 py-[11px] text-center ${i < 2 ? 'border-r border-[var(--color-border)]' : ''}`}>
              <div className="mb-1 font-mono text-[8.5px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">{s.label}</div>
              <div className="font-display text-[22px] font-extrabold leading-none tabular-nums text-[var(--solid-ink)]">{s.value}</div>
              <div className="mt-[3px] font-mono text-[9px] text-[var(--color-muted)]">{s.sub}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-[18px] pb-3.5">
        <Link href={user ? (isPro ? '/parser/new' : '/subscription') : '/login?redirect=/parser'} className="flex items-center gap-2.5 rounded-[12px] border-2 border-dashed border-[var(--solid-ink)] bg-white px-3 py-[11px]">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[var(--solid-ink)] text-white">
            <Icon name={user && !isPro ? 'workspace_premium' : 'add'} size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-[var(--solid-ink)]">{user && !isPro ? 'Proで構造解析を使う' : '新しく解析する'}</div>
            <div className="mt-0.5 text-[10.5px] text-[var(--color-muted)]">テキスト入力から構文解析を開始</div>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-[8px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface-secondary)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--solid-ink)]">
            <Icon name="edit" size={11} />
            入力
          </div>
        </Link>
      </div>

      {error && <div className="px-[18px] pb-3 text-xs font-bold text-[var(--color-error)]">{error}</div>}

      <div className="flex items-center justify-between px-[18px] pb-2">
        <div className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">履歴 ({items.length})</div>
        <div className="inline-flex items-center gap-1 font-mono text-[9px] font-bold tracking-[0.04em] text-[var(--solid-ink)]">
          <Icon name="sort" size={11} /> 新しい順
        </div>
      </div>

      <div className="flex flex-col gap-2 px-[18px]">
        {authLoading || (user && isPro && loading) ? (
          <div className="rounded-[12px] border-2 border-[var(--color-border)] bg-white px-3 py-5 text-center text-xs font-bold text-[var(--color-muted)]">読み込み中...</div>
        ) : !user ? (
          <Link href="/login?redirect=/parser" className="rounded-[12px] border-2 border-[var(--color-border)] bg-white px-3 py-5 text-center text-xs font-bold text-[var(--solid-ink)]">ログインして履歴を見る</Link>
        ) : !isPro ? (
          <Link href="/subscription" className="rounded-[12px] border-2 border-[var(--solid-ink)] bg-white px-3 py-5 text-center text-xs font-bold text-[var(--solid-ink)]">Proで構造解析APIを有効化</Link>
        ) : items.length === 0 ? (
          <div className="rounded-[12px] border-2 border-[var(--color-border)] bg-white px-3 py-5 text-center text-xs font-bold text-[var(--color-muted)]">まだ解析履歴がありません</div>
        ) : (
          items.map((item) => (
            <Link key={item.id} href={`/parser/result?id=${item.id}`} className="block rounded-[12px] border-2 border-[var(--color-border)] bg-white px-3 py-[11px]">
              <div className="mb-1.5 flex items-center gap-1.5">
                <span className="rounded-[3px] bg-[var(--solid-ink)] px-[5px] py-[1.5px] font-mono text-[8px] font-bold tracking-[0.06em] text-white">{DEPTH_LABELS[item.depth]}</span>
                {item.depth === 'tree' && <span className="rounded-[3px] bg-[var(--color-accent)] px-[5px] py-[1.5px] font-mono text-[8px] font-bold tracking-[0.06em] text-white">PRO</span>}
                <span className="inline-flex items-center gap-1 font-mono text-[9px] font-bold text-[var(--color-muted)]"><span className="h-[5px] w-[5px] rounded-full bg-[var(--color-success)]" />{item.clauseCount} 節</span>
                <span className="flex-1" />
                <span className="font-mono text-[9px] text-[var(--color-muted)]">{formatWhen(item.createdAt)}</span>
              </div>
              <div className="mb-1.5 flex h-1.5 overflow-hidden rounded-[3px]">
                {Array.from({ length: Math.max(1, item.clauseCount) }).map((_, i) => (
                  <div key={i} style={{ width: `${100 / Math.max(1, item.clauseCount)}%`, background: ['#137fec', '#d97757', '#2a9d5c', '#a8761f'][i % 4] }} />
                ))}
              </div>
              <div className="line-clamp-2 font-mono text-[11px] leading-[1.55] text-[var(--solid-ink)]">{item.preview}</div>
              <div className="mt-1.5 flex items-center justify-end gap-1 font-mono text-[10px] font-bold tracking-[0.04em] text-[var(--color-muted)]">開く <Icon name="chevron_right" size={11} /></div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
