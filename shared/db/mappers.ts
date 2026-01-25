// Shared database mapping functions for WordSnap (Web & Mobile)
// Converts between Supabase snake_case and TypeScript camelCase

import type { Project, Word } from '../types';

// ============ Default Values ============

export function getDefaultSpacedRepetitionFields() {
  return {
    easeFactor: 2.5,
    intervalDays: 0,
    repetition: 0,
  };
}

// ============ Project Mappers ============

export interface ProjectRow {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  share_id?: string | null;
  is_favorite?: boolean | null;
}

export function mapProjectFromRow(row: ProjectRow): Project {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    createdAt: row.created_at,
    shareId: row.share_id ?? undefined,
    isFavorite: row.is_favorite ?? false,
  };
}

export function mapProjectToInsert(project: Omit<Project, 'id' | 'createdAt'>): {
  user_id: string;
  title: string;
} {
  return {
    user_id: project.userId,
    title: project.title,
  };
}

export function mapProjectUpdates(updates: Partial<Project>): Record<string, unknown> {
  const updateData: Record<string, unknown> = {};
  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.shareId !== undefined) updateData.share_id = updates.shareId;
  if (updates.isFavorite !== undefined) updateData.is_favorite = updates.isFavorite;
  return updateData;
}

// ============ Word Mappers ============

export interface WordRow {
  id: string;
  project_id: string;
  english: string;
  japanese: string;
  distractors: string[];
  example_sentence?: string | null;
  example_sentence_ja?: string | null;
  status?: string | null;
  created_at: string;
  last_reviewed_at?: string | null;
  next_review_at?: string | null;
  ease_factor?: number | null;
  interval_days?: number | null;
  repetition?: number | null;
  is_favorite?: boolean | null;
}

export function mapWordFromRow(row: WordRow): Word {
  const defaultSR = getDefaultSpacedRepetitionFields();
  return {
    id: row.id,
    projectId: row.project_id,
    english: row.english,
    japanese: row.japanese,
    distractors: row.distractors,
    exampleSentence: row.example_sentence ?? undefined,
    exampleSentenceJa: row.example_sentence_ja ?? undefined,
    status: (row.status as Word['status']) ?? 'new',
    createdAt: row.created_at,
    lastReviewedAt: row.last_reviewed_at ?? undefined,
    nextReviewAt: row.next_review_at ?? undefined,
    easeFactor: row.ease_factor ?? defaultSR.easeFactor,
    intervalDays: row.interval_days ?? defaultSR.intervalDays,
    repetition: row.repetition ?? defaultSR.repetition,
    isFavorite: row.is_favorite ?? false,
  };
}

export type WordInput = Omit<Word, 'id' | 'createdAt' | 'easeFactor' | 'intervalDays' | 'repetition' | 'isFavorite' | 'lastReviewedAt' | 'nextReviewAt' | 'status'>;

export function mapWordToInsert(word: WordInput): {
  project_id: string;
  english: string;
  japanese: string;
  distractors: string[];
  example_sentence?: string;
  example_sentence_ja?: string;
  status: string;
  ease_factor: number;
  interval_days: number;
  repetition: number;
  is_favorite: boolean;
} {
  const defaultSR = getDefaultSpacedRepetitionFields();
  return {
    project_id: word.projectId,
    english: word.english,
    japanese: word.japanese,
    distractors: word.distractors,
    example_sentence: word.exampleSentence,
    example_sentence_ja: word.exampleSentenceJa,
    status: 'new',
    ease_factor: defaultSR.easeFactor,
    interval_days: defaultSR.intervalDays,
    repetition: defaultSR.repetition,
    is_favorite: false,
  };
}

export function mapWordUpdates(updates: Partial<Word>): Record<string, unknown> {
  const updateData: Record<string, unknown> = {};

  if (updates.english !== undefined) updateData.english = updates.english;
  if (updates.japanese !== undefined) updateData.japanese = updates.japanese;
  if (updates.distractors !== undefined) updateData.distractors = updates.distractors;
  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.exampleSentence !== undefined) updateData.example_sentence = updates.exampleSentence;
  if (updates.exampleSentenceJa !== undefined) updateData.example_sentence_ja = updates.exampleSentenceJa;

  // Spaced repetition fields
  if (updates.lastReviewedAt !== undefined) updateData.last_reviewed_at = updates.lastReviewedAt;
  if (updates.nextReviewAt !== undefined) updateData.next_review_at = updates.nextReviewAt;
  if (updates.easeFactor !== undefined) updateData.ease_factor = updates.easeFactor;
  if (updates.intervalDays !== undefined) updateData.interval_days = updates.intervalDays;
  if (updates.repetition !== undefined) updateData.repetition = updates.repetition;
  if (updates.isFavorite !== undefined) updateData.is_favorite = updates.isFavorite;

  return updateData;
}
