import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkGmoNotificationIp,
  normalizeClientIp,
  resolveClientIpFromForwardedFor,
  resolveGmoClientIp,
} from './notification-trust';

test('an exact IP in the allowlist is accepted', () => {
  const result = checkGmoNotificationIp('203.0.113.10', ['203.0.113.10']);
  assert.deepEqual(result, { allowed: true, matchedRule: '203.0.113.10' });
});

test('a CIDR range in the allowlist is accepted', () => {
  assert.equal(checkGmoNotificationIp('203.0.113.55', ['203.0.113.0/24']).allowed, true);
  assert.equal(checkGmoNotificationIp('203.0.114.1', ['203.0.113.0/24']).allowed, false);
});

test('an unconfigured allowlist rejects everything instead of allowing it', () => {
  const result = checkGmoNotificationIp('203.0.113.10', []);
  assert.deepEqual(result, { allowed: false, reason: 'no_allowlist_configured' });
});

test('a missing client IP is rejected', () => {
  assert.equal(checkGmoNotificationIp(null, ['203.0.113.0/24']).allowed, false);
  assert.equal(checkGmoNotificationIp('  ', ['203.0.113.0/24']).allowed, false);
});

test('octal-looking and oversized octets never match', () => {
  assert.equal(checkGmoNotificationIp('203.0.113.010', ['203.0.113.10']).allowed, false);
  assert.equal(checkGmoNotificationIp('203.0.113.256', ['203.0.113.0/24']).allowed, false);
  assert.equal(checkGmoNotificationIp('203.0.113', ['203.0.113.0/24']).allowed, false);
});

test('IPv4-mapped IPv6 and ports are normalized before matching', () => {
  assert.equal(normalizeClientIp('::ffff:203.0.113.10'), '203.0.113.10');
  assert.equal(normalizeClientIp('203.0.113.10:51234'), '203.0.113.10');
  assert.equal(checkGmoNotificationIp('::ffff:203.0.113.10', ['203.0.113.0/24']).allowed, true);
});

test('a /32 rule matches only that address and /0 matches anything', () => {
  assert.equal(checkGmoNotificationIp('203.0.113.10', ['203.0.113.10/32']).allowed, true);
  assert.equal(checkGmoNotificationIp('203.0.113.11', ['203.0.113.10/32']).allowed, false);
  assert.equal(checkGmoNotificationIp('198.51.100.1', ['0.0.0.0/0']).allowed, true);
});

test('a malformed allowlist rule is skipped rather than matching everything', () => {
  assert.equal(checkGmoNotificationIp('203.0.113.10', ['not-an-ip']).allowed, false);
  assert.equal(checkGmoNotificationIp('203.0.113.10', ['203.0.113.0/99']).allowed, false);
});

test('forwarded-for uses the last hop so a client-supplied prefix cannot spoof it', () => {
  // 攻撃者が先頭にGMOのIPを書いても、末尾の実IPで判定される
  const spoofed = '203.0.113.10, 198.51.100.77';
  assert.equal(resolveClientIpFromForwardedFor(spoofed), '198.51.100.77');
  assert.equal(checkGmoNotificationIp(resolveClientIpFromForwardedFor(spoofed), ['203.0.113.0/24']).allowed, false);
});

test('a single-entry forwarded-for still resolves', () => {
  assert.equal(resolveClientIpFromForwardedFor('203.0.113.10'), '203.0.113.10');
  assert.equal(resolveClientIpFromForwardedFor(''), null);
  assert.equal(resolveClientIpFromForwardedFor(null), null);
});

test('x-real-ip wins over a spoofable forwarded-for chain', () => {
  const headers = new Headers({
    'x-real-ip': '198.51.100.77',
    'x-forwarded-for': '203.0.113.10, 198.51.100.77',
  });
  assert.equal(resolveGmoClientIp(headers), '198.51.100.77');
});

test('resolveGmoClientIp falls back to forwarded-for when x-real-ip is absent', () => {
  const headers = new Headers({ 'x-forwarded-for': '203.0.113.10, 198.51.100.77' });
  assert.equal(resolveGmoClientIp(headers), '198.51.100.77');
  assert.equal(resolveGmoClientIp(new Headers()), null);
});
