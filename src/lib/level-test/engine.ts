import { EIKEN_LEVEL_ORDER } from '@/lib/ai/prompts/eiken';
import { shuffleArray } from '@/lib/utils';
import type { BankWord, LevelTestBank } from './bank';

// 語彙レベル診断のベイズ推定型適応アルゴリズム(純粋ロジック)。
//
// ユーザーの潜在能力θを「各能力値である確率」の分布(事後分布)として持ち、
// 回答のたびに尤度で更新する。級を直接上下させる階段型の状態遷移は使わない。
//
// - 正解確率はIRT(項目反応理論)の3PL風モデル:
//   guessing + (1 - guessing - slip) * sigmoid(discrimination * (theta - difficulty))
//   四択の当て推量(25%)と、知っていても間違えるうっかりミス(5%)を織り込む。
// - 次の問題は期待情報利得(EIG)が最大の問題を選ぶ。終盤4問は推定境界の
//   上下から交互に出題し、最後の1問で結果が揺れないか確認する。
// - 全20問。結果は「最後にいたレベル」ではなく、全回答を最もよく説明する
//   事後平均θから決める。90%信用区間と判定の確かさも併せて返す。

export const LEVEL_TEST_QUESTION_COUNT = 20;
export const MIN_LEVEL_INDEX = 0;
export const MAX_LEVEL_INDEX = EIKEN_LEVEL_ORDER.length - 1; // 6

// index 0..6 = 英検5級..1級(EIKEN_LEVEL_ORDER と同順)
export const EIKEN_LEVEL_LABELS = [
  '英検5級',
  '英検4級',
  '英検3級',
  '英検準2級',
  '英検2級',
  '英検準1級',
  '英検1級',
] as const;

// 各級合格の目安としてよく引用される推定語彙数。θ→語彙数変換のアンカーにも使う。
export const VOCAB_SIZE_BY_LEVEL = [600, 1300, 2100, 3600, 5100, 7500, 12000] as const;

// ---------------------------------------------------------------------------
// θグリッドとIRTパラメータ
// ---------------------------------------------------------------------------

// θはレベルインデックスと同じ尺度(0=5級 .. 6=1級)。級の外側にも裾を持たせる。
export const THETA_MIN = -1;
export const THETA_MAX = 7;
export const THETA_STEP = 0.05;
export const THETA_GRID: readonly number[] = Array.from(
  { length: Math.round((THETA_MAX - THETA_MIN) / THETA_STEP) + 1 },
  (_, index) => THETA_MIN + index * THETA_STEP,
);

// 全問題共通の初期パラメータ。実データが集まったら問題ごとの調整に置き換える。
const DEFAULT_DISCRIMINATION = 1.2;
const DEFAULT_GUESSING = 0.25; // 四択
const DEFAULT_SLIP = 0.05;

// 級内の難易度ばらつき幅(基準値±0.3)
const WITHIN_LEVEL_DIFFICULTY_SPREAD = 0.3;

// 級=カテゴリ、difficulty=実際の難しさとして分離する。バンクは頻度順に
// 並んでいるため、級内の語インデックスを難易度オフセットの近似に使う
// (先頭=易しい: 基準-0.3、末尾=難しい: 基準+0.3)。
export function questionDifficulty(
  levelIndex: number,
  wordIndex: number,
  levelWordCount: number,
): number {
  const base = levelIndex;
  if (levelWordCount <= 1) return base;
  const ratio = wordIndex / (levelWordCount - 1);
  return base - WITHIN_LEVEL_DIFFICULTY_SPREAD + ratio * WITHIN_LEVEL_DIFFICULTY_SPREAD * 2;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function probabilityOfCorrect(theta: number, difficulty: number): number {
  const knowledgeProbability = sigmoid(DEFAULT_DISCRIMINATION * (theta - difficulty));
  return DEFAULT_GUESSING + (1 - DEFAULT_GUESSING - DEFAULT_SLIP) * knowledgeProbability;
}

// ---------------------------------------------------------------------------
// 事後分布の更新
// ---------------------------------------------------------------------------

export function createInitialPosterior(): number[] {
  return THETA_GRID.map(() => 1 / THETA_GRID.length);
}

function normalize(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0 || !Number.isFinite(total)) {
    return values.map(() => 1 / values.length);
  }
  return values.map((value) => value / total);
}

export function updatePosterior(
  posterior: readonly number[],
  difficulty: number,
  correct: boolean,
): number[] {
  const updated = posterior.map((priorProbability, index) => {
    const correctProbability = probabilityOfCorrect(THETA_GRID[index], difficulty);
    const likelihood = correct ? correctProbability : 1 - correctProbability;
    return priorProbability * likelihood;
  });
  return normalize(updated);
}

export function posteriorMean(posterior: readonly number[]): number {
  return posterior.reduce((sum, probability, index) => sum + probability * THETA_GRID[index], 0);
}

export function posteriorStandardDeviation(posterior: readonly number[]): number {
  const mean = posteriorMean(posterior);
  const variance = posterior.reduce((sum, probability, index) => {
    const difference = THETA_GRID[index] - mean;
    return sum + probability * difference ** 2;
  }, 0);
  return Math.sqrt(variance);
}

export function posteriorQuantile(posterior: readonly number[], target: number): number {
  let cumulative = 0;
  for (let index = 0; index < posterior.length; index += 1) {
    cumulative += posterior[index];
    if (cumulative >= target) return THETA_GRID[index];
  }
  return THETA_GRID[THETA_GRID.length - 1];
}

function entropy(probabilities: readonly number[]): number {
  return probabilities.reduce((sum, probability) => {
    if (probability <= 0) return sum;
    return sum - probability * Math.log(probability);
  }, 0);
}

// 回答(正解/不正解の両ケース)後にどれだけ不確実性が減るかの期待値。
export function expectedInformationGain(
  posterior: readonly number[],
  difficulty: number,
): number {
  const currentEntropy = entropy(posterior);
  const probabilityCorrect = posterior.reduce(
    (sum, probability, index) => sum + probability * probabilityOfCorrect(THETA_GRID[index], difficulty),
    0,
  );
  const expectedEntropy =
    probabilityCorrect * entropy(updatePosterior(posterior, difficulty, true)) +
    (1 - probabilityCorrect) * entropy(updatePosterior(posterior, difficulty, false));
  return currentEntropy - expectedEntropy;
}

// ---------------------------------------------------------------------------
// 診断の状態
// ---------------------------------------------------------------------------

export type LevelTestState = {
  // THETA_GRID上の事後確率(初期は一様分布)
  posterior: number[];
  answeredCount: number;
  askedByLevel: number[];
  correctByLevel: number[];
};

export function createInitialState(): LevelTestState {
  return {
    posterior: createInitialPosterior(),
    answeredCount: 0,
    askedByLevel: EIKEN_LEVEL_ORDER.map(() => 0),
    correctByLevel: EIKEN_LEVEL_ORDER.map(() => 0),
  };
}

export function isFinished(state: LevelTestState): boolean {
  return state.answeredCount >= LEVEL_TEST_QUESTION_COUNT;
}

export type QuestionRef = {
  levelIndex: number;
  wordIndex: number;
};

export function answerQuestion(
  state: LevelTestState,
  question: QuestionRef,
  bank: LevelTestBank,
  correct: boolean,
): LevelTestState {
  const levelWordCount = bank.levels[question.levelIndex]?.length ?? 1;
  const difficulty = questionDifficulty(question.levelIndex, question.wordIndex, levelWordCount);

  const askedByLevel = [...state.askedByLevel];
  const correctByLevel = [...state.correctByLevel];
  askedByLevel[question.levelIndex] += 1;
  if (correct) correctByLevel[question.levelIndex] += 1;

  return {
    posterior: updatePosterior(state.posterior, difficulty, correct),
    answeredCount: state.answeredCount + 1,
    askedByLevel,
    correctByLevel,
  };
}

// ---------------------------------------------------------------------------
// 出題選択
// ---------------------------------------------------------------------------

export function usedKeyFor(levelIndex: number, wordIndex: number): string {
  return `${levelIndex}:${wordIndex}`;
}

// 終盤の「確認」フェーズ問数と、境界からの距離
const CONFIRMATION_QUESTION_COUNT = 4;
const CONFIRMATION_OFFSET = 0.7;
// 各級からサンプリングする候補語数。局所的な語の得意不得意に左右されないよう
// ランダムに引き直す(品詞・分野の変化付けを兼ねる)。
const CANDIDATES_PER_LEVEL = 3;

type Candidate = QuestionRef & { difficulty: number };

function sampleCandidates(
  bank: LevelTestBank,
  usedKeys: ReadonlySet<string>,
  random: () => number,
): Candidate[] {
  const candidates: Candidate[] = [];
  for (let levelIndex = 0; levelIndex <= MAX_LEVEL_INDEX; levelIndex += 1) {
    const words = bank.levels[levelIndex] ?? [];
    const unusedIndexes: number[] = [];
    for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
      if (!usedKeys.has(usedKeyFor(levelIndex, wordIndex))) {
        unusedIndexes.push(wordIndex);
      }
    }
    for (let pick = 0; pick < CANDIDATES_PER_LEVEL && unusedIndexes.length > 0; pick += 1) {
      const position = Math.floor(random() * unusedIndexes.length);
      const wordIndex = unusedIndexes.splice(position, 1)[0];
      candidates.push({
        levelIndex,
        wordIndex,
        difficulty: questionDifficulty(levelIndex, wordIndex, words.length),
      });
    }
  }
  return candidates;
}

// 現在の事後分布を最もよく判別できる問題を選ぶ。
// - 序盤〜中盤(収束): 候補の中でEIG最大の問題。一様事前分布から始まるため
//   序盤は自然に中間難易度→実力付近へ寄っていく(探索を兼ねる)。
// - 終盤4問(確認): 推定境界の下(θ̂-0.7)と上(θ̂+0.7)へ交互に出題し、
//   推定が一時的な偶然でないか確かめる。
export function selectNextQuestion(
  bank: LevelTestBank,
  state: LevelTestState,
  usedKeys: ReadonlySet<string>,
  random: () => number = Math.random,
): QuestionRef | null {
  const candidates = sampleCandidates(bank, usedKeys, random);
  if (candidates.length === 0) return null;

  const confirmationIndex =
    state.answeredCount - (LEVEL_TEST_QUESTION_COUNT - CONFIRMATION_QUESTION_COUNT);
  if (confirmationIndex >= 0) {
    const mean = posteriorMean(state.posterior);
    // 下→上→下→上 の順で境界の両側を確認する
    const direction = confirmationIndex % 2 === 0 ? -1 : 1;
    const targetDifficulty = mean + direction * CONFIRMATION_OFFSET;
    const best = candidates.reduce((bestSoFar, candidate) =>
      Math.abs(candidate.difficulty - targetDifficulty) <
      Math.abs(bestSoFar.difficulty - targetDifficulty)
        ? candidate
        : bestSoFar,
    );
    return { levelIndex: best.levelIndex, wordIndex: best.wordIndex };
  }

  let best = candidates[0];
  let bestGain = expectedInformationGain(state.posterior, best.difficulty);
  for (let index = 1; index < candidates.length; index += 1) {
    const gain = expectedInformationGain(state.posterior, candidates[index].difficulty);
    if (gain > bestGain) {
      best = candidates[index];
      bestGain = gain;
    }
  }
  return { levelIndex: best.levelIndex, wordIndex: best.wordIndex };
}

// ---------------------------------------------------------------------------
// 結果算出
// ---------------------------------------------------------------------------

export type LevelTestConfidence = 'high' | 'medium' | 'low';

export const CONFIDENCE_LABELS: Record<LevelTestConfidence, string> = {
  high: '高い',
  medium: '標準',
  low: '暫定',
};

export type LevelTestResult = {
  // 事後平均θ(連続値)。級はこの値を表示用に丸めたラベルにすぎない。
  ability: number;
  finalLevel: number;
  // 90%信用区間(5%〜95%分位点)のθと、それをレベルに丸めた推定範囲
  lowerAbility: number;
  upperAbility: number;
  lowerLevel: number;
  upperLevel: number;
  confidence: LevelTestConfidence;
  clearedMax: boolean;
  correctTotal: number;
  askedByLevel: number[];
  correctByLevel: number[];
};

export function levelFromTheta(theta: number): number {
  const bounded = Math.max(MIN_LEVEL_INDEX, Math.min(MAX_LEVEL_INDEX, theta));
  return Math.round(bounded);
}

function confidenceFromStandardDeviation(sd: number): LevelTestConfidence {
  if (sd <= 0.4) return 'high';
  if (sd <= 0.8) return 'medium';
  return 'low';
}

export function buildResult(state: LevelTestState): LevelTestResult {
  const ability = posteriorMean(state.posterior);
  const sd = posteriorStandardDeviation(state.posterior);
  const lowerTheta = posteriorQuantile(state.posterior, 0.05);
  const upperTheta = posteriorQuantile(state.posterior, 0.95);

  const finalLevel = levelFromTheta(ability);
  const askedAtMax = state.askedByLevel[MAX_LEVEL_INDEX];
  const correctAtMax = state.correctByLevel[MAX_LEVEL_INDEX];

  return {
    ability,
    finalLevel,
    lowerAbility: Math.min(ability, lowerTheta),
    upperAbility: Math.max(ability, upperTheta),
    lowerLevel: Math.min(finalLevel, levelFromTheta(lowerTheta)),
    upperLevel: Math.max(finalLevel, levelFromTheta(upperTheta)),
    confidence: confidenceFromStandardDeviation(sd),
    // 1級判定かつ1級問題(2問以上)を全問正解したときだけ「完全制覇」
    clearedMax: finalLevel === MAX_LEVEL_INDEX && askedAtMax >= 2 && correctAtMax === askedAtMax,
    correctTotal: state.correctByLevel.reduce((sum, count) => sum + count, 0),
    askedByLevel: [...state.askedByLevel],
    correctByLevel: [...state.correctByLevel],
  };
}

// ---------------------------------------------------------------------------
// θ→推定語彙数の変換
// ---------------------------------------------------------------------------

// 級のアンカー(θ=レベルインデックス、語彙数=VOCAB_SIZE_BY_LEVEL)を線形補間する。
// 根拠のある個別キャリブレーションが得られるまでの暫定対応表。
export function estimateVocabularySize(theta: number): number {
  const bounded = Math.max(MIN_LEVEL_INDEX, Math.min(MAX_LEVEL_INDEX, theta));
  const lowerIndex = Math.min(MAX_LEVEL_INDEX - 1, Math.floor(bounded));
  const ratio = bounded - lowerIndex;
  const size =
    VOCAB_SIZE_BY_LEVEL[lowerIndex] +
    ratio * (VOCAB_SIZE_BY_LEVEL[lowerIndex + 1] - VOCAB_SIZE_BY_LEVEL[lowerIndex]);
  return Math.round(size / 100) * 100;
}

// ---------------------------------------------------------------------------
// 問題の組み立て
// ---------------------------------------------------------------------------

export type LevelTestQuestion = {
  prompt: string;
  options: string[];
  correctIndex: number;
};

export function buildQuestion(
  word: BankWord,
  shuffle: <T>(items: T[]) => T[] = shuffleArray,
): LevelTestQuestion {
  const options = shuffle([word.japanese, ...word.distractors]);
  return {
    prompt: word.english,
    options,
    correctIndex: options.indexOf(word.japanese),
  };
}
