import { z } from 'zod';
import { AI_CONFIG, type ResponseSchema } from '@/lib/ai/config';
import { getProviderFromConfig } from '@/lib/ai/providers';
import { parseJsonResponse } from '@/lib/ai/utils/json';

export interface VoiceQuizPromptWordInput {
  id: string;
  english: string;
  japanese: string;
  exampleSentence?: string;
}

export interface GeneratedVoiceQuizPromptResult {
  wordId: string;
  prompt: string;
}

const MAX_PROMPT_LENGTH = 120;

const voiceQuizPromptResponseSchema = z.object({
  results: z.array(z.object({
    id: z.string().trim().min(1),
    prompt: z.string().trim().min(1).max(MAX_PROMPT_LENGTH),
  })).default([]),
});

/** Gemini Controlled Generation schema mirroring `voiceQuizPromptResponseSchema`. */
export const VOICE_QUIZ_PROMPT_RESPONSE_SCHEMA: ResponseSchema = {
  type: 'OBJECT',
  properties: {
    results: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          prompt: { type: 'STRING' },
        },
        required: ['id', 'prompt'],
        propertyOrdering: ['id', 'prompt'],
      },
    },
  },
  required: ['results'],
};

const VOICE_QUIZ_PROMPT_SYSTEM_PROMPT = `あなたは子供に英単語テストを口頭で出題する保護者です。与えられた英単語とその日本語訳をもとに、声に出して読み上げるための自然な出題文（日本語）を単語ごとに1つ作成してください。

【最重要ルール】正解がバレないようにする:
- 出題文は日本語のみで書く。英単語そのもの・そのスペル・カタカナ読みを絶対に含めない
- 出題文の中に正解の英単語と綴りが同じ/似ているアルファベット表記を書かない

【出題文のスタイル】
- 「〜という意味の英単語は何でしょう?」のような単調な言い回しだけでなく、
  例文の穴埋め風の出題（例文が与えられている場合）、使い方のヒント、
  類義語からの連想など、表現にバリエーションを持たせる
- 読み上げて自然な長さにする（目安30〜50文字、長くても${MAX_PROMPT_LENGTH}文字以内）
- 例文が与えられている場合は、その文脈を活かしてよい（英単語自体は空欄扱いにして含めない）
- 出題文の最後は必ず「英語で何と言う?」「英語で答えてください」のように、回答を促す一言で締める

【出力フォーマット】
必ず以下のJSON形式のみを出力してください:
{
  "results": [
    { "id": "単語のID", "prompt": "「明確にする」という意味の単語、英語で何と言う?" }
  ]
}`;

export function buildVoiceQuizPromptRequest(words: VoiceQuizPromptWordInput[]): string {
  const wordList = words
    .map((word, index) => {
      const example = word.exampleSentence ? ` / 例文: ${word.exampleSentence}` : '';
      return `${index + 1}. ID: ${word.id} / 英語: ${word.english} / 日本語（正解）: ${word.japanese}${example}`;
    })
    .join('\n');

  return `${VOICE_QUIZ_PROMPT_SYSTEM_PROMPT}\n\n以下の${words.length}個の単語に対して出題文を作成してください:\n\n${wordList}`;
}

/**
 * 生成された出題文に英単語そのものが紛れ込んでいないか検査する。
 * 含まれていた場合は正解が漏れるため、その単語の結果は破棄する。
 */
export function promptLeaksAnswer(prompt: string, english: string): boolean {
  const normalizedPrompt = prompt.toLowerCase();
  const normalizedEnglish = english.trim().toLowerCase();
  if (!normalizedEnglish) return false;
  return normalizedPrompt.includes(normalizedEnglish);
}

export function buildVoiceQuizPromptResults(
  rawResults: Array<{ id: string; prompt: string }>,
  words: VoiceQuizPromptWordInput[],
): GeneratedVoiceQuizPromptResult[] {
  const inputById = new Map(words.map((word) => [word.id, word]));

  return rawResults
    .map((item) => {
      const word = inputById.get(item.id);
      if (!word) return null;
      if (promptLeaksAnswer(item.prompt, word.english)) return null;
      return { wordId: item.id, prompt: item.prompt };
    })
    .filter((item): item is GeneratedVoiceQuizPromptResult => Boolean(item));
}

export async function generateVoiceQuizPromptsForWords(
  words: VoiceQuizPromptWordInput[],
): Promise<GeneratedVoiceQuizPromptResult[]> {
  if (words.length === 0) return [];

  const config = {
    ...AI_CONFIG.defaults.gemini,
    temperature: 0.8,
    maxOutputTokens: 4096,
    responseFormat: 'json' as const,
    responseSchema: VOICE_QUIZ_PROMPT_RESPONSE_SCHEMA,
  };
  const provider = getProviderFromConfig(config, {
    gemini: process.env.GOOGLE_AI_API_KEY,
    openai: process.env.OPENAI_API_KEY,
  });

  const result = await provider.generateText(buildVoiceQuizPromptRequest(words), config);
  if (!result.success || !result.content?.trim()) {
    throw new Error(result.success ? 'AI voice-quiz-prompt response is empty' : result.error);
  }

  const parsed = voiceQuizPromptResponseSchema.parse(parseJsonResponse(result.content));
  return buildVoiceQuizPromptResults(parsed.results, words);
}
