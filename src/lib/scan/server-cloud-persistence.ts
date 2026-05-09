import { mergeSourceLabels } from '../../../shared/source-labels';

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
}

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
  }));
}

export function shouldRollbackServerCloudProjectAfterWordsInsertFailure(params: {
  createdNewProject: boolean;
  wordsInsertError: unknown;
}): boolean {
  return params.createdNewProject && Boolean(params.wordsInsertError);
}
