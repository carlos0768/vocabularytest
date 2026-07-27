/**
 * MERKEN offline wordbook viewer.
 *
 * WHY THIS FILE EXISTS
 * The service worker serves navigations network-first (see public/sw.js) and, when
 * offline, falls back to the document it cached for that exact URL — otherwise to
 * /offline.html. Wordbook routes are dynamic (/project/<id>), so a wordbook the user
 * never opened while online has no cached document and used to dead-end on a plain
 * "オフラインです" screen, even though every wordbook and word is already mirrored in
 * IndexedDB by HybridWordRepository.fullSync().
 *
 * This script progressively enhances that fallback page: it reads the wordbook data
 * straight out of IndexedDB (raw IDB, no Dexie bundle) and renders a read-only
 * wordbook list / word list / flashcard study view for whatever route was requested.
 * Because /offline.html is served AT the requested URL, location.pathname still tells
 * us which wordbook the user wanted.
 *
 * Deliberate constraints:
 *   - Plain ES2017 in a single precached file. No imports, no framework, no chunks —
 *     a cached Next.js document is useless offline if its hashed JS chunks are not
 *     also cached, and this page must never be able to strand the installed PWA.
 *   - READ-ONLY. Study progress (SM-2) is intentionally not written back, so the
 *     viewer can never conflict with the sync queue.
 *   - Progressive enhancement: if this file is missing from the cache, offline.html
 *     still shows its original offline notice.
 *
 * The pure helpers at the top are exported for unit tests
 * (src/lib/offline/offline-viewer.test.ts).
 */
(function (root) {
  'use strict';

  var DB_NAME = 'WordSnapDB';
  var DB_OPEN_TIMEOUT_MS = 4000;
  var SUB_CACHE_KEY = 'merken_sub_cache';
  // Internal bucket for words saved from the reel feed. Never shown as a browsable
  // wordbook in the app, so it must not show up here either.
  // Mirrors REEL_SAVED_PROJECT_TITLE in src/lib/reels/saved-words.ts.
  var REEL_SAVED_PROJECT_TITLE = 'リールで保存した単語';
  // Study routes whose id is not a wordbook id (/quiz/all, /flashcard/favorites, ...).
  var NON_PROJECT_STUDY_IDS = { all: true, favorites: true, review: true, today: true };

  // ---------------------------------------------------------------- pure helpers

  function normalizePathname(pathname) {
    if (typeof pathname !== 'string' || pathname === '') return '/';
    var path = pathname.split('?')[0].split('#')[0];
    while (path.length > 1 && path.charAt(path.length - 1) === '/') {
      path = path.slice(0, -1);
    }
    return path === '' ? '/' : path;
  }

  function safeDecode(value) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  /**
   * Map the requested URL to an offline view.
   * - list       : wordbook list (home, マイ単語帳, バインダー)
   * - project    : one wordbook; `study` opens flashcard mode straight away
   * - unsupported: nothing useful to show offline — keep the plain offline notice
   */
  function parseOfflineRoute(pathname) {
    var segments = normalizePathname(pathname).split('/').filter(Boolean);
    if (segments.length === 0) return { view: 'list', binder: null };

    var head = segments[0];
    var second = segments[1] ? safeDecode(segments[1]) : '';

    if (head === 'projects') return { view: 'list', binder: null };
    if (head === 'binder' && second) return { view: 'list', binder: second };
    if (head === 'project' && second) {
      return { view: 'project', projectId: second, study: false };
    }
    if ((head === 'quiz' || head === 'flashcard') && second) {
      if (NON_PROJECT_STUDY_IDS[second]) return { view: 'unsupported' };
      return { view: 'project', projectId: second, study: true };
    }
    return { view: 'unsupported' };
  }

  /** Read the signed-in user id out of the subscription cache written by use-auth. */
  function readCachedUserId(rawSubCache) {
    if (typeof rawSubCache !== 'string' || rawSubCache === '') return null;
    try {
      var parsed = JSON.parse(rawSubCache);
      if (parsed && typeof parsed.userId === 'string' && parsed.userId !== '') {
        return parsed.userId;
      }
    } catch {
      // ignore malformed cache
    }
    return null;
  }

  function timeValue(value) {
    var time = value ? new Date(value).getTime() : 0;
    return Number.isNaN(time) ? 0 : time;
  }

  /**
   * Wordbooks to list: owned by the current user, minus the internal reel bucket,
   * newest first. Filtering by user is best-effort — if the cached user id matches
   * nothing (stale cache, account switch) we show every stored wordbook rather than
   * an empty screen, since IndexedDB is per-device anyway.
   */
  function selectOfflineProjects(projects, options) {
    var opts = options || {};
    var all = (projects || []).filter(function (project) {
      return project && typeof project.id === 'string' && project.id !== '';
    });

    var owned = all;
    if (opts.userId) {
      var byUser = all.filter(function (project) {
        return project.userId === opts.userId;
      });
      if (byUser.length > 0) owned = byUser;
    }

    var visible = owned.filter(function (project) {
      return project.title !== REEL_SAVED_PROJECT_TITLE;
    });

    if (opts.binder) {
      visible = visible.filter(function (project) {
        return (project.binder || '').trim() === opts.binder;
      });
    }

    return visible.slice().sort(function (a, b) {
      return timeValue(b.createdAt) - timeValue(a.createdAt);
    });
  }

  /** Words in the order they were added to the wordbook. */
  function sortOfflineWords(words) {
    return (words || [])
      .filter(function (word) {
        return word && typeof word.english === 'string';
      })
      .slice()
      .sort(function (a, b) {
        var diff = timeValue(a.createdAt) - timeValue(b.createdAt);
        if (diff !== 0) return diff;
        return a.english.localeCompare(b.english);
      });
  }

  /** Flashcard deck. `random` is injectable so tests can pin the shuffle. */
  function buildFlashcardDeck(words, shuffle, random) {
    var deck = sortOfflineWords(words);
    if (!shuffle) return deck;
    var rand = typeof random === 'function' ? random : Math.random;
    for (var i = deck.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var swap = deck[i];
      deck[i] = deck[j];
      deck[j] = swap;
    }
    return deck;
  }

  var api = {
    normalizePathname: normalizePathname,
    parseOfflineRoute: parseOfflineRoute,
    readCachedUserId: readCachedUserId,
    selectOfflineProjects: selectOfflineProjects,
    sortOfflineWords: sortOfflineWords,
    buildFlashcardDeck: buildFlashcardDeck,
    REEL_SAVED_PROJECT_TITLE: REEL_SAVED_PROJECT_TITLE,
  };

  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.MerkenOfflineViewer = api;
  }

  // Everything below needs a DOM + IndexedDB. Under the test runner we stop here.
  if (typeof document === 'undefined' || typeof indexedDB === 'undefined' || !indexedDB) {
    return;
  }

  // ------------------------------------------------------------------ IndexedDB

  function requestToPromise(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error);
      };
    });
  }

  /**
   * Open the Dexie-created database read-only, WITHOUT a version number so we never
   * trigger a schema upgrade. If `upgradeneeded` fires the database did not exist at
   * all: abort so we don't leave an empty v1 database behind for Dexie to inherit.
   */
  function openDatabase() {
    return new Promise(function (resolve) {
      var settled = false;
      function finish(value) {
        if (settled) return;
        settled = true;
        resolve(value);
      }

      var request;
      try {
        request = indexedDB.open(DB_NAME);
      } catch {
        finish(null);
        return;
      }

      // A blocked open (another tab mid-upgrade) never fires success or error.
      setTimeout(function () {
        finish(null);
      }, DB_OPEN_TIMEOUT_MS);

      request.onupgradeneeded = function () {
        try {
          request.transaction.abort();
        } catch {
          // ignore
        }
        finish(null);
      };
      request.onblocked = function () {
        finish(null);
      };
      request.onerror = function () {
        finish(null);
      };
      request.onsuccess = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains('projects') || !db.objectStoreNames.contains('words')) {
          try {
            db.close();
          } catch {
            // ignore
          }
          finish(null);
          return;
        }
        finish(db);
      };
    });
  }

  function readAllProjects(db) {
    var tx = db.transaction('projects', 'readonly');
    return requestToPromise(tx.objectStore('projects').getAll());
  }

  function countWordsByProject(db, projectIds) {
    if (projectIds.length === 0) return Promise.resolve({});
    var tx = db.transaction('words', 'readonly');
    var index = tx.objectStore('words').index('projectId');
    return Promise.all(
      projectIds.map(function (projectId) {
        return requestToPromise(index.count(IDBKeyRange.only(projectId))).then(function (count) {
          return [projectId, count];
        });
      })
    ).then(function (pairs) {
      var counts = {};
      pairs.forEach(function (pair) {
        counts[pair[0]] = pair[1];
      });
      return counts;
    });
  }

  function readWordsByProject(db, projectId) {
    var tx = db.transaction('words', 'readonly');
    var index = tx.objectStore('words').index('projectId');
    return requestToPromise(index.getAll(IDBKeyRange.only(projectId)));
  }

  // ------------------------------------------------------------------ DOM utils

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null && text !== '') node.textContent = String(text);
    return node;
  }

  function link(href, className, text) {
    var node = el('a', className, text);
    node.href = href;
    return node;
  }

  function readCurrentUserId() {
    try {
      return readCachedUserId(localStorage.getItem(SUB_CACHE_KEY));
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------------- chrome

  function buildHeader(options) {
    var header = el('header', 'ov-header');

    if (options.backHref) {
      var back = link(options.backHref, 'ov-icon-button');
      back.setAttribute('aria-label', '戻る');
      back.textContent = '←';
      header.appendChild(back);
    }

    var titles = el('div', 'ov-header-titles');
    titles.appendChild(el('div', 'ov-eyebrow', 'オフライン表示'));
    titles.appendChild(el('h1', 'ov-title', options.title));
    if (options.subtitle) {
      titles.appendChild(el('div', 'ov-subtitle', options.subtitle));
    }
    header.appendChild(titles);

    return header;
  }

  function buildNotice(text) {
    var notice = el('p', 'ov-notice', text);
    return notice;
  }

  // ---------------------------------------------------------------- list screen

  function renderList(mount, state) {
    var projects = selectOfflineProjects(state.projects, {
      userId: state.userId,
      binder: state.route.binder,
    });

    mount.appendChild(
      buildHeader({
        title: state.route.binder || 'マイ単語帳',
        subtitle: projects.length + ' 冊 · 保存済みのデータを表示中',
      })
    );

    if (projects.length === 0) {
      mount.appendChild(
        buildNotice('この端末に保存された単語帳が見つかりませんでした。オンラインで一度アプリを開くと、単語帳がオフライン用に保存されます。')
      );
      return;
    }

    mount.appendChild(
      buildNotice('オフラインのため、保存済みのデータを読み取り専用で表示しています。編集や同期は接続が回復してから行われます。')
    );

    var list = el('div', 'ov-list');
    projects.forEach(function (project) {
      var count = state.wordCounts[project.id];
      var row = link('/project/' + encodeURIComponent(project.id), 'ov-row');

      var thumb = el('div', 'ov-thumb', (project.title || '?').charAt(0));
      if (project.iconImage) {
        thumb.style.backgroundImage = 'url(' + project.iconImage + ')';
        thumb.textContent = '';
      }
      row.appendChild(thumb);

      var body = el('div', 'ov-row-body');
      body.appendChild(el('div', 'ov-row-title', project.title || '無題の単語帳'));
      body.appendChild(
        el('div', 'ov-row-meta', (typeof count === 'number' ? count : 0) + ' 語')
      );
      row.appendChild(body);
      row.appendChild(el('span', 'ov-chevron', '›'));

      list.appendChild(row);
    });
    mount.appendChild(list);
  }

  // ------------------------------------------------------------- wordbook screen

  function buildWordRow(word, index) {
    var row = el('div', 'ov-word');

    var head = el('div', 'ov-word-head');
    head.appendChild(el('span', 'ov-word-index', index + 1));
    var terms = el('div', 'ov-word-terms');
    terms.appendChild(el('div', 'ov-word-en', word.english));
    if (word.pronunciation) {
      terms.appendChild(el('div', 'ov-word-pron', word.pronunciation));
    }
    terms.appendChild(el('div', 'ov-word-ja', word.japanese || '—'));
    head.appendChild(terms);
    row.appendChild(head);

    if (word.exampleSentence) {
      var example = el('div', 'ov-word-example');
      example.appendChild(el('div', 'ov-example-en', word.exampleSentence));
      if (word.exampleSentenceJa) {
        example.appendChild(el('div', 'ov-example-ja', word.exampleSentenceJa));
      }
      row.appendChild(example);
    }

    return row;
  }

  function renderFlashcards(container, words) {
    var deck = buildFlashcardDeck(words, false);
    var position = 0;
    var flipped = false;
    var shuffled = false;

    var card = el('button', 'ov-card');
    card.type = 'button';
    var progress = el('div', 'ov-card-progress');
    var controls = el('div', 'ov-card-controls');

    var prev = el('button', 'ov-control', '前へ');
    prev.type = 'button';
    var flip = el('button', 'ov-control ov-control-primary', 'めくる');
    flip.type = 'button';
    var next = el('button', 'ov-control', '次へ');
    next.type = 'button';
    var shuffle = el('button', 'ov-control ov-control-ghost', 'シャッフル');
    shuffle.type = 'button';

    function paint() {
      var word = deck[position];
      card.textContent = '';
      if (!word) {
        card.appendChild(el('div', 'ov-card-en', '単語がありません'));
        progress.textContent = '0 / 0';
        return;
      }

      if (flipped) {
        card.appendChild(el('div', 'ov-card-ja', word.japanese || '—'));
        if (word.exampleSentence) {
          card.appendChild(el('div', 'ov-card-example', word.exampleSentence));
        }
        if (word.exampleSentenceJa) {
          card.appendChild(el('div', 'ov-card-example-ja', word.exampleSentenceJa));
        }
      } else {
        card.appendChild(el('div', 'ov-card-en', word.english));
        if (word.pronunciation) {
          card.appendChild(el('div', 'ov-card-pron', word.pronunciation));
        }
        card.appendChild(el('div', 'ov-card-hint', 'タップして意味を表示'));
      }

      progress.textContent = position + 1 + ' / ' + deck.length;
      flip.textContent = flipped ? '英語に戻す' : 'めくる';
      prev.disabled = position === 0;
      next.disabled = position >= deck.length - 1;
    }

    card.addEventListener('click', function () {
      flipped = !flipped;
      paint();
    });
    flip.addEventListener('click', function () {
      flipped = !flipped;
      paint();
    });
    prev.addEventListener('click', function () {
      if (position > 0) {
        position -= 1;
        flipped = false;
        paint();
      }
    });
    next.addEventListener('click', function () {
      if (position < deck.length - 1) {
        position += 1;
        flipped = false;
        paint();
      }
    });
    shuffle.addEventListener('click', function () {
      shuffled = !shuffled;
      deck = buildFlashcardDeck(words, shuffled);
      position = 0;
      flipped = false;
      shuffle.classList.toggle('ov-control-active', shuffled);
      paint();
    });

    controls.appendChild(prev);
    controls.appendChild(flip);
    controls.appendChild(next);

    container.appendChild(card);
    container.appendChild(progress);
    container.appendChild(controls);
    container.appendChild(shuffle);

    paint();
  }

  function renderProject(mount, state) {
    var project = null;
    for (var i = 0; i < state.projects.length; i++) {
      if (state.projects[i] && state.projects[i].id === state.route.projectId) {
        project = state.projects[i];
        break;
      }
    }

    if (!project) {
      mount.appendChild(buildHeader({ title: '単語帳が見つかりません', backHref: '/projects' }));
      mount.appendChild(
        buildNotice('この単語帳はまだこの端末に保存されていません。オンラインで一度開くと、次からはオフラインでも表示できます。')
      );
      mount.appendChild(link('/projects', 'ov-button', '保存済みの単語帳を見る'));
      return;
    }

    var words = sortOfflineWords(state.words);

    mount.appendChild(
      buildHeader({
        title: project.title || '無題の単語帳',
        subtitle: words.length + ' 語 · 読み取り専用',
        backHref: '/projects',
      })
    );

    if (words.length === 0) {
      mount.appendChild(buildNotice('この単語帳に保存されている単語はありません。'));
      return;
    }

    var tabs = el('div', 'ov-tabs');
    var listTab = el('button', 'ov-tab', '単語リスト');
    listTab.type = 'button';
    var studyTab = el('button', 'ov-tab', 'フラッシュカード');
    studyTab.type = 'button';
    tabs.appendChild(listTab);
    tabs.appendChild(studyTab);
    mount.appendChild(tabs);

    var panel = el('div', 'ov-panel');
    mount.appendChild(panel);

    function show(mode) {
      panel.textContent = '';
      listTab.classList.toggle('ov-tab-active', mode === 'list');
      studyTab.classList.toggle('ov-tab-active', mode === 'study');
      if (mode === 'study') {
        renderFlashcards(panel, words);
        return;
      }
      var list = el('div', 'ov-word-list');
      words.forEach(function (word, index) {
        list.appendChild(buildWordRow(word, index));
      });
      panel.appendChild(list);
    }

    listTab.addEventListener('click', function () {
      show('list');
    });
    studyTab.addEventListener('click', function () {
      show('study');
    });

    show(state.route.study ? 'study' : 'list');
  }

  // -------------------------------------------------------------------- bootstrap

  /** Offer a way into the offline wordbook list from the plain offline notice. */
  function decorateFallback(hasProjects) {
    if (!hasProjects) return;
    var fallback = document.getElementById('offline-fallback-actions');
    if (!fallback) return;
    fallback.appendChild(link('/projects', 'ov-button ov-button-ghost', '保存済みの単語帳を見る'));
  }

  function activateViewer() {
    root.__merkenOfflineViewerActive = true;
    document.body.classList.add('ov-active');
    var fallback = document.getElementById('offline-fallback');
    if (fallback) fallback.hidden = true;
    var mount = document.getElementById('offline-viewer');
    if (mount) mount.hidden = false;
    return mount;
  }

  function showReconnectBanner() {
    if (document.getElementById('ov-reconnect')) return;
    var banner = el('div', 'ov-reconnect');
    banner.id = 'ov-reconnect';
    banner.appendChild(el('span', null, 'オンラインに復帰しました'));
    var reload = el('button', 'ov-reconnect-button', '再読み込み');
    reload.type = 'button';
    reload.addEventListener('click', function () {
      location.reload();
    });
    banner.appendChild(reload);
    document.body.appendChild(banner);
  }

  function start() {
    var route = parseOfflineRoute(location.pathname);

    openDatabase()
      .then(function (db) {
        if (!db) return null;

        return readAllProjects(db)
          .then(function (projects) {
            var safeProjects = Array.isArray(projects) ? projects : [];
            if (route.view === 'project') {
              return readWordsByProject(db, route.projectId).then(function (words) {
                return {
                  projects: safeProjects,
                  words: Array.isArray(words) ? words : [],
                  wordCounts: {},
                };
              });
            }
            var visible = selectOfflineProjects(safeProjects, {
              userId: readCurrentUserId(),
              binder: route.binder,
            });
            return countWordsByProject(
              db,
              visible.map(function (project) {
                return project.id;
              })
            ).then(function (wordCounts) {
              return { projects: safeProjects, words: [], wordCounts: wordCounts };
            });
          })
          .then(function (data) {
            try {
              db.close();
            } catch {
              // ignore
            }
            return data;
          });
      })
      .then(function (data) {
        if (!data) return;

        var state = {
          route: route,
          userId: readCurrentUserId(),
          projects: data.projects,
          words: data.words,
          wordCounts: data.wordCounts,
        };

        if (route.view === 'unsupported') {
          decorateFallback(
            selectOfflineProjects(state.projects, { userId: state.userId }).length > 0
          );
          return;
        }

        var mount = activateViewer();
        if (!mount) return;
        mount.textContent = '';
        if (route.view === 'project') {
          renderProject(mount, state);
        } else {
          renderList(mount, state);
        }

        // In viewer mode we never auto-reload: the user may be mid-study. Offer an
        // explicit reload instead (offline.html keeps auto-reloading the plain notice).
        root.addEventListener('online', showReconnectBanner);
      })
      .catch(function (error) {
        // Any failure leaves offline.html's original notice on screen.
        if (root.console && root.console.warn) {
          root.console.warn('[OfflineViewer] Failed to render offline wordbook:', error);
        }
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
