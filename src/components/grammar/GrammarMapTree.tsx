'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import type { GrammarMapNode, GrammarMapStatus } from '@/lib/grammar/map';

// 文法マップのツリー表示 (モバイル/デスクトップ共用)。
// 大分類を開くと配下の文法項目が枝状に伸び、各ノードの習得度バーで
// 「どこまで習得できているか」を一目で見られるようにする。

export const GRAMMAR_MAP_STATUS_LABEL: Record<GrammarMapStatus, string> = {
  mastered: '習得済み',
  learning: '学習中',
  untouched: '未着手',
  empty: '問題なし',
};

// 状態ごとの色。習得済み=アクセント、学習中=インク、未着手=枠だけ、問題なし=薄いグレー。
const STATUS_DOT: Record<GrammarMapStatus, string> = {
  mastered: 'bg-[var(--color-accent)] border-[var(--color-accent)]',
  learning: 'bg-[var(--solid-ink)] border-[var(--solid-ink)]',
  untouched: 'bg-white border-[var(--solid-ink)]',
  empty: 'bg-[var(--color-border)] border-[var(--color-border)]',
};

const STATUS_BAR: Record<GrammarMapStatus, string> = {
  mastered: 'bg-[var(--color-accent)]',
  learning: 'bg-[var(--solid-ink)]',
  untouched: 'bg-[var(--color-border)]',
  empty: 'bg-transparent',
};

/** 演習ページのパス。/grammar/[bookId] の特殊値として point-<nodeId> を渡す */
export function grammarNodePracticeHref(nodeId: string): string {
  return `/grammar/point-${nodeId}`;
}

function MasteryBar({ node }: { node: GrammarMapNode }) {
  return (
    <span className="h-[6px] flex-1 overflow-hidden rounded-full bg-[var(--color-border-light,#eee)]">
      <span
        className={`block h-full rounded-full ${STATUS_BAR[node.status]}`}
        style={{ width: `${node.masteryPercent}%` }}
      />
    </span>
  );
}

function CountLabel({ node }: { node: GrammarMapNode }) {
  if (node.total === 0) {
    return <span className="font-mono text-[9.5px] font-bold text-[var(--color-muted)]">—</span>;
  }
  return (
    <span className="font-mono text-[9.5px] font-bold tabular-nums text-[var(--color-muted)]">
      {node.mastered}/{node.total}
    </span>
  );
}

function LeafRow({ node }: { node: GrammarMapNode }) {
  const practiceable = node.total > 0;
  return (
    <div className="flex items-center gap-2.5 py-2 pl-4 pr-1">
      {/* 枝の分岐点 */}
      <span className={`h-[9px] w-[9px] shrink-0 rounded-full border-2 ${STATUS_DOT[node.status]}`} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-bold text-[var(--solid-ink)]">{node.label}</span>
        <span className="mt-1 flex items-center gap-2">
          <MasteryBar node={node} />
          <CountLabel node={node} />
        </span>
      </span>
      {practiceable ? (
        <Link
          href={grammarNodePracticeHref(node.id)}
          aria-label={`${node.label}を演習する`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] no-underline transition-all duration-100 active:translate-x-px active:translate-y-px"
        >
          <Icon name="play_arrow" size={14} />
        </Link>
      ) : (
        <span className="w-8 shrink-0" />
      )}
    </div>
  );
}

function CategoryCard({
  node,
  expanded,
  onToggle,
  hideEmptyChildren,
}: {
  node: GrammarMapNode;
  expanded: boolean;
  onToggle: () => void;
  hideEmptyChildren: boolean;
}) {
  const children = hideEmptyChildren ? node.children.filter((child) => child.total > 0) : node.children;
  const hasChildren = node.children.length > 0;

  return (
    <div className="overflow-hidden rounded-xl border-2 border-[var(--solid-ink)] bg-white">
      <button
        type="button"
        onClick={onToggle}
        disabled={!hasChildren}
        aria-expanded={hasChildren ? expanded : undefined}
        className="flex w-full items-center gap-2.5 px-3 py-3 text-left disabled:cursor-default"
      >
        <span className={`h-[11px] w-[11px] shrink-0 rounded-full border-2 ${STATUS_DOT[node.status]}`} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate font-display text-[14px] font-extrabold text-[var(--solid-ink)]">
              {node.label}
            </span>
            <span className="shrink-0 font-mono text-[9px] font-bold tracking-[0.04em] text-[var(--color-muted)]">
              {node.total > 0 ? `${node.masteryPercent}%` : GRAMMAR_MAP_STATUS_LABEL.empty}
            </span>
          </span>
          <span className="mt-1.5 flex items-center gap-2">
            <MasteryBar node={node} />
            <CountLabel node={node} />
          </span>
        </span>
        {hasChildren && (
          <Icon
            name={expanded ? 'expand_less' : 'expand_more'}
            size={18}
            className="shrink-0 text-[var(--color-muted)]"
          />
        )}
      </button>

      {hasChildren && expanded && (
        <div className="border-t-2 border-[var(--color-border)] bg-[#fdfbf7] px-3 py-1">
          {/* 枝: 左の縦線で親子関係を示す */}
          <div className="border-l-2 border-[var(--color-border)] pl-1">
            {children.length === 0 ? (
              <p className="m-0 py-3 pl-4 text-[11.5px] text-[var(--color-muted)]">
                問題のある項目はまだありません
              </p>
            ) : (
              children.map((child) => <LeafRow key={child.id} node={child} />)
            )}
          </div>
        </div>
      )}

      {/* 子を持たないノード (未分類など) は自身が演習対象 */}
      {!hasChildren && node.total > 0 && (
        <div className="border-t-2 border-[var(--color-border)] bg-[#fdfbf7] px-3 py-2.5">
          {node.samplePoints && node.samplePoints.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {node.samplePoints.map((point) => (
                <span
                  key={point}
                  className="rounded-[4px] border border-[var(--color-border)] bg-white px-1.5 py-[2px] font-mono text-[9.5px] text-[var(--color-muted)]"
                >
                  {point}
                </span>
              ))}
            </div>
          )}
          <Link
            href={grammarNodePracticeHref(node.id)}
            className="flex h-9 items-center justify-center gap-1.5 rounded-lg border-2 border-[var(--solid-ink)] bg-white text-[12px] font-bold text-[var(--solid-ink)] no-underline"
          >
            <Icon name="play_arrow" size={14} />
            この{node.total}問を演習する
          </Link>
        </div>
      )}
    </div>
  );
}

export function GrammarMapTree({
  nodes,
  hideEmpty,
}: {
  nodes: GrammarMapNode[];
  hideEmpty: boolean;
}) {
  // 初期状態では「問題がある大分類」だけ開いておく (全部閉じていると何も見えないため)
  const initiallyExpanded = useMemo(
    () => nodes.filter((node) => node.total > 0).map((node) => node.id),
    [nodes],
  );
  const [manualExpanded, setManualExpanded] = useState<Record<string, boolean>>({});

  const visible = hideEmpty ? nodes.filter((node) => node.total > 0) : nodes;

  const toggle = (id: string, currentlyExpanded: boolean) => {
    setManualExpanded((prev) => ({ ...prev, [id]: !currentlyExpanded }));
  };

  return (
    <div className="flex flex-col gap-2.5">
      {visible.map((node) => {
        const expanded = manualExpanded[node.id] ?? initiallyExpanded.includes(node.id);
        return (
          <CategoryCard
            key={node.id}
            node={node}
            expanded={expanded}
            onToggle={() => toggle(node.id, expanded)}
            hideEmptyChildren={hideEmpty}
          />
        );
      })}
      {visible.length === 0 && (
        <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white p-5 text-center">
          <p className="m-0 text-[12.5px] leading-[1.8] text-[var(--solid-ink)]">
            まだ問題がありません。問題集を作ると、ここに文法事項ごとの習得度が広がります。
          </p>
        </div>
      )}
    </div>
  );
}

/** 凡例 (どの色がどの状態かを示す) */
export function GrammarMapLegend() {
  const items: GrammarMapStatus[] = ['mastered', 'learning', 'untouched', 'empty'];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {items.map((status) => (
        <span key={status} className="flex items-center gap-1.5">
          <span className={`h-[9px] w-[9px] rounded-full border-2 ${STATUS_DOT[status]}`} />
          <span className="font-mono text-[9.5px] font-bold text-[var(--color-muted)]">
            {GRAMMAR_MAP_STATUS_LABEL[status]}
          </span>
        </span>
      ))}
    </div>
  );
}
