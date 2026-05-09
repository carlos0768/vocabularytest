import type { QuizContentResult } from '@/lib/ai/generate-quiz-content';
import { normalizePartOfSpeechTags } from '@/lib/ai/part-of-speech';

export interface QuizPrefillCandidateWord {
  id: string;
  english: string;
  japanese: string;
  distractors: unknown;
  example_sentence: unknown;
  example_sentence_ja?: unknown;
  pronunciation?: unknown;
  part_of_speech_tags: unknown;
}

export interface QuizPrefillSeedWord {
  id: string;
  english: string;
  japanese: string;
}

export interface QuizPrefillWordUpdatePayload {
  [key: string]: unknown;
  distractors: string[];
  part_of_speech_tags?: string[];
  pronunciation?: string;
  example_sentence?: string;
  example_sentence_ja?: string;
}

function hasValidDistractors(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  if (value.length < 3) return false;
  if (value.length === 3 && value[0] === '選択肢1') return false;
  return value.every((item) => typeof item === 'string' && item.trim().length > 0);
}

function hasExampleSentence(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasPartOfSpeechTags(value: unknown): boolean {
  return normalizePartOfSpeechTags(value).length > 0;
}

function hasPronunciation(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeGeneratedText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function buildQuizPrefillSeedWords(
  words: QuizPrefillCandidateWord[],
): QuizPrefillSeedWord[] {
  return words
    .filter((word) =>
      !hasValidDistractors(word.distractors) ||
      !hasExampleSentence(word.example_sentence) ||
      !hasPronunciation(word.pronunciation) ||
      !hasPartOfSpeechTags(word.part_of_speech_tags)
    )
    .map((word) => ({
      id: word.id,
      english: word.english,
      japanese: word.japanese,
    }));
}

export function buildQuizPrefillWordUpdatePayload(
  item: QuizContentResult,
): QuizPrefillWordUpdatePayload {
  const payload: QuizPrefillWordUpdatePayload = {
    distractors: item.distractors,
  };
  const partOfSpeechTags = normalizePartOfSpeechTags(item.partOfSpeechTags);
  const pronunciation = normalizeGeneratedText(item.pronunciation);
  const exampleSentence = normalizeGeneratedText(item.exampleSentence);
  const exampleSentenceJa = normalizeGeneratedText(item.exampleSentenceJa);

  if (partOfSpeechTags.length > 0) {
    payload.part_of_speech_tags = partOfSpeechTags;
  }
  if (pronunciation) {
    payload.pronunciation = pronunciation;
  }
  if (exampleSentence) {
    payload.example_sentence = exampleSentence;
  }
  if (exampleSentenceJa) {
    payload.example_sentence_ja = exampleSentenceJa;
  }

  return payload;
}
