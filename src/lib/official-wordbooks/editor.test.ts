import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_OFFICIAL_WORDBOOK_WORDS,
  buildOfficialWordbookMetadataUpdate,
  buildOfficialWordbookWordRows,
  chunkWordRows,
  findDuplicateEnglishTerms,
  formatOfficialWordbookWordsAsText,
  mapOfficialWordbookRow,
  mapOfficialWordbookWordRow,
  officialWordbookCreateSchema,
  officialWordbookUpdateSchema,
  officialWordbookWordInputSchema,
  parseOfficialWordbookWordsText,
} from './editor';

const VALID_METADATA = {
  slug: 'eiken-pre1-core-300',
  title: '英検準1級 必修単語 300',
  eikenLevel: 'pre1' as const,
};

test('officialWordbookCreateSchema accepts a full valid payload', () => {
  const result = officialWordbookCreateSchema.safeParse({
    ...VALID_METADATA,
    description: '過去5年の頻出語',
    isDefault: true,
    isActive: true,
    sourceLabels: ['official', 'eiken:pre1'],
    iconImage: '📘',
    sortOrder: 10,
    words: [
      { english: 'abandon', japanese: '見捨てる', distractors: ['受け入れる', '支持する', '修理する'] },
    ],
  });
  assert.equal(result.success, true);
});

test('officialWordbookCreateSchema rejects slugs the DB CHECK would reject', () => {
  for (const slug of ['A', 'Uppercase', 'has space', '-leading-hyphen', 'x', 'に本語']) {
    assert.equal(
      officialWordbookCreateSchema.safeParse({ ...VALID_METADATA, slug }).success,
      false,
      `expected slug "${slug}" to be rejected`,
    );
  }
  assert.equal(
    officialWordbookCreateSchema.safeParse({ ...VALID_METADATA, slug: 'a1_b-c' }).success,
    true,
  );
});

test('officialWordbookCreateSchema rejects unknown fields and empty titles', () => {
  assert.equal(
    officialWordbookCreateSchema.safeParse({ ...VALID_METADATA, isPublished: true }).success,
    false,
  );
  assert.equal(
    officialWordbookCreateSchema.safeParse({ ...VALID_METADATA, title: '   ' }).success,
    false,
  );
});

test('a default wordbook requires an EIKEN level', () => {
  assert.equal(
    officialWordbookCreateSchema.safeParse({ ...VALID_METADATA, eikenLevel: null, isDefault: true }).success,
    false,
  );
  assert.equal(
    officialWordbookUpdateSchema.safeParse({ isDefault: true, eikenLevel: null }).success,
    false,
  );
  // レベルを一緒に送っていれば通る
  assert.equal(
    officialWordbookUpdateSchema.safeParse({ isDefault: true, eikenLevel: '2' }).success,
    true,
  );
});

test('officialWordbookUpdateSchema rejects an empty update', () => {
  assert.equal(officialWordbookUpdateSchema.safeParse({}).success, false);
  assert.equal(officialWordbookUpdateSchema.safeParse({ isActive: false }).success, true);
});

test('word schema trims, defaults optional fields and caps the list', () => {
  const parsed = officialWordbookWordInputSchema.parse({ english: '  abandon  ' });
  assert.equal(parsed.english, 'abandon');
  assert.deepEqual(parsed.distractors, []);
  assert.equal(parsed.japanese, '');

  const oversized = Array.from({ length: MAX_OFFICIAL_WORDBOOK_WORDS + 1 }, (_, index) => ({
    english: `word${index}`,
  }));
  assert.equal(
    officialWordbookCreateSchema.safeParse({ ...VALID_METADATA, words: oversized }).success,
    false,
  );
});

test('findDuplicateEnglishTerms matches the DB unique index (case/whitespace insensitive)', () => {
  const duplicates = findDuplicateEnglishTerms([
    { english: 'abandon' },
    { english: ' Abandon ' },
    { english: 'brief' },
    { english: 'BRIEF' },
    { english: 'candid' },
  ]);
  assert.deepEqual(duplicates, ['abandon', 'brief']);
  assert.deepEqual(findDuplicateEnglishTerms([{ english: 'a' }, { english: 'b' }]), []);
});

test('buildOfficialWordbookWordRows emits identical key sets for every row (PGRST102)', () => {
  const rows = buildOfficialWordbookWordRows('book-1', [
    officialWordbookWordInputSchema.parse({ english: 'abandon', japanese: '見捨てる' }),
    officialWordbookWordInputSchema.parse({
      english: 'brief',
      japanese: '簡潔な',
      distractors: ['長い', '重い', '暗い'],
      exampleSentence: 'Keep it brief.',
      pronunciation: '/briːf/',
      partOfSpeechTags: ['形容詞'],
    }),
  ]);

  const [first, second] = rows;
  assert.deepEqual(Object.keys(first).sort(), Object.keys(second).sort());
  assert.equal(first.official_wordbook_id, 'book-1');
  assert.equal(first.sort_order, 0);
  assert.equal(second.sort_order, 1);
  // 未入力の任意項目は undefined ではなく明示的な null になる
  assert.equal(first.example_sentence, null);
  assert.equal(first.part_of_speech_tags, null);
  assert.deepEqual(first.custom_sections, []);
  assert.equal(second.example_sentence, 'Keep it brief.');
});

test('chunkWordRows splits into fixed-size batches', () => {
  assert.deepEqual(chunkWordRows([], 2), []);
  assert.deepEqual(chunkWordRows([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test('parseOfficialWordbookWordsText reads tab-separated rows', () => {
  const { words, errors } = parseOfficialWordbookWordsText(
    [
      '# コメント行は無視される',
      '',
      'abandon\t見捨てる\t受け入れる|支持する|修理する\tHe abandoned the old car.\t彼は古い車を捨てた。\t/əˈbændən/\t動詞',
      'brief\t簡潔な',
    ].join('\n'),
  );

  assert.deepEqual(errors, []);
  assert.equal(words.length, 2);
  assert.equal(words[0].english, 'abandon');
  assert.deepEqual(words[0].distractors, ['受け入れる', '支持する', '修理する']);
  assert.equal(words[0].exampleSentenceJa, '彼は古い車を捨てた。');
  assert.deepEqual(words[0].partOfSpeechTags, ['動詞']);
  assert.equal(words[1].japanese, '簡潔な');
  assert.deepEqual(words[1].distractors, []);
});

test('parseOfficialWordbookWordsText never splits a tabbed line on commas', () => {
  const { words } = parseOfficialWordbookWordsText(
    'abandon\t見捨てる\t\tWhen it rains, he abandons the plan.',
  );
  assert.equal(words[0].exampleSentence, 'When it rains, he abandons the plan.');
});

test('parseOfficialWordbookWordsText falls back to commas only without tabs', () => {
  const { words } = parseOfficialWordbookWordsText('abandon,見捨てる,受け入れる|支持する');
  assert.equal(words[0].japanese, '見捨てる');
  assert.deepEqual(words[0].distractors, ['受け入れる', '支持する']);
});

test('parseOfficialWordbookWordsText reports the offending line number', () => {
  const { words, errors } = parseOfficialWordbookWordsText(['abandon\t見捨てる', '\t訳だけの行'].join('\n'));
  assert.equal(words.length, 1);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^2行目:/);
});

test('formatOfficialWordbookWordsAsText round-trips through the parser', () => {
  const original = parseOfficialWordbookWordsText(
    'abandon\t見捨てる\t受け入れる|支持する\tHe abandoned it.\t彼はそれを捨てた。\t/əˈbændən/\t動詞',
  ).words;
  const roundTripped = parseOfficialWordbookWordsText(formatOfficialWordbookWordsAsText(original)).words;
  assert.deepEqual(roundTripped, original);
});

test('mapOfficialWordbookRow normalizes DB rows and embedded counts', () => {
  const mapped = mapOfficialWordbookRow({
    id: 'id-1',
    slug: 'eiken-2-core',
    title: '英検2級コア',
    description: '   ',
    eiken_level: '2',
    is_default: true,
    is_active: false,
    source_labels: ['official', '', 'eiken:2'],
    icon_image: null,
    sort_order: 3,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-02T00:00:00Z',
    official_wordbook_words: [{ count: 42 }],
  });

  assert.equal(mapped.description, null);
  assert.equal(mapped.eikenLevel, '2');
  assert.equal(mapped.isDefault, true);
  assert.equal(mapped.isActive, false);
  assert.deepEqual(mapped.sourceLabels, ['official', 'eiken:2']);
  assert.equal(mapped.wordCount, 42);
});

test('mapOfficialWordbookRow tolerates missing counts and bad levels', () => {
  const mapped = mapOfficialWordbookRow({
    id: 'id-2',
    slug: 'misc',
    title: 'その他',
    eiken_level: 'pre3',
    source_labels: null,
    created_at: '',
    updated_at: '',
  });
  assert.equal(mapped.eikenLevel, null);
  assert.equal(mapped.wordCount, null);
  assert.deepEqual(mapped.sourceLabels, ['official']);
  assert.equal(mapped.sortOrder, 0);
});

test('mapOfficialWordbookWordRow produces editor-shaped words', () => {
  const mapped = mapOfficialWordbookWordRow({
    english: ' abandon ',
    japanese: null,
    distractors: ['受け入れる', 5, '支持する'],
    example_sentence: null,
    part_of_speech_tags: ['動詞'],
    vocabulary_type: 'nonsense',
  });
  assert.equal(mapped.english, 'abandon');
  assert.equal(mapped.japanese, '');
  assert.deepEqual(mapped.distractors, ['受け入れる', '支持する']);
  assert.equal(mapped.exampleSentence, '');
  assert.equal(mapped.vocabularyType, null);
  assert.equal(officialWordbookWordInputSchema.safeParse(mapped).success, true);
});

test('buildOfficialWordbookMetadataUpdate only includes provided fields', () => {
  assert.deepEqual(buildOfficialWordbookMetadataUpdate({ isActive: true }), { is_active: true });
  assert.deepEqual(
    buildOfficialWordbookMetadataUpdate({ description: '  ', eikenLevel: null, sortOrder: 5 }),
    { description: null, eiken_level: null, sort_order: 5 },
  );
  // words は単語の総入れ替え用でメタ更新には含めない
  assert.deepEqual(buildOfficialWordbookMetadataUpdate({ words: [] }), {});
});
