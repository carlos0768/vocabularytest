import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_AVATAR_DATA_URL_LENGTH,
  isAvatarDataUrl,
  normalizeStoredAvatarUrl,
  parseAvatarInput,
} from './avatar';

const VALID = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ==';

test('accepts jpeg/png/webp data URLs', () => {
  assert.equal(isAvatarDataUrl(VALID), true);
  assert.equal(isAvatarDataUrl('data:image/png;base64,iVBORw0KGgo='), true);
  assert.equal(isAvatarDataUrl('data:image/webp;base64,UklGRg=='), true);
});

test('rejects non-image and remote URLs', () => {
  assert.equal(isAvatarDataUrl('https://example.com/a.png'), false);
  assert.equal(isAvatarDataUrl('data:text/html;base64,PHNjcmlwdD4='), false);
  assert.equal(isAvatarDataUrl('data:image/svg+xml;base64,PHN2Zz4='), false);
  assert.equal(isAvatarDataUrl('javascript:alert(1)'), false);
});

test('parseAvatarInput treats null and empty string as removal', () => {
  assert.deepEqual(parseAvatarInput(null), { ok: true, value: null });
  assert.deepEqual(parseAvatarInput(''), { ok: true, value: null });
  assert.deepEqual(parseAvatarInput('   '), { ok: true, value: null });
});

test('parseAvatarInput accepts a valid data URL', () => {
  assert.deepEqual(parseAvatarInput(VALID), { ok: true, value: VALID });
});

test('parseAvatarInput rejects oversized payloads before format checks', () => {
  const oversized = `data:image/jpeg;base64,${'A'.repeat(MAX_AVATAR_DATA_URL_LENGTH)}`;
  const result = parseAvatarInput(oversized);
  assert.equal(result.ok, false);
  assert.match(result.ok ? '' : result.error, /大きすぎ/);
});

test('parseAvatarInput rejects malformed values', () => {
  assert.equal(parseAvatarInput('data:image/jpeg;base64,not base64!').ok, false);
  assert.equal(parseAvatarInput(42).ok, false);
  assert.equal(parseAvatarInput({}).ok, false);
});

test('normalizeStoredAvatarUrl drops unusable stored values', () => {
  assert.equal(normalizeStoredAvatarUrl(VALID), VALID);
  assert.equal(normalizeStoredAvatarUrl(''), null);
  assert.equal(normalizeStoredAvatarUrl(null), null);
  assert.equal(normalizeStoredAvatarUrl('https://example.com/a.png'), null);
});
