/**
 * Words saved one-by-one from the reel feed are collected in a single backing
 * wordbook so they can surface in 保存済み (favorites). That wordbook is an
 * internal bucket only — it must never be shown in the user-facing wordbook
 * lists (マイ単語帳 / home / project pickers). Filter it out with the helpers
 * below wherever wordbooks are displayed as browsable cards.
 */
export const REEL_SAVED_PROJECT_TITLE = 'リールで保存した単語';

/** Whether a project is the internal reel-saved backing wordbook. */
export function isReelSavedProject(project: { title: string }): boolean {
  return project.title === REEL_SAVED_PROJECT_TITLE;
}

/** Drop the internal reel-saved backing wordbook from a project list. */
export function excludeReelSavedProjects<T extends { title: string }>(projects: T[]): T[] {
  return projects.filter((project) => !isReelSavedProject(project));
}
