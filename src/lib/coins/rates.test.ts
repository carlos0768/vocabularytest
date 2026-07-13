import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  EXTRA_IMAGE_COIN_COST,
  MANUAL_MORPHOLOGY_COIN_COST,
  MONTHLY_COIN_ALLOWANCE,
  MORPHOLOGY_COIN_COST,
  SCAN_MODE_COIN_RATES,
  computeScanCoinCost,
} from './rates';

test('computeScanCoinCost prices single modes', () => {
  assert.equal(computeScanCoinCost(['circled'], 1), 2);
  assert.equal(computeScanCoinCost(['all'], 1), 3);
  assert.equal(computeScanCoinCost(['eiken'], 1), 3);
  assert.equal(computeScanCoinCost(['idiom'], 1), 3);
});

test('computeScanCoinCost sums composite modes and dedupes repeats', () => {
  assert.equal(computeScanCoinCost(['all', 'idiom'], 1), 6);
  assert.equal(computeScanCoinCost(['all', 'idiom', 'eiken', 'circled'], 1), 11);
  assert.equal(computeScanCoinCost(['all', 'all'], 1), 3);
});

test('computeScanCoinCost adds one coin per image beyond the first', () => {
  assert.equal(computeScanCoinCost(['all'], 2), 4);
  assert.equal(computeScanCoinCost(['all'], 20), 22);
  assert.equal(computeScanCoinCost(['circled'], 4), 5);
});

test('computeScanCoinCost adds the morphology surcharge only when enabled', () => {
  assert.equal(computeScanCoinCost(['circled'], 1, { includeMorphology: true }), 4);
  assert.equal(computeScanCoinCost(['all'], 1, { includeMorphology: true }), 5);
  assert.equal(computeScanCoinCost(['all', 'idiom'], 2, { includeMorphology: true }), 9);
  assert.equal(computeScanCoinCost(['all'], 1, { includeMorphology: false }), 3);
  assert.equal(computeScanCoinCost(['all'], 1, {}), 3);
});

test('computeScanCoinCost rejects invalid input', () => {
  assert.throws(() => computeScanCoinCost(['all'], 0));
  assert.throws(() => computeScanCoinCost([], 1));
  assert.throws(() => computeScanCoinCost(['grammar' as never], 1));
});

// TS側のレート定義とマイグレーションSQLのリテラルが乖離しないことを保証する。
// レート変更時は src/lib/coins/rates.ts と
// supabase/migrations/20260705120000_create_coin_system.sql を同時に更新すること。
test('coin rates in SQL migration match the TS mirror', () => {
  const migrationSource = readFileSync(
    fileURLToPath(
      new URL('../../../supabase/migrations/20260705120000_create_coin_system.sql', import.meta.url),
    ),
    'utf8',
  );

  assert.ok(migrationSource.includes(`WHEN 'circled' THEN ${SCAN_MODE_COIN_RATES.circled}`));
  assert.ok(migrationSource.includes(`WHEN 'all'     THEN ${SCAN_MODE_COIN_RATES.all}`));
  assert.ok(migrationSource.includes(`WHEN 'eiken'   THEN ${SCAN_MODE_COIN_RATES.eiken}`));
  assert.ok(migrationSource.includes(`WHEN 'idiom'   THEN ${SCAN_MODE_COIN_RATES.idiom}`));

  // 追加画像 +1/枚（SQL側は p_image_count - 1 の加算）
  assert.equal(EXTRA_IMAGE_COIN_COST, 1);
  assert.ok(migrationSource.includes('RETURN v_cost + (p_image_count - 1);'));

  // 月次付与300枚（lazy grant は「代入」= 繰越なし）
  assert.equal(MONTHLY_COIN_ALLOWANCE, 300);
  assert.ok(migrationSource.includes('v_balance.monthly_coins := 300;'));

  // 月境界はJST。UTC日付事故の再発防止として明示的にピン留めする
  assert.ok(migrationSource.includes("AT TIME ZONE 'Asia/Tokyo'"));
});

// 語源解析サーチャージのTS/SQLリテラル一致。
// レート変更時は src/lib/coins/rates.ts と
// supabase/migrations/20260712101000_morphology_coin_cost.sql を同時に更新すること。
test('morphology surcharge in SQL migration matches the TS mirror', () => {
  const migrationSource = readFileSync(
    fileURLToPath(
      new URL(
        '../../../supabase/migrations/20260712101000_morphology_coin_cost.sql',
        import.meta.url,
      ),
    ),
    'utf8',
  );

  assert.equal(MORPHOLOGY_COIN_COST, 2);
  assert.ok(
    migrationSource.includes(
      `CASE WHEN COALESCE(p_include_morphology, FALSE) THEN ${MORPHOLOGY_COIN_COST} ELSE 0 END`,
    ),
  );

  // 再作成後の関数もモードレート・追加画像レートを維持していること
  assert.ok(migrationSource.includes(`WHEN 'circled' THEN ${SCAN_MODE_COIN_RATES.circled}`));
  assert.ok(migrationSource.includes(`WHEN 'all'     THEN ${SCAN_MODE_COIN_RATES.all}`));
  assert.ok(migrationSource.includes(`WHEN 'eiken'   THEN ${SCAN_MODE_COIN_RATES.eiken}`));
  assert.ok(migrationSource.includes(`WHEN 'idiom'   THEN ${SCAN_MODE_COIN_RATES.idiom}`));
  assert.ok(migrationSource.includes('RETURN v_cost + (p_image_count - 1)'));

  // PostgRESTのオーバーロード曖昧化防止: 旧シグネチャのDROPが必須
  assert.ok(migrationSource.includes('DROP FUNCTION IF EXISTS public.consume_scan_coins(TEXT[], INTEGER, UUID);'));
  assert.ok(migrationSource.includes('DROP FUNCTION IF EXISTS public.scan_coin_cost(TEXT[], INTEGER);'));
});

// 手動追加の語源解析コスト（1語あたり）のTS/SQLリテラル一致。
// レート変更時は src/lib/coins/rates.ts と
// supabase/migrations/20260713120000_manual_morphology_coin_cost.sql を同時に更新すること。
test('manual-add morphology cost in SQL migration matches the TS mirror', () => {
  const migrationSource = readFileSync(
    fileURLToPath(
      new URL(
        '../../../supabase/migrations/20260713120000_manual_morphology_coin_cost.sql',
        import.meta.url,
      ),
    ),
    'utf8',
  );

  assert.equal(MANUAL_MORPHOLOGY_COIN_COST, 1);
  // 1語あたりの定額コスト（p_count * <RATE>）
  assert.ok(migrationSource.includes(`v_cost := p_count * ${MANUAL_MORPHOLOGY_COIN_COST};`));

  // 専用の消費RPCと専用トランザクション種別を持つこと
  assert.ok(migrationSource.includes('CREATE OR REPLACE FUNCTION public.consume_manual_morphology_coins'));
  assert.ok(migrationSource.includes("'manual_morphology_consume'"));
  assert.ok(migrationSource.includes('GRANT EXECUTE ON FUNCTION public.consume_manual_morphology_coins(INTEGER) TO authenticated;'));

  // 月次付与300枚・JST境界は共有ヘルパー由来だが、金額のピン留めは共通で維持
  assert.ok(migrationSource.includes('v_balance.monthly_coins := 300;'));
});
