import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMorphologyPrompt,
  generateMorphology,
  toWordMorphology,
  type MorphologySeedWord,
} from './generate';
import type { AffixSense } from './affix-catalog';

const UN_NOT: AffixSense = {
  id: 'un-not', form: 'un', kind: 'prefix', meaningJa: '否定', examples: ['unhappy'],
};
const UNI_ONE: AffixSense = {
  id: 'uni-one', form: 'uni', kind: 'prefix', meaningJa: '1つ', examples: ['uniform'],
};
const OUS_ADJ: AffixSense = {
  id: 'ous-adj', form: 'ous', kind: 'suffix', meaningJa: '形容詞化', examples: ['famous'],
};

const CANDIDATES = [UN_NOT, UNI_ONE, OUS_ADJ];

test('toWordMorphology accepts a valid response and keeps candidate affix ids', () => {
  const morphology = toWordMorphology({
    hasMorphology: true,
    parts: [
      { text: 'un', kind: 'prefix', meaningJa: '1つ', affixId: 'uni-one' },
      { text: 'anim', kind: 'root', meaningJa: '心' },
      { text: 'ous', kind: 'suffix', meaningJa: '形容詞化', affixId: 'ous-adj' },
    ],
    explanation: '「心が1つ」が原義。満場一致の。',
  }, CANDIDATES);

  assert.ok(morphology);
  assert.equal(morphology.version, 1);
  assert.equal(morphology.formula.length, 3);
  assert.equal(morphology.formula[0]!.affixId, 'uni-one');
  assert.equal(morphology.formula[1]!.affixId, undefined);
});

test('toWordMorphology rejects affix ids that were not sent as candidates', () => {
  assert.throws(() => toWordMorphology({
    hasMorphology: true,
    parts: [
      { text: 'pre', kind: 'prefix', meaningJa: '前', affixId: 'pre-before' },
      { text: 'dict', kind: 'root', meaningJa: '言う' },
    ],
    explanation: '前もって言う。',
  }, CANDIDATES));
});

test('toWordMorphology returns null for hasMorphology=false', () => {
  assert.equal(toWordMorphology({ hasMorphology: false }, CANDIDATES), null);
});

test('toWordMorphology returns null when the whole word comes back as one root', () => {
  // 分解になっていない回答（単語をそのまま root にしただけ）は捨てる
  assert.equal(toWordMorphology({
    hasMorphology: true,
    parts: [{ text: 'cat', kind: 'root', meaningJa: '猫' }],
    explanation: '単一語根。',
  }, CANDIDATES), null);
});

test('toWordMorphology accepts a root-only breakdown (compound / Latin roots)', () => {
  // 接辞が1つも無い複合語も語源解析の対象（解析世代2で広げた範囲）
  const morphology = toWordMorphology({
    hasMorphology: true,
    parts: [
      { text: 'break', kind: 'root', meaningJa: '破る' },
      { text: 'fast', kind: 'root', meaningJa: '断食' },
    ],
    explanation: '断食（fast）を破る食事が原義。',
  }, []);

  assert.ok(morphology);
  assert.equal(morphology.formula.length, 2);
  assert.equal(morphology.formula[0]!.affixId, undefined);
});

test('toWordMorphology clamps the explanation to 2 lines', () => {
  const morphology = toWordMorphology({
    hasMorphology: true,
    parts: [
      { text: 'un', kind: 'prefix', meaningJa: '否定', affixId: 'un-not' },
      { text: 'happy', kind: 'root', meaningJa: '幸せな' },
    ],
    explanation: '1行目\n2行目\n3行目は捨てる\n4行目も捨てる',
  }, CANDIDATES);

  assert.ok(morphology);
  assert.equal(morphology.explanation, '1行目\n2行目');
});

test('buildMorphologyPrompt marks an empty candidate list instead of sending a blank section', () => {
  const prompt = buildMorphologyPrompt({ english: 'breakfast', candidates: [] });
  assert.ok(prompt.includes('"breakfast"'));
  assert.ok(prompt.includes('接辞候補リスト: なし'));
});

test('buildMorphologyPrompt sends only compact candidate lines (token efficiency)', () => {
  const prompt = buildMorphologyPrompt({ english: 'unanimous', candidates: CANDIDATES });
  assert.ok(prompt.includes('un-not|un|prefix|否定'));
  assert.ok(prompt.includes('uni-one|uni|prefix|1つ'));
  assert.ok(prompt.includes('"unanimous"'));
  // 例やニュアンスなどの重い情報は候補行に含めない
  assert.ok(!prompt.includes('unhappy'));
});

test('generateMorphology retries failed words once and reports terminal errors', async () => {
  const attempts = new Map<string, number>();
  const fakeGenerateSingle = async (word: MorphologySeedWord) => {
    const count = (attempts.get(word.english) ?? 0) + 1;
    attempts.set(word.english, count);
    if (word.english === 'flaky' && count === 1) {
      throw new Error('temporary failure');
    }
    if (word.english === 'broken') {
      throw new Error('permanent failure');
    }
    return { english: word.english, morphology: null };
  };

  const result = await generateMorphology(
    [
      { english: 'flaky', candidates: CANDIDATES },
      { english: 'broken', candidates: CANDIDATES },
    ],
    {},
    { generateSingle: fakeGenerateSingle },
  );

  assert.equal(result.results.length, 1);
  assert.equal(result.results[0]!.english, 'flaky');
  assert.equal(attempts.get('flaky'), 2);
  assert.equal(attempts.get('broken'), 2);
  assert.equal(result.errors.length, 1);
  assert.ok(result.errors[0]!.includes('broken'));
});
