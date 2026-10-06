import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  matchJapaneseSense,
  parseParaphraseDataset,
  resolveParaphraseMaterial,
  toParaphrasePosHint,
  tokenizeJapaneseHint,
  type ParaphraseDataset,
} from './dataset';

const tiny: ParaphraseDataset = parseParaphraseDataset({
  version: 1,
  generatedAt: '2026-10-05',
  sources: [{ name: 'Open English WordNet', license: 'CC BY 4.0', url: 'https://example.test' }],
  vocab: ['drop', 'decline', 'wish', 'abuse', 'leaf', 'pioneer', 'weight', 'brain', 'poem', 'zone', 'deceive', 'fool', 'everyday', 'terrestrial', 'worldly', 'slip'],
  entries: {
    plummet: [
      ['v', [0, 1], [2, 3, 4, 5]],
      ['n', [6], [7, 8, 9]],
    ],
    'play a trick on': [['v', [10, 11], [2, 3, 4]]],
    broken: [['v', [0], [999, 2]]],
    mundane: [['a', [12, 13, 14], [2, 3, 4], [
      [['平凡', '日常的', '有りふれた'], [12]],
      [['この世の', '世俗的'], [13, 14]],
    ]]],
    // 「取り違える」の語義には言い換えが無い (answers が空)。「しくじる」の語義の slip だけが品詞全体の候補
    mistake: [['v', [15], [2, 3, 4], [
      [['取りちがえる', '間ちがう', 'かん違いする'], []],
    ]]],
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

test('日本語訳が辞書の語義に合えば、その語義だけの正解候補にする', () => {
  const matched = resolveParaphraseMaterial(tiny, 'mundane', null, ['1.平凡な 2.つまらない']);
  assert.deepEqual(matched?.answers, ['everyday']);
  assert.equal(matched?.senseMatched, true);
});

test('日本語訳が「言い換えの無い語義」に合えば材料無し (他の語義の言い換えを出さない)', () => {
  // mistake for = 〜と間違える は「取り違える」の語義。slip (しくじる) を出してはいけない
  assert.equal(resolveParaphraseMaterial(tiny, 'mistake for', 'v', ['〜と間違える']), null);
  // 訳が無ければ従来どおり品詞全体の候補
  assert.deepEqual(resolveParaphraseMaterial(tiny, 'mistake', 'v')?.answers, ['slip']);
  // 別の語義の訳なら、その語義が無くても品詞全体の候補に戻る
  assert.deepEqual(resolveParaphraseMaterial(tiny, 'mistake', 'v', ['しくじる'])?.answers, ['slip']);

  const other = resolveParaphraseMaterial(tiny, 'mundane', null, ['世俗的な']);
  assert.deepEqual(other?.answers, ['terrestrial', 'worldly']);

  // 合う語義が無ければ従来どおり全体の候補
  const none = resolveParaphraseMaterial(tiny, 'mundane', null, ['急落する']);
  assert.deepEqual(none?.answers, ['everyday', 'terrestrial', 'worldly']);
  assert.equal(none?.senseMatched, false);
  // 日本語訳を渡さなければ語義は選ばない
  assert.deepEqual(resolveParaphraseMaterial(tiny, 'mundane')?.answers, ['everyday', 'terrestrial', 'worldly']);
});

test('日本語訳は番号・区切りで刻み、2 文字以上の断片だけ残す', () => {
  assert.deepEqual(tokenizeJapaneseHint('1.平凡な 2.つまらない'), ['平凡な', 'つまらない']);
  assert.deepEqual(tokenizeJapaneseHint('汗をかく、発汗する'), ['汗をかく', '発汗する']);
  assert.deepEqual(tokenizeJapaneseHint('①急落する ②（価格が）下がる'), ['急落する', '価格が', '下がる']);
  assert.deepEqual(tokenizeJapaneseHint('木'), []);
});

test('語義の選択は訳語の一致数で決め、同点なら先の語義', () => {
  const senses = [
    { japanese: ['平凡', '日常的'], id: 'a' },
    { japanese: ['この世の', '世俗的'], id: 'b' },
    { japanese: ['平凡', '日常的', '有りふれた'], id: 'c' },
  ];
  assert.equal(matchJapaneseSense(senses, ['平凡な'])?.id, 'a');
  assert.equal(matchJapaneseSense(senses, ['有りふれた・平凡な・日常的な'])?.id, 'c');
  // 「汗をかく」は「汗する」に弱く合う (目的語が訳語の頭に立つ)。
  assert.equal(matchJapaneseSense([{ japanese: ['流れる'], id: 'x' }, { japanese: ['汗する', '発汗する'], id: 'y' }], ['汗をかく'])?.id, 'y');
  // 送り仮名・交ぜ書きの揺れ: 訳語の漢字がすべて含まれれば弱く合う (「間ちがう」「かん違いする」⊆「間違える」)
  assert.equal(matchJapaneseSense([{ japanese: ['しくじる'], id: 'x' }, { japanese: ['取りちがえる', '間ちがう', 'かん違いする'], id: 'y' }], ['〜と間違える'])?.id, 'y');
  // 漢字の無い訳語・1 文字の訳語は漢字では合わせない
  assert.equal(matchJapaneseSense([{ japanese: ['間'], id: 'x' }], ['間違える']), null);
  assert.equal(matchJapaneseSense(senses, ['世俗的'])?.id, 'b');
  assert.equal(matchJapaneseSense(senses, ['急落する']), null);
  assert.equal(matchJapaneseSense(senses, []), null);
});

test('形の崩れたデータは受け付けない', () => {
  assert.throws(() => parseParaphraseDataset(null));
  assert.throws(() => parseParaphraseDataset({ version: 1, vocab: 'x', entries: {} }));
  assert.throws(() => parseParaphraseDataset({ version: 1, vocab: [], entries: [] }));
});

test('コミット済みの dataset.json が読め、代表的な語の材料が入っている', () => {
  const raw = readFileSync(join(process.cwd(), 'src', 'lib', 'paraphrase', 'dataset.json'), 'utf8');
  const dataset = parseParaphraseDataset(JSON.parse(raw));
  assert.equal(dataset.version, 2);
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

  // 日本語訳で語義を選べる (mundane = 平凡な → everyday、「この世の」の terrestrial は出ない)
  const mundane = resolveParaphraseMaterial(dataset, 'mundane', 'a', ['1.平凡な 2.つまらない']);
  assert.ok(mundane?.senseMatched, 'mundane should match the 平凡 sense');
  assert.ok(mundane!.answers.includes('everyday'));
  assert.ok(!mundane!.answers.includes('terrestrial'));
  assert.ok(!mundane!.answers.includes('worldly'));
  // 下位語・上位語は言い換えにしない (perspire → sweat であって eliminate ではない)
  const perspire = resolveParaphraseMaterial(dataset, 'perspire', 'v', ['汗をかく']);
  assert.deepEqual(perspire?.answers, ['sweat']);
  assert.equal(resolveParaphraseMaterial(dataset, 'amphibian'), null);
  // 否定の接頭辞を取っただけの上位語は言い換えにしない (mistake / misidentify → identify、miscount → count)
  assert.equal(resolveParaphraseMaterial(dataset, 'mistake for', 'v', ['〜と間違える']), null);
  assert.ok(!resolveParaphraseMaterial(dataset, 'misidentify', 'v')?.answers.includes('identify'));
  assert.ok(!(resolveParaphraseMaterial(dataset, 'miscount', 'v')?.answers ?? []).includes('count'));
  assert.ok(!resolveParaphraseMaterial(dataset, 'abuse', 'n')?.answers.includes('use'));
});
