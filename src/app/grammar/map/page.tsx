'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { DesktopButton, DesktopTopbar } from '@/components/desktop/DesktopChrome';
import { GrammarMapLegend, GrammarMapTree } from '@/components/grammar/GrammarMapTree';
import type { GrammarMapNode, GrammarMapSummary } from '@/lib/grammar/map';

// 文法マップ: 文法事項のツリーの上に自分の習得度を重ねて表示する画面。
// データは /api/grammar/map (Pro限定) を cookie セッションでそのまま利用する。
// 問題が0問のノードも「まだ手をつけていない領域」として残すのがこの画面の主旨。

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; summary: GrammarMapSummary; nodes: GrammarMapNode[] }
  | { kind: 'pro-required' }
  | { kind: 'error'; message: string };

function SummaryStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex-1">
      <div className="font-display text-[19px] font-extrabold leading-none tabular-nums text-[var(--solid-ink)]">
        {value}
      </div>
      <div className="mt-1 font-mono text-[9px] font-bold tracking-[0.04em] text-[var(--color-muted)]">{label}</div>
    </div>
  );
}

export default function GrammarMapPage() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [hideEmpty, setHideEmpty] = useState(false);

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push('/grammar');
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch('/api/grammar/map', { cache: 'no-store' });
        const payload = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          summary?: GrammarMapSummary;
          nodes?: GrammarMapNode[];
          error?: string;
          code?: string;
        };

        if (cancelled) return;

        if (response.status === 403 && payload.code === 'PRO_REQUIRED') {
          setState({ kind: 'pro-required' });
          return;
        }
        if (!response.ok || !payload.success || !payload.summary || !payload.nodes) {
          setState({ kind: 'error', message: payload.error || '文法マップの取得に失敗しました' });
          return;
        }
        setState({ kind: 'ready', summary: payload.summary, nodes: payload.nodes });
      } catch {
        if (!cancelled) setState({ kind: 'error', message: '通信に失敗しました' });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const summaryCard = state.kind === 'ready' && (
    <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[9.5px] font-bold tracking-[0.08em] text-[var(--color-muted)]">
          OVERALL MASTERY
        </span>
        <span className="ml-auto font-display text-2xl font-extrabold leading-none tabular-nums text-[var(--solid-ink)]">
          {state.summary.masteryPercent}%
        </span>
      </div>
      <div className="mt-2.5 h-[8px] overflow-hidden rounded-full bg-[var(--color-border-light,#eee)]">
        <div
          className="h-full rounded-full bg-[var(--color-accent)]"
          style={{ width: `${state.summary.masteryPercent}%` }}
        />
      </div>
      <div className="mt-3.5 flex gap-2">
        <SummaryStat
          value={`${state.summary.masteredQuestions}/${state.summary.totalQuestions}`}
          label="習得した問題"
        />
        <SummaryStat
          value={`${state.summary.coveredLeaves}/${state.summary.totalLeaves}`}
          label="着手した項目"
        />
        <SummaryStat value={`${state.summary.masteredLeaves}`} label="制覇した項目" />
      </div>
    </div>
  );

  const controls = state.kind === 'ready' && (
    <div className="mt-3.5 flex items-center justify-between gap-2">
      <GrammarMapLegend />
      <button
        type="button"
        onClick={() => setHideEmpty((prev) => !prev)}
        className={`shrink-0 rounded-full border-2 border-[var(--solid-ink)] px-2.5 py-1 font-mono text-[9.5px] font-bold transition-colors ${
          hideEmpty ? 'bg-[var(--solid-ink)] text-white' : 'bg-white text-[var(--solid-ink)]'
        }`}
      >
        {hideEmpty ? '全項目を表示' : '問題がある項目だけ'}
      </button>
    </div>
  );

  const proRequired = (
    <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white p-5">
      <div className="flex items-center gap-2">
        <span className="rounded-[3px] border border-[var(--solid-ink)] bg-white px-[6px] py-[2px] font-mono text-[9px] font-bold tracking-[0.04em] text-[var(--color-accent)]">
          PRO
        </span>
        <span className="font-display text-[15px] font-bold text-[var(--solid-ink)]">Pro限定機能です</span>
      </div>
      <p className="m-0 mt-2 text-[12px] leading-[1.8] text-[var(--solid-ink)]">
        文法マップはProプラン限定です。アップグレードすると、解いた語法問題が文法事項ごとに整理され、習得状況をツリーで確認できます。
      </p>
      <Link
        href="/subscription"
        className="mt-4 flex h-11 items-center justify-center rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] font-bold text-white no-underline"
      >
        Proプランを見る
      </Link>
    </div>
  );

  const loading = (
    <div className="flex flex-col gap-2.5">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[68px] animate-pulse rounded-xl border-2 border-[var(--color-border)] bg-white" />
      ))}
    </div>
  );

  const errorBox = state.kind === 'error' && (
    <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white p-5 text-center">
      <p className="m-0 text-[13px] text-[var(--solid-ink)]">{state.message}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-3 h-10 rounded-xl border-2 border-[var(--solid-ink)] bg-white px-5 text-[13px] font-bold text-[var(--solid-ink)]"
      >
        再読み込み
      </button>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <div className="hidden h-full min-h-0 flex-col lg:flex">
        <DesktopTopbar title="文法マップ" crumb="語法 / 文法事項の習得状況">
          <DesktopButton href="/grammar" variant="ghost" icon="menu_book">
            問題集一覧
          </DesktopButton>
        </DesktopTopbar>

        <div className="ds-scroll">
          <div style={{ maxWidth: 760, margin: '0 auto' }}>
            {state.kind === 'loading' && loading}
            {state.kind === 'pro-required' && proRequired}
            {state.kind === 'error' && errorBox}
            {state.kind === 'ready' && (
              <>
                {summaryCard}
                {controls}
                <div className="mt-3.5">
                  <GrammarMapTree nodes={state.nodes} hideEmpty={hideEmpty} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile */}
      <div className="relative mx-auto min-h-screen w-full max-w-[560px] bg-[var(--color-background)] px-[18px] pb-32 pt-3 font-[var(--font-body)] lg:hidden">
        <div className="flex items-start gap-2 pb-3.5 pt-1">
          <button
            type="button"
            onClick={handleBack}
            aria-label="戻る"
            className="mt-1 flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
          >
            <Icon name="chevron_left" size={16} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">
              GRAMMAR MAP
            </div>
            <div className="mt-1 font-display text-2xl font-extrabold leading-[1.15] tracking-[-0.02em] text-[var(--solid-ink)]">
              文法マップ
            </div>
            <div className="mt-1.5 text-[12px] font-medium text-[var(--color-muted)]">
              解いた語法問題を文法事項ごとに整理して、習得状況をツリーで表示します
            </div>
          </div>
        </div>

        {state.kind === 'loading' && loading}
        {state.kind === 'pro-required' && proRequired}
        {state.kind === 'error' && errorBox}
        {state.kind === 'ready' && (
          <>
            {summaryCard}
            {controls}
            <div className="mt-3.5">
              <GrammarMapTree nodes={state.nodes} hideEmpty={hideEmpty} />
            </div>
            {state.summary.totalQuestions === 0 && (
              <p className="mt-4 text-center text-[11.5px] leading-[1.9] text-[var(--color-muted)]">
                語法問題集を作って解くと、ここが埋まっていきます。
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
