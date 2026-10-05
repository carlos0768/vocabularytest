import test from 'node:test';
import assert from 'node:assert/strict';

import type { Word } from '@/types';
import type { ParaphraseMaterial } from './dataset';
import { fetchParaphraseMaterials, isParaphraseCandidateWord } from './client';

function word(overrides: Partial<Word> & { id: string; english: string }): Word {
  return {
    projectId: 'p1',
    japanese: '訳',
    distractors: [],
    status: 'new',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    easeFactor: 2.5,
    intervalDays: 0,
    repetition: 0,
    isFavorite: false,
    ...overrides,
  } as Word;
}

function fakeFetch(results: unknown[], calls: Array<{ words: Array<{ id: string; english: string }> }>) {
  return (async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body)) as { words: Array<{ id: string; english: string }> });
    return new Response(JSON.stringify({ success: true, results }), { status: 200 });
  }) as typeof fetch;
}

test('英語の見出し語だけが対象で、古典語は引かない', () => {
  assert.equal(isParaphraseCandidateWord({ english: 'plummet' }), true);
  assert.equal(isParaphraseCandidateWord({ english: 'いとをかし' }), false);
  assert.equal(isParaphraseCandidateWord({ english: 'plummet', classicalEntryId: 'c1' }), false);
});

test('材料のある語だけが Map に入り、同じ語は 2 度目は取りに行かない', async () => {
  const calls: Array<{ words: Array<{ id: string; english: string }> }> = [];
  const cache = new Map<string, ParaphraseMaterial | null>();
  const fetchImpl = fakeFetch([
    { wordId: 'w1', headword: 'plummet', pos: 'v', answers: ['drop', 'decline'], distractors: ['wish', 'abuse', 'leaf'] },
  ], calls);
  const words = [word({ id: 'w1', english: 'plummet' }), word({ id: 'w2', english: 'xyzzy' }), word({ id: 'w3', english: 'いとをかし' })];

  const first = await fetchParaphraseMaterials(words, { fetchImpl, cache });
  assert.deepEqual([...first.keys()], ['w1']);
  assert.deepEqual(first.get('w1')?.answers, ['drop', 'decline']);
  // 古典語はリクエストにも含めない
  assert.deepEqual(calls[0].words.map((w) => w.id), ['w1', 'w2']);

  // 別の単語 ID でも同じ見出し語ならキャッシュから返る
  const second = await fetchParaphraseMaterials([word({ id: 'w9', english: 'plummet' }), word({ id: 'w2', english: 'xyzzy' })], { fetchImpl, cache });
  assert.equal(calls.length, 1);
  assert.deepEqual(second.get('w9')?.answers, ['drop', 'decline']);
  assert.equal(second.has('w2'), false);
});

test('通信に失敗したら投げる (呼び出し側が「取得できなかった」を出す)', async () => {
  const fetchImpl = (async () => new Response('oops', { status: 500 })) as unknown as typeof fetch;
  await assert.rejects(
    fetchParaphraseMaterials([word({ id: 'w1', english: 'plummet' })], { fetchImpl, cache: new Map() }),
  );
});

test('形の崩れた結果は無視する', async () => {
  const calls: Array<{ words: Array<{ id: string; english: string }> }> = [];
  const fetchImpl = fakeFetch([{ wordId: 'w1', answers: 'drop' }, 'junk'], calls);
  const result = await fetchParaphraseMaterials([word({ id: 'w1', english: 'plummet' })], { fetchImpl, cache: new Map() });
  assert.equal(result.size, 0);
});
