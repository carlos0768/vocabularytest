// 文法マップの集計。
//
// マップの土台は公開データだけで構成される:
//   - ノード構成 = taxonomy.ts の26大単元・76小単元 (公開資料にもとづく固定の体系)
//   - 問題        = public-bank/ の公開ソース由来の問題
// ユーザーが自分で作った語法問題集 (grammar_questions) は、この集計に一切入れない。
// ユーザー由来のデータは「公開問題をどこまで解いたか」という進捗だけである。

import { PUBLIC_GRAMMAR_BANK, publicQuestionsForSubUnit } from './public-bank';
import {
  GRAMMAR_TAXONOMY,
  grammarNodeSubUnitIds,
  type GrammarSubUnit,
  type GrammarUnit,
} from './taxonomy';

export type GrammarMapProgressInput = {
  questionId: string;
  mastered: boolean;
};

/**
 * ノードの状態。
 * - empty: バンクにまだ問題がない (体系上は存在する領域)
 * - untouched: 問題はあるが未着手
 * - learning: 解いたが習得しきっていない
 * - mastered: 配下の問題をすべて習得済み
 */
export type GrammarMapStatus = 'empty' | 'untouched' | 'learning' | 'mastered';

export type GrammarMapNode = {
  id: string;
  label: string;
  labelEn: string;
  kind: 'unit' | 'sub';
  /** 配下を含む収録問題数 */
  total: number;
  mastered: number;
  attempted: number;
  masteryPercent: number;
  status: GrammarMapStatus;
  /** 体系上の目標問数 (公開分析にもとづく設計値) */
  targetQuestions: number;
  /** 大単元のみ: 学年と入試重要度 */
  grade?: GrammarUnit['grade'];
  exam?: GrammarUnit['exam'];
  /** 小単元のみ: 代表的な grammar point */
  points?: string;
  children: GrammarMapNode[];
};

export type GrammarMapSummary = {
  totalQuestions: number;
  masteredQuestions: number;
  attemptedQuestions: number;
  masteryPercent: number;
  /** 問題が1問以上ある小単元の数 */
  coveredSubUnits: number;
  /** すべて習得済みの小単元の数 */
  masteredSubUnits: number;
  /** 小単元の総数 (76) */
  totalSubUnits: number;
  /** 体系上の目標問数の合計 (1120) */
  targetQuestions: number;
};

export type GrammarMap = {
  summary: GrammarMapSummary;
  nodes: GrammarMapNode[];
};

type Tally = { total: number; mastered: number; attempted: number };

function resolveStatus(tally: Tally): GrammarMapStatus {
  if (tally.total === 0) return 'empty';
  if (tally.attempted === 0) return 'untouched';
  if (tally.mastered >= tally.total) return 'mastered';
  return 'learning';
}

function percent(mastered: number, total: number): number {
  return total > 0 ? Math.round((mastered / total) * 100) : 0;
}

/**
 * 公開問題バンクとユーザーの進捗から文法マップを組み立てる。
 * 問題が0問の小単元もツリーに残す (体系全体を見せるのがマップの目的のため)。
 */
export function buildGrammarMap(progress: GrammarMapProgressInput[]): GrammarMap {
  const masteredByQuestion = new Map<string, boolean>();
  for (const row of progress) {
    // 同じ問題の行が複数来た場合は「習得済み」を優先する
    masteredByQuestion.set(
      row.questionId,
      Boolean(row.mastered) || Boolean(masteredByQuestion.get(row.questionId)),
    );
  }

  const tallyForSubUnit = (sub: GrammarSubUnit): Tally => {
    const questions = publicQuestionsForSubUnit(sub.id);
    let mastered = 0;
    let attempted = 0;
    for (const question of questions) {
      const state = masteredByQuestion.get(question.id);
      if (state === undefined) continue;
      attempted += 1;
      if (state) mastered += 1;
    }
    return { total: questions.length, mastered, attempted };
  };

  let coveredSubUnits = 0;
  let masteredSubUnits = 0;
  let totalSubUnits = 0;

  const nodes: GrammarMapNode[] = GRAMMAR_TAXONOMY.map((unit) => {
    const children: GrammarMapNode[] = unit.children.map((sub) => {
      const tally = tallyForSubUnit(sub);
      totalSubUnits += 1;
      if (tally.total > 0) coveredSubUnits += 1;
      if (tally.total > 0 && tally.mastered >= tally.total) masteredSubUnits += 1;

      return {
        id: sub.id,
        label: sub.label,
        labelEn: sub.labelEn,
        kind: 'sub' as const,
        total: tally.total,
        mastered: tally.mastered,
        attempted: tally.attempted,
        masteryPercent: percent(tally.mastered, tally.total),
        status: resolveStatus(tally),
        targetQuestions: sub.targetQuestions,
        points: sub.points,
        children: [],
      };
    });

    const rolled = children.reduce<Tally>(
      (acc, child) => ({
        total: acc.total + child.total,
        mastered: acc.mastered + child.mastered,
        attempted: acc.attempted + child.attempted,
      }),
      { total: 0, mastered: 0, attempted: 0 },
    );

    return {
      id: unit.id,
      label: unit.label,
      labelEn: unit.labelEn,
      kind: 'unit' as const,
      total: rolled.total,
      mastered: rolled.mastered,
      attempted: rolled.attempted,
      masteryPercent: percent(rolled.mastered, rolled.total),
      status: resolveStatus(rolled),
      targetQuestions: children.reduce((sum, child) => sum + child.targetQuestions, 0),
      grade: unit.grade,
      exam: unit.exam,
      children,
    };
  });

  const totalQuestions = PUBLIC_GRAMMAR_BANK.length;
  let masteredQuestions = 0;
  let attemptedQuestions = 0;
  for (const question of PUBLIC_GRAMMAR_BANK) {
    const state = masteredByQuestion.get(question.id);
    if (state === undefined) continue;
    attemptedQuestions += 1;
    if (state) masteredQuestions += 1;
  }

  return {
    summary: {
      totalQuestions,
      masteredQuestions,
      attemptedQuestions,
      masteryPercent: percent(masteredQuestions, totalQuestions),
      coveredSubUnits,
      masteredSubUnits,
      totalSubUnits,
      targetQuestions: nodes.reduce((sum, node) => sum + node.targetQuestions, 0),
    },
    nodes,
  };
}

/**
 * 指定ノード (大単元なら配下の小単元すべて) に属する公開問題を返す。
 * 存在しないノードIDには空配列を返す。
 */
export function publicQuestionsForNode(nodeId: string) {
  const subUnitIds = grammarNodeSubUnitIds(nodeId);
  return subUnitIds.flatMap((id) => publicQuestionsForSubUnit(id));
}
