import assert from 'node:assert/strict';
import test from 'node:test';

import type { ProjectRow, WordRow } from '../../../../shared/db';
import {
  extractShareCode,
  getAccessibleSharedProject,
  getSharedProjectPreviewByShareCode,
  getSharedProjectMetrics,
  listAccessibleSharedProjects,
  listPublicSharedProjects,
  listPublicSharedUsers,
} from './shared';

type MembershipRow = {
  project_id: string;
  role: string | null;
  user_id?: string;
};

type ProfileRow = {
  user_id: string;
  username: string | null;
  account_id?: string | null;
};

type CountRow = {
  project_id: string;
};

type MetricsRow = {
  project_id: string;
  word_count: number;
  collaborator_count: number;
  like_count?: number | null;
};

type StudyGroupProjectRow = {
  group_id: string;
  project_id: string;
  added_by_user_id?: string | null;
};

type StudyGroupMemberRow = {
  group_id: string;
  user_id: string;
};

type FakeAdminOptions = {
  ownedRows?: ProjectRow[];
  membershipRows?: MembershipRow[];
  joinedRows?: ProjectRow[];
  projectRows?: ProjectRow[];
  publicRows?: ProjectRow[];
  profileRows?: ProfileRow[];
  previewWordRows?: WordRow[];
  rpcMetricsRows?: MetricsRow[];
  wordRows?: CountRow[];
  collaboratorRows?: CountRow[];
  studyGroupProjectRows?: StudyGroupProjectRow[];
  studyGroupMemberRows?: StudyGroupMemberRow[];
  shareCodeProject?: ProjectRow | null;
  previewWordSelectErrorIncludes?: string;
  missing?: Array<'project_members' | 'share_scope' | 'shared_metrics_rpc' | 'study_group_members' | 'study_group_projects'>;
  otherErrors?: Partial<Record<
    'owned' | 'memberships' | 'joined' | 'projectById' | 'public' | 'profiles' | 'shareLookup' | 'rpcMetrics' | 'wordCounts' | 'collaborators' | 'studyGroupProjects' | 'studyGroupMembers',
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
  private readonly missing: Set<'project_members' | 'share_scope' | 'shared_metrics_rpc' | 'study_group_members' | 'study_group_projects'>;

  constructor(private readonly options: FakeAdminOptions = {}) {
    this.missing = new Set(options.missing ?? []);
  }

  from(table: string) {
    return new FakeSharedProjectsQuery(table, this.options, this.missing);
  }

  async rpc(name: string, args: { project_ids: string[] }) {
    if (name !== 'get_shared_project_metrics') {
      return { data: null, error: { message: `unknown_rpc:${name}` } satisfies QueryError };
    }

    if (this.missing.has('shared_metrics_rpc')) {
      return { data: null, error: makeMissingMetricsRpcError() };
    }

    const message = this.options.otherErrors?.rpcMetrics;
    if (message) {
      return { data: null, error: { message } satisfies QueryError };
    }

    const rows = (this.options.rpcMetricsRows ?? []).filter((row) => args.project_ids.includes(row.project_id));
    return { data: rows, error: null };
  }
}

class FakeSharedProjectsQuery implements PromiseLike<{ data: unknown; error: QueryError | null; count?: number | null }> {
  private selectColumns = '';
  private readonly filters: Array<{ kind: 'eq' | 'not' | 'in' | 'lte'; field: string; value: unknown }> = [];
  private readonly orderBy: Array<{ field: string; ascending: boolean }> = [];
  private limitValue: number | null = null;
  private head = false;
  private wantsCount = false;

  constructor(
    private readonly table: string,
    private readonly options: FakeAdminOptions,
    private readonly missing: Set<'project_members' | 'share_scope' | 'shared_metrics_rpc' | 'study_group_members' | 'study_group_projects'>,
  ) {}

  select(columns: string, options?: { count?: 'exact'; head?: boolean }) {
    this.selectColumns = columns;
    this.head = options?.head ?? false;
    this.wantsCount = options?.count === 'exact';
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

  lte(field: string, value: unknown) {
    this.filters.push({ kind: 'lte', field, value });
    return this;
  }

  order(field: string, options?: { ascending?: boolean }) {
    this.orderBy.push({ field, ascending: options?.ascending ?? true });
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  maybeSingle<T>() {
    return this.execute<T>(true);
  }

  then<TResult1 = { data: unknown; error: QueryError | null; count?: number | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: QueryError | null; count?: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  upsert(rows: unknown[], options: unknown) {
    void rows;
    void options;

    if (this.missing.has('project_members')) {
      return Promise.resolve({ error: makeMissingProjectMembersError() });
    }

    return Promise.resolve({ error: null });
  }

  private async execute<T = unknown>(single = false): Promise<{ data: T | T[] | null; error: QueryError | null; count?: number | null }> {
    if (this.table === 'project_members' && this.missing.has('project_members')) {
      return { data: null, error: makeMissingProjectMembersError() };
    }

    if (this.table === 'study_group_projects' && this.missing.has('study_group_projects')) {
      return { data: null, error: makeMissingStudyGroupProjectsError() };
    }

    if (this.table === 'study_group_members' && this.missing.has('study_group_members')) {
      return { data: null, error: makeMissingStudyGroupMembersError() };
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

    if (this.table === 'projects' && this.hasFilter('user_id', 'eq')) {
      const message = this.options.otherErrors?.owned;
      if (message) {
        return { data: null, error: { message } };
      }

      const rows = this.projectRowsForSelect(this.options.ownedRows ?? []);
      return { data: rows as T[], error: null };
    }

    if (this.table === 'projects' && this.hasFilter('id', 'eq')) {
      const message = this.options.otherErrors?.projectById;
      if (message) {
        return { data: null, error: { message } };
      }

      const projectId = this.getFilterValue('id', 'eq');
      const rows = [
        ...(this.options.projectRows ?? []),
        ...(this.options.ownedRows ?? []),
        ...(this.options.joinedRows ?? []),
        ...(this.options.publicRows ?? []),
        ...(this.options.shareCodeProject ? [this.options.shareCodeProject] : []),
      ];
      const row = rows.find((candidate) => candidate.id === projectId && candidate.share_id);
      return { data: (row ? this.projectRowsForSelect([row])[0] : null) as T | null, error: null };
    }

    if (this.table === 'project_members' && this.hasFilter('user_id', 'eq') && this.hasFilter('project_id', 'in')) {
      const message = this.options.otherErrors?.memberships;
      if (message) {
        return { data: null, error: { message } };
      }

      const candidateIds = this.getInValues('project_id');
      const rows = (this.options.membershipRows ?? [])
        .filter((row) => candidateIds.includes(row.project_id))
        .map((row) => ({ project_id: row.project_id }));
      return { data: rows as T[], error: null };
    }

    if (this.table === 'project_members' && this.hasFilter('user_id', 'eq') && this.hasFilter('project_id', 'eq')) {
      const message = this.options.otherErrors?.memberships;
      if (message) {
        return { data: null, error: { message } };
      }

      const projectId = this.getFilterValue('project_id', 'eq');
      const userId = this.getFilterValue('user_id', 'eq');
      const row = (this.options.membershipRows ?? [])
        .find((candidate) => candidate.project_id === projectId && (!candidate.user_id || candidate.user_id === userId));
      return { data: (row ?? null) as T | null, error: null };
    }

    if (this.table === 'project_members' && this.hasFilter('user_id', 'eq')) {
      const message = this.options.otherErrors?.memberships;
      if (message) {
        return { data: null, error: { message } };
      }

      return { data: (this.options.membershipRows ?? []) as T[], error: null };
    }

    if (this.table === 'study_group_projects' && this.hasFilter('project_id', 'eq')) {
      const message = this.options.otherErrors?.studyGroupProjects;
      if (message) {
        return { data: null, error: { message } };
      }

      const projectId = this.getFilterValue('project_id', 'eq');
      const rows = (this.options.studyGroupProjectRows ?? [])
        .filter((row) => row.project_id === projectId)
        .map((row) => ({ group_id: row.group_id }));
      return { data: rows as T[], error: null };
    }

    if (this.table === 'study_group_members' && this.hasFilter('user_id', 'eq') && this.hasFilter('group_id', 'in')) {
      const message = this.options.otherErrors?.studyGroupMembers;
      if (message) {
        return { data: null, error: { message } };
      }

      const userId = this.getFilterValue('user_id', 'eq');
      const groupIds = this.getInValues('group_id');
      let rows = (this.options.studyGroupMemberRows ?? [])
        .filter((row) => row.user_id === userId && groupIds.includes(row.group_id))
        .map((row) => ({ group_id: row.group_id }));
      if (this.limitValue !== null) {
        rows = rows.slice(0, this.limitValue);
      }
      return { data: rows as T[], error: null };
    }

    if (this.table === 'projects' && this.hasFilter('id', 'in') && !this.hasFilter('share_scope', 'eq')) {
      const message = this.options.otherErrors?.joined;
      if (message) {
        return { data: null, error: { message } };
      }

      const candidateIds = this.getInValues('id');
      const rows = this.projectRowsForSelect((this.options.joinedRows ?? []).filter((row) => candidateIds.includes(row.id)));
      return { data: rows as T[], error: null };
    }

    if (this.table === 'projects' && this.hasFilter('share_scope', 'eq')) {
      const message = this.options.otherErrors?.public;
      if (message) {
        return { data: null, error: { message } };
      }

      let rows = [...(this.options.publicRows ?? [])];
      const lteCreatedAt = this.getFilterValue('created_at', 'lte');
      if (typeof lteCreatedAt === 'string') {
        rows = rows.filter((row) => row.created_at <= lteCreatedAt);
      }

      rows = this.sortRows(rows);

      if (this.limitValue !== null) {
        rows = rows.slice(0, this.limitValue);
      }

      return { data: this.projectRowsForSelect(rows) as T[], error: null };
    }

    if (this.table === 'profiles') {
      const message = this.options.otherErrors?.profiles;
      if (message) {
        return { data: null, error: { message } };
      }

      const candidateIds = this.getInValues('user_id');
      const rows = (this.options.profileRows ?? []).filter((row) => candidateIds.includes(row.user_id));
      return { data: rows as T[], error: null };
    }

    if (this.table === 'words' && this.head && this.wantsCount) {
      const message = this.options.otherErrors?.wordCounts;
      if (message) {
        return { data: null, error: { message } };
      }

      const projectId = this.getFilterValue('project_id', 'eq');
      const count = (this.options.wordRows ?? []).filter((row) => row.project_id === projectId).length;
      return { data: null, error: null, count };
    }

    if (this.table === 'words' && this.hasFilter('project_id', 'eq')) {
      if (
        this.options.previewWordSelectErrorIncludes
        && this.selectColumns.includes(this.options.previewWordSelectErrorIncludes)
      ) {
        return {
          data: null,
          error: {
            code: 'PGRST200',
            message: 'Could not find a relationship between words and word_translations in the schema cache',
          },
        };
      }

      const projectId = this.getFilterValue('project_id', 'eq');
      let rows = (this.options.previewWordRows ?? []).filter((row) => row.project_id === projectId);
      rows = rows.sort((left, right) => (left.created_at < right.created_at ? 1 : -1));
      if (this.limitValue !== null) {
        rows = rows.slice(0, this.limitValue);
      }
      const count = (this.options.previewWordRows ?? []).filter((row) => row.project_id === projectId).length;
      return { data: rows as T[], error: null, count };
    }

    if (this.table === 'project_members' && this.head && this.wantsCount) {
      const message = this.options.otherErrors?.collaborators;
      if (message) {
        return { data: null, error: { message } };
      }

      const projectId = this.getFilterValue('project_id', 'eq');
      const count = (this.options.collaboratorRows ?? []).filter((row) => row.project_id === projectId).length;
      return { data: null, error: null, count };
    }

    if (single) {
      return { data: null, error: null };
    }

    return { data: [] as T[], error: null };
  }

  private hasFilter(field: string, kind?: 'eq' | 'not' | 'in' | 'lte') {
    return this.filters.some((filter) => filter.field === field && (!kind || filter.kind === kind));
  }

  private getFilterValue(field: string, kind: 'eq' | 'lte') {
    return this.filters.find((filter) => filter.field === field && filter.kind === kind)?.value;
  }

  private getInValues(field: string): string[] {
    const value = this.filters.find((filter) => filter.field === field && filter.kind === 'in')?.value;
    return Array.isArray(value) ? value as string[] : [];
  }

  private projectRowsForSelect(rows: ProjectRow[]): ProjectRow[] {
    if (this.selectColumns.includes('share_scope')) {
      return rows;
    }

    return rows.map((row) => {
      const projected = { ...row };
      delete projected.share_scope;
      return projected;
    });
  }

  private sortRows(rows: ProjectRow[]): ProjectRow[] {
    return rows.sort((left, right) => {
      for (const order of this.orderBy) {
        const leftValue = left[order.field as keyof ProjectRow] ?? '';
        const rightValue = right[order.field as keyof ProjectRow] ?? '';

        if (leftValue === rightValue) continue;

        if (order.ascending) {
          return leftValue < rightValue ? -1 : 1;
        }

        return leftValue > rightValue ? -1 : 1;
      }

      return 0;
    });
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

function makeWordRow(id: string, projectId: string, overrides: Partial<WordRow> = {}): WordRow {
  return {
    id,
    project_id: projectId,
    english: `${id}-english`,
    japanese: `${id}-japanese`,
    distractors: [],
    status: 'new',
    created_at: '2026-03-29T00:00:00.000Z',
    ease_factor: 2.5,
    interval_days: 0,
    repetition: 0,
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

function makeMissingMetricsRpcError(): QueryError {
  return {
    code: '42883',
    message: 'function get_shared_project_metrics(uuid[]) does not exist',
  };
}

function makeMissingStudyGroupProjectsError(): QueryError {
  return {
    code: '42P01',
    message: 'relation "study_group_projects" does not exist',
  };
}

function makeMissingStudyGroupMembersError(): QueryError {
  return {
    code: '42P01',
    message: 'relation "study_group_members" does not exist',
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

test('listAccessibleSharedProjects falls back when share_scope is missing', async () => {
  const ownedRow = makeProjectRow('owned-1', 'user-1');
  const joinedRow = makeProjectRow('joined-1', 'owner-2');
  const admin = new FakeSharedProjectsAdmin({
    ownedRows: [ownedRow],
    membershipRows: [{ project_id: joinedRow.id, role: 'editor' }],
    joinedRows: [joinedRow],
    profileRows: [
      { user_id: 'user-1', username: 'me' },
      { user_id: 'owner-2', username: 'owner' },
    ],
    missing: ['share_scope'],
  });

  const payload = await listAccessibleSharedProjects('user-1', admin as never);

  assert.equal(payload.owned.length, 1);
  assert.equal(payload.owned[0]?.project.shareScope, 'private');
  assert.equal(payload.owned[0]?.ownerUsername, 'me');
  assert.equal(payload.joined.length, 1);
  assert.equal(payload.joined[0]?.project.shareScope, 'private');
  assert.equal(payload.joined[0]?.ownerUsername, 'owner');
});

test('listAccessibleSharedProjects falls back when project_members is missing', async () => {
  const ownedRow = makeProjectRow('owned-1', 'user-1', { share_scope: 'private' });
  const admin = new FakeSharedProjectsAdmin({
    ownedRows: [ownedRow],
    missing: ['project_members'],
  });

  const payload = await listAccessibleSharedProjects('user-1', admin as never);

  assert.equal(payload.owned.length, 1);
  assert.deepEqual(payload.joined, []);
});

test('getAccessibleSharedProject allows study group members to open group-shared private projects', async () => {
  const project = makeProjectRow('project-1', 'owner-1', { share_scope: 'private' });
  const admin = new FakeSharedProjectsAdmin({
    projectRows: [project],
    studyGroupProjectRows: [{ group_id: 'group-1', project_id: project.id }],
    studyGroupMemberRows: [{ group_id: 'group-1', user_id: 'member-1' }],
    profileRows: [{ user_id: 'owner-1', username: 'owner', account_id: 'owner01' }],
    rpcMetricsRows: [
      { project_id: project.id, word_count: 7, collaborator_count: 1, like_count: 2 },
    ],
  });

  const access = await getAccessibleSharedProject(project.id, 'member-1', admin as never);

  assert.ok(access);
  assert.equal(access.project.id, project.id);
  assert.equal(access.project.shareScope, 'private');
  assert.equal(access.accessRole, 'viewer');
  assert.equal(access.wordCount, 7);
  assert.equal(access.likeCount, 2);
  assert.equal(access.ownerAccountId, 'owner01');
});

test('getAccessibleSharedProject resolves share codes before checking study group membership', async () => {
  const project = makeProjectRow('project-1', 'owner-1', {
    share_id: 'share-code-1',
    share_scope: 'private',
  });
  const admin = new FakeSharedProjectsAdmin({
    shareCodeProject: project,
    projectRows: [project],
    studyGroupProjectRows: [{ group_id: 'group-1', project_id: project.id }],
    studyGroupMemberRows: [{ group_id: 'group-1', user_id: 'member-1' }],
  });

  const access = await getAccessibleSharedProject('share-code-1', 'member-1', admin as never);

  assert.ok(access);
  assert.equal(access.project.id, project.id);
  assert.equal(access.accessRole, 'viewer');
});

test('getAccessibleSharedProject does not grant access to non-members of the sharing group', async () => {
  const project = makeProjectRow('project-1', 'owner-1', { share_scope: 'private' });
  const admin = new FakeSharedProjectsAdmin({
    projectRows: [project],
    studyGroupProjectRows: [{ group_id: 'group-1', project_id: project.id }],
    studyGroupMemberRows: [{ group_id: 'group-1', user_id: 'member-1' }],
  });

  const access = await getAccessibleSharedProject(project.id, 'other-user', admin as never);

  assert.equal(access, null);
});

test('getAccessibleSharedProject falls back when study group tables are unavailable', async () => {
  const project = makeProjectRow('project-1', 'owner-1', { share_scope: 'private' });
  const admin = new FakeSharedProjectsAdmin({
    projectRows: [project],
    missing: ['study_group_projects'],
  });

  const access = await getAccessibleSharedProject(project.id, 'member-1', admin as never);

  assert.equal(access, null);
});

test('listPublicSharedProjects paginates with a cursor and avoids duplicates', async () => {
  const admin = new FakeSharedProjectsAdmin({
    publicRows: [
      makeProjectRow('public-3', 'owner-3', { created_at: '2026-03-29T03:00:00.000Z' }),
      makeProjectRow('public-2', 'owner-2', { created_at: '2026-03-29T02:00:00.000Z' }),
      makeProjectRow('public-1', 'owner-1', { created_at: '2026-03-29T01:00:00.000Z' }),
    ],
  });

  const firstPage = await listPublicSharedProjects({ limit: 2 }, admin as never);
  const secondPage = await listPublicSharedProjects({ limit: 2, cursor: firstPage.nextCursor }, admin as never);

  assert.deepEqual(firstPage.items.map((item) => item.project.id), ['public-3', 'public-2']);
  assert.equal(firstPage.nextCursor !== null, true);
  assert.deepEqual(secondPage.items.map((item) => item.project.id), ['public-1']);
});

test('listPublicSharedUsers returns account summaries without wordbook titles', async () => {
  const admin = new FakeSharedProjectsAdmin({
    publicRows: [
      makeProjectRow('public-1', 'owner-1', { created_at: '2026-03-29T01:00:00.000Z' }),
    ],
    profileRows: [
      { user_id: 'owner-1', username: 'owner', account_id: 'mkowner' },
    ],
  });

  const payload = await listPublicSharedUsers({ limit: 4 }, admin as never);

  assert.equal(payload.users.length, 1);
  assert.equal(payload.users[0]?.username, 'owner');
  assert.equal(payload.users[0]?.accountId, 'mkowner');
  assert.equal('latestProjectTitle' in payload.users[0]!, false);
});

test('getSharedProjectPreviewByShareCode falls back when relation embeds are unavailable', async () => {
  const project = makeProjectRow('project-1', 'owner-1', { share_id: 'share-1' });
  const admin = new FakeSharedProjectsAdmin({
    shareCodeProject: project,
    previewWordRows: [
      makeWordRow('word-1', project.id, {
        pronunciation: '/wɜːd/',
        example_sentence: 'A word appears.',
        example_sentence_ja: '単語が出ます。',
        part_of_speech_tags: ['noun'],
      }),
    ],
    previewWordSelectErrorIncludes: 'word_translations(',
    rpcMetricsRows: [
      { project_id: project.id, word_count: 1, collaborator_count: 1, like_count: 0 },
    ],
  });

  const preview = await getSharedProjectPreviewByShareCode('share-1', 5, admin as never);

  assert.ok(preview);
  assert.equal(preview.project.id, project.id);
  assert.equal(preview.words.length, 1);
  assert.equal(preview.words[0]?.pronunciation, '/wɜːd/');
  assert.deepEqual(preview.words[0]?.partOfSpeechTags, ['noun']);
  assert.equal(preview.totalWordCount, 1);
});

test('getSharedProjectMetrics uses RPC results when available', async () => {
  const admin = new FakeSharedProjectsAdmin({
    rpcMetricsRows: [
      { project_id: 'project-1', word_count: 4, collaborator_count: 2 },
    ],
  });

  const metrics = await getSharedProjectMetrics(['project-1'], admin as never);

  assert.deepEqual(metrics.get('project-1'), {
    wordCount: 4,
    collaboratorCount: 2,
    likeCount: 0,
  });
});

test('getSharedProjectMetrics falls back to exact counts when RPC is unavailable', async () => {
  const admin = new FakeSharedProjectsAdmin({
    missing: ['shared_metrics_rpc'],
    wordRows: [
      { project_id: 'project-1' },
      { project_id: 'project-1' },
      { project_id: 'project-1' },
    ],
    collaboratorRows: [{ project_id: 'project-1' }],
  });

  const metrics = await getSharedProjectMetrics(['project-1'], admin as never);

  assert.deepEqual(metrics.get('project-1'), {
    wordCount: 3,
    collaboratorCount: 2,
    likeCount: 0,
  });
});
