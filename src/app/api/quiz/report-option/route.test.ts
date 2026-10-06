import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

import { handleQuizOptionReportPost } from './route';
import type { OptionReportJudgement } from '@/lib/quiz/option-report';

function jsonRequest(body: unknown, headers: Record<string, string> = { authorization: 'Bearer token-1' }) {
  return new NextRequest('http://localhost/api/quiz/report-option', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

type Row = Record<string, unknown>;

function createClient(options: {
  user?: { id: string } | null;
  word?: Row | null;
  translations?: Row[];
  usage?: Row;
} = {}) {
  const user = options.user === undefined ? { id: 'user-1' } : options.user;
  const updates: Array<{ table: string; payload: Row; id: string }> = [];
  const rpcCalls: string[] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    rpc: async (name: string) => {
      rpcCalls.push(name);
      return { data: options.usage ?? { allowed: true, requires_pro: false, current_count: 1, limit: 20, is_pro: false }, error: null };
    },
    from: (table: string) => ({
      select: () => ({
        eq: (_column: string, id: string) => {
          const rows = table === 'words'
            ? (options.word ? [options.word] : [])
            : table === 'word_translations' ? (options.translations ?? []) : [];
          const result = { data: rows, error: null };
          return {
            ...result,
            then: (resolve: (value: typeof result) => void) => resolve(result),
            maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
            _id: id,
          };
        },
      }),
      update: (payload: Row) => ({
        eq: async (_column: string, id: string) => {
          updates.push({ table, payload, id });
          return { error: null };
        },
      }),
    }),
  };
  return { client, updates, rpcCalls };
}

function createAdmin(senseDistractors: string[] | null = null) {
  const inserted: Row[] = [];
  const senseUpdates: Row[] = [];
  const admin = {
    from: (table: string) => ({
      insert: async (row: Row) => {
        inserted.push({ table, ...row });
        return { error: null };
      },
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === 'lexicon_senses' && senseDistractors ? { distractors: senseDistractors } : null,
            error: null,
          }),
        }),
      }),
      update: (payload: Row) => ({
        eq: async () => {
          senseUpdates.push(payload);
          return { error: null };
        },
      }),
    }),
  };
  return { admin, inserted, senseUpdates };
}

const word = {
  id: 'word-1',
  english: 'bank',
  japanese: '銀行',
  distractors: ['地位', '土手', '空白'],
  lexicon_sense_id: 'sense-1',
  project_id: 'project-1',
};

const problemJudgement: OptionReportJudgement = {
  verdict: 'correct_translation',
  reason: '土手は bank の別の意味です',
  replacements: ['戦車', '感謝する'],
  replacementSources: ['tank', 'thank'],
};

test('report-option requires an authenticated user', async () => {
  const fake = createClient({ user: null });
  const response = await handleQuizOptionReportPost(
    jsonRequest({ wordId: 'word-1', reportedOption: '土手' }),
    { createClient: async () => fake.client as never, getAdmin: () => createAdmin().admin as never, judge: async () => problemJudgement },
  );
  assert.equal(response.status, 401);
});

test('report-option returns 404 for a word the user cannot read, without counting usage', async () => {
  const fake = createClient({ word: null });
  const response = await handleQuizOptionReportPost(
    jsonRequest({ wordId: 'word-x', reportedOption: '土手' }),
    { createClient: async () => fake.client as never, getAdmin: () => createAdmin().admin as never, judge: async () => problemJudgement },
  );
  assert.equal(response.status, 404);
  assert.deepEqual(fake.rpcCalls, []);
});

test('report-option refuses to report the correct answer itself', async () => {
  const fake = createClient({ word });
  const response = await handleQuizOptionReportPost(
    jsonRequest({ wordId: 'word-1', reportedOption: '銀行' }),
    { createClient: async () => fake.client as never, getAdmin: () => createAdmin().admin as never, judge: async () => problemJudgement },
  );
  assert.equal(response.status, 400);
  assert.deepEqual(fake.rpcCalls, []);
});

test('report-option fixes the word, the lexicon master, and records the report when the option is really wrong', async () => {
  const fake = createClient({ word, translations: [{ translation_ja: '銀行' }, { translation_ja: '土手' }] });
  const adminFake = createAdmin(['地位', '土手', '空白']);
  let judgeInput: Record<string, unknown> | null = null;
  const response = await handleQuizOptionReportPost(
    jsonRequest({ wordId: 'word-1', reportedOption: '土手', options: ['銀行', '地位', '土手', '空白'] }),
    {
      createClient: async () => fake.client as never,
      getAdmin: () => adminFake.admin as never,
      judge: async (input) => {
        judgeInput = input as unknown as Record<string, unknown>;
        return problemJudgement;
      },
    },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.verdict, 'correct_translation');
  assert.equal(body.fixed, true);
  assert.equal(body.replacement, '戦車');
  assert.deepEqual(body.distractors, ['地位', '戦車', '空白']);

  assert.deepEqual(judgeInput && (judgeInput as { knownTranslations: string[] }).knownTranslations, ['銀行', '土手']);
  assert.deepEqual(fake.rpcCalls, ['check_and_increment_feature_usage']);
  assert.deepEqual(fake.updates, [{ table: 'words', id: 'word-1', payload: { distractors: ['地位', '戦車', '空白'] } }]);
  assert.deepEqual(adminFake.senseUpdates, [{ distractors: ['地位', '戦車', '空白'] }]);
  assert.equal(adminFake.inserted.length, 1);
  assert.equal(adminFake.inserted[0].table, 'quiz_option_reports');
  assert.equal(adminFake.inserted[0].fixed, true);
  assert.equal(adminFake.inserted[0].lexicon_fixed, true);
  assert.equal(adminFake.inserted[0].verdict, 'correct_translation');
});

test('report-option leaves the word alone and still records the report when the option is fine', async () => {
  const fake = createClient({ word });
  const adminFake = createAdmin(['地位', '土手', '空白']);
  const response = await handleQuizOptionReportPost(
    jsonRequest({ wordId: 'word-1', reportedOption: '地位' }),
    {
      createClient: async () => fake.client as never,
      getAdmin: () => adminFake.admin as never,
      judge: async () => ({ verdict: 'ok', reason: '地位は rank の訳で bank とは別です', replacements: [], replacementSources: [] }),
    },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.fixed, false);
  assert.deepEqual(body.distractors, ['地位', '土手', '空白']);
  assert.deepEqual(fake.updates, []);
  assert.deepEqual(adminFake.senseUpdates, []);
  assert.equal(adminFake.inserted.length, 1);
  assert.equal(adminFake.inserted[0].verdict, 'ok');
});

test('report-option stops at the daily limit before calling the judge', async () => {
  const fake = createClient({ word, usage: { allowed: false, requires_pro: false, current_count: 20, limit: 20, is_pro: false } });
  let judgeCalls = 0;
  const response = await handleQuizOptionReportPost(
    jsonRequest({ wordId: 'word-1', reportedOption: '土手' }),
    {
      createClient: async () => fake.client as never,
      getAdmin: () => createAdmin().admin as never,
      judge: async () => { judgeCalls += 1; return problemJudgement; },
    },
  );
  assert.equal(response.status, 429);
  assert.equal(judgeCalls, 0);
});

test('report-option answers 502 when the judge fails, without touching the word', async () => {
  const fake = createClient({ word });
  const response = await handleQuizOptionReportPost(
    jsonRequest({ wordId: 'word-1', reportedOption: '土手' }),
    {
      createClient: async () => fake.client as never,
      getAdmin: () => createAdmin().admin as never,
      judge: async () => { throw new Error('gemini down'); },
    },
  );
  assert.equal(response.status, 502);
  assert.deepEqual(fake.updates, []);
});
