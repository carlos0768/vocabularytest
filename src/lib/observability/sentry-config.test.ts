import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ErrorEvent } from '@sentry/nextjs';
import {
  createBeforeSend,
  DEFAULT_TRACES_SAMPLE_RATE,
  isSensitiveKey,
  isSentryEnabled,
  PERSISTENT_CHUNK_ERROR_TAG,
  REDACTED,
  redactQueryString,
  redactUrl,
  resolveSentryEnvironment,
  resolveTracesSampleRate,
  scrubSentryEvent,
  shouldDropSentryEvent,
} from './sentry-config';

function makeEvent(partial: Partial<ErrorEvent> = {}): ErrorEvent {
  return { type: undefined, ...partial } as ErrorEvent;
}

describe('resolveTracesSampleRate', () => {
  it('未設定なら既定値を返す', () => {
    assert.equal(resolveTracesSampleRate(undefined), DEFAULT_TRACES_SAMPLE_RATE);
    assert.equal(resolveTracesSampleRate(''), DEFAULT_TRACES_SAMPLE_RATE);
    assert.equal(resolveTracesSampleRate('  '), DEFAULT_TRACES_SAMPLE_RATE);
  });

  it('0〜1の値はそのまま採用する', () => {
    assert.equal(resolveTracesSampleRate('0'), 0);
    assert.equal(resolveTracesSampleRate('0.25'), 0.25);
    assert.equal(resolveTracesSampleRate('1'), 1);
  });

  it('不正値・範囲外は既定値へ落として課金事故を防ぐ', () => {
    assert.equal(resolveTracesSampleRate('abc'), DEFAULT_TRACES_SAMPLE_RATE);
    assert.equal(resolveTracesSampleRate('-1'), DEFAULT_TRACES_SAMPLE_RATE);
    assert.equal(resolveTracesSampleRate('2'), DEFAULT_TRACES_SAMPLE_RATE);
    assert.equal(resolveTracesSampleRate('NaN'), DEFAULT_TRACES_SAMPLE_RATE);
  });

  it('明示的なfallbackを指定できる', () => {
    assert.equal(resolveTracesSampleRate(undefined, 0.5), 0.5);
  });
});

describe('resolveSentryEnvironment', () => {
  it('明示指定 > APP_ENV > NODE_ENV の順で解決する', () => {
    assert.equal(resolveSentryEnvironment('staging', 'prod', 'production'), 'staging');
    assert.equal(resolveSentryEnvironment(undefined, 'prod', 'production'), 'prod');
    assert.equal(resolveSentryEnvironment(undefined, undefined, 'production'), 'production');
  });

  it('すべて未設定ならdevelopmentにする', () => {
    assert.equal(resolveSentryEnvironment(undefined, undefined, undefined), 'development');
    assert.equal(resolveSentryEnvironment('', '', ''), 'development');
  });
});

describe('isSentryEnabled', () => {
  it('DSNが空ならSentryを無効とみなす', () => {
    assert.equal(isSentryEnabled(undefined), false);
    assert.equal(isSentryEnabled(''), false);
    assert.equal(isSentryEnabled('   '), false);
  });

  it('DSNがあれば有効', () => {
    assert.equal(isSentryEnabled('https://abc@o1.ingest.sentry.io/2'), true);
  });
});

describe('isSensitiveKey', () => {
  it('区切り文字や大文字小文字の違いを吸収して判定する', () => {
    for (const key of [
      'authorization',
      'Authorization',
      'x-api-key',
      'apiKey',
      'SUPABASE_SERVICE_ROLE_KEY',
      'serviceRoleKey',
      'stripe-signature',
      'x-internal-worker-token',
      'refresh_token',
      'set-cookie',
      'APPLE_IAP_PRIVATE_KEY',
      'admin_secret',
    ]) {
      assert.equal(isSensitiveKey(key), true, `${key} は伏せる対象`);
    }
  });

  it('OAuth codeとemailは完全一致でのみ伏せる', () => {
    assert.equal(isSensitiveKey('code'), true);
    assert.equal(isSensitiveKey('email'), true);
    // statusCode まで巻き込んで潰さない
    assert.equal(isSensitiveKey('statusCode'), false);
    assert.equal(isSensitiveKey('errorCode'), false);
  });

  it('無害なキーは残す', () => {
    for (const key of ['content-type', 'userId', 'projectId', 'wordCount', 'bookKey']) {
      assert.equal(isSensitiveKey(key), false, `${key} は残す`);
    }
  });
});

describe('redactQueryString', () => {
  it('秘匿パラメータだけ伏せて他は残す', () => {
    assert.equal(
      redactQueryString('page=2&access_token=abc123&sort=asc'),
      `page=2&access_token=${REDACTED}&sort=asc`,
    );
  });

  it('OTP・OAuth code・emailを伏せる', () => {
    assert.equal(redactQueryString('code=xyz'), `code=${REDACTED}`);
    assert.equal(redactQueryString('otp=123456'), `otp=${REDACTED}`);
    assert.equal(redactQueryString('email=a@b.com'), `email=${REDACTED}`);
  });

  it('値なしパラメータや空文字を壊さない', () => {
    assert.equal(redactQueryString(''), '');
    assert.equal(redactQueryString('flag'), 'flag');
  });
});

describe('redactUrl', () => {
  it('パスは残しクエリだけ伏せる', () => {
    assert.equal(
      redactUrl('https://www.merken.jp/auth/callback?code=secret&next=/home'),
      `https://www.merken.jp/auth/callback?code=${REDACTED}&next=/home`,
    );
  });

  it('クエリが無いURLはそのまま', () => {
    assert.equal(redactUrl('https://www.merken.jp/home'), 'https://www.merken.jp/home');
  });
});

describe('scrubSentryEvent', () => {
  it('認証系ヘッダとCookieを伏せる', () => {
    const event = scrubSentryEvent(
      makeEvent({
        request: {
          headers: {
            authorization: 'Bearer supersecret',
            cookie: 'sb-access-token=xxx',
            'stripe-signature': 't=1,v1=abc',
            'x-internal-worker-token': 'worker-secret',
            'content-type': 'application/json',
          },
          cookies: { 'sb-refresh-token': 'yyy' },
        },
      }),
    );

    assert.equal(event.request?.headers?.authorization, REDACTED);
    assert.equal(event.request?.headers?.cookie, REDACTED);
    assert.equal(event.request?.headers?.['stripe-signature'], REDACTED);
    assert.equal(event.request?.headers?.['x-internal-worker-token'], REDACTED);
    // 無害なヘッダは残す
    assert.equal(event.request?.headers?.['content-type'], 'application/json');
    assert.equal(event.request?.cookies?.['sb-refresh-token'], REDACTED);
  });

  it('query_stringとurlのクエリを伏せる', () => {
    const event = scrubSentryEvent(
      makeEvent({
        request: {
          url: 'https://www.merken.jp/api/x?token=abc',
          query_string: 'token=abc&page=1',
        },
      }),
    );

    assert.equal(event.request?.query_string, `token=${REDACTED}&page=1`);
    assert.equal(event.request?.url, `https://www.merken.jp/api/x?token=${REDACTED}`);
  });

  it('body内のネストした秘匿キーを再帰的に伏せる', () => {
    const event = scrubSentryEvent(
      makeEvent({
        request: {
          data: {
            userId: 'u1',
            nested: { apiKey: 'sk-live-xyz', keep: 'ok' },
            list: [{ password: 'p' }],
          },
        },
      }),
    );

    const data = event.request?.data as Record<string, unknown>;
    assert.equal(data.userId, 'u1');
    const nested = data.nested as Record<string, unknown>;
    assert.equal(nested.apiKey, REDACTED);
    assert.equal(nested.keep, 'ok');
    assert.equal((data.list as Record<string, unknown>[])[0].password, REDACTED);
  });

  it('extraも伏せる', () => {
    const event = scrubSentryEvent(
      makeEvent({ extra: { serviceRoleKey: 'x', safe: 1 } }),
    );
    assert.equal(event.extra?.serviceRoleKey, REDACTED);
    assert.equal(event.extra?.safe, 1);
  });

  it('requestが無いイベントでも壊れない', () => {
    const event = scrubSentryEvent(makeEvent());
    assert.equal(event.request, undefined);
  });

  // 実機の疎通確認で見つかった取りこぼし。nextjs integrationが付ける
  // contexts.nextjs.request_path には生のクエリ文字列が載る。
  it('contexts.nextjs.request_path のクエリを伏せる', () => {
    const event = scrubSentryEvent(
      makeEvent({
        contexts: {
          nextjs: {
            request_path: '/auth/callback?code=LEAK&next=/home',
            router_kind: 'App Router',
          },
          trace: { trace_id: 'abc123', span_id: 'def456' },
        },
      }),
    );

    const nextjs = event.contexts?.nextjs as Record<string, unknown>;
    assert.equal(nextjs.request_path, `/auth/callback?code=${REDACTED}&next=/home`);
    // 無害な情報とtrace情報は壊さない
    assert.equal(nextjs.router_kind, 'App Router');
    assert.equal((event.contexts?.trace as Record<string, unknown>).trace_id, 'abc123');
  });

  it('キーが無害でも値がクエリ付きURLならクエリを伏せる', () => {
    const event = scrubSentryEvent(
      makeEvent({
        request: { headers: { referer: 'https://www.merken.jp/x?otp=LEAK&a=1' } },
      }),
    );
    assert.equal(
      event.request?.headers?.referer,
      `https://www.merken.jp/x?otp=${REDACTED}&a=1`,
    );
  });

  it('breadcrumbsのURLも伏せる', () => {
    const event = scrubSentryEvent(
      makeEvent({
        breadcrumbs: [
          { category: 'fetch', data: { url: 'https://www.merken.jp/api/x?token=LEAK' } },
        ],
      }),
    );
    const data = event.breadcrumbs?.[0].data as Record<string, unknown>;
    assert.equal(data.url, `https://www.merken.jp/api/x?token=${REDACTED}`);
  });
});

describe('shouldDropSentryEvent', () => {
  it('デプロイ切替由来のChunkLoadErrorは捨てる', () => {
    const event = makeEvent({
      exception: { values: [{ type: 'ChunkLoadError', value: 'Loading chunk 42 failed' }] },
    });
    assert.equal(shouldDropSentryEvent(event), true);
  });

  it('hintのoriginalExceptionからも判定する', () => {
    const error = new Error('Loading chunk 7 failed');
    assert.equal(shouldDropSentryEvent(makeEvent(), { originalException: error }), true);
  });

  it('自動リロードでも直らなかったChunkLoadErrorは残す', () => {
    const event = makeEvent({
      tags: { [PERSISTENT_CHUNK_ERROR_TAG]: 'true' },
      exception: { values: [{ type: 'ChunkLoadError', value: 'Loading chunk 42 failed' }] },
    });
    assert.equal(shouldDropSentryEvent(event), false);
  });

  it('通常のエラーは捨てない', () => {
    const event = makeEvent({
      exception: { values: [{ type: 'TypeError', value: 'x is not a function' }] },
    });
    assert.equal(shouldDropSentryEvent(event), false);
  });
});

describe('createBeforeSend', () => {
  it('捨てる対象はnullを返す', () => {
    const beforeSend = createBeforeSend();
    const event = makeEvent({
      exception: { values: [{ type: 'ChunkLoadError', value: 'Loading chunk 1 failed' }] },
    });
    assert.equal(beforeSend(event, {}), null);
  });

  it('送る場合はスクラブ済みイベントを返す', () => {
    const beforeSend = createBeforeSend();
    const event = makeEvent({
      exception: { values: [{ type: 'TypeError', value: 'boom' }] },
      request: { headers: { authorization: 'Bearer secret' } },
    });

    const result = beforeSend(event, {});
    assert.notEqual(result, null);
    assert.equal(result?.request?.headers?.authorization, REDACTED);
  });
});
