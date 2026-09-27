import test from 'node:test';
import assert from 'node:assert/strict';

import { buildClozeQuestionsForWords, cefrBand, type ClozeDataSource } from './server';
import type { ClozeSentenceRow } from './question';

function sentence(id: number, en: string): ClozeSentenceRow {
  return {
    id,
    sentence_en: en,
    sentence_ja: `和訳${id}`,
    ja_sentence_id: id + 1000,
    author_en: 'en_author',
    author_ja: 'ja_author',
    license_en: 'CC BY 2.0 FR',
    license_ja: 'CC BY 2.0 FR',
  };
}

const LEXICON = [
  { id: '00000000-0000-4000-8000-000000000001', headword: 'walk', pos: 'verb' as const, cefr_level: 'A1' as const, translation_ja: '歩く' },
  { id: '00000000-0000-4000-8000-000000000002', headword: 'walk', pos: 'noun' as const, cefr_level: 'A2' as const, translation_ja: '散歩' },
  { id: '00000000-0000-4000-8000-000000000003', headword: 'decision', pos: 'noun' as const, cefr_level: 'B1' as const, translation_ja: '決定' },
];

const SENTENCES = [
  sentence(1, 'I walk to school every day.'),
  sentence(2, 'It was a hard decision to make.'),
];

function fakeData(overrides: Partial<ClozeDataSource> = {}): ClozeDataSource & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async lexiconByIds(ids) {
      calls.push(`ids:${ids.join(',')}`);
      return LEXICON.filter((row) => ids.includes(row.id));
    },
    async lexiconByHeadwords(headwords) {
      calls.push(`headwords:${headwords.join(',')}`);
      return LEXICON.filter((row) => headwords.includes(row.headword));
    },
    async sentencesContaining(surfaces) {
      return SENTENCES.filter((s) => surfaces.some((surface) => s.sentence_en.toLowerCase().split(/\W+/).includes(surface)));
    },
    async distractorCandidates(pos) {
      calls.push(`candidates:${pos}`);
      const pools = {
        verb: ['run', 'swim', 'sing', 'jump'],
        noun: ['choice', 'mistake', 'journey', 'answer'],
      } as Record<string, string[]>;
      return (pools[pos] ?? []).map((headword, i) => ({
        id: `c-${pos}-${i}`,
        headword,
        pos,
        cefr_level: 'B1' as const,
        translation_ja: null,
      }));
    },
    ...overrides,
  };
}

test('CEFR band is the level and its neighbours', () => {
  assert.deepEqual(cefrBand('B1'), ['A2', 'B1', 'B2']);
  assert.deepEqual(cefrBand('A1'), ['A1', 'A2']);
  assert.deepEqual(cefrBand('C2'), ['C1', 'C2']);
  assert.equal(cefrBand(null), null);
});

test('builds questions for words it can, and reports the rest', async () => {
  const data = fakeData();
  const result = await buildClozeQuestionsForWords(
    [
      { id: 'w1', english: 'walk', japanese: '歩く', partOfSpeechTags: ['verb'] },
      { id: 'w2', english: 'decision', japanese: '決定', lexiconEntryId: LEXICON[2].id },
      { id: 'w3', english: 'look after', japanese: '世話をする' },
      { id: 'w4', english: 'banana', japanese: 'バナナ' },
    ],
    data,
    { random: () => 0.42 },
  );

  assert.deepEqual(result.questions.map((q) => q.wordId), ['w1', 'w2']);
  assert.deepEqual(result.unavailableWordIds, ['w3', 'w4']);
  const walk = result.questions[0];
  assert.equal(walk.options[walk.correctIndex], 'walk');
  assert.equal(walk.attribution.enSentenceId, 1);
  // 同じ品詞・級の候補の取得は1回にまとめる
  assert.equal(data.calls.filter((call) => call === 'candidates:verb').length, 1);
});

test('the POS hint picks between homographs in the lexicon', async () => {
  const seenPos: string[] = [];
  const data = fakeData({
    async distractorCandidates(pos) {
      seenPos.push(pos);
      return [];
    },
  });
  await buildClozeQuestionsForWords([{ id: 'w1', english: 'walk', japanese: '散歩', partOfSpeechTags: ['noun'] }], data);
  assert.deepEqual(seenPos, ['noun']);
});

test('limit caps the number of questions', async () => {
  const result = await buildClozeQuestionsForWords(
    [
      { id: 'w1', english: 'walk', japanese: '歩く', partOfSpeechTags: ['verb'] },
      { id: 'w2', english: 'decision', japanese: '決定' },
    ],
    fakeData(),
    { limit: 1, random: () => 0.1 },
  );
  assert.equal(result.questions.length, 1);
});
