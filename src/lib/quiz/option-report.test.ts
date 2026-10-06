import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildReplacedDistractors,
  describeOptionReportVerdict,
  isProblemVerdict,
} from '@/lib/quiz/option-report';
import {
  OPTION_REPORT_JUDGE_PROMPT,
  buildOptionReportJudgePrompt,
} from '@/lib/quiz/option-report.server';

test('isProblemVerdict treats everything but ok as a problem', () => {
  assert.equal(isProblemVerdict('correct_translation'), true);
  assert.equal(isProblemVerdict('too_similar'), true);
  assert.equal(isProblemVerdict('other_problem'), true);
  assert.equal(isProblemVerdict('ok'), false);
});

test('buildReplacedDistractors swaps the reported option for the first safe candidate, in place', () => {
  const result = buildReplacedDistractors(
    { english: 'bank', japanese: '銀行', knownTranslations: ['土手'] },
    ['地位', '土手', '空白'],
    '土手',
    { replacements: ['堤防', '戦車', '感謝する'], replacementSources: ['bank', 'tank', 'thank'] },
  );
  // 「堤防」は元の英単語が出題語なので落ち、「戦車」が採用される。位置は元の2番目のまま。
  assert.deepEqual(result.distractors, ['地位', '戦車', '空白']);
  assert.equal(result.replacement, '戦車');
  assert.equal(result.reportedWasStored, true);
});

test('buildReplacedDistractors rejects candidates that are translations of the word or duplicates', () => {
  const result = buildReplacedDistractors(
    { english: 'spring', japanese: '春' },
    ['ばね', '夏', '冬'],
    'ばね',
    { replacements: ['泉', '夏', '〜春', '秋'], replacementSources: ['spring', 'summer', 'spring', 'autumn'] },
  );
  assert.deepEqual(result.distractors, ['秋', '夏', '冬']);
  assert.equal(result.replacement, '秋');
});

test('buildReplacedDistractors drops the reported option when no candidate survives', () => {
  // 「予約」は既知の訳「予約する」に含まれ、「本」は正解そのもの。候補が全滅したら外すだけ。
  const result = buildReplacedDistractors(
    { english: 'book', japanese: '本', knownTranslations: ['予約する'] },
    ['予約する', '見る', '料理する'],
    '予約する',
    { replacements: ['予約', '本'], replacementSources: ['booking', 'book'] },
  );
  assert.deepEqual(result.distractors, ['見る', '料理する']);
  assert.equal(result.replacement, null);
  assert.equal(result.reportedWasStored, true);
});

test('buildReplacedDistractors matches the reported option through format variants', () => {
  const result = buildReplacedDistractors(
    { english: 'adopt', japanese: '採用する' },
    ['適応する', '養子にする', '崇拝する'],
    '〜適応 する',
    { replacements: ['採択する', '付け加える'], replacementSources: ['adopt', 'add'] },
  );
  assert.deepEqual(result.distractors, ['付け加える', '養子にする', '崇拝する']);
});

test('buildReplacedDistractors leaves the stored distractors alone when the reported option came from a fallback', () => {
  const result = buildReplacedDistractors(
    { english: 'run', japanese: '走る' },
    ['歩く', '泳ぐ', '飛ぶ'],
    '確認する',
    { replacements: ['跳ぶ'], replacementSources: ['jump'] },
  );
  assert.deepEqual(result.distractors, ['歩く', '泳ぐ', '飛ぶ']);
  assert.equal(result.replacement, null);
  assert.equal(result.reportedWasStored, false);
});

test('judge prompt lists the known translations and the reported option', () => {
  const prompt = buildOptionReportJudgePrompt({
    english: 'bank',
    japanese: '銀行',
    knownTranslations: ['銀行', '土手'],
    reportedOption: '堤防',
    options: ['銀行', '堤防', '地位', '空白'],
  });
  assert.equal(prompt.startsWith(OPTION_REPORT_JUDGE_PROMPT), true);
  assert.equal(prompt.includes('出題語（英語）: bank'), true);
  assert.equal(prompt.includes('正解の訳: 銀行'), true);
  assert.equal(prompt.includes('出題語の他の訳（辞書上の別の意味。これらも正解として通る）: 土手'), true);
  assert.equal(prompt.includes('報告された選択肢: 堤防'), true);
  assert.equal(prompt.includes('銀行 / 堤防 / 地位 / 空白'), true);
});

test('judge prompt defines every verdict and leans toward reporting a problem', () => {
  for (const snippet of ['correct_translation', 'too_similar', 'other_problem', '- ok:', '迷ったら ok ではなく問題あり側に倒して']) {
    assert.equal(OPTION_REPORT_JUDGE_PROMPT.includes(snippet), true, snippet);
  }
});

test('describeOptionReportVerdict has a label for every verdict', () => {
  assert.equal(describeOptionReportVerdict('correct_translation'), 'その選択肢も正解として通る訳でした');
  assert.equal(describeOptionReportVerdict('ok'), '選択肢に問題は見つかりませんでした');
});
