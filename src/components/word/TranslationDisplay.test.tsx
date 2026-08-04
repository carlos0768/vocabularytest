import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import { TranslationDisplay } from '@/components/word/TranslationDisplay';
import type { Word } from '@/types';

function makeWord(translations: string[]): Pick<Word, 'japanese' | 'translations'> {
  return {
    japanese: translations[0] ?? '',
    translations: translations.map((text, index) => ({
      translationJa: text,
      normalizedTranslationJa: text,
      meaningRank: index + 1,
      position: index,
      isPrimary: index === 0,
    })),
  };
}

// Compact rows live inside a single-line `truncate` parent. An inline-flex box
// there wraps onto a second line and pushes the row into the trailing action
// buttons, so the compact variant must stay plain inline text.
test('TranslationDisplay compact renders multiple meanings without a wrapping flex box', () => {
  const html = renderToStaticMarkup(<TranslationDisplay word={makeWord(['余分な', '割く', '省く'])} compact />);

  assert.ok(!html.includes('flex-wrap'), `compact markup must not use flex-wrap: ${html}`);
  assert.ok(!html.includes('inline-flex'), `compact markup must not use inline-flex: ${html}`);
  for (const text of ['余分な', '割く', '省く']) {
    assert.ok(html.includes(text), `compact markup must include ${text}`);
  }
});

test('TranslationDisplay non-compact keeps the wrapping layout for large displays', () => {
  const html = renderToStaticMarkup(<TranslationDisplay word={makeWord(['余分な', '割く'])} />);

  assert.ok(html.includes('flex-wrap'), `non-compact markup should wrap: ${html}`);
});

test('TranslationDisplay renders a single meaning as bare text', () => {
  const html = renderToStaticMarkup(<TranslationDisplay word={makeWord(['平らな'])} compact />);

  assert.ok(!html.includes('flex'), `single meaning needs no flex layout: ${html}`);
  assert.ok(html.includes('平らな'));
});
