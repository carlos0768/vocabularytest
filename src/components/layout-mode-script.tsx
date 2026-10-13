/**
 * Blocking layout-mode bootstrap.
 *
 * `useLayoutMode()` can only write `<html data-layout>` after hydration, so a
 * tablet user would see the phone layout (no sidebar, bottom nav) flash on every
 * cold load. This runs synchronously in <head>, before the body is painted, and
 * sets the same attributes the store would have set.
 *
 * The decision itself lives in `src/lib/ui/layout-mode.ts`; the test there
 * runs this script against fake windows to keep the string and the function
 * in sync. The localStorage override is only compiled into non-production
 * builds (for Playwright / dev tools).
 */

import { layoutModeBootstrapScript } from '@/lib/ui/layout-mode';

const script = layoutModeBootstrapScript(process.env.NODE_ENV !== 'production');

export function LayoutModeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
