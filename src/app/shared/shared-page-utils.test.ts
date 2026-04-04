import assert from 'node:assert/strict';
import test from 'node:test';

import type { SharedProjectCard } from '@/lib/shared-projects/types';
import {
  collectMetricProjectIds,
  mergeMetricsIntoCards,
  mergeUniqueProjectCards,
} from './shared-page-utils';

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
    'project-1': { wordCount: 12, collaboratorCount: 3 },
  });

  assert.equal(merged[0]?.wordCount, 12);
  assert.equal(merged[0]?.collaboratorCount, 3);
});

test('collectMetricProjectIds skips cards that already have counts', () => {
  const ids = collectMetricProjectIds(
    [makeCard('project-1', { wordCount: 1, collaboratorCount: 1 })],
    [makeCard('project-2')],
  );

  assert.deepEqual(ids, ['project-2']);
});
