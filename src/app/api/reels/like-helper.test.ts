import assert from 'node:assert/strict';
import test from 'node:test';

import { setReelWordLike, setReelWordFeedback } from './shared';

type Call = { op: string; table: string };

/**
 * Minimal chainable fake of the Supabase admin client. Records the
 * operations invoked per table so tests can assert that upsert() is never
 * used (the partial-index bug this fix addresses) and that the correct
 * insert/update/delete path runs.
 */
function makeFakeAdmin(config: {
  wordExists?: boolean;
  bookShareId?: string;
  officialSlug?: string;
  likeExists?: boolean;
  feedbackExists?: boolean;
  likeCount?: number;
}) {
  const calls: Call[] = [];

  function tableApi(table: string) {
    // Result the builder resolves to when awaited directly (count / update /
    // delete / insert-via-eq paths). maybeSingle() resolves its own value.
    let awaitResult: { count?: number; error: null } = { error: null };

    const builder: Record<string, unknown> = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        calls.push({ op: opts?.count ? 'count' : 'select', table });
        if (opts?.count) {
          awaitResult = { count: config.likeCount ?? 0, error: null };
        }
        return builder;
      },
      eq() {
        return builder;
      },
      then(resolve: (v: unknown) => void) {
        resolve(awaitResult);
      },
      maybeSingle() {
        if (table === 'shared_wordbook_words') {
          return Promise.resolve({
            data: config.wordExists === false ? null : { id: 'w1', shared_wordbook_id: 'b1' },
            error: null,
          });
        }
        if (table === 'shared_wordbooks') {
          return Promise.resolve({ data: { share_id: config.bookShareId ?? 'share1' }, error: null });
        }
        if (table === 'words') {
          return Promise.resolve({
            data: config.wordExists === false ? null : { id: 'w1', project_id: 'p1' },
            error: null,
          });
        }
        if (table === 'projects') {
          return Promise.resolve({
            data: { id: 'p1', official_slug: config.officialSlug ?? 'slug1' },
            error: null,
          });
        }
        if (table === 'reel_word_likes') {
          return Promise.resolve({ data: config.likeExists ? { id: 'l1' } : null, error: null });
        }
        if (table === 'reel_word_feedback') {
          return Promise.resolve({ data: config.feedbackExists ? { id: 'f1' } : null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      insert() {
        calls.push({ op: 'insert', table });
        return Promise.resolve({ error: null });
      },
      update() {
        calls.push({ op: 'update', table });
        return builder;
      },
      delete() {
        calls.push({ op: 'delete', table });
        return builder;
      },
      upsert() {
        calls.push({ op: 'upsert', table });
        return Promise.resolve({ error: null });
      },
    };
    return builder;
  }

  const admin = { from: (table: string) => tableApi(table) } as never;
  return { admin, calls };
}

test('setReelWordLike inserts (never upserts) when not yet liked', async () => {
  const { admin, calls } = makeFakeAdmin({ likeExists: false, likeCount: 1 });
  const result = await setReelWordLike({
    userId: 'u1',
    source: 'shared',
    wordId: 'w1',
    liked: true,
    admin,
  });
  assert.deepEqual(result, { liked: true, likeCount: 1 });
  assert.ok(!calls.some((c) => c.op === 'upsert'), 'must not use upsert');
  assert.ok(calls.some((c) => c.op === 'insert' && c.table === 'reel_word_likes'));
});

test('setReelWordLike does not insert again when already liked', async () => {
  const { admin, calls } = makeFakeAdmin({ likeExists: true, likeCount: 1 });
  await setReelWordLike({ userId: 'u1', source: 'shared', wordId: 'w1', liked: true, admin });
  assert.ok(!calls.some((c) => c.op === 'insert' && c.table === 'reel_word_likes'));
  assert.ok(!calls.some((c) => c.op === 'upsert'));
});

test('setReelWordLike deletes on unlike', async () => {
  const { admin, calls } = makeFakeAdmin({ likeCount: 0 });
  await setReelWordLike({ userId: 'u1', source: 'official', wordId: 'w1', liked: false, admin });
  assert.ok(calls.some((c) => c.op === 'delete' && c.table === 'reel_word_likes'));
  assert.ok(!calls.some((c) => c.op === 'upsert'));
});

test('setReelWordLike returns null for a missing word', async () => {
  const { admin } = makeFakeAdmin({ wordExists: false });
  const result = await setReelWordLike({
    userId: 'u1',
    source: 'shared',
    wordId: 'missing',
    liked: true,
    admin,
  });
  assert.equal(result, null);
});

test('setReelWordFeedback inserts (never upserts) when new', async () => {
  const { admin, calls } = makeFakeAdmin({ feedbackExists: false });
  const result = await setReelWordFeedback({
    userId: 'u1',
    source: 'shared',
    wordId: 'w1',
    feedback: 'interested',
    admin,
  });
  assert.deepEqual(result, { feedback: 'interested' });
  assert.ok(!calls.some((c) => c.op === 'upsert'), 'must not use upsert');
  assert.ok(calls.some((c) => c.op === 'insert' && c.table === 'reel_word_feedback'));
});

test('setReelWordFeedback updates when a row already exists', async () => {
  const { admin, calls } = makeFakeAdmin({ feedbackExists: true });
  await setReelWordFeedback({
    userId: 'u1',
    source: 'official',
    wordId: 'w1',
    feedback: 'not_interested',
    admin,
  });
  assert.ok(calls.some((c) => c.op === 'update' && c.table === 'reel_word_feedback'));
  assert.ok(!calls.some((c) => c.op === 'insert' && c.table === 'reel_word_feedback'));
  assert.ok(!calls.some((c) => c.op === 'upsert'));
});
