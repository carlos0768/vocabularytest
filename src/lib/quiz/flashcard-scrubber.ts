/**
 * フラッシュカードの「点々スクラバー」。
 *
 * Instagram のドットインジケータのように薄い点を横一列に並べ、そこを長押し
 * （またはそのまま横に滑らせる）と、指の位置に対応するカードへ一気に飛ぶ。
 * 1枚ずつめくらずに山札の端から端まで爆速で流すための操作。
 *
 * ここに置くのは座標・カード番号・点の見た目の対応だけの純粋関数。DOM も
 * React も触らないので、点の出し方と飛び先の丸め方はテストで固定できる。
 *
 * 点は最大5個しか出さない。単語が5枚より多いときは現在地を中心にした窓が
 * スライドし、まだ先（手前）が残っている側の端の点だけを小さく描いて「この
 * 方向に続きがある」ことを示す。
 *
 * 一方、指の位置と飛び先の対応は点ではなくストリップの幅全体で決める:
 *   - 左端 = 1枚目
 *   - 右端 = 最後の1枚
 * 5個の点はあくまで現在地の目印で、送り幅を縛るものではない。
 */

/** 長押しと判定するまでの時間 (ms)。これ未満で離したらタップ扱い */
export const SCRUB_HOLD_MS = 220;

/**
 * 長押し待ちの最中でも、横にこれだけ動いたら即スクラブに入る。
 * 「長押ししてから滑らせる」も「いきなり滑らせる」も同じ操作として扱う。
 */
export const SCRUB_MOVE_THRESHOLD_PX = 8;

/** 同時に描く点の上限 */
export const SCRUB_VISIBLE_DOTS = 5;

/** 早送り中に振動させる刻み数。カード1枚ごとに震わせると細かすぎる */
export const SCRUB_HAPTIC_TICKS = 20;

export type ScrubDotKind =
  /** 今のカード */
  | 'active'
  /** 通常の点 */
  | 'normal'
  /** この先が省略されている側の端。小さく描く */
  | 'edge';

export type ScrubDot = {
  /** この点が指すカード番号（0起点） */
  index: number;
  kind: ScrubDotKind;
};

function clampIndex(value: number, total: number): number {
  if (!Number.isFinite(value) || total <= 0) return 0;
  return Math.min(Math.max(Math.round(value), 0), total - 1);
}

/**
 * 描く点の並び。現在地を中心に最大 visible 個の窓を切り出し、窓の外に
 * まだカードが残っている側の端だけ 'edge'（小さい点）にする。
 */
export function getScrubDots(
  total: number,
  currentIndex: number,
  visible: number = SCRUB_VISIBLE_DOTS,
): ScrubDot[] {
  if (!Number.isFinite(total) || total <= 0) return [];
  const size = Math.min(Math.floor(total), Math.max(1, Math.floor(visible)));
  const current = clampIndex(currentIndex, total);
  const start = Math.min(Math.max(current - Math.floor(size / 2), 0), total - size);

  return Array.from({ length: size }, (_, slot) => {
    const index = start + slot;
    const truncatedLeft = slot === 0 && start > 0;
    const truncatedRight = slot === size - 1 && start + size < total;
    const kind: ScrubDotKind =
      index === current ? 'active' : truncatedLeft || truncatedRight ? 'edge' : 'normal';
    return { index, kind };
  });
}

/** ストリップ上の相対位置 (0=左端, 1=右端) → カード番号。 */
export function getScrubIndexFromRatio(ratio: number, total: number): number {
  if (total <= 0) return 0;
  if (!Number.isFinite(ratio)) return 0;
  const bounded = Math.min(Math.max(ratio, 0), 1);
  return clampIndex(bounded * (total - 1), total);
}

/** 指の x 座標をストリップ矩形の中の相対位置に直す。幅0のときは左端扱い。 */
export function getScrubRatioFromPosition(clientX: number, left: number, width: number): number {
  if (!Number.isFinite(clientX) || !Number.isFinite(left) || !(width > 0)) return 0;
  return Math.min(Math.max((clientX - left) / width, 0), 1);
}

/**
 * 振動の刻み。山札を ticks 等分した何番目にいるかを返す。
 * これが変わったときだけ震わせれば、100枚流しても振動は ticks 回で済む。
 */
export function getScrubTick(
  index: number,
  total: number,
  ticks: number = SCRUB_HAPTIC_TICKS,
): number {
  if (total <= 1 || ticks <= 0) return 0;
  return Math.round((clampIndex(index, total) / (total - 1)) * ticks);
}
