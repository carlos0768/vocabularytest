'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import type { GrammarMapNode, GrammarMapStatus } from '@/lib/grammar/map';
import {
  GRAMMAR_HUB_ID,
  buildGrammarMapLayout,
  grammarLabelPlacement,
  wrapGrammarLabel,
  type GrammarLayoutNode,
} from '@/lib/grammar/layout';

// 文法マップのノードグラフ。
// 中心のハブから26大単元が放射状に伸び、その外側に76小単元が並ぶ星図型。
// 配置は src/lib/grammar/layout.ts (純粋関数) が決め、ここは描画と操作だけを担当する。
//
// 色の意味:
//   習得済み = 緑の塗り / 学習中 = 青の塗り / 未着手 = 濃紺の塗り+青枠 / 問題なし = 枠だけ

const STATUS_FILL: Record<GrammarMapStatus, string> = {
  mastered: '#2fbf4e',
  learning: '#2f86e0',
  untouched: '#16203a',
  empty: 'transparent',
};

const STATUS_STROKE: Record<GrammarMapStatus, string> = {
  mastered: '#7ef29b',
  learning: '#7dc0ff',
  untouched: '#4a6ea8',
  empty: '#3b4256',
};

export const GRAMMAR_STATUS_LABEL: Record<GrammarMapStatus, string> = {
  mastered: '習得済み',
  learning: '学習中',
  untouched: '未着手',
  empty: '準備中',
};

/** 演習ページのパス。/grammar/[bookId] の特殊値として point-<nodeId> を渡す */
export function grammarNodePracticeHref(nodeId: string): string {
  return `/grammar/point-${nodeId}`;
}

// 背景の星。SSRとクライアントで一致させるため決定的に生成する。
const STARS = (() => {
  let seed = 20260727;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  return Array.from({ length: 140 }, () => ({
    x: random() * 2400 - 1200,
    y: random() * 2400 - 1200,
    r: random() * 2.2 + 0.6,
    o: random() * 0.5 + 0.15,
  }));
})();

type Transform = { scale: number; x: number; y: number };

const MIN_SCALE = 0.35;
const MAX_SCALE = 3;

export function GrammarMapGraph({
  nodes,
  selectedId,
  onSelect,
}: {
  nodes: GrammarMapNode[];
  selectedId: string | null;
  onSelect: (nodeId: string | null) => void;
}) {
  const layout = useMemo(() => buildGrammarMapLayout(), []);
  const statsById = useMemo(() => {
    const map = new Map<string, GrammarMapNode>();
    for (const unit of nodes) {
      map.set(unit.id, unit);
      for (const sub of unit.children) map.set(sub.id, sub);
    }
    return map;
  }, [nodes]);

  const overall = useMemo(() => {
    const total = nodes.reduce((sum, node) => sum + node.total, 0);
    const mastered = nodes.reduce((sum, node) => sum + node.mastered, 0);
    return { total, mastered, percent: total > 0 ? Math.round((mastered / total) * 100) : 0 };
  }, [nodes]);

  const [transform, setTransform] = useState<Transform>({ scale: 0.55, x: 0, y: 0 });
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const pinchRef = useRef<Map<number, { x: number; y: number }>>(new Map());

  const handlePointerDown = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    pinchRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinchRef.current.size > 1) {
      dragRef.current = null;
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: transform.x,
      originY: transform.y,
      moved: false,
    };
  }, [transform.x, transform.y]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true;
    setTransform((prev) => ({ ...prev, x: drag.originX + dx, y: drag.originY + dy }));
  }, []);

  const handlePointerUp = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    pinchRef.current.delete(event.pointerId);
    const drag = dragRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }, []);

  const handleWheel = useCallback((event: ReactWheelEvent<SVGSVGElement>) => {
    setTransform((prev) => {
      const next = prev.scale * (event.deltaY < 0 ? 1.12 : 0.89);
      return { ...prev, scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, next)) };
    });
  }, []);

  const zoomBy = (factor: number) => {
    setTransform((prev) => ({
      ...prev,
      scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * factor)),
    }));
  };

  // ドラッグ直後のクリックで選択が変わらないようにする
  const selectIfNotDragged = (nodeId: string | null) => {
    if (dragRef.current?.moved) return;
    onSelect(nodeId);
  };

  const nodeById = useMemo(() => {
    const map = new Map<string, GrammarLayoutNode>();
    for (const node of layout.nodes) map.set(node.id, node);
    return map;
  }, [layout]);

  const { viewBox } = layout;

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#05070d]">
      <svg
        role="img"
        aria-label="文法マップ"
        className="h-full w-full touch-none select-none"
        viewBox={`${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        style={{ cursor: 'grab' }}
      >
        <g
          transform={`translate(${transform.x / transform.scale} ${transform.y / transform.scale}) scale(${transform.scale})`}
        >
          {/* 背景の星 */}
          {STARS.map((star, index) => (
            <circle key={index} cx={star.x} cy={star.y} r={star.r} fill="#ffffff" opacity={star.o} />
          ))}

          {/* 枝 (親→子) */}
          {layout.edges.map((edge) => {
            const from = nodeById.get(edge.from);
            const to = nodeById.get(edge.to);
            if (!from || !to) return null;
            const status = statsById.get(edge.to)?.status ?? 'empty';
            const active = status === 'mastered' || status === 'learning';
            return (
              <line
                key={`${edge.from}-${edge.to}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={active ? '#2fbf4e' : '#2b3348'}
                strokeWidth={active ? 3 : 2}
                opacity={active ? 0.85 : 0.6}
              />
            );
          })}

          {/* ノード */}
          {layout.nodes.map((node) => {
            if (node.id === GRAMMAR_HUB_ID) {
              return (
                <g key={node.id} style={{ cursor: 'pointer' }} onClick={() => selectIfNotDragged(null)}>
                  <circle cx={node.x} cy={node.y} r={node.r} fill="#f7f3ea" stroke="#ffffff" strokeWidth={3} />
                  <text
                    x={node.x}
                    y={node.y - 2}
                    textAnchor="middle"
                    fontSize={20}
                    fontWeight={800}
                    fill="#05070d"
                  >
                    {overall.percent}%
                  </text>
                  <text x={node.x} y={node.y + 15} textAnchor="middle" fontSize={11} fill="#3b4256">
                    全体
                  </text>
                </g>
              );
            }

            const stats = statsById.get(node.id);
            const status: GrammarMapStatus = stats?.status ?? 'empty';
            const isUnit = node.kind === 'unit';
            const selected = selectedId === node.id;
            const labelLines = wrapGrammarLabel(stats?.label ?? node.id, isUnit ? 7 : 9, 2);
            // 小単元は半径方向に回転、大単元はハブ寄りに水平配置 (layout.ts)
            const placement = grammarLabelPlacement(node);
            // 複数行を回転後の座標系で縦に積む
            const firstLineDy = isUnit ? -(labelLines.length - 1) * 8 : -(labelLines.length - 1) * 7;

            return (
              <g
                key={node.id}
                style={{ cursor: 'pointer' }}
                onClick={() => selectIfNotDragged(node.id)}
                aria-label={stats?.label}
              >
                {selected && (
                  <circle cx={node.x} cy={node.y} r={node.r + 9} fill="none" stroke="#ffd35c" strokeWidth={4} />
                )}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.r}
                  fill={STATUS_FILL[status]}
                  stroke={STATUS_STROKE[status]}
                  strokeWidth={isUnit ? 4 : 3}
                />
                {/* ノード内には達成度を出す (問題があるときだけ) */}
                {stats && stats.total > 0 && (
                  <text
                    x={node.x}
                    y={node.y + 5}
                    textAnchor="middle"
                    fontSize={isUnit ? 15 : 13}
                    fontWeight={800}
                    fill={status === 'untouched' ? '#9fc4ff' : '#ffffff'}
                  >
                    {stats.mastered}/{stats.total}
                  </text>
                )}
                <g transform={`translate(${placement.x} ${placement.y}) rotate(${placement.rotate})`}>
                  {labelLines.map((line, index) => (
                    <text
                      key={index}
                      x={0}
                      y={firstLineDy + index * 14}
                      textAnchor={placement.anchor}
                      dominantBaseline="middle"
                      fontSize={isUnit ? 14 : 12}
                      fontWeight={isUnit ? 700 : 500}
                      fill={status === 'empty' ? '#7a8296' : '#ffffff'}
                    >
                      {line}
                    </text>
                  ))}
                </g>
              </g>
            );
          })}
        </g>
      </svg>

      {/* ズーム操作 */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => zoomBy(1.25)}
          aria-label="拡大"
          className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/30 bg-black/60 text-xl font-bold text-white backdrop-blur"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => zoomBy(0.8)}
          aria-label="縮小"
          className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/30 bg-black/60 text-xl font-bold text-white backdrop-blur"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => setTransform({ scale: 0.55, x: 0, y: 0 })}
          aria-label="位置をリセット"
          className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/30 bg-black/60 text-[10px] font-bold text-white backdrop-blur"
        >
          RESET
        </button>
      </div>
    </div>
  );
}

/** 凡例 */
export function GrammarMapLegend() {
  const items: GrammarMapStatus[] = ['mastered', 'learning', 'untouched', 'empty'];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {items.map((status) => (
        <span key={status} className="flex items-center gap-1.5">
          <span
            className="h-[10px] w-[10px] rounded-full border-2"
            style={{ backgroundColor: STATUS_FILL[status], borderColor: STATUS_STROKE[status] }}
          />
          <span className="font-mono text-[9.5px] font-bold text-white/70">
            {GRAMMAR_STATUS_LABEL[status]}
          </span>
        </span>
      ))}
    </div>
  );
}
