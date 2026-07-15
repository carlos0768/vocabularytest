import type { QuizContentFieldNeeds, QuizContentResult } from '@/lib/ai/generate-quiz-content';
import { normalizePartOfSpeechTags } from '@/lib/ai/part-of-speech';
import type { LexiconQuizContentUpdate } from '@/lib/lexicon/quiz-content-lexicon';
import { isWordOrderEligible } from '@/lib/quiz/word-order';

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
  /** 生成が必要なフィールドのみ true。既に値がある（master解決済み等）フィールドは再生成しない。 */
  needs: QuizContentFieldNeeds;
}

export interface QuizPrefillWordUpdatePayload {
  [key: string]: unknown;
  distractors?: string[];
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

export function buildQuizPrefillNeeds(word: {
  distractors: unknown;
  example_sentence: unknown;
  pronunciation?: unknown;
  part_of_speech_tags: unknown;
}): QuizContentFieldNeeds {
  return {
    distractors: !hasValidDistractors(word.distractors),
    example: !hasExampleSentence(word.example_sentence),
    pronunciation: !hasPronunciation(word.pronunciation),
    pos: !hasPartOfSpeechTags(word.part_of_speech_tags),
  };
}

function hasAnyNeed(needs: QuizContentFieldNeeds): boolean {
  return Boolean(needs.distractors || needs.example || needs.pronunciation || needs.pos);
}

export function buildQuizPrefillSeedWords(
  words: QuizPrefillCandidateWord[],
): QuizPrefillSeedWord[] {
  return words
    .map((word) => ({ word, needs: buildQuizPrefillNeeds(word) }))
    .filter(({ word, needs }) => !isWordOrderEligible(word) && hasAnyNeed(needs))
    .map(({ word, needs }) => ({
      id: word.id,
      english: word.english,
      japanese: word.japanese,
      needs,
    }));
}

export interface QuizPrefillLexiconLinkWord {
  id: string;
  lexicon_entry_id?: string | null;
  lexicon_sense_id?: string | null;
}

/**
 * 生成したクイズ内容（誤答選択肢・発音記号）を lexicon マスターへ
 * 書き戻すための更新リストを組み立てる。lexicon に紐付かない単語は除外。
 */
export function buildQuizPrefillLexiconUpdates(
  results: QuizContentResult[],
  words: QuizPrefillLexiconLinkWord[],
): LexiconQuizContentUpdate[] {
  const wordById = new Map(words.map((word) => [word.id, word]));
  const updates: LexiconQuizContentUpdate[] = [];

  for (const item of results) {
    const word = wordById.get(item.wordId);
    if (!word) continue;
    if (!word.lexicon_entry_id && !word.lexicon_sense_id) continue;
    updates.push({
      lexiconEntryId: word.lexicon_entry_id,
      lexiconSenseId: word.lexicon_sense_id,
      pronunciation: item.pronunciation,
      distractors: item.distractors,
    });
  }

  return updates;
}

export function buildQuizPrefillWordUpdatePayload(
  item: QuizContentResult,
): QuizPrefillWordUpdatePayload {
  const payload: QuizPrefillWordUpdatePayload = {};
  // 生成対象外だった（=既に有効な値がある）フィールドは結果が空で返るため、
  // 空のまま payload に含めて既存値を上書きしないようスキップする。
  if (Array.isArray(item.distractors) && item.distractors.length >= 3) {
    payload.distractors = item.distractors;
  }
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
