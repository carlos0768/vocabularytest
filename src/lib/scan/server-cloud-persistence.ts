import { mergeSourceLabels } from '../../../shared/source-labels';
import type { ExtractMode } from '@/lib/scan/mode-provider';

export interface ServerCloudProjectInsertParams {
  userId: string;
  projectTitle: string;
  sourceLabels: string[];
  projectIconImage?: string | null;
}

export interface ServerCloudProjectInsertPayload {
  [key: string]: unknown;
  user_id: string;
  title: string;
  source_labels: string[];
  icon_image: string | null;
}

export interface ServerCloudWordForInsert {
  english: string;
  japanese: string;
  lexiconEntryId?: string;
  distractors: string[];
  exampleSentence?: string;
  exampleSentenceJa?: string;
  pronunciation?: string;
  partOfSpeechTags?: string[];
  sourceModes?: ExtractMode[];
}

export interface ServerCloudWordInsertPayload {
  project_id: string;
  english: string;
  japanese: string;
  lexicon_entry_id: string | null;
  distractors: string[];
  example_sentence: string | null;
  example_sentence_ja: string | null;
  pronunciation: string | null;
  part_of_speech_tags?: string[];
  source_modes?: ExtractMode[];
}

type MaybePostgrestColumnError = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
};

export function buildServerCloudProjectInsertPayload(
  params: ServerCloudProjectInsertParams,
): ServerCloudProjectInsertPayload {
  return {
    user_id: params.userId,
    title: params.projectTitle,
    source_labels: params.sourceLabels,
    icon_image: params.projectIconImage ?? null,
  };
}

export function buildServerCloudMergedProjectSourceLabels(params: {
  existingSourceLabels?: Iterable<unknown> | null;
  scanSourceLabels: Iterable<unknown>;
}): string[] {
  return mergeSourceLabels(params.existingSourceLabels, params.scanSourceLabels);
}

export function buildServerCloudWordsInsertPayload(
  words: ServerCloudWordForInsert[],
  projectId: string,
): ServerCloudWordInsertPayload[] {
  return words.map((word) => ({
    project_id: projectId,
    english: word.english,
    japanese: word.japanese,
    lexicon_entry_id: word.lexiconEntryId ?? null,
    distractors: word.distractors,
    example_sentence: word.exampleSentence || null,
    example_sentence_ja: word.exampleSentenceJa || null,
    pronunciation: word.pronunciation || null,
    part_of_speech_tags: word.partOfSpeechTags,
    source_modes: word.sourceModes,
  }));
}

export function isMissingWordsSourceModesColumn(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidate = error as MaybePostgrestColumnError;
  if (candidate.code !== '42703' && candidate.code !== 'PGRST204') {
    return false;
  }

  const message = `${candidate.message ?? ''} ${candidate.details ?? ''} ${candidate.hint ?? ''}`.toLowerCase();
  return (
    message.includes('words.source_modes')
    || message.includes("'source_modes' column of 'words'")
    || message.includes('source_modes')
  );
}

export function stripSourceModesFromServerCloudWordsInsertPayload(
  payload: ServerCloudWordInsertPayload[],
): Omit<ServerCloudWordInsertPayload, 'source_modes'>[] {
  return payload.map((word) => ({
    project_id: word.project_id,
    english: word.english,
    japanese: word.japanese,
    lexicon_entry_id: word.lexicon_entry_id,
    distractors: word.distractors,
    example_sentence: word.example_sentence,
    example_sentence_ja: word.example_sentence_ja,
    pronunciation: word.pronunciation,
    part_of_speech_tags: word.part_of_speech_tags,
  }));
}

export function shouldRollbackServerCloudProjectAfterWordsInsertFailure(params: {
  createdNewProject: boolean;
  wordsInsertError: unknown;
}): boolean {
  return params.createdNewProject && Boolean(params.wordsInsertError);
}
