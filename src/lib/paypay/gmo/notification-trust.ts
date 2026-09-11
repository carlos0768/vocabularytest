// GMO 結果通知の信頼モデル。
//
// ここが Stripe/App Store との最大の設計差。
//   - Stripe : 本文の HMAC 署名を検証する (INV-05)
//   - AppStore: JWS 署名を Apple のルート証明書まで検証する
//   - GMO    : **署名が無い**。通知は素の form-urlencoded POST で届く
//
// 署名が無い以上、通知本文は「誰でも作れる文字列」でしかない。ここに
// OrderID と Status を書いて投げれば Pro を有効化できてしまうので、
// 本文の決済状態を信用してはいけない。代わりに二段で守る:
//
//   1. 送信元IPの照合 (このファイル) — GMO が通知元として公開しているIP以外を落とす
//   2. **ゲートウェイへの再照会** (呼び出し側) — 通知は「見に行くきっかけ」としてのみ
//      使い、課金状態は必ず GMO の取引照会APIの応答から決める
//
// 1 だけでは不十分（IPは詐称されうるし、プロキシ経由だとヘッダ由来のIPは信用できない）。
// 2 が本命の防御で、1 は照会APIへの増幅攻撃を防ぐための入口フィルタ。

export type IpAllowlistResult =
  | { allowed: true; matchedRule: string }
  | { allowed: false; reason: 'no_allowlist_configured' | 'no_client_ip' | 'not_allowlisted' };

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;

  let value = 0;
  for (const part of parts) {
    // 正準表記だけ通す。'010' のような先頭ゼロは実装によって 8 進と解釈され、
    // 「許可リスト判定では 10、実際の接続先では 8」のようなズレで
    // 許可リストを迂回されうる。'1e2' のような表記も同様に弾く。
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value >>> 0;
}

function matchesRule(clientIp: string, rule: string): boolean {
  const [network, prefixRaw] = rule.split('/');

  const clientInt = ipv4ToInt(clientIp);
  const networkInt = ipv4ToInt(network);
  if (clientInt === null || networkInt === null) {
    return false;
  }

  if (prefixRaw === undefined) {
    return clientInt === networkInt;
  }

  if (!/^\d{1,2}$/.test(prefixRaw)) return false;
  const prefix = Number(prefixRaw);
  if (prefix > 32) return false;
  if (prefix === 0) return true;

  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return (clientInt & mask) === (networkInt & mask);
}

/**
 * 送信元IPが許可リストに含まれるか。
 *
 * 許可リストが空のときは「全許可」ではなく**全拒否**にする。設定漏れで
 * 誰でも通知を投げられる状態になるより、通知が一切通らずに気付ける方が安全。
 */
export function checkGmoNotificationIp(
  clientIp: string | null | undefined,
  allowlist: string[]
): IpAllowlistResult {
  if (allowlist.length === 0) {
    return { allowed: false, reason: 'no_allowlist_configured' };
  }

  const normalized = normalizeClientIp(clientIp);
  if (!normalized) {
    return { allowed: false, reason: 'no_client_ip' };
  }

  for (const rule of allowlist) {
    if (matchesRule(normalized, rule)) {
      return { allowed: true, matchedRule: rule };
    }
  }

  return { allowed: false, reason: 'not_allowlisted' };
}

/**
 * IPv4-mapped IPv6 (::ffff:203.0.113.1) を素の IPv4 に戻す。
 * ポート付き (203.0.113.1:443) も剥がす。
 */
export function normalizeClientIp(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;

  const withoutMapping = value.replace(/^::ffff:/i, '');
  const withoutPort = withoutMapping.replace(/:\d+$/, '');
  return withoutPort !== '' ? withoutPort : null;
}

/**
 * リクエストヘッダから送信元IPを決める。
 *
 * x-real-ip を優先する。Vercel が自分で付ける単一値で、クライアントは上書きできない。
 * 無ければ x-forwarded-for の**末尾**を使う — 先頭はクライアントが自由に書ける値で、
 * `X-Forwarded-For: <GMOのIP>` を付けるだけで素通りしてしまう。末尾なら、
 * Vercel が XFF を置換する挙動でも追記する挙動でも実クライアントIPに一致する。
 *
 * 注意: 初回疎通時に、GMOのテスト通知を1本実際に流して
 * 「どのヘッダに何が入るか」をログで確認すること。プロキシ構成が想定と違うと
 * ここが常に拒否側に倒れる（安全側に倒れるので気付けるが、原因はここ）。
 */
export function resolveGmoClientIp(headers: Headers): string | null {
  const realIp = normalizeClientIp(headers.get('x-real-ip'));
  if (realIp) {
    return realIp;
  }
  return resolveClientIpFromForwardedFor(headers.get('x-forwarded-for'));
}

export function resolveClientIpFromForwardedFor(
  forwardedFor: string | null | undefined
): string | null {
  const value = forwardedFor?.trim();
  if (!value) return null;

  const hops = value
    .split(',')
    .map((hop) => hop.trim())
    .filter((hop) => hop !== '');

  if (hops.length === 0) return null;
  return normalizeClientIp(hops[hops.length - 1]);
}
