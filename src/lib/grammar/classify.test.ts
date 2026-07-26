import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyGrammarPoint, normalizeGrammarPoint } from '@/lib/grammar/classify';
import { findGrammarNode, grammarNodeSubtreeIds, walkGrammarTaxonomy } from '@/lib/grammar/taxonomy';

test('normalizeGrammarPoint absorbs case, width, spacing and punctuation', () => {
  assert.equal(normalizeGrammarPoint('　仮定法・過去完了 '), '仮定法過去完了');
  assert.equal(normalizeGrammarPoint('ＡＳ ～ ａｓ'), 'asas');
  assert.equal(normalizeGrammarPoint('【関係代名詞】'), '関係代名詞');
});

test('classifyGrammarPoint matches labels and aliases exactly', () => {
  assert.equal(classifyGrammarPoint('分詞構文'), 'participle-construction');
  assert.equal(classifyGrammarPoint('関係副詞'), 'relative-adverb');
  assert.equal(classifyGrammarPoint('付帯状況'), 'participle-with');
});

test('classifyGrammarPoint prefers the most specific keyword', () => {
  // 「仮定法」だけの語より長い一致が優先される
  assert.equal(classifyGrammarPoint('仮定法過去完了の書き換え'), 'subjunctive-past-perfect');
  assert.equal(classifyGrammarPoint('仮定法過去'), 'subjunctive-past');
  assert.equal(classifyGrammarPoint('仮定法'), 'subjunctive-past');
  // 「強調」より「比較級」が長いので比較側に寄る
  assert.equal(classifyGrammarPoint('比較級の強調'), 'comparison-comparative');
});

test('classifyGrammarPoint tolerates ChatGPT-style tag variations', () => {
  assert.equal(classifyGrammarPoint('関係代名詞 whose'), 'relative-pronoun');
  assert.equal(classifyGrammarPoint('前置詞+関係代名詞'), 'relative-preposition');
  assert.equal(classifyGrammarPoint('否定語句頭の倒置'), 'inversion');
  assert.equal(classifyGrammarPoint('動名詞の慣用表現'), 'gerund-idiom');
  assert.equal(classifyGrammarPoint('助動詞 + have done'), 'modal-perfect');
});

test('classifyGrammarPoint returns null for unknown or empty tags', () => {
  assert.equal(classifyGrammarPoint(null), null);
  assert.equal(classifyGrammarPoint(''), null);
  assert.equal(classifyGrammarPoint('   '), null);
  assert.equal(classifyGrammarPoint('英検準1級の重要語'), null);
});

test('every taxonomy node label classifies back to itself or a descendant', () => {
  walkGrammarTaxonomy((node) => {
    const classified = classifyGrammarPoint(node.label);
    assert.ok(classified, `label not classified: ${node.label}`);
    // ラベルが子ノードの別名と重なる場合は子に寄るのが正しいので、部分木内なら合格
    const subtree = grammarNodeSubtreeIds(node.id);
    assert.ok(
      subtree.includes(classified as string),
      `${node.label} -> ${classified} is outside ${node.id}`,
    );
  });
});

test('taxonomy ids are url-safe slugs and resolvable', () => {
  walkGrammarTaxonomy((node) => {
    assert.match(node.id, /^[a-z][a-z0-9-]*$/, `bad id: ${node.id}`);
    assert.equal(findGrammarNode(node.id)?.id, node.id);
  });
});

test('grammarNodeSubtreeIds returns the node with all descendants', () => {
  const ids = grammarNodeSubtreeIds('subjunctive');
  assert.ok(ids.includes('subjunctive'));
  assert.ok(ids.includes('subjunctive-past-perfect'));
  assert.ok(!ids.includes('inversion'));
  assert.deepEqual(grammarNodeSubtreeIds('does-not-exist'), []);
});
