import { z } from 'zod';
import { AI_CONFIG, getAPIKeys } from '@/lib/ai/config';
import { getProviderFromConfig } from '@/lib/ai/providers';
import { parseJsonResponse } from '@/lib/ai/utils/json';

export const correctionIssueSchema = z.object({
  id: z.string().trim().min(1).max(80),
  tag: z.string().trim().min(1).max(24),
  from: z.string().trim().min(1).max(160),
  to: z.string().trim().min(1).max(160),
  why: z.string().trim().min(1).max(300),
  severity: z.enum(['low', 'medium', 'high']).default('medium'),
  vocabularyCandidateId: z.string().trim().max(80).optional(),
}).strict();

export const correctionWordCandidateSchema = z.object({
  id: z.string().trim().min(1).max(80),
  english: z.string().trim().min(1).max(120),
  japanese: z.string().trim().min(1).max(200),
  sourceIssueId: z.string().trim().max(80).optional(),
  exampleSentence: z.string().trim().max(300).optional(),
}).strict();

export const correctionResultSchema = z.object({
  title: z.string().trim().min(1).max(80),
  score: z.number().int().min(0).max(100),
  level: z.string().trim().min(1).max(40),
  summary: z.string().trim().min(1).max(160),
  correctedText: z.string().trim().min(1).max(1600),
  wordCount: z.number().int().min(1).max(1000),
  issueCounts: z.object({
    grammar: z.number().int().min(0).max(100),
    usage: z.number().int().min(0).max(100),
    naturalness: z.number().int().min(0).max(100),
  }).strict(),
  issues: z.array(correctionIssueSchema).max(30),
  wordCandidates: z.array(correctionWordCandidateSchema).max(30).default([]),
}).strict();

const svoRoleSchema = z.enum(['S', 'V', 'O', 'C', 'M']);

export const parserTokenSchema = z.object({
  text: z.string().trim().min(1).max(160),
  role: svoRoleSchema.optional(),
  clauseId: z.string().trim().min(1).max(80).optional(),
}).strict();

export const parserClauseSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(80),
  kind: z.enum(['main', 'subordinate', 'relative', 'phrase']).default('phrase'),
  prefix: z.string().trim().max(80).optional(),
  roles: z.array(z.object({
    role: svoRoleSchema,
    text: z.string().trim().min(1).max(180),
  }).strict()).max(12),
}).strict();

export type ParserTreeNode = {
  id: string;
  label: string;
  kind: 'main' | 'subordinate' | 'relative' | 'phrase';
  prefix?: string;
  roles: { role: 'S' | 'V' | 'O' | 'C' | 'M'; text: string }[];
  children: ParserTreeNode[];
};

const parserTreeNodeSchema: z.ZodType<ParserTreeNode> = z.lazy(() => z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(100),
  kind: z.enum(['main', 'subordinate', 'relative', 'phrase']).default('phrase'),
  prefix: z.string().trim().max(80).optional(),
  roles: z.array(z.object({
    role: svoRoleSchema,
    text: z.string().trim().min(1).max(180),
  }).strict()).max(12),
  children: z.array(parserTreeNodeSchema).max(12).default([]),
}).strict());

export const parserResultSchema = z.object({
  title: z.string().trim().min(1).max(80),
  sentence: z.string().trim().min(1).max(1800),
  wordCount: z.number().int().min(1).max(1000),
  clauseCount: z.number().int().min(1).max(80),
  depth: z.enum(['simple', 'clause', 'tree']),
  summary: z.string().trim().min(1).max(180),
  translationJa: z.string().trim().min(1).max(800),
  tokens: z.array(parserTokenSchema).min(1).max(260),
  clauses: z.array(parserClauseSchema).min(1).max(80),
  tree: parserTreeNodeSchema,
  wordCandidates: z.array(correctionWordCandidateSchema).max(30).default([]),
}).strict();

export type CorrectionResultPayload = z.infer<typeof correctionResultSchema>;
export type ParserResultPayload = z.infer<typeof parserResultSchema>;

export function countWords(text: string): number {
  const matches = text.trim().match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g);
  return matches?.length ?? 0;
}

export function previewText(text: string, maxLength = 120): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

export function scoreColor(score: number): string {
  if (score >= 85) return 'var(--color-success)';
  if (score >= 70) return 'var(--color-accent)';
  if (score >= 60) return '#c8a02e';
  return '#c43d3d';
}

function getJsonProviderConfig(maxOutputTokens: number) {
  return {
    ...AI_CONFIG.defaults.gemini,
    temperature: 0.25,
    maxOutputTokens,
    responseFormat: 'json' as const,
  };
}

export async function generateCorrectionPayload(input: {
  text: string;
  purpose: string;
}): Promise<CorrectionResultPayload> {
  const config = getJsonProviderConfig(8192);
  const provider = getProviderFromConfig(config, getAPIKeys());
  const prompt = `あなたは日本人英語学習者向けの英作文添削者です。必ずJSONだけを返してください。

目的: ${input.purpose}
英文:
${input.text}

次のJSON形式で返してください。idは安定した短い英数字にしてください。
{
  "title": "履歴に出す短い日本語タイトル",
  "score": 0-100,
  "level": "英検準2級レベルなど",
  "summary": "全体講評を日本語で1文",
  "correctedText": "自然な修正文全文",
  "wordCount": ${countWords(input.text)},
  "issueCounts": { "grammar": 0, "usage": 0, "naturalness": 0 },
  "issues": [
    { "id": "i1", "tag": "時制", "from": "誤り", "to": "修正", "why": "理由を日本語で", "severity": "medium", "vocabularyCandidateId": "w1" }
  ],
  "wordCandidates": [
    { "id": "w1", "english": "保存に向く表現", "japanese": "日本語訳", "sourceIssueId": "i1", "exampleSentence": "例文" }
  ]
}`;

  const result = await provider.generateText(prompt, config);
  if (!result.success || !result.content?.trim()) {
    throw new Error(result.success ? 'AI response is empty' : result.error);
  }
  const parsed = correctionResultSchema.parse(parseJsonResponse(result.content));
  return { ...parsed, wordCount: parsed.wordCount || countWords(input.text) };
}

export async function generateParserPayload(input: {
  text: string;
  depth: 'simple' | 'clause' | 'tree';
}): Promise<ParserResultPayload> {
  const config = getJsonProviderConfig(8192);
  const provider = getProviderFromConfig(config, getAPIKeys());
  const prompt = `あなたは英文構造解析の教師です。必ずJSONだけを返してください。

解析の深さ: ${input.depth}
英文:
${input.text}

次のJSON形式で返してください。tree.childrenは再帰構造です。tokensは英文順に並べ、roleはS/V/O/C/Mのいずれかにしてください。
{
  "title": "履歴に出す短い日本語タイトル",
  "sentence": "原文",
  "wordCount": ${countWords(input.text)},
  "clauseCount": 1,
  "depth": "${input.depth}",
  "summary": "構造の要点を日本語で1文",
  "translationJa": "自然な日本語訳",
  "tokens": [{ "text": "Although", "role": "M", "clauseId": "c1" }],
  "clauses": [{ "id": "c1", "label": "MAIN CLAUSE", "kind": "main", "prefix": "", "roles": [{ "role": "S", "text": "she" }] }],
  "tree": { "id": "c1", "label": "MAIN CLAUSE", "kind": "main", "roles": [{ "role": "S", "text": "she" }], "children": [] },
  "wordCandidates": [{ "id": "w1", "english": "useful phrase", "japanese": "有用表現", "exampleSentence": "例文" }]
}`;

  const result = await provider.generateText(prompt, config);
  if (!result.success || !result.content?.trim()) {
    throw new Error(result.success ? 'AI response is empty' : result.error);
  }
  const parsed = parserResultSchema.parse(parseJsonResponse(result.content));
  return { ...parsed, sentence: parsed.sentence || input.text, wordCount: parsed.wordCount || countWords(input.text) };
}
