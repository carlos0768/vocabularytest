import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { parseEmphasisMarkup, stripEmphasisMarkup } from './emphasis-markup';

describe('parseEmphasisMarkup', () => {
  it('splits **marked** words into emphasized segments', () => {
    assert.deepEqual(parseEmphasisMarkup('predict は **pre**（前もって）＋ **dict**（言う）'), [
      { text: 'predict は ', emphasis: false },
      { text: 'pre', emphasis: true },
      { text: '（前もって）＋ ', emphasis: false },
      { text: 'dict', emphasis: true },
      { text: '（言う）', emphasis: false },
    ]);
  });

  it('returns a single plain segment when nothing is marked', () => {
    assert.deepEqual(parseEmphasisMarkup('接頭語は単語の頭に付くパーツです。'), [
      { text: '接頭語は単語の頭に付くパーツです。', emphasis: false },
    ]);
  });

  it('keeps an unmatched marker as plain text instead of dropping it', () => {
    assert.deepEqual(parseEmphasisMarkup('**un-** と **uni'), [
      { text: 'un-', emphasis: true },
      { text: ' と **uni', emphasis: false },
    ]);
  });

  it('treats an empty pair (****) as plain text', () => {
    assert.deepEqual(parseEmphasisMarkup('a****b'), [{ text: 'a****b', emphasis: false }]);
  });

  it('handles markers at both ends and returns nothing for an empty string', () => {
    assert.deepEqual(parseEmphasisMarkup('**-tion**'), [{ text: '-tion', emphasis: true }]);
    assert.deepEqual(parseEmphasisMarkup(''), []);
  });
});

describe('stripEmphasisMarkup', () => {
  it('removes the markers and keeps the text', () => {
    assert.equal(stripEmphasisMarkup('**un-**（否定）: unhappy'), 'un-（否定）: unhappy');
  });
});
