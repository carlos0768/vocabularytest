'use client';

import { useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, Ref, WheelEvent as ReactWheelEvent } from 'react';
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
  return Array.from({ length: 160 }, () => ({
    x: random() * 2800 - 1400,
    y: random() * 2800 - 1400,
    r: random() * 2.6 + 0.8,
    o: random() * 0.5 + 0.15,
  }));
})();

type Transform = { scale: number; x: number; y: number };

const MIN_SCALE = 0.45;
const MAX_SCALE = 6;
/** 初期倍率。開いた直後から文字が読める程度に寄せておく */
const INITIAL_SCALE = 2.4;
/** これ未満のときはラベルを出さない (小さすぎて潰れるため) */
const SUB_LABEL_MIN_SCALE = 1.5;
const UNIT_LABEL_MIN_SCALE = 0.9;
/** この距離(px)を超えて動いたらタップではなくドラッグとみなす */
const TAP_SLOP_PX = 6;

/** 詳細パネルから地図を操作するためのハンドル */
export type GrammarMapHandle = {
  /** 指定ノードを画面中央に寄せる */
  focusNode: (nodeId: string) => void;
};

export function GrammarMapGraph({
  ref,
  nodes,
  selectedId,
  onSelect,
}: {
  ref?: Ref<GrammarMapHandle>;
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
    return { percent: total > 0 ? Math.round((mastered / total) * 100) : 0 };
  }, [nodes]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [transform, setTransform] = useState<Transform>({ scale: INITIAL_SCALE, x: 0, y: 0 });

  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  // 押し始めたノード。指を動かさずに離せばタップとして選択する
  const pressedNodeRef = useRef<string | null>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);

  const { viewBox } = layout;

  // 画面px -> viewBox単位の換算。viewBox全体が収まるように縮小表示されているので、
  // その縮尺を測らないとドラッグ量と指の動きがズレる。
  const unitsPerPixel = useCallback(() => {
    const element = svgRef.current;
    if (!element) return 1;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return 1;
    return Math.max(viewBox.width / rect.width, viewBox.height / rect.height);
  }, [viewBox.width, viewBox.height]);

  // 画面中央を保ったまま拡大縮小する
  const applyScale = useCallback((nextScale: number) => {
    setTransform((prev) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
      const ratio = scale / prev.scale;
      return { scale, x: prev.x * ratio, y: prev.y * ratio };
    });
  }, []);

  const handlePointerDown = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      pinchRef.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: transform.scale };
      dragRef.current = null;
      pressedNodeRef.current = null;
      return;
    }
    if (pointersRef.current.size > 2) return;

    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: transform.x,
      originY: transform.y,
      moved: false,
    };
  }, [transform.scale, transform.x, transform.y]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    // 2本指: ピンチで拡大縮小
    const pinch = pinchRef.current;
    if (pinch && pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.distance > 0) applyScale(pinch.scale * (distance / pinch.distance));
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) > TAP_SLOP_PX) drag.moved = true;
    if (!drag.moved) return;

    const perPixel = unitsPerPixel();
    setTransform((prev) => ({
      ...prev,
      x: drag.originX + dx * perPixel,
      y: drag.originY + dy * perPixel,
    }));
  }, [applyScale, unitsPerPixel]);

  const handlePointerUp = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;

    const drag = dragRef.current;
    const pressed = pressedNodeRef.current;
    dragRef.current = null;
    pressedNodeRef.current = null;

    // 指を動かしていなければタップ。ノード上なら選択、背景なら選択解除。
    // (click に頼るとポインタキャプチャやSVGの重なりで拾えないことがあるため
    //  pointerdown/pointerup の対で判定する)
    if (drag && !drag.moved) onSelect(pressed);
  }, [onSelect]);

  const handlePointerCancel = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    pointersRef.current.delete(event.pointerId);
    pinchRef.current = null;
    dragRef.current = null;
    pressedNodeRef.current = null;
  }, []);

  const handleWheel = useCallback((event: ReactWheelEvent<SVGSVGElement>) => {
    applyScale(transform.scale * (event.deltaY < 0 ? 1.15 : 0.87));
  }, [applyScale, transform.scale]);

  const nodeById = useMemo(() => {
    const map = new Map<string, GrammarLayoutNode>();
    for (const node of layout.nodes) map.set(node.id, node);
    return map;
  }, [layout]);

  // 外周の小単元は初期表示だと画面外にあるため、詳細パネルから選んだノードは
  // 地図側を動かして中心に持ってくる (指でタップした場合は動かさない)。
  const focusNode = useCallback((nodeId: string) => {
    const target = nodeById.get(nodeId);
    if (!target) return;
    setTransform((prev) => {
      const scale = Math.max(prev.scale, INITIAL_SCALE);
      // s*p + t = 0 となる t が、そのノードを画面中央に置く平行移動
      return { scale, x: -target.x * scale, y: -target.y * scale };
    });
  }, [nodeById]);

  useImperativeHandle(ref, () => ({ focusNode }), [focusNode]);

  const showSubLabels = transform.scale >= SUB_LABEL_MIN_SCALE;
  const showUnitLabels = transform.scale >= UNIT_LABEL_MIN_SCALE;

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#05070d]">
      <svg
        ref={svgRef}
        role="img"
        aria-label="文法マップ"
        className="h-full w-full touch-none select-none"
        viewBox={`${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onWheel={handleWheel}
        style={{ cursor: 'grab' }}
      >
        <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}>
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
                strokeWidth={active ? 4 : 2.5}
                opacity={active ? 0.85 : 0.6}
              />
            );
          })}

          {/* ノード */}
          {layout.nodes.map((node) => {
            if (node.id === GRAMMAR_HUB_ID) {
              return (
                <g key={node.id} onPointerDown={() => { pressedNodeRef.current = null; }}>
                  <circle cx={node.x} cy={node.y} r={node.r} fill="#f7f3ea" stroke="#ffffff" strokeWidth={4} />
                  <text x={node.x} y={node.y - 2} textAnchor="middle" fontSize={26} fontWeight={800} fill="#05070d">
                    {overall.percent}%
                  </text>
                  <text x={node.x} y={node.y + 20} textAnchor="middle" fontSize={14} fill="#3b4256">
                    全体
                  </text>
                </g>
              );
            }

            const stats = statsById.get(node.id);
            const status: GrammarMapStatus = stats?.status ?? 'empty';
            const isUnit = node.kind === 'unit';
            const selected = selectedId === node.id;
            const showLabel = isUnit ? showUnitLabels : showSubLabels;
            const labelLines = wrapGrammarLabel(stats?.label ?? node.id, isUnit ? 7 : 9, 2);
            const placement = grammarLabelPlacement(node);
            const firstLineDy = -(labelLines.length - 1) * (isUnit ? 11 : 9);

            return (
              <g
                key={node.id}
                style={{ cursor: 'pointer' }}
                onPointerDown={() => { pressedNodeRef.current = node.id; }}
                aria-label={stats?.label}
              >
                {selected && (
                  <circle cx={node.x} cy={node.y} r={node.r + 11} fill="none" stroke="#ffd35c" strokeWidth={5} />
                )}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.r}
                  fill={STATUS_FILL[status]}
                  stroke={STATUS_STROKE[status]}
                  strokeWidth={isUnit ? 5 : 4}
                />
                {/* 指で押せるように、当たり判定は見た目より少し大きくとる */}
                <circle cx={node.x} cy={node.y} r={node.r + 10} fill="transparent" />
                {stats && stats.total > 0 && (
                  <text
                    x={node.x}
                    y={node.y + 7}
                    textAnchor="middle"
                    fontSize={isUnit ? 21 : 18}
                    fontWeight={800}
                    fill={status === 'untouched' ? '#9fc4ff' : '#ffffff'}
                    pointerEvents="none"
                  >
                    {stats.mastered}/{stats.total}
                  </text>
                )}
                {showLabel && (
                  <g
                    transform={`translate(${placement.x} ${placement.y}) rotate(${placement.rotate})`}
                    pointerEvents="none"
                  >
                    {labelLines.map((line, index) => (
                      <text
                        key={index}
                        x={0}
                        y={firstLineDy + index * (isUnit ? 22 : 19)}
                        textAnchor={placement.anchor}
                        dominantBaseline="middle"
                        fontSize={isUnit ? 21 : 17}
                        fontWeight={isUnit ? 700 : 500}
                        fill={status === 'empty' ? '#8b93a6' : '#ffffff'}
                      >
                        {line}
                      </text>
                    ))}
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* ズーム操作 */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => applyScale(transform.scale * 1.35)}
          aria-label="拡大"
          className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-white/30 bg-black/60 text-xl font-bold text-white backdrop-blur"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => applyScale(transform.scale * 0.74)}
          aria-label="縮小"
          className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-white/30 bg-black/60 text-xl font-bold text-white backdrop-blur"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => setTransform({ scale: MIN_SCALE, x: 0, y: 0 })}
          aria-label="全体を表示"
          className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-white/30 bg-black/60 text-[9px] font-bold leading-tight text-white backdrop-blur"
        >
          全体
        </button>
        <button
          type="button"
          onClick={() => setTransform({ scale: INITIAL_SCALE, x: 0, y: 0 })}
          aria-label="中心に戻す"
          className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-white/30 bg-black/60 text-[9px] font-bold leading-tight text-white backdrop-blur"
        >
          中心
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
