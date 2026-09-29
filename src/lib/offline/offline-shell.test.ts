import { describe, it } from 'node:test';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// public/sw-offline-shell.js is loaded by the service worker via importScripts(), so
// it must stay a plain import-free script. It exports its helpers on module.exports
// when required from Node.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const shell = require('../../../public/sw-offline-shell.js') as {
  OFFLINE_SHELL_SENTINEL: string;
  OFFLINE_SHELL_ROUTES: string[];
  WARM_INTERVAL_MS: number;
  WARM_RETRY_MS: number;
  shellTemplatePath(route: string): string;
  isSafeShellParam(value: unknown): boolean;
  matchShellRoute(pathname: unknown): { route: string; templatePath: string; param: string | null } | null;
  fillShellTemplate(html: unknown, param: string | null): string | null;
  extractStaticAssetPaths(text: unknown): string[];
  extractCssMediaPaths(css: unknown): string[];
  readBuildId(html: unknown): string | null;
  shouldWarmShell(meta: unknown, now: number): boolean;
  planStaticPrune(
    cachedPaths: string[],
    referencedPaths: string[],
    previouslyUnreferenced?: string[],
  ): { remove: string[]; pending: string[] };
  INSTANT_SHELL_MAX_AGE_MS: number;
  INSTANT_SHELL_OFF_MS: number;
  SHELL_BOOT_FAILED_MESSAGE: string;
  SHELL_BOOT_GUARD_SCRIPT: string;
  shouldServeShellInstantly(meta: unknown, instantOff: unknown, now: number): boolean;
  injectShellBootGuard(html: unknown): string | null;
};

const S = shell.OFFLINE_SHELL_SENTINEL;
const REPO_ROOT = path.resolve(__dirname, '../../..');

// Trimmed from a real `next build` document for /project/<sentinel>: the id appears
// in the RSC payload (canonical parts, route tree, params) and in hrefs.
const PROJECT_SHELL_HTML = [
  '<!DOCTYPE html><html lang="ja"><head>',
  '<link rel="stylesheet" href="/_next/static/chunks/0l_qnpjf6yn1q.css" data-precedence="next"/>',
  '<script src="/_next/static/chunks/turbopack-0xqqzr8b3skq_.js" async=""></script>',
  '</head><body><a href="/project/' + S + '/words">words</a>',
  '<script>self.__next_f.push([1,"0:{\\"P\\":null,\\"b\\":\\"o396l4GpI1D440thqwcpT\\",\\"c\\":[\\"\\",\\"project\\",\\"' + S + '\\"],',
  '\\"f\\":[[[\\"\\",{\\"children\\":[\\"project\\",{\\"children\\":[[\\"id\\",\\"' + S + '\\",\\"d\\",null]',
  '\\"params\\":{\\"id\\":\\"' + S + '\\"}"])</script>',
  '<script>self.__next_f.push([1,"1a:I[12345,[\\"static/chunks/2u9phauah5y8x.js\\",\\"static/chunks/0-0ppckrra1-j.js\\"],\\"default\\"]"])</script>',
  '</body></html>',
].join('');

describe('matchShellRoute', () => {
  it('matches static shell routes exactly', () => {
    assert.deepEqual(shell.matchShellRoute('/'), { route: '/', templatePath: '/', param: null });
    assert.deepEqual(shell.matchShellRoute('/projects/'), {
      route: '/projects',
      templatePath: '/projects',
      param: null,
    });
    assert.equal(shell.matchShellRoute('/projects/extra'), null);
  });

  it('extracts the id of dynamic routes and points at the sentinel template', () => {
    const id = '3f1c2a9e-8f0b-4c7d-9a61-2b7d7c1e5f00';
    assert.deepEqual(shell.matchShellRoute(`/project/${id}`), {
      route: '/project/:param',
      templatePath: `/project/${S}`,
      param: id,
    });
    assert.deepEqual(shell.matchShellRoute(`/project/${id}/words`), {
      route: '/project/:param/words',
      templatePath: `/project/${S}/words`,
      param: id,
    });
    assert.equal(shell.matchShellRoute('/quiz/all?review=1')?.param, 'all');
    assert.equal(shell.matchShellRoute('/voice-quiz/abc#x')?.templatePath, `/voice-quiz/${S}`);
  });

  it('keeps percent-encoded binder names as they appear in the URL', () => {
    assert.equal(shell.matchShellRoute('/binder/%E8%8B%B1%E6%A4%9C')?.param, '%E8%8B%B1%E6%A4%9C');
  });

  it('refuses ids that could break out of the document they are spliced into', () => {
    assert.equal(shell.matchShellRoute('/project/a"b'), null);
    assert.equal(shell.matchShellRoute('/project/<script>'), null);
    assert.equal(shell.matchShellRoute('/project/a\\b'), null);
    assert.equal(shell.matchShellRoute(`/project/${S}`), null);
  });

  it('does not cover routes that have nothing to render offline', () => {
    assert.equal(shell.matchShellRoute('/battle/abc'), null);
    assert.equal(shell.matchShellRoute('/share/abc'), null);
    assert.equal(shell.matchShellRoute('/api/projects'), null);
  });
});

describe('fillShellTemplate', () => {
  it('replaces every occurrence of the sentinel with the requested id', () => {
    const id = '3f1c2a9e-8f0b-4c7d-9a61-2b7d7c1e5f00';
    const html = shell.fillShellTemplate(PROJECT_SHELL_HTML, id);
    assert.ok(html);
    assert.ok(!html.includes(S));
    assert.ok(html.includes(`\\"params\\":{\\"id\\":\\"${id}\\"}`));
    assert.ok(html.includes(`[\\"id\\",\\"${id}\\",\\"d\\",null]`));
    assert.ok(html.includes(`href="/project/${id}/words"`));
  });

  it('returns static documents untouched and rejects unsafe ids', () => {
    assert.equal(shell.fillShellTemplate('<html></html>', null), '<html></html>');
    assert.equal(shell.fillShellTemplate(PROJECT_SHELL_HTML, '"><img>'), null);
  });
});

describe('extractStaticAssetPaths', () => {
  it('finds assets in tags and in the RSC payload, as absolute deduped paths', () => {
    assert.deepEqual(shell.extractStaticAssetPaths(PROJECT_SHELL_HTML).sort(), [
      '/_next/static/chunks/0-0ppckrra1-j.js',
      '/_next/static/chunks/0l_qnpjf6yn1q.css',
      '/_next/static/chunks/2u9phauah5y8x.js',
      '/_next/static/chunks/turbopack-0xqqzr8b3skq_.js',
    ]);
  });

  it('finds lazily loaded chunks named inside JS', () => {
    const js = 'e.l("static/chunks/1vrhxos8_ogkk.js"),e.l("static/chunks/1vrhxos8_ogkk.js")';
    assert.deepEqual(shell.extractStaticAssetPaths(js), ['/_next/static/chunks/1vrhxos8_ogkk.js']);
  });

  it('picks up preloaded fonts but not the relative unicode-range subsets in CSS', () => {
    const html = '<link rel="preload" href="/_next/static/media/ab-s.p.17y4.woff2" as="font"/>';
    assert.deepEqual(shell.extractStaticAssetPaths(html), ['/_next/static/media/ab-s.p.17y4.woff2']);
    assert.deepEqual(shell.extractStaticAssetPaths('@font-face{src:url(../media/x.woff2)}'), []);
  });

  it('ignores source maps and non-static paths', () => {
    assert.deepEqual(shell.extractStaticAssetPaths('"/_next/static/chunks/a.js.map" "/icon.png"'), []);
    assert.deepEqual(shell.extractStaticAssetPaths(undefined), []);
  });
});

describe('extractCssMediaPaths', () => {
  it('resolves the relative font URLs of a CSS chunk so runtime-cached fonts are not pruned', () => {
    const css =
      '@font-face{src:url(../media/4bebc6b2128cde3f-s.0b3otrtmgykt3.woff2)format("woff2")}' +
      "@font-face{src:url('../media/ab-s.p.1.woff2')}@font-face{src:url(../media/ab-s.p.1.woff2)}";
    assert.deepEqual(shell.extractCssMediaPaths(css), [
      '/_next/static/media/4bebc6b2128cde3f-s.0b3otrtmgykt3.woff2',
      '/_next/static/media/ab-s.p.1.woff2',
    ]);
    assert.deepEqual(shell.extractCssMediaPaths('body{color:red}'), []);
  });
});

describe('readBuildId', () => {
  it('reads the build id from the RSC payload', () => {
    assert.equal(shell.readBuildId(PROJECT_SHELL_HTML), 'o396l4GpI1D440thqwcpT');
    assert.equal(shell.readBuildId('<html></html>'), null);
  });
});

describe('shouldWarmShell', () => {
  const now = 1_800_000_000_000;

  it('warms when nothing was stored or the last refresh is old enough', () => {
    assert.equal(shell.shouldWarmShell(null, now), true);
    assert.equal(shell.shouldWarmShell({}, now), true);
    assert.equal(shell.shouldWarmShell({ warmedAt: now - shell.WARM_INTERVAL_MS }, now), true);
    assert.equal(shell.shouldWarmShell({ warmedAt: now + 1000 }, now), true);
  });

  it('skips while the last refresh is recent', () => {
    assert.equal(shell.shouldWarmShell({ warmedAt: now - 1000 }, now), false);
  });

  it('backs off after a failed refresh', () => {
    assert.equal(shell.shouldWarmShell({ failedAt: now - 1000 }, now), false);
    assert.equal(shell.shouldWarmShell({ failedAt: now - shell.WARM_RETRY_MS }, now), true);
  });
});

describe('planStaticPrune', () => {
  it('only deletes assets that stayed unreferenced across two refreshes', () => {
    const first = shell.planStaticPrune(['/a.js', '/b.js', '/c.js'], ['/a.js'], []);
    assert.deepEqual(first, { remove: [], pending: ['/b.js', '/c.js'] });

    // /c.js got referenced again (e.g. a new page cached from the same build).
    const second = shell.planStaticPrune(['/a.js', '/b.js', '/c.js', '/d.js'], ['/a.js', '/c.js'], first.pending);
    assert.deepEqual(second, { remove: ['/b.js'], pending: ['/d.js'] });
  });
});

describe('OFFLINE_SHELL_ROUTES', () => {
  it('only lists routes that exist as pages in src/app', () => {
    for (const route of shell.OFFLINE_SHELL_ROUTES) {
      const dir = route === '/' ? '' : route;
      const candidates = [
        dir.replace(':param', '[id]'),
        dir.replace(':param', '[projectId]'),
        dir.replace(':param', '[name]'),
      ].map((segment) => path.join(REPO_ROOT, 'src/app', segment, 'page.tsx'));
      assert.ok(candidates.some((file) => existsSync(file)), `no page for shell route ${route}`);
    }
  });

  it('are client pages, so the id never influences the server-rendered data', () => {
    for (const route of shell.OFFLINE_SHELL_ROUTES) {
      if (!route.includes(':param')) continue;
      const dir = route;
      const file = [
        dir.replace(':param', '[id]'),
        dir.replace(':param', '[projectId]'),
        dir.replace(':param', '[name]'),
      ]
        .map((segment) => path.join(REPO_ROOT, 'src/app', segment, 'page.tsx'))
        .find((candidate) => existsSync(candidate));
      assert.ok(file);
      assert.match(readFileSync(file, 'utf8'), /^'use client';/, `${route} must stay a client page`);
    }
  });
});

describe('service worker wiring', () => {
  const sw = readFileSync(path.join(REPO_ROOT, 'public/sw.js'), 'utf8');

  it('imports the shell helpers without letting a failed import kill the worker', () => {
    assert.match(sw, /try \{\s*importScripts\('\/sw-offline-shell\.js'\);\s*\} catch/);
  });

  it('serves the shell before the fallback viewer when a navigation fails offline', () => {
    const handler = sw.slice(sw.indexOf('async function navigationHandler'));
    const shellAt = handler.indexOf('offlineShellResponse(request)');
    const offlineAt = handler.indexOf('cache.match(OFFLINE_URL)');
    assert.ok(shellAt > 0 && offlineAt > shellAt);
  });

  it('probes the build id with a static shell route, so an idle refresh renders nothing', () => {
    const probe = sw.match(/const SHELL_BUILD_PROBE_PATH = '([^']+)'/)?.[1];
    assert.ok(probe && shell.OFFLINE_SHELL_ROUTES.includes(probe));
    const page = readFileSync(path.join(REPO_ROOT, 'src/app', probe, 'page.tsx'), 'utf8');
    assert.match(page, /^'use client';/);
  });

  it('keeps the shell cache out of activate cleanup', () => {
    assert.match(sw, /const CURRENT_CACHES = \[[^\]]*SHELL_CACHE[^\]]*\]/);
  });
});

describe('instant launch', () => {
  const NOW = 1_800_000_000_000;
  const fresh = { buildId: 'o396l4GpI1D440thqwcpT', warmedAt: NOW - 60_000 };

  it('serves a complete, recent shell ahead of the network', () => {
    assert.equal(shell.shouldServeShellInstantly(fresh, null, NOW), true);
  });

  it('goes to the network without a finished shell', () => {
    assert.equal(shell.shouldServeShellInstantly(null, null, NOW), false);
    assert.equal(shell.shouldServeShellInstantly({ warmedAt: NOW }, null, NOW), false);
    assert.equal(shell.shouldServeShellInstantly({ buildId: 'abcdef' }, null, NOW), false);
    // Only a failed refresh so far (no build id recorded).
    assert.equal(shell.shouldServeShellInstantly({ failedAt: NOW }, null, NOW), false);
  });

  it('goes to the network once a newer build is known to be live', () => {
    assert.equal(
      shell.shouldServeShellInstantly({ ...fresh, staleBuildId: 'newerBuildId1' }, null, NOW),
      false,
    );
  });

  it('does not serve a shell older than the max age', () => {
    const old = { ...fresh, warmedAt: NOW - shell.INSTANT_SHELL_MAX_AGE_MS - 1 };
    assert.equal(shell.shouldServeShellInstantly(old, null, NOW), false);
    assert.equal(shell.shouldServeShellInstantly({ ...fresh, warmedAt: NOW + 60_000 }, null, NOW), false);
  });

  it('stays off for a while after a shell failed to boot', () => {
    const justFailed = { disabledAt: NOW - 60_000 };
    assert.equal(shell.shouldServeShellInstantly(fresh, justFailed, NOW), false);
    const longAgo = { disabledAt: NOW - shell.INSTANT_SHELL_OFF_MS - 1 };
    assert.equal(shell.shouldServeShellInstantly(fresh, longAgo, NOW), true);
  });

  it('refills the shell right away once it is known to be behind', () => {
    const meta = { ...fresh, warmedAt: NOW - 1000, staleBuildId: 'newerBuildId1' };
    assert.equal(shell.shouldWarmShell(meta, NOW), true);
    // ...but still respects the retry back-off after a failed refill.
    assert.equal(shell.shouldWarmShell({ ...meta, failedAt: NOW - 1000 }, NOW), false);
  });

  it('puts the boot guard ahead of every chunk', () => {
    const html = shell.injectShellBootGuard(PROJECT_SHELL_HTML);
    assert.ok(html);
    const guardAt = html.indexOf(shell.SHELL_BOOT_GUARD_SCRIPT);
    assert.ok(guardAt > html.indexOf('<head>'));
    assert.ok(guardAt < html.indexOf('/_next/static/'));
    // The rest of the document is untouched.
    assert.equal(html.replace('<script>' + shell.SHELL_BOOT_GUARD_SCRIPT + '</script>', ''), PROJECT_SHELL_HTML);
  });

  it('refuses documents without a <head>', () => {
    assert.equal(shell.injectShellBootGuard('<html><body></body></html>'), null);
    assert.equal(shell.injectShellBootGuard('<html><header></header></html>'), null);
    assert.equal(shell.injectShellBootGuard(undefined), null);
  });

  it('the boot guard is plain script that cannot close its own <script> tag', () => {
    assert.doesNotThrow(() => new vm.Script(shell.SHELL_BOOT_GUARD_SCRIPT));
    assert.equal(/<\/script/i.test(shell.SHELL_BOOT_GUARD_SCRIPT), false);
  });
});

describe('shell boot guard', () => {
  type Listener = (event: unknown) => void;

  function runGuard(options: { controller?: boolean; recoveredAt?: number } = {}) {
    const listeners: Record<string, Listener[]> = {};
    const timers: Array<{ fn: () => void; ms: number }> = [];
    const posted: unknown[] = [];
    const storage = new Map<string, string>();
    if (options.recoveredAt) storage.set('merken_shell_recovered_at', String(options.recoveredAt));
    let reloads = 0;
    const window: Record<string, unknown> = {
      addEventListener: (type: string, fn: Listener) => {
        (listeners[type] ??= []).push(fn);
      },
    };
    const context = {
      window,
      location: { reload: () => { reloads += 1; } },
      document: {
        readyState: 'complete',
        visibilityState: 'visible',
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
      navigator: {
        serviceWorker: options.controller === false
          ? { controller: null }
          : {
            controller: {
              postMessage: (message: unknown, ports: Array<{ onmessage?: () => void }>) => {
                posted.push(message);
                ports[0]?.onmessage?.();
              },
            },
          },
      },
      sessionStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => { storage.set(key, value); },
      },
      MessageChannel: class {
        port1: { onmessage?: () => void } = {};
        port2 = this.port1;
      },
      setTimeout: (fn: () => void, ms: number) => { timers.push({ fn, ms }); },
      Date,
      String,
    };
    vm.runInNewContext(shell.SHELL_BOOT_GUARD_SCRIPT, context);
    return {
      window,
      emit: (type: string, event: unknown) => listeners[type]?.forEach((fn) => fn(event)),
      runTimers: () => timers.splice(0).forEach((timer) => timer.fn()),
      posted,
      reloads: () => reloads,
    };
  }

  it('drops the shell and reloads when a build asset fails to load', () => {
    const guard = runGuard();
    guard.emit('error', { target: { src: 'https://www.merken.jp/_next/static/chunks/abc.js' } });
    assert.equal(guard.posted.length, 1);
    assert.equal((guard.posted[0] as { type: string }).type, shell.SHELL_BOOT_FAILED_MESSAGE);
    assert.equal(guard.reloads(), 1);
    guard.runTimers();
    assert.equal(guard.reloads(), 1, 'reloads once even when the fallback timer fires too');
  });

  it('recovers from a chunk load rejection', () => {
    const guard = runGuard();
    guard.emit('unhandledrejection', { reason: { name: 'ChunkLoadError', message: 'Loading chunk 12 failed.' } });
    assert.equal(guard.posted.length, 1);
  });

  it('ignores unrelated errors', () => {
    const guard = runGuard();
    guard.emit('error', { target: { src: 'https://pagead2.googlesyndication.com/x.js' } });
    guard.emit('unhandledrejection', { reason: new Error('network down') });
    assert.equal(guard.posted.length, 0);
  });

  it('falls back when the app never hydrates, and not when it does', () => {
    const stuck = runGuard();
    stuck.runTimers();
    assert.equal(stuck.posted.length, 1);

    const booted = runGuard();
    booted.window.__merkenBooted = true;
    booted.runTimers();
    assert.equal(booted.posted.length, 0);
    assert.equal(booted.reloads(), 0);
  });

  it('never reloads twice in a row, so a broken page cannot loop', () => {
    const guard = runGuard({ recoveredAt: Date.now() - 1000 });
    guard.emit('error', { target: { src: '/_next/static/chunks/abc.js' } });
    assert.equal(guard.reloads(), 0);
  });

  it('still reloads without a controlling worker', () => {
    const guard = runGuard({ controller: false });
    guard.emit('error', { target: { href: '/_next/static/chunks/app.css' } });
    assert.equal(guard.reloads(), 1);
  });
});

describe('instant launch wiring', () => {
  const sw = readFileSync(path.join(REPO_ROOT, 'public/sw.js'), 'utf8');

  it('tries the shell before the network on navigations', () => {
    const handler = sw.slice(sw.indexOf('async function navigationHandler'));
    const instantAt = handler.indexOf('instantShellResponse(request)');
    const networkAt = handler.indexOf('fetch(request)');
    assert.ok(instantAt > 0 && networkAt > instantAt);
  });

  it('only serves documents that carry the boot guard', () => {
    const fn = sw.slice(sw.indexOf('async function instantShellResponse'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    assert.match(body, /shouldServeShellInstantly\(/);
    assert.match(body, /injectShellBootGuard\(/);
  });

  it('marks the page as booted once React has hydrated', () => {
    const registration = readFileSync(
      path.join(REPO_ROOT, 'src/components/pwa/ServiceWorkerRegistration.tsx'),
      'utf8',
    );
    assert.match(registration, /__merkenBooted = true/);
  });

  it('drops the shell on sign-out', () => {
    const auth = readFileSync(path.join(REPO_ROOT, 'src/hooks/use-auth.ts'), 'utf8');
    const reset = auth.slice(auth.indexOf('function resetClientScopedData'));
    assert.match(reset.slice(0, reset.indexOf('\n}\n')), /clearOfflineShellCache\(\)/);
  });
});
