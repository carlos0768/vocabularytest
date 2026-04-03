const INTERNAL_WORKER_TOKEN_ENV_NAMES = ['INTERNAL_WORKER_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY'] as const;

export type InternalWorkerTokenEnvName = (typeof INTERNAL_WORKER_TOKEN_ENV_NAMES)[number];
export type InternalWorkerAuthFailureReason = 'missing_header' | 'missing_env' | 'mismatch';

type InternalWorkerEnv = Record<string, string | undefined>;

export function normalizeInternalWorkerValue(value: string | null | undefined): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/[\r\n]+/g, '').trim();
}

export function getAvailableInternalWorkerTokens(
  env: InternalWorkerEnv = process.env,
): Array<{ source: InternalWorkerTokenEnvName; token: string }> {
  const tokens: Array<{ source: InternalWorkerTokenEnvName; token: string }> = [];
  const seen = new Set<string>();

  for (const source of INTERNAL_WORKER_TOKEN_ENV_NAMES) {
    const token = normalizeInternalWorkerValue(env[source]);
    if (!token || seen.has(token)) {
      continue;
    }

    seen.add(token);
    tokens.push({ source, token });
  }

  return tokens;
}

export function getInternalWorkerToken(
  env: InternalWorkerEnv = process.env,
): { source: InternalWorkerTokenEnvName; token: string } | null {
  return getAvailableInternalWorkerTokens(env)[0] ?? null;
}

export function getInternalWorkerAuthorization(
  env: InternalWorkerEnv = process.env,
): { source: InternalWorkerTokenEnvName; header: string; token: string } | null {
  const selected = getInternalWorkerToken(env);
  if (!selected) {
    return null;
  }

  return {
    ...selected,
    header: `Bearer ${selected.token}`,
  };
}

export function authorizeInternalWorkerHeader(
  authorizationHeader: string | null | undefined,
  env: InternalWorkerEnv = process.env,
): { ok: true; source: InternalWorkerTokenEnvName } | { ok: false; reason: InternalWorkerAuthFailureReason } {
  const tokens = getAvailableInternalWorkerTokens(env);
  if (tokens.length === 0) {
    return { ok: false, reason: 'missing_env' };
  }

  const match = authorizationHeader?.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { ok: false, reason: 'missing_header' };
  }

  const presentedToken = normalizeInternalWorkerValue(match[1]);
  if (!presentedToken) {
    return { ok: false, reason: 'missing_header' };
  }

  const matched = tokens.find((candidate) => candidate.token === presentedToken);
  if (!matched) {
    return { ok: false, reason: 'mismatch' };
  }

  return { ok: true, source: matched.source };
}

export function authorizeInternalWorkerRequest(
  request: Pick<Request, 'headers'>,
  env: InternalWorkerEnv = process.env,
) {
  return authorizeInternalWorkerHeader(request.headers.get('authorization'), env);
}

export function createInternalWorkerUrl(
  pathname: string,
  requestUrl: string,
  env: InternalWorkerEnv = process.env,
): URL {
  const vercelUrl = normalizeInternalWorkerValue(env.VERCEL_URL);
  const baseUrl = vercelUrl ? `https://${vercelUrl}` : requestUrl;
  return new URL(pathname, baseUrl);
}
