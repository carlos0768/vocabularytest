import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  parseParaphraseDataset,
  resolveParaphraseMaterial,
  toParaphrasePosHint,
  type ParaphraseDataset,
} from './dataset';

const tiny: ParaphraseDataset = parseParaphraseDataset({
  version: 1,
  generatedAt: '2026-10-05',
  sources: [{ name: 'Open English WordNet', license: 'CC BY 4.0', url: 'https://example.test' }],
  vocab: ['drop', 'decline', 'wish', 'abuse', 'leaf', 'pioneer', 'weight', 'brain', 'poem', 'zone', 'deceive', 'fool'],
  entries: {
    plummet: [
      ['v', [0, 1], [2, 3, 4, 5]],
      ['n', [6], [7, 8, 9]],
    ],
    'play a trick on': [['v', [10, 11], [2, 3, 4]]],
    broken: [['v', [0], [999, 2]]],
  },
});

test('見出し語を正規化して引き、添字を語に戻す', () => {
  const material = resolveParaphraseMaterial(tiny, ' Plummet ');
  assert.ok(material);
  assert.equal(material.pos, 'v');
  assert.deepEqual(material.answers, ['drop', 'decline']);
  assert.deepEqual(material.distractors, ['wish', 'abuse', 'leaf', 'pioneer']);
});

test('品詞のヒントが合えばその品詞、無ければ主な品詞 (先頭)', () => {
  assert.equal(resolveParaphraseMaterial(tiny, 'plummet', 'n')?.pos, 'n');
  assert.equal(resolveParaphraseMaterial(tiny, 'plummet', 'a')?.pos, 'v');
  assert.equal(resolveParaphraseMaterial(tiny, 'plummet', null)?.pos, 'v');
});

test('プレースホルダ付きの句も当たる', () => {
  const material = resolveParaphraseMaterial(tiny, 'play a trick on sb');
  assert.deepEqual(material?.answers, ['deceive', 'fool']);
});

test('辞書に無い語・壊れた添字で誤答が 3 つに満たない語は null', () => {
  assert.equal(resolveParaphraseMaterial(tiny, 'xyzzy'), null);
  assert.equal(resolveParaphraseMaterial(tiny, 'broken'), null);
  assert.equal(resolveParaphraseMaterial(tiny, 'いとをかし'), null);
});

test('品詞タグは英語名でも日本語名でも推せる', () => {
  assert.equal(toParaphrasePosHint(['noun']), 'n');
  assert.equal(toParaphrasePosHint(['句動詞']), 'v');
  assert.equal(toParaphrasePosHint(['形容詞', 'noun']), 'a');
  assert.equal(toParaphrasePosHint(['idiom']), null);
  assert.equal(toParaphrasePosHint(undefined), null);
});

test('形の崩れたデータは受け付けない', () => {
  assert.throws(() => parseParaphraseDataset(null));
  assert.throws(() => parseParaphraseDataset({ version: 1, vocab: 'x', entries: {} }));
  assert.throws(() => parseParaphraseDataset({ version: 1, vocab: [], entries: [] }));
});

test('コミット済みの dataset.json が読め、代表的な語の材料が入っている', () => {
  const raw = readFileSync(join(process.cwd(), 'src', 'lib', 'paraphrase', 'dataset.json'), 'utf8');
  const dataset = parseParaphraseDataset(JSON.parse(raw));
  assert.equal(dataset.version, 1);
  assert.ok(dataset.sources.some((source) => source.name.includes('WordNet')));
  assert.ok(Object.keys(dataset.entries).length > 20000, 'dataset should cover tens of thousands of headwords');

  for (const english of ['plummet', 'deceive', 'play a trick on', 'huge', 'postpone', 'give up']) {
    const material = resolveParaphraseMaterial(dataset, english);
    assert.ok(material, `no material for ${english}`);
    assert.ok(material.answers.length >= 1);
    assert.ok(material.distractors.length >= 3);
    const lowerAnswers = new Set(material.answers);
    assert.ok(material.distractors.every((distractor) => !lowerAnswers.has(distractor)), `distractor overlaps answer for ${english}`);
    assert.ok(!material.answers.includes(english), `headword is its own answer for ${english}`);
  }
  assert.ok(resolveParaphraseMaterial(dataset, 'plummet')!.answers.includes('drop'));
  assert.ok(resolveParaphraseMaterial(dataset, 'play a trick on')!.answers.includes('deceive'));
});
