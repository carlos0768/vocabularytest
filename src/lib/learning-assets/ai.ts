import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { AI_CONFIG, getAPIKeys } from '@/lib/ai/config';
import { GRAMMAR_OCR_PROMPT } from '@/lib/ai/prompts';
import { AIError, getProviderFromConfig } from '@/lib/ai/providers';
import { parseJsonResponse } from '@/lib/ai/utils/json';
import type {
  CorrectionFinding,
  CorrectionInlineAnnotation,
  CorrectionReviewPayload,
  CorrectionSummary,
  StructureAnalysisNote,
  StructureAnalysisSummary,
  StructureNode,
} from '@/types';

function normalizeInputText(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim();
}

function splitDataUrl(imageBase64: string): { mimeType: string; base64: string } {
  if (!imageBase64.startsWith('data:')) {
    return {
      mimeType: 'image/jpeg',
      base64: imageBase64,
    };
  }

  const commaIndex = imageBase64.indexOf(',');
  if (commaIndex === -1) {
    throw new Error('invalid_data_url');
  }

  const mimeMatch = imageBase64.slice(0, commaIndex).match(/^data:([^;]+)/);
  return {
    mimeType: mimeMatch?.[1] ?? 'image/jpeg',
    base64: imageBase64.slice(commaIndex + 1),
  };
}

const structureNodeSchema: z.ZodType<StructureNode> = z.lazy(() => z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  text: z.string().trim().default(''),
  start: z.number().int().min(0).default(0),
  end: z.number().int().min(0).default(0),
  children: z.array(structureNodeSchema).default([]),
  collapsible: z.boolean().default(true),
}));

const structureNoteSchema: z.ZodType<StructureAnalysisNote> = z.object({
  label: z.string().trim().min(1),
  body: z.string().trim().min(1),
  shortLabel: z.string().trim().optional(),
});

const structureSummarySchema: z.ZodType<StructureAnalysisSummary> = z.object({
  overview: z.string().trim().default(''),
  detectedPatterns: z.array(z.string().trim().min(1)).default([]),
  cefrTarget: z.literal('pre1').default('pre1'),
  notes: z.array(structureNoteSchema).default([]),
});

const structureResponseSchema = z.object({
  nodes: z.array(structureNodeSchema).default([]),
  summary: structureSummarySchema.default({
    overview: '',
    detectedPatterns: [],
    cefrTarget: 'pre1',
    notes: [],
  }),
  mentionedTerms: z.array(z.string().trim().min(1)).default([]),
});

const correctionInlineAnnotationSchema: z.ZodType<CorrectionInlineAnnotation> = z.object({
  id: z.string().trim().min(1).optional().transform((value) => value ?? uuidv4()),
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  label: z.string().trim().min(1),
  message: z.string().trim().min(1),
  severity: z.enum(['error', 'warning']).default('error'),
  suggestedText: z.string().trim().optional(),
});

const correctionFindingSeedSchema = z.object({
  spanStart: z.number().int().min(0),
  spanEnd: z.number().int().min(0),
  category: z.enum(['grammar', 'idiom', 'usage']).default('grammar'),
  ruleNameJa: z.string().trim().min(1),
  ruleNameEn: z.string().trim().min(1),
  incorrectText: z.string().trim().min(1),
  suggestedText: z.string().trim().min(1),
  formalUsageJa: z.string().trim().min(1),
  exampleSentence: z.string().trim().optional(),
  exampleSentenceJa: z.string().trim().optional(),
  learnerAdvice: z.string().trim().min(1),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
  sortOrder: z.number().int().min(0).optional(),
});

const correctionReviewPayloadSchema: z.ZodType<CorrectionReviewPayload> = z.object({
  question: z.string().trim().min(1),
  choices: z.array(z.string().trim().min(1)).min(2).max(6),
  correctAnswer: z.string().trim().min(1),
  explanation: z.string().trim().min(1),
  ruleNameJa: z.string().trim().optional(),
});

const correctionReviewSeedSchema = z.object({
  findingIndex: z.number().int().min(0),
  quizPayload: correctionReviewPayloadSchema,
});

const correctionSummarySchema: z.ZodType<CorrectionSummary> = z.object({
  overview: z.string().trim().default(''),
  counts: z.object({
    grammar: z.number().int().min(0).default(0),
    idiom: z.number().int().min(0).default(0),
    usage: z.number().int().min(0).default(0),
  }).default({
    grammar: 0,
    idiom: 0,
    usage: 0,
  }),
});

const correctionResponseSchema = z.object({
  correctedText: z.string().trim().min(1),
  inlineAnnotations: z.array(correctionInlineAnnotationSchema).default([]),
  summary: correctionSummarySchema.default({
    overview: '',
    counts: {
      grammar: 0,
      idiom: 0,
      usage: 0,
    },
  }),
  findings: z.array(correctionFindingSeedSchema).default([]),
  reviewItems: z.array(correctionReviewSeedSchema).default([]),
});

const STRUCTURE_ANALYSIS_PROMPT = `あなたは英語構文解析の専門家です。与えられた英文を、大学受験の学習者向けに「どこからどこまでが一まとまりか」が分かるように区切ってください。

ルール:
1. 出力は JSON のみ
2. nodes には折りたたみ表示したいまとまりだけを入れる
3. 各 node は id, label, text, start, end, children, collapsible を持つ
4. start/end は originalText 内の文字位置。厳密でなくてもよいが順序は守る
5. label は「名詞節」「副詞節」「不定詞句」「分詞句」など学習者に分かる日本語
6. children はその node の内部構造
7. summary.overview には文全体の読み方を 1-3 文で説明する
8. summary.detectedPatterns には見つかった構文名を配列で入れる
9. summary.notes には画面下の解説カードとして 2-4 件の要点を返す
10. mentionedTerms には本文に登場する重要語句を 3-8 個返す
11. 難しすぎる分析記号は避ける

出力形式:
{
  "nodes": [
    {
      "id": "node-1",
      "label": "名詞節",
      "text": "when he will arrive",
      "start": 0,
      "end": 20,
      "children": [],
      "collapsible": true
    }
  ],
  "summary": {
    "overview": "文頭の when 節全体が主語になっています。",
    "detectedPatterns": ["名詞節"],
    "cefrTarget": "pre1",
    "notes": [
      {
        "label": "名詞節",
        "shortLabel": "S",
        "body": "文頭の when 節全体が主語として働いています。"
      }
    ]
  },
  "mentionedTerms": ["committee", "meticulous", "in spite of"]
}`;

const CORRECTION_ANALYSIS_PROMPT = `あなたは大学受験生向けの英作文添削者です。入力英文の誤りをすべて検出し、訂正文・本文上の注記・詳細な指摘表・復習クイズを JSON で返してください。

ルール:
1. 出力は JSON のみ
2. correctedText には全文の自然な訂正文を入れる
3. inlineAnnotations は originalText 上の指摘位置。start/end は 0 始まりの文字位置
4. findings は表に表示する詳細説明。文法・イディオム・語法を区別する
5. reviewItems は findings と 1 対 1 で対応させ、findingIndex で紐付ける
6. quizPayload.choices には correctAnswer を必ず含める
7. explanation にはなぜその形が正しいかを簡潔に書く
8. summary.counts は findings の件数と一致させる
9. findings.difficulty には UI 表示用の難易度を 1-3 で入れる

出力形式:
{
  "correctedText": "He goes to school every day.",
  "inlineAnnotations": [
    {
      "id": "ann-1",
      "start": 0,
      "end": 2,
      "label": "主語と動詞の一致",
      "message": "三人称単数現在なので goes が必要です。",
      "severity": "error",
      "suggestedText": "goes"
    }
  ],
  "summary": {
    "overview": "動詞の活用と前置詞の使い方を修正しました。",
    "counts": { "grammar": 1, "idiom": 0, "usage": 0 }
  },
  "findings": [
    {
      "spanStart": 0,
      "spanEnd": 2,
      "category": "grammar",
      "ruleNameJa": "主語と動詞の一致",
      "ruleNameEn": "Subject-Verb Agreement",
      "incorrectText": "go",
      "suggestedText": "goes",
      "formalUsageJa": "三人称単数現在では動詞に -s / -es を付けます。",
      "exampleSentence": "She plays tennis on Sundays.",
      "exampleSentenceJa": "彼女は日曜日にテニスをします。",
      "learnerAdvice": "主語が he / she / it のときは現在形の語尾変化を先に確認してください。",
      "difficulty": 2,
      "sortOrder": 0
    }
  ],
  "reviewItems": [
    {
      "findingIndex": 0,
      "quizPayload": {
        "question": "空欄に入る正しい形を選んでください: He ___ to school every day.",
        "choices": ["go", "goes", "going", "gone"],
        "correctAnswer": "goes",
        "explanation": "三人称単数現在なので goes を使います。",
        "ruleNameJa": "主語と動詞の一致"
      }
    }
  ]
}`;

type StructureAnalysisResult = {
  normalizedText: string;
  parseTree: StructureNode[];
  analysisSummary: StructureAnalysisSummary;
  mentionedTerms: string[];
};

type CorrectionAnalysisResult = {
  normalizedText: string;
  correctedText: string;
  inlineAnnotations: CorrectionInlineAnnotation[];
  summary: CorrectionSummary;
  findings: Array<Omit<CorrectionFinding, 'id' | 'assetId'>>;
  reviewItems: Array<{ findingIndex: number; quizPayload: CorrectionReviewPayload }>;
};

function buildFallbackReviewPayload(finding: Omit<CorrectionFinding, 'id' | 'assetId'>): CorrectionReviewPayload {
  const correct = finding.suggestedText;
  const choices = Array.from(new Set([correct, finding.incorrectText, `${correct}?`, `${finding.incorrectText}?`]))
    .filter((choice) => choice.trim().length > 0)
    .slice(0, 4);

  if (!choices.includes(correct)) {
    choices.unshift(correct);
  }

  return {
    question: `次の表現の正しい形を選んでください: ${finding.incorrectText}`,
    choices,
    correctAnswer: correct,
    explanation: finding.formalUsageJa,
    ruleNameJa: finding.ruleNameJa,
  };
}

export async function extractRawTextFromImage(imageBase64: string): Promise<{ text: string }> {
  const { mimeType, base64 } = splitDataUrl(imageBase64);
  const config = AI_CONFIG.extraction.grammar.ocr;
  const provider = getProviderFromConfig(config, getAPIKeys());

  try {
    const result = await provider.generate({
      prompt: GRAMMAR_OCR_PROMPT,
      image: { base64, mimeType },
      config: {
        ...config,
        temperature: 0,
      },
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    const text = normalizeInputText(result.content);
    if (!text) {
      throw new Error('empty_ocr_text');
    }

    return { text };
  } catch (error) {
    if (error instanceof AIError) {
      throw new Error(error.getUserMessage());
    }
    throw error;
  }
}

export async function analyzeStructureText(text: string): Promise<StructureAnalysisResult> {
  const normalizedText = normalizeInputText(text);
  const config = AI_CONFIG.extraction.grammar.analysis;
  const provider = getProviderFromConfig(config, getAPIKeys());

  const result = await provider.generate({
    systemPrompt: STRUCTURE_ANALYSIS_PROMPT,
    prompt: `以下の英文を構文解析してください。\n\n${normalizedText}`,
    config: {
      ...config,
      responseFormat: 'json',
    },
  });

  if (!result.success) {
    throw new Error(result.error);
  }

  const parsed = structureResponseSchema.parse(parseJsonResponse(result.content));
  return {
    normalizedText,
    parseTree: parsed.nodes,
    analysisSummary: parsed.summary,
    mentionedTerms: parsed.mentionedTerms,
  };
}

export async function analyzeCorrectionText(text: string): Promise<CorrectionAnalysisResult> {
  const normalizedText = normalizeInputText(text);
  const config = AI_CONFIG.extraction.grammar.analysis;
  const provider = getProviderFromConfig(config, getAPIKeys());

  const result = await provider.generate({
    systemPrompt: CORRECTION_ANALYSIS_PROMPT,
    prompt: `以下の英文を添削してください。\n\n${normalizedText}`,
    config: {
      ...config,
      responseFormat: 'json',
    },
  });

  if (!result.success) {
    throw new Error(result.error);
  }

  const parsed = correctionResponseSchema.parse(parseJsonResponse(result.content));
  const findings = parsed.findings.map((finding, index) => ({
    ...finding,
    sortOrder: finding.sortOrder ?? index,
  }));

  const reviewItemMap = new Map<number, { findingIndex: number; quizPayload: CorrectionReviewPayload }>();
  for (const reviewItem of parsed.reviewItems) {
    reviewItemMap.set(reviewItem.findingIndex, reviewItem);
  }

  return {
    normalizedText,
    correctedText: parsed.correctedText,
    inlineAnnotations: parsed.inlineAnnotations,
    summary: {
      overview: parsed.summary.overview,
      counts: {
        grammar: findings.filter((finding) => finding.category === 'grammar').length,
        idiom: findings.filter((finding) => finding.category === 'idiom').length,
        usage: findings.filter((finding) => finding.category === 'usage').length,
      },
    },
    findings,
    reviewItems: findings.map((finding, index) => reviewItemMap.get(index) ?? {
      findingIndex: index,
      quizPayload: buildFallbackReviewPayload(finding),
    }),
  };
}
