import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getPublicOfficialWordbook,
  listPublicOfficialWordbooks,
} from './catalog';

type WordbookRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  eiken_level: string | null;
  source_labels: string[];
  icon_image: string | null;
  sort_order: number;
  created_at: string;
  is_active: boolean;
  official_wordbook_words?: { count: number }[];
};

type WordRow = {
  id: string;
  official_wordbook_id: string;
  english: string;
  japanese: string | null;
  translations: unknown;
  distractors: unknown;
  pronunciation: string | null;
  example_sentence: string | null;
  example_sentence_ja: string | null;
  part_of_speech_tags: string[] | null;
  vocabulary_type: string | null;
  sort_order: number;
  created_at: string;
};

type FakeAdmin = Parameters<typeof listPublicOfficialWordbooks>[1];

const WORDBOOKS: WordbookRow[] = [
  {
    id: 'book-pre1',
    slug: 'eiken-pre1-core',
    title: '英検準1級 コア単語',
    description: '準1級の頻出語',
    eiken_level: 'pre1',
    source_labels: ['official', 'eiken:pre1'],
    icon_image: null,
    sort_order: 0,
    created_at: '2026-06-01T00:00:00Z',
    is_active: true,
    official_wordbook_words: [{ count: 420 }],
  },
  {
    id: 'book-3',
    slug: 'eiken-3-basic',
    title: '英検3級 基礎単語',
    description: null,
    eiken_level: '3',
    source_labels: ['official'],
    icon_image: null,
    sort_order: 0,
    created_at: '2026-06-02T00:00:00Z',
    is_active: true,
    official_wordbook_words: [{ count: 200 }],
  },
  {
    id: 'book-none',
    slug: 'toeic-starter',
    title: 'TOEIC入門',
    description: null,
    eiken_level: null,
    source_labels: ['official'],
    icon_image: null,
    sort_order: 0,
    created_at: '2026-06-03T00:00:00Z',
    is_active: true,
    official_wordbook_words: [{ count: 10 }],
  },
  {
    id: 'book-hidden',
    slug: 'draft-book',
    title: '未公開の下書き',
    description: null,
    eiken_level: '2',
    source_labels: ['official'],
    icon_image: null,
    sort_order: 0,
    created_at: '2026-06-04T00:00:00Z',
    is_active: false,
  },
];

const WORDS: WordRow[] = [
  {
    id: 'word-1',
    official_wordbook_id: 'book-pre1',
    english: 'abandon',
    japanese: '見捨てる',
    translations: [{ translationJa: '見捨てる', meaningRank: 1, source: 'ai' }],
    distractors: ['keep', 'hold', 'gather'],
    pronunciation: 'əˈbændən',
    example_sentence: 'They abandoned the plan.',
    example_sentence_ja: '彼らはその計画を断念した。',
    part_of_speech_tags: ['動詞'],
    vocabulary_type: 'active',
    sort_order: 0,
    created_at: '2026-06-01T00:00:00Z',
  },
  {
    id: 'word-2',
    official_wordbook_id: 'book-pre1',
    english: 'benefit',
    japanese: '利益',
    translations: null,
    distractors: null,
    pronunciation: null,
    example_sentence: null,
    example_sentence_ja: null,
    part_of_speech_tags: null,
    vocabulary_type: null,
    sort_order: 1,
    created_at: '2026-06-01T00:00:01Z',
  },
  {
    id: 'word-3',
    official_wordbook_id: 'book-pre1',
    english: '   ',
    japanese: '空行',
    translations: null,
    distractors: null,
    pronunciation: null,
    example_sentence: null,
    example_sentence_ja: null,
    part_of_speech_tags: null,
    vocabulary_type: null,
    sort_order: 2,
    created_at: '2026-06-01T00:00:02Z',
  },
];

type Filters = Record<string, unknown>;

/**
 * PostgREST のクエリビルダを最小限だけ模したフェイク。
 * `.select().eq().limit()` も `.select().eq().order()...` も await できるよう
 * ビルダ自身を thenable にしている。
 */
function buildWordbooksBuilder(rows: WordbookRow[], options: { countRelationBroken?: boolean } = {}) {
  const filters: Filters = {};
  let selectedCount = false;

  const apply = () => rows.filter((row) => (
    Object.entries(filters).every(([column, value]) => (row as unknown as Filters)[column] === value)
  ));

  // 選択していない列は返らない、という PostgREST の挙動をざっくり再現する。
  const project = (row: WordbookRow) => {
    const copy: Record<string, unknown> = { ...row };
    delete copy.is_active;
    if (!selectedCount) delete copy.official_wordbook_words;
    return copy;
  };

  const result = () => {
    if (selectedCount && options.countRelationBroken) {
      return { data: null, error: { message: 'could not find relation' } };
    }
    return { data: apply().map(project), error: null };
  };

  const builder = {
    select: (columns: string) => {
      selectedCount = columns.includes('official_wordbook_words(count)');
      return builder;
    },
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return builder;
    },
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => {
      const [row] = apply();
      return { data: row ? { ...row } : null, error: null };
    },
    then: (resolve: (value: unknown) => void) => resolve(result()),
  };

  return builder;
}

function buildWordsBuilder(rows: WordRow[]) {
  const filters: Filters = {};
  let limit: number | null = null;

  const apply = () => rows
    .filter((row) => Object.entries(filters).every(([column, value]) => (row as unknown as Filters)[column] === value))
    .sort((a, b) => a.sort_order - b.sort_order);

  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return builder;
    },
    order: () => builder,
    limit: (size: number) => {
      limit = size;
      return builder;
    },
    then: (resolve: (value: unknown) => void) => {
      const matched = apply();
      resolve({
        data: limit === null ? matched : matched.slice(0, limit),
        count: matched.length,
        error: null,
      });
    },
  };

  return builder;
}

function buildFakeAdmin(options: { wordbooks?: WordbookRow[]; countRelationBroken?: boolean } = {}): FakeAdmin {
  const wordbooks = options.wordbooks ?? WORDBOOKS;
  return {
    from(table: string) {
      if (table === 'official_wordbooks') {
        return buildWordbooksBuilder(wordbooks, { countRelationBroken: options.countRelationBroken });
      }
      if (table === 'official_wordbook_words') {
        return buildWordsBuilder(WORDS);
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as FakeAdmin;
}

test('listPublicOfficialWordbooks は公開中のみを英検レベル順で返す', async () => {
  const payload = await listPublicOfficialWordbooks({}, buildFakeAdmin());

  assert.deepEqual(payload.items.map((item) => item.slug), [
    'eiken-3-basic',
    'eiken-pre1-core',
    'toeic-starter',
  ]);
  assert.equal(payload.items[0]?.eikenLabel, '英検3級');
  assert.equal(payload.items[1]?.wordCount, 420);
  assert.equal(payload.nextCursor, null);
});

test('listPublicOfficialWordbooks はタイトル・英検レベルで検索できる', async () => {
  const byTitle = await listPublicOfficialWordbooks({ query: 'TOEIC' }, buildFakeAdmin());
  assert.deepEqual(byTitle.items.map((item) => item.slug), ['toeic-starter']);

  const byLevel = await listPublicOfficialWordbooks({ query: '英検準1級' }, buildFakeAdmin());
  assert.deepEqual(byLevel.items.map((item) => item.slug), ['eiken-pre1-core']);
});

test('listPublicOfficialWordbooks はカーソルで次ページを返す', async () => {
  const first = await listPublicOfficialWordbooks({ limit: 2 }, buildFakeAdmin());
  assert.equal(first.items.length, 2);
  assert.ok(first.nextCursor);

  const second = await listPublicOfficialWordbooks(
    { limit: 2, cursor: first.nextCursor },
    buildFakeAdmin(),
  );
  assert.deepEqual(second.items.map((item) => item.slug), ['toeic-starter']);
  assert.equal(second.nextCursor, null);
});

test('listPublicOfficialWordbooks は埋め込みカウントが引けなくても一覧を返す', async () => {
  const payload = await listPublicOfficialWordbooks({}, buildFakeAdmin({ countRelationBroken: true }));

  assert.equal(payload.items.length, 3);
  assert.equal(payload.items[0]?.wordCount, null);
});

test('getPublicOfficialWordbook は単語を整形して返し、空の見出し語を落とす', async () => {
  const detail = await getPublicOfficialWordbook('eiken-pre1-core', {}, buildFakeAdmin());

  assert.ok(detail);
  assert.equal(detail.wordbook.title, '英検準1級 コア単語');
  assert.equal(detail.previewOnly, false);
  // 空行を除いた2語。全体件数は count 由来なので3語のうち有効な行だけが並ぶ。
  assert.deepEqual(detail.words.map((word) => word.english), ['abandon', 'benefit']);
  assert.deepEqual(detail.words[0]?.translations, [
    { translationJa: '見捨てる', meaningRank: 1, source: 'ai' },
  ]);
  assert.equal(detail.words[0]?.vocabularyType, 'active');
  assert.deepEqual(detail.words[1]?.distractors, []);
  assert.equal(detail.words[1]?.pronunciation, undefined);
});

test('getPublicOfficialWordbook は wordLimit 指定でプレビューを返す', async () => {
  const detail = await getPublicOfficialWordbook('eiken-pre1-core', { wordLimit: 1 }, buildFakeAdmin());

  assert.ok(detail);
  assert.equal(detail.words.length, 1);
  assert.equal(detail.totalWordCount, 3);
  assert.equal(detail.previewOnly, true);
});

test('getPublicOfficialWordbook は非公開・存在しない slug に null を返す', async () => {
  const hidden = await getPublicOfficialWordbook('draft-book', {}, buildFakeAdmin());
  assert.equal(hidden, null);

  const missing = await getPublicOfficialWordbook('does-not-exist', {}, buildFakeAdmin());
  assert.equal(missing, null);

  const empty = await getPublicOfficialWordbook('   ', {}, buildFakeAdmin());
  assert.equal(empty, null);
});
