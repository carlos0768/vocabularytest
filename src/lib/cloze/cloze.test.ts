import test from 'node:test';
import assert from 'node:assert/strict';

import { buildClozeBlank } from './blank';
import { pickClozeDistractors, type ClozeDistractorCandidate } from './distractors';
import { inflectHeadword, inflectedSurfaces, isClozeEligibleHeadword, surfaceForForm } from './inflections';
import { buildClozeQuestion, type ClozeSentenceRow } from './question';
import { splitSentenceTokens, tokenizeForIndex } from './tokenize';

/** 決まった順に値を返す乱数。シャッフルを再現できるようにする。 */
function seeded(seed = 1): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function candidate(headword: string, pos: ClozeDistractorCandidate['pos'], cefrLevel: ClozeDistractorCandidate['cefrLevel'] = 'B1', translationJa: string | null = null): ClozeDistractorCandidate {
  return { headword, pos, cefrLevel, translationJa };
}

// --- tokenize -------------------------------------------------------------

test('tokenizer keeps contractions as one word and drops digits/punctuation', () => {
  assert.deepEqual(
    splitSentenceTokens("I don’t have 3 cats.").map((t) => t.normalized),
    ['i', "don't", 'have', 'cats'],
  );
});

test('index tokens are lowercased and de-duplicated', () => {
  assert.deepEqual(tokenizeForIndex('The cat saw the dog.'), ['the', 'cat', 'saw', 'dog']);
});

// --- inflections ----------------------------------------------------------

test('regular verbs follow spelling rules', () => {
  const surfaces = (word: string) => Object.fromEntries(inflectHeadword(word, 'verb').map((f) => [f.form, f.surface]));
  assert.deepEqual(surfaces('walk'), { base: 'walk', third: 'walks', past: 'walked', past_participle: 'walked', ing: 'walking' });
  assert.deepEqual(surfaces('stop'), { base: 'stop', third: 'stops', past: 'stopped', past_participle: 'stopped', ing: 'stopping' });
  assert.deepEqual(surfaces('study'), { base: 'study', third: 'studies', past: 'studied', past_participle: 'studied', ing: 'studying' });
  assert.deepEqual(surfaces('make'), { base: 'make', third: 'makes', past: 'made', past_participle: 'made', ing: 'making' });
  assert.equal(surfaceForForm('admit', 'verb', 'past'), 'admitted');
  assert.equal(surfaceForForm('visit', 'verb', 'past'), 'visited');
  assert.equal(surfaceForForm('lie', 'verb', 'ing'), 'lying');
  assert.equal(surfaceForForm('watch', 'verb', 'third'), 'watches');
  assert.equal(surfaceForForm('have', 'verb', 'third'), 'has');
});

test('irregular verbs use the table', () => {
  assert.equal(surfaceForForm('take', 'verb', 'past'), 'took');
  assert.equal(surfaceForForm('take', 'verb', 'past_participle'), 'taken');
  assert.equal(surfaceForForm('go', 'verb', 'third'), 'goes');
});

test('nouns get plurals, adjectives get -er/-est only when short', () => {
  assert.equal(surfaceForForm('box', 'noun', 'plural'), 'boxes');
  assert.equal(surfaceForForm('city', 'noun', 'plural'), 'cities');
  assert.equal(surfaceForForm('child', 'noun', 'plural'), 'children');
  assert.equal(surfaceForForm('sheep', 'noun', 'plural'), null);
  assert.equal(surfaceForForm('big', 'adjective', 'comparative'), 'bigger');
  assert.equal(surfaceForForm('happy', 'adjective', 'superlative'), 'happiest');
  assert.equal(surfaceForForm('beautiful', 'adjective', 'comparative'), null);
});

test('idioms, phrasal verbs and function words are not cloze targets', () => {
  assert.equal(isClozeEligibleHeadword('look after'), false);
  assert.equal(isClozeEligibleHeadword('be'), false);
  assert.equal(isClozeEligibleHeadword('the'), false);
  assert.deepEqual(inflectedSurfaces('give up', 'phrasal_verb'), []);
  assert.equal(isClozeEligibleHeadword('well-known'), true);
});

// --- blank ----------------------------------------------------------------

test('blanks an inflected form and keeps the surrounding text verbatim', () => {
  const blank = buildClozeBlank('She walked to the station.', 'walk', 'verb');
  assert.ok(blank);
  assert.equal(blank.before, 'She ');
  assert.equal(blank.after, ' to the station.');
  assert.equal(blank.answer, 'walked');
  // 規則動詞の -ed は過去形とも過去分詞とも読める
  assert.deepEqual(blank.forms.sort(), ['past', 'past_participle']);
});

test('a preceding auxiliary narrows the form', () => {
  assert.deepEqual(buildClozeBlank('I have walked a long way.', 'walk', 'verb')?.forms, ['past_participle']);
  assert.deepEqual(buildClozeBlank('I want to read it.', 'read', 'verb')?.forms, ['base']);
});

test('sentences where the word appears twice are skipped', () => {
  // 片方だけ空欄にすると、もう片方が答えを教えてしまう
  assert.equal(buildClozeBlank('Walk slowly, then walk faster.', 'walk', 'verb'), null);
  assert.equal(buildClozeBlank('He walks and walked.', 'walk', 'verb'), null);
});

test('sentences without the word, or with it inside a hyphenated word, are skipped', () => {
  assert.equal(buildClozeBlank('She ran to the station.', 'walk', 'verb'), null);
  assert.equal(buildClozeBlank('He is a well-known writer.', 'known', 'adjective'), null);
});

test('sentence-initial answers remember their capital letter', () => {
  const blank = buildClozeBlank('Study hard.', 'study', 'verb');
  assert.equal(blank?.answer, 'Study');
  assert.equal(blank?.capitalized, true);
});

// --- distractors ----------------------------------------------------------

test('distractors share the POS and are inflected to the blank form', () => {
  const blank = buildClozeBlank('I have eaten lunch.', 'eat', 'verb');
  assert.ok(blank);
  const distractors = pickClozeDistractors({
    target: { headword: 'eat', pos: 'verb', cefrLevel: 'A1', translations: ['食べる'] },
    blank,
    candidates: [
      candidate('take', 'verb', 'A1'),
      candidate('write', 'verb', 'A1'),
      candidate('go', 'verb', 'A1'),
      candidate('apple', 'noun', 'A1'),
    ],
    random: seeded(),
  });
  assert.ok(distractors);
  assert.deepEqual([...distractors].sort(), ['gone', 'taken', 'written']);
});

test('an ambiguous -ed blank only takes distractors whose past equals past participle', () => {
  const blank = buildClozeBlank('She walked home.', 'walk', 'verb');
  assert.ok(blank);
  const distractors = pickClozeDistractors({
    target: { headword: 'walk', pos: 'verb', cefrLevel: 'A1', translations: ['歩く'] },
    blank,
    candidates: [
      candidate('take', 'verb', 'A1'), // took / taken → 割れるので使わない
      candidate('jump', 'verb', 'A1'),
      candidate('make', 'verb', 'A1'),
      candidate('play', 'verb', 'A1'),
    ],
    random: seeded(),
  });
  assert.deepEqual(distractors?.sort(), ['jumped', 'made', 'played']);
});

test('synonyms (shared translation), the answer itself, and words already in the sentence are excluded', () => {
  const blank = buildClozeBlank('The house is big.', 'big', 'adjective');
  assert.ok(blank);
  const distractors = pickClozeDistractors({
    target: { headword: 'big', pos: 'adjective', cefrLevel: 'A1', translations: ['大きい'] },
    blank,
    candidates: [
      candidate('large', 'adjective', 'A1', '大きい、広い'), // 同義語
      candidate('big', 'adjective', 'A1'),
      candidate('house', 'adjective', 'A1'),
      candidate('small', 'adjective', 'A1', '小さい'),
      candidate('old', 'adjective', 'A1', '古い'),
    ],
    random: seeded(),
  });
  assert.equal(distractors, null, 'only two usable candidates remain');
});

test('closer CEFR levels are preferred', () => {
  const blank = buildClozeBlank('It was a difficult decision.', 'decision', 'noun');
  assert.ok(blank);
  const distractors = pickClozeDistractors({
    target: { headword: 'decision', pos: 'noun', cefrLevel: 'B1', translations: ['決定'] },
    blank,
    candidates: [
      candidate('cat', 'noun', 'A1'),
      candidate('choice', 'noun', 'B1'),
      candidate('mistake', 'noun', 'B1'),
      candidate('journey', 'noun', 'B1'),
      candidate('hypothesis', 'noun', 'C2'),
    ],
    random: seeded(),
  });
  assert.deepEqual(distractors?.sort(), ['choice', 'journey', 'mistake']);
});

test('capitalized answers get capitalized distractors', () => {
  const blank = buildClozeBlank('Study every day.', 'study', 'verb');
  assert.ok(blank);
  const distractors = pickClozeDistractors({
    target: { headword: 'study', pos: 'verb', cefrLevel: 'A1', translations: ['勉強する'] },
    blank,
    candidates: [candidate('run', 'verb', 'A1'), candidate('eat', 'verb', 'A1'), candidate('sleep', 'verb', 'A1')],
    random: seeded(),
  });
  assert.ok(distractors?.every((d) => /^[A-Z]/.test(d)));
});

// --- question -------------------------------------------------------------

const SENTENCES: ClozeSentenceRow[] = [
  {
    id: 1,
    sentence_en: 'Walk slowly, then walk faster.',
    sentence_ja: 'ゆっくり歩いて、それから速く歩きなさい。',
    ja_sentence_id: 101,
    author_en: 'alice',
    author_ja: 'bob',
    license_en: 'CC BY 2.0 FR',
    license_ja: 'CC0 1.0',
  },
  {
    id: 2,
    sentence_en: 'I walk to school every day.',
    sentence_ja: '私は毎日歩いて学校へ行きます。',
    ja_sentence_id: 102,
    author_en: 'carol',
    author_ja: 'dave',
    license_en: 'CC BY 2.0 FR',
    license_ja: 'CC BY 2.0 FR',
  },
];

test('a question uses the first usable sentence and carries its attribution', () => {
  const question = buildClozeQuestion({
    wordId: 'w1',
    target: { headword: 'walk', pos: 'verb', cefrLevel: 'A1', translations: ['歩く'] },
    sentences: SENTENCES,
    candidates: [candidate('run', 'verb', 'A1'), candidate('swim', 'verb', 'A1'), candidate('sing', 'verb', 'A1')],
    random: seeded(3),
  });
  assert.ok(question);
  assert.equal(question.before, 'I ');
  assert.equal(question.after, ' to school every day.');
  assert.equal(question.options.length, 4);
  assert.equal(question.options[question.correctIndex], 'walk');
  assert.equal(new Set(question.options).size, 4);
  assert.deepEqual(question.attribution, {
    enSentenceId: 2,
    jaSentenceId: 102,
    enAuthor: 'carol',
    jaAuthor: 'dave',
    enLicense: 'CC BY 2.0 FR',
    jaLicense: 'CC BY 2.0 FR',
  });
});

test('no question when no sentence yields a blank with three distractors', () => {
  const question = buildClozeQuestion({
    wordId: 'w1',
    target: { headword: 'walk', pos: 'verb', cefrLevel: 'A1', translations: ['歩く'] },
    sentences: SENTENCES,
    candidates: [candidate('run', 'verb', 'A1')],
    random: seeded(),
  });
  assert.equal(question, null);
});
