import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest, NextResponse } from 'next/server';

import { handleGrammarMapGet } from '@/app/api/grammar/map/route';
import { handleGrammarMapQuestionsGet } from '@/app/api/grammar/map/questions/route';
import { handleGrammarMapProgressPost } from '@/app/api/grammar/map/progress/route';
import type { requireProUser } from '@/lib/api/pro-auth';
import type { GrammarMapNode, GrammarMapSummary } from '@/lib/grammar/map';
import { publicQuestionsForSubUnit } from '@/lib/grammar/public-bank';

type ProgressRow = {
  question_id: string;
  mastered: boolean;
  last_answered_at?: string | null;
  correct_count?: number;
  wrong_count?: number;
};

type FakeState = {
  progress: ProgressRow[];
  /** 習得度テーブル未適用の環境を再現する */
  progressError?: string;
  upserted: Record<string, unknown>[];
};

// grammar_map_progress の読み書きだけを模したクライアント。
function buildFakeSupabase(state: FakeState) {
  return {
    from(table: string) {
      if (table !== 'grammar_map_progress') {
        throw new Error(`unexpected table: ${table}`);
      }
      const readResult = state.progressError
        ? { data: null, error: { message: state.progressError } }
        : { data: state.progress, error: null };

      const selectChain = {
        eq: () => selectChain,
        limit: async () => readResult,
        maybeSingle: async () => (state.progressError
          ? { data: null, error: { message: state.progressError } }
          : { data: state.progress[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(readResult).then(resolve),
      };

      return {
        select: () => selectChain,
        upsert: async (row: Record<string, unknown>) => {
          state.upserted.push(row);
          return { error: null };
        },
      };
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

function emptyState(): FakeState {
  return { progress: [], upserted: [] };
}

function getRequest(url: string) {
  return new NextRequest(url, { method: 'GET' });
}

function postRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
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
    buildDeps(emptyState(), { proFailure: proFailure() }),
  );
  assert.equal(response.status, 403);
});

test('grammar/map returns the public 26-unit tree and attribution', async () => {
  const response = await handleGrammarMapGet(getRequest('http://localhost/api/grammar/map'), buildDeps(emptyState()));
  assert.equal(response.status, 200);

  const payload = (await response.json()) as {
    success: boolean;
    summary: GrammarMapSummary;
    nodes: GrammarMapNode[];
    sources: { title: string; license: string; url: string }[];
  };

  assert.equal(payload.success, true);
  assert.equal(payload.nodes.length, 26);
  assert.equal(payload.summary.totalSubUnits, 76);
  assert.equal(payload.summary.targetQuestions, 1120);
  // CC BY は帰属表示が必須なので、必ずソースを返す
  assert.ok(payload.sources.length > 0);
  for (const source of payload.sources) {
    assert.ok(source.title.length > 0);
    assert.ok(source.license.length > 0);
    assert.ok(source.url.startsWith('https://'));
  }
});

test('grammar/map reflects the user progress on public questions', async () => {
  const questions = publicQuestionsForSubUnit('subjunctive-if');
  const state: FakeState = {
    progress: [
      { question_id: questions[0].id, mastered: true },
      { question_id: questions[1].id, mastered: false },
    ],
    upserted: [],
  };

  const response = await handleGrammarMapGet(getRequest('http://localhost/api/grammar/map'), buildDeps(state));
  const payload = (await response.json()) as { summary: GrammarMapSummary; nodes: GrammarMapNode[] };

  assert.equal(payload.summary.masteredQuestions, 1);
  assert.equal(payload.summary.attemptedQuestions, 2);
  const sub = findNode(payload.nodes, 'subjunctive-if');
  assert.equal(sub?.mastered, 1);
  assert.equal(sub?.status, 'learning');
});

test('grammar/map still renders when the progress table is unavailable', async () => {
  const state: FakeState = {
    progress: [],
    progressError: 'relation "grammar_map_progress" does not exist',
    upserted: [],
  };
  const response = await handleGrammarMapGet(getRequest('http://localhost/api/grammar/map'), buildDeps(state));
  assert.equal(response.status, 200);

  const payload = (await response.json()) as { summary: GrammarMapSummary; nodes: GrammarMapNode[] };
  assert.equal(payload.nodes.length, 26);
  assert.equal(payload.summary.masteredQuestions, 0);
});

test('grammar/map/questions serves public bank questions for a unit', async () => {
  const response = await handleGrammarMapQuestionsGet(
    getRequest('http://localhost/api/grammar/map/questions?nodeId=subjunctive'),
    buildDeps(emptyState()),
  );
  assert.equal(response.status, 200);

  const payload = (await response.json()) as {
    nodeLabel: string;
    totalMatched: number;
    questions: { id: string; nodeId: string; sentence: string; choices: string[] }[];
    sources: { title: string }[];
  };

  assert.equal(payload.nodeLabel, '仮定法');
  assert.ok(payload.totalMatched >= 6);
  assert.ok(payload.questions.every((q) => q.nodeId.startsWith('subjunctive')));
  assert.ok(payload.questions.every((q) => q.sentence.includes('___')));
  assert.ok(payload.questions.every((q) => q.choices.length === 4));
  assert.ok(payload.sources.length > 0);
});

test('grammar/map/questions puts mastered questions last', async () => {
  const questions = publicQuestionsForSubUnit('subjunctive-if');
  const state: FakeState = {
    progress: [{ question_id: questions[0].id, mastered: true, last_answered_at: '2026-07-01T00:00:00Z' }],
    upserted: [],
  };

  const response = await handleGrammarMapQuestionsGet(
    getRequest('http://localhost/api/grammar/map/questions?nodeId=subjunctive-if'),
    buildDeps(state),
  );
  const payload = (await response.json()) as { questions: { id: string }[] };
  assert.equal(payload.questions[payload.questions.length - 1].id, questions[0].id);
});

test('grammar/map/questions rejects unknown and malformed node ids', async () => {
  const unknown = await handleGrammarMapQuestionsGet(
    getRequest('http://localhost/api/grammar/map/questions?nodeId=not-a-node'),
    buildDeps(emptyState()),
  );
  assert.equal(unknown.status, 404);

  const malformed = await handleGrammarMapQuestionsGet(
    getRequest('http://localhost/api/grammar/map/questions?nodeId=%E4%BB%AE%E5%AE%9A%E6%B3%95'),
    buildDeps(emptyState()),
  );
  assert.equal(malformed.status, 400);
});

test('grammar/map/progress records a result against the bank node', async () => {
  const question = publicQuestionsForSubUnit('subjunctive-if')[0];
  const state = emptyState();

  const response = await handleGrammarMapProgressPost(
    postRequest('http://localhost/api/grammar/map/progress', { questionId: question.id, result: 'correct' }),
    buildDeps(state),
  );
  assert.equal(response.status, 200);
  assert.equal(state.upserted.length, 1);
  // node_id はクライアント指定ではなくバンクの定義から解決する
  assert.equal(state.upserted[0].node_id, question.nodeId);
  assert.equal(state.upserted[0].mastered, true);
  assert.equal(state.upserted[0].correct_count, 1);
});

test('grammar/map/progress refuses a question that is not in the public bank', async () => {
  const state = emptyState();
  const response = await handleGrammarMapProgressPost(
    postRequest('http://localhost/api/grammar/map/progress', { questionId: 'made-up-id', result: 'correct' }),
    buildDeps(state),
  );
  assert.equal(response.status, 404);
  assert.equal(state.upserted.length, 0);
});

test('grammar/map/progress rejects a malformed body with 400', async () => {
  const response = await handleGrammarMapProgressPost(
    postRequest('http://localhost/api/grammar/map/progress', { questionId: 'x' }),
    buildDeps(emptyState()),
  );
  assert.equal(response.status, 400);
});

test('grammar/map/progress rejects non-Pro users with 403', async () => {
  const state = emptyState();
  const response = await handleGrammarMapProgressPost(
    postRequest('http://localhost/api/grammar/map/progress', { questionId: 'x', result: 'correct' }),
    buildDeps(state, { proFailure: proFailure() }),
  );
  assert.equal(response.status, 403);
  assert.equal(state.upserted.length, 0);
});
