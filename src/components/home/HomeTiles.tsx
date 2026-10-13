'use client';

/**
 * ホームの正方形タイル (単語帳 / バインダー)。スマホの本棚 (横スクロール) と
 * タブレットのグリッドが同じタイルを使う。配色は thumbColor、アイコン画像が
 * あれば面に敷いて文字色を面の明るさに合わせて反転する。
 */

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { imageToneTextStyle, useImageTone } from '@/lib/ui/image-tone';
import { thumbColor } from '@/lib/ui/thumb-color';

export type HomeTileProject = {
  id: string;
  title: string;
  iconImage?: string;
  totalWords: number;
  masteredWords: number;
};

export function ProjectSquareTile({
  project,
  tourAnchor = false,
  onCardOpen,
  quizFrom = '/',
}: {
  project: HomeTileProject;
  tourAnchor?: boolean;
  /** Advances the guided tutorial when the wordbook card is tapped. */
  onCardOpen?: () => void;
  /** 再生ボタンから始めたクイズの戻り先 */
  quizFrom?: string;
}) {
  const bg = thumbColor(project.id);
  const hasWords = project.totalWords > 0;
  const masteredPct = hasWords ? Math.round((project.masteredWords / project.totalWords) * 100) : 0;
  // アイコン画像をそのまま面に使うので、明るい画像の上では文字を黒に反転する
  // （面と同系色だと題名が読めないため）。画像が無い面は配色が濃色なので白のまま。
  const tone = useImageTone(project.iconImage);
  const toneStyle = imageToneTextStyle(tone);
  const inkOnLight = tone === 'dark';
  return (
    <div className="relative">
      <Link
        href={`/project/${project.id}`}
        onClick={onCardOpen}
        className="relative flex aspect-square flex-col justify-between overflow-hidden rounded-[14px] border-2 border-[var(--solid-ink)] bg-cover bg-center p-3 shadow-[2px_3px_0_var(--solid-shadow)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-[1px_2px_0_var(--solid-shadow)]"
        style={{
          backgroundColor: bg,
          backgroundImage: project.iconImage ? `url(${project.iconImage})` : undefined,
          color: toneStyle.color,
        }}
      >
        <div
          className="absolute inset-y-0 left-0 w-[6px]"
          style={{ background: inkOnLight ? 'rgba(0,0,0,0.14)' : 'rgba(0,0,0,0.22)' }}
        />
        <div
          className="line-clamp-2 pl-1.5 font-display text-[13.5px] font-bold leading-snug"
          style={{ textShadow: toneStyle.textShadow }}
        >
          {project.title}
        </div>
        <div className="pl-1.5">
          <div className="flex items-baseline gap-0.5" style={{ textShadow: toneStyle.textShadow }}>
            <span className="font-display text-[19px] font-extrabold leading-none tabular-nums">{project.totalWords}</span>
            <span className="text-[10px] font-bold opacity-90">語</span>
          </div>
          {hasWords && (
            <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-[rgba(0,0,0,0.22)]">
              <div
                className="h-full"
                style={{
                  width: `${masteredPct}%`,
                  background: inkOnLight ? 'color-mix(in srgb, var(--solid-ink) 85%, transparent)' : 'rgba(255,255,255,0.92)',
                }}
              />
            </div>
          )}
        </div>
      </Link>
      {hasWords && (
        <Link
          href={`/quiz/${project.id}?from=${encodeURIComponent(quizFrom)}`}
          aria-label={`${project.title}のクイズを開始`}
          data-tour={tourAnchor ? 'quiz-start' : undefined}
          className="absolute bottom-2 right-2 flex h-[34px] w-[34px] items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-accent)] text-[var(--color-on-accent)] shadow-[2px_2px_0_var(--solid-shadow)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-[1px_1px_0_var(--solid-shadow)]"
        >
          <Icon name="play_arrow" size={18} filled />
        </Link>
      )}
    </div>
  );
}

// バインダー (フォルダ) タイル。ProjectSquareTile と同じシェル・配色 (thumbColor) で、
// キーは binder 名。単語帳タイルと見た目を揃える。
export function BinderSquareTile({ name, count, iconImage }: { name: string; count: number; iconImage?: string | null }) {
  const bg = thumbColor(name);
  const tone = useImageTone(iconImage);
  const toneStyle = imageToneTextStyle(tone);
  return (
    <Link
      href={`/binder/${encodeURIComponent(name)}`}
      className="relative flex aspect-square flex-col justify-between overflow-hidden rounded-[14px] border-2 border-[var(--solid-ink)] bg-cover bg-center p-3 shadow-[2px_3px_0_var(--solid-shadow)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-[1px_2px_0_var(--solid-shadow)]"
      style={{
        backgroundColor: bg,
        backgroundImage: iconImage ? `url(${iconImage})` : undefined,
        color: toneStyle.color,
      }}
    >
      <div
        className="absolute inset-y-0 left-0 w-[6px]"
        style={{ background: tone === 'dark' ? 'rgba(0,0,0,0.14)' : 'rgba(0,0,0,0.22)' }}
      />
      <div className="flex items-center gap-1 pl-1.5" style={{ textShadow: toneStyle.textShadow }}>
        <Icon name="folder" size={15} filled />
        <span className="font-mono text-[9.5px] font-bold tracking-[0.04em]">BINDER</span>
      </div>
      <div className="pl-1.5">
        <div
          className="line-clamp-2 font-display text-[13.5px] font-bold leading-snug"
          style={{ textShadow: toneStyle.textShadow }}
        >
          {name}
        </div>
        <div className="mt-1 font-mono text-[9px] tracking-[0.04em] opacity-90">{count}冊</div>
      </div>
    </Link>
  );
}
