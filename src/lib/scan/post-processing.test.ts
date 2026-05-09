import test from 'node:test';
import assert from 'node:assert/strict';

import { buildQuizPrefillSeedWords } from '@/lib/scan/quiz-prefill';
import {
  buildPostScanLexiconResolutionWordIds,
  buildPostScanQuizPrefillSeedWords,
} from '@/lib/scan/post-processing';

test('buildPostScanLexiconResolutionWordIds includes AI backfilled Japanese word ids', () => {
  const pendingWordIds = buildPostScanLexiconResolutionWordIds(
    [
      {
        id: 'ai-backfilled',
        lexicon_entry_id: 'lexicon-ai-backfilled',
        part_of_speech_tags: ['noun'],
      },
      {
        id: 'complete',
        lexicon_entry_id: 'lexicon-complete',
        part_of_speech_tags: ['verb'],
      },
    ],
    ['ai-backfilled'],
  );

  assert.deepEqual(pendingWordIds, ['ai-backfilled']);
});

test('buildPostScanLexiconResolutionWordIds includes words without a lexicon entry id', () => {
  const pendingWordIds = buildPostScanLexiconResolutionWordIds(
    [
      {
        id: 'missing-lexicon-entry',
        lexicon_entry_id: null,
        part_of_speech_tags: ['noun'],
      },
      {
        id: 'complete',
        lexicon_entry_id: 'lexicon-complete',
        part_of_speech_tags: ['verb'],
      },
    ],
    [],
  );

  assert.deepEqual(pendingWordIds, ['missing-lexicon-entry']);
});

test('buildPostScanLexiconResolutionWordIds includes words with empty or missing POS tags', () => {
  const pendingWordIds = buildPostScanLexiconResolutionWordIds(
    [
      {
        id: 'empty-pos',
        lexicon_entry_id: 'lexicon-empty-pos',
        part_of_speech_tags: [],
      },
      {
        id: 'missing-pos',
        lexicon_entry_id: 'lexicon-missing-pos',
      },
      {
        id: 'complete',
        lexicon_entry_id: 'lexicon-complete',
        part_of_speech_tags: ['verb'],
      },
    ],
    [],
  );

  assert.deepEqual(pendingWordIds, ['empty-pos', 'missing-pos']);
});

test('buildPostScanLexiconResolutionWordIds excludes words with both lexicon entry and POS tags', () => {
  const pendingWordIds = buildPostScanLexiconResolutionWordIds(
    [
      {
        id: 'complete',
        lexicon_entry_id: 'lexicon-complete',
        part_of_speech_tags: ['adjective'],
      },
    ],
    [],
  );

  assert.deepEqual(pendingWordIds, []);
});

test('buildPostScanQuizPrefillSeedWords uses the Task 3 quiz prefill selector criteria', () => {
  const words = [
    {
      id: 'complete',
      english: 'elaborate',
      japanese: '詳しく説明する',
      distractors: ['短くする', '無視する', '隠す'],
      example_sentence: 'Please elaborate on your answer.',
      example_sentence_ja: 'あなたの答えについて詳しく説明してください。',
      part_of_speech_tags: ['verb'],
    },
    {
      id: 'missing-distractors',
      english: 'concise',
      japanese: '簡潔な',
      distractors: ['長い'],
      example_sentence: 'Keep your answer concise.',
      example_sentence_ja: '答えは簡潔にしてください。',
      part_of_speech_tags: ['adjective'],
    },
    {
      id: 'missing-example',
      english: 'persist',
      japanese: '続ける',
      distractors: ['やめる', '忘れる', '避ける'],
      example_sentence: '',
      example_sentence_ja: '彼女は練習を続けました。',
      part_of_speech_tags: ['verb'],
    },
    {
      id: 'missing-pos',
      english: 'resilience',
      japanese: '回復力',
      distractors: ['弱さ', '混乱', '退屈'],
      example_sentence: 'The team showed resilience.',
      example_sentence_ja: 'そのチームは回復力を示しました。',
      part_of_speech_tags: [],
    },
    {
      id: 'placeholder-distractors',
      english: 'adapt',
      japanese: '適応する',
      distractors: ['選択肢1', '選択肢2', '選択肢3'],
      example_sentence: 'We adapt to new rules.',
      example_sentence_ja: '私たちは新しい規則に適応します。',
      part_of_speech_tags: ['verb'],
    },
  ];

  const seedWords = buildPostScanQuizPrefillSeedWords(words);

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
      id: 'placeholder-distractors',
      english: 'adapt',
      japanese: '適応する',
    },
  ]);
  assert.deepEqual(seedWords, buildQuizPrefillSeedWords(words));
});
