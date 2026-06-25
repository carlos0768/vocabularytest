import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleProfileGet, handleProfilePut } from './route';

type ProfileRow = {
  user_id: string;
  username: string | null;
  display_name?: string | null;
  user_handle?: string | null;
  account_id?: string | null;
};

type QueryError = {
  message: string;
};

class FakeProfileAdmin {
  readonly rows: ProfileRow[];
  readonly missingColumns: Set<string>;

  constructor(rows: ProfileRow[], missingColumns: string[] = []) {
    this.rows = rows.map((row) => ({ ...row }));
    this.missingColumns = new Set(missingColumns);
  }

  from(table: string) {
    assert.equal(table, 'profiles');
    return new FakeProfileQuery(this);
  }
}

class FakeProfileQuery {
  private selectColumns = '';
  private userId: string | null = null;
  private upsertRow: Partial<ProfileRow> | null = null;

  constructor(private readonly admin: FakeProfileAdmin) {}

  select(columns: string) {
    this.selectColumns = columns;
    return this;
  }

  eq(field: string, value: string) {
    assert.equal(field, 'user_id');
    this.userId = value;
    return this;
  }

  upsert(row: Partial<ProfileRow>) {
    this.upsertRow = row;
    return this;
  }

  async maybeSingle<T>() {
    const error = this.schemaError();
    if (error) return { data: null, error };

    return {
      data: (this.admin.rows.find((row) => row.user_id === this.userId) ?? null) as T | null,
      error: null,
    };
  }

  async single<T>() {
    const error = this.schemaError();
    if (error) return { data: null, error };

    if (this.upsertRow?.user_id) {
      const existing = this.admin.rows.find((row) => row.user_id === this.upsertRow?.user_id);
      if (existing) Object.assign(existing, this.upsertRow);
      else this.admin.rows.push({
        user_id: this.upsertRow.user_id,
        username: this.upsertRow.username ?? null,
        display_name: this.upsertRow.display_name,
        user_handle: this.upsertRow.user_handle,
        account_id: this.upsertRow.account_id,
      });
      return {
        data: this.admin.rows.find((row) => row.user_id === this.upsertRow?.user_id) as T,
        error: null,
      };
    }

    return { data: null, error: { message: 'row not found' } satisfies QueryError };
  }

  private schemaError(): QueryError | null {
    const missingColumn = [...this.admin.missingColumns].find((column) =>
      this.selectColumns.includes(column)
      || (this.upsertRow && Object.prototype.hasOwnProperty.call(this.upsertRow, column))
    );
    return missingColumn ? { message: `column profiles.${missingColumn} does not exist` } : null;
  }
}

function request(method: 'GET' | 'PUT', body?: unknown) {
  return new NextRequest('http://localhost/api/profile', {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const userId = '11111111-1111-1111-1111-111111111111';
const ensuredProfile = { userId, username: 'Ensured', accountId: 'mk111111111111' };

test('profile GET prefers display_name and returns account_id', async () => {
  const admin = new FakeProfileAdmin([
    {
      user_id: userId,
      username: 'legacy',
      display_name: 'Display Name',
      user_handle: 'handle_1',
      account_id: 'mkprofile',
    },
  ]);

  const response = await handleProfileGet(request('GET'), {
    resolveUserId: async () => userId,
    getAdmin: () => admin as never,
    ensureProfile: async () => ensuredProfile,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    username: 'Display Name',
    accountId: 'mkprofile',
  });
});

test('profile GET falls back to legacy username when newer profile columns are unavailable', async () => {
  const admin = new FakeProfileAdmin(
    [{ user_id: userId, username: 'Legacy User' }],
    ['display_name', 'user_handle', 'account_id'],
  );

  const response = await handleProfileGet(request('GET'), {
    resolveUserId: async () => userId,
    getAdmin: () => admin as never,
    ensureProfile: async () => ensuredProfile,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    username: 'Legacy User',
    accountId: 'mk111111111111',
  });
});

test('profile PUT falls back to username-only upsert when newer profile columns are unavailable', async () => {
  const admin = new FakeProfileAdmin(
    [{ user_id: userId, username: 'Before' }],
    ['display_name', 'user_handle', 'account_id'],
  );

  const response = await handleProfilePut(request('PUT', { username: 'After' }), {
    resolveUserId: async () => userId,
    getAdmin: () => admin as never,
    ensureProfile: async () => ensuredProfile,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    username: 'After',
    accountId: 'mk111111111111',
  });
  assert.equal(admin.rows[0]?.username, 'After');
});

test('profile GET requires authentication', async () => {
  const response = await handleProfileGet(request('GET'), {
    resolveUserId: async () => null,
    getAdmin: () => new FakeProfileAdmin([]) as never,
    ensureProfile: async () => ensuredProfile,
  });

  assert.equal(response.status, 401);
});
