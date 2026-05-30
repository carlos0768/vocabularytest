import { parseAIResponse, type ValidatedAIResponse } from '@/lib/schemas/ai-response';
import {
  type ExtractMode,
  getPrimaryExtractMode,
  normalizeExtractModes,
} from '@/lib/scan/mode-provider';
import { AI_CONFIG } from './config';
import { getProviderFromConfig, AIError } from './providers';
import { prepareImageForProvider } from './utils/image';
import { safeParseJSON } from './utils/json';
import { getEikenFilterInstruction } from './prompts';
import { SOURCE_LABEL_NOTES, SOURCE_LABEL_OUTPUT_SNIPPET, SOURCE_LABEL_RULES } from './prompts/source-labels';

export type CompositeExtractionResult =
  | { success: true; data: ValidatedAIResponse }
  | { success: false; error: string };

export interface CompositeExtractionOptions {
  modes: ExtractMode[];
  eikenLevel?: string | null;
}

const MODE_LABELS: Record<ExtractMode, string> = {
  all: 'すべての単語',
  circled: '丸囲み',
  eiken: '英検',
  idiom: '熟語・イディオム',
};

function buildModeInstructions(modes: ExtractMode[], eikenLevel: string | null): string {
  const instructions: string[] = [];

  if (modes.includes('all')) {
    instructions.push(`- all: 画像内の英単語から、学習価値の高い語を難しい順に抽出してください。冠詞・代名詞・be/have/do/get などの基礎語は除外してください。`);
  }

  if (modes.includes('circled')) {
    instructions.push(`- circled: ユーザーが手書きで丸（○/楕円）を付けた英単語、または丸が付いた日本語訳に対応する英単語を抽出対象に含めてください。丸かどうか不確実なものは circled 扱いにしないでください。`);
  }

  if (modes.includes('idiom')) {
    instructions.push(`- idiom: 熟語・イディオム・句動詞・複数語表現を抽出対象に含め、個々の単語に分解せずフレーズ全体を english に入れてください。partOfSpeechTags には "idiom" または "phrasal_verb" を優先してください。`);
  }

  if (modes.includes('eiken')) {
    instructions.push(`- eiken: 英検レベル条件に該当する重要語を抽出対象に含めてください。${getEikenFilterInstruction(eikenLevel)}`);
  }

  return instructions.join('\n');
}

function buildCompositeExtractionPrompts(options: CompositeExtractionOptions): {
  systemPrompt: string;
  userPrompt: string;
} {
  const modes = normalizeExtractModes(options.modes);
  const modeLabels = modes.map((mode) => MODE_LABELS[mode]).join('、');
  const modeValues = modes.map((mode) => `"${mode}"`).join(', ');

  return {
    systemPrompt: `あなたは英語学習教材の画像解析者です。ユーザーが選択した複数の抽出条件を1回の画像理解で同時に満たし、JSON形式で返してください。

選択された抽出条件: ${modeLabels}

重要方針:
- 出力は選択条件の「和集合」です。複数条件をすべて満たす語だけに絞る積集合ではありません。
- 各モードを必ず独立した抽出タスクとして処理してください。1つのモードの条件を、他のモードの候補を除外するフィルターに使ってはいけません。
- 手順: 選択された各モードごとに候補リストを作り、その後で同じ英語表現だけを統合してください。
- 同じ英語表現が複数条件に該当する場合は1件だけ返し、sourceModes に該当モードをすべて入れてください。
- sourceModes は必ず選択されたモードの中から選びます。使用可能な値: ${modeValues}
- 例: circled と idiom が選択された場合、丸囲みの単語は熟語でなくても返し、熟語は丸囲みでなくても返してください。
- 例: all と idiom が選択された場合、通常の重要語と熟語の両方を返してください。all を選んだからといって idiom の候補を省略してはいけません。
- 画像内に日本語訳が見えている場合は japanese にその訳を入れ、japaneseSource は "scan" にしてください。
- 日本語訳が画像内にない場合は japanese は "" にし、japaneseSource は付けないでください。
- 推測で日本語訳を作らないでください。
- 出力は最大40件までにしてください。質を優先し、重複や基礎語を避けてください。

抽出条件別の追加ルール:
${buildModeInstructions(modes, options.eikenLevel ?? null)}

${SOURCE_LABEL_RULES}

出力フォーマット:
{
${SOURCE_LABEL_OUTPUT_SNIPPET}
  "words": [
    {
      "english": "look forward to",
      "japanese": "〜を楽しみに待つ",
      "japaneseSource": "scan",
      "sourceModes": ["idiom", "all"],
      "distractors": [],
      "partOfSpeechTags": ["idiom"]
    }
  ]
}

注意:
- JSONのみを返してください。
- sourceModes が空の単語は返さないでください。
- 見つからない場合は {"sourceLabels": [], "words": []} を返してください。
${SOURCE_LABEL_NOTES}`,
    userPrompt: `この画像から、選択条件（${modeLabels}）の和集合として学習対象を抽出してください。各単語・フレーズに sourceModes を必ず付けてください。`,
  };
}

function fallbackSourceModes<T extends { sourceModes?: unknown }>(
  words: T[],
  modes: ExtractMode[],
): T[] {
  const normalizedModes = normalizeExtractModes(modes);
  return words.map((word) => {
    const sourceModes = normalizeExtractModes(word.sourceModes, []);
    return {
      ...word,
      sourceModes: sourceModes.length > 0 ? sourceModes : normalizedModes,
    };
  });
}

export async function extractCompositeWordsFromImage(
  imageBase64: string,
  apiKeys: { gemini?: string; openai?: string },
  options: CompositeExtractionOptions,
): Promise<CompositeExtractionResult> {
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    console.error('Invalid imageBase64:', typeof imageBase64, imageBase64?.length);
    return { success: false, error: '画像データが無効です' };
  }

  if (imageBase64.startsWith('data:') && !imageBase64.includes(',')) {
    console.error('Invalid data URL format: no comma found');
    return { success: false, error: '画像データの形式が不正です' };
  }

  const modes = normalizeExtractModes(options.modes);
  const config = AI_CONFIG.extraction.words;
  console.log('AI API call (composite extraction):', {
    provider: config.provider,
    model: config.model,
    modes,
    primaryMode: getPrimaryExtractMode(modes),
    imageLength: imageBase64.length,
    startsWithData: imageBase64.startsWith('data:'),
  });

  const provider = getProviderFromConfig(config, apiKeys);
  const { systemPrompt, userPrompt } = buildCompositeExtractionPrompts({
    modes,
    eikenLevel: options.eikenLevel ?? null,
  });
  const image = prepareImageForProvider(imageBase64);

  try {
    const response = await provider.generate({
      systemPrompt,
      prompt: userPrompt,
      image,
      config: {
        ...config,
        responseFormat: 'json',
      },
    });

    if (!response.success) {
      return { success: false, error: response.error || '画像を読み取れませんでした' };
    }

    const content = response.content;
    if (!content) {
      return { success: false, error: '画像を読み取れませんでした' };
    }

    const parseResult = safeParseJSON(content);
    if (!parseResult.success) {
      console.error('JSON parse error:', parseResult.error);
      console.error('Raw content (first 500 chars):', content.slice(0, 500));
      return { success: false, error: 'AIの応答を解析できませんでした' };
    }

    const validated = parseAIResponse(parseResult.data);
    if (!validated.success) {
      return {
        success: false,
        error: validated.error || 'データ形式が不正です',
      };
    }

    if (validated.data!.words.length === 0) {
      return {
        success: false,
        error: '画像から単語を読み取れませんでした。もう一度撮影してください。',
      };
    }

    return {
      success: true,
      data: {
        ...validated.data!,
        words: fallbackSourceModes(validated.data!.words, modes),
      },
    };
  } catch (error) {
    console.error('AI composite extraction error:', error);

    if (error instanceof AIError) {
      return { success: false, error: error.message };
    }

    return {
      success: false,
      error: '画像の解析に失敗しました。もう一度お試しください。',
    };
  }
}

export const __internal = {
  buildCompositeExtractionPrompts,
  fallbackSourceModes,
};
