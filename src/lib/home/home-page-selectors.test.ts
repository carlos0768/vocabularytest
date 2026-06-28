import test from 'node:test';
import assert from 'node:assert/strict';

import type { Project, Word } from '@/types';
import {
  calculateHomeCompletionPercent,
  countHomeWordStatuses,
  selectHomeProjectSections,
} from './home-page-selectors';

function word(status: Word['status']): Pick<Word, 'status'> {
  return { status };
}

function project(
  id: string,
  {
    createdAt = '2026-05-01T00:00:00.000Z',
    importedFromShareId,
    isFavorite = false,
  }: {
    createdAt?: string;
    importedFromShareId?: string;
    isFavorite?: boolean;
  } = {},
): Project {
  return {
    id,
    userId: 'user-1',
    title: id,
    sourceLabels: [],
    createdAt,
    importedFromShareId,
    isFavorite,
  };
}

test('countHomeWordStatuses counts mastered, review, and unlearned words', () => {
  const counts = countHomeWordStatuses([
    word('mastered'),
    word('review'),
    word('new'),
    word('mastered'),
    word('new'),
  ]);

  assert.deepEqual(counts, {
    masteredTotal: 2,
    activeTotal: 0,
    learningTotal: 1,
    unlearnedTotal: 2,
  });
});

test('calculateHomeCompletionPercent returns 0 when totalWords is 0', () => {
  assert.equal(calculateHomeCompletionPercent(3, 0), 0);
});

test('calculateHomeCompletionPercent rounds the mastered ratio', () => {
  assert.equal(calculateHomeCompletionPercent(2, 3), 67);
});

test('selectHomeProjectSections orders favorite projects first', () => {
  const sections = selectHomeProjectSections([
    project('newer-not-favorite', { createdAt: '2026-05-03T00:00:00.000Z' }),
    project('older-favorite', {
      createdAt: '2026-05-01T00:00:00.000Z',
      isFavorite: true,
    }),
  ]);

  assert.deepEqual(sections.homeMyProjects.map((item) => item.id), [
    'older-favorite',
    'newer-not-favorite',
  ]);
});

test('selectHomeProjectSections orders projects with the same favorite state by createdAt descending', () => {
  const sections = selectHomeProjectSections([
    project('oldest', { createdAt: '2026-05-01T00:00:00.000Z' }),
    project('newest', { createdAt: '2026-05-03T00:00:00.000Z' }),
    project('middle', { createdAt: '2026-05-02T00:00:00.000Z' }),
  ]);

  assert.deepEqual(sections.homeMyProjects.map((item) => item.id), [
    'newest',
    'middle',
    'oldest',
  ]);
});

test('selectHomeProjectSections separates shared wordbooks from my wordbooks', () => {
  const sections = selectHomeProjectSections([
    project('shared', { importedFromShareId: 'share-1' }),
    project('mine'),
  ]);

  assert.deepEqual(sections.homeSharedProjects.map((item) => item.id), ['shared']);
  assert.deepEqual(sections.homeMyProjects.map((item) => item.id), ['mine']);
  assert.equal(sections.showSharedProjectsSection, true);
});

test('selectHomeProjectSections slices each home project section to 8 items', () => {
  const projects = Array.from({ length: 10 }, (_, index) =>
    project(`project-${index + 1}`, {
      createdAt: `2026-05-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
    }),
  );

  const sections = selectHomeProjectSections(projects);

  assert.deepEqual(sections.homeMyProjects.map((item) => item.id), [
    'project-10',
    'project-9',
    'project-8',
    'project-7',
    'project-6',
    'project-5',
    'project-4',
    'project-3',
  ]);
});

test('selectHomeProjectSections does not mutate the original projects array', () => {
  const projects = [
    project('oldest', { createdAt: '2026-05-01T00:00:00.000Z' }),
    project('newest', { createdAt: '2026-05-03T00:00:00.000Z' }),
    project('favorite', {
      createdAt: '2026-05-02T00:00:00.000Z',
      isFavorite: true,
    }),
  ];
  const originalIds = projects.map((item) => item.id);

  selectHomeProjectSections(projects);

  assert.deepEqual(projects.map((item) => item.id), originalIds);
});
