import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { GET as listOfficialWordbooks, POST as createOfficialWordbook } from './route';
import {
  DELETE as deleteOfficialWordbook,
  GET as getOfficialWordbook,
  PATCH as patchOfficialWordbook,
} from './[id]/route';

// 公式単語帳の管理APIは ADMIN_SECRET を持つオペレーターだけが叩ける。
// 認可を通る前に service role クライアントへ到達しないこと(=DB接続なしで
// 401/400 が返ること)も、このテストが暗黙に保証している。

const WORDBOOK_ID = '0dd8f4d8-22cf-4010-b6e7-99485683023c';
const PARAMS = { params: Promise.resolve({ id: WORDBOOK_ID }) };

function request(url: string, method: string, headers?: Record<string, string>, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function withAdminSecret<T>(value: string | undefined, fn: () => Promise<T>): Promise<T> {
  const original = process.env.ADMIN_SECRET;
  if (typeof value === 'string') {
    process.env.ADMIN_SECRET = value;
  } else {
    delete process.env.ADMIN_SECRET;
  }
  try {
    return await fn();
  } finally {
    if (typeof original === 'string') {
      process.env.ADMIN_SECRET = original;
    } else {
      delete process.env.ADMIN_SECRET;
    }
  }
}

test('ops/official-wordbooks rejects every method without the admin header', async () => {
  await withAdminSecret('admin-secret', async () => {
    const base = 'http://localhost/api/ops/official-wordbooks';
    assert.equal((await listOfficialWordbooks(request(base, 'GET'))).status, 401);
    assert.equal((await createOfficialWordbook(request(base, 'POST', {}, { slug: 'x-y', title: 't' }))).status, 401);
    assert.equal((await getOfficialWordbook(request(`${base}/${WORDBOOK_ID}`, 'GET'), PARAMS)).status, 401);
    assert.equal(
      (await patchOfficialWordbook(request(`${base}/${WORDBOOK_ID}`, 'PATCH', {}, { isActive: true }), PARAMS)).status,
      401,
    );
    assert.equal((await deleteOfficialWordbook(request(`${base}/${WORDBOOK_ID}`, 'DELETE'), PARAMS)).status, 401);
  });
});

test('ops/official-wordbooks rejects a wrong or blank admin secret', async () => {
  await withAdminSecret('admin-secret', async () => {
    const base = 'http://localhost/api/ops/official-wordbooks';
    for (const secret of ['wrong-secret', '   ', '']) {
      const res = await listOfficialWordbooks(request(base, 'GET', { 'x-admin-secret': secret }));
      assert.equal(res.status, 401, `expected 401 for secret "${secret}"`);
    }
  });
});

test('ops/official-wordbooks rejects requests when ADMIN_SECRET is unset', async () => {
  await withAdminSecret(undefined, async () => {
    const res = await listOfficialWordbooks(
      request('http://localhost/api/ops/official-wordbooks', 'GET', { 'x-admin-secret': 'anything' }),
    );
    assert.equal(res.status, 401);
  });
});

test('ops/official-wordbooks validates the payload before touching the database', async () => {
  await withAdminSecret('admin-secret', async () => {
    const headers = { 'x-admin-secret': 'admin-secret' };
    const base = 'http://localhost/api/ops/official-wordbooks';

    // 不正な slug(DBのCHECK制約と同じ形式)
    const badSlug = await createOfficialWordbook(
      request(base, 'POST', headers, { slug: 'Bad Slug', title: 'タイトル' }),
    );
    assert.equal(badSlug.status, 400);

    // 未知のフィールドは strict スキーマで弾く
    const unknownField = await createOfficialWordbook(
      request(base, 'POST', headers, { slug: 'ok-slug', title: 'タイトル', isPublished: true }),
    );
    assert.equal(unknownField.status, 400);

    // 英検レベルなしの既定単語帳は配布されず無意味なので拒否する
    const defaultWithoutLevel = await createOfficialWordbook(
      request(base, 'POST', headers, { slug: 'ok-slug', title: 'タイトル', isDefault: true }),
    );
    assert.equal(defaultWithoutLevel.status, 400);

    // 空の更新
    const emptyUpdate = await patchOfficialWordbook(
      request(`${base}/${WORDBOOK_ID}`, 'PATCH', headers, {}),
      PARAMS,
    );
    assert.equal(emptyUpdate.status, 400);

    // UUIDでないID
    const badId = await deleteOfficialWordbook(
      request(`${base}/not-a-uuid`, 'DELETE', headers),
      { params: Promise.resolve({ id: 'not-a-uuid' }) },
    );
    assert.equal(badId.status, 400);
  });
});
