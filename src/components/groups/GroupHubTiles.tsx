'use client';

/**
 * グループのハブ。ランキング / 単語帳 / 対戦 / 単語一覧 の4枚を 2×2 で置き、
 * 画面の高さいっぱいに広げる（縦一列に積まない）。各タイルは背景に大きな
 * アイコンを透かしで敷き、ライブの数値を1行だけ添える。
 *
 * 面はグラデーションだけで作る。以前は斜めストライプ / 水玉を薄く重ねて
 * いたが、文字とアイコンに干渉して読みにくかったので敷かない。
 */

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { triggerHaptic } from '@/lib/haptics';

export type GroupHubTile = {
  key: string;
  href: string;
  label: string;
  icon: string;
  /** タイル内に出す一言（順位・冊数など）。 */
  detail: string;
  /** 面のグラデーション。単色だと4枚が板に見えるので必ず2色以上で作る。 */
  background: string;
  /** 明るい面では文字を黒(ink)にする。 */
  foreground: 'light' | 'dark';
};

export function buildGroupHubTiles(options: {
  groupId: string;
  myRank: number | null;
  myQuizCount: number;
  bookCount: number;
  memberCount: number;
  wordCount: number;
}): GroupHubTile[] {
  const base = `/groups/${encodeURIComponent(options.groupId)}`;
  return [
    {
      key: 'ranking',
      href: `${base}/ranking`,
      label: 'ランキング',
      icon: 'emoji_events',
      detail: options.myRank
        ? `あなた ${options.myRank}位 · 今週${options.myQuizCount}問`
        : '今週の記録はまだ',
      background: 'linear-gradient(145deg, #FFDE59 0%, #FFC800 45%, #F0A500 100%)',
      foreground: 'dark',
    },
    {
      key: 'bookshelf',
      href: `${base}/bookshelf`,
      label: '単語帳',
      icon: 'auto_stories',
      detail: options.bookCount > 0 ? `${options.bookCount}冊を共有中` : 'まだ空っぽ',
      background: 'linear-gradient(145deg, #FFB259 0%, #F5A623 50%, #DC6B1E 100%)',
      foreground: 'dark',
    },
    {
      key: 'battle',
      href: `${base}/battle`,
      label: '対戦',
      icon: 'swords',
      detail: options.memberCount > 1 ? `メンバー${options.memberCount}人と早押し` : '相手を待とう',
      background: 'linear-gradient(145deg, #34B26C 0%, #15803d 55%, #0C5127 100%)',
      foreground: 'light',
    },
    {
      key: 'words',
      href: `${base}/words`,
      label: '単語一覧',
      icon: 'list_alt',
      detail: options.wordCount > 0 ? `${options.wordCount}語` : 'まだ単語がない',
      background: 'linear-gradient(145deg, #56A6E8 0%, #3373B3 55%, #1E4A78 100%)',
      foreground: 'light',
    },
  ];
}

export function GroupHubTiles({ tiles }: { tiles: GroupHubTile[] }) {
  return (
    // 4枚が正方形寄りに収まる高さ。画面が高いときに間延びしないよう上限を切る。
    // 上に今週の上位3人が乗るぶん、1画面に収まるよう少しだけ低くしている。
    <div className="grid h-[min(50dvh,400px)] min-h-[240px] w-full grid-cols-2 grid-rows-2 gap-2.5">
      {tiles.map((tile) => {
        const ink = tile.foreground === 'dark';
        // 面の色はテーマで変わらないので、文字色もトークンではなく固定値にする
        //（ダークで --solid-ink が明色に反転すると黄色の面で読めなくなる）。
        const text = ink ? '#1a1a1a' : '#fff';
        return (
          <Link
            key={tile.key}
            href={tile.href}
            onClick={() => triggerHaptic()}
            className="relative flex flex-col justify-between overflow-hidden rounded-[18px] border-2 border-[var(--solid-ink)] p-3.5 shadow-[3px_4px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-[2px_3px_0_var(--solid-ink)]"
            style={{ background: tile.background, color: text }}
          >
            {/* 上端のハイライトで「板」ではなく面に見せる */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-1/2"
              style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0))' }}
            />
            {/* 背景の透かしアイコン。面に表情を出すための装飾なので読み上げ対象外 */}
            <Icon
              name={tile.icon}
              size={96}
              filled
              aria-hidden
              className="pointer-events-none absolute -bottom-5 -right-4 opacity-[0.18]"
            />
            <span
              className="flex h-9 w-9 items-center justify-center rounded-[11px] border-2"
              style={{
                borderColor: ink ? '#1a1a1a' : 'rgba(255,255,255,0.7)',
                background: ink ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.22)',
              }}
            >
              <Icon name={tile.icon} size={20} />
            </span>
            <span className="relative min-w-0">
              <span className="block font-display text-[17px] font-black leading-tight">
                {tile.label}
              </span>
              <span
                className="mt-0.5 block truncate font-mono text-[10px] font-bold"
                style={{ opacity: 0.85 }}
              >
                {tile.detail}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
