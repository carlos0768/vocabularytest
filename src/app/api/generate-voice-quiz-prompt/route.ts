import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { parseJsonWithSchema } from '@/lib/api/validation';
import {
  generateVoiceQuizPromptsForWords,
  type VoiceQuizPromptWordInput,
} from '@/lib/ai/generate-voice-quiz-prompt';

const requestSchema = z.object({
  words: z.array(z.object({
    id: z.string().trim().min(1).max(80),
    english: z.string().trim().min(1).max(200),
    japanese: z.string().trim().min(1).max(300),
    exampleSentence: z.string().trim().max(500).optional(),
  }).strict()).min(1).max(30),
}).strict();

interface GenerateVoiceQuizPromptDeps {
  createClient?: typeof createRouteHandlerClient;
  generate?: typeof generateVoiceQuizPromptsForWords;
}

function getDeps(deps?: GenerateVoiceQuizPromptDeps) {
  return {
    createClient: deps?.createClient ?? createRouteHandlerClient,
    generate: deps?.generate ?? generateVoiceQuizPromptsForWords,
  };
}

export async function handleGenerateVoiceQuizPromptPost(
  request: NextRequest,
  deps?: GenerateVoiceQuizPromptDeps,
) {
  try {
    const { createClient, generate } = getDeps(deps);
    const supabase = await createClient(request);
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const { data: { user }, error: authError } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 },
      );
    }

    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '単語リストが必要です',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const { words } = parsed.data as { words: VoiceQuizPromptWordInput[] };
    const results = await generate(words);

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('Generate voice-quiz prompt error:', error);
    return NextResponse.json(
      { success: false, error: '予期しないエラーが発生しました' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return handleGenerateVoiceQuizPromptPost(request);
}
