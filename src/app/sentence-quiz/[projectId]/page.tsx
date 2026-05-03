'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';

const TOTAL = 15;
const CURRENT = 6;
const CORRECT_SO_FAR = 5;

const JA_PROMPT = 'チームはついにその問題を解決することができた。';
const PLACED = ['The', 'team', 'finally'];
const POOL = [
  { t: 'managed', used: false },
  { t: 'solve', used: false },
  { t: 'problem', used: false },
  { t: 'the', used: false },
  { t: 'to', used: false },
  { t: 'quickly', used: false, decoy: true },
  { t: 'the', used: false },
  { t: 'was', used: false, decoy: true },
];

const WORD_HINT = { english: 'manage', japanese: '〜を何とかやり遂げる' };

export default function SentenceQuizPage() {
  const router = useRouter();
  const allFilled = false;

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-background)] pt-[54px] font-[var(--font-body)]">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex h-8 w-8 items-center justify-center bg-transparent text-[var(--solid-ink)]"
        >
          <Icon name="close" size={18} />
        </button>
        <div className="flex flex-1 items-center gap-2">
          <div className="flex flex-1 gap-[2.5px]">
            {Array.from({ length: TOTAL }).map((_, i) => (
              <div
                key={i}
                className="h-1 flex-1 rounded-sm"
                style={{
                  background:
                    i < CURRENT
                      ? i < CORRECT_SO_FAR ? 'var(--color-success)' : 'var(--color-error)'
                      : i === CURRENT ? 'var(--solid-ink)' : 'rgba(26,26,26,0.1)',
                }}
              />
            ))}
          </div>
          <span className="font-mono text-[11px] font-bold tabular-nums text-[var(--solid-ink)]">
            {CURRENT + 1}<span className="text-[var(--color-muted)]">/{TOTAL}</span>
          </span>
        </div>
      </div>

      {/* Pro eyebrow */}
      <div className="flex items-center gap-1.5 px-5 pb-2">
        <div className="inline-flex items-center gap-[5px] rounded bg-[var(--solid-ink)] px-[7px] py-[3px] font-mono text-[9px] font-bold tracking-[0.08em] text-white">
          PRO
        </div>
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
          SENTENCE · WORD ORDER
        </div>
      </div>

      {/* Question body */}
      <div className="flex flex-1 flex-col gap-3.5 px-5 pt-1">
        {/* Target word hint */}
        <div className="flex items-baseline gap-2 rounded-xl border-[1.25px] border-[var(--solid-ink)] bg-white px-3.5 py-2.5 shadow-[2px_2px_0_var(--solid-ink)]">
          <div className="font-display text-[19px] font-extrabold tracking-[-0.01em] text-[var(--solid-ink)]">
            {WORD_HINT.english}
          </div>
          <div className="flex-1 text-xs text-[var(--color-muted)]">{WORD_HINT.japanese}</div>
          <Icon name="volume_up" size={14} className="text-[var(--color-muted)]" />
        </div>

        {/* JA prompt */}
        <div className="rounded-[10px] border border-[rgba(19,127,236,0.2)] bg-[rgba(19,127,236,0.06)] px-3.5 py-3">
          <div className="mb-1 font-mono text-[9px] font-bold tracking-[0.08em] text-[#137fec]">日本語 → 英語</div>
          <div className="text-sm font-medium leading-[1.55] text-[var(--solid-ink)]">{JA_PROMPT}</div>
        </div>

        {/* Answer area */}
        <div className="flex min-h-[88px] flex-wrap content-start gap-1.5 rounded-xl border-[1.5px] border-dashed border-[var(--solid-ink)] bg-white p-[10px_12px]">
          {PLACED.length === 0 && (
            <div className="self-center text-xs italic text-[var(--color-muted)]">
              下から単語を選んで英文を組み立てよう
            </div>
          )}
          {PLACED.map((t, i) => (
            <Token key={i} t={t} placed />
          ))}
          {PLACED.length > 0 && <div className="h-7 w-0.5 self-center bg-[var(--solid-ink)]" />}
        </div>

        {/* Token pool */}
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-[var(--color-border)] bg-[rgba(26,26,26,0.03)] p-[12px_10px]">
          {POOL.map((p, i) => (
            <Token key={i} t={p.t} disabled={PLACED.includes(p.t) && p.t !== 'the'} />
          ))}
        </div>

        {/* Type switcher */}
        <div className="mt-auto flex gap-1.5 pt-2">
          <TypeChip label="穴埋め" />
          <TypeChip label="複数穴埋め" />
          <TypeChip label="語順整序" active />
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="px-5 pb-7 pt-3">
        <div className="relative">
          <div
            className="absolute inset-0 rounded-xl"
            style={{ transform: 'translate(3px,3px)', background: allFilled ? 'var(--solid-ink)' : 'rgba(26,26,26,0.25)' }}
          />
          <div
            className="relative flex items-center justify-center gap-1.5 rounded-xl py-3.5 text-sm font-bold"
            style={{
              background: allFilled ? 'var(--solid-ink)' : '#fff',
              color: allFilled ? '#fff' : 'var(--color-muted)',
              border: `1.25px solid ${allFilled ? 'var(--solid-ink)' : 'var(--color-border)'}`,
            }}
          >
            回答する
          </div>
        </div>
      </div>
    </div>
  );
}

function Token({ t, placed = false, disabled = false }: { t: string; placed?: boolean; disabled?: boolean }) {
  return (
    <div
      className="inline-flex items-center rounded-lg border-[1.25px] px-[11px] py-[7px] text-sm font-semibold"
      style={{
        background: placed ? 'var(--solid-ink)' : disabled ? 'rgba(26,26,26,0.04)' : '#fff',
        color: placed ? '#fff' : disabled ? 'var(--color-muted)' : 'var(--solid-ink)',
        borderColor: disabled ? 'var(--color-border)' : 'var(--solid-ink)',
        boxShadow: placed || disabled ? 'none' : '1.5px 1.5px 0 var(--solid-ink)',
        opacity: disabled ? 0.5 : 1,
        textDecoration: disabled ? 'line-through' : 'none',
      }}
    >
      {t}
    </div>
  );
}

function TypeChip({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <div
      className="rounded-full px-2.5 py-[5px] font-mono text-[10px] font-bold tracking-[0.02em]"
      style={{
        background: active ? 'var(--solid-ink)' : '#fff',
        color: active ? '#fff' : 'var(--color-muted)',
        border: `1px solid ${active ? 'var(--solid-ink)' : 'var(--color-border)'}`,
      }}
    >
      {label}
    </div>
  );
}
