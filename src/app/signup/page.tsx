'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { SolidPanel } from '@/components/redesign/SolidPage';

const GOALS = [
  { k: 'eiken', label: '英検対策', hue: 14 },
  { k: 'toeic', label: 'TOEIC', hue: 240, active: true },
  { k: 'school', label: '学校の勉強', hue: 130 },
  { k: 'travel', label: '旅行・趣味', hue: 50 },
];

export default function SignupPage() {
  const router = useRouter();

  return (
    <div
      className="relative flex min-h-screen flex-col bg-[var(--color-background)] pt-3 font-[var(--font-body)]"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-[14px] pt-1">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex h-8 w-8 items-center justify-center bg-transparent text-[var(--solid-ink)]"
          style={{ border: 'none', padding: 0 }}
        >
          <Icon name="chevron_left" size={18} />
        </button>
        <div className="flex-1" />
        {/* Progress */}
        <div className="mr-1.5 flex items-center gap-1">
          <span className="font-mono text-[10px] font-bold tabular-nums text-[var(--color-muted)]">
            2/3
          </span>
          <div className="flex gap-[3px]">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-1 w-[18px] rounded-sm"
                style={{ background: i <= 2 ? 'var(--solid-ink)' : 'rgba(26,26,26,0.15)' }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Brand mini */}
      <div className="px-6 pt-3 text-center">
        <div className="inline-block font-display text-[22px] font-black leading-none tracking-[0.1em] text-[var(--solid-ink)]">
          MERKEN
          <span
            className="ml-[3px] inline-block h-1 w-1 bg-[var(--color-accent)]"
            style={{ transform: 'translateY(-7px)' }}
          />
        </div>
      </div>

      {/* Title */}
      <div className="px-6 pb-3.5 pt-5">
        <div className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">
          STEP 02
        </div>
        <div className="mt-1 font-display text-[22px] font-extrabold leading-[1.25] tracking-[-0.02em] text-[var(--solid-ink)]">
          何のために<br />英単語を覚えますか？
        </div>
        <div className="mt-1.5 text-xs text-[var(--color-muted)]">
          目的に合わせて単語帳のおすすめが変わります。
        </div>
      </div>

      {/* Goal grid */}
      <div className="grid grid-cols-2 gap-2.5 px-6 pb-4">
        {GOALS.map((g) => {
          const isActive = !!g.active;
          return (
            <div key={g.k} className="relative">
              {/* Shadow layer */}
              <div
                className="absolute inset-0 rounded-xl"
                style={{
                  transform: 'translate(2.5px, 2.5px)',
                  background: isActive ? 'var(--color-accent)' : 'var(--solid-ink)',
                }}
              />
              {/* Card face */}
              <div
                className="relative flex min-h-[80px] flex-col justify-between gap-2 rounded-xl bg-white"
                style={{
                  padding: '18px 14px',
                  border: `${isActive ? 2 : 1.25}px solid ${isActive ? 'var(--color-accent)' : 'var(--solid-ink)'}`,
                }}
              >
                <div
                  className="h-8 w-8 rounded-lg"
                  style={{
                    background: `oklch(0.85 0.08 ${g.hue})`,
                    border: '1.25px solid var(--solid-ink)',
                  }}
                />
                <div className="flex items-center justify-between">
                  <span className="font-display text-sm font-bold text-[var(--solid-ink)]">
                    {g.label}
                  </span>
                  {isActive && (
                    <span
                      className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[var(--color-accent)] text-white"
                    >
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M4 12l5 5L20 6" />
                      </svg>
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Daily goal slider preview */}
      <div className="px-6 pb-3.5">
        <div className="mb-2 pl-0.5 font-mono text-[9px] font-bold tracking-[0.08em] text-[var(--color-muted)]">
          1日の目標
        </div>
        <SolidPanel className="!rounded-xl" faceClassName="!p-3.5">
          <div className="flex items-baseline gap-1">
            <span className="font-display text-[30px] font-extrabold tabular-nums leading-none text-[var(--solid-ink)]">
              20
            </span>
            <span className="text-xs font-bold text-[var(--solid-ink)]">語</span>
            <span className="ml-auto font-mono text-[11px] text-[var(--color-muted)]">約 5 分/日</span>
          </div>
          <div
            className="relative mt-3 rounded-full"
            style={{ height: 5, background: 'rgba(26,26,26,0.08)' }}
          >
            <div
              className="absolute inset-y-0 left-0 w-[40%] rounded-full bg-[var(--color-accent)]"
            />
            <div
              className="absolute rounded-full border-2 border-[var(--solid-ink)] bg-white"
              style={{
                width: 18,
                height: 18,
                left: '40%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                boxShadow: '1.5px 1.5px 0 var(--solid-ink)',
              }}
            />
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[9px] text-[var(--color-muted)]">
            <span>5</span><span>20</span><span>50</span><span>100</span>
          </div>
        </SolidPanel>
      </div>

      <div className="flex-1" />

      {/* Bottom CTAs */}
      <div
        className="px-6 pb-7 pt-3"
        style={{ background: 'linear-gradient(to top, var(--color-background) 70%, rgba(0,0,0,0))' }}
      >
        <div className="relative">
          <div
            className="absolute inset-0 rounded-xl bg-[var(--solid-ink)]"
            style={{ transform: 'translate(2.5px, 2.5px)' }}
          />
          <div
            className="relative flex items-center justify-center gap-1.5 rounded-xl border-[1.25px] border-[var(--solid-ink)] bg-[var(--solid-ink)] py-3.5 text-sm font-bold text-white font-[var(--font-body)]"
          >
            次へ
            <span className="inline-flex">
              <Icon name="chevron_right" size={15} />
            </span>
          </div>
        </div>
        <div className="mt-2.5 text-center text-[11px] text-[var(--color-muted)]">
          スキップ
        </div>
      </div>
    </div>
  );
}
