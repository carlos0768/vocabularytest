import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// public/offline-viewer.js is a plain browser script (it must stay import-free so it
// can be precached and run from the service-worker cache without any build output).
// It exports its pure helpers on module.exports when required from Node.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const viewer = require('../../../public/offline-viewer.js') as {
  normalizePathname(pathname: unknown): string;
  parseOfflineRoute(pathname: unknown): {
    view: 'list' | 'project' | 'unsupported';
    binder?: string | null;
    projectId?: string;
    study?: boolean;
  };
  readCachedUserId(raw: unknown): string | null;
  selectOfflineProjects(
    projects: unknown[],
    options?: { userId?: string | null; binder?: string | null },
  ): { id: string; title: string }[];
  sortOfflineWords(words: unknown[]): { english: string }[];
  buildFlashcardDeck(
    words: unknown[],
    shuffle: boolean,
    random?: () => number,
  ): { english: string }[];
  REEL_SAVED_PROJECT_TITLE: string;
};

const {
  normalizePathname,
  parseOfflineRoute,
  readCachedUserId,
  selectOfflineProjects,
  sortOfflineWords,
  buildFlashcardDeck,
  REEL_SAVED_PROJECT_TITLE,
} = viewer;

function project(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    userId: 'user-1',
    title: 'TOEIC 頻出',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function word(overrides: Record<string, unknown> = {}) {
  return {
    id: 'w1',
    projectId: 'p1',
    english: 'elaborate',
    japanese: '詳しく述べる',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('normalizePathname', () => {
  it('strips query, hash and trailing slashes', () => {
    assert.equal(normalizePathname('/project/abc/?tab=1#study'), '/project/abc');
    assert.equal(normalizePathname('/projects///'), '/projects');
  });

  it('falls back to the root path for unusable input', () => {
    assert.equal(normalizePathname(''), '/');
    assert.equal(normalizePathname('/'), '/');
    assert.equal(normalizePathname(undefined), '/');
  });
});

describe('parseOfflineRoute', () => {
  it('maps wordbook routes to the wordbook view', () => {
    assert.deepEqual(parseOfflineRoute('/project/abc'), {
      view: 'project',
      projectId: 'abc',
      study: false,
    });
  });

  it('maps wordbook sub-routes to the same wordbook', () => {
    assert.equal(parseOfflineRoute('/project/abc/words').projectId, 'abc');
    assert.equal(parseOfflineRoute('/project/abc/insights').projectId, 'abc');
  });

  it('decodes percent-encoded ids and binder names', () => {
    assert.equal(parseOfflineRoute('/project/a%20b').projectId, 'a b');
    assert.deepEqual(parseOfflineRoute('/binder/%E8%8B%B1%E8%AA%9E'), {
      view: 'list',
      binder: '英語',
    });
  });

  it('maps the home and wordbook list routes to the list view', () => {
    assert.deepEqual(parseOfflineRoute('/'), { view: 'list', binder: null });
    assert.deepEqual(parseOfflineRoute('/projects'), { view: 'list', binder: null });
  });

  it('opens flashcard mode for per-wordbook study routes', () => {
    assert.deepEqual(parseOfflineRoute('/flashcard/abc'), {
      view: 'project',
      projectId: 'abc',
      study: true,
    });
    assert.deepEqual(parseOfflineRoute('/quiz/abc'), {
      view: 'project',
      projectId: 'abc',
      study: true,
    });
  });

  it('does not treat cross-wordbook study routes as a wordbook id', () => {
    assert.equal(parseOfflineRoute('/quiz/all').view, 'unsupported');
    assert.equal(parseOfflineRoute('/flashcard/favorites').view, 'unsupported');
  });

  it('leaves routes with no offline equivalent unsupported', () => {
    assert.equal(parseOfflineRoute('/scan').view, 'unsupported');
    assert.equal(parseOfflineRoute('/settings/profile').view, 'unsupported');
    assert.equal(parseOfflineRoute('/project').view, 'unsupported');
  });
});

describe('readCachedUserId', () => {
  it('reads the user id out of the subscription cache', () => {
    assert.equal(
      readCachedUserId(JSON.stringify({ userId: 'user-9', timestamp: 1, subscription: null })),
      'user-9',
    );
  });

  it('returns null for missing or malformed caches', () => {
    assert.equal(readCachedUserId(null), null);
    assert.equal(readCachedUserId(''), null);
    assert.equal(readCachedUserId('not json'), null);
    assert.equal(readCachedUserId(JSON.stringify({ userId: '' })), null);
  });
});

describe('selectOfflineProjects', () => {
  it('sorts newest first', () => {
    const result = selectOfflineProjects([
      project({ id: 'old', createdAt: '2026-01-01T00:00:00.000Z' }),
      project({ id: 'new', createdAt: '2026-05-01T00:00:00.000Z' }),
    ]);
    assert.deepEqual(
      result.map((item) => item.id),
      ['new', 'old'],
    );
  });

  it('keeps only the signed-in user’s wordbooks', () => {
    const result = selectOfflineProjects(
      [project({ id: 'mine', userId: 'user-1' }), project({ id: 'theirs', userId: 'user-2' })],
      { userId: 'user-1' },
    );
    assert.deepEqual(
      result.map((item) => item.id),
      ['mine'],
    );
  });

  it('shows every stored wordbook when the cached user matches none', () => {
    // Stale subscription cache / account switch must not produce an empty screen —
    // IndexedDB is per-device, so showing what is there beats showing nothing.
    const result = selectOfflineProjects([project({ id: 'mine', userId: 'user-1' })], {
      userId: 'someone-else',
    });
    assert.deepEqual(
      result.map((item) => item.id),
      ['mine'],
    );
  });

  it('hides the internal reel-saved bucket', () => {
    const result = selectOfflineProjects([
      project({ id: 'visible' }),
      project({ id: 'bucket', title: REEL_SAVED_PROJECT_TITLE }),
    ]);
    assert.deepEqual(
      result.map((item) => item.id),
      ['visible'],
    );
  });

  it('filters by binder when a binder route was requested', () => {
    const result = selectOfflineProjects(
      [
        project({ id: 'in', binder: ' 英語 '.trim() }),
        project({ id: 'other', binder: '数学' }),
        project({ id: 'unfiled', binder: null }),
      ],
      { binder: '英語' },
    );
    assert.deepEqual(
      result.map((item) => item.id),
      ['in'],
    );
  });

  it('drops malformed rows and tolerates missing input', () => {
    assert.deepEqual(selectOfflineProjects([null, undefined, { title: 'no id' }]), []);
    assert.deepEqual(selectOfflineProjects(undefined as unknown as unknown[]), []);
  });
});

describe('sortOfflineWords', () => {
  it('keeps the order words were added, breaking ties alphabetically', () => {
    const result = sortOfflineWords([
      word({ english: 'beta', createdAt: '2026-02-01T00:00:00.000Z' }),
      word({ english: 'gamma', createdAt: '2026-01-01T00:00:00.000Z' }),
      word({ english: 'alpha', createdAt: '2026-01-01T00:00:00.000Z' }),
    ]);
    assert.deepEqual(
      result.map((item) => item.english),
      ['alpha', 'gamma', 'beta'],
    );
  });

  it('does not mutate the input and drops malformed rows', () => {
    const input = [word({ english: 'b' }), null, { japanese: 'no english' }];
    const result = sortOfflineWords(input);
    assert.equal(result.length, 1);
    assert.equal(input.length, 3);
  });
});

describe('buildFlashcardDeck', () => {
  it('keeps wordbook order when shuffle is off', () => {
    const result = buildFlashcardDeck(
      [
        word({ english: 'second', createdAt: '2026-02-01T00:00:00.000Z' }),
        word({ english: 'first', createdAt: '2026-01-01T00:00:00.000Z' }),
      ],
      false,
    );
    assert.deepEqual(
      result.map((item) => item.english),
      ['first', 'second'],
    );
  });

  it('shuffles without losing or duplicating words', () => {
    const words = ['a', 'b', 'c', 'd'].map((english, index) =>
      word({ english, createdAt: `2026-01-0${index + 1}T00:00:00.000Z` }),
    );
    const result = buildFlashcardDeck(words, true, () => 0);
    assert.deepEqual(
      result.map((item) => item.english).sort(),
      ['a', 'b', 'c', 'd'],
    );
    // random() === 0 rotates every element to the front, so the order really changed.
    assert.deepEqual(
      result.map((item) => item.english),
      ['b', 'c', 'd', 'a'],
    );
  });
});
