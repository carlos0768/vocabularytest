import assert from 'node:assert/strict';
import test from 'node:test';

import { listFollowNotifications, listFollowsHome } from '@/lib/follows/server';
import {
  createFriendRequest,
  getFriendSchemaIssue,
  listFriendsHome,
  searchFriendProfiles,
} from './server';

type ProfileRow = {
  user_id: string;
  username: string | null;
  display_name?: string | null;
  user_handle?: string | null;
  account_id?: string | null;
  is_public?: boolean | null;
};

type FriendshipRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted';
  created_at: string;
  responded_at: string | null;
};

type FollowRow = {
  id: string;
  follower_id: string;
  following_id: string;
  status: 'active' | 'pending';
  created_at: string;
  responded_at: string | null;
};

type QueryError = {
  code?: string;
  message: string;
  details?: string;
  hint?: string;
};

type FakeUserAdminOptions = {
  profiles?: ProfileRow[];
  friendships?: FriendshipRow[];
  follows?: FollowRow[];
  missingColumns?: string[];
  missingTables?: string[];
};

class FakeUserAdmin {
  readonly profiles: ProfileRow[];
  readonly friendships: FriendshipRow[];
  readonly follows: FollowRow[];
  readonly missingColumns: Set<string>;
  readonly missingTables: Set<string>;

  constructor(options: FakeUserAdminOptions = {}) {
    this.profiles = [...(options.profiles ?? [])];
    this.friendships = [...(options.friendships ?? [])];
    this.follows = [...(options.follows ?? [])];
    this.missingColumns = new Set(options.missingColumns ?? []);
    this.missingTables = new Set(options.missingTables ?? []);
  }

  from(table: string) {
    return new FakeUserQuery(table, this);
  }
}

class FakeUserQuery implements PromiseLike<{ data: unknown; error: QueryError | null }> {
  private selectColumns = '';
  private filters: Array<{ kind: 'eq' | 'neq' | 'ilike' | 'in'; field: string; value: unknown }> = [];
  private orFilter: string | null = null;
  private limitValue: number | null = null;
  private insertRow: Record<string, unknown> | null = null;
  private upsertRow: Record<string, unknown> | null = null;

  constructor(
    private readonly table: string,
    private readonly admin: FakeUserAdmin,
  ) {}

  select(columns: string) {
    this.selectColumns = columns;
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push({ kind: 'eq', field, value });
    return this;
  }

  neq(field: string, value: unknown) {
    this.filters.push({ kind: 'neq', field, value });
    return this;
  }

  ilike(field: string, value: unknown) {
    this.filters.push({ kind: 'ilike', field, value });
    return this;
  }

  in(field: string, value: unknown) {
    this.filters.push({ kind: 'in', field, value });
    return this;
  }

  or(value: string) {
    this.orFilter = value;
    return this;
  }

  order() {
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  insert(row: Record<string, unknown>) {
    this.insertRow = row;
    return this;
  }

  upsert(row: Record<string, unknown>) {
    this.upsertRow = row;
    return this;
  }

  maybeSingle<T>() {
    return this.execute<T>(true);
  }

  single<T>() {
    return this.execute<T>(true);
  }

  then<TResult1 = { data: unknown; error: QueryError | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: QueryError | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute<T = unknown>(single = false): Promise<{ data: T | T[] | null; error: QueryError | null }> {
    if (this.admin.missingTables.has(this.table)) {
      return { data: null, error: missingTableError(this.table) };
    }

    const missingColumn = [...this.admin.missingColumns].find((column) =>
      this.selectColumns.includes(column) || this.filters.some((filter) => filter.field === column)
    );
    if (missingColumn) {
      return { data: null, error: missingColumnError(missingColumn) };
    }

    if (this.table === 'profiles') {
      if (this.upsertRow) {
        const userId = this.upsertRow.user_id as string;
        const existing = this.admin.profiles.find((row) => row.user_id === userId);
        if (existing) Object.assign(existing, this.upsertRow);
        else this.admin.profiles.push(this.upsertRow as ProfileRow);
      }

      const rows = applyFilters(this.admin.profiles, this.filters);
      const limited = this.limitValue === null ? rows : rows.slice(0, this.limitValue);
      return { data: (single ? limited[0] ?? null : limited) as T | T[] | null, error: null };
    }

    if (this.table === 'user_friendships') {
      if (this.insertRow) {
        const row: FriendshipRow = {
          id: `friendship-${this.admin.friendships.length + 1}`,
          requester_id: this.insertRow.requester_id as string,
          addressee_id: this.insertRow.addressee_id as string,
          status: this.insertRow.status as 'pending' | 'accepted',
          created_at: '2026-06-26T00:00:00.000Z',
          responded_at: null,
        };
        this.admin.friendships.push(row);
        return { data: row as T, error: null };
      }

      const rows = applyRelationshipFilter(this.admin.friendships, this.orFilter);
      return { data: (single ? rows[0] ?? null : rows) as T | T[] | null, error: null };
    }

    if (this.table === 'user_follows') {
      const rows = applyRelationshipFilter(this.admin.follows, this.orFilter);
      return { data: (single ? rows[0] ?? null : rows) as T | T[] | null, error: null };
    }

    return { data: null, error: { message: `unknown table ${this.table}` } };
  }
}

function applyFilters<T extends Record<string, unknown>>(
  rows: T[],
  filters: Array<{ kind: 'eq' | 'neq' | 'ilike' | 'in'; field: string; value: unknown }>,
): T[] {
  return rows.filter((row) => filters.every((filter) => {
    const value = row[filter.field];
    if (filter.kind === 'eq') return value === filter.value;
    if (filter.kind === 'neq') return value !== filter.value;
    if (filter.kind === 'in') return Array.isArray(filter.value) && filter.value.includes(value);
    if (filter.kind === 'ilike') {
      const needle = String(filter.value).replaceAll('%', '').toLowerCase();
      return String(value ?? '').toLowerCase().includes(needle);
    }
    return true;
  }));
}

function applyRelationshipFilter<T extends Record<string, unknown>>(rows: T[], orFilter: string | null): T[] {
  if (!orFilter) return rows;
  const viewerId = orFilter.match(/(?:requester_id|follower_id)\.eq\.([^,)]+)/)?.[1]
    ?? orFilter.match(/(?:addressee_id|following_id)\.eq\.([^,)]+)/)?.[1];
  if (!viewerId) return rows;

  return rows.filter((row) =>
    row.requester_id === viewerId
    || row.addressee_id === viewerId
    || row.follower_id === viewerId
    || row.following_id === viewerId
  );
}

function missingColumnError(column: string): QueryError {
  return { message: `column profiles.${column} does not exist` };
}

function missingTableError(table: string): QueryError {
  return { message: `relation public.${table} does not exist` };
}

const viewerId = '11111111-1111-1111-1111-111111111111';
const targetId = '22222222-2222-2222-2222-222222222222';

test('getFriendSchemaIssue detects profile column and relationship table drift', () => {
  assert.equal(getFriendSchemaIssue(missingColumnError('user_handle')), 'profiles_user_handle');
  assert.equal(getFriendSchemaIssue(missingTableError('user_friendships')), 'user_friendships');
  assert.equal(getFriendSchemaIssue(missingTableError('user_follows')), 'user_follows');
});

test('listFriendsHome returns an empty home payload when profile columns and friendships are unavailable', async () => {
  const admin = new FakeUserAdmin({
    profiles: [{ user_id: viewerId, username: 'Viewer' }],
    missingColumns: ['display_name', 'user_handle', 'account_id'],
    missingTables: ['user_friendships'],
  });

  const payload = await listFriendsHome(viewerId, admin as never);

  assert.equal(payload.profile.username, 'Viewer');
  assert.equal(payload.profile.accountId, 'mk111111111111');
  assert.deepEqual(payload.friends, []);
  assert.deepEqual(payload.incoming, []);
  assert.deepEqual(payload.outgoing, []);
});

test('listFollowsHome returns an empty home payload when follows are unavailable', async () => {
  const admin = new FakeUserAdmin({
    profiles: [{ user_id: viewerId, username: 'Viewer', account_id: 'mkviewer' }],
    missingTables: ['user_follows'],
  });

  const payload = await listFollowsHome(viewerId, admin as never);

  assert.equal(payload.profile.username, 'Viewer');
  assert.deepEqual(payload.following, []);
  assert.deepEqual(payload.followers, []);
  assert.deepEqual(payload.pendingIncoming, []);
  assert.deepEqual(payload.pendingOutgoing, []);
});

test('listFollowNotifications returns incoming pending follow requests only', async () => {
  const thirdId = '33333333-3333-3333-3333-333333333333';
  const admin = new FakeUserAdmin({
    profiles: [
      { user_id: viewerId, username: 'Viewer', account_id: 'mkviewer' },
      { user_id: targetId, username: 'Target', user_handle: 'abc', account_id: null },
      { user_id: thirdId, username: 'Third', account_id: 'third' },
    ],
    follows: [
      {
        id: 'follow-1',
        follower_id: targetId,
        following_id: viewerId,
        status: 'pending',
        created_at: '2026-06-26T00:00:00.000Z',
        responded_at: null,
      },
      {
        id: 'follow-2',
        follower_id: thirdId,
        following_id: viewerId,
        status: 'active',
        created_at: '2026-06-26T01:00:00.000Z',
        responded_at: '2026-06-26T01:00:00.000Z',
      },
      {
        id: 'follow-3',
        follower_id: viewerId,
        following_id: thirdId,
        status: 'pending',
        created_at: '2026-06-26T02:00:00.000Z',
        responded_at: null,
      },
    ],
  });

  const notifications = await listFollowNotifications(viewerId, admin as never);

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.followId, 'follow-1');
  assert.equal(notifications[0]?.profile.userId, targetId);
  assert.equal(notifications[0]?.profile.accountId, 'abc');
});

test('searchFriendProfiles can find users by user_handle without account_id', async () => {
  const admin = new FakeUserAdmin({
    profiles: [
      { user_id: viewerId, username: 'Viewer', account_id: 'mkviewer' },
      { user_id: targetId, username: 'Target', user_handle: 'abc', account_id: null },
    ],
    missingTables: ['user_friendships'],
  });

  const results = await searchFriendProfiles(viewerId, 'abc', admin as never);

  assert.equal(results.length, 1);
  assert.equal(results[0]?.userId, targetId);
  assert.equal(results[0]?.username, 'Target');
  assert.equal(results[0]?.accountId, 'abc');
  assert.equal(results[0]?.relationship, 'none');
});

test('createFriendRequest resolves the target by user_handle', async () => {
  const admin = new FakeUserAdmin({
    profiles: [
      { user_id: viewerId, username: 'Viewer', account_id: 'mkviewer' },
      { user_id: targetId, username: 'Target', user_handle: 'abc', account_id: null },
    ],
  });

  const friendship = await createFriendRequest(viewerId, 'abc', admin as never);

  assert.equal(friendship.requesterId, viewerId);
  assert.equal(friendship.addresseeId, targetId);
  assert.equal(friendship.profile.accountId, 'abc');
  assert.equal(admin.friendships.length, 1);
}
);
