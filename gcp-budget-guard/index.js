'use strict';

const functions = require('@google-cloud/functions-framework');
const { Firestore, Timestamp } = require('@google-cloud/firestore');

const DEFAULT_STATE_DOC_PATH = 'ops/aiGatewayGuard';
const DEFAULT_ACTUAL_THRESHOLD = 0.9;
const DEFAULT_FORECAST_THRESHOLD = 0.9;

function parseNumber(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBudgetNotification(cloudEvent) {
  const encoded = cloudEvent && cloudEvent.data && cloudEvent.data.message
    ? cloudEvent.data.message.data
    : undefined;

  if (!encoded) {
    throw new Error('Missing Pub/Sub message data');
  }

  const raw = Buffer.from(encoded, 'base64').toString('utf8');
  return JSON.parse(raw);
}

function getBudgetRatio(notification) {
  const costAmount = parseNumber(notification.costAmount, 0);
  const budgetAmount = parseNumber(notification.budgetAmount, 0);

  if (budgetAmount <= 0) {
    return 0;
  }

  return costAmount / budgetAmount;
}

function shouldDisableGateway(notification, options = {}) {
  const actualThreshold = options.actualThreshold ?? DEFAULT_ACTUAL_THRESHOLD;
  const forecastThreshold = options.forecastThreshold ?? DEFAULT_FORECAST_THRESHOLD;
  const actualRatio = getBudgetRatio(notification);
  const alertThresholdExceeded = parseNumber(notification.alertThresholdExceeded, 0);
  const forecastThresholdExceeded = parseNumber(notification.forecastThresholdExceeded, 0);

  return (
    actualRatio >= actualThreshold ||
    alertThresholdExceeded >= actualThreshold ||
    forecastThresholdExceeded >= forecastThreshold
  );
}

function buildGuardUpdate(notification, now = Date.now()) {
  const actualRatio = getBudgetRatio(notification);
  const alertThresholdExceeded = parseNumber(notification.alertThresholdExceeded, 0);
  const forecastThresholdExceeded = parseNumber(notification.forecastThresholdExceeded, 0);
  const timestamp = Timestamp.fromMillis(now);

  return {
    disabled: true,
    disabledAt: timestamp,
    disabledBy: 'gcp-budget-guard',
    disabledReason: 'GCP monthly budget threshold exceeded',
    lastBudgetNotification: {
      budgetDisplayName: notification.budgetDisplayName || null,
      costAmount: parseNumber(notification.costAmount, 0),
      budgetAmount: parseNumber(notification.budgetAmount, 0),
      currencyCode: notification.currencyCode || null,
      costIntervalStart: notification.costIntervalStart || null,
      actualRatio,
      alertThresholdExceeded,
      forecastThresholdExceeded,
      receivedAt: timestamp,
    },
  };
}

async function handleBudgetNotification(cloudEvent) {
  const notification = parseBudgetNotification(cloudEvent);
  const actualThreshold = parseNumber(
    process.env.BUDGET_GUARD_ACTUAL_THRESHOLD,
    DEFAULT_ACTUAL_THRESHOLD,
  );
  const forecastThreshold = parseNumber(
    process.env.BUDGET_GUARD_FORECAST_THRESHOLD,
    DEFAULT_FORECAST_THRESHOLD,
  );
  const stateDocPath = process.env.GATEWAY_GUARD_STATE_DOC || DEFAULT_STATE_DOC_PATH;
  const projectId = process.env.GCP_PROJECT_ID || undefined;
  const firestore = new Firestore({ projectId, preferRest: true });
  const stateRef = firestore.doc(stateDocPath);
  const shouldDisable = shouldDisableGateway(notification, {
    actualThreshold,
    forecastThreshold,
  });

  await stateRef.set(
    shouldDisable
      ? buildGuardUpdate(notification)
      : {
          lastBudgetNotification: {
            budgetDisplayName: notification.budgetDisplayName || null,
            costAmount: parseNumber(notification.costAmount, 0),
            budgetAmount: parseNumber(notification.budgetAmount, 0),
            currencyCode: notification.currencyCode || null,
            costIntervalStart: notification.costIntervalStart || null,
            actualRatio: getBudgetRatio(notification),
            alertThresholdExceeded: parseNumber(notification.alertThresholdExceeded, 0),
            forecastThresholdExceeded: parseNumber(notification.forecastThresholdExceeded, 0),
            receivedAt: Timestamp.now(),
          },
        },
    { merge: true },
  );

  console.log('[budget-guard-notification]', {
    budgetDisplayName: notification.budgetDisplayName,
    costAmount: notification.costAmount,
    budgetAmount: notification.budgetAmount,
    alertThresholdExceeded: notification.alertThresholdExceeded,
    forecastThresholdExceeded: notification.forecastThresholdExceeded,
    shouldDisable,
    stateDocPath,
  });
}

functions.cloudEvent('handleBudgetNotification', handleBudgetNotification);

module.exports = {
  buildGuardUpdate,
  getBudgetRatio,
  handleBudgetNotification,
  parseBudgetNotification,
  shouldDisableGateway,
};
