'use client';

import { motion } from 'framer-motion';
import { Icon } from '@/components/ui';
import { CONFIDENCE_LABELS, EIKEN_LEVEL_LABELS } from '@/lib/level-test/engine';
import type { LevelTestResultPayload } from '@/lib/level-test/result-code';
import { formatVocabSizeFromTheta, vocabSizeTextFor } from '@/lib/level-test/share';

// 診断結果カード。自分の結果画面(variant='own': 段階的リビール演出あり)と
// 共有された結果の閲覧ページ(variant='viewer': 即時表示)で共用する。

// レベルが上がるほど「昇格」感の出る色に寄せる(緑→青→紫→金)。
export const LEVEL_ACCENT_COLORS = [
  '#228B22',
  '#15803d',
  '#137FEC',
  '#2E66BF',
  '#664DB3',
  '#7C3AED',
  '#B8860B',
] as const;

function revealProps(variant: 'own' | 'viewer', order: number) {
  if (variant === 'viewer') {
    return { initial: false as const };
  }
  return {
    initial: { opacity: 0, y: 14, scale: order === 0 ? 0.8 : 1 },
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: { delay: 0.15 + order * 0.35, duration: 0.4, type: 'spring' as const, bounce: 0.35 },
  };
}

export function LevelTestResultCard({
  payload,
  variant,
}: {
  payload: LevelTestResultPayload;
  variant: 'own' | 'viewer';
}) {
  const grade = EIKEN_LEVEL_LABELS[payload.finalLevel] ?? EIKEN_LEVEL_LABELS[0];
  const accent = LEVEL_ACCENT_COLORS[payload.finalLevel] ?? LEVEL_ACCENT_COLORS[0];
  const vocab = vocabSizeTextFor(payload);

  // v2(ベイズ推定)のみ: 推定範囲と判定の確かさ。v1の旧共有URLは従来表示のまま。
  const hasEstimate = payload.ability !== undefined
    && payload.lowerLevel !== undefined
    && payload.upperLevel !== undefined
    && payload.confidence !== undefined;
  const rangeText = hasEstimate && payload.lowerLevel !== payload.upperLevel
    ? `${EIKEN_LEVEL_LABELS[payload.lowerLevel!]}〜${(EIKEN_LEVEL_LABELS[payload.upperLevel!] ?? '').replace('英検', '')}`
    : null;
  const vocabRangeText = hasEstimate
    && payload.lowerAbility !== undefined
    && payload.upperAbility !== undefined
    && payload.lowerAbility < payload.upperAbility
    ? `約${formatVocabSizeFromTheta(payload.lowerAbility)}〜${formatVocabSizeFromTheta(payload.upperAbility)}語`
    : null;

  return (
    <div className="w-full rounded-[20px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] p-6 shadow-[4px_4px_0_var(--solid-ink)]">
      <div className="text-center">
        <div className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
          {variant === 'own' ? 'YOUR VOCABULARY LEVEL' : 'VOCABULARY LEVEL'}
        </div>

        <motion.div {...revealProps(variant, 0)} className="mt-3">
          {payload.clearedMax && (
            <div className="mb-1 flex items-center justify-center gap-1 text-[13px] font-extrabold" style={{ color: '#B8860B' }}>
              <Icon name="crown" size={18} filled />
              最高レベル完全制覇
            </div>
          )}
          <div
            className="inline-block rounded-[16px] border-2 border-[var(--solid-ink)] px-6 py-3 font-display text-[34px] font-extrabold leading-tight text-white shadow-[3px_3px_0_var(--solid-ink)]"
            style={{ background: accent }}
          >
            {grade}
          </div>
          <div className="mt-1 font-display text-[14px] font-bold text-[var(--color-muted)]">レベル</div>
          {hasEstimate && (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-bold text-[var(--color-muted)]">
              {rangeText && <span>推定範囲: {rangeText}</span>}
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-0.5">
                判定の確かさ: {CONFIDENCE_LABELS[payload.confidence!]}
              </span>
            </div>
          )}
        </motion.div>

        <motion.div {...revealProps(variant, 1)} className="mt-4">
          <div className="inline-flex items-baseline gap-1 rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-background)] px-5 py-2">
            <span className="text-[12px] font-bold text-[var(--color-muted)]">推定語彙数</span>
            <span className="font-display text-[24px] font-extrabold text-[var(--solid-ink)]">{vocab}</span>
            <span className="text-[13px] font-bold text-[var(--solid-ink)]">語</span>
          </div>
          {vocabRangeText && (
            <div className="mt-1.5 text-[11px] font-bold text-[var(--color-muted)]">
              推定範囲 {vocabRangeText}
            </div>
          )}
          <div className="mt-2 text-[12px] font-bold text-[var(--color-muted)]">
            20問中{payload.correctTotal}問正解
          </div>
        </motion.div>
      </div>

      <motion.div {...revealProps(variant, 2)} className="mt-6">
        <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
          レベル別の正答
        </div>
        <div className="space-y-1.5">
          {EIKEN_LEVEL_LABELS.map((label, levelIndex) => {
            const asked = payload.askedByLevel[levelIndex] ?? 0;
            const correct = payload.correctByLevel[levelIndex] ?? 0;
            const attempted = asked > 0;
            const ratio = attempted ? correct / asked : 0;
            const isFinal = levelIndex === payload.finalLevel;
            return (
              <div
                key={label}
                className="flex items-center gap-2"
                style={{ opacity: attempted ? 1 : 0.35 }}
              >
                <div className="w-[72px] shrink-0 text-right text-[11px] font-extrabold text-[var(--solid-ink)]">
                  {label.replace('英検', '')}
                  {isFinal && <span style={{ color: accent }}> ●</span>}
                </div>
                <div className="h-3.5 flex-1 overflow-hidden rounded-full border border-[var(--solid-ink)] bg-[var(--color-background)]">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{
                      width: attempted ? `${Math.round(ratio * 100)}%` : 0,
                      background: LEVEL_ACCENT_COLORS[levelIndex],
                    }}
                  />
                </div>
                <div className="w-[42px] shrink-0 font-mono text-[11px] font-bold text-[var(--color-muted)]">
                  {attempted ? `${correct}/${asked}` : '—'}
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
