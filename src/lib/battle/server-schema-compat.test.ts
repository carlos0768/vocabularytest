/**
 * ボット対戦の migration（20260916120000）が remote に揃っていなくても、
 * 人間同士の対戦が動き続けることを担保するテスト。
 *
 * 無い列を含む SELECT は 42703 で丸ごと落ちる。ここを踏むと対戦ルームの取得が
 * 全経路で失敗し、「対戦ルームの取得に失敗しました」になる（2026-06-24 の
 * schema cache 障害と同じ形）。**一部だけ適用された DB**（guest_is_bot はあるが
 * bot_level が無い等）も同じ結果になるので、そこも含めて固定する。
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  QUESTION_COLUMNS_BASE,
  QUESTION_COLUMNS_BOT,
  ROOM_COLUMNS_BASE,
  ROOM_COLUMNS_BOT,
  isMissingSchemaError,
  loadBattleQuestions,
  loadBattleRoom,
  resetBattleSchemaCacheForTests,
} from '@/lib/battle/server';

const BOT_ROOM_COLUMNS = ['guest_is_bot', 'bot_level', 'bot_name'];

// ---- 列リストの不変条件 ----

test('the fallback room columns carry none of the bot columns', () => {
  for (const column of BOT_ROOM_COLUMNS) {
    assert.ok(
      !ROOM_COLUMNS_BASE.includes(column),
      `${column} が fallback 側に入ると、migration 前に対戦ルームを一切読めなくなる`,
    );
  }
});

test('the fallback question columns carry none of the bot columns', () => {
  assert.ok(!QUESTION_COLUMNS_BASE.includes('answered_by_bot'));
});

test('the bot column lists are exactly what the migration adds', () => {
  assert.deepEqual(ROOM_COLUMNS_BOT.split(','), BOT_ROOM_COLUMNS);
  assert.deepEqual(QUESTION_COLUMNS_BOT.split(','), ['answered_by_bot']);
});

test('the fallback still carries everything the battle screen needs', () => {
  for (const column of [
    'id', 'mode', 'status', 'invite_code', 'group_id', 'rematch_of_room_id',
    'host_user_id', 'host_project_id', 'guest_user_id', 'guest_project_id',
    'question_count', 'round_duration_ms', 'current_round',
    'host_score', 'guest_score', 'winner_user_id', 'outcome',
    'started_at', 'finished_at', 'created_at',
  ]) {
    assert.ok(ROOM_COLUMNS_BASE.split(',').includes(column), `${column} が落ちている`);
  }

  for (const column of [
    'round_index', 'prompt', 'choices', 'started_at', 'resolved_at',
    'answered_by', 'revealed_correct_index', 'revealed_answer',
  ]) {
    assert.ok(QUESTION_COLUMNS_BASE.split(',').includes(column), `${column} が落ちている`);
  }
});

// ---- 欠落の見分け ----

test('a missing column is recognised from the postgres code and the message', () => {
  assert.equal(isMissingSchemaError({ code: '42703' }), true);
  assert.equal(
    isMissingSchemaError({ message: 'column battle_rooms.guest_is_bot does not exist' }),
    true,
  );
  assert.equal(isMissingSchemaError({ code: 'PGRST204' }), true);
  assert.equal(
    isMissingSchemaError({ message: "Could not find the 'bot_level' column of 'battle_rooms' in the schema cache" }),
    true,
  );
});

test('a missing table is recognised too, so battle_bot_plans counts', () => {
  assert.equal(isMissingSchemaError({ code: '42P01' }), true);
  assert.equal(
    isMissingSchemaError({ message: 'relation "public.battle_bot_plans" does not exist' }),
    true,
  );
});

test('an unrelated failure is never mistaken for a missing column', () => {
  // ここを取り違えると、一度の通信断でボット対戦が使えなくなる。
  assert.equal(isMissingSchemaError(null), false);
  assert.equal(isMissingSchemaError({ message: 'fetch failed' }), false);
  assert.equal(isMissingSchemaError({ code: '42501', message: 'permission denied' }), false);
});

// ---- 実際に読めるか（PostgREST の列検査を模したフェイク） ----

const ROOM_ROW: Record<string, unknown> = {
  id: 'room-1', mode: 'random', status: 'in_progress', invite_code: null,
  group_id: null, rematch_of_room_id: null,
  host_user_id: 'u-host', host_project_id: 'p1',
  guest_user_id: 'u-guest', guest_project_id: 'p2',
  question_count: 10, round_duration_ms: 15_000, current_round: 0,
  host_score: 1, guest_score: 2, winner_user_id: null, outcome: null,
  started_at: null, finished_at: null, created_at: '2026-09-16T00:00:00Z',
  guest_is_bot: false, bot_level: null, bot_name: null,
};

const QUESTION_ROW: Record<string, unknown> = {
  round_index: 0, prompt: 'apple', choices: ['りんご'], started_at: '2026-09-16T00:00:00Z',
  resolved_at: null, answered_by: null, answered_by_bot: false,
  revealed_correct_index: null, revealed_answer: null,
};

/** そのテーブルに実在する列。ここに無い列を SELECT したら 42703 を返す。 */
type FakeSchema = Record<string, string[] | undefined>;

/** PostgREST と同じく「無い列・無いテーブルは問い合わせごと失敗させる」フェイク。 */
function fakeAdmin(schema: FakeSchema) {
  return {
    from(table: string) {
      let requested: string[] = [];

      const settle = () => {
        const columns = schema[table];
        if (!columns) {
          return { data: null, error: { code: '42P01', message: `relation "public.${table}" does not exist` } };
        }
        const missing = requested.find((column) => !columns.includes(column));
        if (missing) {
          return { data: null, error: { code: '42703', message: `column ${table}.${missing} does not exist` } };
        }
        if (table === 'battle_rooms') return { data: ROOM_ROW, error: null };
        if (table === 'battle_questions') return { data: [QUESTION_ROW], error: null };
        return { data: [], error: null };
      };

      const chain: Record<string, unknown> = {
        select(columns: string) { requested = columns.split(','); return chain; },
        eq() { return chain; },
        in() { return chain; },
        not() { return chain; },
        order() { return chain; },
        limit() { return chain; },
        maybeSingle: async () => settle(),
        single: async () => settle(),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(settle()).then(resolve),
      };

      return chain;
    },
  } as never;
}

const WITHOUT_BOT: FakeSchema = {
  battle_rooms: ROOM_COLUMNS_BASE.split(','),
  battle_questions: QUESTION_COLUMNS_BASE.split(','),
  profiles: ['user_id', 'username', 'display_name', 'avatar_url'],
  projects: ['id', 'title', 'user_id'],
  // battle_bot_plans ごと存在しない
};

test('a battle still loads when the bot migration has not been applied at all', async () => {
  resetBattleSchemaCacheForTests();
  const admin = fakeAdmin(WITHOUT_BOT);

  const room = await loadBattleRoom('room-1', 'u-host', admin);
  const questions = await loadBattleQuestions('room-1', admin);

  assert.equal(room.id, 'room-1');
  assert.equal(room.host.score, 1);
  assert.equal(room.guest?.score, 2);
  assert.equal(room.guestIsBot, false);
  assert.equal(room.botLevel, null);
  assert.equal(questions.length, 1);
  assert.equal(questions[0].answeredByBot, false);
});

test('a battle still loads when the migration aborted after its first statement', async () => {
  // 1本目の ALTER だけ通り、残りは何も無いDB。
  resetBattleSchemaCacheForTests();
  const admin = fakeAdmin({
    ...WITHOUT_BOT,
    battle_rooms: [...ROOM_COLUMNS_BASE.split(','), 'guest_is_bot'],
  });

  const room = await loadBattleRoom('room-1', 'u-host', admin);

  assert.equal(room.id, 'room-1');
  assert.equal(room.guestIsBot, false);
});

test('a battle still loads when only bot_level / bot_name are missing', async () => {
  // 他はすべて揃っていて battle_rooms の2列だけが無い状態。guest_is_bot だけを
  // 確かめるプローブはこれを「使える」と誤判定し、bot_level を含む SELECT が
  // 42703 で落ちて「対戦ルームの取得に失敗しました」になる。
  resetBattleSchemaCacheForTests();
  const admin = fakeAdmin({
    ...WITHOUT_BOT,
    battle_rooms: [...ROOM_COLUMNS_BASE.split(','), 'guest_is_bot'],
    battle_questions: [...QUESTION_COLUMNS_BASE.split(','), 'answered_by_bot'],
    battle_bot_plans: ['room_id'],
  });

  const room = await loadBattleRoom('room-1', 'u-host', admin);

  assert.equal(room.id, 'room-1');
  assert.equal(room.guestIsBot, false);
});

test('a battle still loads when only battle_questions is missing its column', async () => {
  resetBattleSchemaCacheForTests();
  const admin = fakeAdmin({
    ...WITHOUT_BOT,
    battle_rooms: [...ROOM_COLUMNS_BASE.split(','), ...BOT_ROOM_COLUMNS],
    battle_bot_plans: ['room_id'],
  });

  const room = await loadBattleRoom('room-1', 'u-host', admin);
  const questions = await loadBattleQuestions('room-1', admin);

  assert.equal(room.id, 'room-1');
  assert.equal(questions.length, 1);
});

test('the bot columns are used once the whole migration is in place', async () => {
  resetBattleSchemaCacheForTests();
  const admin = fakeAdmin({
    ...WITHOUT_BOT,
    battle_rooms: [...ROOM_COLUMNS_BASE.split(','), ...BOT_ROOM_COLUMNS],
    battle_questions: [...QUESTION_COLUMNS_BASE.split(','), 'answered_by_bot'],
    battle_bot_plans: ['room_id'],
  });

  const room = await loadBattleRoom('room-1', 'u-host', admin);
  const questions = await loadBattleQuestions('room-1', admin);

  assert.equal(room.id, 'room-1');
  assert.equal(questions.length, 1);
});

test('the underlying db error is kept on the thrown error so logs can name it', async () => {
  resetBattleSchemaCacheForTests();
  // battle_rooms ごと読めない＝fallback でも救えない本物の失敗。
  const admin = fakeAdmin({ profiles: [], projects: [] });

  await assert.rejects(
    () => loadBattleRoom('room-1', 'u-host', admin),
    (error: unknown) => {
      const battleError = error as { code?: string; detail?: { code?: string } };
      assert.equal(battleError.code, 'battle_room_lookup_failed');
      assert.equal(battleError.detail?.code, '42P01');
      return true;
    },
  );
});
