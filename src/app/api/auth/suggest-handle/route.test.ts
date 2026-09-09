import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleSuggestHandleGet } from './route';

class FakeSuggestAdmin {
  constructor(
    private readonly taken: Array<{ user_handle?: string | null; account_id?: string | null }> = [],
    private readonly missingColumns: string[] = [],
  ) {}

  from(table: string) {
    assert.equal(table, 'profiles');
    return new FakeSuggestQuery(this.taken, this.missingColumns);
  }
}

class FakeSuggestQuery {
  private column = '';

  constructor(
    private readonly taken: Array<{ user_handle?: string | null; account_id?: string | null }>,
    private readonly missingColumns: string[],
  ) {}

  select(column: string) {
    this.column = column;
    return this;
  }

  async in(column: string, values: string[]) {
    if (this.missingColumns.includes(column)) {
      return { data: null, error: { message: `column profiles.${column} does not exist` } };
    }

    const key = column as 'user_handle' | 'account_id';
    return {
      data: this.taken.filter((row) => {
        const value = row[key];
        return typeof value === 'string' && values.includes(value);
      }),
      error: null,
    };
  }
}

function request(query: string) {
  return new NextRequest(`http://localhost/api/auth/suggest-handle?${query}`);
}

const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;

test('suggest-handle returns available candidates seeded by the display name', async () => {
  const response = await handleSuggestHandleGet(request(`name=${encodeURIComponent('ケンタ')}`), {
    getAdmin: () => new FakeSuggestAdmin() as never,
    random: () => 0.5,
  });

  assert.equal(response.status, 200);
  const body = await response.json() as { suggestions: string[] };
  assert.equal(body.suggestions.length, 3);
  assert.equal(body.suggestions[0], 'kenta');
  assert.ok(body.suggestions.every((candidate) => HANDLE_PATTERN.test(candidate)));
});

test('suggest-handle drops candidates already taken', async () => {
  const response = await handleSuggestHandleGet(request(`name=${encodeURIComponent('ケンタ')}&count=2`), {
    getAdmin: () => new FakeSuggestAdmin([{ user_handle: 'kenta' }]) as never,
    random: () => 0.5,
  });

  const body = await response.json() as { suggestions: string[] };
  assert.equal(body.suggestions.length, 2);
  assert.ok(!body.suggestions.includes('kenta'));
});

test('suggest-handle falls back to account_id when user_handle is unavailable', async () => {
  const response = await handleSuggestHandleGet(request(`name=${encodeURIComponent('ケンタ')}&count=1`), {
    getAdmin: () => new FakeSuggestAdmin([{ account_id: 'kenta' }], ['user_handle']) as never,
    random: () => 0.5,
  });

  const body = await response.json() as { suggestions: string[] };
  assert.equal(body.suggestions.length, 1);
  assert.ok(!body.suggestions.includes('kenta'));
});

test('suggest-handle treats every candidate as free when both columns are unavailable', async () => {
  const response = await handleSuggestHandleGet(request(`name=${encodeURIComponent('ケンタ')}&count=1`), {
    getAdmin: () => new FakeSuggestAdmin([], ['user_handle', 'account_id']) as never,
    random: () => 0.5,
  });

  const body = await response.json() as { suggestions: string[] };
  assert.deepEqual(body.suggestions, ['kenta']);
});

test('suggest-handle suggests variants of a handle the user already typed', async () => {
  const response = await handleSuggestHandleGet(request('handle=mikan&count=3'), {
    getAdmin: () => new FakeSuggestAdmin([{ user_handle: 'mikan' }]) as never,
    random: () => 0.5,
  });

  const body = await response.json() as { suggestions: string[] };
  assert.equal(body.suggestions.length, 3);
  assert.ok(!body.suggestions.includes('mikan'));
  assert.ok(body.suggestions.some((candidate) => candidate.startsWith('mikan')));
});

test('suggest-handle still returns candidates with no seed at all', async () => {
  const response = await handleSuggestHandleGet(request('count=3'), {
    getAdmin: () => new FakeSuggestAdmin() as never,
    random: () => 0.25,
  });

  const body = await response.json() as { suggestions: string[] };
  assert.equal(body.suggestions.length, 3);
  assert.ok(body.suggestions.every((candidate) => HANDLE_PATTERN.test(candidate)));
});

test('suggest-handle surfaces a lookup failure', async () => {
  const failingAdmin = {
    from() {
      return {
        select() { return this; },
        async in() {
          return { data: null, error: { message: 'connection reset' } };
        },
      };
    },
  };

  const response = await handleSuggestHandleGet(request('name=kenta'), {
    getAdmin: () => failingAdmin as never,
    random: () => 0.5,
  });

  assert.equal(response.status, 500);
  assert.deepEqual((await response.json() as { suggestions: string[] }).suggestions, []);
});
