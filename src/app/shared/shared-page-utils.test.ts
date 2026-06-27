import assert from 'node:assert/strict';
import test from 'node:test';

import type { SharedProjectCard } from '@/lib/shared-projects/types';
import {
  collectMetricProjectIds,
  mergeMetricsIntoCards,
  mergeUniqueProjectCards,
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
