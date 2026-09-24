import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPECTED_PRO_AMOUNT_JPY,
  GmoSearchTradeError,
  addOneBillingMonth,
  normalizeGmoTradeState,
  parseGmoProcessDate,
  searchGmoTrade,
  type GmoTradeState,
} from './search-trade';
import { GMO_STATUS_TO_NOTIFICATION_TYPE } from './spec';

const CONFIG = {
  shopId: 'tshop_test',
  shopPass: 'pass',
  siteId: 'site',
  sitePass: 'sitepass',
  baseUrl: 'https://pt01.mul-pay.jp',
  notificationIpAllowlist: [],
  timeoutMs: 1000,
};

function trade(overrides: Partial<GmoTradeState> = {}): GmoTradeState {
  return {
    orderId: 'order_1',
    status: 'PAYSUCCESS',
    amount: EXPECTED_PRO_AMOUNT_JPY,
    recurringId: null,
    processDate: '2026-09-24T03:00:00.000Z',
    ...overrides,
  };
}

test('SearchTrade is called with the shop credentials and the order id', async () => {
  const calls: Array<{ api: string; params: Record<string, unknown> }> = [];
  const fakeCall = async (api: string, params: Record<string, unknown>) => {
    calls.push({ api, params });
    return { OrderID: 'order_1', Status: 'PAYSUCCESS', Amount: '300', ProcessDate: '20260924120000' };
  };

  const result = await searchGmoTrade('order_1', CONFIG, fakeCall as never);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].api, 'SearchTrade');
  assert.deepEqual(calls[0].params, {
    ShopID: 'tshop_test',
    ShopPass: 'pass',
    OrderID: 'order_1',
  });
  assert.equal(result.status, 'PAYSUCCESS');
  assert.equal(result.amount, 300);
});

test('a response without Status is an error rather than a silent pass', async () => {
  const fakeCall = async () => ({ OrderID: 'order_1' });
  await assert.rejects(
    () => searchGmoTrade('order_1', CONFIG, fakeCall as never),
    GmoSearchTradeError
  );
});

test('the order id from the response wins, so a mismatched trade is visible', async () => {
  const fakeCall = async () => ({ OrderID: 'other_order', Status: 'PAYSUCCESS', Amount: '300' });
  const result = await searchGmoTrade('order_1', CONFIG, fakeCall as never);
  assert.equal(result.orderId, 'other_order');
});

test('ProcessDate is read as JST, not UTC', () => {
  // 20260924120000 JST = 2026-09-24T03:00:00Z
  assert.equal(parseGmoProcessDate('20260924120000'), '2026-09-24T03:00:00.000Z');
  assert.equal(parseGmoProcessDate('not-a-date'), null);
  assert.equal(parseGmoProcessDate(''), null);
  assert.equal(parseGmoProcessDate(null), null);
});

test('a billing month lands on the same day of the next month', () => {
  assert.equal(addOneBillingMonth('2026-09-24T03:00:00.000Z'), '2026-10-24T03:00:00.000Z');
});

test('month-end does not skip a month (Jan 31 + 1 month stays in February)', () => {
  // 素の setMonth だと 3/3 になり、2月ぶんを丸ごと余計に与えてしまう
  assert.equal(addOneBillingMonth('2026-01-31T00:00:00.000Z'), '2026-02-28T00:00:00.000Z');
  assert.equal(addOneBillingMonth('2028-01-31T00:00:00.000Z'), '2028-02-29T00:00:00.000Z');
  assert.equal(addOneBillingMonth('2026-05-31T00:00:00.000Z'), '2026-06-30T00:00:00.000Z');
});

test('an unmapped status is refused instead of guessed at', () => {
  assert.throws(
    () => normalizeGmoTradeState(trade({ status: 'SOMETHING_NEW' }), 'evt_1'),
    GmoSearchTradeError
  );
});

test('an amount that is not the Pro price is refused, naming the amount', () => {
  // 金額チェックは status マッピングより前にあるので、対応表が空の今でも
  // 「金額違いで落ちた」ことがメッセージで確認できる。
  assert.throws(
    () => normalizeGmoTradeState(trade({ amount: 1 }), 'evt_1'),
    (error: unknown) => {
      assert.ok(error instanceof GmoSearchTradeError);
      assert.match(error.message, /amount 1 does not match/);
      return true;
    }
  );
});

test('an absent amount does not block, but an unmapped status still does', () => {
  assert.throws(
    () => normalizeGmoTradeState(trade({ amount: null }), 'evt_1'),
    (error: unknown) => {
      assert.ok(error instanceof GmoSearchTradeError);
      assert.match(error.message, /status has no mapping/);
      return true;
    }
  );
});

test('the status map is still empty, so the route stays fail-closed until it is filled', () => {
  // 疎通テストで実値を拾って埋める。埋めた時点でこのテストを消すこと。
  assert.equal(Object.keys(GMO_STATUS_TO_NOTIFICATION_TYPE).length, 0);
});
