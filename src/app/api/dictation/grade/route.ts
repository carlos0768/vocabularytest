import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';

// Lazy initialization to avoid build-time errors
let openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

interface Question {
  number: number;
  question: string;
  correctAnswer: string;
}

interface GradeRequest {
  image: string; // base64 data URL
  questions: Question[];
  direction: 'ja-to-en' | 'en-to-ja';
}

const requestSchema = z.object({
  image: z.string().trim().min(1).max(10_000_000),
  questions: z.array(
    z.object({
      number: z.number().int().min(1).max(500),
      question: z.string().trim().min(1).max(500),
      correctAnswer: z.string().trim().min(1).max(500),
    }).strict(),
  ).min(1).max(200),
  direction: z.enum(['ja-to-en', 'en-to-ja']),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: 'Missing required fields',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const body: GradeRequest = parsed.data;
    const { image, questions, direction } = body;

    // Build prompt for GPT-4 Vision
    const questionList = questions
      .map((q) => `${q.number}. 問題: "${q.question}" → 正解: "${q.correctAnswer}"`)
      .join('\n');

    const prompt = `この画像は手書きの回答用紙です。以下の問題に対する回答を読み取り、採点してください。

【問題リスト】
${questionList}

【指示】
1. 画像から各問題番号に対応する手書きの回答を読み取ってください
2. 各回答が正解と一致するか判定してください（スペルミスは不正解、ただし大文字小文字は無視）
3. 日本語の回答は意味が同じなら正解としてください（例: "りんご" と "リンゴ" は同じ）

【出力形式】
以下のJSON形式で回答してください:
{
  "answers": [
    { "number": 1, "userAnswer": "読み取った回答", "isCorrect": true/false },
    { "number": 2, "userAnswer": "読み取った回答", "isCorrect": true/false },
    ...
  ]
}

回答が読み取れない場合は userAnswer を "(読み取れず)" とし、isCorrect を false としてください。
JSONのみを出力し、説明は不要です。`;

    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: image,
                detail: 'high',
              },
            },
          ],
        },
      ],
      max_tokens: 1000,
      temperature: 0,
    });

    const content = response.choices[0]?.message?.content || '';

    // Parse JSON from response
    let result;
    try {
      // Extract JSON from markdown code block if present
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      const jsonStr = jsonMatch[1]?.trim() || content.trim();
      result = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse GPT response:', content);
      // Create default "unreadable" response
      result = {
        answers: questions.map((q) => ({
          number: q.number,
          userAnswer: '(読み取れず)',
          isCorrect: false,
        })),
      };
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Grading error:', error);
    return NextResponse.json({ error: 'Grading failed' }, { status: 500 });
  }
}
