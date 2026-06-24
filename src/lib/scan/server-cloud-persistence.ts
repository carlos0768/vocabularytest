import { mergeSourceLabels } from '../../../shared/source-labels';
import type { ExtractMode } from '@/lib/scan/mode-provider';
import type { CustomSection } from '@/types';

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
  japaneseSource?: 'scan' | 'ai';
  lexiconEntryId?: string;
  lexiconSenseId?: string;
  distractors: string[];
  exampleSentence?: string;
  exampleSentenceJa?: string;
  pronunciation?: string;
  partOfSpeechTags?: string[];
  sourceModes?: ExtractMode[];
  customSections?: CustomSection[];
}

export interface ServerCloudWordInsertPayload {
  project_id: string;
  english: string;
  japanese: string;
  japanese_source: 'scan' | 'ai' | null;
  lexicon_entry_id: string | null;
  lexicon_sense_id: string | null;
  distractors: string[];
  example_sentence: string | null;
  example_sentence_ja: string | null;
  pronunciation: string | null;
  part_of_speech_tags?: string[];
  source_modes?: ExtractMode[];
  custom_sections: CustomSection[];
}

type MaybePostgrestColumnError = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
};

export type MissingWordsCompatColumn = 'source_modes' | 'lexicon_sense_id';

export type ServerCloudWordsInsertCompatOptions = {
  omitSourceModes?: boolean;
  omitLexiconSenseId?: boolean;
};

const SERVER_CLOUD_WORD_INSERT_SELECT_BASE_COLUMNS = [
  'id',
  'english',
  'japanese',
  'japanese_source',
  'lexicon_entry_id',
  'lexicon_sense_id',
  'distractors',
  'example_sentence',
  'example_sentence_ja',
  'pronunciation',
  'part_of_speech_tags',
  'word_order_quiz',
] as const;

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
    japanese_source: word.japaneseSource ?? null,
    lexicon_entry_id: word.lexiconEntryId ?? null,
    lexicon_sense_id: word.lexiconSenseId ?? null,
    distractors: word.distractors,
    example_sentence: word.exampleSentence || null,
    example_sentence_ja: word.exampleSentenceJa || null,
    pronunciation: word.pronunciation || null,
    part_of_speech_tags: word.partOfSpeechTags,
    source_modes: word.sourceModes,
    custom_sections: word.customSections ?? [],
  }));
}

export function getMissingWordsCompatColumn(error: unknown): MissingWordsCompatColumn | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }

  const candidate = error as MaybePostgrestColumnError;
  if (candidate.code !== '42703' && candidate.code !== 'PGRST204') {
    return null;
  }

  const message = `${candidate.message ?? ''} ${candidate.details ?? ''} ${candidate.hint ?? ''}`.toLowerCase();
  if (
    message.includes('words.source_modes')
    || message.includes("'source_modes' column of 'words'")
    || message.includes('source_modes')
  ) {
    return 'source_modes';
  }

  if (
    message.includes('words.lexicon_sense_id')
    || message.includes("'lexicon_sense_id' column of 'words'")
    || message.includes('lexicon_sense_id')
  ) {
    return 'lexicon_sense_id';
  }

  return null;
}

export function isMissingWordsSourceModesColumn(error: unknown): boolean {
  return getMissingWordsCompatColumn(error) === 'source_modes';
}

export function isMissingWordsLexiconSenseIdColumn(error: unknown): boolean {
  return getMissingWordsCompatColumn(error) === 'lexicon_sense_id';
}

export function getServerCloudWordsInsertSelectColumns(
  options: ServerCloudWordsInsertCompatOptions = {},
): string {
  return SERVER_CLOUD_WORD_INSERT_SELECT_BASE_COLUMNS
    .filter((column) => !(options.omitLexiconSenseId && column === 'lexicon_sense_id'))
    .join(', ');
}

export function stripServerCloudWordsInsertPayloadForCompat(
  payload: ServerCloudWordInsertPayload[],
  options: ServerCloudWordsInsertCompatOptions,
): Record<string, unknown>[] {
  return payload.map((word) => {
    const row: Record<string, unknown> = {
      project_id: word.project_id,
      english: word.english,
      japanese: word.japanese,
      japanese_source: word.japanese_source,
      lexicon_entry_id: word.lexicon_entry_id,
      distractors: word.distractors,
      example_sentence: word.example_sentence,
      example_sentence_ja: word.example_sentence_ja,
      pronunciation: word.pronunciation,
      part_of_speech_tags: word.part_of_speech_tags,
      custom_sections: word.custom_sections,
    };

    if (!options.omitLexiconSenseId) {
      row.lexicon_sense_id = word.lexicon_sense_id;
    }
    if (!options.omitSourceModes) {
      row.source_modes = word.source_modes;
    }

    return row;
  });
}

export function stripSourceModesFromServerCloudWordsInsertPayload(
  payload: ServerCloudWordInsertPayload[],
): Omit<ServerCloudWordInsertPayload, 'source_modes'>[] {
  return stripServerCloudWordsInsertPayloadForCompat(payload, { omitSourceModes: true }) as Omit<ServerCloudWordInsertPayload, 'source_modes'>[];
}

export function shouldRollbackServerCloudProjectAfterWordsInsertFailure(params: {
  createdNewProject: boolean;
  wordsInsertError: unknown;
}): boolean {
  return params.createdNewProject && Boolean(params.wordsInsertError);
}
