/**
 * Stages of the cross-page onboarding flow that teaches the
 * "view cards → take quiz" loop (see `useTutorialFlow`).
 *
 *   (null)         not started — home shows the "open your wordbook" tour
 *   open-flashcard project — guide to the flashcard button
 *   view-cards     flashcard — advance N cards, then a forced "go back" modal
 *   open-quiz      project (returned) — guide to the quiz button
 *   awaiting-quiz  quiz opened, waiting for a full completion
 *   done           flow complete — home reveals the play-button tip
 *   finished       play-button tip seen / whole flow skipped (terminal)
 */
export type TutorialStage =
  | 'open-flashcard'
  | 'view-cards'
  | 'open-quiz'
  | 'awaiting-quiz'
  | 'done'
  | 'finished';

export const TUTORIAL_STAGES: readonly TutorialStage[] = [
  'open-flashcard',
  'view-cards',
  'open-quiz',
  'awaiting-quiz',
  'done',
  'finished',
];

/**
 * Whether the project page itself runs a flow tour at this stage (the
 * flashcard / quiz button nudges). Only then does the word-list coach mark
 * (定着度 → A/P) have to wait, so the two never overlap.
 *
 * It must not wait on the other unfinished stages. 'view-cards' and
 * 'awaiting-quiz' only advance when the user flips enough cards / finishes a
 * whole quiz, and have no skip, so leaving a quiz half-way (or picking 音読,
 * which never reports back) left the stage there for good — and the A/P
 * explanation never showed on any wordbook again.
 */
export function isProjectPageFlowStage(stage: TutorialStage | null): boolean {
  return stage === 'open-flashcard' || stage === 'open-quiz';
}
