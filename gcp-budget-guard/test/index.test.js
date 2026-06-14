'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildGuardUpdate,
  getBudgetRatio,
  parseBudgetNotification,
  shouldDisableGateway,
} = require('../index.js');

function cloudEventFor(payload) {
  return {
    data: {
      message: {
        data: Buffer.from(JSON.stringify(payload), 'utf8').toString('base64'),
      },
    },
  };
}

test('parses Pub/Sub budget notification payloads', () => {
  const payload = {
    budgetDisplayName: 'MERKEN production monthly guardrail',
    costAmount: 4500,
    budgetAmount: 5000,
    currencyCode: 'JPY',
  };

  assert.deepEqual(parseBudgetNotification(cloudEventFor(payload)), payload);
});

test('computes actual budget ratio', () => {
  assert.equal(getBudgetRatio({ costAmount: 4500, budgetAmount: 5000 }), 0.9);
  assert.equal(getBudgetRatio({ costAmount: 4500, budgetAmount: 0 }), 0);
});

test('disables gateway when actual cost reaches threshold', () => {
  assert.equal(
    shouldDisableGateway(
      {
        costAmount: 4500,
        budgetAmount: 5000,
      },
      { actualThreshold: 0.9, forecastThreshold: 0.9 },
    ),
    true,
  );
});

test('disables gateway when forecast threshold reaches threshold', () => {
  assert.equal(
    shouldDisableGateway(
      {
        costAmount: 1000,
        budgetAmount: 5000,
        forecastThresholdExceeded: 0.9,
      },
      { actualThreshold: 0.9, forecastThreshold: 0.9 },
    ),
    true,
  );
});

test('does not disable gateway below threshold', () => {
  assert.equal(
    shouldDisableGateway(
      {
        costAmount: 2000,
        budgetAmount: 5000,
        alertThresholdExceeded: 0.5,
        forecastThresholdExceeded: 0,
      },
      { actualThreshold: 0.9, forecastThreshold: 0.9 },
    ),
    false,
  );
});

test('builds a sticky disabled guard update', () => {
  const update = buildGuardUpdate(
    {
      budgetDisplayName: 'MERKEN production monthly guardrail',
      costAmount: 4500,
      budgetAmount: 5000,
      currencyCode: 'JPY',
    },
    Date.parse('2026-06-14T00:00:00.000Z'),
  );

  assert.equal(update.disabled, true);
  assert.equal(update.disabledBy, 'gcp-budget-guard');
  assert.equal(update.lastBudgetNotification.actualRatio, 0.9);
});
