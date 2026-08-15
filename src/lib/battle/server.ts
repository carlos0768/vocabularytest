import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { normalizeStoredAvatarUrl } from '@/lib/profile/avatar';
import {
  BATTLE_MIN_SOURCE_WORDS,
  BATTLE_QUEUE_STALE_MS,
  clampQuestionCount,
  clampRoundDurationMs,
} from '@/lib/battle/config';
import { buildBattleQuestions } from '@/lib/battle/questions';
import type {
  BattleGeneratedQuestion,
  BattleMatchResult,
  BattleMode,
  BattleOutcome,
  BattleParticipant,
  BattleQuestion,
  BattleRoom,
  BattleSourceWord,
  BattleStatus,
} from '@/lib/battle/types';

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

/** Words pulled per wordbook when building a question set. */
const BATTLE_SOURCE_WORD_LIMIT = 400;

export class BattleError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly userMessage: string,
  ) {
    super(code);
    this.name = 'BattleError';
  }
}

type BattleRoomRow = {
  id: string;
  mode: BattleMode;
  status: BattleStatus;
  invite_code: string | null;
  host_user_id: string;
  host_project_id: string;
  guest_user_id: string | null;
  guest_project_id: string | null;
  question_count: number;
  round_duration_ms: number;
  current_round: number;
  host_score: number;
  guest_score: number;
  winner_user_id: string | null;
  outcome: BattleOutcome | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

type ProfileRow = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type ProjectRow = {
  id: string;
  title: string;
  user_id: string;
};

const ROOM_COLUMNS =
  'id,mode,status,invite_code,host_user_id,host_project_id,guest_user_id,guest_project_id,'
  + 'question_count,round_duration_ms,current_round,host_score,guest_score,winner_user_id,'
  + 'outcome,started_at,finished_at,created_at';

function buildParticipant(
  userId: string,
  projectId: string | null,
  score: number,
  profiles: Map<string, ProfileRow>,
  projects: Map<string, ProjectRow>,
): BattleParticipant {
  const profile = profiles.get(userId);
  return {
    userId,
    displayName: profile?.display_name?.trim() || profile?.username?.trim() || '対戦相手',
    avatarUrl: normalizeStoredAvatarUrl(profile?.avatar_url ?? null),
    projectId,
    projectTitle: projectId ? projects.get(projectId)?.title ?? null : null,
    score,
  };
}

async function hydrateRoom(
  row: BattleRoomRow,
  admin: SupabaseAdminClient,
): Promise<BattleRoom> {
  const userIds = [row.host_user_id, row.guest_user_id].filter((id): id is string => Boolean(id));
  const projectIds = [row.host_project_id, row.guest_project_id].filter(
    (id): id is string => Boolean(id),
  );

  const [profileResult, projectResult] = await Promise.all([
    admin.from('profiles').select('user_id,username,display_name,avatar_url').in('user_id', userIds),
    admin.from('projects').select('id,title,user_id').in('id', projectIds),
  ]);

  const profiles = new Map<string, ProfileRow>(
    ((profileResult.data ?? []) as ProfileRow[]).map((item) => [item.user_id, item]),
  );
  const projects = new Map<string, ProjectRow>(
    ((projectResult.data ?? []) as ProjectRow[]).map((item) => [item.id, item]),
  );

  return {
    id: row.id,
    mode: row.mode,
    status: row.status,
    inviteCode: row.invite_code,
    questionCount: row.question_count,
    roundDurationMs: row.round_duration_ms,
    currentRound: row.current_round,
    host: buildParticipant(row.host_user_id, row.host_project_id, row.host_score, profiles, projects),
    guest: row.guest_user_id
      ? buildParticipant(row.guest_user_id, row.guest_project_id, row.guest_score, profiles, projects)
      : null,
    winnerUserId: row.winner_user_id,
    outcome: row.outcome,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
  };
}

async function fetchRoomRow(
  roomId: string,
  admin: SupabaseAdminClient,
): Promise<BattleRoomRow> {
  const { data, error } = await admin
    .from('battle_rooms')
    .select(ROOM_COLUMNS)
    .eq('id', roomId)
    .maybeSingle<BattleRoomRow>();

  if (error) {
    throw new BattleError('battle_room_lookup_failed', 500, '対戦ルームの取得に失敗しました。');
  }
  if (!data) {
    throw new BattleError('battle_room_not_found', 404, '対戦ルームが見つかりません。');
  }

  return data;
}

function assertParticipant(row: BattleRoomRow, userId: string): void {
  if (row.host_user_id !== userId && row.guest_user_id !== userId) {
    throw new BattleError('battle_not_a_participant', 403, 'この対戦に参加していません。');
  }
}

/** Confirms the wordbook exists and belongs to the caller. */
export async function assertProjectOwnership(
  projectId: string,
  userId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<ProjectRow> {
  const { data, error } = await admin
    .from('projects')
    .select('id,title,user_id')
    .eq('id', projectId)
    .maybeSingle<ProjectRow>();

  if (error) {
    throw new BattleError('battle_project_lookup_failed', 500, '単語帳の取得に失敗しました。');
  }
  if (!data || data.user_id !== userId) {
    throw new BattleError('battle_project_not_found', 404, '単語帳が見つかりません。');
  }

  return data;
}

export async function loadBattleRoom(
  roomId: string,
  userId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<BattleRoom> {
  const row = await fetchRoomRow(roomId, admin);
  assertParticipant(row, userId);
  return hydrateRoom(row, admin);
}

/**
 * Rounds the viewer is allowed to see. Unstarted rounds are withheld so a
 * client cannot read ahead, matching the RLS policy on `battle_questions`.
 */
export async function loadBattleQuestions(
  roomId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<BattleQuestion[]> {
  const { data, error } = await admin
    .from('battle_questions')
    .select('round_index,prompt,choices,started_at,resolved_at,answered_by,revealed_correct_index,revealed_answer')
    .eq('room_id', roomId)
    .not('started_at', 'is', null)
    .order('round_index', { ascending: true });

  if (error) {
    throw new BattleError('battle_questions_lookup_failed', 500, '問題の取得に失敗しました。');
  }

  return (data ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    return {
      roundIndex: Number(record.round_index),
      prompt: String(record.prompt ?? ''),
      choices: Array.isArray(record.choices) ? (record.choices as string[]) : [],
      startedAt: (record.started_at as string | null) ?? null,
      resolvedAt: (record.resolved_at as string | null) ?? null,
      answeredBy: (record.answered_by as string | null) ?? null,
      correctIndex:
        record.revealed_correct_index === null || record.revealed_correct_index === undefined
          ? null
          : Number(record.revealed_correct_index),
      answer: (record.revealed_answer as string | null) ?? null,
    };
  });
}

export async function loadBattleSourceWords(
  projectId: string,
  ownerId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<BattleSourceWord[]> {
  const { data, error } = await admin
    .from('words')
    .select('id,english,japanese,distractors')
    .eq('project_id', projectId)
    .limit(BATTLE_SOURCE_WORD_LIMIT);

  if (error) {
    throw new BattleError('battle_words_lookup_failed', 500, '単語の取得に失敗しました。');
  }

  return (data ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    const rawDistractors = record.distractors;
    return {
      id: String(record.id),
      ownerId,
      english: String(record.english ?? ''),
      japanese: String(record.japanese ?? ''),
      distractors: Array.isArray(rawDistractors)
        ? rawDistractors.filter((item): item is string => typeof item === 'string')
        : [],
    };
  });
}

export async function createFriendRoom(options: {
  userId: string;
  projectId: string;
  questionCount: number;
  roundDurationMs: number;
  admin?: SupabaseAdminClient;
}): Promise<BattleRoom> {
  const admin = options.admin ?? getSupabaseAdmin();
  await assertProjectOwnership(options.projectId, options.userId, admin);

  // One open room per host keeps invite codes unambiguous.
  await admin
    .from('battle_rooms')
    .update({ status: 'cancelled', finished_at: new Date().toISOString() })
    .eq('host_user_id', options.userId)
    .eq('mode', 'friend')
    .in('status', ['waiting', 'ready']);

  const { data: codeData, error: codeError } = await admin.rpc('generate_battle_invite_code');
  if (codeError || typeof codeData !== 'string') {
    throw new BattleError('battle_invite_code_failed', 500, '招待コードの発行に失敗しました。');
  }

  const { data, error } = await admin
    .from('battle_rooms')
    .insert({
      mode: 'friend',
      status: 'waiting',
      invite_code: codeData,
      host_user_id: options.userId,
      host_project_id: options.projectId,
      question_count: clampQuestionCount(options.questionCount),
      round_duration_ms: clampRoundDurationMs(options.roundDurationMs),
    })
    .select(ROOM_COLUMNS)
    .single<BattleRoomRow>();

  if (error || !data) {
    throw new BattleError('battle_room_create_failed', 500, '対戦ルームの作成に失敗しました。');
  }

  return hydrateRoom(data, admin);
}

export async function joinRoomByInviteCode(options: {
  userId: string;
  projectId: string;
  inviteCode: string;
  admin?: SupabaseAdminClient;
}): Promise<BattleRoom> {
  const admin = options.admin ?? getSupabaseAdmin();
  await assertProjectOwnership(options.projectId, options.userId, admin);

  const { data: roomRow, error: lookupError } = await admin
    .from('battle_rooms')
    .select(ROOM_COLUMNS)
    .eq('invite_code', options.inviteCode)
    .in('status', ['waiting', 'ready', 'preparing', 'in_progress'])
    .maybeSingle<BattleRoomRow>();

  if (lookupError) {
    throw new BattleError('battle_room_lookup_failed', 500, '対戦ルームの取得に失敗しました。');
  }
  if (!roomRow) {
    throw new BattleError('battle_invite_not_found', 404, '招待コードが見つかりません。');
  }

  // Rejoining an in-flight battle is fine; taking someone else's seat is not.
  if (roomRow.host_user_id === options.userId || roomRow.guest_user_id === options.userId) {
    return hydrateRoom(roomRow, admin);
  }
  if (roomRow.guest_user_id) {
    throw new BattleError('battle_room_full', 409, 'この対戦ルームは満室です。');
  }

  // Conditional update so two people scanning the same code cannot both join.
  const { data, error } = await admin
    .from('battle_rooms')
    .update({
      guest_user_id: options.userId,
      guest_project_id: options.projectId,
      status: 'ready',
    })
    .eq('id', roomRow.id)
    .eq('status', 'waiting')
    .is('guest_user_id', null)
    .select(ROOM_COLUMNS)
    .maybeSingle<BattleRoomRow>();

  if (error) {
    throw new BattleError('battle_room_join_failed', 500, '対戦ルームへの参加に失敗しました。');
  }
  if (!data) {
    throw new BattleError('battle_room_full', 409, 'この対戦ルームは満室です。');
  }

  return hydrateRoom(data, admin);
}

export async function requestRandomMatch(options: {
  userId: string;
  projectId: string;
  questionCount: number;
  roundDurationMs: number;
  admin?: SupabaseAdminClient;
}): Promise<BattleMatchResult> {
  const admin = options.admin ?? getSupabaseAdmin();
  await assertProjectOwnership(options.projectId, options.userId, admin);

  const { data, error } = await admin.rpc('pair_battle_match', {
    p_user_id: options.userId,
    p_project_id: options.projectId,
    p_question_count: clampQuestionCount(options.questionCount),
    p_round_duration_ms: clampRoundDurationMs(options.roundDurationMs),
    p_stale_after: `${Math.round(BATTLE_QUEUE_STALE_MS / 1000)} seconds`,
  });

  if (error) {
    throw new BattleError('battle_matchmaking_failed', 500, 'マッチングに失敗しました。');
  }

  const row = (Array.isArray(data) ? data[0] : data) as BattleRoomRow | null;
  if (!row?.id) {
    return { matched: false, queued: true };
  }

  return { matched: true, roomId: row.id };
}

/**
 * Group matchmaking: same queue table, but pairing is restricted to members of
 * the given study group (`pair_group_battle_match` verifies membership and only
 * ever looks at rows queued for that group).
 */
export async function requestGroupMatch(options: {
  userId: string;
  groupId: string;
  projectId: string;
  questionCount: number;
  roundDurationMs: number;
  admin?: SupabaseAdminClient;
}): Promise<BattleMatchResult> {
  const admin = options.admin ?? getSupabaseAdmin();
  await assertProjectOwnership(options.projectId, options.userId, admin);

  const { data, error } = await admin.rpc('pair_group_battle_match', {
    p_user_id: options.userId,
    p_group_id: options.groupId,
    p_project_id: options.projectId,
    p_question_count: clampQuestionCount(options.questionCount),
    p_round_duration_ms: clampRoundDurationMs(options.roundDurationMs),
    p_stale_after: `${Math.round(BATTLE_QUEUE_STALE_MS / 1000)} seconds`,
  });

  if (error) {
    // 非メンバーは RPC 側で弾かれる（42501）。
    if (error.code === '42501' || (error.message ?? '').includes('not_a_group_member')) {
      throw new BattleError('battle_not_a_group_member', 403, 'このグループのメンバーではありません。');
    }
    throw new BattleError('battle_matchmaking_failed', 500, 'マッチングに失敗しました。');
  }

  const row = (Array.isArray(data) ? data[0] : data) as BattleRoomRow | null;
  if (!row?.id) {
    return { matched: false, queued: true };
  }

  return { matched: true, roomId: row.id };
}

export async function cancelRandomMatch(
  userId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<void> {
  const { error } = await admin.from('battle_queue').delete().eq('user_id', userId);
  if (error) {
    throw new BattleError('battle_matchmaking_cancel_failed', 500, 'マッチングの取り消しに失敗しました。');
  }
}

/** The room a random-match player was paired into while they were waiting. */
export async function findActiveRoomForUser(
  userId: string,
  admin: SupabaseAdminClient = getSupabaseAdmin(),
): Promise<BattleRoom | null> {
  const { data, error } = await admin
    .from('battle_rooms')
    .select(ROOM_COLUMNS)
    .or(`host_user_id.eq.${userId},guest_user_id.eq.${userId}`)
    .in('status', ['ready', 'preparing', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<BattleRoomRow>();

  if (error) {
    throw new BattleError('battle_room_lookup_failed', 500, '対戦ルームの取得に失敗しました。');
  }

  return data ? hydrateRoom(data, admin) : null;
}

async function insertQuestions(
  roomId: string,
  questions: BattleGeneratedQuestion[],
  admin: SupabaseAdminClient,
): Promise<void> {
  const { error: questionError } = await admin.from('battle_questions').insert(
    questions.map((question) => ({
      room_id: roomId,
      round_index: question.roundIndex,
      prompt: question.prompt,
      choices: question.choices,
      // Round 0 opens immediately; later rounds are opened by advance_battle_round.
      started_at: question.roundIndex === 0 ? new Date().toISOString() : null,
    })),
  );

  if (questionError) {
    throw new BattleError('battle_questions_insert_failed', 500, '問題の作成に失敗しました。');
  }

  const { error: keyError } = await admin.from('battle_question_keys').insert(
    questions.map((question) => ({
      room_id: roomId,
      round_index: question.roundIndex,
      correct_index: question.correctIndex,
      answer: question.answer,
      source_user_id: question.sourceUserId,
    })),
  );

  if (keyError) {
    throw new BattleError('battle_questions_insert_failed', 500, '問題の作成に失敗しました。');
  }
}

/**
 * Generates the shared question set and opens round 0. The status flip from
 * 'ready' to 'preparing' is the atomic claim, so if both clients press start
 * only one of them generates questions.
 */
export async function startBattle(options: {
  roomId: string;
  userId: string;
  admin?: SupabaseAdminClient;
}): Promise<BattleRoom> {
  const admin = options.admin ?? getSupabaseAdmin();
  const row = await fetchRoomRow(options.roomId, admin);
  assertParticipant(row, options.userId);

  if (row.status === 'in_progress' || row.status === 'finished') {
    return hydrateRoom(row, admin);
  }
  if (row.status !== 'ready' || !row.guest_user_id || !row.guest_project_id) {
    throw new BattleError('battle_not_ready', 409, '対戦の準備が整っていません。');
  }

  const { data: claimed, error: claimError } = await admin
    .from('battle_rooms')
    .update({ status: 'preparing' })
    .eq('id', options.roomId)
    .eq('status', 'ready')
    .select(ROOM_COLUMNS)
    .maybeSingle<BattleRoomRow>();

  if (claimError) {
    throw new BattleError('battle_start_failed', 500, '対戦の開始に失敗しました。');
  }
  if (!claimed) {
    // The opponent claimed it first -- report whatever state they left it in.
    return hydrateRoom(await fetchRoomRow(options.roomId, admin), admin);
  }

  try {
    // 出題は出題者（ホスト）の単語帳だけから作る。ゲストの単語帳は参加時に
    // 記録するだけで、問題には使わない。
    const hostWords = await loadBattleSourceWords(
      claimed.host_project_id,
      claimed.host_user_id,
      admin,
    );

    const questions = buildBattleQuestions(hostWords, claimed.question_count);

    if (questions.length < BATTLE_MIN_SOURCE_WORDS) {
      throw new BattleError(
        'battle_not_enough_words',
        409,
        `対戦には出題者の単語帳に${BATTLE_MIN_SOURCE_WORDS}語以上の単語が必要です。`,
      );
    }

    await insertQuestions(claimed.id, questions, admin);

    const { data: started, error: startError } = await admin
      .from('battle_rooms')
      .update({
        status: 'in_progress',
        // A short wordbook shortens the battle rather than repeating words.
        question_count: questions.length,
        current_round: 0,
        started_at: new Date().toISOString(),
      })
      .eq('id', claimed.id)
      .eq('status', 'preparing')
      .select(ROOM_COLUMNS)
      .single<BattleRoomRow>();

    if (startError || !started) {
      throw new BattleError('battle_start_failed', 500, '対戦の開始に失敗しました。');
    }

    return hydrateRoom(started, admin);
  } catch (error) {
    // Never strand a room in 'preparing' -- put it back so they can retry.
    await admin
      .from('battle_rooms')
      .update({ status: 'ready' })
      .eq('id', options.roomId)
      .eq('status', 'preparing');
    await admin.from('battle_questions').delete().eq('room_id', options.roomId);
    await admin.from('battle_question_keys').delete().eq('room_id', options.roomId);
    throw error;
  }
}
