/**
 * ボット対戦（人が集まらないときの相手）の性格づけと行動計画。
 *
 * ボットは「いつ押すか」「どれを押すか」を**出題と同時に**全ラウンドぶん決めて
 * しまい、`battle_bot_plans` に隠す（RLS 有効・ポリシー無しなのでクライアント
 * からは読めない）。対戦中にサイコロを振らないのは、
 *
 *   - Route Handler が常駐できないので、対戦中に「ボットを動かすサーバー」が
 *     いない。押す判断をその場でやるとクライアントに委ねることになる
 *   - 計画済みなら、人間が回答した瞬間・時間切れ・定期tick のどの経路から
 *     清算しても「出題開始 + buzz_at_ms」という同じ結論になる
 *
 * ため。強さの差は正答率と押す速さで出す。
 */

import type { BattleGeneratedQuestion } from '@/lib/battle/types';

export const BATTLE_BOT_LEVELS = ['easy', 'normal', 'hard'] as const;

export type BattleBotLevel = (typeof BATTLE_BOT_LEVELS)[number];

export const BATTLE_DEFAULT_BOT_LEVEL: BattleBotLevel = 'normal';

/** どんなに強くてもこれより速くは押さない（人間に押す余地を残す）。 */
export const BATTLE_BOT_MIN_BUZZ_MS = 800;

/** 締切のこの手前までしか押さない。ブザーと同時の紛らわしい決着を避ける。 */
export const BATTLE_BOT_BUZZ_TAIL_MS = 600;

export type BattleBotProfile = {
  /** 対戦画面に出る相手の名前。 */
  name: string;
  /** 設定画面のラベル。 */
  label: string;
  /** 正解を選ぶ確率。 */
  accuracy: number;
  /** 押すまでの最短・最長（出題開始からのms）。 */
  minBuzzMs: number;
  maxBuzzMs: number;
  /** そのラウンドを丸ごと見送る（1回も押さない）確率。 */
  passRate: number;
};

export const BATTLE_BOT_PROFILES: Record<BattleBotLevel, BattleBotProfile> = {
  easy: {
    name: 'ルーキーBOT',
    label: 'かんたん',
    accuracy: 0.5,
    minBuzzMs: 3_500,
    maxBuzzMs: 7_000,
    passRate: 0.25,
  },
  normal: {
    name: 'チャレンジャーBOT',
    label: 'ふつう',
    accuracy: 0.72,
    minBuzzMs: 2_200,
    maxBuzzMs: 5_000,
    passRate: 0.12,
  },
  hard: {
    name: 'マスターBOT',
    label: 'つよい',
    accuracy: 0.9,
    minBuzzMs: 1_200,
    maxBuzzMs: 3_000,
    passRate: 0.03,
  },
};

export function isBattleBotLevel(value: unknown): value is BattleBotLevel {
  return typeof value === 'string' && (BATTLE_BOT_LEVELS as readonly string[]).includes(value);
}

export function getBattleBotName(level: BattleBotLevel): string {
  return BATTLE_BOT_PROFILES[level].name;
}

export type BattleBotPlan = {
  roundIndex: number;
  /** 出題開始から何ms後に押すか。 */
  buzzAtMs: number;
  /** そのとき押す選択肢。 */
  choiceIndex: number;
  /** false ならこのラウンドは最後まで押さない。 */
  willAnswer: boolean;
};

export type RandomFn = () => number;

/**
 * 押す時刻の幅を、そのラウンドの制限時間に収める。制限時間は3秒まで短くできる
 * ので、プロフィールの値をそのまま使うと「締切より後に押す計画」になりうる。
 */
function resolveBuzzWindow(
  profile: BattleBotProfile,
  roundDurationMs: number,
): { minMs: number; maxMs: number } {
  const latest = Math.max(
    BATTLE_BOT_MIN_BUZZ_MS,
    roundDurationMs - BATTLE_BOT_BUZZ_TAIL_MS,
  );
  const maxMs = Math.max(BATTLE_BOT_MIN_BUZZ_MS, Math.min(profile.maxBuzzMs, latest));
  const minMs = Math.max(BATTLE_BOT_MIN_BUZZ_MS, Math.min(profile.minBuzzMs, maxMs));
  return { minMs, maxMs };
}

function pickWrongChoiceIndex(
  choiceCount: number,
  correctIndex: number,
  roll: number,
): number {
  const wrong: number[] = [];
  for (let index = 0; index < choiceCount; index += 1) {
    if (index !== correctIndex) wrong.push(index);
  }
  // 選択肢が正解1つしか無いことは無い（必ず4択で作る）が、落ちるよりは
  // 正解を押させる。
  if (wrong.length === 0) return correctIndex;
  const pick = Math.min(wrong.length - 1, Math.floor(roll * wrong.length));
  return wrong[pick];
}

/**
 * 全ラウンドぶんの行動計画。乱数は1問につき
 * 「見送るか → 押す時刻 → 正解するか → どの誤答か」の順に4回だけ引く
 * （テストから差し替えられるように順序を固定している）。
 */
export function buildBattleBotPlans(
  questions: readonly BattleGeneratedQuestion[],
  level: BattleBotLevel,
  roundDurationMs: number,
  random: RandomFn = Math.random,
): BattleBotPlan[] {
  const profile = BATTLE_BOT_PROFILES[level];
  const { minMs, maxMs } = resolveBuzzWindow(profile, roundDurationMs);

  return questions.map((question) => {
    const passRoll = random();
    const buzzRoll = random();
    const accuracyRoll = random();
    const wrongRoll = random();

    const answersCorrectly = accuracyRoll < profile.accuracy;

    return {
      roundIndex: question.roundIndex,
      buzzAtMs: Math.round(minMs + buzzRoll * (maxMs - minMs)),
      choiceIndex: answersCorrectly
        ? question.correctIndex
        : pickWrongChoiceIndex(question.choices.length, question.correctIndex, wrongRoll),
      willAnswer: passRoll >= profile.passRate,
    };
  });
}
