import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { interleaveReelAds } from './feed-entries';

const items = (count: number) => Array.from({ length: count }, (_, i) => `w${i}`);

describe('interleaveReelAds', () => {
  it('passes items through untouched when ads are disabled', () => {
    const entries = interleaveReelAds(items(13), false, 6);
    assert.equal(entries.length, 13);
    assert.ok(entries.every((entry) => entry.kind === 'item'));
  });

  it('inserts one ad before every interval-th item', () => {
    const entries = interleaveReelAds(items(13), true, 6);
    // 13 items + ads before item index 6 and 12
    assert.equal(entries.length, 15);
    assert.equal(entries[6].kind, 'ad');
    assert.equal(entries[13].kind, 'ad');
    assert.deepEqual(
      entries.filter((entry) => entry.kind === 'item').map((entry) => entry.item),
      items(13),
    );
  });

  it('never places an ad as the first card', () => {
    for (const count of [1, 6, 7, 24]) {
      const entries = interleaveReelAds(items(count), true, 6);
      assert.equal(entries[0].kind, 'item');
    }
  });

  it('adds no ads when there are fewer items than the interval', () => {
    const entries = interleaveReelAds(items(5), true, 6);
    assert.equal(entries.length, 5);
    assert.ok(entries.every((entry) => entry.kind === 'item'));
  });

  it('gives each ad a stable unique key', () => {
    const entries = interleaveReelAds(items(20), true, 6);
    const adKeys = entries.filter((entry) => entry.kind === 'ad').map((entry) => entry.adKey);
    assert.deepEqual(adKeys, ['ad-1', 'ad-2', 'ad-3']);
  });
});
