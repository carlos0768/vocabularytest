import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toProfileWordbooks } from './wordbooks';

test('maps rows to list items with word counts and only display fields', () => {
  const items = toProfileWordbooks(
    [
      { id: 'p1', title: ' ターゲット1900 ', icon_image: 'data:image/jpeg;base64,AAAA', kind: 'english' },
      { id: 'p2', title: '古文単語', icon_image: null, kind: 'classical' },
    ],
    new Map([['p1', 120]]),
  );
  assert.deepEqual(items, [
    { id: 'p1', title: 'ターゲット1900', iconImage: 'data:image/jpeg;base64,AAAA', kind: 'english', wordCount: 120 },
    { id: 'p2', title: '古文単語', iconImage: null, kind: 'classical', wordCount: 0 },
  ]);
});

test('falls back for blank titles, unknown kinds, and non-image icons', () => {
  const [item] = toProfileWordbooks(
    [{ id: 'p1', title: '  ', icon_image: 'https://example.com/a.png', kind: null }],
    new Map(),
  );
  assert.equal(item.title, '無題の単語帳');
  assert.equal(item.kind, 'english');
  assert.equal(item.iconImage, null);
});
