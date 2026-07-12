import { z } from 'zod';

// お知らせ本文の「MDSブロックJSON」スキーマ。
//
// お知らせは構造化ブロックの配列として保存し、AnnouncementBlocks.tsx が
// Merken Design System のコンポーネントでレンダリングする。生HTMLは
// 一切受け付けない(dangerouslySetInnerHTML不使用)ので、管理者がAIに
// 生成させたJSONをそのまま貼ってもXSSの経路がない。
// クライアント(管理画面のプレビュー)とサーバー(/api/ops/announcements)の
// 両方でこのスキーマを使って検証する。

const text = z.string().trim().min(1).max(2000);

// javascript: などの危険スキームを弾く。相対パス(/で始まる)か https:// のみ。
const safeHref = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine(
    (value) => /^\/(?!\/)/.test(value) || value.startsWith('https://'),
    { message: 'href must be a relative path or an https:// URL' },
  );

export const announcementBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('h2'), text }).strict(),
  z.object({ type: z.literal('p'), text }).strict(),
  z.object({ type: z.literal('list'), items: z.array(text).min(1).max(20) }).strict(),
  z.object({ type: z.literal('note'), text }).strict(),
  z
    .object({
      type: z.literal('callout'),
      tone: z.enum(['info', 'success', 'warning']).optional(),
      icon: z.string().trim().min(1).max(60).optional(),
      title: z.string().trim().min(1).max(200).optional(),
      text,
    })
    .strict(),
  z
    .object({
      type: z.literal('image'),
      src: safeHref,
      alt: z.string().trim().max(300),
    })
    .strict(),
  z
    .object({
      type: z.literal('button'),
      label: z.string().trim().min(1).max(80),
      href: safeHref,
      variant: z.enum(['accent', 'default', 'inverse']).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('feature'),
      icon: z.string().trim().min(1).max(60),
      title: z.string().trim().min(1).max(120),
      description: text,
    })
    .strict(),
]);

export const announcementBlocksSchema = z.array(announcementBlockSchema).min(1).max(40);

export type AnnouncementBlock = z.infer<typeof announcementBlockSchema>;
export type AnnouncementBlocks = z.infer<typeof announcementBlocksSchema>;

export type Announcement = {
  id: string;
  title: string;
  bodyBlocks: AnnouncementBlocks;
  status: 'draft' | 'published';
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// DB行(snake_case) -> ドメイン型。ブロックはZodで再検証し、壊れた行はnullを返す。
export function mapAnnouncementRow(row: {
  id: string;
  title: string;
  body_blocks: unknown;
  status: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}): Announcement | null {
  const blocks = announcementBlocksSchema.safeParse(row.body_blocks);
  if (!blocks.success) return null;
  if (row.status !== 'draft' && row.status !== 'published') return null;
  return {
    id: row.id,
    title: row.title,
    bodyBlocks: blocks.data,
    status: row.status,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
