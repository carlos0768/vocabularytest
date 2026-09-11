import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGmoEventId, parseGmoNotificationBody } from './route';

// フラグ既定OFFのため、ルート本体の経路テストは Phase 2b で
// 仕様定数が埋まってから追加する。ここでは仕様非依存の部品だけを固定する。

test('the idempotency key combines order and status so a resend collapses', () => {
  const first = buildGmoEventId({ OrderID: 'order_1', Status: 'PAYSUCCESS' });
  const resend = buildGmoEventId({ OrderID: 'order_1', Status: 'PAYSUCCESS' });
  assert.equal(first, resend);
});

test('a different state change on the same order gets its own key', () => {
  assert.notEqual(
    buildGmoEventId({ OrderID: 'order_1', Status: 'PAYSUCCESS' }),
    buildGmoEventId({ OrderID: 'order_1', Status: 'CANCEL' })
  );
});

test('a notification without OrderID or Status has no usable key', () => {
  assert.equal(buildGmoEventId({ Status: 'PAYSUCCESS' }), null);
  assert.equal(buildGmoEventId({ OrderID: 'order_1' }), null);
  assert.equal(buildGmoEventId({ OrderID: '  ', Status: 'PAYSUCCESS' }), null);
});

test('the notification body is parsed as form-urlencoded', () => {
  const body = parseGmoNotificationBody('OrderID=order_1&Status=PAYSUCCESS&Amount=300');
  assert.deepEqual(body, { OrderID: 'order_1', Status: 'PAYSUCCESS', Amount: '300' });
});
