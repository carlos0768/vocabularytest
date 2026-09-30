import test from 'node:test';
import assert from 'node:assert/strict';

import { isProjectPageFlowStage, TUTORIAL_STAGES } from './tutorial-stage';

test('the project page only holds the A/P coach mark while it shows its own flow tour', () => {
  assert.equal(isProjectPageFlowStage('open-flashcard'), true);
  assert.equal(isProjectPageFlowStage('open-quiz'), true);
});

test('an unfinished flow elsewhere does not hide the A/P coach mark', () => {
  // 'view-cards' / 'awaiting-quiz' have no skip: a quiz left half-way (or 音読,
  // which never reports back) kept the stage there and hid A/P for good.
  for (const stage of ['view-cards', 'awaiting-quiz', 'done', 'finished', null] as const) {
    assert.equal(isProjectPageFlowStage(stage), false, `stage ${stage}`);
  }
});

test('every stage is covered by the two cases above', () => {
  const covered = new Set(['open-flashcard', 'open-quiz', 'view-cards', 'awaiting-quiz', 'done', 'finished']);
  assert.deepEqual(new Set(TUTORIAL_STAGES), covered);
});
