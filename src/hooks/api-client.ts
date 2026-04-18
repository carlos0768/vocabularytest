'use client';

export async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMessage = payload?.error && typeof payload.error === 'string'
      ? payload.error
      : 'API request failed';
    throw new Error(errorMessage);
  }

  return payload as T;
}
