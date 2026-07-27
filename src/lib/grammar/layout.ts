// 文法マップのノード配置。
//
// 中心のハブから26の大単元が放射状に伸び、その外周に76の小単元が並ぶ星図型のレイアウト。
// 小単元を外周の1本のリング上に均等配置し、大単元は「自分の子の角度の平均」に置くことで、
// 枝が交差せず、隣の大単元と重ならないようにしている。
//
// 純粋関数なので描画側 (SVG) から独立してテストできる。

import { GRAMMAR_TAXONOMY } from './taxonomy';

export type GrammarLayoutNodeKind = 'hub' | 'unit' | 'sub';

export type GrammarLayoutNode = {
  id: string;
  kind: GrammarLayoutNodeKind;
  x: number;
  y: number;
  /** 描画半径 */
  r: number;
  /** ハブ以外は親のID */
  parentId: string | null;
  /** 中心から見た角度 (ラベルの逃がし方向に使う) */
  angle: number;
};

export type GrammarLayoutEdge = {
  from: string;
  to: string;
};

export type GrammarMapLayout = {
  nodes: GrammarLayoutNode[];
  edges: GrammarLayoutEdge[];
  viewBox: { minX: number; minY: number; width: number; height: number };
};

export const GRAMMAR_HUB_ID = 'hub';

// 配置パラメータ。小単元は76個あるので、重ならない外周半径を確保する。
const UNIT_RADIUS = 430;
const SUB_RADIUS = 900;
const HUB_SIZE = 46;
const UNIT_SIZE = 40;
const SUB_SIZE = 30;
/** 図全体の余白 (ラベルがはみ出す分) */
const PADDING = 150;

export function buildGrammarMapLayout(): GrammarMapLayout {
  const nodes: GrammarLayoutNode[] = [
    { id: GRAMMAR_HUB_ID, kind: 'hub', x: 0, y: 0, r: HUB_SIZE, parentId: null, angle: 0 },
  ];
  const edges: GrammarLayoutEdge[] = [];

  const totalSubUnits = GRAMMAR_TAXONOMY.reduce((sum, unit) => sum + unit.children.length, 0);
  let subIndex = 0;

  for (const unit of GRAMMAR_TAXONOMY) {
    const subAngles: number[] = [];

    for (const sub of unit.children) {
      // 12時方向から時計回りに、全小単元を外周へ均等配置する
      const angle = ((subIndex + 0.5) / totalSubUnits) * Math.PI * 2 - Math.PI / 2;
      subAngles.push(angle);
      nodes.push({
        id: sub.id,
        kind: 'sub',
        x: Math.cos(angle) * SUB_RADIUS,
        y: Math.sin(angle) * SUB_RADIUS,
        r: SUB_SIZE,
        parentId: unit.id,
        angle,
      });
      edges.push({ from: unit.id, to: sub.id });
      subIndex += 1;
    }

    // 大単元は自分の子の角度の中央に置く (子が無い場合は現在位置)
    const unitAngle = subAngles.length > 0
      ? subAngles.reduce((sum, angle) => sum + angle, 0) / subAngles.length
      : ((subIndex + 0.5) / totalSubUnits) * Math.PI * 2 - Math.PI / 2;

    nodes.push({
      id: unit.id,
      kind: 'unit',
      x: Math.cos(unitAngle) * UNIT_RADIUS,
      y: Math.sin(unitAngle) * UNIT_RADIUS,
      r: UNIT_SIZE,
      parentId: GRAMMAR_HUB_ID,
      angle: unitAngle,
    });
    edges.push({ from: GRAMMAR_HUB_ID, to: unit.id });
  }

  const extent = SUB_RADIUS + SUB_SIZE + PADDING;
  return {
    nodes,
    edges,
    viewBox: { minX: -extent, minY: -extent, width: extent * 2, height: extent * 2 },
  };
}

export type GrammarLabelPlacement = {
  x: number;
  y: number;
  /** SVGのrotate角度 (度)。0なら回転しない */
  rotate: number;
  anchor: 'start' | 'middle' | 'end';
};

/**
 * ラベルの置き方を決める。
 *
 * ノードは同心円上に並ぶので、ラベルを水平に置くと隣同士で必ず重なる
 * (特に外周の小単元は76個ある)。そこでラベルを半径方向に回転させ、
 * 中心から外向きへ逃がすことで、隣接ノードのラベルと干渉しないようにする。
 * 左半分はそのままだと上下逆さまになるため、180度回して右揃えにする。
 */
export function grammarLabelPlacement(node: GrammarLayoutNode): GrammarLabelPlacement {
  const gap = node.r + 12;
  const degrees = (node.angle * 180) / Math.PI;
  // 起点はどちら側でも「ノードの外側」。左半分は180度回すため、
  // 文字が外向きに伸びるよう anchor を end にする。
  const x = node.x + Math.cos(node.angle) * gap;
  const y = node.y + Math.sin(node.angle) * gap;

  return Math.cos(node.angle) < 0
    ? { x, y, rotate: degrees + 180, anchor: 'end' }
    : { x, y, rotate: degrees, anchor: 'start' };
}

/**
 * 長い日本語ラベルをSVG用に指定文字数で折り返す。
 * 最大行数を超える分は末尾を省略記号にする。
 */
export function wrapGrammarLabel(label: string, charsPerLine: number, maxLines: number): string[] {
  if (charsPerLine <= 0 || maxLines <= 0) return [];
  const lines: string[] = [];
  for (let i = 0; i < label.length; i += charsPerLine) {
    lines.push(label.slice(i, i + charsPerLine));
    if (lines.length === maxLines) break;
  }
  const consumed = lines.length * charsPerLine;
  if (consumed < label.length && lines.length > 0) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = `${last.slice(0, Math.max(0, charsPerLine - 1))}…`;
  }
  return lines;
}
