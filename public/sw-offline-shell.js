/**
 * MERKEN offline app shell — pure helpers shared by public/sw.js.
 *
 * WHY THIS FILE EXISTS
 * Offline, every in-app navigation turns into a full document load: Next.js falls
 * back to an MPA navigation when the RSC fetch fails, so the service worker gets a
 * navigation request for e.g. /project/<id>. The worker only ever cached documents
 * that happened to be loaded in full while online (usually just the launch URL), so
 * almost every tap ended on the plain /offline.html viewer instead of the real UI.
 *
 * The offline shell fixes that. While online, the worker fetches ONE document per
 * app route ("shell") plus every build asset it references, so the real UI — the
 * same React pages, reading the same IndexedDB — opens offline for any wordbook.
 *
 * Dynamic routes (/project/[id], /quiz/[projectId], ...) are fetched once with a
 * sentinel in place of the id. The app pages are client components that read their
 * data from IndexedDB, so the only place the id shows up in the server HTML is the
 * RSC payload (route tree, params) and a few hrefs. Offline, the worker replaces the
 * sentinel with the requested id and the page hydrates exactly as if the server had
 * rendered /project/<id>. Next.js reads the URL from location, so the address bar
 * and useSearchParams() stay correct.
 *
 * Deliberate constraints:
 *   - Plain ES2017, no imports: loaded via importScripts() in the worker and via
 *     require() from the unit tests (src/lib/offline/offline-shell.test.ts).
 *   - Only ids made of URL-safe characters are substituted, so the replacement can
 *     never break out of the JSON / HTML it is spliced into.
 */
(function (root) {
  'use strict';

  // Unique token that stands in for a dynamic route segment in shell documents.
  // Plain lowercase ASCII so it survives URL encoding, JSON and HTML unchanged.
  var OFFLINE_SHELL_SENTINEL = 'merken-offline-shell-param';

  // Routes whose real UI must open offline. `:param` marks a dynamic segment.
  // Keep to pages that render from IndexedDB / local state; pages that are purely
  // server data (shared wordbooks, battles, groups) have nothing to show offline.
  var OFFLINE_SHELL_ROUTES = [
    '/',
    '/projects',
    '/goal',
    '/stats',
    '/favorites',
    '/words',
    '/settings',
    '/profile',
    // Bottom-nav tabs whose content is server data. Offline they show their own
    // empty / error state inside the normal app chrome instead of the fallback page.
    '/shared',
    '/reels',
    '/project/:param',
    '/project/:param/words',
    '/quiz/:param',
    '/flashcard/:param',
    '/voice-quiz/:param',
    '/binder/:param',
    '/word/:param',
  ];

  // A dynamic segment value we are willing to splice into a shell document:
  // UUIDs, "all" / "favorites", and percent-encoded names (binders). None of these
  // characters can end a JSON string or an HTML attribute.
  var SAFE_PARAM_PATTERN = /^[A-Za-z0-9%._~-]{1,200}$/;

  // /_next/static assets referenced from HTML, CSS or JS. Turbopack writes chunk
  // paths as "static/chunks/<hash>.js" inside the RSC payload and inside the chunks
  // that lazy-load other chunks, so a regex over the text finds both.
  var STATIC_ASSET_PATTERN =
    /(?:\/_next\/)?static\/(?:chunks|media|css)\/[A-Za-z0-9_.~/%@[\]-]+?\.(?:js|css|woff2?|ttf|otf)(?![A-Za-z0-9_.~/%@[\]-])/g;

  // Next.js build id as embedded in the RSC payload of every document.
  var BUILD_ID_PATTERN = /\\?"b\\?":\\?"([A-Za-z0-9_-]{6,})\\?"/;

  function normalizePathname(pathname) {
    if (typeof pathname !== 'string' || pathname === '') return '/';
    var path = pathname.split('?')[0].split('#')[0];
    while (path.length > 1 && path.charAt(path.length - 1) === '/') {
      path = path.slice(0, -1);
    }
    return path === '' ? '/' : path;
  }

  function isDynamicShellRoute(route) {
    return route.indexOf(':param') !== -1;
  }

  /** The URL the worker fetches to build the shell for `route`. */
  function shellTemplatePath(route) {
    return route.replace(':param', OFFLINE_SHELL_SENTINEL);
  }

  function isSafeShellParam(value) {
    return (
      typeof value === 'string' &&
      SAFE_PARAM_PATTERN.test(value) &&
      value.indexOf(OFFLINE_SHELL_SENTINEL) === -1
    );
  }

  /**
   * Map a requested pathname to the shell that can render it.
   * Returns { route, templatePath, param } or null when no shell applies.
   */
  function matchShellRoute(pathname) {
    var path = normalizePathname(pathname);
    var segments = path.split('/').filter(Boolean);

    for (var i = 0; i < OFFLINE_SHELL_ROUTES.length; i++) {
      var route = OFFLINE_SHELL_ROUTES[i];
      var routeSegments = route.split('/').filter(Boolean);
      if (routeSegments.length !== segments.length) continue;

      var param = null;
      var matched = true;
      for (var j = 0; j < routeSegments.length; j++) {
        if (routeSegments[j] === ':param') {
          param = segments[j];
        } else if (routeSegments[j] !== segments[j]) {
          matched = false;
          break;
        }
      }
      if (!matched) continue;
      if (param !== null && !isSafeShellParam(param)) return null;
      return { route: route, templatePath: shellTemplatePath(route), param: param };
    }
    return null;
  }

  /** Put the requested id into a shell document built with the sentinel. */
  function fillShellTemplate(html, param) {
    if (typeof html !== 'string') return '';
    if (param === null || param === undefined) return html;
    if (!isSafeShellParam(param)) return null;
    return html.split(OFFLINE_SHELL_SENTINEL).join(param);
  }

  /** Every /_next/static asset referenced by `text`, as absolute paths (deduped). */
  function extractStaticAssetPaths(text) {
    if (typeof text !== 'string' || text === '') return [];
    var matches = text.match(STATIC_ASSET_PATTERN) || [];
    var seen = {};
    var out = [];
    for (var i = 0; i < matches.length; i++) {
      var path = matches[i].replace(/^\/_next\//, '');
      path = '/_next/' + path;
      if (!seen[path]) {
        seen[path] = true;
        out.push(path);
      }
    }
    return out;
  }

  // Font files named by a Next.js CSS chunk, relative to /_next/static/chunks/.
  var CSS_MEDIA_PATTERN = /url\(\s*["']?\.\.\/media\/([A-Za-z0-9_.~-]+?\.(?:woff2?|ttf|otf))["']?\s*\)/g;

  /**
   * Font files referenced by a CSS chunk, as absolute paths. These are NOT
   * downloaded ahead of time (Noto Sans JP alone ships 100+ unicode-range files);
   * the ones a page actually uses are cached as they load. This list only keeps
   * those runtime-cached fonts from being pruned.
   */
  function extractCssMediaPaths(css) {
    if (typeof css !== 'string' || css === '') return [];
    var seen = {};
    var out = [];
    var match;
    CSS_MEDIA_PATTERN.lastIndex = 0;
    while ((match = CSS_MEDIA_PATTERN.exec(css)) !== null) {
      var path = '/_next/static/media/' + match[1];
      if (!seen[path]) {
        seen[path] = true;
        out.push(path);
      }
    }
    return out;
  }

  function readBuildId(html) {
    if (typeof html !== 'string') return null;
    var match = html.match(BUILD_ID_PATTERN);
    return match ? match[1] : null;
  }

  // Refresh the shell at most this often. Each refresh re-fetches one small
  // document per route; build assets are only downloaded when not cached yet.
  var WARM_INTERVAL_MS = 6 * 60 * 60 * 1000;
  // After a failed refresh, wait this long before trying again.
  var WARM_RETRY_MS = 30 * 60 * 1000;

  /** Whether a shell refresh is due, given the stored metadata. */
  function shouldWarmShell(meta, now) {
    if (!meta || typeof meta !== 'object') return true;
    if (typeof meta.failedAt === 'number' && now - meta.failedAt < WARM_RETRY_MS) {
      return false;
    }
    // A newer build went live (seen by the instant-launch probe): refill now.
    if (typeof meta.staleBuildId === 'string' && meta.staleBuildId !== '') return true;
    if (typeof meta.warmedAt !== 'number') return true;
    if (now < meta.warmedAt) return true; // clock went backwards
    return now - meta.warmedAt >= WARM_INTERVAL_MS;
  }

  /**
   * Two-generation pruning of the build-asset cache. An asset is only deleted once
   * it has been unreferenced by every cached document for two refreshes in a row,
   * so a tab still running the previous build keeps its lazily loaded chunks.
   * Returns { remove, pending }: delete `remove` now, remember `pending` for next time.
   */
  function planStaticPrune(cachedPaths, referencedPaths, previouslyUnreferenced) {
    var referenced = {};
    var i;
    for (i = 0; i < referencedPaths.length; i++) referenced[referencedPaths[i]] = true;
    var previous = {};
    var list = previouslyUnreferenced || [];
    for (i = 0; i < list.length; i++) previous[list[i]] = true;

    var remove = [];
    var pending = [];
    for (i = 0; i < cachedPaths.length; i++) {
      var path = cachedPaths[i];
      if (referenced[path]) continue;
      if (previous[path]) remove.push(path);
      else pending.push(path);
    }
    return { remove: remove, pending: pending };
  }

  // --- Instant launch ------------------------------------------------------
  //
  // The shell above also makes ONLINE launches fast: a navigation to a shell route
  // is answered straight from SHELL_CACHE instead of waiting on the server render,
  // and the worker checks for a newer build in the background. This is safe for the
  // same reason the offline shell is — a shell document is only ever published once
  // every chunk it needs is cached — and the boot guard below turns any remaining
  // failure into one reload over the network instead of a stranded PWA.

  // A shell older than this is not served ahead of the network (a user who has not
  // opened the app for a week gets the current build straight away).
  var INSTANT_SHELL_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  // After a shell failed to boot, launches go to the network for this long.
  var INSTANT_SHELL_OFF_MS = 24 * 60 * 60 * 1000;
  // How long a shell page may take to hydrate (after the load event) before the
  // guard gives up on it.
  var SHELL_BOOT_TIMEOUT_MS = 15 * 1000;
  var SHELL_BOOT_FAILED_MESSAGE = 'shell-boot-failed';

  /**
   * Whether a navigation may be answered from the shell before the network.
   * `meta` is the shell bookkeeping, `instantOff` the marker written when a shell
   * failed to boot ({ disabledAt }).
   */
  function shouldServeShellInstantly(meta, instantOff, now) {
    if (!meta || typeof meta !== 'object') return false;
    if (typeof meta.buildId !== 'string' || meta.buildId === '') return false;
    // A newer build is live: go to the network until the shell is refilled.
    if (typeof meta.staleBuildId === 'string' && meta.staleBuildId !== '') return false;
    if (typeof meta.warmedAt !== 'number') return false;
    if (now < meta.warmedAt || now - meta.warmedAt > INSTANT_SHELL_MAX_AGE_MS) return false;
    if (
      instantOff &&
      typeof instantOff.disabledAt === 'number' &&
      now >= instantOff.disabledAt &&
      now - instantOff.disabledAt < INSTANT_SHELL_OFF_MS
    ) {
      return false;
    }
    return true;
  }

  // Runs before any chunk in a shell-served document. If a build asset fails to
  // load, or the app never hydrates (ServiceWorkerRegistration sets
  // window.__merkenBooted), it tells the worker to drop the shell and reloads, so
  // the next load comes from the network. At most once a minute per tab, so it can
  // never loop. Plain ES5: it runs before any bundle.
  var SHELL_BOOT_GUARD_SCRIPT =
    '(function(){var w=window;if(w.__merkenShellGuard)return;w.__merkenShellGuard=1;' +
    'var fired=false;' +
    'function reload(){if(reload.d)return;reload.d=1;location.reload();}' +
    'function recover(){if(fired)return;fired=true;' +
    'try{var k="merken_shell_recovered_at",l=+sessionStorage.getItem(k)||0;' +
    'if(Date.now()-l<60000)return;sessionStorage.setItem(k,String(Date.now()));}catch(e){}' +
    'var sw=navigator.serviceWorker&&navigator.serviceWorker.controller;' +
    'if(!sw){reload();return;}' +
    'try{var ch=new MessageChannel();ch.port1.onmessage=reload;' +
    'sw.postMessage({type:"' + SHELL_BOOT_FAILED_MESSAGE + '"},[ch.port2]);}catch(e){reload();return;}' +
    'setTimeout(reload,1500);}' +
    'function isBuildAsset(u){return typeof u==="string"&&u.indexOf("/_next/static/")!==-1;}' +
    'w.addEventListener("error",function(e){var t=e&&e.target;' +
    'if(t&&t!==w&&(isBuildAsset(t.src)||isBuildAsset(t.href)))recover();},true);' +
    'w.addEventListener("unhandledrejection",function(e){var r=e&&e.reason;' +
    'var s=r?String(r.name||"")+" "+String(r.message||""):"";' +
    'if(/ChunkLoadError|Loading (CSS )?chunk|Failed to load chunk/i.test(s))recover();});' +
    'function watch(){setTimeout(function(){if(w.__merkenBooted)return;' +
    'if(document.visibilityState==="hidden"){document.addEventListener("visibilitychange",function f(){' +
    'if(document.visibilityState!=="hidden"){document.removeEventListener("visibilitychange",f);watch();}});return;}' +
    'recover();},' + SHELL_BOOT_TIMEOUT_MS + ');}' +
    'if(document.readyState==="complete")watch();else w.addEventListener("load",watch);})();';

  var HEAD_OPEN_PATTERN = /<head(?:\s[^>]*)?>/i;

  /**
   * Insert the boot guard at the top of <head>, ahead of every chunk. Returns null
   * when the document has no <head> (then it must not be served ahead of the
   * network).
   */
  function injectShellBootGuard(html) {
    if (typeof html !== 'string') return null;
    var match = html.match(HEAD_OPEN_PATTERN);
    if (!match) return null;
    var at = match.index + match[0].length;
    return html.slice(0, at) + '<script>' + SHELL_BOOT_GUARD_SCRIPT + '</script>' + html.slice(at);
  }

  var api = {
    OFFLINE_SHELL_SENTINEL: OFFLINE_SHELL_SENTINEL,
    OFFLINE_SHELL_ROUTES: OFFLINE_SHELL_ROUTES,
    WARM_INTERVAL_MS: WARM_INTERVAL_MS,
    WARM_RETRY_MS: WARM_RETRY_MS,
    normalizePathname: normalizePathname,
    isDynamicShellRoute: isDynamicShellRoute,
    shellTemplatePath: shellTemplatePath,
    isSafeShellParam: isSafeShellParam,
    matchShellRoute: matchShellRoute,
    fillShellTemplate: fillShellTemplate,
    extractStaticAssetPaths: extractStaticAssetPaths,
    extractCssMediaPaths: extractCssMediaPaths,
    readBuildId: readBuildId,
    shouldWarmShell: shouldWarmShell,
    planStaticPrune: planStaticPrune,
    INSTANT_SHELL_MAX_AGE_MS: INSTANT_SHELL_MAX_AGE_MS,
    INSTANT_SHELL_OFF_MS: INSTANT_SHELL_OFF_MS,
    SHELL_BOOT_FAILED_MESSAGE: SHELL_BOOT_FAILED_MESSAGE,
    SHELL_BOOT_GUARD_SCRIPT: SHELL_BOOT_GUARD_SCRIPT,
    shouldServeShellInstantly: shouldServeShellInstantly,
    injectShellBootGuard: injectShellBootGuard,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.MerkenOfflineShell = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
