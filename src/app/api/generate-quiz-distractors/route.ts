import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import {
  generateQuizContentForWords,
  type QuizContentFieldNeeds,
  type QuizContentResult,
  type QuizContentWordInput,
} from '@/lib/ai/generate-quiz-content';
import {
  fetchLexiconQuizContent,
  saveQuizContentToLexicon,
} from '@/lib/lexicon/quiz-content-lexicon';
import { fetchExampleGenresForProUser } from '@/lib/preferences/example-genres';
import { isWordOrderEligible } from '@/lib/quiz/word-order';

interface WordInput {
  id: string;
  english: string;
  japanese: string;
}

interface ExistingWordRow {
  id: string;
  japanese?: string | null;
  distractors: unknown;
  example_sentence: string | null;
  pronunciation: string | null;
  part_of_speech_tags: unknown;
  lexicon_entry_id?: string | null;
  lexicon_sense_id?: string | null;
}

// 誤答選択肢は正解訳（sense）に対して意味を持つため、単語行の訳と
// リクエストの正解訳が一致する場合のみ sense 単位で使い回す。
function senseMatchesCorrectAnswer(row: ExistingWordRow, word: WordInput): boolean {
  return Boolean(row.lexicon_sense_id)
    && typeof row.japanese === 'string'
    && row.japanese.trim() === word.japanese.trim();
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
  return Array.isArray(value) && value.some((item) => typeof item === 'string' && item.trim().length > 0);
}

function hasPronunciation(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

const requestSchema = z.object({
  words: z.array(
    z.object({
      id: z.string().trim().min(1).max(80),
      english: z.string().trim().min(1).max(200),
      japanese: z.string().trim().min(1).max(300),
    }).strict(),
  ).min(1).max(30),
}).strict();

interface GenerateQuizDistractorsDeps {
  createClient?: typeof createRouteHandlerClient;
  generate?: typeof generateQuizContentForWords;
  fetchExampleGenres?: typeof fetchExampleGenresForProUser;
  fetchLexiconContent?: typeof fetchLexiconQuizContent;
  saveToLexicon?: typeof saveQuizContentToLexicon;
}

function getDeps(deps?: GenerateQuizDistractorsDeps) {
  return {
    createClient: deps?.createClient ?? createRouteHandlerClient,
    generate: deps?.generate ?? generateQuizContentForWords,
    fetchExampleGenres: deps?.fetchExampleGenres ?? fetchExampleGenresForProUser,
    fetchLexiconContent: deps?.fetchLexiconContent ?? fetchLexiconQuizContent,
    saveToLexicon: deps?.saveToLexicon ?? saveQuizContentToLexicon,
  };
}

export async function handleGenerateQuizDistractorsPost(
  request: NextRequest,
  deps?: GenerateQuizDistractorsDeps,
) {
  try {
    const { createClient, generate, fetchExampleGenres, fetchLexiconContent, saveToLexicon } = getDeps(deps);
    const supabase = await createClient(request);
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const { data: { user }, error: authError } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    const bodyResult = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '単語リストが必要です',
    });
    if (!bodyResult.ok) {
      return bodyResult.response;
    }

    const { words } = bodyResult.data as { words: WordInput[] };
    const multipleChoiceWords = words.filter((word) => !isWordOrderEligible(word));

    if (multipleChoiceWords.length === 0) {
      return NextResponse.json({
        success: true,
        results: [],
      });
    }

    const wordIds = multipleChoiceWords.map((word) => word.id);
    const wordRowsResult = await supabase
      .from('words')
      .select('id, japanese, distractors, example_sentence, pronunciation, part_of_speech_tags, lexicon_entry_id, lexicon_sense_id')
      .in('id', wordIds);

    let existingWordRows = (wordRowsResult.data ?? null) as ExistingWordRow[] | null;
    if (wordRowsResult.error) {
      // lexicon列が無い互換環境では従来の列のみで取得する。
      const fallbackResult = await supabase
        .from('words')
        .select('id, distractors, example_sentence, pronunciation, part_of_speech_tags')
        .in('id', wordIds);
      existingWordRows = (fallbackResult.data ?? null) as ExistingWordRow[] | null;
    }

    const existingWordMap = new Map<string, ExistingWordRow>(
      ((existingWordRows || []) as ExistingWordRow[]).map((row) => [row.id, row])
    );

    // 単語ごとに「欠けているフィールドだけ」を生成対象にする。
    // 既に値があるフィールド（enrich-manualの生成結果やmaster解決値など）は
    // 再生成せず、上書きもしない。
    type WordToGenerate = WordInput & { needs: QuizContentFieldNeeds };
    let wordsToGenerate: WordToGenerate[] = multipleChoiceWords
      .map((word) => {
        const existing = existingWordMap.get(word.id);
        const needs: QuizContentFieldNeeds = {
          distractors: !existing || !hasValidDistractors(existing.distractors),
          example: !existing || !hasExampleSentence(existing.example_sentence),
          pronunciation: !existing || !hasPronunciation(existing.pronunciation),
          pos: !existing || !hasPartOfSpeechTags(existing.part_of_speech_tags),
        };
        return { ...word, needs };
      })
      .filter((word) =>
        word.needs.distractors || word.needs.example || word.needs.pronunciation || word.needs.pos
      );

    if (wordsToGenerate.length === 0) {
      return NextResponse.json({
        success: true,
        results: [],
      });
    }

    // --- lexiconマスターからの使い回し ---
    // 誤答選択肢・発音記号がマスターに揃っていて他に生成すべきものが無い
    // 単語は、AI生成せずマスターの値をそのまま返す。
    const reusedResults: QuizContentResult[] = [];
    // 完全には揃わない単語でも、masterにある誤答・発音は再生成せず使い回す。
    const partialReuseByWordId = new Map<string, { distractors?: string[]; pronunciation?: string }>();
    const reuseCandidates = wordsToGenerate
      .map((word) => ({ word, row: existingWordMap.get(word.id) }))
      .filter((candidate): candidate is { word: WordToGenerate; row: ExistingWordRow } => Boolean(candidate.row));

    if (reuseCandidates.length > 0) {
      const lexicon = await fetchLexiconContent(
        {
          entryIds: reuseCandidates
            .filter(({ row }) => !hasPronunciation(row.pronunciation))
            .map(({ row }) => row.lexicon_entry_id),
          senseIds: reuseCandidates
            .filter(({ word, row }) => !hasValidDistractors(row.distractors) && senseMatchesCorrectAnswer(row, word))
            .map(({ row }) => row.lexicon_sense_id),
        },
        { client: supabase },
      );

      const satisfiedIds = new Set<string>();
      for (const { word, row } of reuseCandidates) {
        const reusedDistractors = !hasValidDistractors(row.distractors)
          && senseMatchesCorrectAnswer(row, word)
          && row.lexicon_sense_id
          ? lexicon.distractorsBySenseId.get(row.lexicon_sense_id)
          : undefined;
        const reusedPronunciation = !hasPronunciation(row.pronunciation) && row.lexicon_entry_id
          ? lexicon.pronunciationByEntryId.get(row.lexicon_entry_id)
          : undefined;
        if (!reusedDistractors && !reusedPronunciation) continue;

        const effectiveDistractors = reusedDistractors
          ?? (hasValidDistractors(row.distractors) ? (row.distractors as string[]) : null);
        const effectivePronunciation = reusedPronunciation
          ?? (hasPronunciation(row.pronunciation) ? (row.pronunciation as string) : '');

        const satisfied = Boolean(effectiveDistractors)
          && hasExampleSentence(row.example_sentence)
          && Boolean(effectivePronunciation)
          && hasPartOfSpeechTags(row.part_of_speech_tags);
        if (!satisfied) {
          // 一部フィールドだけmasterにある場合: そのフィールドの再生成を止め、
          // 生成結果へマージする（残りのフィールドだけAI生成される）。
          const partial: { distractors?: string[]; pronunciation?: string } = {};
          if (reusedDistractors) {
            word.needs.distractors = false;
            partial.distractors = reusedDistractors;
          }
          if (reusedPronunciation) {
            word.needs.pronunciation = false;
            partial.pronunciation = reusedPronunciation;
          }
          if (partial.distractors || partial.pronunciation) {
            partialReuseByWordId.set(word.id, partial);
          }
          continue;
        }

        satisfiedIds.add(word.id);
        reusedResults.push({
          wordId: word.id,
          distractors: effectiveDistractors as string[],
          partOfSpeechTags: [],
          pronunciation: reusedPronunciation ?? '',
          exampleSentence: '',
          exampleSentenceJa: '',
        });
      }

      wordsToGenerate = wordsToGenerate.filter((word) => !satisfiedIds.has(word.id));
    }

    let generatedResults: QuizContentResult[] = [];
    if (wordsToGenerate.length > 0) {
      // ジャンル反映はPro限定。非Pro/取得失敗時は空配列で通常生成。
      const exampleGenres = await fetchExampleGenres(supabase, user.id);
      generatedResults = await generate(
        wordsToGenerate as QuizContentWordInput[],
        { genres: exampleGenres }
      );

      // masterから部分再利用した誤答・発音を生成結果へマージして返す。
      generatedResults = generatedResults.map((result) => {
        const partial = partialReuseByWordId.get(result.wordId);
        if (!partial) return result;
        return {
          ...result,
          distractors: result.distractors.length > 0 ? result.distractors : (partial.distractors ?? []),
          pronunciation: result.pronunciation || partial.pronunciation || '',
        };
      });
    }

    const results = [...reusedResults, ...generatedResults];

    // AIで新規生成した誤答選択肢・発音記号を lexicon マスターへ書き戻す
    // （ベストエフォート・マスター側が空の場合のみ）。
    if (generatedResults.length > 0) {
      try {
        const inputById = new Map(multipleChoiceWords.map((word) => [word.id, word]));
        const lexiconWriteBack = generatedResults
          .map((result) => {
            const row = existingWordMap.get(result.wordId);
            const input = inputById.get(result.wordId);
            if (!row || !input) return null;
            if (!row.lexicon_entry_id && !row.lexicon_sense_id) return null;
            return {
              lexiconEntryId: row.lexicon_entry_id,
              lexiconSenseId: senseMatchesCorrectAnswer(row, input) ? row.lexicon_sense_id : null,
              pronunciation: result.pronunciation,
              distractors: result.distractors,
            };
          })
          .filter((update): update is NonNullable<typeof update> => update !== null);

        if (lexiconWriteBack.length > 0) {
          await saveToLexicon(lexiconWriteBack);
        }
      } catch (lexiconError) {
        console.error('Lexicon quiz content write-back failed (non-critical):', lexiconError);
      }
    }

    const resultsForDb = results.filter((r) => r.exampleSentence || r.partOfSpeechTags.length > 0 || r.pronunciation);
    if (resultsForDb.length > 0) {
      for (const result of resultsForDb) {
        const existing = existingWordMap.get(result.wordId);
        if (!existing) continue;
        // 既にDBに値があるカラムは上書きしない（enrich-manualやスキャン時の
        // 生成結果を、クイズ開始時の再生成で潰さないための二重の安全策）。
        const updateData: Record<string, unknown> = {};
        if (result.exampleSentence && !hasExampleSentence(existing.example_sentence)) {
          updateData.example_sentence = result.exampleSentence;
          updateData.example_sentence_ja = result.exampleSentenceJa;
        }
        if (result.partOfSpeechTags.length > 0 && !hasPartOfSpeechTags(existing.part_of_speech_tags)) {
          updateData.part_of_speech_tags = result.partOfSpeechTags;
        }
        if (result.pronunciation && !hasPronunciation(existing.pronunciation)) {
          updateData.pronunciation = result.pronunciation;
        }
        if (Object.keys(updateData).length === 0) continue;
        await supabase
          .from('words')
          .update(updateData)
          .eq('id', result.wordId)
          .then(({ error }) => {
            if (error) {
              console.error(`Failed to save example for ${result.wordId}:`, error);
            }
          });
      }
    }

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('Generate quiz distractors error:', error);
    return NextResponse.json(
      { success: false, error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return handleGenerateQuizDistractorsPost(request);
}
