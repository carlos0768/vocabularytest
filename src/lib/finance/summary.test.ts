import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFinanceSummary, STRIPE_FEE_RATE, type FinanceSummaryInputs } from './summary';
import type { FixedCost } from './fixed-costs';

const NOW = new Date('2026-07-21T03:00:00.000Z'); // JST 2026-07-21 12:00

function createInputs(overrides: Partial<FinanceSummaryInputs> = {}): FinanceSummaryInputs {
  return {
    monthKeys: ['2026-06', '2026-07'],
    now: NOW,
    aiMonthly: [
      { monthKey: '2026-06', calls: 100, failedCalls: 2, totalTokens: 50000, costJpy: 400 },
      { monthKey: '2026-07', calls: 210, failedCalls: 0, totalTokens: 90000, costJpy: 620 },
    ],
    aiBreakdown: [],
    coinSales: [
      { monthKey: '2026-07', packId: 'coins_100', purchases: 2, coins: 200 },
      { monthKey: '2026-07', packId: 'coins_1000', purchases: 1, coins: 1000 },
    ],
    stripeInvoices: {
      ok: true,
      byMonthJpy: { '2026-06': 3000, '2026-07': 3600 },
    },
    refunds: { ok: true, byMonthJpy: { '2026-07': 300 } },
    fixedCosts: [],
    members: {
      activeProBilling: 12,
      activeProAppstore: 3,
      activeProTest: 5,
      pastDue: 1,
      pendingCancellations: 2,
    },
    warnings: [],
    ...overrides,
  };
}

test('buildFinanceSummary computes monthly P&L rows from actual data', () => {
  const fixedCosts: FixedCost[] = [
    {
      id: 'f1',
      name: 'Supabase Pro',
      category: 'database',
      vendor: 'Supabase',
      amountJpy: 3750,
      billingCycle: 'monthly',
      startsOn: '2026-01-01',
      endsOn: null,
      notes: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'f2',
      name: 'ドメイン(年額)',
      category: 'infrastructure',
      vendor: null,
      amountJpy: 2400,
      billingCycle: 'yearly',
      startsOn: '2026-01-01',
      endsOn: null,
      notes: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  const summary = buildFinanceSummary(createInputs({ fixedCosts }));
  const july = summary.monthly.find((row) => row.monthKey === '2026-07');
  assert.ok(july);

  // コインパック: coins_100(¥150)×2 + coins_1000(¥1,200)×1 = ¥1,500
  assert.equal(july.revenue.coinPackJpy, 1500);
  assert.equal(july.revenue.subscriptionJpy, 3600);
  assert.equal(july.revenue.subscriptionSource, 'stripe');
  assert.equal(july.revenue.grossJpy, 5100);
  assert.equal(july.revenue.refundJpy, 300);
  assert.equal(july.revenue.netJpy, 4800);

  const expectedFee = Number((5100 * STRIPE_FEE_RATE).toFixed(2));
  assert.equal(july.costs.paymentFeeJpy, expectedFee);
  assert.equal(july.costs.aiJpy, 620);
  assert.equal(july.costs.fixedJpy, 3950); // 3750 + 2400/12
  assert.equal(july.costs.fixedByCategory.database, 3750);
  assert.equal(july.costs.fixedByCategory.infrastructure, 200);

  const expectedMarginal = Number((4800 - 620 - expectedFee).toFixed(2));
  assert.equal(july.profit.marginalJpy, expectedMarginal);
  assert.equal(july.profit.operatingJpy, Number((expectedMarginal - 3950).toFixed(2)));
  assert.equal(july.profit.marginalRate, Number((expectedMarginal / 4800).toFixed(4)));
});

test('buildFinanceSummary falls back to member-count estimate when Stripe is unavailable', () => {
  const summary = buildFinanceSummary(
    createInputs({ stripeInvoices: { ok: false, byMonthJpy: {} } })
  );

  const june = summary.monthly.find((row) => row.monthKey === '2026-06');
  const july = summary.monthly.find((row) => row.monthKey === '2026-07');
  assert.ok(june && july);

  assert.equal(june.revenue.subscriptionJpy, 0);
  assert.equal(june.revenue.subscriptionSource, 'unavailable');
  // 当月のみ: 課金Pro 12名 × ¥300
  assert.equal(july.revenue.subscriptionJpy, 3600);
  assert.equal(july.revenue.subscriptionSource, 'estimate');
});

test('buildFinanceSummary computes KPIs: MRR, ARPPU, forecast, breakeven', () => {
  const fixedCosts: FixedCost[] = [
    {
      id: 'f1',
      name: '固定費',
      category: 'other',
      vendor: null,
      amountJpy: 3000,
      billingCycle: 'monthly',
      startsOn: '2026-01-01',
      endsOn: null,
      notes: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];
  const summary = buildFinanceSummary(createInputs({ fixedCosts }));

  assert.equal(summary.kpis.mrr.billingJpy, 12 * 300);
  assert.equal(summary.kpis.mrr.appstoreJpy, 3 * 300);
  assert.equal(summary.kpis.mrr.totalJpy, 15 * 300);

  // ARPPU = 当月純売上 ÷ 有料会員数(billing + appstore)
  assert.equal(summary.kpis.arppuJpy, Number((4800 / 15).toFixed(2)));

  // 当月AIコスト予測 = 620 ÷ 経過21日 × 31日
  assert.equal(
    summary.kpis.currentMonthAiForecastJpy,
    Number(((620 / 21) * 31).toFixed(2))
  );

  // 貢献利益/会員 = 300×(1-手数料率) − 当月AI原価÷15名
  const contribution = Number((300 * (1 - STRIPE_FEE_RATE) - 620 / 15).toFixed(2));
  assert.equal(summary.kpis.breakeven.contributionPerMemberJpy, contribution);
  assert.equal(summary.kpis.breakeven.monthlyFixedJpy, 3000);
  assert.equal(summary.kpis.breakeven.requiredProMembers, Math.ceil(3000 / contribution));
});

test('buildFinanceSummary returns null breakeven when contribution per member is non-positive', () => {
  const summary = buildFinanceSummary(
    createInputs({
      aiMonthly: [
        { monthKey: '2026-07', calls: 10, failedCalls: 0, totalTokens: 1000, costJpy: 100000 },
      ],
    })
  );
  assert.equal(summary.kpis.breakeven.requiredProMembers, null);
});

test('buildFinanceSummary aggregates coin pack sales across months', () => {
  const summary = buildFinanceSummary(
    createInputs({
      coinSales: [
        { monthKey: '2026-06', packId: 'coins_100', purchases: 1, coins: 100 },
        { monthKey: '2026-07', packId: 'coins_100', purchases: 2, coins: 200 },
        { monthKey: '2026-07', packId: null, purchases: 1, coins: 50 },
      ],
    })
  );

  const pack100 = summary.coinPackSummary.find((pack) => pack.packId === 'coins_100');
  assert.ok(pack100);
  assert.equal(pack100.purchases, 3);
  assert.equal(pack100.coins, 300);
  assert.equal(pack100.revenueJpy, 450);

  // pack_id不明の購入は売上¥0(価格不明)として件数のみ集計される
  const unknown = summary.coinPackSummary.find((pack) => pack.packId === 'unknown');
  assert.ok(unknown);
  assert.equal(unknown.revenueJpy, 0);

  const june = summary.monthly.find((row) => row.monthKey === '2026-06');
  assert.equal(june?.revenue.coinPackJpy, 150);
});
