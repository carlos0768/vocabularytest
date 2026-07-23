import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getSharedWordbookPreview,
  listMySharedWordbooks,
  listPublicSharedWordbooks,
  publishSharedWordbook,
  renameSharedWordbook,
  setSharedWordbookLike,
  SharedWordbookError,
  unpublishSharedWordbook,
  updateSharedWordbookTags,
} from './shared-wordbooks';

type Row = Record<string, unknown>;

type Store = {
  shared_wordbooks: Row[];
  shared_wordbook_words: Row[];
  shared_wordbook_likes: Row[];
  projects: Row[];
  words: Row[];
  profiles: Row[];
  lexicon_entries: Row[];
};

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

class FakeQuery {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private eqFilters: Array<[string, unknown]> = [];
  private inFilters: Array<[string, unknown[]]> = [];
  private payload: Row[] = [];
  private wantSingle = false;
  private wantMaybeSingle = false;
  private wantCount = false;

  constructor(private readonly table: keyof Store, private readonly store: Store) {}

  select(_cols?: unknown, options?: { count?: string; head?: boolean }) {
    if (this.op !== 'insert' && this.op !== 'update' && this.op !== 'delete') this.op = 'select';
    if (options?.count) this.wantCount = true;
    return this;
  }

  insert(rows: Row | Row[]) {
    this.op = 'insert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  upsert(rows: Row | Row[]) {
    this.op = 'insert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  update(values: Row) {
    this.op = 'update';
    this.payload = [values];
    return this;
  }

  delete() {
    this.op = 'delete';
    return this;
  }

  eq(column: string, value: unknown) {
    this.eqFilters.push([column, value]);
    return this;
  }

  in(column: string, values: unknown[]) {
    this.inFilters.push([column, values]);
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this.resolve();
  }

  maybeSingle() {
    this.wantMaybeSingle = true;
    return this.resolve();
  }

  single() {
    this.wantSingle = true;
    return this.resolve();
  }

  private matches(row: Row): boolean {
    for (const [col, val] of this.eqFilters) {
      if (row[col] !== val) return false;
    }
    for (const [col, vals] of this.inFilters) {
      if (!vals.includes(row[col])) return false;
    }
    return true;
  }

  private resolve(): Promise<{ data: unknown; error: unknown; count?: number }> {
    const table = this.store[this.table];

    if (this.op === 'insert') {
      const inserted = this.payload.map((row) => ({ id: nextId(this.table), ...row }));
      table.push(...inserted);
      const data = this.wantSingle ? inserted[0] : inserted;
      return Promise.resolve({ data, error: null });
    }

    if (this.op === 'update') {
      const updated: Row[] = [];
      for (const row of table) {
        if (this.matches(row)) {
          Object.assign(row, this.payload[0]);
          updated.push(row);
        }
      }
      const data = this.wantSingle || this.wantMaybeSingle ? updated[0] ?? null : updated;
      return Promise.resolve({ data, error: null });
    }

    if (this.op === 'delete') {
      const remaining = table.filter((row) => !this.matches(row));
      const removedCount = table.length - remaining.length;
      this.store[this.table] = remaining as Store[keyof Store];
      return Promise.resolve({ data: null, error: null, count: removedCount });
    }

    const filtered = table.filter((row) => this.matches(row));
    if (this.wantSingle) return Promise.resolve({ data: filtered[0] ?? null, error: null });
    if (this.wantMaybeSingle) return Promise.resolve({ data: filtered[0] ?? null, error: null });
    return Promise.resolve({ data: filtered, error: null, count: this.wantCount ? filtered.length : undefined });
  }

  then(onFulfilled: (value: { data: unknown; error: unknown; count?: number }) => unknown) {
    return this.resolve().then(onFulfilled);
  }
}

class FakeAdmin {
  constructor(readonly store: Store) {}
  from(table: keyof Store) {
    return new FakeQuery(table, this.store);
  }
}

function makeStore(overrides: Partial<Store> = {}): Store {
  return {
    shared_wordbooks: [],
    shared_wordbook_words: [],
    shared_wordbook_likes: [],
    projects: [],
    words: [],
    profiles: [],
    lexicon_entries: [],
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asAdmin = (admin: FakeAdmin) => admin as any;

test('publishSharedWordbook snapshots project words and is owner-gated', async () => {
  const store = makeStore({
    projects: [{ id: 'p1', user_id: 'u1', title: 'TOEIC 600', description: null, icon_image: null, source_labels: [] }],
    words: [
      { project_id: 'p1', english: 'apple', japanese: 'りんご', distractors: [], created_at: '2026-01-01T00:00:00Z' },
      { project_id: 'p1', english: 'banana', japanese: 'バナナ', distractors: [], created_at: '2026-01-02T00:00:00Z' },
    ],
    profiles: [{ user_id: 'u1', username: 'taro', account_id: 'taro123' }],
  });
  const admin = new FakeAdmin(store);

  const card = await publishSharedWordbook('u1', 'p1', ['/toeic'], asAdmin(admin));
  assert.equal(card.accessRole, 'owner');
  assert.equal(card.wordCount, 2);
  assert.equal(card.project.title, 'TOEIC 600');
  assert.ok(card.project.shareId, 'a share id is assigned');
  assert.equal(store.shared_wordbooks.length, 1);
  assert.equal(store.shared_wordbook_words.length, 2);
});

test('publishSharedWordbook auto-tags the snapshot with the estimated EIKEN grade', async () => {
  const store = makeStore({
    projects: [{ id: 'p1', user_id: 'u1', title: '難単語', description: null, icon_image: null, source_labels: [] }],
    words: [
      { project_id: 'p1', english: 'ubiquitous', japanese: '遍在する', distractors: [], created_at: '2026-01-01T00:00:00Z' },
      { project_id: 'p1', english: 'ephemeral', japanese: '儚い', distractors: [], created_at: '2026-01-02T00:00:00Z' },
      { project_id: 'p1', english: 'meticulous', japanese: '几帳面な', distractors: [], created_at: '2026-01-03T00:00:00Z' },
    ],
    lexicon_entries: [
      { normalized_headword: 'ubiquitous', cefr_level: 'C1' },
      { normalized_headword: 'ephemeral', cefr_level: 'C2' },
      { normalized_headword: 'meticulous', cefr_level: 'C1' },
    ],
  });
  const admin = new FakeAdmin(store);

  const card = await publishSharedWordbook('u1', 'p1', ['#英検3級', '#単語'], asAdmin(admin));
  assert.deepEqual(card.project.sharedTags, ['英検1級', '単語'], 'stale grade tag is replaced by the estimated one');
});

test('publishSharedWordbook skips the level tag when word levels are unknown', async () => {
  const store = makeStore({
    projects: [{ id: 'p1', user_id: 'u1', title: 'List', description: null, icon_image: null, source_labels: [] }],
    words: [
      { project_id: 'p1', english: 'zzz-unknown', japanese: '?', distractors: [], created_at: '2026-01-01T00:00:00Z' },
    ],
  });
  const admin = new FakeAdmin(store);

  const card = await publishSharedWordbook('u1', 'p1', ['#単語'], asAdmin(admin));
  assert.deepEqual(card.project.sharedTags, ['単語']);
});

test('publishSharedWordbook rejects a project the user does not own', async () => {
  const store = makeStore({
    projects: [{ id: 'p1', user_id: 'someone-else', title: 'X', description: null, icon_image: null, source_labels: [] }],
  });
  const admin = new FakeAdmin(store);

  await assert.rejects(
    () => publishSharedWordbook('u1', 'p1', [], asAdmin(admin)),
    (error: unknown) => error instanceof SharedWordbookError && error.code === 'forbidden',
  );
});

test('re-publishing replaces the existing snapshot words and keeps the share id', async () => {
  const store = makeStore({
    projects: [{ id: 'p1', user_id: 'u1', title: 'List', description: null, icon_image: null, source_labels: [] }],
    words: [{ project_id: 'p1', english: 'one', japanese: '一', distractors: [], created_at: '2026-01-01T00:00:00Z' }],
  });
  const admin = new FakeAdmin(store);

  const first = await publishSharedWordbook('u1', 'p1', [], asAdmin(admin));
  store.words.push({ project_id: 'p1', english: 'two', japanese: '二', distractors: [], created_at: '2026-01-03T00:00:00Z' });
  const second = await publishSharedWordbook('u1', 'p1', [], asAdmin(admin));

  assert.equal(store.shared_wordbooks.length, 1, 'no duplicate snapshot row');
  assert.equal(store.shared_wordbook_words.length, 2, 'words re-copied');
  assert.equal(second.project.shareId, first.project.shareId, 'share id is stable across re-publish');
  assert.equal(second.wordCount, 2);
});

test('listPublicSharedWordbooks maps snapshot rows to cards', async () => {
  const store = makeStore({
    shared_wordbooks: [
      { id: 'sw1', share_id: 'abc', source_project_id: 'p1', user_id: 'u1', title: 'A', shared_tags: ['/toeic'], word_count: 3, like_count: 5, created_at: '2026-02-01T00:00:00Z' },
    ],
    profiles: [{ user_id: 'u1', username: 'taro', account_id: 'taro123' }],
  });
  const admin = new FakeAdmin(store);

  const payload = await listPublicSharedWordbooks({ limit: 10 }, asAdmin(admin));
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].project.shareId, 'abc');
  assert.equal(payload.items[0].wordCount, 3);
  assert.equal(payload.items[0].likeCount, 5);
  assert.equal(payload.items[0].ownerAccountId, 'taro123');
});

test('publishSharedWordbook snapshots the full multi-meaning translation list', async () => {
  const store = makeStore({
    projects: [{ id: 'p1', user_id: 'u1', title: 'Multi', description: null, icon_image: null, source_labels: [] }],
    words: [
      {
        project_id: 'p1',
        english: 'run',
        japanese: '走る',
        distractors: [],
        created_at: '2026-01-01T00:00:00Z',
        word_translations: [
          { translation_ja: '経営する', meaning_rank: 2, position: 1, is_primary: false, source: 'ai' },
          { translation_ja: '走る', meaning_rank: 1, position: 0, is_primary: true },
        ],
      },
    ],
  });
  const admin = new FakeAdmin(store);

  await publishSharedWordbook('u1', 'p1', [], asAdmin(admin));

  assert.equal(store.shared_wordbook_words.length, 1);
  assert.deepEqual(store.shared_wordbook_words[0].translations, [
    { translationJa: '走る', meaningRank: 1 },
    { translationJa: '経営する', meaningRank: 2, source: 'ai' },
  ], 'primary meaning first, all meanings kept');
});

test('getSharedWordbookPreview rehydrates snapshot translations onto words', async () => {
  const store = makeStore({
    shared_wordbooks: [
      { id: 'sw1', share_id: 'abc', source_project_id: 'p1', user_id: 'u1', title: 'A', shared_tags: [], word_count: 1, like_count: 0, created_at: '2026-02-01T00:00:00Z' },
    ],
    shared_wordbook_words: [
      {
        id: 'w1',
        shared_wordbook_id: 'sw1',
        position: 0,
        english: 'run',
        japanese: '走る',
        distractors: [],
        created_at: '2026-02-01T00:00:00Z',
        translations: [
          { translationJa: '走る', meaningRank: 1 },
          { translationJa: '経営する', meaningRank: 2 },
        ],
      },
    ],
  });
  const admin = new FakeAdmin(store);

  const preview = await getSharedWordbookPreview('abc', 5, asAdmin(admin));
  assert.ok(preview);
  const word = preview!.words[0];
  assert.equal(word.translations?.length, 2, 'both meanings survive the snapshot round-trip');
  assert.equal(word.translations?.[0].translationJa, '走る');
  assert.equal(word.translations?.[0].isPrimary, true);
  assert.equal(word.translations?.[1].translationJa, '経営する');
});

test('getSharedWordbookPreview returns mapped project and words', async () => {
  const store = makeStore({
    shared_wordbooks: [
      { id: 'sw1', share_id: 'abc', source_project_id: 'p1', user_id: 'u1', title: 'A', shared_tags: [], word_count: 1, like_count: 0, created_at: '2026-02-01T00:00:00Z' },
    ],
    shared_wordbook_words: [
      { id: 'w1', shared_wordbook_id: 'sw1', position: 0, english: 'cat', japanese: '猫', distractors: [], created_at: '2026-02-01T00:00:00Z' },
    ],
  });
  const admin = new FakeAdmin(store);

  const preview = await getSharedWordbookPreview('abc', 5, asAdmin(admin));
  assert.ok(preview);
  assert.equal(preview!.project.title, 'A');
  assert.equal(preview!.words.length, 1);
  assert.equal(preview!.words[0].english, 'cat');
  assert.equal(preview!.totalWordCount, 1);
});

test('getSharedWordbookPreview falls back and still loads when import_count column is missing', async () => {
  // 20260723130000 (import_count) マイグレーション未適用の環境でも共有単語帳を閲覧できること。
  // これがないと共有単語帳ページが500になり「共有単語帳が見れない」回帰になる。
  const row = {
    id: 'sw-imp',
    share_id: 'abc',
    source_project_id: 'p1',
    user_id: 'u1',
    title: 'マイグレーション前でも見える単語帳',
    description: null,
    icon_image: null,
    source_labels: [],
    shared_tags: [],
    word_count: 1,
    like_count: 0,
    created_at: '2026-07-23T00:00:00Z',
  };

  let importCountAttempted = false;
  const fakeAdmin = {
    from(table: string) {
      if (table === 'shared_wordbooks') {
        return {
          select: (cols: string) => ({
            eq: () => ({
              maybeSingle: async () => {
                if (cols.includes('import_count')) {
                  importCountAttempted = true;
                  return { data: null, error: { message: 'column shared_wordbooks.import_count does not exist' } };
                }
                return { data: row, error: null };
              },
            }),
          }),
        };
      }
      if (table === 'shared_wordbook_words') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            in: async () => ({ data: [], error: null }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };

  const preview = await getSharedWordbookPreview('abc', 5, fakeAdmin as never);
  assert.equal(importCountAttempted, true, 'primary select with import_count is attempted first');
  assert.ok(preview, 'preview is returned via the import_count-less fallback');
  assert.equal(preview!.project.title, 'マイグレーション前でも見える単語帳');
});

test('rename and unpublish enforce ownership', async () => {
  const store = makeStore({
    shared_wordbooks: [
      { id: 'sw1', share_id: 'abc', source_project_id: 'p1', user_id: 'u1', title: 'Old', shared_tags: [], word_count: 0, like_count: 0, created_at: '2026-02-01T00:00:00Z' },
    ],
  });
  const admin = new FakeAdmin(store);

  await assert.rejects(
    () => renameSharedWordbook('intruder', 'sw1', 'New', asAdmin(admin)),
    (error: unknown) => error instanceof SharedWordbookError && error.code === 'forbidden',
  );

  const renamed = await renameSharedWordbook('u1', 'sw1', 'New', asAdmin(admin));
  assert.equal(renamed.project.title, 'New');

  await assert.rejects(
    () => unpublishSharedWordbook('intruder', 'sw1', asAdmin(admin)),
    (error: unknown) => error instanceof SharedWordbookError && error.code === 'forbidden',
  );

  await unpublishSharedWordbook('u1', 'sw1', asAdmin(admin));
  assert.equal(store.shared_wordbooks.length, 0);
});

test('updateSharedWordbookTags enforces ownership and normalizes tags', async () => {
  const store = makeStore({
    shared_wordbooks: [
      { id: 'sw1', share_id: 'abc', source_project_id: 'p1', user_id: 'u1', title: 'A', shared_tags: ['old'], word_count: 0, like_count: 0, created_at: '2026-02-01T00:00:00Z' },
    ],
  });
  const admin = new FakeAdmin(store);

  await assert.rejects(
    () => updateSharedWordbookTags('intruder', 'sw1', ['#new'], asAdmin(admin)),
    (error: unknown) => error instanceof SharedWordbookError && error.code === 'forbidden',
  );

  const updated = await updateSharedWordbookTags('u1', 'sw1', ['#TOEIC', '#TOEIC', '#熟語'], asAdmin(admin));
  assert.deepEqual(updated.project.sharedTags, ['TOEIC', '熟語']);
  assert.deepEqual(store.shared_wordbooks[0].shared_tags, ['TOEIC', '熟語']);

  const cleared = await updateSharedWordbookTags('u1', 'sw1', [], asAdmin(admin));
  assert.deepEqual(cleared.project.sharedTags, []);
});

test('updateSharedWordbookTags keeps the auto EIKEN grade tag derived from the snapshot words', async () => {
  const store = makeStore({
    shared_wordbooks: [
      { id: 'sw1', share_id: 'abc', source_project_id: 'p1', user_id: 'u1', title: 'A', shared_tags: ['英検5級'], word_count: 3, like_count: 0, created_at: '2026-02-01T00:00:00Z' },
    ],
    shared_wordbook_words: [
      { id: 'w1', shared_wordbook_id: 'sw1', position: 0, english: 'apple', japanese: 'りんご', distractors: [], created_at: '2026-02-01T00:00:00Z' },
      { id: 'w2', shared_wordbook_id: 'sw1', position: 1, english: 'banana', japanese: 'バナナ', distractors: [], created_at: '2026-02-01T00:00:00Z' },
      { id: 'w3', shared_wordbook_id: 'sw1', position: 2, english: 'cat', japanese: '猫', distractors: [], created_at: '2026-02-01T00:00:00Z' },
    ],
    lexicon_entries: [
      { normalized_headword: 'apple', cefr_level: 'A1' },
      { normalized_headword: 'banana', cefr_level: 'A1' },
      { normalized_headword: 'cat', cefr_level: 'A1' },
    ],
  });
  const admin = new FakeAdmin(store);

  const updated = await updateSharedWordbookTags('u1', 'sw1', ['#TOEIC', '#英検1級'], asAdmin(admin));
  assert.deepEqual(updated.project.sharedTags, ['英検5級', 'TOEIC'], 'auto grade tag survives edits and user-supplied grades are replaced');
});

test('setSharedWordbookLike updates the denormalized like_count', async () => {
  const store = makeStore({
    shared_wordbooks: [
      { id: 'sw1', share_id: 'abc', source_project_id: 'p1', user_id: 'u1', title: 'A', shared_tags: [], word_count: 0, like_count: 0, created_at: '2026-02-01T00:00:00Z' },
    ],
  });
  const admin = new FakeAdmin(store);

  const liked = await setSharedWordbookLike('abc', 'viewer', true, asAdmin(admin));
  assert.equal(liked!.likeCount, 1);
  assert.equal(store.shared_wordbooks[0].like_count, 1);

  const unliked = await setSharedWordbookLike('abc', 'viewer', false, asAdmin(admin));
  assert.equal(unliked!.likeCount, 0);
  assert.equal(store.shared_wordbooks[0].like_count, 0);
});

test('listMySharedWordbooks returns owner cards', async () => {
  const store = makeStore({
    shared_wordbooks: [
      { id: 'sw1', share_id: 'abc', source_project_id: 'p1', user_id: 'u1', title: 'Mine', shared_tags: [], word_count: 2, like_count: 1, created_at: '2026-02-01T00:00:00Z' },
      { id: 'sw2', share_id: 'def', source_project_id: 'p2', user_id: 'other', title: 'Theirs', shared_tags: [], word_count: 0, like_count: 0, created_at: '2026-02-01T00:00:00Z' },
    ],
  });
  const admin = new FakeAdmin(store);

  const cards = await listMySharedWordbooks('u1', asAdmin(admin));
  assert.equal(cards.length, 1);
  assert.equal(cards[0].project.title, 'Mine');
  assert.equal(cards[0].accessRole, 'owner');
});
