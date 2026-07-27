import assert from 'node:assert/strict';
import test from 'node:test';

import { buildGrammarMap, publicQuestionsForNode, type GrammarMapNode } from '@/lib/grammar/map';
import {
  PUBLIC_GRAMMAR_BANK,
  PUBLIC_BLANK_MARKER,
  publicBankSourceIds,
  publicQuestionsForSubUnit,
} from '@/lib/grammar/public-bank';
import { GRAMMAR_SOURCES, findGrammarSource } from '@/lib/grammar/sources';
import {
  GRAMMAR_TAXONOMY,
  GRAMMAR_TAXONOMY_TOTAL_TARGET,
  allGrammarSubUnits,
  findGrammarSubUnit,
  findGrammarUnit,
  grammarNodeSubUnitIds,
} from '@/lib/grammar/taxonomy';
import {
  buildGrammarMapLayout,
  grammarLabelPlacement,
  wrapGrammarLabel,
  GRAMMAR_HUB_ID,
} from '@/lib/grammar/layout';

function findNode(nodes: GrammarMapNode[], id: string): GrammarMapNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const hit = findNode(node.children, id);
    if (hit) return hit;
  }
  return null;
}

// ---- 分類体系 (公開データ) ----

test('taxonomy matches the published 26 units / 76 sub-units / 1120 target', () => {
  assert.equal(GRAMMAR_TAXONOMY.length, 26);
  assert.equal(allGrammarSubUnits().length, 76);
  assert.equal(GRAMMAR_TAXONOMY_TOTAL_TARGET, 1120);
});

test('taxonomy ids are url-safe and unique across units and sub-units', () => {
  const seen = new Set<string>();
  for (const unit of GRAMMAR_TAXONOMY) {
    assert.match(unit.id, /^[a-z][a-z0-9-]*$/, `bad unit id: ${unit.id}`);
    assert.ok(!seen.has(unit.id), `duplicate id: ${unit.id}`);
    seen.add(unit.id);
    assert.equal(findGrammarUnit(unit.id)?.id, unit.id);
    for (const sub of unit.children) {
      assert.match(sub.id, /^[a-z][a-z0-9-]*$/, `bad sub id: ${sub.id}`);
      assert.ok(!seen.has(sub.id), `duplicate id: ${sub.id}`);
      seen.add(sub.id);
      assert.equal(findGrammarSubUnit(sub.id)?.sub.id, sub.id);
    }
  }
});

test('grammarNodeSubUnitIds expands a unit and passes a sub-unit through', () => {
  assert.deepEqual(grammarNodeSubUnitIds('subjunctive'), [
    'subjunctive-if',
    'subjunctive-wish',
    'subjunctive-inversion',
  ]);
  assert.deepEqual(grammarNodeSubUnitIds('subjunctive-if'), ['subjunctive-if']);
  assert.deepEqual(grammarNodeSubUnitIds('nope'), []);
});

// ---- 公開問題バンク ----

test('every bank question is well formed and points at a real sub-unit', () => {
  assert.ok(PUBLIC_GRAMMAR_BANK.length > 0);
  for (const question of PUBLIC_GRAMMAR_BANK) {
    assert.ok(findGrammarSubUnit(question.nodeId), `unknown nodeId: ${question.nodeId}`);
    assert.ok(
      question.sentence.includes(PUBLIC_BLANK_MARKER),
      `missing blank marker: ${question.id}`,
    );
    assert.equal(question.choices.length, 4, `needs 4 choices: ${question.id}`);
    assert.equal(
      new Set(question.choices.map((choice) => choice.toLowerCase())).size,
      4,
      `choices must be distinct: ${question.id}`,
    );
    assert.ok(
      question.correctIndex >= 0 && question.correctIndex <= 3,
      `bad correctIndex: ${question.id}`,
    );
    assert.ok(question.choices.every((choice) => choice.trim().length > 0), `blank choice: ${question.id}`);
    assert.ok(question.explanation.trim().length > 0, `missing explanation: ${question.id}`);
    assert.ok(question.sentenceJa.trim().length > 0, `missing translation: ${question.id}`);
  }
});

test('every bank question cites a registered public source', () => {
  for (const question of PUBLIC_GRAMMAR_BANK) {
    const source = findGrammarSource(question.sourceId);
    assert.ok(source, `unknown sourceId: ${question.sourceId} (${question.id})`);
  }
});

test('only commercially reusable licenses are registered', () => {
  for (const source of GRAMMAR_SOURCES) {
    assert.ok(
      source.license === 'public-domain' || source.license === 'cc-by-4.0',
      `license not allowed for redistribution: ${source.id}`,
    );
    // CC BY は帰属表示が必須なので、表示に必要な情報が欠けていないこと
    assert.ok(source.attribution.trim().length > 0, `missing attribution: ${source.id}`);
    assert.ok(source.licenseUrl.startsWith('https://'), `missing license url: ${source.id}`);
    assert.ok(source.modifications.trim().length > 0, `missing modification note: ${source.id}`);
  }
});

test('bank source ids are all resolvable for attribution display', () => {
  for (const id of publicBankSourceIds()) {
    assert.ok(findGrammarSource(id), `unresolvable source: ${id}`);
  }
});

// ---- 集計 ----

test('buildGrammarMap keeps all 26 units even with no progress', () => {
  const map = buildGrammarMap([]);
  assert.equal(map.nodes.length, 26);
  assert.equal(map.summary.masteredQuestions, 0);
  assert.equal(map.summary.attemptedQuestions, 0);
  assert.equal(map.summary.totalSubUnits, 76);
  assert.equal(map.summary.targetQuestions, 1120);
  assert.equal(map.summary.totalQuestions, PUBLIC_GRAMMAR_BANK.length);

  // 問題が入っている小単元は untouched、まだ無いものは empty
  for (const unit of map.nodes) {
    for (const sub of unit.children) {
      assert.equal(sub.status, sub.total > 0 ? 'untouched' : 'empty');
    }
  }
});

test('buildGrammarMap rolls sub-unit progress up into its unit', () => {
  const ifQuestions = publicQuestionsForSubUnit('subjunctive-if');
  assert.ok(ifQuestions.length >= 2, 'fixture needs at least 2 questions');

  const map = buildGrammarMap([
    { questionId: ifQuestions[0].id, mastered: true },
    { questionId: ifQuestions[1].id, mastered: false },
  ]);

  const sub = findNode(map.nodes, 'subjunctive-if');
  assert.equal(sub?.attempted, 2);
  assert.equal(sub?.mastered, 1);
  assert.equal(sub?.status, 'learning');

  const unit = findNode(map.nodes, 'subjunctive');
  assert.equal(unit?.attempted, 2);
  assert.equal(unit?.mastered, 1);
  assert.equal(unit?.status, 'learning');
  // 大単元の合計は配下の小単元の合計
  assert.equal(
    unit?.total,
    unit?.children.reduce((sum, child) => sum + child.total, 0),
  );
});

test('buildGrammarMap marks a sub-unit mastered only when every question is mastered', () => {
  const questions = publicQuestionsForSubUnit('negation-partial');
  const map = buildGrammarMap(questions.map((question) => ({ questionId: question.id, mastered: true })));
  const sub = findNode(map.nodes, 'negation-partial');
  assert.equal(sub?.status, 'mastered');
  assert.equal(sub?.masteryPercent, 100);
  assert.equal(map.summary.masteredSubUnits >= 1, true);
});

test('buildGrammarMap ignores progress rows for unknown questions', () => {
  const map = buildGrammarMap([{ questionId: 'not-a-real-question', mastered: true }]);
  assert.equal(map.summary.masteredQuestions, 0);
  assert.equal(map.summary.attemptedQuestions, 0);
});

test('buildGrammarMap treats a duplicated progress row as mastered once', () => {
  const questions = publicQuestionsForSubUnit('subjunctive-wish');
  const map = buildGrammarMap([
    { questionId: questions[0].id, mastered: false },
    { questionId: questions[0].id, mastered: true },
  ]);
  const sub = findNode(map.nodes, 'subjunctive-wish');
  assert.equal(sub?.mastered, 1);
  assert.equal(sub?.attempted, 1);
});

test('publicQuestionsForNode collects a whole unit across its sub-units', () => {
  const unitQuestions = publicQuestionsForNode('subjunctive');
  const expected = ['subjunctive-if', 'subjunctive-wish', 'subjunctive-inversion']
    .flatMap((id) => publicQuestionsForSubUnit(id));
  assert.deepEqual(unitQuestions.map((q) => q.id), expected.map((q) => q.id));
  assert.deepEqual(publicQuestionsForNode('nope'), []);
});

// ---- レイアウト ----

test('layout places the hub, all units and all sub-units without duplicates', () => {
  const layout = buildGrammarMapLayout();
  const ids = layout.nodes.map((node) => node.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate node ids in layout');
  assert.equal(layout.nodes.filter((node) => node.kind === 'unit').length, 26);
  assert.equal(layout.nodes.filter((node) => node.kind === 'sub').length, 76);
  assert.equal(layout.nodes.filter((node) => node.kind === 'hub').length, 1);
  // 辺は hub->大単元 26本 + 大単元->小単元 76本
  assert.equal(layout.edges.length, 26 + 76);
});

test('layout keeps every node inside the viewBox', () => {
  const { nodes, viewBox } = buildGrammarMapLayout();
  for (const node of nodes) {
    assert.ok(node.x - node.r >= viewBox.minX, `${node.id} overflows left`);
    assert.ok(node.y - node.r >= viewBox.minY, `${node.id} overflows top`);
    assert.ok(node.x + node.r <= viewBox.minX + viewBox.width, `${node.id} overflows right`);
    assert.ok(node.y + node.r <= viewBox.minY + viewBox.height, `${node.id} overflows bottom`);
  }
});

test('layout sub-unit nodes do not overlap each other', () => {
  const subs = buildGrammarMapLayout().nodes.filter((node) => node.kind === 'sub');
  for (let i = 0; i < subs.length; i += 1) {
    for (let j = i + 1; j < subs.length; j += 1) {
      const distance = Math.hypot(subs[i].x - subs[j].x, subs[i].y - subs[j].y);
      assert.ok(
        distance >= subs[i].r + subs[j].r,
        `${subs[i].id} overlaps ${subs[j].id} (${distance.toFixed(1)}px)`,
      );
    }
  }
});

test('layout parents resolve to real nodes', () => {
  const layout = buildGrammarMapLayout();
  const ids = new Set(layout.nodes.map((node) => node.id));
  for (const node of layout.nodes) {
    if (node.kind === 'hub') {
      assert.equal(node.parentId, null);
      continue;
    }
    assert.ok(node.parentId && ids.has(node.parentId), `${node.id} has a dangling parent`);
  }
  assert.ok(ids.has(GRAMMAR_HUB_ID));
});

test('label placement pushes labels outward and keeps them upright', () => {
  const layout = buildGrammarMapLayout();
  for (const node of layout.nodes) {
    if (node.kind === 'hub') continue;
    const placement = grammarLabelPlacement(node);

    // ラベルはノードより外側 (中心から遠い側) に置かれる
    const nodeDistance = Math.hypot(node.x, node.y);
    const labelDistance = Math.hypot(placement.x, placement.y);
    assert.ok(labelDistance > nodeDistance, `${node.id} label is not pushed outward`);

    // 左半分は180度回して右揃えにするので、文字が上下逆さまにならない
    const normalized = ((placement.rotate % 360) + 360) % 360;
    assert.ok(
      normalized <= 90 || normalized >= 270,
      `${node.id} label would render upside down (${normalized}deg)`,
    );
    assert.equal(placement.anchor, Math.cos(node.angle) < 0 ? 'end' : 'start');
  }
});

test('wrapGrammarLabel wraps and truncates long Japanese labels', () => {
  assert.deepEqual(wrapGrammarLabel('仮定法', 4, 2), ['仮定法']);
  assert.deepEqual(wrapGrammarLabel('時や条件の現在形', 4, 2), ['時や条件', 'の現在形']);
  // 収まらない分は末尾を省略記号にする
  const wrapped = wrapGrammarLabel('時や条件の現在形・時制の一致', 4, 2);
  assert.equal(wrapped.length, 2);
  assert.ok(wrapped[1].endsWith('…'));
  assert.deepEqual(wrapGrammarLabel('any', 0, 2), []);
});
