/**
 * ボット対戦の migration（20260916120000）が remote に当たる前でも、人間同士の
 * 対戦が動き続けることを担保するテスト。
 *
 * 列を含む SELECT は、列が無いと 42703 で丸ごと落ちる。ここを踏むと対戦ルームの
 * 取得が全経路で失敗し、「対戦ルームの取得に失敗しました」になる
 * （2026-06-24 の schema cache 障害と同じ形）。
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  QUESTION_COLUMNS_BASE,
  QUESTION_COLUMNS_BOT,
  ROOM_COLUMNS_BASE,
  ROOM_COLUMNS_BOT,
  isMissingColumnError,
} from '@/lib/battle/server';

const BOT_ROOM_COLUMNS = ['guest_is_bot', 'bot_level', 'bot_name'];

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
  // 出題・スコア・決着表示がこの列で組み立てられること。ボット関係だけを
  // 落とすのであって、対戦そのものの情報を削ってはいけない。
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

test('a missing column is recognised from the postgres code and the message', () => {
  assert.equal(isMissingColumnError({ code: '42703' }), true);
  assert.equal(
    isMissingColumnError({ message: 'column battle_rooms.guest_is_bot does not exist' }),
    true,
  );
  // PostgREST の schema cache が古いときも同じ扱いにする。
  assert.equal(isMissingColumnError({ code: 'PGRST204' }), true);
  assert.equal(
    isMissingColumnError({ message: "Could not find the 'bot_level' column of 'battle_rooms' in the schema cache" }),
    true,
  );
});

test('an unrelated failure is never mistaken for a missing column', () => {
  // ここを取り違えると、通信エラーのたびにボット対戦が使えなくなる。
  assert.equal(isMissingColumnError(null), false);
  assert.equal(isMissingColumnError({ message: 'fetch failed' }), false);
  assert.equal(isMissingColumnError({ code: '42501', message: 'permission denied' }), false);
});
