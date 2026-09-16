import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  FREE_DAILY_BATTLE_LIMIT,
  canStartBattle,
  describeBattleAllowance,
  getBattleAllowanceResetAt,
  getBattleDayKey,
  type BattleAllowance,
} from './free-allowance';

function freeAllowance(remaining: number): BattleAllowance {
  return {
    isPro: false,
    limit: FREE_DAILY_BATTLE_LIMIT,
    used: FREE_DAILY_BATTLE_LIMIT - remaining,
    remaining,
    dayKey: '2026-09-16',
    resetsAt: '2026-09-16T15:00:00.000Z',
  };
}

const PRO_ALLOWANCE: BattleAllowance = {
  isPro: true,
  limit: null,
  used: null,
  remaining: null,
  dayKey: '2026-09-16',
  resetsAt: null,
};

test('free users get two battles per day', () => {
  assert.equal(FREE_DAILY_BATTLE_LIMIT, 2);
});

test('canStartBattle lets Pro through and stops a spent free day', () => {
  assert.equal(canStartBattle(PRO_ALLOWANCE), true);
  assert.equal(canStartBattle(freeAllowance(2)), true);
  assert.equal(canStartBattle(freeAllowance(1)), true);
  assert.equal(canStartBattle(freeAllowance(0)), false);
});

test('canStartBattle treats a missing allowance as "cannot start"', () => {
  // 未取得のうちに入り口を開けてしまうと、枠切れのユーザーが入って
  // 対戦開始時に弾かれる。読めるまでは閉じておく。
  assert.equal(canStartBattle(null), false);
});

test('describeBattleAllowance names the remaining count', () => {
  assert.match(describeBattleAllowance(freeAllowance(2)), /本日あと2回/);
  assert.match(describeBattleAllowance(freeAllowance(0)), /使い切りました/);
  assert.match(describeBattleAllowance(PRO_ALLOWANCE), /Pro/);
});

test('getBattleDayKey uses the JST calendar day, not UTC', () => {
  // 15:00Z = 翌日0時 JST。ここで日が変わる。
  assert.equal(getBattleDayKey(new Date('2026-09-16T14:59:59Z')), '2026-09-16');
  assert.equal(getBattleDayKey(new Date('2026-09-16T15:00:00Z')), '2026-09-17');
  // UTCではまだ前日だが、JSTではもう当日。
  assert.equal(getBattleDayKey(new Date('2026-09-16T18:00:00Z')), '2026-09-17');
});

test('getBattleAllowanceResetAt returns the next JST midnight', () => {
  assert.equal(
    getBattleAllowanceResetAt(new Date('2026-09-16T00:00:00Z')).toISOString(),
    '2026-09-16T15:00:00.000Z',
  );
  // 0時 JST ちょうどの直後は、その日の終わり（翌0時 JST）を指す。
  assert.equal(
    getBattleAllowanceResetAt(new Date('2026-09-16T15:00:00Z')).toISOString(),
    '2026-09-17T15:00:00.000Z',
  );
  // 月をまたいでも暦どおりに進む。
  assert.equal(
    getBattleAllowanceResetAt(new Date('2026-09-30T16:00:00Z')).toISOString(),
    '2026-10-01T15:00:00.000Z',
  );
});

test('the SQL migration carries the same daily limit as the TypeScript constant', () => {
  const migration = readFileSync(
    fileURLToPath(
      new URL(
        '../../../supabase/migrations/20260916130000_free_daily_battle_allowance.sql',
        import.meta.url,
      ),
    ),
    'utf8',
  );

  // 上限は SQL 側にも直書きされている（RPC のローカル変数）。片方だけ動かすと
  // 「UIは3回と言っているのにサーバーは2回で止める」になるのでここで縛る。
  const limits = [...migration.matchAll(/v_limit\s+INTEGER\s*:=\s*(\d+);/g)].map(
    (match) => Number(match[1]),
  );

  assert.ok(limits.length >= 2, 'migration should declare v_limit in both RPCs');
  for (const limit of limits) {
    assert.equal(limit, FREE_DAILY_BATTLE_LIMIT);
  }

  // 日の境界は JST。UTCに直すと日本のユーザーには9時間ずれた時刻にリセットされる。
  assert.match(migration, /battle_day_key[\s\S]*Asia\/Tokyo/);
});
