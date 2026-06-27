import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GROUP_THUMB_COLORS,
  buildGroupShareMessages,
  buildGroupShareUrl,
  buildLineShareUrl,
  buildXIntentUrl,
  groupThumbColor,
} from './group-share';

test('groupThumbColor is deterministic and within the palette', () => {
  const a = groupThumbColor('group-123');
  const b = groupThumbColor('group-123');
  assert.equal(a, b);
  assert.ok(GROUP_THUMB_COLORS.includes(a as (typeof GROUP_THUMB_COLORS)[number]));
});

test('groupThumbColor varies across ids', () => {
  const colors = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map(groupThumbColor));
  // Not all identical -> the hash spreads ids across the palette.
  assert.ok(colors.size > 1);
});

test('buildGroupShareUrl points at the public join route', () => {
  assert.equal(
    buildGroupShareUrl('https://www.merken.jp', 'abc'),
    'https://www.merken.jp/groups/abc/join',
  );
});

test('buildGroupShareUrl trims a trailing slash on the origin', () => {
  assert.equal(
    buildGroupShareUrl('https://www.merken.jp/', 'abc'),
    'https://www.merken.jp/groups/abc/join',
  );
});

test('buildGroupShareUrl encodes the group id', () => {
  assert.equal(
    buildGroupShareUrl('https://x.test', 'a b/c'),
    'https://x.test/groups/a%20b%2Fc/join',
  );
});

test('buildGroupShareMessages includes the group name for each platform', () => {
  const url = 'https://www.merken.jp/groups/abc/join';
  const messages = buildGroupShareMessages({ name: 'TOEIC勉強会' }, url);
  for (const text of [messages.native, messages.x, messages.line, messages.discord, messages.instagram]) {
    assert.ok(text.includes('TOEIC勉強会'), `expected name in: ${text}`);
  }
  // The url is embedded only where the platform has no separate url field.
  assert.ok(messages.discord.includes(url));
  assert.ok(messages.instagram.includes(url));
  assert.ok(!messages.x.includes(url));
  assert.ok(!messages.line.includes(url));
});

test('buildGroupShareMessages falls back to a default name', () => {
  const messages = buildGroupShareMessages({ name: '   ' }, 'https://x.test/g/1/join');
  assert.ok(messages.native.includes('学習グループ'));
});

test('buildXIntentUrl encodes text and url params', () => {
  const url = buildXIntentUrl('https://x.test/g/1/join', 'hello world');
  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, 'https://twitter.com/intent/tweet');
  assert.equal(parsed.searchParams.get('text'), 'hello world');
  assert.equal(parsed.searchParams.get('url'), 'https://x.test/g/1/join');
});

test('buildLineShareUrl appends the url to the message body', () => {
  const url = buildLineShareUrl('https://x.test/g/1/join', 'メッセージ');
  assert.ok(url.startsWith('https://line.me/R/msg/text/?'));
  const body = decodeURIComponent(url.split('?')[1]);
  assert.equal(body, 'メッセージ\nhttps://x.test/g/1/join');
});
