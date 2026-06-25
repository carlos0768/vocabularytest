import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleCheckHandleGet } from './route';

type QueryError = {
  message: string;
};

class FakeCheckHandleAdmin {
  constructor(
    private readonly rows: Array<{ user_id: string; user_handle?: string | null; account_id?: string | null }> = [],
    private readonly missingColumns: string[] = [],
  ) {}

  from(table: string) {
    assert.equal(table, 'profiles');
    return new FakeCheckHandleQuery(this.rows, this.missingColumns);
  }
}

class FakeCheckHandleQuery {
  private selected = '';
  private field = '';
  private value = '';

  constructor(
    private readonly rows: Array<{ user_id: string; user_handle?: string | null; account_id?: string | null }>,
    private readonly missingColumns: string[],
  ) {}

  select(columns: string) {
    this.selected = columns;
    return this;
  }

  eq(field: string, value: string) {
    this.field = field;
    this.value = value;
    return this;
  }

  async maybeSingle() {
    const missingColumn = this.missingColumns.find((column) =>
      this.selected.includes(column) || this.field === column
    );
    if (missingColumn) {
      return { data: null, error: { message: `column profiles.${missingColumn} does not exist` } satisfies QueryError };
    }

    return {
      data: this.rows.find((row) => row[this.field as 'user_handle' | 'account_id'] === this.value) ?? null,
      error: null,
    };
  }
}

function request(handle: string) {
  return new NextRequest(`http://localhost/api/auth/check-handle?handle=${encodeURIComponent(handle)}`);
}

test('check-handle reports unavailable when user_handle exists', async () => {
  const response = await handleCheckHandleGet(request('taken'), {
    getAdmin: () => new FakeCheckHandleAdmin([{ user_id: 'user-1', user_handle: 'taken' }]) as never,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { available: false });
});

test('check-handle falls back to account_id when user_handle is unavailable', async () => {
  const response = await handleCheckHandleGet(request('mkuser'), {
    getAdmin: () => new FakeCheckHandleAdmin(
      [{ user_id: 'user-1', account_id: 'mkuser' }],
      ['user_handle'],
    ) as never,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { available: false });
});

test('check-handle stays available when both handle columns are unavailable', async () => {
  const response = await handleCheckHandleGet(request('new_id'), {
    getAdmin: () => new FakeCheckHandleAdmin([], ['user_handle', 'account_id']) as never,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { available: true });
});

test('check-handle rejects malformed handles', async () => {
  const response = await handleCheckHandleGet(request('Bad Handle'), {
    getAdmin: () => new FakeCheckHandleAdmin() as never,
  });

  assert.equal(response.status, 400);
});
