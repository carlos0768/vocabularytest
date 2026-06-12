/**
 * Frosted cover for the status-bar / camera notch area (env(safe-area-inset-top)).
 * Pages render edge-to-edge (viewport-fit=cover + black-translucent status bar),
 * so scrolled content would otherwise show raw behind the notch. Height is 0 on
 * devices without a top inset, making this a no-op there.
 */
export function StatusBarCover() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[9990]"
      style={{
        height: 'env(safe-area-inset-top, 0px)',
        background: 'color-mix(in srgb, var(--color-background) 82%, transparent)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
      }}
    />
  );
}
