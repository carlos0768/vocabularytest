import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { requireAuthenticatedUser } from '../shared';
import {
  listMySharedWordbooks,
  publishSharedWordbook,
  SharedWordbookError,
} from '../shared-wordbooks';

const snapshotProjectSchema = z.object({
  id: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(200),
  description: z.string().optional(),
  sourceLabels: z.array(z.string()).optional().default([]),
  sharedTags: z.array(z.string()).optional(),
  iconImage: z.string().optional(),
  createdAt: z.string().trim().min(1),
  shareId: z.string().optional(),
  shareScope: z.enum(['private', 'public']).optional(),
  isFavorite: z.boolean().optional(),
}).passthrough();

const snapshotWordSchema = z.object({
  id: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  english: z.string().trim().min(1).max(300),
  japanese: z.string().trim().min(1).max(500),
  pronunciation: z.string().optional(),
  exampleSentence: z.string().optional(),
  exampleSentenceJa: z.string().optional(),
  partOfSpeechTags: z.array(z.string()).optional(),
  vocabularyType: z.enum(['active', 'passive']).nullable().optional(),
  distractors: z.array(z.string()).optional().default([]),
  status: z.enum(['new', 'review', 'active', 'mastered']),
  createdAt: z.string().trim().min(1),
  easeFactor: z.number(),
  intervalDays: z.number(),
  repetition: z.number(),
  isFavorite: z.boolean(),
}).passthrough();

const publishSchema = z.object({
  projectId: z.string().trim().min(1),
  sharedTags: z.array(z.string()).max(16).optional(),
  snapshot: z.object({
    project: snapshotProjectSchema,
    words: z.array(snapshotWordSchema).max(5000),
  }).optional(),
}).strict();

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) return auth.response;

    const wordbooks = await listMySharedWordbooks(auth.user.id);
    return NextResponse.json({ success: true, wordbooks });
  } catch (error) {
    console.error('share-wordbook list error:', error);
    return NextResponse.json({ success: false, error: '共有単語帳の取得に失敗しました。' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) return auth.response;

    const parsed = await parseJsonWithSchema(request, publishSchema, {
      invalidMessage: '共有内容を確認してください。',
    });
    if (!parsed.ok) return parsed.response;

    const wordbook = await publishSharedWordbook(
      auth.user.id,
      parsed.data.projectId,
      parsed.data.sharedTags ?? [],
      undefined,
      parsed.data.snapshot,
    );

    return NextResponse.json({ success: true, wordbook }, { status: 201 });
  } catch (error) {
    if (error instanceof SharedWordbookError) {
      const status = error.code === 'not_found' ? 404 : error.code === 'forbidden' ? 403 : 400;
      return NextResponse.json({ success: false, error: '共有する単語帳が見つかりません。' }, { status });
    }
    console.error('share-wordbook publish error:', error);
    return NextResponse.json({ success: false, error: '単語帳の共有に失敗しました。' }, { status: 500 });
  }
}
