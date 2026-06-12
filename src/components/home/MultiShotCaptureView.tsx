'use client';

import { Icon } from '@/components/ui/Icon';

export interface CaptureShotPreview {
  id: string;
  url: string;
}

interface MultiShotCaptureViewProps {
  shots: readonly CaptureShotPreview[];
  maxCount: number;
  /** While true the whole view is inert (processing overlay is shown above). */
  processing?: boolean;
  errorMsg?: string | null;
  /** Open the camera to take one more shot. */
  onShoot: () => void;
  /** Add shots from the photo library. */
  onAddFromLibrary: () => void;
  onRemove: (id: string) => void;
  /** Send all held shots to extraction. */
  onConfirm: () => void;
  /** Discard held shots and go back to the scan options sheet. */
  onClose: () => void;
}

const CORNER_STYLES: React.CSSProperties[] = [
  { top: 10, left: 10, borderTop: '2.5px solid var(--solid-ink)', borderLeft: '2.5px solid var(--solid-ink)', borderTopLeftRadius: 6 },
  { top: 10, right: 10, borderTop: '2.5px solid var(--solid-ink)', borderRight: '2.5px solid var(--solid-ink)', borderTopRightRadius: 6 },
  { bottom: 10, left: 10, borderBottom: '2.5px solid var(--solid-ink)', borderLeft: '2.5px solid var(--solid-ink)', borderBottomLeftRadius: 6 },
  { bottom: 10, right: 10, borderBottom: '2.5px solid var(--solid-ink)', borderRight: '2.5px solid var(--solid-ink)', borderBottomRightRadius: 6 },
];

/**
 * Multi-shot capture tray (solid UI).
 *
 * After each camera shot the photo is HELD here instead of being processed
 * immediately, so it is visually obvious that the user can (a) keep
 * shooting more pages, or (b) send the N shots they already have:
 * - shots pile into a numbered film strip with a trailing "+" tile
 * - the shutter (center) and the confirm-check with a count badge (right)
 *   sit side by side, equally reachable
 * - 0 shots: confirm is dimmed, the shutter pulses, the strip shows ghosts
 */
export function MultiShotCaptureView({
  shots,
  maxCount,
  processing,
  errorMsg,
  onShoot,
  onAddFromLibrary,
  onRemove,
  onConfirm,
  onClose,
}: MultiShotCaptureViewProps) {
  const count = shots.length;
  const latest = count > 0 ? shots[count - 1]! : null;
  const atCapacity = count >= maxCount;

  return (
    <div
      className="absolute inset-0 z-[105] flex flex-col"
      style={{
        background: '#faf7f1',
        fontFamily: 'var(--font-body)',
        paddingTop: 'max(14px, env(safe-area-inset-top))',
        paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
        pointerEvents: processing ? 'none' : 'auto',
        opacity: processing ? 0.55 : 1,
      }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border-[1.25px] border-[var(--solid-ink)] bg-white text-[var(--solid-ink)]"
        >
          <Icon name="close" size={16} />
        </button>
        <div className="text-center">
          <div className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
            MULTI SCAN
          </div>
          <div className="font-display text-[15px] font-extrabold leading-tight text-[var(--solid-ink)]">
            まとめて撮影
          </div>
        </div>
        <button
          type="button"
          onClick={onAddFromLibrary}
          disabled={atCapacity}
          className="inline-flex items-center gap-1 rounded-full border-[1.25px] border-[var(--solid-ink)] bg-white px-3 py-2 text-[11px] font-bold text-[var(--solid-ink)] disabled:opacity-40"
        >
          <Icon name="photo_library" size={14} />
          ライブラリ
        </button>
      </div>

      {/* Latest shot preview */}
      <div
        className="relative mx-4 mt-3 min-h-0 flex-1 overflow-hidden rounded-[16px] border-[1.5px] border-[var(--solid-ink)] bg-[var(--color-surface-secondary)]"
        style={{ boxShadow: '3px 3px 0 var(--solid-ink)' }}
      >
        {latest ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={latest.url}
            alt={`撮影した写真 ${count}`}
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border-[1.5px] border-dashed border-[var(--solid-ink)] text-[var(--solid-ink)]">
              <Icon name="photo_camera" size={26} />
            </div>
            <div className="text-[14px] font-bold text-[var(--solid-ink)]">最初の1枚を撮影しましょう</div>
            <div className="text-[11px] font-medium text-[var(--color-muted)]">
              ノートを枠いっぱいに写すと抽出の精度が上がります
            </div>
          </div>
        )}
        {CORNER_STYLES.map((style, i) => (
          <span key={i} className="pointer-events-none absolute h-[22px] w-[22px] opacity-60" style={style} />
        ))}
        {count > 0 && (
          <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-[var(--solid-ink)] px-2.5 py-1 text-[11px] font-bold text-white">
            <Icon name="photo_library" size={13} filled />
            {count}枚
          </div>
        )}
        <div
          className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-bold text-white"
          style={{ background: 'rgba(26,26,26,0.78)' }}
        >
          <Icon name="crop_free" size={14} />
          {count === 0 ? '枠に合わせて撮影' : atCapacity ? `上限${maxCount}枚に達しました` : '続けて次のページも撮れます'}
        </div>
      </div>

      {/* Film strip of held shots */}
      <div className="mt-3 px-4">
        {count === 0 ? (
          <div className="flex h-[78px] items-center gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-[58px] w-[44px] shrink-0 rounded-[8px] border-[1.25px] border-dashed"
                style={{ borderColor: 'rgba(26,26,26,0.25)' }}
              />
            ))}
            <span className="ml-1 text-[11px] font-medium text-[var(--color-muted)]">
              撮った写真がここに並びます
            </span>
          </div>
        ) : (
          <div className="flex h-[78px] items-center gap-2.5 overflow-x-auto pt-1.5">
            {shots.map((shot, i) => (
              <div key={shot.id} className="relative shrink-0 animate-fade-in-up">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={shot.url}
                  alt={`撮影した写真 ${i + 1}`}
                  className="h-[58px] w-[44px] rounded-[8px] border-[1.25px] border-[var(--solid-ink)] object-cover"
                  style={{ boxShadow: '1.5px 1.5px 0 var(--solid-ink)' }}
                />
                <span className="absolute bottom-1 left-1 rounded-[4px] bg-[var(--solid-ink)] px-1 font-mono text-[9px] font-bold leading-[14px] text-white">
                  {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(shot.id)}
                  aria-label={`写真 ${i + 1} を削除`}
                  className="absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border-[1.25px] border-[var(--solid-ink)] bg-white text-[var(--solid-ink)]"
                >
                  <Icon name="close" size={11} />
                </button>
              </div>
            ))}
            {!atCapacity && (
              <button
                type="button"
                onClick={onShoot}
                aria-label="さらに撮影"
                className="flex h-[58px] w-[44px] shrink-0 items-center justify-center rounded-[8px] border-[1.25px] border-dashed border-[var(--solid-ink)] text-[var(--solid-ink)]"
              >
                <Icon name="add" size={20} />
              </button>
            )}
          </div>
        )}
        {errorMsg && (
          <p className="mt-1 text-center text-[11px] font-medium text-[var(--color-error)]">{errorMsg}</p>
        )}
      </div>

      {/* Controls: (spacer) | shutter | confirm */}
      <div className="mt-2 grid grid-cols-3 items-center px-7">
        {/* Spacer keeps the shutter centered */}
        <div />

        {/* Shutter — always available: take more */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onShoot}
            disabled={atCapacity}
            aria-label="撮影"
            className="relative h-[72px] w-[72px] disabled:opacity-40"
          >
            {count === 0 && (
              <span className="absolute -inset-2 animate-ping rounded-full border-2 border-[var(--solid-ink)] opacity-30" />
            )}
            <span className="absolute inset-0 rounded-full bg-[var(--solid-ink)]" style={{ transform: 'translate(2.5px,2.5px)' }} />
            <span className="absolute inset-0 flex items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white">
              <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[var(--solid-ink)] text-white">
                <Icon name="photo_camera" size={26} />
              </span>
            </span>
          </button>
        </div>

        {/* Confirm — only solid when there is at least one shot */}
        <div className="flex flex-col items-end gap-1.5">
          <button
            type="button"
            onClick={onConfirm}
            disabled={count === 0}
            aria-label="この写真で次へ"
            className="relative h-[60px] w-[60px]"
          >
            {count > 0 && (
              <span className="absolute inset-0 rounded-full bg-[var(--solid-ink)]" style={{ transform: 'translate(2.5px,2.5px)' }} />
            )}
            <span
              className="absolute inset-0 flex items-center justify-center rounded-full border-[1.5px]"
              style={{
                background: count > 0 ? 'var(--color-accent)' : 'var(--color-surface-secondary)',
                borderColor: count > 0 ? 'var(--solid-ink)' : 'var(--color-border)',
                color: count > 0 ? '#fff' : 'var(--color-muted)',
              }}
            >
              <Icon name="check" size={26} />
            </span>
            {count > 0 && (
              <span className="absolute -right-1 -top-1 inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-full border-[1.25px] border-[var(--solid-ink)] bg-white px-1 font-mono text-[10px] font-bold text-[var(--solid-ink)]">
                {count}
              </span>
            )}
          </button>
          <span
            className="whitespace-nowrap text-[11px] font-bold"
            style={{ color: count > 0 ? 'var(--solid-ink)' : 'var(--color-muted)' }}
          >
            {count > 0 ? `${count}枚で次へ` : 'まず1枚撮影'}
          </span>
        </div>
      </div>
    </div>
  );
}
