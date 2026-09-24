import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { POST as scanOfficialWordbookImage } from './route';

// 公式単語帳のカメラスキャンは ADMIN_SECRET を持つオペレーター専用。
// ユーザー向けスキャン(/api/extract)と違ってコイン消費もPro判定も無いので、
// 認可が抜けると誰でも無料でAI抽出を呼べてしまう。認可を通る前に
// AIプロバイダへ到達しないこと(=APIキー無しで401が返ること)も
// このテストが担保する。

const IMAGE = 'data:image/jpeg;base64,AAAA';

function request(headers?: Record<string, string>, body: unknown = { image: IMAGE }) {
  return new NextRequest('http://localhost/api/ops/official-wordbooks/scan', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
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

test('ops/official-wordbooks/scan rejects a request without the admin header', async () => {
  await withAdminSecret('admin-secret', async () => {
    assert.equal((await scanOfficialWordbookImage(request())).status, 401);
  });
});

test('ops/official-wordbooks/scan rejects a wrong or blank admin secret', async () => {
  await withAdminSecret('admin-secret', async () => {
    for (const secret of ['wrong-secret', '   ', '']) {
      const res = await scanOfficialWordbookImage(request({ 'x-admin-secret': secret }));
      assert.equal(res.status, 401, `expected 401 for secret "${secret}"`);
    }
  });
});

test('ops/official-wordbooks/scan rejects requests when ADMIN_SECRET is unset', async () => {
  await withAdminSecret(undefined, async () => {
    const res = await scanOfficialWordbookImage(request({ 'x-admin-secret': 'anything' }));
    assert.equal(res.status, 401);
  });
});

test('ops/official-wordbooks/scan rejects a malformed payload before calling any AI provider', async () => {
  await withAdminSecret('admin-secret', async () => {
    const headers = { 'x-admin-secret': 'admin-secret' };
    // 画像なし / 未知のキー / 英検レベルの無い英検モードは、いずれも400で止まる。
    assert.equal((await scanOfficialWordbookImage(request(headers, {}))).status, 400);
    assert.equal(
      (await scanOfficialWordbookImage(request(headers, { image: IMAGE, customPrompt: 'x' }))).status,
      400,
    );
    assert.equal(
      (await scanOfficialWordbookImage(request(headers, { image: IMAGE, mode: 'eiken' }))).status,
      400,
    );
    assert.equal(
      (await scanOfficialWordbookImage(request(headers, { image: IMAGE, mode: 'custom' }))).status,
      400,
    );
  });
});
