import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest, NextResponse } from 'next/server';

import { handleChatGptWordsPost } from '@/app/api/chatgpt/words/route';
import type { requireProUser } from '@/lib/api/pro-auth';

const PROJECT_ID = '0dd8f4d8-22cf-4010-b6e7-99485683023c';

function jsonRequest(body: unknown) {
  return new NextRequest('http://localhost/api/chatgpt/words', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

type FakeState = {
  ownedProjectIds: string[];
  insertedRows: Record<string, unknown>[][];
  insertError?: { message: string } | null;
};

function buildFakeSupabase(state: FakeState) {
  return {
    from(table: string) {
      if (table === 'projects') {
        return {
          select: () => ({
            in: () => ({
              eq: async () => ({
                data: state.ownedProjectIds.map((id) => ({ id })),
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'words') {
        return {
          insert: (rows: Record<string, unknown>[]) => ({
            select: async () => {
              state.insertedRows.push(rows);
              if (state.insertError) {
                return { data: null, error: state.insertError };
              }
              return {
                data: rows.map((row, index) => ({
                  id: `word-${index}`,
                  project_id: row.project_id,
                  english: row.english,
                  japanese: row.japanese,
                })),
                error: null,
              };
            },
          }),
        };
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
    return {
      ok: true as const,
      supabase: buildFakeSupabase(state),
      user: { id: 'user-1' },
    };
  }) as unknown as typeof requireProUser;

  return { requirePro };
}

test('chatgpt/words returns the pro-gate response when the user is not Pro', async () => {
  const state: FakeState = { ownedProjectIds: [], insertedRows: [] };
  const response = await handleChatGptWordsPost(
    jsonRequest({ words: [{ projectId: PROJECT_ID, english: 'run', japanese: '走る' }] }),
    buildDeps(state, {
      proFailure: NextResponse.json({ success: false, error: 'この機能はPro限定です。' }, { status: 403 }),
    }),
  );
  assert.equal(response.status, 403);
  assert.equal(state.insertedRows.length, 0);
});

test('chatgpt/words returns 400 when japanese is missing', async () => {
  const state: FakeState = { ownedProjectIds: [PROJECT_ID], insertedRows: [] };
  const response = await handleChatGptWordsPost(
    jsonRequest({ words: [{ projectId: PROJECT_ID, english: 'run' }] }),
    buildDeps(state),
  );
  assert.equal(response.status, 400);
  assert.equal(state.insertedRows.length, 0);
});

test('chatgpt/words returns 403 for a project the user does not own', async () => {
  const state: FakeState = { ownedProjectIds: [], insertedRows: [] };
  const response = await handleChatGptWordsPost(
    jsonRequest({ words: [{ projectId: PROJECT_ID, english: 'run', japanese: '走る' }] }),
    buildDeps(state),
  );
  assert.equal(response.status, 403);
  assert.equal(state.insertedRows.length, 0);
});

test('chatgpt/words inserts fully-formed rows without any lexicon/AI fields', async () => {
  const state: FakeState = { ownedProjectIds: [PROJECT_ID], insertedRows: [] };
  const response = await handleChatGptWordsPost(
    jsonRequest({
      words: [
        {
          projectId: PROJECT_ID,
          english: 'resilient',
          japanese: '回復力のある',
          exampleSentence: 'She stayed resilient under pressure.',
          exampleSentenceJa: '彼女はプレッシャーの中でも回復力を保った。',
          pronunciation: 'rɪˈzɪliənt',
          partOfSpeechTags: ['adjective'],
          distractors: ['頑固な', '無関心な', '疲弊した'],
        },
      ],
    }),
    buildDeps(state),
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.success, true);
  assert.equal(payload.addedCount, 1);
  assert.equal(payload.words[0].english, 'resilient');
  assert.equal(payload.words[0].projectId, PROJECT_ID);

  assert.equal(state.insertedRows.length, 1);
  const row = state.insertedRows[0][0];
  assert.equal(row.project_id, PROJECT_ID);
  assert.equal(row.japanese, '回復力のある');
  assert.deepEqual(row.distractors, ['頑固な', '無関心な', '疲弊した']);
  assert.equal(row.status, 'new');
  // lexicon 解決・AI バックフィル関連のフィールドは一切セットしない
  assert.equal('lexicon_entry_id' in row, false);
  assert.equal('lexicon_sense_id' in row, false);
  assert.equal('japanese_source' in row, false);
  assert.equal('word_order_quiz' in row, false);
  assert.equal('morphology' in row, false);
});

test('chatgpt/words returns 500 when the insert fails', async () => {
  const state: FakeState = {
    ownedProjectIds: [PROJECT_ID],
    insertedRows: [],
    insertError: { message: 'insert failed' },
  };
  const response = await handleChatGptWordsPost(
    jsonRequest({ words: [{ projectId: PROJECT_ID, english: 'run', japanese: '走る' }] }),
    buildDeps(state),
  );
  assert.equal(response.status, 500);
});
