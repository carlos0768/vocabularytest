import assert from 'node:assert/strict';
import test from 'node:test';

import type { SharedProjectCard, SharedUserSummary } from '@/lib/shared-projects/types';
import {
  appendDiscoverPage,
  buildSharedPageSearch,
  collectMetricProjectIds,
  mergeMetricsIntoCards,
  mergeUniqueProjectCards,
  parseSharedPageTab,
  removeProjectFromDiscover,
} from './shared-page-utils';
import {
  formatSharedTag,
  normalizeSharedTags,
  parseSharedTagsInput,
} from '../../../shared/shared-tags';

function makeCard(id: string, overrides: Partial<SharedProjectCard> = {}): SharedProjectCard {
  return {
    project: {
      id,
      userId: `${id}-owner`,
      title: `${id}-title`,
      createdAt: '2026-03-29T00:00:00.000Z',
      shareId: `${id}-share`,
      shareScope: 'public',
      sourceLabels: [],
      isFavorite: false,
    },
    accessRole: 'viewer',
    ...overrides,
  };
}

test('mergeUniqueProjectCards appends only unseen public cards', () => {
  const merged = mergeUniqueProjectCards(
    [makeCard('project-1')],
    [makeCard('project-1'), makeCard('project-2')],
  );

  assert.deepEqual(merged.map((card) => card.project.id), ['project-1', 'project-2']);
});

test('mergeMetricsIntoCards replaces placeholder counts', () => {
  const cards = [makeCard('project-1')];
  const merged = mergeMetricsIntoCards(cards, {
    'project-1': { wordCount: 12, collaboratorCount: 3, likeCount: 5 },
  });

  assert.equal(merged[0]?.wordCount, 12);
  assert.equal(merged[0]?.collaboratorCount, 3);
});

function makeUser(userId: string): SharedUserSummary {
  return {
    userId,
    username: `${userId}-name`,
    accountId: `${userId}-account`,
    projectCount: 1,
    wordCount: 10,
    likeCount: 0,
  };
}

test('appendDiscoverPage appends unseen items and advances the cursor', () => {
  const current = {
    category: 'projects' as const,
    users: [makeUser('user-1')],
    projects: [makeCard('project-1')],
    groups: [],
    nextCursor: 'cursor-1',
  };
  const page = {
    category: 'projects' as const,
    users: [makeUser('user-1'), makeUser('user-2')],
    projects: [makeCard('project-1'), makeCard('project-2')],
    groups: [],
    nextCursor: 'cursor-2',
  };

  const next = appendDiscoverPage(current, page);

  assert.deepEqual(next.projects.map((card) => card.project.id), ['project-1', 'project-2']);
  assert.deepEqual(next.users.map((user) => user.userId), ['user-1', 'user-2']);
  assert.equal(next.nextCursor, 'cursor-2');
});

test('appendDiscoverPage clears the cursor on the last page', () => {
  const current = {
    category: 'projects' as const,
    users: [],
    projects: [makeCard('project-1')],
    groups: [],
    nextCursor: 'cursor-1',
  };
  const page = {
    category: 'projects' as const,
    users: [],
    projects: [makeCard('project-2')],
    groups: [],
    nextCursor: null,
  };

  assert.equal(appendDiscoverPage(current, page).nextCursor, null);
});

test('removeProjectFromDiscover removes stale shared cards', () => {
  const payload = {
    category: 'projects' as const,
    users: [],
    projects: [makeCard('project-1'), makeCard('project-2')],
    groups: [],
    nextCursor: null,
  };

  const next = removeProjectFromDiscover(payload, 'project-1');

  assert.deepEqual(next.projects.map((card) => card.project.id), ['project-2']);
});

test('collectMetricProjectIds skips cards that already have counts', () => {
  const ids = collectMetricProjectIds(
    [makeCard('project-1', { wordCount: 1, collaboratorCount: 1 })],
    [makeCard('project-2')],
  );

  assert.deepEqual(ids, ['project-2']);
});

test('parseSharedTagsInput only accepts hash-prefixed tags', () => {
  assert.deepEqual(
    parseSharedTagsInput('TOEIC, #熟語, ＃高校英語\n#eiken #academic words'),
    ['熟語', '高校英語', 'eiken', 'academic words'],
  );
  assert.deepEqual(parseSharedTagsInput('TOEIC, /熟語, 高校英語'), []);
});

test('normalizeSharedTags keeps storage markerless while display uses hash', () => {
  assert.deepEqual(normalizeSharedTags(['/TOEIC', '#熟語', '高校英語']), ['TOEIC', '熟語', '高校英語']);
  assert.equal(formatSharedTag('/TOEIC'), '#TOEIC');
});

test('parseSharedPageTab restores the tab the viewer left from', () => {
  assert.equal(parseSharedPageTab('?tab=groups'), 'groups');
  assert.equal(parseSharedPageTab('tab=grammar'), 'grammar');
  assert.equal(parseSharedPageTab('?q=abc&tab=users'), 'users');
  assert.equal(parseSharedPageTab('?tab=official'), 'official');
});

test('parseSharedPageTab falls back to the top tab for missing or unknown values', () => {
  assert.equal(parseSharedPageTab(''), 'all');
  assert.equal(parseSharedPageTab(null), 'all');
  assert.equal(parseSharedPageTab('?tab='), 'all');
  assert.equal(parseSharedPageTab('?tab=bogus'), 'all');
  assert.equal(parseSharedPageTab('?q=groups'), 'all');
});

test('buildSharedPageSearch keeps other params and drops the default tab', () => {
  assert.equal(buildSharedPageSearch('', 'groups'), '?tab=groups');
  assert.equal(buildSharedPageSearch('?tab=users', 'groups'), '?tab=groups');
  assert.equal(buildSharedPageSearch('?q=abc', 'groups'), '?q=abc&tab=groups');
  assert.equal(buildSharedPageSearch('?q=abc&tab=groups', 'all'), '?q=abc');
  assert.equal(buildSharedPageSearch('?tab=groups', 'all'), '');
  assert.equal(buildSharedPageSearch('', 'official'), '?tab=official');
});
