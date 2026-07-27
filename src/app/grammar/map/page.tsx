'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import {
  GrammarMapGraph,
  GrammarMapLegend,
  GRAMMAR_STATUS_LABEL,
  grammarNodePracticeHref,
  type GrammarMapHandle,
} from '@/components/grammar/GrammarMapGraph';
import type { GrammarMapNode, GrammarMapSummary } from '@/lib/grammar/map';
import { EXAM_WEIGHT_MARK, GRAMMAR_GRADE_LABEL } from '@/lib/grammar/taxonomy';

// 文法マップ: 公開データで構成した26大単元・76小単元をノードグラフで表示する画面。
// ノードの構成も出題も公開ソース由来で、ユーザー自身が作った語法問題集は使わない。
// データは /api/grammar/map (Pro限定) から取得する。

type SourceInfo = {
  title: string;
  author: string;
  url: string;
  license: string;
  licenseUrl: string;
  modifications: string;
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; summary: GrammarMapSummary; nodes: GrammarMapNode[]; sources: SourceInfo[] }
  | { kind: 'pro-required' }
  | { kind: 'error'; message: string };

type SelectedNode = { node: GrammarMapNode; parent: GrammarMapNode | null };

function findSelectedNode(state: LoadState, selectedId: string | null): SelectedNode | null {
  if (state.kind !== 'ready' || !selectedId) return null;
  for (const unit of state.nodes) {
    if (unit.id === selectedId) return { node: unit, parent: null };
    const sub = unit.children.find((child) => child.id === selectedId);
    if (sub) return { node: sub, parent: unit };
  }
  return null;
}

export default function GrammarMapPage() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [licensesOpen, setLicensesOpen] = useState(false);
  const graphRef = useRef<GrammarMapHandle | null>(null);

  // 詳細パネルから選んだノードは、地図側も中心に寄せる
  const selectAndFocus = (nodeId: string) => {
    setSelectedId(nodeId);
    graphRef.current?.focusNode(nodeId);
  };

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
          sources?: SourceInfo[];
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
        setState({
          kind: 'ready',
          summary: payload.summary,
          nodes: payload.nodes,
          sources: payload.sources ?? [],
        });
      } catch {
        if (!cancelled) setState({ kind: 'error', message: '通信に失敗しました' });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // 26大単元 × 数個の子を辿るだけなので、そのまま毎描画で解決する
  const selected = findSelectedNode(state, selectedId);

  if (state.kind === 'pro-required') {
    return (
      <div className="mx-auto min-h-screen w-full max-w-[560px] px-[18px] pt-6">
        <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white p-5">
          <div className="flex items-center gap-2">
            <span className="rounded-[3px] border border-[var(--solid-ink)] bg-white px-[6px] py-[2px] font-mono text-[9px] font-bold text-[var(--color-accent)]">
              PRO
            </span>
            <span className="font-display text-[15px] font-bold text-[var(--solid-ink)]">Pro限定機能です</span>
          </div>
          <p className="m-0 mt-2 text-[12px] leading-[1.8] text-[var(--solid-ink)]">
            文法マップはProプラン限定です。26大単元・76小単元の文法体系を、公開教材由来の問題で埋めながら攻略できます。
          </p>
          <Link
            href="/subscription"
            className="mt-4 flex h-11 items-center justify-center rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] font-bold text-white no-underline"
          >
            Proプランを見る
          </Link>
        </div>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="mx-auto min-h-screen w-full max-w-[560px] px-[18px] pt-6">
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
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-[#05070d]">
      {/* ヘッダー: スコア帯 (ノードマップの上に重ねる) */}
      <header
        className="flex shrink-0 items-center gap-3 px-4 pb-3"
        style={{ paddingTop: 'max(12px, calc(env(safe-area-inset-top) + 10px))' }}
      >
        <button
          type="button"
          onClick={handleBack}
          aria-label="戻る"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-white/25 bg-white text-[#05070d]"
        >
          <Icon name="chevron_left" size={20} />
        </button>

        {state.kind === 'ready' && (
          <div className="flex flex-1 items-center justify-around gap-2">
            <div className="text-center">
              <div className="font-mono text-[9.5px] font-bold tracking-[0.08em] text-white/55">習得</div>
              <div className="font-display text-[19px] font-extrabold leading-tight tabular-nums text-white">
                {state.summary.masteredQuestions}
                <span className="text-[12px] text-white/50">/{state.summary.totalQuestions}</span>
              </div>
            </div>
            <div className="text-center">
              <div className="font-mono text-[9.5px] font-bold tracking-[0.08em] text-white/55">単元</div>
              <div className="font-display text-[19px] font-extrabold leading-tight tabular-nums text-white">
                {state.summary.masteredSubUnits}
                <span className="text-[12px] text-white/50">/{state.summary.totalSubUnits}</span>
              </div>
            </div>
            <div className="text-center">
              <div className="font-mono text-[9.5px] font-bold tracking-[0.08em] text-white/55">達成率</div>
              <div className="font-display text-[19px] font-extrabold leading-tight tabular-nums text-white">
                {state.summary.masteryPercent}%
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ノードマップ本体 */}
      <div className="relative min-h-0 flex-1">
        {state.kind === 'loading' ? (
          <div className="flex h-full items-center justify-center">
            <span className="font-mono text-[11px] tracking-[0.08em] text-white/50">LOADING MAP...</span>
          </div>
        ) : (
          <GrammarMapGraph
            ref={graphRef}
            nodes={state.nodes}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        )}

        {/* 凡例 */}
        {state.kind === 'ready' && !selected && (
          <div className="pointer-events-none absolute left-4 top-3">
            <GrammarMapLegend />
          </div>
        )}
      </div>

      {/* 下部: 選択ノードの詳細、未選択なら説明 */}
      {state.kind === 'ready' && (
        <div
          className="shrink-0 border-t border-white/12 bg-[#0a0e18] px-4 pt-3"
          style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}
        >
          {selected ? (
            <div>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  {selected.parent && (
                    <div className="font-mono text-[9.5px] font-bold tracking-[0.06em] text-white/45">
                      {selected.parent.label}
                    </div>
                  )}
                  <div className="truncate font-display text-[17px] font-extrabold text-white">
                    {selected.node.label}
                  </div>
                  <div className="mt-0.5 font-mono text-[9.5px] text-white/45">{selected.node.labelEn}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  aria-label="閉じる"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/25 text-white"
                >
                  <Icon name="close" size={16} />
                </button>
              </div>

              {selected.node.points && (
                <p className="m-0 mt-2 text-[11.5px] leading-[1.7] text-white/65">{selected.node.points}</p>
              )}

              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono text-[10px] font-bold text-white/80">
                  {GRAMMAR_STATUS_LABEL[selected.node.status]}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-white/55">
                  収録 {selected.node.mastered}/{selected.node.total} 問
                </span>
                <span className="font-mono text-[10px] tabular-nums text-white/40">
                  目標 {selected.node.targetQuestions} 問
                </span>
                {selected.node.grade && (
                  <span className="font-mono text-[10px] text-white/55">
                    {GRAMMAR_GRADE_LABEL[selected.node.grade]}
                  </span>
                )}
                {selected.node.exam && (
                  <span className="font-mono text-[10px] text-white/55">
                    共通{EXAM_WEIGHT_MARK[selected.node.exam.common]} 私大{EXAM_WEIGHT_MARK[selected.node.exam.priv]} 二次{EXAM_WEIGHT_MARK[selected.node.exam.national]}
                  </span>
                )}
              </div>

              <div className="mt-3 h-[6px] overflow-hidden rounded-full bg-white/12">
                <div
                  className="h-full rounded-full bg-[#2fbf4e]"
                  style={{ width: `${selected.node.masteryPercent}%` }}
                />
              </div>

              {/* 大単元は配下の小単元へ辿れるようにする
                  (外周ノードは初期表示だと画面外にあり、指で探しにくいため) */}
              {selected.node.children.length > 0 && (
                <div className="mt-3">
                  <div className="font-mono text-[9.5px] font-bold tracking-[0.06em] text-white/40">
                    小単元
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {selected.node.children.map((child) => (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => selectAndFocus(child.id)}
                        className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-2.5 py-1.5 text-[11.5px] font-bold text-white"
                      >
                        <span
                          className="h-[7px] w-[7px] rounded-full"
                          style={{
                            backgroundColor: child.status === 'mastered'
                              ? '#2fbf4e'
                              : child.status === 'learning'
                                ? '#2f86e0'
                                : child.status === 'untouched'
                                  ? '#4a6ea8'
                                  : '#3b4256',
                          }}
                        />
                        {child.label}
                        <span className="font-mono text-[9.5px] tabular-nums text-white/45">
                          {child.mastered}/{child.total}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selected.parent && (
                <button
                  type="button"
                  onClick={() => selectAndFocus(selected.parent!.id)}
                  className="mt-3 flex items-center gap-1 font-mono text-[10px] text-white/45"
                >
                  <Icon name="chevron_left" size={13} />
                  {selected.parent.label}へ戻る
                </button>
              )}

              {selected.node.total > 0 ? (
                <Link
                  href={grammarNodePracticeHref(selected.node.id)}
                  className="mt-3 flex h-12 items-center justify-center gap-1.5 rounded-xl bg-white font-bold text-[#05070d] no-underline"
                >
                  <Icon name="play_arrow" size={18} />
                  この{selected.node.total}問を演習する
                </Link>
              ) : (
                <p className="m-0 mt-3 rounded-xl border border-white/15 px-3 py-2.5 text-center text-[11.5px] text-white/50">
                  この単元の問題は準備中です（体系上は目標 {selected.node.targetQuestions} 問）
                </p>
              )}
            </div>
          ) : (
            <div>
              <p className="m-0 text-center text-[11.5px] leading-[1.7] text-white/55">
                ノードをタップすると単元の詳細と演習に進めます。ドラッグで移動、ピンチ／ホイールで拡大縮小。
              </p>
              <button
                type="button"
                onClick={() => setLicensesOpen(true)}
                className="mx-auto mt-2 block font-mono text-[9.5px] tracking-[0.04em] text-white/40 underline"
              >
                出典・ライセンス
              </button>
            </div>
          )}
        </div>
      )}

      {/* 出典・ライセンス (CC BY は帰属表示が必須) */}
      {licensesOpen && state.kind === 'ready' && (
        <div className="absolute inset-0 z-40 flex items-end bg-black/70" onClick={() => setLicensesOpen(false)}>
          <div
            className="max-h-[75%] w-full overflow-y-auto rounded-t-2xl bg-[#0a0e18] px-5 pt-5"
            style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="m-0 font-display text-[16px] font-extrabold text-white">出典・ライセンス</h2>
              <button
                type="button"
                onClick={() => setLicensesOpen(false)}
                aria-label="閉じる"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/25 text-white"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
            <p className="mt-2 text-[11.5px] leading-[1.8] text-white/60">
              文法マップの分類体系と問題は、商用利用が認められた公開資料 (public domain / CC BY) にもとづいて作成しています。
            </p>
            <div className="mt-3 flex flex-col gap-3 pb-2">
              {state.sources.map((source) => (
                <div key={source.url} className="rounded-xl border border-white/15 p-3">
                  <div className="text-[12.5px] font-bold text-white">{source.title}</div>
                  <div className="mt-0.5 text-[11px] text-white/55">{source.author}</div>
                  <a
                    href={source.licenseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 inline-block font-mono text-[10px] text-[#7dc0ff]"
                  >
                    {source.license}
                  </a>
                  <p className="m-0 mt-1.5 text-[10.5px] leading-[1.7] text-white/50">{source.modifications}</p>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block truncate font-mono text-[10px] text-white/35"
                  >
                    {source.url}
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
