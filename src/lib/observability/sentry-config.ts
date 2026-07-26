// Sentry共通設定。client / server / edge の3ランタイムから読み込まれるため、
// ここには「どのランタイムでも動く純粋関数」だけを置く（Node固有APIは使わない）。
//
// NEXT_PUBLIC_* の値をこのモジュール内で process.env から読んではいけない。
// Next.jsはクライアントバンドルで `process.env.NEXT_PUBLIC_X` という
// 静的な参照だけを実値へインライン展開するため、env objectを引き回すと
// クライアント側で undefined になる。呼び出し側がリテラル参照して渡すこと。

import type { ErrorEvent, EventHint } from '@sentry/nextjs';
import { isChunkLoadError } from '@/lib/errors/chunk-load';

/** 伏せた値の置き換え文字列（Sentry UI上の慣習に合わせる）。 */
export const REDACTED = '[Filtered]';

/**
 * デフォルトのトレースサンプリングレート。
 *
 * 0 = エラー監視のみ（トレースを送らない）。本プロジェクトは外部サービスの
 * 従量課金を常にguardrailで抑える方針なので、パフォーマンス計測は既定でオフに
 * しておき、必要になったら SENTRY_TRACES_SAMPLE_RATE で明示的に有効化する。
 */
export const DEFAULT_TRACES_SAMPLE_RATE = 0;

/**
 * 値が秘匿情報になりうるキーの部分一致リスト。
 * `x-api-key` と `apiKey`、`service_role_key` と `serviceRoleKey` を同じ
 * ルールで拾うため、`-` `_` を除去して小文字化した文字列に対して判定する。
 */
const SENSITIVE_KEY_SUBSTRINGS = [
  'authorization',
  'bearer',
  'cookie',
  'credential',
  'password',
  'passwd',
  'apikey',
  'accesskey',
  'privatekey',
  'secret',
  'servicerole',
  'signature',
  'session',
  'token',
  'otp',
];

/**
 * 部分一致だと巻き込みが大きいキー（`statusCode` まで伏せたくない）は
 * 完全一致でのみ判定する。OAuthの `code` とメールアドレスが対象。
 */
const SENSITIVE_KEY_EXACT = ['code', 'email'];

function normalizeKey(key: string): string {
  return key.replace(/[-_\s]/g, '').toLowerCase();
}

/** Sentryへ送る前に値を伏せるべきキーか判定する。 */
export function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (SENSITIVE_KEY_EXACT.includes(normalized)) return true;
  return SENSITIVE_KEY_SUBSTRINGS.some((needle) => normalized.includes(needle));
}

/** ブラウザ拡張やネットワーク断など、対応不能で量だけ多い定番ノイズ。 */
export const IGNORED_ERROR_PATTERNS: (string | RegExp)[] = [
  // ブラウザ拡張・埋め込みウィジェット由来
  'top.GLOBALS',
  /^ResizeObserver loop/,
  /^Non-Error promise rejection captured/,
  // ユーザーの回線断・タブ離脱・意図的なabort
  'Failed to fetch',
  'NetworkError when attempting to fetch resource',
  'Load failed',
  'The operation was aborted',
  'AbortError',
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** ヘッダ / クッキーのように「キー→文字列」なマップから秘匿値を伏せる。 */
function redactStringMap(
  map: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!map) return map;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(map)) {
    result[key] = isSensitiveKey(key) ? REDACTED : value;
  }
  return result;
}

/**
 * `a=1&token=xxx` 形式のクエリ文字列から秘匿パラメータを伏せる。
 * URLSearchParamsは値のエンコードを正規化してしまうので、素の分解で処理する。
 */
export function redactQueryString(queryString: string): string {
  if (!queryString) return queryString;
  const [head, ...rest] = queryString.split('?');
  // `?` を含む場合は末尾側をクエリ本体として扱う（url形式で渡ることがある）
  const body = rest.length > 0 ? rest.join('?') : head;
  const prefix = rest.length > 0 ? `${head}?` : '';

  const redacted = body
    .split('&')
    .map((pair) => {
      if (!pair) return pair;
      const eq = pair.indexOf('=');
      if (eq === -1) return pair;
      const key = pair.slice(0, eq);
      return isSensitiveKey(key) ? `${key}=${REDACTED}` : pair;
    })
    .join('&');

  return `${prefix}${redacted}`;
}

/** URLのクエリ部分だけを伏せる（パスは残す）。 */
export function redactUrl(url: string): string {
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return url;
  const path = url.slice(0, queryStart);
  const query = url.slice(queryStart + 1);
  return `${path}?${redactQueryString(query)}`;
}

/** リクエストbody / extra のようなオブジェクトを再帰的に伏せる。 */
function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > 5) return value;
  if (Array.isArray(value)) {
    return value.map((item) => redactDeep(item, depth + 1));
  }
  if (!isPlainObject(value)) return value;

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = isSensitiveKey(key) ? REDACTED : redactDeep(item, depth + 1);
  }
  return result;
}

/**
 * Sentryへ送るイベントから秘匿情報を落とす。
 *
 * `sendDefaultPii: false` でもヘッダやクエリは載りうるので、多層防御として
 * ここで明示的に伏せる。SUPABASE_SERVICE_ROLE_KEY / INTERNAL_WORKER_TOKEN /
 * stripe-signature などが外部SaaSへ渡るのを防ぐのが目的。
 */
export function scrubSentryEvent<E extends ErrorEvent>(event: E): E {
  if (event.request) {
    const request = { ...event.request };

    request.headers = redactStringMap(request.headers);
    request.cookies = redactStringMap(request.cookies);

    if (typeof request.query_string === 'string') {
      request.query_string = redactQueryString(request.query_string);
    }
    if (typeof request.url === 'string') {
      request.url = redactUrl(request.url);
    }
    if (request.data !== undefined) {
      request.data = redactDeep(request.data);
    }

    event.request = request;
  }

  if (event.extra) {
    event.extra = redactDeep(event.extra) as Record<string, unknown>;
  }

  return event;
}

/**
 * 自動リロードでも直らなかったChunkLoadErrorに付けるタグ。
 * これが付いたイベントは「デプロイが本当に壊れている」シグナルなので捨てない。
 */
export const PERSISTENT_CHUNK_ERROR_TAG = 'chunk_load_persistent';

/**
 * 送らずに捨ててよいイベントか判定する。
 *
 * ChunkLoadErrorはデプロイ切替直後のバージョンスキューで必ず出るもので、
 * `src/app/error.tsx` が自動リロードで自己回復させている。対応アクションが
 * ないうえ件数が多いので既定では送らない。
 *
 * ただしリロード後も再発した場合（PERSISTENT_CHUNK_ERROR_TAG付き）は
 * 自己回復に失敗した本物の障害なので必ず送る。
 */
export function shouldDropSentryEvent(event: ErrorEvent, hint?: EventHint): boolean {
  if (event.tags?.[PERSISTENT_CHUNK_ERROR_TAG] === 'true') return false;

  if (isChunkLoadError(hint?.originalException)) return true;

  const values = event.exception?.values;
  if (!values?.length) return false;

  return values.some((value) =>
    isChunkLoadError({ name: value.type, message: value.value }),
  );
}

/** `Sentry.init({ beforeSend })` にそのまま渡せるハンドラを作る。 */
export function createBeforeSend() {
  return (event: ErrorEvent, hint: EventHint): ErrorEvent | null => {
    if (shouldDropSentryEvent(event, hint)) return null;
    return scrubSentryEvent(event);
  };
}

/**
 * トレースのサンプリングレートを解決する。
 * 不正値・範囲外は既定値に落として、設定ミスで課金が跳ねないようにする。
 */
export function resolveTracesSampleRate(
  raw: string | undefined,
  fallback: number = DEFAULT_TRACES_SAMPLE_RATE,
): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return fallback;
  return parsed;
}

/**
 * Sentry上の environment 名を解決する。
 * 明示指定 > APP_ENV > NODE_ENV の順。
 */
export function resolveSentryEnvironment(
  explicit: string | undefined,
  appEnv: string | undefined,
  nodeEnv: string | undefined,
): string {
  return explicit?.trim() || appEnv?.trim() || nodeEnv?.trim() || 'development';
}

/**
 * DSN未設定ならSentryを初期化しない（＝完全なno-op）。
 * ローカル開発やCIで空のDSNを渡してノイズを出さないための判定。
 */
export function isSentryEnabled(dsn: string | undefined): dsn is string {
  return typeof dsn === 'string' && dsn.trim().length > 0;
}
