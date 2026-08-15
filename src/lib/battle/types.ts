/** Domain types for リアルタイム単語対戦. */

export type BattleMode = 'friend' | 'random' | 'group';

export type BattleStatus =
  | 'waiting'
  | 'ready'
  | 'preparing'
  | 'in_progress'
  | 'finished'
  | 'cancelled';

export type BattleOutcome = 'host' | 'guest' | 'draw' | 'abandoned';

export type BattleSeat = 'host' | 'guest';

export type BattleParticipant = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  projectId: string | null;
  projectTitle: string | null;
  score: number;
};

export type BattleRoom = {
  id: string;
  mode: BattleMode;
  status: BattleStatus;
  inviteCode: string | null;
  /** グループ内対戦のときだけ入る。出題元はこのグループの単語帳。 */
  groupId: string | null;
  /** 「もう一度対戦する」で作られた部屋なら、元の部屋のID。 */
  rematchOfRoomId: string | null;
  questionCount: number;
  roundDurationMs: number;
  currentRound: number;
  host: BattleParticipant;
  guest: BattleParticipant | null;
  winnerUserId: string | null;
  outcome: BattleOutcome | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

/**
 * The client-visible half of a question. `answer` / `correctIndex` stay null
 * until the round resolves -- the answer key lives in `battle_question_keys`,
 * which no client can read.
 */
export type BattleQuestion = {
  roundIndex: number;
  prompt: string;
  choices: string[];
  startedAt: string | null;
  resolvedAt: string | null;
  answeredBy: string | null;
  correctIndex: number | null;
  answer: string | null;
};

export type BattleAnswerResult =
  | { accepted: true; correct: boolean; resolved: boolean }
  | {
      accepted: false;
      reason:
        | 'battle_not_in_progress'
        | 'stale_round'
        | 'already_resolved'
        | 'already_answered'
        | 'timed_out';
    };

/** A word row reduced to what question generation needs. */
export type BattleSourceWord = {
  id: string;
  ownerId: string;
  english: string;
  japanese: string;
  distractors: string[];
};

export type BattleGeneratedQuestion = {
  roundIndex: number;
  prompt: string;
  choices: string[];
  correctIndex: number;
  answer: string;
  sourceUserId: string;
};

export type BattleMatchResult =
  | { matched: true; roomId: string }
  | { matched: false; queued: true };
