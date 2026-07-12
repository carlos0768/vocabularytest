import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EIKEN_LEVEL_LABELS,
  LEVEL_TEST_QUESTION_COUNT,
  MAX_LEVEL_INDEX,
  MIN_LEVEL_INDEX,
  THETA_GRID,
  VOCAB_SIZE_BY_LEVEL,
  answerQuestion,
  buildQuestion,
  buildResult,
  createInitialState,
  estimateVocabularySize,
  expectedInformationGain,
  isFinished,
  levelFromTheta,
  posteriorMean,
  posteriorQuantile,
  posteriorStandardDeviation,
  probabilityOfCorrect,
  questionDifficulty,
  selectNextQuestion,
  updatePosterior,
  usedKeyFor,
  type LevelTestState,
} from './engine';
import type { LevelTestBank } from './bank';

// 再現性のためのシード付きPRNG(mulberry32)
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS_PER_LEVEL = 40;
const TEST_BANK: LevelTestBank = {
  version: 1,
  levels: Array.from({ length: 7 }, (_, levelIndex) =>
    Array.from({ length: WORDS_PER_LEVEL }, (_, wordIndex) => ({
      english: `word-${levelIndex}-${wordIndex}`,
      japanese: `訳${levelIndex}-${wordIndex}`,
      distractors: ['誤1', '誤2', '誤3'] as [string, string, string],
    }))),
};

// 真の能力thetaを持つ仮想ユーザーに1回分の診断を受けさせる
function simulateRun(trueTheta: number, seed: number): LevelTestState {
  const random = seededRandom(seed);
  let state = createInitialState();
  const used = new Set<string>();
  while (!isFinished(state)) {
    const picked = selectNextQuestion(TEST_BANK, state, used, random);
    assert.ok(picked, 'question bank should not exhaust in 20 questions');
    used.add(usedKeyFor(picked!.levelIndex, picked!.wordIndex));
    const difficulty = questionDifficulty(picked!.levelIndex, picked!.wordIndex, WORDS_PER_LEVEL);
    const correct = random() < probabilityOfCorrect(trueTheta, difficulty);
    state = answerQuestion(state, picked!, TEST_BANK, correct);
  }
  return state;
}

test('createInitialState starts with a uniform posterior and zero tallies', () => {
  const state = createInitialState();
  assert.equal(state.answeredCount, 0);
  assert.equal(state.posterior.length, THETA_GRID.length);
  assert.equal(state.askedByLevel.length, 7);
  assert.equal(state.correctByLevel.length, 7);
  assert.equal(EIKEN_LEVEL_LABELS.length, 7);
  assert.equal(VOCAB_SIZE_BY_LEVEL.length, 7);
  const sum = state.posterior.reduce((total, p) => total + p, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  // 一様分布なので事後平均はグリッド中央
  assert.ok(Math.abs(posteriorMean(state.posterior) - 3) < 1e-9);
});

test('probabilityOfCorrect keeps the guessing floor and slip ceiling', () => {
  // 実力が難易度よりはるかに低くても四択の当て推量(約25%)は残る
  assert.ok(probabilityOfCorrect(-1, 6) > 0.24);
  assert.ok(probabilityOfCorrect(-1, 6) < 0.3);
  // 実力が十分でもうっかりミスを考慮して100%にはならない
  assert.ok(probabilityOfCorrect(7, 0) < 0.96);
  assert.ok(probabilityOfCorrect(7, 0) > 0.9);
  // 能力に対して単調増加
  let previous = 0;
  for (const theta of [-1, 0, 1, 2, 3, 4, 5, 6, 7]) {
    const p = probabilityOfCorrect(theta, 3);
    assert.ok(p > previous);
    previous = p;
  }
});

test('questionDifficulty spreads ±0.3 around the level base by word index', () => {
  assert.equal(questionDifficulty(4, 0, WORDS_PER_LEVEL), 4 - 0.3);
  assert.ok(Math.abs(questionDifficulty(4, WORDS_PER_LEVEL - 1, WORDS_PER_LEVEL) - 4.3) < 1e-9);
  // 単語1語しかない級では基準値そのまま(ゼロ除算しない)
  assert.equal(questionDifficulty(2, 0, 1), 2);
});

test('updatePosterior treats answers as evidence, not verdicts', () => {
  const uniform = createInitialState().posterior;
  const meanBefore = posteriorMean(uniform);

  // 難しい問題への正解は上位レベルを支持する強い証拠
  const afterHardCorrect = updatePosterior(uniform, 5.5, true);
  assert.ok(posteriorMean(afterHardCorrect) > meanBefore + 0.3);

  // 簡単な問題への不正解は下位レベルを支持する強い証拠
  const afterEasyWrong = updatePosterior(uniform, 0.5, false);
  assert.ok(posteriorMean(afterEasyWrong) < meanBefore - 0.3);

  // 難しい問題への不正解は自然な結果なので弱い証拠(変化が小さい)
  const afterHardWrong = updatePosterior(uniform, 6.5, false);
  assert.ok(Math.abs(posteriorMean(afterHardWrong) - meanBefore) <
    Math.abs(posteriorMean(afterEasyWrong) - meanBefore));

  // 1問で可能性を消さない: どの更新後も全域で確率が正
  for (const p of afterEasyWrong) assert.ok(p > 0);
});

test('expectedInformationGain prefers mid-difficulty questions under a uniform prior', () => {
  const uniform = createInitialState().posterior;
  const midGain = expectedInformationGain(uniform, 3);
  const easyGain = expectedInformationGain(uniform, -0.7);
  const hardGain = expectedInformationGain(uniform, 6.7);
  assert.ok(midGain > easyGain);
  assert.ok(midGain > hardGain);
});

test('selectNextQuestion never repeats a used word and returns null when exhausted', () => {
  const random = seededRandom(42);
  const smallBank: LevelTestBank = {
    version: 1,
    levels: Array.from({ length: 7 }, (_, levelIndex) =>
      Array.from({ length: 2 }, (_, wordIndex) => ({
        english: `w-${levelIndex}-${wordIndex}`,
        japanese: `j-${levelIndex}-${wordIndex}`,
        distractors: ['a', 'b', 'c'] as [string, string, string],
      }))),
  };
  const state = createInitialState();
  const used = new Set<string>();
  for (let i = 0; i < 14; i += 1) {
    const picked = selectNextQuestion(smallBank, state, used, random);
    assert.ok(picked);
    const key = usedKeyFor(picked!.levelIndex, picked!.wordIndex);
    assert.ok(!used.has(key));
    used.add(key);
  }
  assert.equal(selectNextQuestion(smallBank, state, used, random), null);
});

test('confirmation phase (last 4 questions) probes below and above the estimate', () => {
  const random = seededRandom(7);
  // 準1級相当の事後分布を作る(θ=5付近の証拠を積む)
  let state = createInitialState();
  const used = new Set<string>();
  for (let i = 0; i < 16; i += 1) {
    const ref = { levelIndex: 5, wordIndex: i };
    used.add(usedKeyFor(ref.levelIndex, ref.wordIndex));
    state = answerQuestion(state, ref, TEST_BANK, i % 2 === 0);
  }
  assert.equal(state.answeredCount, 16);
  const mean = posteriorMean(state.posterior);

  const below = selectNextQuestion(TEST_BANK, state, used, random);
  assert.ok(below);
  const belowDifficulty = questionDifficulty(below!.levelIndex, below!.wordIndex, WORDS_PER_LEVEL);
  assert.ok(belowDifficulty < mean, '17問目は境界の下側を確認する');

  used.add(usedKeyFor(below!.levelIndex, below!.wordIndex));
  state = answerQuestion(state, below!, TEST_BANK, true);
  const above = selectNextQuestion(TEST_BANK, state, used, random);
  assert.ok(above);
  const aboveDifficulty = questionDifficulty(above!.levelIndex, above!.wordIndex, WORDS_PER_LEVEL);
  assert.ok(aboveDifficulty > posteriorMean(state.posterior), '18問目は境界の上側を確認する');
});

test('a perfect 20-question run is judged 英検1級 with clearedMax', () => {
  const random = seededRandom(3);
  let state = createInitialState();
  const used = new Set<string>();
  while (!isFinished(state)) {
    const picked = selectNextQuestion(TEST_BANK, state, used, random);
    assert.ok(picked);
    used.add(usedKeyFor(picked!.levelIndex, picked!.wordIndex));
    state = answerQuestion(state, picked!, TEST_BANK, true);
  }
  const result = buildResult(state);
  assert.equal(result.finalLevel, MAX_LEVEL_INDEX);
  assert.equal(result.correctTotal, LEVEL_TEST_QUESTION_COUNT);
  assert.ok(result.ability > 5.5);
  // 全問正解なら出題は最難関帯へ吸い寄せられ、1級問題も2問以上出題される
  assert.ok(result.askedByLevel[MAX_LEVEL_INDEX] >= 2);
  assert.equal(result.clearedMax, true);
});

test('an all-wrong 20-question run is judged 英検5級', () => {
  const random = seededRandom(9);
  let state = createInitialState();
  const used = new Set<string>();
  while (!isFinished(state)) {
    const picked = selectNextQuestion(TEST_BANK, state, used, random);
    assert.ok(picked);
    used.add(usedKeyFor(picked!.levelIndex, picked!.wordIndex));
    state = answerQuestion(state, picked!, TEST_BANK, false);
  }
  const result = buildResult(state);
  assert.equal(result.finalLevel, MIN_LEVEL_INDEX);
  assert.equal(result.correctTotal, 0);
  assert.equal(result.clearedMax, false);
});

test('simulated users converge near their true ability', () => {
  for (const trueTheta of [1, 3, 5]) {
    let totalError = 0;
    const runs = 10;
    for (let seed = 0; seed < runs; seed += 1) {
      const state = simulateRun(trueTheta, seed * 101 + 17);
      const result = buildResult(state);
      totalError += Math.abs(result.ability - trueTheta);
      // 個々の推定も大外れしない(20問+四択の当て推量なので±2レベル弱まで許容)
      assert.ok(Math.abs(result.ability - trueTheta) < 1.8,
        `theta=${trueTheta} seed=${seed}: ability=${result.ability}`);
      // タリーの整合
      assert.equal(result.askedByLevel.reduce((a, b) => a + b, 0), LEVEL_TEST_QUESTION_COUNT);
      for (let i = 0; i < 7; i += 1) {
        assert.ok(result.correctByLevel[i] <= result.askedByLevel[i]);
      }
      assert.ok(result.lowerAbility <= result.ability && result.ability <= result.upperAbility);
      assert.ok(result.lowerLevel <= result.finalLevel && result.finalLevel <= result.upperLevel);
    }
    // 平均誤差は1レベル未満
    assert.ok(totalError / runs < 1, `theta=${trueTheta}: mean error ${totalError / runs}`);
  }
});

test('flipping only the final answer barely moves the estimate (anti-swing)', () => {
  // 「最後にどちらへ動いたか」で結果が1レベル揺れる旧方式の問題が
  // 解消されていることを確認する。19問同一系列+最終問の正誤反転で
  // 事後平均の差が0.35(レベル差の1/3強)未満に収まること。
  const random = seededRandom(29);
  let state = createInitialState();
  const used = new Set<string>();
  let lastPicked: { levelIndex: number; wordIndex: number } | null = null;
  for (let i = 0; i < LEVEL_TEST_QUESTION_COUNT; i += 1) {
    const picked = selectNextQuestion(TEST_BANK, state, used, random);
    assert.ok(picked);
    used.add(usedKeyFor(picked!.levelIndex, picked!.wordIndex));
    if (i === LEVEL_TEST_QUESTION_COUNT - 1) {
      lastPicked = picked;
      break;
    }
    // 準1級相当のユーザーを模して正誤を交ぜる
    state = answerQuestion(state, picked!, TEST_BANK, i % 3 !== 2);
  }
  const withCorrect = buildResult(answerQuestion(state, lastPicked!, TEST_BANK, true));
  const withWrong = buildResult(answerQuestion(state, lastPicked!, TEST_BANK, false));
  assert.ok(Math.abs(withCorrect.ability - withWrong.ability) < 0.35);
});

test('buildResult maps posterior statistics to level, range, and confidence', () => {
  // θ=4.6付近に集中した事後分布を手で作る
  let posterior = createInitialState().posterior;
  for (let i = 0; i < 10; i += 1) {
    posterior = updatePosterior(posterior, 4.6, i % 2 === 0);
    posterior = updatePosterior(posterior, 4.0, true);
  }
  const state: LevelTestState = {
    posterior,
    answeredCount: 20,
    askedByLevel: [0, 0, 0, 0, 10, 10, 0],
    correctByLevel: [0, 0, 0, 0, 9, 4, 0],
  };
  const result = buildResult(state);
  assert.equal(result.finalLevel, levelFromTheta(result.ability));
  assert.ok(result.lowerAbility <= result.ability && result.ability <= result.upperAbility);
  const sd = posteriorStandardDeviation(posterior);
  if (sd <= 0.4) assert.equal(result.confidence, 'high');
  else if (sd <= 0.8) assert.equal(result.confidence, 'medium');
  else assert.equal(result.confidence, 'low');
  assert.equal(result.correctTotal, 13);
  // 1級問題に正解実績がないのでclearedMaxにはならない
  assert.equal(result.clearedMax, false);
});

test('posteriorQuantile walks the cumulative distribution', () => {
  const uniform = createInitialState().posterior;
  const median = posteriorQuantile(uniform, 0.5);
  assert.ok(Math.abs(median - 3) < 0.1);
  assert.ok(posteriorQuantile(uniform, 0.05) < median);
  assert.ok(posteriorQuantile(uniform, 0.95) > median);
});

test('levelFromTheta clamps and rounds to the nearest level', () => {
  assert.equal(levelFromTheta(-1), MIN_LEVEL_INDEX);
  assert.equal(levelFromTheta(7), MAX_LEVEL_INDEX);
  assert.equal(levelFromTheta(4.4), 4);
  assert.equal(levelFromTheta(4.6), 5);
});

test('estimateVocabularySize interpolates between level anchors monotonically', () => {
  // アンカーで一致(100語丸め)
  for (let level = 0; level <= MAX_LEVEL_INDEX; level += 1) {
    assert.equal(estimateVocabularySize(level), VOCAB_SIZE_BY_LEVEL[level]);
  }
  // 中間は両端の間、範囲外はクランプ
  const between = estimateVocabularySize(5.5);
  assert.ok(between > VOCAB_SIZE_BY_LEVEL[5] && between < VOCAB_SIZE_BY_LEVEL[6]);
  assert.equal(estimateVocabularySize(-2), VOCAB_SIZE_BY_LEVEL[0]);
  assert.equal(estimateVocabularySize(9), VOCAB_SIZE_BY_LEVEL[6]);
  // 単調非減少
  let previous = 0;
  for (let theta = 0; theta <= 6; theta += 0.25) {
    const size = estimateVocabularySize(theta);
    assert.ok(size >= previous);
    previous = size;
  }
});

test('buildQuestion shuffles four options and tracks the correct index', () => {
  const word = TEST_BANK.levels[0][0];
  const reversed = <T,>(items: T[]): T[] => [...items].reverse();
  const question = buildQuestion(word, reversed);
  assert.equal(question.prompt, word.english);
  assert.equal(question.options.length, 4);
  assert.equal(question.options[question.correctIndex], word.japanese);
});
