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
  avatar_url?: string | null;
  bio?: string | null;
  certifications?: unknown;
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
  private updateRow: Partial<ProfileRow> | null = null;

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

  update(row: Partial<ProfileRow>) {
    this.updateRow = row;
    return this;
  }

  async maybeSingle<T>() {
    const error = this.schemaError();
    if (error) return { data: null, error };

    if (this.updateRow) {
      const existing = this.admin.rows.find((row) => row.user_id === this.userId);
      if (existing) Object.assign(existing, this.updateRow);
      return { data: (existing ?? null) as T | null, error: null };
    }

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
        avatar_url: this.upsertRow.avatar_url,
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
      || (this.updateRow && Object.prototype.hasOwnProperty.call(this.updateRow, column))
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
const ensuredProfile = { userId, username: 'Ensured', accountId: 'mk111111111111', avatarUrl: null };

const AVATAR_DATA_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ==';

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
    avatarUrl: null,
    bio: null,
    certifications: [],
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
    avatarUrl: null,
    bio: null,
    certifications: [],
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
    avatarUrl: null,
    bio: null,
    certifications: [],
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

test('profile GET returns a stored account icon', async () => {
  const admin = new FakeProfileAdmin([
    { user_id: userId, username: 'Icon User', account_id: 'mkicon', avatar_url: AVATAR_DATA_URL },
  ]);

  const response = await handleProfileGet(request('GET'), {
    resolveUserId: async () => userId,
    getAdmin: () => admin as never,
    ensureProfile: async () => ensuredProfile,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    username: 'Icon User',
    accountId: 'mkicon',
    avatarUrl: AVATAR_DATA_URL,
    bio: null,
    certifications: [],
  });
});

test('profile PUT stores an account icon', async () => {
  const admin = new FakeProfileAdmin([
    { user_id: userId, username: 'Icon User', account_id: 'mkicon' },
  ]);

  const response = await handleProfilePut(request('PUT', { avatarUrl: AVATAR_DATA_URL }), {
    resolveUserId: async () => userId,
    getAdmin: () => admin as never,
    ensureProfile: async () => ensuredProfile,
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).avatarUrl, AVATAR_DATA_URL);
  assert.equal(admin.rows[0]?.avatar_url, AVATAR_DATA_URL);
});

test('profile PUT clears the icon when avatarUrl is null', async () => {
  const admin = new FakeProfileAdmin([
    { user_id: userId, username: 'Icon User', account_id: 'mkicon', avatar_url: AVATAR_DATA_URL },
  ]);

  const response = await handleProfilePut(request('PUT', { avatarUrl: null }), {
    resolveUserId: async () => userId,
    getAdmin: () => admin as never,
    ensureProfile: async () => ensuredProfile,
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).avatarUrl, null);
  assert.equal(admin.rows[0]?.avatar_url, null);
});

test('profile PUT leaves an existing icon untouched when avatarUrl is omitted', async () => {
  const admin = new FakeProfileAdmin([
    { user_id: userId, username: 'Icon User', account_id: 'mkicon', avatar_url: AVATAR_DATA_URL },
  ]);

  const response = await handleProfilePut(request('PUT', { username: 'Renamed' }), {
    resolveUserId: async () => userId,
    getAdmin: () => admin as never,
    ensureProfile: async () => ensuredProfile,
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).avatarUrl, AVATAR_DATA_URL);
  assert.equal(admin.rows[0]?.avatar_url, AVATAR_DATA_URL);
});

test('profile PUT rejects a non-image icon payload', async () => {
  const admin = new FakeProfileAdmin([{ user_id: userId, username: 'Icon User', account_id: 'mkicon' }]);

  const response = await handleProfilePut(
    request('PUT', { avatarUrl: 'https://evil.example.com/tracker.png' }),
    {
      resolveUserId: async () => userId,
      getAdmin: () => admin as never,
      ensureProfile: async () => ensuredProfile,
    },
  );

  assert.equal(response.status, 400);
  assert.equal(admin.rows[0]?.avatar_url, undefined);
});

test('profile GET returns the stored bio', async () => {
  const admin = new FakeProfileAdmin([
    { user_id: userId, username: 'Bio User', account_id: 'mkbio', bio: '英検準1級に向けて勉強中\n毎朝30語' },
  ]);

  const response = await handleProfileGet(request('GET'), {
    resolveUserId: async () => userId,
    getAdmin: () => admin as never,
    ensureProfile: async () => ensuredProfile,
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).bio, '英検準1級に向けて勉強中\n毎朝30語');
});

test('profile GET still works when the bio column is not migrated yet', async () => {
  const admin = new FakeProfileAdmin(
    [{ user_id: userId, username: 'Old Schema', account_id: 'mkold', avatar_url: AVATAR_DATA_URL }],
    ['bio'],
  );

  const response = await handleProfileGet(request('GET'), {
    resolveUserId: async () => userId,
    getAdmin: () => admin as never,
    ensureProfile: async () => ensuredProfile,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    username: 'Old Schema',
    accountId: 'mkold',
    avatarUrl: AVATAR_DATA_URL,
    bio: null,
    certifications: [],
  });
});

test('profile PUT stores a normalized bio', async () => {
  const admin = new FakeProfileAdmin([{ user_id: userId, username: 'Bio User', account_id: 'mkbio' }]);

  const response = await handleProfilePut(request('PUT', { bio: '  勉強中📚  \r\n\r\n\r\n@friend_1 と対戦  ' }), {
    resolveUserId: async () => userId,
    getAdmin: () => admin as never,
    ensureProfile: async () => ensuredProfile,
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).bio, '勉強中📚\n\n@friend_1 と対戦');
  assert.equal(admin.rows[0]?.bio, '勉強中📚\n\n@friend_1 と対戦');
});

test('profile PUT clears the bio when it is blank', async () => {
  const admin = new FakeProfileAdmin([{ user_id: userId, username: 'Bio User', account_id: 'mkbio', bio: 'old' }]);

  const response = await handleProfilePut(request('PUT', { bio: '  \n ' }), {
    resolveUserId: async () => userId,
    getAdmin: () => admin as never,
    ensureProfile: async () => ensuredProfile,
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).bio, null);
  assert.equal(admin.rows[0]?.bio, null);
});

test('profile PUT rejects a bio longer than 150 characters', async () => {
  const admin = new FakeProfileAdmin([{ user_id: userId, username: 'Bio User', account_id: 'mkbio' }]);

  const response = await handleProfilePut(request('PUT', { bio: 'あ'.repeat(151) }), {
    resolveUserId: async () => userId,
    getAdmin: () => admin as never,
    ensureProfile: async () => ensuredProfile,
  });

  assert.equal(response.status, 400);
  assert.equal(admin.rows[0]?.bio, undefined);
});

test('profile PUT leaves the bio untouched when it is omitted', async () => {
  const admin = new FakeProfileAdmin([{ user_id: userId, username: 'Bio User', account_id: 'mkbio', bio: 'keep me' }]);

  const response = await handleProfilePut(request('PUT', { username: 'Renamed' }), {
    resolveUserId: async () => userId,
    getAdmin: () => admin as never,
    ensureProfile: async () => ensuredProfile,
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).bio, 'keep me');
  assert.equal(admin.rows[0]?.bio, 'keep me');
});

test('profile PUT reports bio as unavailable when the column is not migrated yet', async () => {
  const admin = new FakeProfileAdmin([{ user_id: userId, username: 'Bio User', account_id: 'mkbio' }], ['bio']);

  const response = await handleProfilePut(request('PUT', { bio: 'hello' }), {
    resolveUserId: async () => userId,
    getAdmin: () => admin as never,
    ensureProfile: async () => ensuredProfile,
  });

  assert.equal(response.status, 503);
});

test('profile PUT stores certifications and returns them in display order', async () => {
  const admin = new FakeProfileAdmin([{ user_id: userId, username: 'Cert User', account_id: 'mkcert' }]);

  const response = await handleProfilePut(request('PUT', {
    certifications: [
      { type: 'toeic', test: 'lr', score: 850 },
      { type: 'eiken', grade: 'pre1', cse: 2400 },
    ],
  }), {
    resolveUserId: async () => userId,
    getAdmin: () => admin as never,
    ensureProfile: async () => ensuredProfile,
  });

  assert.equal(response.status, 200);
  const expected = [
    { type: 'eiken', grade: 'pre1', cse: 2400 },
    { type: 'toeic', test: 'lr', score: 850 },
  ];
  assert.deepEqual((await response.json()).certifications, expected);
  assert.deepEqual(admin.rows[0]?.certifications, expected);
});

test('profile PUT stores NULL when all certifications are removed', async () => {
  const admin = new FakeProfileAdmin([{
    user_id: userId, username: 'Cert User', account_id: 'mkcert',
    certifications: [{ type: 'eiken', grade: '2', cse: null }],
  }]);

  const response = await handleProfilePut(request('PUT', { certifications: [] }), {
    resolveUserId: async () => userId,
    getAdmin: () => admin as never,
    ensureProfile: async () => ensuredProfile,
  });

  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).certifications, []);
  assert.equal(admin.rows[0]?.certifications, null);
});

test('profile PUT rejects an out-of-range score', async () => {
  const admin = new FakeProfileAdmin([{ user_id: userId, username: 'Cert User', account_id: 'mkcert' }]);

  const response = await handleProfilePut(request('PUT', {
    certifications: [{ type: 'toeic', test: 'lr', score: 1000 }],
  }), {
    resolveUserId: async () => userId,
    getAdmin: () => admin as never,
    ensureProfile: async () => ensuredProfile,
  });

  assert.equal(response.status, 400);
  assert.equal(admin.rows[0]?.certifications, undefined);
});

test('profile GET keeps bio working when only the certifications column is missing', async () => {
  const admin = new FakeProfileAdmin(
    [{ user_id: userId, username: 'Half', account_id: 'mkhalf', bio: 'hello' }],
    ['certifications'],
  );

  const response = await handleProfileGet(request('GET'), {
    resolveUserId: async () => userId,
    getAdmin: () => admin as never,
    ensureProfile: async () => ensuredProfile,
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.bio, 'hello');
  assert.deepEqual(body.certifications, []);
});

test('profile PUT reports certifications as unavailable when the column is not migrated yet', async () => {
  const admin = new FakeProfileAdmin([{ user_id: userId, username: 'Cert User', account_id: 'mkcert' }], ['certifications']);

  const response = await handleProfilePut(request('PUT', {
    certifications: [{ type: 'eiken', grade: '2' }],
  }), {
    resolveUserId: async () => userId,
    getAdmin: () => admin as never,
    ensureProfile: async () => ensuredProfile,
  });

  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /資格/);
});
