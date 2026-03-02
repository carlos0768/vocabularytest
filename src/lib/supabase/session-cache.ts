import type { User } from '@supabase/supabase-js';

export interface CachedSupabaseSessionSnapshot {
  accessToken: string;
  expiresAt: number | null;
  user: User | null;
  userId: string | null;
}

const BASE64_PREFIX = 'base64-';
const SESSION_GRACE_SECONDS = 300;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseSupabaseProjectRef(): string | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;
  const match = supabaseUrl.match(/^https:\/\/([^.]+)\.supabase\.co/);
  return match?.[1] ?? null;
}

export function getSupabaseAuthStorageKey(): string | null {
  const projectRef = parseSupabaseProjectRef();
  if (!projectRef) return null;
  return `sb-${projectRef}-auth-token`;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseCookieMap(): Map<string, string> {
  const cookies = new Map<string, string>();
  if (typeof document === 'undefined') return cookies;
  const rawCookie = document.cookie;
  if (!rawCookie) return cookies;

  const parts = rawCookie.split(';');
  for (const part of parts) {
    const segment = part.trim();
    if (!segment) continue;
    const separatorIndex = segment.indexOf('=');
    if (separatorIndex <= 0) continue;
    const key = segment.slice(0, separatorIndex).trim();
    const value = segment.slice(separatorIndex + 1);
    cookies.set(key, safeDecodeURIComponent(value));
  }

  return cookies;
}

function combineCookieChunks(cookies: Map<string, string>, key: string): string | null {
  const single = cookies.get(key);
  if (typeof single === 'string') return single;

  const chunks: string[] = [];
  for (let i = 0; ; i += 1) {
    const chunk = cookies.get(`${key}.${i}`);
    if (typeof chunk !== 'string') break;
    chunks.push(chunk);
  }

  return chunks.length > 0 ? chunks.join('') : null;
}

function decodeBase64Url(value: string): string | null {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function decodeMaybeBase64(rawValue: string): string | null {
  if (!rawValue.startsWith(BASE64_PREFIX)) return rawValue;
  return decodeBase64Url(rawValue.slice(BASE64_PREFIX.length));
}

function getCookieSessionRaw(key: string): string | null {
  const cookies = parseCookieMap();
  const cookieValue = combineCookieChunks(cookies, key);
  if (!cookieValue) return null;
  return decodeMaybeBase64(cookieValue);
}

function getLocalStorageSessionRaw(key: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function findSessionRecord(payload: unknown): Record<string, unknown> | null {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      if (isRecord(item) && typeof item.access_token === 'string') return item;
    }
    return null;
  }

  if (!isRecord(payload)) return null;
  if (typeof payload.access_token === 'string') return payload;

  const session = payload.session;
  if (isRecord(session) && typeof session.access_token === 'string') return session;

  const currentSession = payload.currentSession;
  if (isRecord(currentSession) && typeof currentSession.access_token === 'string') return currentSession;

  const data = payload.data;
  if (isRecord(data)) {
    const nestedSession = data.session;
    if (isRecord(nestedSession) && typeof nestedSession.access_token === 'string') return nestedSession;
  }

  return null;
}

function getSessionRecordFromRaw(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return findSessionRecord(parsed);
  } catch {
    return null;
  }
}

function parseExpiresAt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseUser(value: unknown): User | null {
  if (!isRecord(value)) return null;
  const candidate = value as unknown as Partial<User>;
  if (typeof candidate.id !== 'string') return null;
  if (typeof candidate.aud !== 'string') return null;
  if (typeof candidate.created_at !== 'string') return null;
  if (!isRecord(candidate.app_metadata)) return null;
  if (!isRecord(candidate.user_metadata)) return null;
  return candidate as User;
}

function extractUserIdFromToken(accessToken: string): string | null {
  const parts = accessToken.split('.');
  if (parts.length < 2) return null;

  const payload = decodeBase64Url(parts[1]);
  if (!payload) return null;

  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!isRecord(parsed)) return null;
    return typeof parsed.sub === 'string' ? parsed.sub : null;
  } catch {
    return null;
  }
}

function getRawSessionValue(key: string): string | null {
  return getCookieSessionRaw(key) ?? getLocalStorageSessionRaw(key);
}

export function getCachedSupabaseSessionSnapshot(): CachedSupabaseSessionSnapshot | null {
  if (typeof window === 'undefined') return null;

  const key = getSupabaseAuthStorageKey();
  if (!key) return null;

  const rawSessionValue = getRawSessionValue(key);
  if (!rawSessionValue) return null;

  const sessionRecord = getSessionRecordFromRaw(rawSessionValue);
  if (!sessionRecord) return null;

  const accessToken = typeof sessionRecord.access_token === 'string'
    ? sessionRecord.access_token
    : null;
  if (!accessToken) return null;

  const user = parseUser(sessionRecord.user);
  const userId = user?.id ?? extractUserIdFromToken(accessToken);

  return {
    accessToken,
    expiresAt: parseExpiresAt(sessionRecord.expires_at),
    user,
    userId,
  };
}

export function isCachedSupabaseSessionValid(snapshot: CachedSupabaseSessionSnapshot | null): boolean {
  if (!snapshot?.accessToken) return false;
  if (!snapshot.expiresAt) return true;
  const nowInSeconds = Date.now() / 1000;
  return nowInSeconds <= snapshot.expiresAt + SESSION_GRACE_SECONDS;
}

export function getCachedSupabaseUser(): User | null {
  return getCachedSupabaseSessionSnapshot()?.user ?? null;
}

export function getCachedSupabaseUserId(): string | null {
  return getCachedSupabaseSessionSnapshot()?.userId ?? null;
}
