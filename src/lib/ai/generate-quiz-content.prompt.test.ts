import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATCH_DISTRACTOR_PROMPT,
  DISTRACTOR_CANDIDATE_COUNT,
  buildQuizContentResults,
  buildQuizContentWordLine,
  collectForbiddenSenses,
  isDistractorSenseOfWord,
  isSourceSameOrDerivedWord,
  resolveQuizContentNeeds,
  selectSafeDistractors,
} from '@/lib/ai/generate-quiz-content';

test('distractor prompt forbids using the quiz word\'s own alternate meanings as distractors', () => {
  // The dedicated, high-priority polysemy/homonym rule must be present so that a
  // distractor is never another valid meaning of the same English word (which would
  // make the question have two correct answers).
  const requiredSnippets = [
    '出題語そのものの「別の意味」を誤答に絶対に使わない',
    '多義語・同音異義語の禁止',
    '誤答は必ず「正解とは別の英単語」の日本語訳から作ること',
    '正解が2つ以上ある不正な問題',
  ];

  for (const snippet of requiredSnippets) {
    assert.equal(
      BATCH_DISTRACTOR_PROMPT.includes(snippet),
      true,
      `BATCH_DISTRACTOR_PROMPT should include: ${snippet}`,
    );
  }
});

test('distractor prompt puts the "never a correct translation" rule above the morphology rule', () => {
  // 以前は「形態的に紛らわしい単語から作る」が最重要ルールとして先頭にあり、
  // 語形優先で同根語の訳（＝出題語の訳としても通る）が誤答に混ざっていた。
  const absoluteRuleIndex = BATCH_DISTRACTOR_PROMPT.indexOf('【絶対ルール】誤答は「出題語の正しい訳」であってはならない');
  const morphologyIndex = BATCH_DISTRACTOR_PROMPT.indexOf('語形（接頭辞・接尾辞・語根・綴り）が似ていて');
  assert.ok(absoluteRuleIndex >= 0, 'absolute rule must exist');
  assert.ok(morphologyIndex >= 0, 'morphology guidance must exist');
  assert.ok(absoluteRuleIndex < morphologyIndex, 'absolute rule must come before morphology guidance');
  assert.ok(
    BATCH_DISTRACTOR_PROMPT.includes('このルールは他のどのルール（語形の類似など）よりも優先します'),
    'prompt must state the precedence explicitly',
  );
});

test('distractor prompt covers the ways a distractor can still be a correct translation', () => {
  const requiredSnippets = [
    '品詞が違う用法の意味',
    '正解の言い換え・類義語・表記違い',
    '正解を含む・正解に含まれる訳',
    '出題語の派生語・活用形の訳',
    '「出題語の他の訳」に列挙された訳',
  ];
  for (const snippet of requiredSnippets) {
    assert.equal(BATCH_DISTRACTOR_PROMPT.includes(snippet), true, `BATCH_DISTRACTOR_PROMPT should include: ${snippet}`);
  }
});

test('distractor prompt asks for a self-check and the source word of every distractor', () => {
  assert.equal(BATCH_DISTRACTOR_PROMPT.includes('自己検査'), true);
  assert.equal(BATCH_DISTRACTOR_PROMPT.includes('distractorSources'), true);
  assert.equal(
    BATCH_DISTRACTOR_PROMPT.includes(`候補を${DISTRACTOR_CANDIDATE_COUNT}つ`),
    true,
    'prompt must request more candidates than the 3 that are kept',
  );
  assert.ok(DISTRACTOR_CANDIDATE_COUNT > 3);
});

test('distractor prompt keeps the prohibition restated in the 禁止事項 section', () => {
  assert.equal(
    BATCH_DISTRACTOR_PROMPT.includes(
      '出題語自身が持つ「別の正しい意味（多義語・同音異義語の別義）」を誤答に含めない',
    ),
    true,
    'BATCH_DISTRACTOR_PROMPT 禁止事項 should restate the alternate-meaning prohibition',
  );
});

test('prompt instructs the model to leave non-requested fields empty', () => {
  const requiredSnippets = [
    '生成対象フィールドの指定',
    '生成対象に含まれないフィールドは生成せず、必ず空で返すこと',
  ];
  for (const snippet of requiredSnippets) {
    assert.equal(
      BATCH_DISTRACTOR_PROMPT.includes(snippet),
      true,
      `BATCH_DISTRACTOR_PROMPT should include: ${snippet}`,
    );
  }
});

test('word line lists the quiz word\'s other translations as forbidden, excluding the correct answer', () => {
  const line = buildQuizContentWordLine(
    { id: 'w1', english: 'bank', japanese: '銀行', knownTranslations: ['銀行', '土手', '', '堤防', '土手'] },
    0,
  );
  assert.equal(line.includes('出題語の他の訳（誤答禁止）: 土手、堤防'), true, line);
  assert.equal(line.includes('日本語（正解）: 銀行'), true);
});

test('word line omits the forbidden list when there are no other translations or no distractors are needed', () => {
  const plain = buildQuizContentWordLine({ id: 'w1', english: 'bank', japanese: '銀行' }, 0);
  assert.equal(plain.includes('出題語の他の訳'), false);

  const noDistractors = buildQuizContentWordLine(
    { id: 'w1', english: 'bank', japanese: '銀行', knownTranslations: ['土手'], needs: { distractors: false } },
    0,
  );
  assert.equal(noDistractors.includes('出題語の他の訳'), false);
});

test('resolveQuizContentNeeds defaults every field to true for backward compatibility', () => {
  const needs = resolveQuizContentNeeds({ id: 'w1', english: 'run', japanese: '走る' });
  assert.deepEqual(needs, { distractors: true, example: true, pronunciation: true, pos: true });
});

test('collectForbiddenSenses splits the correct answer and known translations into senses', () => {
  const senses = collectForbiddenSenses({
    japanese: '綿密に計画する、詳細に計画する',
    knownTranslations: ['（〜を）練る / 精緻化する'],
  });
  for (const expected of ['綿密に計画する', '詳細に計画する', '練る', '精緻化する']) {
    assert.ok(senses.includes(expected), `expected ${expected} in ${senses.join(',')}`);
  }
});

test('isDistractorSenseOfWord catches exact, contained, and format-variant matches', () => {
  const forbidden = collectForbiddenSenses({ japanese: '影響する', knownTranslations: ['影響、効果'] });
  assert.equal(isDistractorSenseOfWord('影響', forbidden), true, 'exact match of a known sense');
  assert.equal(isDistractorSenseOfWord('影響を与える', forbidden), true, 'contains a known sense');
  assert.equal(isDistractorSenseOfWord('効 果', forbidden), true, 'whitespace variant');
  assert.equal(isDistractorSenseOfWord('〜に効果（がある）', forbidden), true, 'leading tilde and bracket note');
  assert.equal(isDistractorSenseOfWord('感染させる', forbidden), false);
  assert.equal(isDistractorSenseOfWord('欠陥', forbidden), false);
});

test('isDistractorSenseOfWord does not over-reject on single-character overlaps', () => {
  const forbidden = collectForbiddenSenses({ japanese: '本' });
  assert.equal(isDistractorSenseOfWord('本', forbidden), true);
  assert.equal(isDistractorSenseOfWord('本当の', forbidden), false);
});

test('isSourceSameOrDerivedWord flags the quiz word itself and its derivations only', () => {
  assert.equal(isSourceSameOrDerivedWord('Predict', 'predict'), true);
  assert.equal(isSourceSameOrDerivedWord('to predict', 'predict'), true);
  assert.equal(isSourceSameOrDerivedWord('prediction', 'predict'), true);
  assert.equal(isSourceSameOrDerivedWord('predictable', 'predict'), true);
  assert.equal(isSourceSameOrDerivedWord('precede', 'predict'), false);
  assert.equal(isSourceSameOrDerivedWord('effect', 'affect'), false);
  assert.equal(isSourceSameOrDerivedWord('party', 'part'), false, 'short prefixes are not treated as derivations');
  assert.equal(isSourceSameOrDerivedWord('', 'predict'), false);
});

test('selectSafeDistractors drops candidates that are really translations of the quiz word', () => {
  const distractors = selectSafeDistractors(
    { english: 'bank', japanese: '銀行', knownTranslations: ['土手'] },
    ['土手', '地位', '堤防、川岸', '空白'],
    ['bank', 'rank', 'bank', 'blank'],
  );
  // 「土手」は既知の別義、「堤防、川岸」は出題語自身が元 (source = bank) なので落ちる。
  // 残り2つに汎用の埋め草が足されて3つになる。
  assert.deepEqual(distractors.slice(0, 2), ['地位', '空白']);
  assert.equal(distractors.length, 3);
  assert.equal(distractors[2], '確認する');
});

test('selectSafeDistractors keeps the first three surviving candidates in order', () => {
  const distractors = selectSafeDistractors(
    { english: 'predict', japanese: '予測する' },
    ['先行する', '処方する', '普及する', '保存する'],
    ['precede', 'prescribe', 'prevail', 'preserve'],
  );
  assert.deepEqual(distractors, ['先行する', '処方する', '普及する']);
});

test('selectSafeDistractors uses the spare candidate when one is rejected', () => {
  const distractors = selectSafeDistractors(
    { english: 'predict', japanese: '予測する' },
    ['先行する', '予測', '普及する', '保存する'],
    ['precede', 'prediction', 'prevail', 'preserve'],
  );
  assert.deepEqual(distractors, ['先行する', '普及する', '保存する']);
});

test('selectSafeDistractors works without distractorSources (older model output)', () => {
  const distractors = selectSafeDistractors(
    { english: 'spring', japanese: '春' },
    ['ばね', '夏', '冬', '秋'],
    undefined,
  );
  // 「ばね」は既知の訳に無いので sources 無しでは落とせない（プロンプト側の責任）。
  assert.deepEqual(distractors, ['ばね', '夏', '冬']);
});

test('selectSafeDistractors dedupes format variants of the same distractor', () => {
  const distractors = selectSafeDistractors(
    { english: 'adopt', japanese: '採用する' },
    ['適応する', '適応 する', '〜適応する', '養子にする', '崇拝する'],
    [],
  );
  assert.deepEqual(distractors, ['適応する', '養子にする', '崇拝する']);
});

test('buildQuizContentResults accepts distractor-less results when distractors were not requested', () => {
  const words = [
    {
      id: 'w1',
      english: 'run',
      japanese: '走る',
      needs: { distractors: false, example: true, pronunciation: false, pos: false },
    },
  ];
  const results = buildQuizContentResults(
    [{ id: 'w1', distractors: [], exampleSentence: 'I run every day.', exampleSentenceJa: '私は毎日走る。' }],
    words,
  );
  assert.equal(results.length, 1);
  assert.deepEqual(results[0].distractors, []);
  assert.equal(results[0].exampleSentence, 'I run every day.');
  assert.equal(results[0].exampleSentenceJa, '私は毎日走る。');
});

test('buildQuizContentResults drops fields the caller did not request even if the model returned them', () => {
  const words = [
    {
      id: 'w1',
      english: 'run',
      japanese: '走る',
      needs: { distractors: true, example: false, pronunciation: false, pos: false },
    },
  ];
  const results = buildQuizContentResults(
    [{
      id: 'w1',
      distractors: ['歩く', '泳ぐ', '飛ぶ'],
      partOfSpeechTags: ['verb'],
      pronunciation: '/rʌn/',
      exampleSentence: 'She runs a company.',
      exampleSentenceJa: '彼女は会社を経営する。',
    }],
    words,
  );
  assert.equal(results.length, 1);
  assert.deepEqual(results[0].distractors, ['歩く', '泳ぐ', '飛ぶ']);
  assert.deepEqual(results[0].partOfSpeechTags, []);
  assert.equal(results[0].pronunciation, '');
  assert.equal(results[0].exampleSentence, '');
  assert.equal(results[0].exampleSentenceJa, '');
});

test('buildQuizContentResults still requires at least 3 distractors when distractors are requested', () => {
  const words = [
    { id: 'w1', english: 'run', japanese: '走る' },
  ];
  const results = buildQuizContentResults(
    [{ id: 'w1', distractors: ['歩く'], exampleSentence: 'x', exampleSentenceJa: 'y' }],
    words,
  );
  assert.equal(results.length, 0);
});

test('buildQuizContentResults trims 4 model candidates down to 3 safe distractors', () => {
  const words = [
    { id: 'w1', english: 'book', japanese: '本', knownTranslations: ['予約する'] },
  ];
  const results = buildQuizContentResults(
    [{
      id: 'w1',
      distractors: ['予約する', '見る', '料理する', '掛け金'],
      distractorSources: ['book', 'look', 'cook', 'hook'],
    }],
    words,
  );
  assert.equal(results.length, 1);
  assert.deepEqual(results[0].distractors, ['見る', '料理する', '掛け金']);
});
