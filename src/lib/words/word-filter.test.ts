import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  DEFAULT_WORD_FILTER,
  clearFilterConditions,
  countActiveFilters,
  describeActiveFilters,
  deriveFilterOptions,
  filterAndSortWords,
  hasFeature,
  matchesWordFilter,
  nextTriState,
  summarizeStatuses,
  toggleValue,
  type WordFilterState,
  type WordListEntry,
} from './word-filter';
import type { Word } from '@/types';

const NOW = new Date('2026-08-14T00:00:00.000Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

function makeWord(overrides: Partial<Word> = {}): Word {
  return {
    id: overrides.id ?? 'w1',
    projectId: overrides.projectId ?? 'p1',
    english: 'apple',
    japanese: 'りんご',
    distractors: [],
    status: 'new',
    createdAt: new Date(NOW).toISOString(),
    easeFactor: 2.5,
    intervalDays: 0,
    repetition: 0,
    isFavorite: false,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<WordListEntry> = {}): WordListEntry {
  return {
    word: overrides.word ?? makeWord(),
    projectId: overrides.projectId ?? overrides.word?.projectId ?? 'p1',
    projectTitle: overrides.projectTitle ?? '英単語帳',
    binder: overrides.binder ?? null,
    wrongCount: overrides.wrongCount ?? 0,
  };
}

function withFilter(overrides: Partial<WordFilterState>): WordFilterState {
  return { ...DEFAULT_WORD_FILTER, ...overrides };
}

describe('matchesWordFilter', () => {
  it('全条件が既定値なら素通しする', () => {
    assert.equal(matchesWordFilter(makeEntry(), DEFAULT_WORD_FILTER, NOW), true);
  });

  it('英語・日本語・訳・例文・単語帳名を横断して検索する', () => {
    const entry = makeEntry({
      word: makeWord({
        english: 'reluctant',
        japanese: '気が進まない',
        exampleSentence: 'She was reluctant to leave.',
        translations: [
          { translationJa: 'しぶしぶの', normalizedTranslationJa: 'しぶしぶの', meaningRank: 1, position: 0, isPrimary: true },
        ],
      }),
      projectTitle: 'システム英単語',
    });

    for (const query of ['reluct', '気が進', 'しぶしぶ', 'to leave', 'システム']) {
      assert.equal(matchesWordFilter(entry, withFilter({ query }), NOW), true, query);
    }
    assert.equal(matchesWordFilter(entry, withFilter({ query: 'zzz' }), NOW), false);
  });

  it('検索は大文字小文字を区別しない', () => {
    const entry = makeEntry({ word: makeWord({ english: 'Apple' }) });
    assert.equal(matchesWordFilter(entry, withFilter({ query: 'aPPle' }), NOW), true);
  });

  it('ブックマークで絞る / 除外する', () => {
    const fav = makeEntry({ word: makeWord({ isFavorite: true }) });
    const plain = makeEntry({ word: makeWord({ isFavorite: false }) });

    assert.equal(matchesWordFilter(fav, withFilter({ favorite: 'only' }), NOW), true);
    assert.equal(matchesWordFilter(plain, withFilter({ favorite: 'only' }), NOW), false);
    assert.equal(matchesWordFilter(fav, withFilter({ favorite: 'exclude' }), NOW), false);
    assert.equal(matchesWordFilter(plain, withFilter({ favorite: 'exclude' }), NOW), true);
  });

  it('ステータスは選択したものの OR で絞る', () => {
    const review = makeEntry({ word: makeWord({ status: 'review' }) });
    const mastered = makeEntry({ word: makeWord({ status: 'mastered' }) });
    const filter = withFilter({ statuses: ['review', 'active'] });

    assert.equal(matchesWordFilter(review, filter, NOW), true);
    assert.equal(matchesWordFilter(mastered, filter, NOW), false);
  });

  it('未分類バインダーは空文字で選択できる', () => {
    const uncategorized = makeEntry({ binder: null });
    const filed = makeEntry({ binder: '受験' });

    assert.equal(matchesWordFilter(uncategorized, withFilter({ binders: [''] }), NOW), true);
    assert.equal(matchesWordFilter(filed, withFilter({ binders: [''] }), NOW), false);
    assert.equal(matchesWordFilter(filed, withFilter({ binders: ['受験'] }), NOW), true);
  });

  it('語彙タイプ未設定は unset として選べる', () => {
    const unset = makeEntry({ word: makeWord({ vocabularyType: null }) });
    const active = makeEntry({ word: makeWord({ vocabularyType: 'active' }) });

    assert.equal(matchesWordFilter(unset, withFilter({ vocabularyTypes: ['unset'] }), NOW), true);
    assert.equal(matchesWordFilter(active, withFilter({ vocabularyTypes: ['unset'] }), NOW), false);
    assert.equal(matchesWordFilter(active, withFilter({ vocabularyTypes: ['active', 'passive'] }), NOW), true);
  });

  it('品詞は1つでも一致すれば通す', () => {
    const entry = makeEntry({ word: makeWord({ partOfSpeechTags: ['動詞', '名詞'] }) });
    assert.equal(matchesWordFilter(entry, withFilter({ partOfSpeech: ['名詞'] }), NOW), true);
    assert.equal(matchesWordFilter(entry, withFilter({ partOfSpeech: ['形容詞'] }), NOW), false);
  });

  it('CEFRレベル未設定の単語はレベル指定で落ちる', () => {
    const b2 = makeEntry({ word: makeWord({ cefrLevel: 'B2' }) });
    const none = makeEntry({ word: makeWord({ cefrLevel: undefined }) });
    const filter = withFilter({ cefrLevels: ['B2', 'C1'] });

    assert.equal(matchesWordFilter(b2, filter, NOW), true);
    assert.equal(matchesWordFilter(none, filter, NOW), false);
  });

  it('要素の有無は has / none の両方向で絞れる', () => {
    const withExample = makeEntry({ word: makeWord({ exampleSentence: 'An apple a day.' }) });
    const withoutExample = makeEntry({ word: makeWord({ exampleSentence: '   ' }) });

    assert.equal(matchesWordFilter(withExample, withFilter({ features: { example: 'has' } }), NOW), true);
    assert.equal(matchesWordFilter(withoutExample, withFilter({ features: { example: 'has' } }), NOW), false);
    assert.equal(matchesWordFilter(withoutExample, withFilter({ features: { example: 'none' } }), NOW), true);
    assert.equal(matchesWordFilter(withExample, withFilter({ features: { example: 'off' } }), NOW), true);
  });

  it('複数の要素条件は AND で効く', () => {
    const entry = makeEntry({
      word: makeWord({ exampleSentence: 'x', pronunciation: undefined }),
    });
    const filter = withFilter({ features: { example: 'has', pronunciation: 'has' } });
    assert.equal(matchesWordFilter(entry, filter, NOW), false);
  });

  it('復習期限で due / scheduled / never を切り分ける', () => {
    const due = makeEntry({
      word: makeWord({
        lastReviewedAt: new Date(NOW - 5 * DAY).toISOString(),
        nextReviewAt: new Date(NOW - DAY).toISOString(),
      }),
    });
    const scheduled = makeEntry({
      word: makeWord({
        lastReviewedAt: new Date(NOW - DAY).toISOString(),
        nextReviewAt: new Date(NOW + DAY).toISOString(),
      }),
    });
    const never = makeEntry({ word: makeWord({ lastReviewedAt: undefined, nextReviewAt: undefined }) });

    assert.equal(matchesWordFilter(due, withFilter({ review: 'due' }), NOW), true);
    assert.equal(matchesWordFilter(scheduled, withFilter({ review: 'due' }), NOW), false);
    assert.equal(matchesWordFilter(scheduled, withFilter({ review: 'scheduled' }), NOW), true);
    assert.equal(matchesWordFilter(never, withFilter({ review: 'never' }), NOW), true);
    assert.equal(matchesWordFilter(due, withFilter({ review: 'never' }), NOW), false);
    assert.equal(matchesWordFilter(never, withFilter({ review: 'due' }), NOW), false);
  });

  it('追加日は指定期間内だけ通す', () => {
    const old = makeEntry({ word: makeWord({ createdAt: new Date(NOW - 40 * DAY).toISOString() }) });
    const recent = makeEntry({ word: makeWord({ createdAt: new Date(NOW - 3 * DAY).toISOString() }) });

    assert.equal(matchesWordFilter(recent, withFilter({ created: 'week' }), NOW), true);
    assert.equal(matchesWordFilter(old, withFilter({ created: 'week' }), NOW), false);
    assert.equal(matchesWordFilter(old, withFilter({ created: 'any' }), NOW), true);
  });

  it('反復回数の帯で絞る', () => {
    const zero = makeEntry({ word: makeWord({ repetition: 0 }) });
    const low = makeEntry({ word: makeWord({ repetition: 2 }) });
    const high = makeEntry({ word: makeWord({ repetition: 7 }) });

    assert.equal(matchesWordFilter(zero, withFilter({ repetition: 'zero' }), NOW), true);
    assert.equal(matchesWordFilter(low, withFilter({ repetition: 'low' }), NOW), true);
    assert.equal(matchesWordFilter(low, withFilter({ repetition: 'high' }), NOW), false);
    assert.equal(matchesWordFilter(high, withFilter({ repetition: 'high' }), NOW), true);
  });

  it('複数軸を組み合わせるとすべて満たすものだけ残る', () => {
    const entry = makeEntry({
      word: makeWord({ status: 'review', isFavorite: true, cefrLevel: 'B2', exampleSentence: 'x' }),
      wrongCount: 3,
    });
    const filter = withFilter({
      statuses: ['review'],
      favorite: 'only',
      cefrLevels: ['B2'],
      features: { example: 'has', wrong: 'has' },
    });
    assert.equal(matchesWordFilter(entry, filter, NOW), true);
    assert.equal(
      matchesWordFilter({ ...entry, wrongCount: 0 }, filter, NOW),
      false,
    );
  });
});

describe('hasFeature', () => {
  it('none フラグ付きの語源・派生語は「持っていない」扱い', () => {
    const morphologyNone = makeEntry({
      word: makeWord({ morphology: { formula: [], explanation: '', version: 1, none: true } }),
    });
    const derivedNone = makeEntry({
      word: makeWord({ derivedWords: { items: [], version: 1, none: true } }),
    });
    assert.equal(hasFeature(morphologyNone, 'morphology'), false);
    assert.equal(hasFeature(derivedNone, 'derived'), false);
  });

  it('語源・派生語が中身を持つときだけ true', () => {
    const morphology = makeEntry({
      word: makeWord({
        morphology: {
          formula: [{ text: 'un', kind: 'prefix', meaningJa: '否定' }],
          explanation: '否定の接頭辞',
          version: 1,
        },
      }),
    });
    const derived = makeEntry({
      word: makeWord({
        derivedWords: {
          items: [{ english: 'reception', japanese: '受付', partOfSpeech: 'noun' }],
          version: 1,
        },
      }),
    });
    assert.equal(hasFeature(morphology, 'morphology'), true);
    assert.equal(hasFeature(derived, 'derived'), true);
  });

  it('複数の意味は空文字の訳を数えない', () => {
    const single = makeEntry({
      word: makeWord({
        translations: [
          { translationJa: 'りんご', normalizedTranslationJa: 'りんご', meaningRank: 1, position: 0, isPrimary: true },
          { translationJa: '  ', normalizedTranslationJa: '', meaningRank: 2, position: 1, isPrimary: false },
        ],
      }),
    });
    assert.equal(hasFeature(single, 'multiMeaning'), false);
  });

  it('メモは中身が空なら持っていない扱い', () => {
    const empty = makeEntry({
      word: makeWord({ customSections: [{ id: 'c1', title: 'メモ', content: '  ' }] }),
    });
    const filled = makeEntry({
      word: makeWord({ customSections: [{ id: 'c1', title: 'メモ', content: '出典: 2024年度' }] }),
    });
    assert.equal(hasFeature(empty, 'custom'), false);
    assert.equal(hasFeature(filled, 'custom'), true);
  });
});

describe('filterAndSortWords', () => {
  const apple = makeEntry({
    word: makeWord({ id: 'a', english: 'apple', japanese: 'りんご', status: 'mastered', createdAt: new Date(NOW - 3 * DAY).toISOString() }),
    projectTitle: 'B帳',
    wrongCount: 1,
  });
  const banana = makeEntry({
    word: makeWord({ id: 'b', english: 'banana', japanese: 'ばなな', status: 'new', createdAt: new Date(NOW - DAY).toISOString(), nextReviewAt: new Date(NOW + DAY).toISOString() }),
    projectTitle: 'A帳',
    wrongCount: 5,
  });
  const cherry = makeEntry({
    word: makeWord({ id: 'c', english: 'cherry', japanese: 'さくらんぼ', status: 'review', createdAt: new Date(NOW - 10 * DAY).toISOString(), nextReviewAt: new Date(NOW - DAY).toISOString() }),
    projectTitle: 'C帳',
    wrongCount: 0,
  });
  const entries = [apple, banana, cherry];

  const ids = (list: WordListEntry[]) => list.map((entry) => entry.word.id);

  it('既定は追加が新しい順', () => {
    assert.deepEqual(ids(filterAndSortWords(entries, DEFAULT_WORD_FILTER, NOW)), ['b', 'a', 'c']);
  });

  it('各並べ替えキーが効く', () => {
    assert.deepEqual(ids(filterAndSortWords(entries, withFilter({ sort: 'created-asc' }), NOW)), ['c', 'a', 'b']);
    assert.deepEqual(ids(filterAndSortWords(entries, withFilter({ sort: 'alpha-asc' }), NOW)), ['a', 'b', 'c']);
    assert.deepEqual(ids(filterAndSortWords(entries, withFilter({ sort: 'alpha-desc' }), NOW)), ['c', 'b', 'a']);
    assert.deepEqual(ids(filterAndSortWords(entries, withFilter({ sort: 'status' }), NOW)), ['b', 'c', 'a']);
    assert.deepEqual(ids(filterAndSortWords(entries, withFilter({ sort: 'project' }), NOW)), ['b', 'a', 'c']);
    assert.deepEqual(ids(filterAndSortWords(entries, withFilter({ sort: 'wrong' }), NOW)), ['b', 'a', 'c']);
  });

  it('復習期限順は期限なしを末尾に置く', () => {
    assert.deepEqual(ids(filterAndSortWords(entries, withFilter({ sort: 'review' }), NOW)), ['c', 'b', 'a']);
  });

  it('元の配列を変更しない', () => {
    const original = [...entries];
    filterAndSortWords(entries, withFilter({ sort: 'alpha-desc' }), NOW);
    assert.deepEqual(entries, original);
  });
});

describe('deriveFilterOptions', () => {
  it('実データにある値だけを件数付きで返す', () => {
    const options = deriveFilterOptions([
      makeEntry({ projectId: 'p1', projectTitle: '単語帳1', binder: '受験', word: makeWord({ partOfSpeechTags: ['名詞'], cefrLevel: 'A2' }) }),
      makeEntry({ projectId: 'p1', projectTitle: '単語帳1', binder: '受験', word: makeWord({ partOfSpeechTags: ['名詞', '動詞'] }) }),
      makeEntry({ projectId: 'p2', projectTitle: '単語帳2', binder: null, word: makeWord({ cefrLevel: 'B1' }) }),
    ]);

    assert.deepEqual(options.projects.map((o) => [o.value, o.count]), [['p1', 2], ['p2', 1]]);
    assert.deepEqual(options.binders.map((o) => [o.value, o.label, o.count]), [
      ['受験', '受験', 2],
      ['', '未分類', 1],
    ]);
    assert.deepEqual(options.partOfSpeech.map((o) => [o.value, o.count]), [['名詞', 2], ['動詞', 1]]);
    assert.deepEqual(options.cefrLevels.map((o) => o.value), ['A2', 'B1']);
  });

  it('同じ単語に同じ品詞タグが重複していても1件として数える', () => {
    const options = deriveFilterOptions([
      makeEntry({ word: makeWord({ partOfSpeechTags: ['名詞', '名詞'] }) }),
    ]);
    assert.deepEqual(options.partOfSpeech.map((o) => o.count), [1]);
  });
});

describe('countActiveFilters', () => {
  it('既定は0', () => {
    assert.equal(countActiveFilters(DEFAULT_WORD_FILTER), 0);
  });

  it('軸ごとに1、要素条件は軸の数だけ数える', () => {
    const filter = withFilter({
      query: ' apple ',
      statuses: ['new', 'review'],
      favorite: 'only',
      features: { example: 'has', wrong: 'none', custom: 'off' },
      review: 'due',
    });
    assert.equal(countActiveFilters(filter), 1 + 1 + 1 + 2 + 1);
  });

  it('空白だけの検索語は数えない', () => {
    assert.equal(countActiveFilters(withFilter({ query: '   ' })), 0);
  });
});

describe('summarizeStatuses', () => {
  it('ステータスごとの件数を返す', () => {
    const summary = summarizeStatuses([
      makeEntry({ word: makeWord({ status: 'new' }) }),
      makeEntry({ word: makeWord({ status: 'new' }) }),
      makeEntry({ word: makeWord({ status: 'mastered' }) }),
    ]);
    assert.deepEqual(summary, { new: 2, review: 0, active: 0, mastered: 1 });
  });
});

describe('describeActiveFilters', () => {
  const options = deriveFilterOptions([
    makeEntry({ projectId: 'p1', projectTitle: 'システム英単語' }),
  ]);

  it('条件なしならチップも出ない', () => {
    assert.deepEqual(describeActiveFilters(DEFAULT_WORD_FILTER, options), []);
  });

  it('単語帳IDは単語帳名で表示する', () => {
    const chips = describeActiveFilters(withFilter({ projectIds: ['p1'] }), options);
    assert.deepEqual(chips.map((chip) => chip.label), ['システム英単語']);
  });

  it('チップを外すとその条件だけが消える', () => {
    const filter = withFilter({ statuses: ['new', 'review'], favorite: 'only' });
    const chips = describeActiveFilters(filter, options);
    const newStatusChip = chips.find((chip) => chip.id === 'status:new');
    assert.ok(newStatusChip);
    assert.deepEqual(newStatusChip.next.statuses, ['review']);
    assert.equal(newStatusChip.next.favorite, 'only');
  });

  it('要素条件は「あり / なし」を出し分ける', () => {
    const chips = describeActiveFilters(
      withFilter({ features: { example: 'has', morphology: 'none', custom: 'off' } }),
      options,
    );
    assert.deepEqual(chips.map((chip) => chip.label), ['例文あり', '語源なし']);
    assert.deepEqual(chips[0].next.features, { morphology: 'none', custom: 'off' });
  });

  it('チップの数は countActiveFilters と一致する (検索語も含む)', () => {
    const filter = withFilter({
      query: 'app',
      projectIds: ['p1'],
      statuses: ['new'],
      features: { example: 'has' },
      review: 'due',
      created: 'week',
      repetition: 'zero',
      cefrLevels: ['B1'],
      vocabularyTypes: ['active'],
      binders: [''],
      partOfSpeech: ['名詞'],
      favorite: 'exclude',
    });
    assert.equal(describeActiveFilters(filter, options).length, countActiveFilters(filter));
  });
});

describe('clearFilterConditions', () => {
  it('検索語と並べ替えは残して絞り込みだけ消す', () => {
    const cleared = clearFilterConditions(
      withFilter({ query: 'apple', sort: 'alpha-asc', statuses: ['new'], favorite: 'only' }),
    );
    assert.equal(cleared.query, 'apple');
    assert.equal(cleared.sort, 'alpha-asc');
    assert.deepEqual(cleared.statuses, []);
    assert.equal(cleared.favorite, 'any');
  });
});

describe('small helpers', () => {
  it('toggleValue は追加と削除を切り替える', () => {
    assert.deepEqual(toggleValue(['a'], 'b'), ['a', 'b']);
    assert.deepEqual(toggleValue(['a', 'b'], 'a'), ['b']);
  });

  it('nextTriState は off → has → none → off', () => {
    assert.equal(nextTriState(undefined), 'has');
    assert.equal(nextTriState('off'), 'has');
    assert.equal(nextTriState('has'), 'none');
    assert.equal(nextTriState('none'), 'off');
  });
});
