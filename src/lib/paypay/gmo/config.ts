import { readSingleLineEnv } from '@/lib/env';

// GMO PG (PGマルチペイメントサービス) の接続設定。
//
// 資格情報は2階層ある:
//  - ShopID / ShopPass : 店舗単位。都度の取引APIで使う
//  - SiteID / SitePass : 会員単位。継続課金は「会員」に紐づくため必須
// 継続課金を扱う以上どちらも欠かせないので、片方だけ設定された状態は
// 起動時に落とす（本番で「なぜか会員APIだけ401」を追う羽目になるため）。

export type GmoCredentials = {
  shopId: string;
  shopPass: string;
  siteId: string;
  sitePass: string;
};

export type GmoConfig = GmoCredentials & {
  /** 例: https://pt01.mul-pay.jp (テスト) / https://p01.mul-pay.jp (本番) */
  baseUrl: string;
  /** 結果通知の送信元として許可するIP/CIDR。空なら通知を一切受け付けない */
  notificationIpAllowlist: string[];
  /** API呼び出しのタイムアウト(ms) */
  timeoutMs: number;
};

export class GmoConfigError extends Error {}

const DEFAULT_TIMEOUT_MS = 15_000;

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = readSingleLineEnv(key, env).trim();
  if (!value) {
    throw new GmoConfigError(`${key} is not set`);
  }
  return value;
}

export function parseIpAllowlist(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

/**
 * baseUrl を環境変数で明示させる。NODE_ENV から導出しない —
 * ステージングをGMOのテスト環境に向けたい、本番検証を一時的にテストへ逃がしたい、
 * といった運用が必ず出るし、導出にすると「本番ビルドが勝手に本番課金へ飛ぶ」ため。
 */
export function getGmoConfig(env: NodeJS.ProcessEnv = process.env): GmoConfig {
  const baseUrl = required(env, 'GMO_API_BASE_URL').replace(/\/+$/, '');
  if (!baseUrl.startsWith('https://')) {
    throw new GmoConfigError('GMO_API_BASE_URL must be an https:// URL');
  }

  const timeoutRaw = readSingleLineEnv('GMO_API_TIMEOUT_MS', env).trim();
  const parsedTimeout = timeoutRaw ? Number(timeoutRaw) : NaN;

  return {
    shopId: required(env, 'GMO_SHOP_ID'),
    shopPass: required(env, 'GMO_SHOP_PASS'),
    siteId: required(env, 'GMO_SITE_ID'),
    sitePass: required(env, 'GMO_SITE_PASS'),
    baseUrl,
    notificationIpAllowlist: parseIpAllowlist(
      readSingleLineEnv('GMO_NOTIFICATION_IP_ALLOWLIST', env)
    ),
    timeoutMs:
      Number.isFinite(parsedTimeout) && parsedTimeout > 0
        ? parsedTimeout
        : DEFAULT_TIMEOUT_MS,
  };
}
