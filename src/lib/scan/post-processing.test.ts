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
      id: 'placeholder-distractors',
      english: 'adapt',
      japanese: '適応する',
      distractors: ['選択肢1', '選択肢2', '選択肢3'],
      example_sentence: 'We adapt to new rules.',
      example_sentence_ja: '私たちは新しい規則に適応します。',
      pronunciation: '/əˈdæpt/',
      part_of_speech_tags: ['verb'],
    },
    {
      id: 'missing-pronunciation',
      english: 'reliable',
      japanese: '信頼できる',
      distractors: ['不安定な', '退屈な', '一時的な'],
      example_sentence: 'This source is reliable.',
      example_sentence_ja: 'この情報源は信頼できます。',
      pronunciation: '',
      part_of_speech_tags: ['adjective'],
    },
  ];

  const seedWords = buildPostScanQuizPrefillSeedWords(words);

  assert.deepEqual(seedWords, [
    {
      id: 'missing-distractors',
      english: 'concise',
      japanese: '簡潔な',
      needs: { distractors: true, example: false, pronunciation: false, pos: false },
    },
    {
      id: 'missing-example',
      english: 'persist',
      japanese: '続ける',
      needs: { distractors: false, example: true, pronunciation: false, pos: false },
    },
    {
      id: 'missing-pos',
      english: 'resilience',
      japanese: '回復力',
      needs: { distractors: false, example: false, pronunciation: false, pos: true },
    },
    {
      id: 'placeholder-distractors',
      english: 'adapt',
      japanese: '適応する',
      needs: { distractors: true, example: false, pronunciation: false, pos: false },
    },
    {
      id: 'missing-pronunciation',
      english: 'reliable',
      japanese: '信頼できる',
      needs: { distractors: false, example: false, pronunciation: true, pos: false },
    },
  ]);
  assert.deepEqual(seedWords, buildQuizPrefillSeedWords(words));
});
