import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
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

test('free users get three battles per day', () => {
  assert.equal(FREE_DAILY_BATTLE_LIMIT, 3);
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

test('the newest limit migration carries the same daily limit as the TypeScript constant', () => {
  const migrationsDir = fileURLToPath(new URL('../../../supabase/migrations', import.meta.url));

  // 上限は SQL 側にも直書きされている（RPC のローカル変数）。適用ずみの
  // マイグレーションは書き換えられないので、上限を変えるたびに RPC を
  // CREATE OR REPLACE する新しいファイルが増える。実際に効くのは最後に
  // 流れるものなので、ファイル名順でいちばん新しいものを見る。
  const limitMigrations = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(`${migrationsDir}/${name}`, 'utf8') }))
    // `v_limit` という名前は別のRPC（スキャン上限など）も使っているので、
    // 対戦の枠を定義しているファイルだけに絞る。
    .filter(({ sql }) => sql.includes('FUNCTION public.consume_free_battle_entry'));

  assert.ok(limitMigrations.length > 0, 'no migration declares the battle daily limit');

  const newest = limitMigrations[limitMigrations.length - 1];
  const limits = [...newest.sql.matchAll(/v_limit\s+INTEGER\s*:=\s*(\d+);/g)].map(
    (match) => Number(match[1]),
  );

  // 片方だけ動かすと「UIは3回と言っているのにサーバーは2回で止める」になる。
  assert.ok(limits.length >= 2, `${newest.name} should declare v_limit in both RPCs`);
  for (const limit of limits) {
    assert.equal(limit, FREE_DAILY_BATTLE_LIMIT, `${newest.name} disagrees with the TS constant`);
  }
});

test('the day boundary is the JST calendar day on the SQL side too', () => {
  const migration = readFileSync(
    fileURLToPath(
      new URL(
        '../../../supabase/migrations/20260916130000_free_daily_battle_allowance.sql',
        import.meta.url,
      ),
    ),
    'utf8',
  );

  // UTCに直すと日本のユーザーには9時間ずれた時刻にリセットされる。
  assert.match(migration, /battle_day_key[\s\S]*Asia\/Tokyo/);
});
