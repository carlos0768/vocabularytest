import type { AIWordExtraction } from '../../types';

const API_URL = 'https://api.openai.com/v1/chat/completions';

// System prompt for word extraction
const SYSTEM_PROMPT = `あなたは英語学習のアシスタントです。
ユーザーがアップロードした画像（手書きノートやプリント）から英単語を抽出し、日本語訳と間違い選択肢を生成してください。

以下のJSON形式で回答してください。他のテキストは含めないでください：
{
  "words": [
    {
      "english": "英単語",
      "japanese": "日本語訳",
      "distractors": ["間違い選択肢1", "間違い選択肢2", "間違い選択肢3"]
    }
  ]
}

重要なルール:
1. 英単語はそのまま抽出してください
2. 日本語訳は簡潔で正確なものにしてください
3. distractorsは3つの紛らわしい間違い選択肢を生成してください
   - 正解と似た意味や形の単語を選んでください
   - 正解と同じ品詞にしてください
   - 明らかに違う選択肢は避けてください
4. 画像から読み取れない場合は空の配列を返してください`;

export interface ExtractWordsResult {
  success: boolean;
  words?: AIWordExtraction[];
  error?: string;
}

export async function extractWordsFromImage(
  base64Image: string,
  apiKey: string
): Promise<ExtractWordsResult> {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'この画像から英単語を抽出し、日本語訳と間違い選択肢を生成してください。',
              },
              {
                type: 'image_url',
                image_url: {
                  url: base64Image,
                  detail: 'high',
                },
              },
            ],
          },
        ],
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const error = await response.json();

      if (response.status === 401) {
        return {
          success: false,
          error: 'APIキーが無効です。設定を確認してください。',
        };
      }

      if (response.status === 429) {
        return {
          success: false,
          error: 'API利用制限に達しました。しばらく待ってから再試行してください。',
        };
      }

      return {
        success: false,
        error: error.error?.message || 'APIエラーが発生しました',
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return {
        success: false,
        error: '応答が空です。もう一度お試しください。',
      };
    }

    // Parse JSON response
    const parsed = JSON.parse(content);

    // Validate response structure
    if (!parsed.words || !Array.isArray(parsed.words)) {
      return {
        success: false,
        error: '単語を抽出できませんでした。別の画像をお試しください。',
      };
    }

    // Validate each word
    const validWords = parsed.words.filter(
      (word: AIWordExtraction) =>
        word.english &&
        word.japanese &&
        Array.isArray(word.distractors) &&
        word.distractors.length === 3
    );

    if (validWords.length === 0) {
      return {
        success: false,
        error: '有効な単語が見つかりませんでした。別の画像をお試しください。',
      };
    }

    return {
      success: true,
      words: validWords,
    };
  } catch (error) {
    console.error('Extract words error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '予期しないエラーが発生しました',
    };
  }
}
