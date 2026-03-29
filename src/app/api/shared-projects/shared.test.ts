import assert from 'node:assert/strict';
import test from 'node:test';

import type { ProjectRow } from '../../../../shared/db';
import { extractShareCode, listSharedProjects } from './shared';

type MembershipRow = {
  project_id: string;
  role: string | null;
};

type CountRow = {
  project_id: string;
};

type FakeAdminOptions = {
  ownedRows?: ProjectRow[];
  membershipRows?: MembershipRow[];
  joinedRows?: ProjectRow[];
  publicRows?: ProjectRow[];
  shareCodeProject?: ProjectRow | null;
  wordRows?: CountRow[];
  collaboratorRows?: CountRow[];
  missing?: Array<'project_members' | 'share_scope'>;
  otherErrors?: Partial<Record<
    'owned' | 'memberships' | 'joined' | 'public' | 'wordCounts' | 'collaborators' | 'shareLookup' | 'upsertMember',
    string
  >>;
};

type QueryError = {
  code?: string;
  message: string;
  details?: string;
  hint?: string;
};

class FakeSharedProjectsAdmin {
  private readonly missing: Set<'project_members' | 'share_scope'>;
  private readonly options: FakeAdminOptions;

  constructor(options: FakeAdminOptions = {}) {
    this.options = options;
    this.missing = new Set(options.missing ?? []);
  }

  from(table: string) {
    return new FakeSharedProjectsQuery(table, this.options, this.missing);
  }
}

class FakeSharedProjectsQuery implements PromiseLike<{ data: unknown; error: QueryError | null }> {
  private selectColumns = '';
  private readonly filters: Array<{ kind: 'eq' | 'not' | 'in'; field: string; value: unknown }> = [];

  constructor(
    private readonly table: string,
    private readonly options: FakeAdminOptions,
    private readonly missing: Set<'project_members' | 'share_scope'>,
  ) {}

  select(columns: string) {
    this.selectColumns = columns;
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push({ kind: 'eq', field, value });
    return this;
  }

  not(field: string, _operator: string, value: unknown) {
    this.filters.push({ kind: 'not', field, value });
    return this;
  }

  in(field: string, value: unknown) {
    this.filters.push({ kind: 'in', field, value });
    return this;
  }

  order(_field: string, _options: unknown) {
    return this;
  }

  limit(_value: number) {
    return this;
  }

  maybeSingle<T>() {
    return this.execute<T>(true);
  }

  then<TResult1 = { data: unknown; error: QueryError | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: QueryError | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  upsert(_rows: unknown[], _options: unknown) {
    if (this.missing.has('project_members')) {
      return Promise.resolve({ error: makeMissingProjectMembersError() });
    }

    const message = this.options.otherErrors?.upsertMember;
    if (message) {
      return Promise.resolve({ error: { message } satisfies QueryError });
    }

    return Promise.resolve({ error: null });
  }

  private async execute<T = unknown>(single = false): Promise<{ data: T | T[] | null; error: QueryError | null }> {
    if (this.table === 'project_members' && this.missing.has('project_members')) {
      return { data: null, error: makeMissingProjectMembersError() };
    }

    if (
      this.table === 'projects'
      && (
        this.selectColumns.includes('share_scope')
        || this.filters.some((filter) => filter.field === 'share_scope')
      )
      && this.missing.has('share_scope')
    ) {
      return { data: null, error: makeMissingShareScopeError() };
    }

    if (this.table === 'projects' && this.hasFilter('share_id', 'eq')) {
      const message = this.options.otherErrors?.shareLookup;
      if (message) {
        return { data: null, error: { message } };
      }

      return { data: (this.options.shareCodeProject ?? null) as T | null, error: null };
    }

    if (this.table === 'projects' && this.hasFilter('user_id')) {
      const message = this.options.otherErrors?.owned;
      if (message) {
        return { data: null, error: { message } };
      }

      return { data: this.projectRowsForSelect(this.options.ownedRows ?? []) as T[], error: null };
    }

    if (this.table === 'project_members' && this.hasFilter('user_id')) {
      const message = this.options.otherErrors?.memberships;
      if (message) {
        return { data: null, error: { message } };
      }

      return { data: (this.options.membershipRows ?? []) as T[], error: null };
    }

    if (this.table === 'projects' && this.hasFilter('id', 'in')) {
      const message = this.options.otherErrors?.joined;
      if (message) {
        return { data: null, error: { message } };
      }

      return { data: this.projectRowsForSelect(this.options.joinedRows ?? []) as T[], error: null };
    }

    if (this.table === 'projects' && this.hasFilter('share_scope')) {
      const message = this.options.otherErrors?.public;
      if (message) {
        return { data: null, error: { message } };
      }

      return { data: this.projectRowsForSelect(this.options.publicRows ?? []) as T[], error: null };
    }

    if (this.table === 'words') {
      const message = this.options.otherErrors?.wordCounts;
      if (message) {
        return { data: null, error: { message } };
      }

      return { data: (this.options.wordRows ?? []) as T[], error: null };
    }

    if (this.table === 'project_members' && this.hasFilter('project_id', 'in')) {
      const message = this.options.otherErrors?.collaborators;
      if (message) {
        return { data: null, error: { message } };
      }

      return { data: (this.options.collaboratorRows ?? []) as T[], error: null };
    }

    if (single) {
      return { data: null, error: null };
    }

    return { data: [] as T[], error: null };
  }

  private hasFilter(field: string, kind?: 'eq' | 'not' | 'in') {
    return this.filters.some((filter) => filter.field === field && (!kind || filter.kind === kind));
  }

  private projectRowsForSelect(rows: ProjectRow[]): ProjectRow[] {
    if (this.selectColumns.includes('share_scope')) {
      return rows;
    }

    return rows.map(({ share_scope: _shareScope, ...row }) => row);
  }
}

function makeProjectRow(id: string, userId: string, overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id,
    user_id: userId,
    title: `${id}-title`,
    source_labels: [],
    icon_image: null,
    created_at: '2026-03-29T00:00:00.000Z',
    share_id: `${id}-share`,
    share_scope: 'public',
    is_favorite: false,
    ...overrides,
  };
}

function makeMissingProjectMembersError(): QueryError {
  return {
    code: '42P01',
    message: 'relation "project_members" does not exist',
  };
}

function makeMissingShareScopeError(): QueryError {
  return {
    code: 'PGRST204',
    message: "Could not find the 'share_scope' column of 'projects' in the schema cache",
  };
}

test('extractShareCode accepts grouped invite codes', () => {
  assert.equal(extractShareCode('abcd-1234-ef56'), 'abcd1234ef56');
  assert.equal(extractShareCode(' abcd 1234 ef56 '), 'abcd1234ef56');
});

test('extractShareCode accepts share URLs and normalizes the trailing code', () => {
  assert.equal(
    extractShareCode('https://www.merken.jp/share/abcd-1234-ef56'),
    'abcd1234ef56',
  );
});

test('extractShareCode rejects invalid input', () => {
  assert.equal(extractShareCode(''), null);
  assert.equal(extractShareCode('%%%'), null);
});

test('listSharedProjects falls back when share_scope is missing', async () => {
  const ownedRow = makeProjectRow('owned-1', 'user-1');
  const joinedRow = makeProjectRow('joined-1', 'owner-2');
  const admin = new FakeSharedProjectsAdmin({
    ownedRows: [ownedRow],
    membershipRows: [{ project_id: joinedRow.id, role: 'editor' }],
    joinedRows: [joinedRow],
    wordRows: [
      { project_id: ownedRow.id },
      { project_id: joinedRow.id },
      { project_id: joinedRow.id },
    ],
    collaboratorRows: [{ project_id: joinedRow.id }],
    missing: ['share_scope'],
  });

  const payload = await listSharedProjects('user-1', admin as never);

  assert.equal(payload.owned.length, 1);
  assert.equal(payload.owned[0]?.project.shareScope, 'private');
  assert.equal(payload.joined.length, 1);
  assert.equal(payload.joined[0]?.project.shareScope, 'private');
  assert.equal(payload.joined[0]?.wordCount, 2);
  assert.equal(payload.joined[0]?.collaboratorCount, 2);
  assert.deepEqual(payload.public, []);
});

test('listSharedProjects falls back when project_members is missing', async () => {
  const ownedRow = makeProjectRow('owned-1', 'user-1', { share_scope: 'private' });
  const publicRow = makeProjectRow('public-1', 'owner-2', { share_scope: 'public' });
  const admin = new FakeSharedProjectsAdmin({
    ownedRows: [ownedRow],
    publicRows: [publicRow],
    wordRows: [
      { project_id: ownedRow.id },
      { project_id: publicRow.id },
      { project_id: publicRow.id },
    ],
    missing: ['project_members'],
  });

  const payload = await listSharedProjects('user-1', admin as never);

  assert.equal(payload.owned.length, 1);
  assert.equal(payload.owned[0]?.collaboratorCount, 1);
  assert.deepEqual(payload.joined, []);
  assert.equal(payload.public.length, 1);
  assert.equal(payload.public[0]?.collaboratorCount, 1);
});

test('listSharedProjects falls back when both share schema migrations are missing', async () => {
  const ownedRow = makeProjectRow('owned-1', 'user-1');
  const admin = new FakeSharedProjectsAdmin({
    ownedRows: [ownedRow],
    missing: ['project_members', 'share_scope'],
  });

  const payload = await listSharedProjects('user-1', admin as never);

  assert.equal(payload.owned.length, 1);
  assert.equal(payload.owned[0]?.project.shareScope, 'private');
  assert.deepEqual(payload.joined, []);
  assert.deepEqual(payload.public, []);
});

test('listSharedProjects rethrows non-schema database errors', async () => {
  const admin = new FakeSharedProjectsAdmin({
    otherErrors: {
      owned: 'db_down',
    },
  });

  await assert.rejects(
    () => listSharedProjects('user-1', admin as never),
    /db_down/,
  );
});
