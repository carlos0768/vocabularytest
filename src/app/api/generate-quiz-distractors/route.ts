import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import {
  generateQuizContentForWords,
  type QuizContentWordInput,
} from '@/lib/ai/generate-quiz-content';
import { fetchExampleGenresForProUser } from '@/lib/preferences/example-genres';
import { isWordOrderEligible } from '@/lib/quiz/word-order';

interface WordInput {
  id: string;
  english: string;
  japanese: string;
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
}

function getDeps(deps?: GenerateQuizDistractorsDeps) {
  return {
    createClient: deps?.createClient ?? createRouteHandlerClient,
    generate: deps?.generate ?? generateQuizContentForWords,
    fetchExampleGenres: deps?.fetchExampleGenres ?? fetchExampleGenresForProUser,
  };
}

export async function handleGenerateQuizDistractorsPost(
  request: NextRequest,
  deps?: GenerateQuizDistractorsDeps,
) {
  try {
    const { createClient, generate, fetchExampleGenres } = getDeps(deps);
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
    const { data: existingWordRows } = await supabase
      .from('words')
      .select('id, distractors, example_sentence, pronunciation, part_of_speech_tags')
      .in('id', wordIds);

    const existingWordMap = new Map(
      (
        existingWordRows || []
      ).map((row: {
        id: string;
        distractors: unknown;
        example_sentence: string | null;
        pronunciation: string | null;
        part_of_speech_tags: unknown;
      }) => [row.id, row])
    );

    const wordsToGenerate = multipleChoiceWords.filter((word) => {
      const existing = existingWordMap.get(word.id);
      if (!existing) return true;
      return (
        !hasValidDistractors(existing.distractors) ||
        !hasExampleSentence(existing.example_sentence) ||
        !hasPronunciation(existing.pronunciation) ||
        !hasPartOfSpeechTags(existing.part_of_speech_tags)
      );
    });

    if (wordsToGenerate.length === 0) {
      return NextResponse.json({
        success: true,
        results: [],
      });
    }

    // ジャンル反映はPro限定。非Pro/取得失敗時は空配列で通常生成。
    const exampleGenres = await fetchExampleGenres(supabase, user.id);
    const results = await generate(
      wordsToGenerate as QuizContentWordInput[],
      { genres: exampleGenres }
    );

    const resultsForDb = results.filter((r) => r.exampleSentence || r.partOfSpeechTags.length > 0 || r.pronunciation);
    if (resultsForDb.length > 0) {
      for (const result of resultsForDb) {
        if (!existingWordMap.has(result.wordId)) continue;
        const updateData: Record<string, unknown> = {};
        if (result.exampleSentence) {
          updateData.example_sentence = result.exampleSentence;
          updateData.example_sentence_ja = result.exampleSentenceJa;
        }
        if (result.partOfSpeechTags.length > 0) {
          updateData.part_of_speech_tags = result.partOfSpeechTags;
        }
        if (result.pronunciation) {
          updateData.pronunciation = result.pronunciation;
        }
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
