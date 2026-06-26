/**
 * Lightweight haptic feedback helper (PWA-friendly, no native wrapper).
 *
 * - Android / Chromium browsers: uses the standard Vibration API
 *   (`navigator.vibrate`).
 * - iOS Safari: the Vibration API was never implemented, so we fall back to
 *   toggling a hidden `<input type="checkbox" switch>` via its `<label>`,
 *   which emits a subtle Taptic Engine pulse. This works on iOS 18–26.4;
 *   Apple patched the *programmatic* trigger in iOS 26.5, where it simply
 *   becomes a no-op (no errors, no behaviour change).
 *
 * All paths are guarded so the helper is a safe no-op on unsupported
 * platforms and during SSR.
 */

let iosHapticLabel: HTMLLabelElement | null = null;

function getIosHapticLabel(): HTMLLabelElement | null {
  if (typeof document === 'undefined') return null;
  if (iosHapticLabel?.isConnected) return iosHapticLabel;

  const label = document.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  // Keep it rendered (required for the haptic to fire) but invisible and
  // non-interactive so it never affects layout or pointer events.
  label.style.cssText =
    'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;z-index:-1;';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', ''); // Safari-specific switch control
  input.tabIndex = -1;
  label.appendChild(input);

  document.body.appendChild(label);
  iosHapticLabel = label;
  return label;
}

/**
 * Fire a brief haptic pulse. Must be called from within a user gesture
 * (e.g. a click/tap handler) to satisfy browser activation requirements.
 *
 * @param durationMs Vibration length for the Vibration API path (ms).
 */
export function triggerHaptic(durationMs = 12): void {
  if (typeof navigator === 'undefined') return;

  if (typeof navigator.vibrate === 'function') {
    navigator.vibrate(durationMs);
    return;
  }

  // iOS Safari fallback.
  try {
    getIosHapticLabel()?.click();
  } catch {
    /* no-op where unsupported */
  }
}
