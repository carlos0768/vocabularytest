'use client';

import dynamic from 'next/dynamic';
import { EVENTS, STATUS } from 'react-joyride';
import type { EventData, Options, Step, TooltipRenderProps } from 'react-joyride';
import { Icon } from '@/components/ui/Icon';

// react-joyride touches the DOM and must never render on the server. Load the
// component lazily on the client only; the module itself is import-safe (the
// EVENTS/STATUS constants below are plain objects), so those stay static.
const Joyride = dynamic(() => import('react-joyride').then((m) => m.Joyride), {
  ssr: false,
});

/** Re-export so callers build steps against a single, stable type. */
export type TourStep = Step;

const JOYRIDE_LOCALE = {
  back: '戻る',
  close: '閉じる',
  last: '完了',
  next: '次へ',
  skip: 'スキップ',
} as const;

// Module-level constant so the reference is stable across renders (a new object
// each render would make react-joyride re-initialise the tour).
const JOYRIDE_OPTIONS: Partial<Options> = {
  overlayColor: 'rgba(26,26,26,0.55)',
  // Non-dismissive backdrop — matches WelcomeOverlay (avoid accidental exits).
  overlayClickAction: false,
  // Open the tooltip immediately instead of requiring a beacon click first.
  skipBeacon: true,
  spotlightRadius: 14,
  spotlightPadding: 6,
  zIndex: 9999,
};

interface GuidedTourProps {
  run: boolean;
  steps: TourStep[];
  /** Called once when the tour ends (finished, skipped, or closed). */
  onFinish: () => void;
}

/**
 * Thin wrapper around react-joyride that renders MERKEN's "solid" design
 * language via a custom tooltip. `Joyride` is loaded with `ssr: false`, and the
 * caller only flips `run` to true on the client, so it never runs server-side.
 */
export function GuidedTour({ run, steps, onFinish }: GuidedTourProps) {
  if (!run || steps.length === 0) return null;

  const handleEvent = (data: EventData) => {
    const ended =
      data.type === EVENTS.TOUR_END
      || data.status === STATUS.FINISHED
      || data.status === STATUS.SKIPPED;
    if (ended) {
      onFinish();
    }
  };

  return (
    <Joyride
      run={run}
      steps={steps}
      continuous
      onEvent={handleEvent}
      locale={JOYRIDE_LOCALE}
      options={JOYRIDE_OPTIONS}
      tooltipComponent={MerkenTourTooltip}
    />
  );
}

function MerkenTourTooltip({
  index,
  isLastStep,
  size,
  step,
  backProps,
  closeProps,
  primaryProps,
  skipProps,
  tooltipProps,
}: TooltipRenderProps) {
  const showBack = index > 0;
  const showSkip = size > 1 && !isLastStep;
  const primaryLabel = isLastStep ? '完了' : '次へ';

  return (
    <div {...tooltipProps} className="relative w-[min(88vw,320px)]">
      {/* Hard-shadow plate (solid design language) */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-[16px] bg-[var(--solid-ink)]"
        style={{ transform: 'translate(3px, 3.5px)' }}
      />
      <div className="relative overflow-hidden rounded-[16px] border-2 border-[var(--solid-ink)] bg-white">
        <div className="px-4 pb-3.5 pt-3.5">
          <div className="flex items-start justify-between gap-2">
            {step.title ? (
              <h2 className="font-display text-[16px] font-extrabold leading-tight text-[var(--solid-ink)]">
                {step.title}
              </h2>
            ) : (
              <span />
            )}
            <button
              type="button"
              {...closeProps}
              className="-mr-1 -mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--color-muted)] transition-colors hover:text-[var(--solid-ink)]"
            >
              <Icon name="close" size={16} />
            </button>
          </div>

          {step.content ? (
            <div className="mt-1.5 text-[13px] font-medium leading-[1.6] text-[var(--color-ink-muted)]">
              {step.content}
            </div>
          ) : null}

          <div className="mt-4 flex items-center justify-between gap-3">
            {size > 1 ? (
              <span className="font-mono text-[11px] font-bold tabular-nums text-[var(--color-muted)]">
                {index + 1} / {size}
              </span>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              {showSkip ? (
                <button
                  type="button"
                  {...skipProps}
                  className="text-[12px] font-semibold text-[var(--color-muted)] underline-offset-2 hover:underline"
                >
                  スキップ
                </button>
              ) : null}
              {showBack ? (
                <button
                  type="button"
                  {...backProps}
                  className="inline-flex items-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3 py-1.5 text-[12px] font-bold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
                >
                  戻る
                </button>
              ) : null}
              <button
                type="button"
                {...primaryProps}
                className="relative inline-flex items-center gap-1 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-3.5 py-1.5 text-[12px] font-bold text-white transition-all duration-100 active:translate-x-px active:translate-y-px"
              >
                {primaryLabel}
                {!isLastStep ? <Icon name="arrow_forward" size={14} /> : null}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
