import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildQuizPrefillSeedWords,
  buildQuizPrefillWordUpdatePayload,
} from '@/lib/scan/quiz-prefill';

test('buildQuizPrefillSeedWords selects only words missing distractors, examples, or POS', () => {
  const seedWords = buildQuizPrefillSeedWords([
    {
      id: 'complete',
      english: 'elaborate',
      japanese: '詳しく説明する',
      distractors: ['短くする', '無視する', '隠す'],
      example_sentence: 'Please elaborate on your answer.',
      example_sentence_ja: 'あなたの答えについて詳しく説明してください。',
      pronunciation: '/ɪˈlæbəreɪt/',
      part_of_speech_tags: ['verb'],
    },
    {
      id: 'missing-distractors',
      english: 'concise',
      japanese: '簡潔な',
      distractors: ['長い'],
      example_sentence: 'Keep your answer concise.',
      example_sentence_ja: '答えは簡潔にしてください。',
      pronunciation: '/kənˈsaɪs/',
      part_of_speech_tags: ['adjective'],
    },
    {
      id: 'missing-example',
      english: 'persist',
      japanese: '続ける',
      distractors: ['やめる', '忘れる', '避ける'],
      example_sentence: '',
      example_sentence_ja: '彼女は練習を続けました。',
      pronunciation: '/pərˈsɪst/',
      part_of_speech_tags: ['verb'],
    },
    {
      id: 'missing-pos',
      english: 'resilience',
      japanese: '回復力',
      distractors: ['弱さ', '混乱', '退屈'],
      example_sentence: 'The team showed resilience.',
      example_sentence_ja: 'そのチームは回復力を示しました。',
      pronunciation: '/rɪˈzɪliəns/',
      part_of_speech_tags: [],
    },
    {
      id: 'missing-pronunciation',
      english: 'adapt',
      japanese: '適応する',
      distractors: ['拒む', '避ける', '忘れる'],
      example_sentence: 'We adapt to new rules.',
      example_sentence_ja: '私たちは新しい規則に適応します。',
      pronunciation: '',
      part_of_speech_tags: ['verb'],
    },
  ]);

  assert.deepEqual(seedWords, [
    {
      id: 'missing-distractors',
      english: 'concise',
      japanese: '簡潔な',
    },
    {
      id: 'missing-example',
      english: 'persist',
      japanese: '続ける',
    },
    {
      id: 'missing-pos',
      english: 'resilience',
      japanese: '回復力',
    },
    {
      id: 'missing-pronunciation',
      english: 'adapt',
      japanese: '適応する',
    },
  ]);
});

test('buildQuizPrefillSeedWords treats placeholder distractors as missing', () => {
  const seedWords = buildQuizPrefillSeedWords([
    {
      id: 'placeholder',
      english: 'adapt',
      japanese: '適応する',
      distractors: ['選択肢1', '選択肢2', '選択肢3'],
      example_sentence: 'We adapt to new rules.',
      example_sentence_ja: '私たちは新しい規則に適応します。',
      pronunciation: '/əˈdæpt/',
      part_of_speech_tags: ['verb'],
    },
  ]);

  assert.deepEqual(seedWords, [
    {
      id: 'placeholder',
      english: 'adapt',
      japanese: '適応する',
    },
  ]);
});

test('buildQuizPrefillSeedWords excludes multi-word entries from multiple-choice prefill', () => {
  const seedWords = buildQuizPrefillSeedWords([
    {
      id: 'multi-word',
      english: 'take care',
      japanese: '世話をする',
      distractors: [],
      example_sentence: '',
      example_sentence_ja: '',
      pronunciation: '',
      part_of_speech_tags: [],
    },
    {
      id: 'single-word',
      english: 'adapt',
      japanese: '適応する',
      distractors: [],
      example_sentence: 'We adapt.',
      example_sentence_ja: '私たちは適応します。',
      pronunciation: '/əˈdæpt/',
      part_of_speech_tags: ['verb'],
    },
  ]);

  assert.deepEqual(seedWords, [
    {
      id: 'single-word',
      english: 'adapt',
      japanese: '適応する',
    },
  ]);
});


test('buildQuizPrefillWordUpdatePayload includes generated example fields only when they have values', () => {
  const payload = buildQuizPrefillWordUpdatePayload({
    wordId: 'word-1',
    distractors: ['短くする', '無視する', '隠す'],
    partOfSpeechTags: ['verb'],
    pronunciation: '/ɪˈlæbəreɪt/',
    exampleSentence: 'Please elaborate on your answer.',
    exampleSentenceJa: 'あなたの答えについて詳しく説明してください。',
  });

  assert.deepEqual(payload, {
    distractors: ['短くする', '無視する', '隠す'],
    part_of_speech_tags: ['verb'],
    pronunciation: '/ɪˈlæbəreɪt/',
    example_sentence: 'Please elaborate on your answer.',
    example_sentence_ja: 'あなたの答えについて詳しく説明してください。',
  });
});

test('buildQuizPrefillWordUpdatePayload does not overwrite existing examples with empty generated values', () => {
  const payload = buildQuizPrefillWordUpdatePayload({
    wordId: 'word-1',
    distractors: ['短くする', '無視する', '隠す'],
    partOfSpeechTags: ['verb'],
    pronunciation: '',
    exampleSentence: '',
    exampleSentenceJa: '   ',
  });

  assert.deepEqual(payload, {
    distractors: ['短くする', '無視する', '隠す'],
    part_of_speech_tags: ['verb'],
  });
  assert.equal(Object.hasOwn(payload, 'example_sentence'), false);
  assert.equal(Object.hasOwn(payload, 'example_sentence_ja'), false);
  assert.equal(Object.hasOwn(payload, 'pronunciation'), false);
});

test('buildQuizPrefillWordUpdatePayload does not overwrite existing POS with an empty generated result', () => {
  const payload = buildQuizPrefillWordUpdatePayload({
    wordId: 'word-1',
    distractors: ['短くする', '無視する', '隠す'],
    partOfSpeechTags: [],
    pronunciation: '',
    exampleSentence: '',
    exampleSentenceJa: '',
  });

  assert.deepEqual(payload, {
    distractors: ['短くする', '無視する', '隠す'],
  });
  assert.equal(Object.hasOwn(payload, 'part_of_speech_tags'), false);
});
