import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fixedCostRowToDomain,
  monthlyAmountJpy,
  type FixedCost,
} from './fixed-costs';
import {
  daysInJstMonth,
  jstDayOfMonth,
  jstMonthKey,
  jstMonthStartUtc,
  lastJstMonthKeys,
} from './months';

function createCost(overrides: Partial<FixedCost> = {}): FixedCost {
  return {
    id: 'cost-1',
    name: 'Supabase Pro',
    category: 'database',
    vendor: 'Supabase',
    amountJpy: 3750,
    billingCycle: 'monthly',
    startsOn: '2026-04-01',
    endsOn: null,
    notes: null,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

test('monthlyAmountJpy: monthly cost applies from start month with no end', () => {
  const cost = createCost();
  assert.equal(monthlyAmountJpy(cost, '2026-03'), 0);
  assert.equal(monthlyAmountJpy(cost, '2026-04'), 3750);
  assert.equal(monthlyAmountJpy(cost, '2027-01'), 3750);
});

test('monthlyAmountJpy: monthly cost stops after end month', () => {
  const cost = createCost({ endsOn: '2026-06-15' });
  assert.equal(monthlyAmountJpy(cost, '2026-06'), 3750);
  assert.equal(monthlyAmountJpy(cost, '2026-07'), 0);
});

test('monthlyAmountJpy: yearly cost is allocated at 1/12 per month', () => {
  const cost = createCost({ billingCycle: 'yearly', amountJpy: 12000 });
  assert.equal(monthlyAmountJpy(cost, '2026-03'), 0);
  assert.equal(monthlyAmountJpy(cost, '2026-04'), 1000);
  assert.equal(monthlyAmountJpy(cost, '2026-12'), 1000);
});

test('monthlyAmountJpy: one_time cost is booked only in its start month', () => {
  const cost = createCost({ billingCycle: 'one_time', amountJpy: 5000, startsOn: '2026-05-20' });
  assert.equal(monthlyAmountJpy(cost, '2026-04'), 0);
  assert.equal(monthlyAmountJpy(cost, '2026-05'), 5000);
  assert.equal(monthlyAmountJpy(cost, '2026-06'), 0);
});

test('fixedCostRowToDomain coerces numeric strings and falls back on unknown enums', () => {
  const cost = fixedCostRowToDomain({
    id: 'row-1',
    name: 'ドメイン更新',
    category: 'not-a-category',
    vendor: null,
    amount_jpy: '1980.50',
    billing_cycle: 'bogus',
    starts_on: '2026-01-15',
    ends_on: null,
    notes: null,
    created_at: '2026-01-15T00:00:00.000Z',
    updated_at: '2026-01-15T00:00:00.000Z',
  });

  assert.equal(cost.amountJpy, 1980.5);
  assert.equal(cost.category, 'other');
  assert.equal(cost.billingCycle, 'monthly');
});

test('jstMonthKey uses JST calendar month across the UTC boundary', () => {
  // UTC 6/30 15:00 = JST 7/1 00:00
  assert.equal(jstMonthKey(new Date('2026-06-30T15:00:00.000Z')), '2026-07');
  assert.equal(jstMonthKey(new Date('2026-06-30T14:59:59.000Z')), '2026-06');
});

test('lastJstMonthKeys returns ascending keys ending with the current month', () => {
  const now = new Date('2026-02-10T00:00:00.000Z');
  assert.deepEqual(lastJstMonthKeys(4, now), ['2025-11', '2025-12', '2026-01', '2026-02']);
});

test('jstMonthStartUtc returns the UTC instant of the JST month start', () => {
  const start = jstMonthStartUtc('2026-07');
  assert.equal(start.toISOString(), '2026-06-30T15:00:00.000Z');
  assert.equal(jstMonthKey(start), '2026-07');
});

test('daysInJstMonth and jstDayOfMonth', () => {
  assert.equal(daysInJstMonth('2026-07'), 31);
  assert.equal(daysInJstMonth('2026-02'), 28);
  assert.equal(daysInJstMonth('2028-02'), 29);
  // UTC 7/20 16:00 = JST 7/21 01:00
  assert.equal(jstDayOfMonth(new Date('2026-07-20T16:00:00.000Z')), 21);
});
