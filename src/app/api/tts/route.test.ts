import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

import { handleTtsGet } from './route';

function ttsRequest(query: string) {
  return new NextRequest(`http://localhost/api/tts${query}`);
}

function createClient(
  user: { id: string } | null = { id: 'user-1' },
  usage: Record<string, unknown> = { allowed: true, requires_pro: false, current_count: 1, limit: 400, is_pro: false },
  onRpc?: (name: string, params: Record<string, unknown>) => void,
) {
  return {
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
    },
    rpc: async (name: string, params: Record<string, unknown>) => {
      onRpc?.(name, params);
      return { data: usage, error: null };
    },
  };
}

const okSynthesize = async () => ({ success: true as const, audioBase64: Buffer.from('mp3-bytes').toString('base64') });

test('未ログインでは音声を返さない', async () => {
  let synthesized = false;
  const response = await handleTtsGet(ttsRequest('?text=apple&lang=en'), {
    createClient: async () => createClient(null) as never,
    synthesize: async () => {
      synthesized = true;
      return okSynthesize();
    },
  });

  assert.equal(response.status, 401);
  assert.equal(synthesized, false, '認証前にGCPを呼んではいけない');
});

test('テキストや言語が不正なら400で、GCPを呼ばない', async () => {
  for (const query of ['?lang=en', '?text=apple', '?text=apple&lang=fr', '?text=%20%20&lang=en']) {
    let synthesized = false;
    const response = await handleTtsGet(ttsRequest(query), {
      createClient: async () => createClient() as never,
      synthesize: async () => {
        synthesized = true;
        return okSynthesize();
      },
    });

    assert.equal(response.status, 400, query);
    assert.equal(synthesized, false, query);
  }
});

test('成功すると mp3 をキャッシュ可能な形で返す', async () => {
  const response = await handleTtsGet(ttsRequest('?text=apple&lang=en'), {
    createClient: async () => createClient() as never,
    synthesize: okSynthesize,
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'audio/mpeg');
  assert.match(response.headers.get('cache-control') ?? '', /private/);
  assert.match(response.headers.get('cache-control') ?? '', /max-age=\d+/);
  const body = Buffer.from(await response.arrayBuffer());
  assert.equal(body.toString(), 'mp3-bytes');
});

test('利用回数を feature usage で数える', async () => {
  const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const previous = process.env.ENABLE_AI_USAGE_LIMITS;
  process.env.ENABLE_AI_USAGE_LIMITS = 'true';

  try {
    await handleTtsGet(ttsRequest('?text=apple&lang=en'), {
      createClient: async () => createClient(undefined, undefined, (name, params) => calls.push({ name, params })) as never,
      synthesize: okSynthesize,
    });
  } finally {
    if (previous === undefined) delete process.env.ENABLE_AI_USAGE_LIMITS;
    else process.env.ENABLE_AI_USAGE_LIMITS = previous;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'check_and_increment_feature_usage');
  assert.equal(calls[0].params.p_feature_key, 'word_tts');
  assert.equal(calls[0].params.p_require_pro, false);
});

test('上限に達していたら429で、GCPを呼ばない', async () => {
  const previous = process.env.ENABLE_AI_USAGE_LIMITS;
  process.env.ENABLE_AI_USAGE_LIMITS = 'true';
  let synthesized = false;

  try {
    const response = await handleTtsGet(ttsRequest('?text=apple&lang=en'), {
      createClient: async () => createClient({ id: 'user-1' }, { allowed: false, requires_pro: false, current_count: 400, limit: 400, is_pro: false }) as never,
      synthesize: async () => {
        synthesized = true;
        return okSynthesize();
      },
    });

    assert.equal(response.status, 429);
    assert.equal(synthesized, false);
  } finally {
    if (previous === undefined) delete process.env.ENABLE_AI_USAGE_LIMITS;
    else process.env.ENABLE_AI_USAGE_LIMITS = previous;
  }
});

test('APIキー未設定は500、GCP障害は502に分ける', async () => {
  const notConfigured = await handleTtsGet(ttsRequest('?text=apple&lang=en'), {
    createClient: async () => createClient() as never,
    synthesize: async () => ({ success: false as const, reason: 'not_configured' as const, error: 'GOOGLE_CLOUD_TTS_API_KEY が設定されていません' }),
  });
  assert.equal(notConfigured.status, 500);

  const upstream = await handleTtsGet(ttsRequest('?text=apple&lang=en'), {
    createClient: async () => createClient() as never,
    synthesize: async () => ({ success: false as const, reason: 'upstream' as const, error: 'quota exceeded' }),
  });
  assert.equal(upstream.status, 502);

  // 内部のメッセージ (APIキー名やGCPの生の文言) は返さない
  const payload = await upstream.json() as { error?: string };
  assert.doesNotMatch(payload.error ?? '', /quota exceeded|API_KEY/);
});
