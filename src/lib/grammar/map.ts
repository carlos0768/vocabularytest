// 文法マップの集計。
// 「自分の語法問題 (grammar_questions)」と「習得度 (grammar_question_progress)」を
// 文法事項ツリー (taxonomy.ts) に流し込み、ノードごとの習得状況を組み立てる。
//
// DB非依存の純粋関数にしてあるので、API側は行を取ってきて渡すだけでよい。

import { classifyGrammarPoint } from './classify';
import {
  GRAMMAR_TAXONOMY,
  GRAMMAR_UNCATEGORIZED_ID,
  GRAMMAR_UNCATEGORIZED_LABEL,
  grammarNodeSubtreeIds,
  type GrammarTaxonomyNode,
} from './taxonomy';

export type GrammarMapQuestionInput = {
  id: string;
  grammarPoint: string | null;
};

export type GrammarMapProgressInput = {
  questionId: string;
  mastered: boolean;
};

/**
 * ノードの状態。
 * - empty: まだ問題が1問もない (これから作る領域)
 * - untouched: 問題はあるが未着手
 * - learning: 解いたが習得しきっていない
 * - mastered: 配下の問題をすべて習得済み
 */
export type GrammarMapStatus = 'empty' | 'untouched' | 'learning' | 'mastered';

export type GrammarMapNode = {
  id: string;
  label: string;
  labelEn: string;
  depth: number;
  /** 配下を含む問題数 */
  total: number;
  /** 配下を含む習得済み問題数 */
  mastered: number;
  /** 配下を含む「1回以上解いた」問題数 */
  attempted: number;
  /** mastered / total (%) */
  masteryPercent: number;
  status: GrammarMapStatus;
  /** 未分類ノードで、元タグの例を表示するために使う */
  samplePoints?: string[];
  children: GrammarMapNode[];
};

export type GrammarMapSummary = {
  totalQuestions: number;
  masteredQuestions: number;
  attemptedQuestions: number;
  masteryPercent: number;
  /** ツリーの葉のうち問題が1問以上あるもの */
  coveredLeaves: number;
  /** ツリーの葉のうちすべて習得済みのもの */
  masteredLeaves: number;
  /** ツリーの葉の総数 */
  totalLeaves: number;
  /** ツリーに当てはめられなかった問題数 */
  uncategorizedQuestions: number;
};

export type GrammarMap = {
  summary: GrammarMapSummary;
  nodes: GrammarMapNode[];
};

type Tally = { total: number; mastered: number; attempted: number };

const UNCATEGORIZED_SAMPLE_LIMIT = 6;

function emptyTally(): Tally {
  return { total: 0, mastered: 0, attempted: 0 };
}

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
 * 問題と習得度から文法マップを組み立てる。
 * 問題が0問のノードもツリーに残す (「まだ手をつけていない領域」を見せるのが目的のため)。
 */
export function buildGrammarMap(
  questions: GrammarMapQuestionInput[],
  progress: GrammarMapProgressInput[],
): GrammarMap {
  const masteredByQuestion = new Map<string, boolean>();
  for (const row of progress) {
    // 同じ問題の行が複数来た場合は「習得済み」を優先する
    masteredByQuestion.set(row.questionId, Boolean(row.mastered) || Boolean(masteredByQuestion.get(row.questionId)));
  }

  // ノードID -> 直接ぶら下がる問題の集計
  const directTallies = new Map<string, Tally>();
  const uncategorizedSamples = new Set<string>();
  let uncategorizedQuestions = 0;

  for (const question of questions) {
    const nodeId = classifyGrammarPoint(question.grammarPoint) ?? GRAMMAR_UNCATEGORIZED_ID;
    if (nodeId === GRAMMAR_UNCATEGORIZED_ID) {
      uncategorizedQuestions += 1;
      const raw = question.grammarPoint?.trim();
      if (raw && uncategorizedSamples.size < UNCATEGORIZED_SAMPLE_LIMIT) {
        uncategorizedSamples.add(raw);
      }
    }

    const tally = directTallies.get(nodeId) ?? emptyTally();
    tally.total += 1;
    const mastered = masteredByQuestion.get(question.id);
    if (mastered !== undefined) {
      tally.attempted += 1;
      if (mastered) tally.mastered += 1;
    }
    directTallies.set(nodeId, tally);
  }

  let totalLeaves = 0;
  let coveredLeaves = 0;
  let masteredLeaves = 0;

  const buildNode = (source: GrammarTaxonomyNode, depth: number): GrammarMapNode => {
    const children = (source.children ?? []).map((child) => buildNode(child, depth + 1));
    const direct = directTallies.get(source.id) ?? emptyTally();

    const rolled: Tally = children.reduce<Tally>(
      (acc, child) => ({
        total: acc.total + child.total,
        mastered: acc.mastered + child.mastered,
        attempted: acc.attempted + child.attempted,
      }),
      { ...direct },
    );

    if (children.length === 0) {
      totalLeaves += 1;
      if (rolled.total > 0) coveredLeaves += 1;
      if (rolled.total > 0 && rolled.mastered >= rolled.total) masteredLeaves += 1;
    }

    return {
      id: source.id,
      label: source.label,
      labelEn: source.labelEn,
      depth,
      total: rolled.total,
      mastered: rolled.mastered,
      attempted: rolled.attempted,
      masteryPercent: percent(rolled.mastered, rolled.total),
      status: resolveStatus(rolled),
      children,
    };
  };

  const nodes = GRAMMAR_TAXONOMY.map((category) => buildNode(category, 0));

  // 未分類は問題があるときだけ末尾に出す (普段はツリーを汚さない)
  const uncategorized = directTallies.get(GRAMMAR_UNCATEGORIZED_ID);
  if (uncategorized && uncategorized.total > 0) {
    nodes.push({
      id: GRAMMAR_UNCATEGORIZED_ID,
      label: GRAMMAR_UNCATEGORIZED_LABEL,
      labelEn: 'Uncategorized',
      depth: 0,
      total: uncategorized.total,
      mastered: uncategorized.mastered,
      attempted: uncategorized.attempted,
      masteryPercent: percent(uncategorized.mastered, uncategorized.total),
      status: resolveStatus(uncategorized),
      samplePoints: Array.from(uncategorizedSamples),
      children: [],
    });
  }

  const totalQuestions = questions.length;
  const masteredQuestions = questions.reduce(
    (count, question) => count + (masteredByQuestion.get(question.id) === true ? 1 : 0),
    0,
  );
  const attemptedQuestions = questions.reduce(
    (count, question) => count + (masteredByQuestion.has(question.id) ? 1 : 0),
    0,
  );

  return {
    summary: {
      totalQuestions,
      masteredQuestions,
      attemptedQuestions,
      masteryPercent: percent(masteredQuestions, totalQuestions),
      coveredLeaves,
      masteredLeaves,
      totalLeaves,
      uncategorizedQuestions,
    },
    nodes,
  };
}

/**
 * 指定ノード (カテゴリなら配下すべて) に属する問題だけを残す。
 * マップから「この文法項目だけ演習する」ときの絞り込みに使う。
 * 存在しないノードIDには何も一致させない (空配列)。
 */
export function filterQuestionsByGrammarNode<T extends { grammarPoint: string | null }>(
  rows: T[],
  nodeId: string,
): T[] {
  if (nodeId === GRAMMAR_UNCATEGORIZED_ID) {
    return rows.filter((row) => classifyGrammarPoint(row.grammarPoint) === null);
  }
  const subtree = new Set(grammarNodeSubtreeIds(nodeId));
  if (subtree.size === 0) return [];
  return rows.filter((row) => {
    const classified = classifyGrammarPoint(row.grammarPoint);
    return classified !== null && subtree.has(classified);
  });
}
