import { getGmoConfig, type GmoConfig } from './config';
import { GmoApiError, parseGmoResponse, type GmoResponseBody } from './response';

// GMO PG の HTTP トランスポート。
// エンドポイントは https://{host}/payment/{Api}.idPass 形式で、
// 本文・応答ともに application/x-www-form-urlencoded。

export class GmoTransportError extends Error {}

export type GmoRequestParams = Record<string, string | number | null | undefined>;

function toFormBody(params: GmoRequestParams): URLSearchParams {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') {
      continue;
    }
    body.set(key, String(value));
  }
  return body;
}

export async function callGmoApi(
  apiName: string,
  params: GmoRequestParams,
  config: GmoConfig = getGmoConfig()
): Promise<GmoResponseBody> {
  const url = `${config.baseUrl}/payment/${apiName}.idPass`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: toFormBody(params).toString(),
      signal: AbortSignal.timeout(config.timeoutMs),
      cache: 'no-store',
    });
  } catch (error) {
    // タイムアウト/切断は「失敗」ではなく「結果不明」。呼び出し側が
    // 再試行できるよう GmoApiError とは別の型にする — 取引が成立している
    // 可能性があるので、ここを課金失敗として確定させてはいけない。
    throw new GmoTransportError(
      `GMO API request failed: ${apiName}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const raw = await response.text();

  // GMO は業務エラーも 200 で返すので、非2xx は通信層の異常だけを意味する。
  if (!response.ok) {
    throw new GmoTransportError(
      `GMO API returned HTTP ${response.status} for ${apiName}`
    );
  }

  return parseGmoResponse(raw);
}

export { GmoApiError };
