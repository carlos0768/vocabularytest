import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getCachedSupabaseSessionSnapshot,
  getCachedSupabaseUser,
  getCachedSupabaseUserId,
  getSupabaseAuthStorageKey,
  isCachedSupabaseSessionValid,
} from './session-cache';

const ORIGINAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIGINAL_WINDOW = (globalThis as Record<string, unknown>).window;
const ORIGINAL_DOCUMENT = (globalThis as Record<string, unknown>).document;
const ORIGINAL_LOCAL_STORAGE = (globalThis as Record<string, unknown>).localStorage;

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  constructor(initial: Record<string, string> = {}) {
    Object.entries(initial).forEach(([key, value]) => {
      this.store.set(key, value);
    });
  }

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key) ?? null : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

function restoreGlobals() {
  if (ORIGINAL_WINDOW === undefined) {
    delete (globalThis as Record<string, unknown>).window;
  } else {
    Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: ORIGINAL_WINDOW });
  }

  if (ORIGINAL_DOCUMENT === undefined) {
    delete (globalThis as Record<string, unknown>).document;
  } else {
    Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: ORIGINAL_DOCUMENT });
  }

  if (ORIGINAL_LOCAL_STORAGE === undefined) {
    delete (globalThis as Record<string, unknown>).localStorage;
  } else {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: ORIGINAL_LOCAL_STORAGE });
  }
}

function setupBrowserEnv(options: { cookie?: string; localStorage?: Record<string, string> }) {
  const localStorage = new MemoryStorage(options.localStorage);
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: { localStorage },
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: localStorage,
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: { cookie: options.cookie ?? '' },
  });
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function encodeCookieSession(rawSession: string): string {
  return `base64-${encodeBase64Url(rawSession)}`;
}

function buildJwtWithSub(sub: string): string {
  const header = encodeBase64Url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = encodeBase64Url(JSON.stringify({ sub }));
  return `${header}.${payload}.signature`;
}

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_SUPABASE_URL;
  restoreGlobals();
});

test('restores session from single cookie key', () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://exampleproj.supabase.co';
  const storageKey = getSupabaseAuthStorageKey();
  assert.equal(storageKey, 'sb-exampleproj-auth-token');

  const sessionRaw = JSON.stringify({
    access_token: 'token-from-cookie',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: 'user_cookie' },
  });

  setupBrowserEnv({
    cookie: `${storageKey}=${encodeCookieSession(sessionRaw)}`,
  });

  const snapshot = getCachedSupabaseSessionSnapshot();
  assert.ok(snapshot);
  assert.equal(snapshot.user?.id, 'user_cookie');
  assert.equal(getCachedSupabaseUser()?.id, 'user_cookie');
  assert.equal(getCachedSupabaseUserId(), 'user_cookie');
  assert.equal(isCachedSupabaseSessionValid(snapshot), true);
});

test('restores session from chunked cookie keys', () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://chunkproj.supabase.co';
  const storageKey = getSupabaseAuthStorageKey();
  assert.equal(storageKey, 'sb-chunkproj-auth-token');

  const sessionRaw = JSON.stringify({
    access_token: 'token-chunked',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: 'user_chunk' },
  });
  const encoded = encodeCookieSession(sessionRaw);
  const chunkSize = Math.max(1, Math.floor(encoded.length / 3));
  const c0 = encoded.slice(0, chunkSize);
  const c1 = encoded.slice(chunkSize, chunkSize * 2);
  const c2 = encoded.slice(chunkSize * 2);

  setupBrowserEnv({
    cookie: `${storageKey}.0=${c0}; ${storageKey}.1=${c1}; ${storageKey}.2=${c2}`,
  });

  const snapshot = getCachedSupabaseSessionSnapshot();
  assert.ok(snapshot);
  assert.equal(snapshot.accessToken, 'token-chunked');
  assert.equal(snapshot.user?.id, 'user_chunk');
});

test('falls back to localStorage when cookie is missing', () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://localproj.supabase.co';
  const storageKey = getSupabaseAuthStorageKey();
  assert.equal(storageKey, 'sb-localproj-auth-token');

  const sessionRaw = JSON.stringify({
    access_token: 'token-local',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: 'user_local' },
  });

  setupBrowserEnv({
    cookie: '',
    localStorage: { [storageKey]: sessionRaw },
  });

  const snapshot = getCachedSupabaseSessionSnapshot();
  assert.ok(snapshot);
  assert.equal(snapshot.accessToken, 'token-local');
  assert.equal(snapshot.user?.id, 'user_local');
});

test('flags expired session as invalid', () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://expiredproj.supabase.co';
  const storageKey = getSupabaseAuthStorageKey();
  assert.equal(storageKey, 'sb-expiredproj-auth-token');

  const sessionRaw = JSON.stringify({
    access_token: 'token-expired',
    expires_at: Math.floor(Date.now() / 1000) - 600,
    user: { id: 'user_expired' },
  });

  setupBrowserEnv({
    localStorage: { [storageKey]: sessionRaw },
  });

  const snapshot = getCachedSupabaseSessionSnapshot();
  assert.ok(snapshot);
  assert.equal(isCachedSupabaseSessionValid(snapshot), false);
});

test('extracts user id from JWT sub when user object is missing', () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://jwtproj.supabase.co';
  const storageKey = getSupabaseAuthStorageKey();
  assert.equal(storageKey, 'sb-jwtproj-auth-token');

  const accessToken = buildJwtWithSub('user_from_jwt_sub');
  const sessionRaw = JSON.stringify({
    access_token: accessToken,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  });

  setupBrowserEnv({
    cookie: `${storageKey}=${encodeCookieSession(sessionRaw)}`,
  });

  const snapshot = getCachedSupabaseSessionSnapshot();
  assert.ok(snapshot);
  assert.equal(snapshot.user, null);
  assert.equal(snapshot.userId, 'user_from_jwt_sub');
  assert.equal(getCachedSupabaseUser(), null);
  assert.equal(getCachedSupabaseUserId(), 'user_from_jwt_sub');
});
