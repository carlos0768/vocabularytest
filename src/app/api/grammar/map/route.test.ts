import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest, NextResponse } from 'next/server';

import { handleGrammarMapGet } from '@/app/api/grammar/map/route';
import { handleGrammarMapQuestionsGet } from '@/app/api/grammar/map/questions/route';
import type { requireProUser } from '@/lib/api/pro-auth';
import type { GrammarMapNode, GrammarMapSummary } from '@/lib/grammar/map';

type QuestionRow = {
  id: string;
  book_id?: string;
  grammar_point: string | null;
  sentence?: string;
  choices?: string[];
  correct_index?: number;
  explanation?: string;
  sentence_ja?: string | null;
  show_translation?: boolean;
};

type ProgressRow = { question_id: string; mastered: boolean; last_answered_at?: string | null };

type FakeState = {
  questions: QuestionRow[];
  progress: ProgressRow[];
  /** 習得度テーブル未適用の環境を再現する */
  progressError?: string;
  questionsError?: string;
};

// grammar_questions / grammar_question_progress の読み取りだけを模したクライアント。
// どちらのルートも .select().eq().limit() / .select().eq() の形で呼ぶ。
function buildFakeSupabase(state: FakeState) {
  return {
    from(table: string) {
      if (table === 'grammar_questions') {
        const result = state.questionsError
          ? { data: null, error: { message: state.questionsError } }
          : { data: state.questions, error: null };
        const chain = {
          eq: () => chain,
          order: () => chain,
          limit: async () => result,
          then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
        };
        return { select: () => chain };
      }
      if (table === 'grammar_question_progress') {
        const result = state.progressError
          ? { data: null, error: { message: state.progressError } }
          : { data: state.progress, error: null };
        const chain = {
          eq: () => chain,
          limit: async () => result,
          then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
        };
        return { select: () => chain };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

function buildDeps(state: FakeState, options?: { proFailure?: NextResponse }) {
  const requirePro = (async () => {
    if (options?.proFailure) {
      return { ok: false as const, response: options.proFailure };
    }
    return { ok: true as const, supabase: buildFakeSupabase(state), user: { id: 'user-1' } };
  }) as unknown as typeof requireProUser;
  return { requirePro };
}

function getRequest(url: string) {
  return new NextRequest(url, { method: 'GET' });
}

function proFailure() {
  return NextResponse.json({ success: false, error: 'この機能はPro限定です。', code: 'PRO_REQUIRED' }, { status: 403 });
}

function findNode(nodes: GrammarMapNode[], id: string): GrammarMapNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const hit = findNode(node.children, id);
    if (hit) return hit;
  }
  return null;
}

test('grammar/map rejects non-Pro users with 403', async () => {
  const response = await handleGrammarMapGet(
    getRequest('http://localhost/api/grammar/map'),
    buildDeps({ questions: [], progress: [] }, { proFailure: proFailure() }),
  );
  assert.equal(response.status, 403);
});

test('grammar/map returns the tree with rolled-up mastery', async () => {
  const state: FakeState = {
    questions: [
      { id: 'q1', grammar_point: '仮定法過去' },
      { id: 'q2', grammar_point: '仮定法過去完了' },
      { id: 'q3', grammar_point: '分詞構文' },
    ],
    progress: [
      { question_id: 'q1', mastered: true },
      { question_id: 'q2', mastered: false },
    ],
  };

  const response = await handleGrammarMapGet(getRequest('http://localhost/api/grammar/map'), buildDeps(state));
  assert.equal(response.status, 200);

  const payload = (await response.json()) as {
    success: boolean;
    summary: GrammarMapSummary;
    nodes: GrammarMapNode[];
  };

  assert.equal(payload.success, true);
  assert.equal(payload.summary.totalQuestions, 3);
  assert.equal(payload.summary.masteredQuestions, 1);

  const subjunctive = findNode(payload.nodes, 'subjunctive');
  assert.equal(subjunctive?.total, 2);
  assert.equal(subjunctive?.mastered, 1);
  assert.equal(subjunctive?.status, 'learning');

  // 問題が無いカテゴリも「未着手の領域」として残る
  const comparison = findNode(payload.nodes, 'comparison');
  assert.equal(comparison?.total, 0);
  assert.equal(comparison?.status, 'empty');
});

test('grammar/map still renders when the progress table is unavailable', async () => {
  const state: FakeState = {
    questions: [{ id: 'q1', grammar_point: '倒置' }],
    progress: [],
    progressError: 'relation "grammar_question_progress" does not exist',
  };

  const response = await handleGrammarMapGet(getRequest('http://localhost/api/grammar/map'), buildDeps(state));
  assert.equal(response.status, 200);

  const payload = (await response.json()) as { summary: GrammarMapSummary; nodes: GrammarMapNode[] };
  assert.equal(payload.summary.totalQuestions, 1);
  assert.equal(payload.summary.masteredQuestions, 0);
  assert.equal(findNode(payload.nodes, 'inversion')?.status, 'untouched');
});

test('grammar/map returns 500 when questions cannot be read', async () => {
  const response = await handleGrammarMapGet(
    getRequest('http://localhost/api/grammar/map'),
    buildDeps({ questions: [], progress: [], questionsError: 'boom' }),
  );
  assert.equal(response.status, 500);
});

const QUESTION_ROWS: QuestionRow[] = [
  {
    id: 'q1',
    book_id: 'book-1',
    sentence: 'If I ___ rich, I would travel.',
    choices: ['were', 'am', 'be', 'been'],
    correct_index: 0,
    explanation: '仮定法過去',
    grammar_point: '仮定法過去',
    sentence_ja: null,
    show_translation: false,
  },
  {
    id: 'q2',
    book_id: 'book-2',
    sentence: 'Had I ___ it, I would have told you.',
    choices: ['known', 'know', 'knew', 'knowing'],
    correct_index: 0,
    explanation: '仮定法過去完了',
    grammar_point: '仮定法過去完了',
    sentence_ja: null,
    show_translation: false,
  },
  {
    id: 'q3',
    book_id: 'book-1',
    sentence: '___ down the street, I saw him.',
    choices: ['Walking', 'Walk', 'Walked', 'To walk'],
    correct_index: 0,
    explanation: '分詞構文',
    grammar_point: '分詞構文',
    sentence_ja: null,
    show_translation: false,
  },
  {
    id: 'q4',
    book_id: 'book-3',
    sentence: 'He ___ the meeting.',
    choices: ['attended', 'attend', 'attends', 'attending'],
    correct_index: 0,
    explanation: 'その他',
    grammar_point: 'ビジネス英語',
    sentence_ja: null,
    show_translation: false,
  },
];

test('grammar/map/questions returns every question under a category across books', async () => {
  const state: FakeState = { questions: QUESTION_ROWS, progress: [] };
  const response = await handleGrammarMapQuestionsGet(
    getRequest('http://localhost/api/grammar/map/questions?nodeId=subjunctive'),
    buildDeps(state),
  );
  assert.equal(response.status, 200);

  const payload = (await response.json()) as {
    nodeId: string;
    nodeLabel: string;
    totalMatched: number;
    questions: { id: string; bookId: string }[];
  };

  assert.equal(payload.nodeId, 'subjunctive');
  assert.equal(payload.nodeLabel, '仮定法');
  assert.equal(payload.totalMatched, 2);
  assert.deepEqual(payload.questions.map((q) => q.id), ['q1', 'q2']);
  // 習得度の記録に使うので所属問題集IDが必要
  assert.deepEqual(payload.questions.map((q) => q.bookId), ['book-1', 'book-2']);
});

test('grammar/map/questions puts mastered questions last', async () => {
  const state: FakeState = {
    questions: QUESTION_ROWS,
    progress: [{ question_id: 'q1', mastered: true, last_answered_at: '2026-07-01T00:00:00Z' }],
  };
  const response = await handleGrammarMapQuestionsGet(
    getRequest('http://localhost/api/grammar/map/questions?nodeId=subjunctive'),
    buildDeps(state),
  );

  const payload = (await response.json()) as { questions: { id: string }[] };
  assert.deepEqual(payload.questions.map((q) => q.id), ['q2', 'q1']);
});

test('grammar/map/questions serves the uncategorized bucket', async () => {
  const response = await handleGrammarMapQuestionsGet(
    getRequest('http://localhost/api/grammar/map/questions?nodeId=uncategorized'),
    buildDeps({ questions: QUESTION_ROWS, progress: [] }),
  );
  const payload = (await response.json()) as { nodeLabel: string; questions: { id: string }[] };
  assert.equal(payload.nodeLabel, '未分類');
  assert.deepEqual(payload.questions.map((q) => q.id), ['q4']);
});

test('grammar/map/questions rejects unknown and malformed node ids', async () => {
  const unknown = await handleGrammarMapQuestionsGet(
    getRequest('http://localhost/api/grammar/map/questions?nodeId=not-a-node'),
    buildDeps({ questions: QUESTION_ROWS, progress: [] }),
  );
  assert.equal(unknown.status, 404);

  const malformed = await handleGrammarMapQuestionsGet(
    getRequest('http://localhost/api/grammar/map/questions?nodeId=%E4%BB%AE%E5%AE%9A%E6%B3%95'),
    buildDeps({ questions: QUESTION_ROWS, progress: [] }),
  );
  assert.equal(malformed.status, 400);
});

test('grammar/map/questions rejects non-Pro users with 403', async () => {
  const response = await handleGrammarMapQuestionsGet(
    getRequest('http://localhost/api/grammar/map/questions?nodeId=subjunctive'),
    buildDeps({ questions: [], progress: [] }, { proFailure: proFailure() }),
  );
  assert.equal(response.status, 403);
});
