import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STUDY_REMINDER_WORD_COUNT,
  buildStudyReminderQuizUrl,
  formatStudyReminderBody,
  pickStudyReminderWords,
  type StudyReminderWordPick,
} from './study-reminder-words';

type QueryResult = { data: unknown[] | null; error: { message: string } | null };

class FakeQuery {
  readonly filters: Array<{ method: string; args: unknown[] }> = [];

  constructor(private readonly result: QueryResult) {}

  select(...args: unknown[]) { this.filters.push({ method: 'select', args }); return this; }
  eq(...args: unknown[]) { this.filters.push({ method: 'eq', args }); return this; }
  not(...args: unknown[]) { this.filters.push({ method: 'not', args }); return this; }
  lte(...args: unknown[]) { this.filters.push({ method: 'lte', args }); return this; }
  order(...args: unknown[]) { this.filters.push({ method: 'order', args }); return this; }
  async limit(...args: unknown[]) { this.filters.push({ method: 'limit', args }); return this.result; }
}

class FakeAdmin {
  readonly queries: Record<string, FakeQuery> = {};

  constructor(private readonly results: Record<string, QueryResult>) {}

  from(table: string) {
    const query = new FakeQuery(this.results[table] ?? { data: [], error: null });
    this.queries[table] = query;
    return query;
  }
}

test('buildStudyReminderQuizUrl returns plain reminder url without word ids', () => {
  assert.equal(buildStudyReminderQuizUrl([]), '/quiz/all?reminder=1&count=10');
});

test('buildStudyReminderQuizUrl embeds up to five priority word ids', () => {
  const url = buildStudyReminderQuizUrl(['a', 'b', 'c', 'd', 'e', 'f']);
  assert.equal(url, `/quiz/all?reminder=1&count=10&priority=${encodeURIComponent('a,b,c,d,e')}`);
});

test('formatStudyReminderBody falls back to generic message without picks', () => {
  assert.equal(
    formatStudyReminderBody('朝', []),
    '朝の単語復習の時間です。今日の学習を始めましょう。',
  );
});

test('formatStudyReminderBody lists due review words', () => {
  const picks: StudyReminderWordPick[] = [
    { id: '1', english: 'apple', kind: 'review' },
    { id: '2', english: 'run', kind: 'review' },
  ];
  assert.equal(
    formatStudyReminderBody('夜', picks),
    '夜の単語復習の時間です。「apple」「run」の復習時期が近づいています。タップして10問クイズに挑戦しましょう。',
  );
});

test('formatStudyReminderBody mentions recently mistaken words', () => {
  const picks: StudyReminderWordPick[] = [
    { id: '1', english: 'apple', kind: 'review' },
    { id: '2', english: 'run', kind: 'wrong' },
  ];
  assert.equal(
    formatStudyReminderBody('朝', picks),
    '朝の単語復習の時間です。「apple」が復習時期です。最近間違えた「run」も一緒に復習しましょう。タップして10問クイズに挑戦しましょう。',
  );

  const onlyWrong: StudyReminderWordPick[] = [
    { id: '2', english: 'run', kind: 'wrong' },
  ];
  assert.equal(
    formatStudyReminderBody('朝', onlyWrong),
    '朝の単語復習の時間です。最近間違えた「run」を復習しましょう。タップして10問クイズに挑戦しましょう。',
  );
});

test('pickStudyReminderWords prefers due review words and pads with wrong answers', async () => {
  const admin = new FakeAdmin({
    words: {
      data: [
        { id: 'w1', english: 'apple', next_review_at: '2026-06-11T00:00:00.000Z' },
        { id: 'w2', english: 'run', next_review_at: '2026-06-11T01:00:00.000Z' },
      ],
      error: null,
    },
    user_wrong_answers: {
      data: [
        { word_id: 'w2', english: 'run', last_wrong_at: '2026-06-10T00:00:00.000Z' },
        { word_id: 'w3', english: 'dog', last_wrong_at: '2026-06-09T00:00:00.000Z' },
        { word_id: 'w4', english: 'cat', last_wrong_at: '2026-06-08T00:00:00.000Z' },
      ],
      error: null,
    },
  });

  const picks = await pickStudyReminderWords(
    admin as never,
    'user-1',
    new Date('2026-06-11T00:00:00.000Z'),
  );

  assert.deepEqual(picks, [
    { id: 'w1', english: 'apple', kind: 'review' },
    { id: 'w2', english: 'run', kind: 'review' },
    { id: 'w3', english: 'dog', kind: 'wrong' },
    { id: 'w4', english: 'cat', kind: 'wrong' },
  ]);

  const wordFilters = admin.queries.words.filters;
  assert.ok(wordFilters.some((f) => f.method === 'eq' && f.args[0] === 'projects.user_id' && f.args[1] === 'user-1'));
  assert.ok(wordFilters.some((f) => f.method === 'lte' && f.args[0] === 'next_review_at'));
});

test('pickStudyReminderWords caps picks at five and skips wrong-answer query when full', async () => {
  const reviewRows = Array.from({ length: 5 }, (_, index) => ({
    id: `w${index}`,
    english: `word${index}`,
    next_review_at: '2026-06-11T00:00:00.000Z',
  }));
  const admin = new FakeAdmin({
    words: { data: reviewRows, error: null },
    user_wrong_answers: { data: [{ word_id: 'x', english: 'extra', last_wrong_at: '2026-06-10T00:00:00.000Z' }], error: null },
  });

  const picks = await pickStudyReminderWords(admin as never, 'user-1');

  assert.equal(picks.length, STUDY_REMINDER_WORD_COUNT);
  assert.ok(picks.every((pick) => pick.kind === 'review'));
  assert.equal(admin.queries.user_wrong_answers, undefined);
});

test('pickStudyReminderWords returns wrong answers when no review words exist', async () => {
  const admin = new FakeAdmin({
    words: { data: [], error: null },
    user_wrong_answers: {
      data: [{ word_id: 'w9', english: 'mistake', last_wrong_at: '2026-06-10T00:00:00.000Z' }],
      error: null,
    },
  });

  const picks = await pickStudyReminderWords(admin as never, 'user-1');
  assert.deepEqual(picks, [{ id: 'w9', english: 'mistake', kind: 'wrong' }]);
});
