// 英語専用の後処理が古典語に走らないことを、経路ごとにまとめて固定するテスト。
//
// ここが緩むと「古典語なのに英語の語源解析・英作文・誤答生成が走り、
// 結果はゴミなのにコインとAPIコストだけ消える」が起きる。
// 同時に、英単語がこれらの経路から外れていないことも必ず確認する
// （ガードが広すぎて英語まで止めてしまうのが逆方向の事故）。

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildQuizPrefillSeedWords } from '@/lib/scan/quiz-prefill';
import { buildWordOrderQuizPrefillSeedWords } from '@/lib/scan/word-order-prefill';
import {
  buildClientLocalExampleSeedWords,
  buildServerCloudExampleSeedWords,
} from '@/lib/scan/example-generation';
import { needsWordLexiconResolution } from '@/lib/lexicon/word-resolution-jobs';
import { isMorphologyAnalyzable } from '@/lib/morphology/resolve';

test('quiz prefill (distractors + pronunciation) skips classical words', () => {
  const seeds = buildQuizPrefillSeedWords([
    {
      id: 'classical',
      english: 'あさまし',
      japanese: '驚きあきれるほどだ',
      classical_entry_id: 'entry-1',
      distractors: [],
      example_sentence: null,
      part_of_speech_tags: [],
    },
    {
      id: 'english',
      english: 'admire',
      japanese: '敬服する',
      distractors: [],
      example_sentence: null,
      part_of_speech_tags: [],
    },
  ]);

  assert.deepEqual(seeds.map((seed) => seed.id), ['english']);
});

test('quiz prefill skips a classical word even when the dictionary link is missing', () => {
  // 互換フォールバックで classical_entry_id が落ちた行でも、
  // 見出し語が日本語なら英語向け生成には回さない
  const seeds = buildQuizPrefillSeedWords([
    {
      id: 'classical',
      english: 'ゆかし',
      japanese: '心ひかれる',
      distractors: [],
      example_sentence: null,
      part_of_speech_tags: [],
    },
  ]);

  assert.deepEqual(seeds, []);
});

test('word-order (英作文) prefill skips classical words but keeps English phrases', () => {
  const seeds = buildWordOrderQuizPrefillSeedWords([
    {
      id: 'classical',
      english: 'いと をかし',
      japanese: 'たいそう趣がある',
      classicalEntryId: 'entry-1',
      word_order_quiz: null,
    },
    {
      id: 'english',
      english: 'look forward to',
      japanese: '楽しみにする',
      word_order_quiz: null,
    },
  ]);

  assert.deepEqual(seeds.map((seed) => seed.id), ['english']);
});

test('example generation skips classical words on both scan paths', () => {
  const clientLocal = buildClientLocalExampleSeedWords([
    { english: 'あさまし', japanese: '驚きあきれるほどだ', classicalEntryId: 'entry-1' },
    { english: 'admire', japanese: '敬服する' },
  ]);
  assert.deepEqual(clientLocal.map((seed) => seed.english), ['admire']);

  const serverCloud = buildServerCloudExampleSeedWords([
    {
      id: 'classical',
      english: 'あさまし',
      japanese: '驚きあきれるほどだ',
      classical_entry_id: 'entry-1',
      example_sentence: null,
    },
    { id: 'english', english: 'admire', japanese: '敬服する', example_sentence: null },
  ]);
  assert.deepEqual(serverCloud.map((seed) => seed.id), ['english']);
});

test('lexicon resolution jobs are never enqueued for classical words', () => {
  // これが false を返さないと「解決ジョブを積む → 英語lexiconに解決できない →
  // また積む」を永久に繰り返し、そのたびに品詞分類AIと翻訳AIが走る
  assert.equal(
    needsWordLexiconResolution({ english: 'あさまし', classicalEntryId: 'entry-1' }),
    false,
  );
  assert.equal(needsWordLexiconResolution({ english: 'ゆかし' }), false);
  // 英単語は従来どおり解決対象のまま
  assert.equal(needsWordLexiconResolution({ english: 'admire' }), true);
  assert.equal(
    needsWordLexiconResolution({
      english: 'admire',
      lexiconEntryId: 'lex-1',
      partOfSpeechTags: ['verb'],
    }),
    false,
  );
});

test('morphology (語源解析) already rejects classical headwords', () => {
  // ガードを足していないので、前提が崩れていないことを固定しておく
  assert.equal(isMorphologyAnalyzable('あさまし'), false);
  assert.equal(isMorphologyAnalyzable('心地'), false);
  assert.equal(isMorphologyAnalyzable('unhappiness'), true);
});
