import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  REEL_SAVED_PROJECT_TITLE,
  isReelSavedProject,
  excludeReelSavedProjects,
} from './saved-words';

describe('reel saved-words helpers', () => {
  it('identifies the internal reel-saved backing wordbook by title', () => {
    assert.equal(isReelSavedProject({ title: REEL_SAVED_PROJECT_TITLE }), true);
    assert.equal(isReelSavedProject({ title: '英検2級' }), false);
  });

  it('drops only the reel-saved wordbook, preserving order of the rest', () => {
    const projects = [
      { id: 'a', title: '教科書' },
      { id: 'b', title: REEL_SAVED_PROJECT_TITLE },
      { id: 'c', title: 'プリント' },
    ];

    assert.deepEqual(
      excludeReelSavedProjects(projects).map((project) => project.id),
      ['a', 'c'],
    );
  });

  it('returns an equivalent list when no reel-saved wordbook is present', () => {
    const projects = [{ id: 'a', title: '教科書' }];
    assert.deepEqual(excludeReelSavedProjects(projects), projects);
  });
});
