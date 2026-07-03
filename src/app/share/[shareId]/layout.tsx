import type { Metadata } from 'next';
import { extractShareCode, getSharedProjectPreviewByShareCode } from '@/app/api/shared-projects/shared';
import { getSharedWordbookPreview } from '@/app/api/shared-projects/shared-wordbooks';

// Per-wordbook metadata for the public share page. Combined with the sibling
// opengraph-image.tsx, a link to /share/[shareId] previews with the
// wordbook's own title, word count and color-matched thumbnail across
// LINE / X / Instagram / Discord, matching the group join page's pattern.

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ shareId: string }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ shareId: string }>;
}): Promise<Metadata> {
  const { shareId } = await params;

  let title = '共有単語帳';
  let wordCount = 0;
  try {
    const shareCode = extractShareCode(shareId);
    if (shareCode) {
      const preview = await getSharedWordbookPreview(shareCode)
        ?? await getSharedProjectPreviewByShareCode(shareCode);
      if (preview) {
        title = preview.project.title;
        wordCount = preview.totalWordCount;
      }
    }
  } catch {
    // Fall back to the generic title if the wordbook can't be loaded.
  }

  const pageTitle = `「${title}」の単語帳｜MERKEN`;
  const description = `MERKENの単語帳「${title}」（${wordCount}語）を見てみよう。写真を撮るだけで単語帳が作れるAI学習アプリ📚`;
  const path = `/share/${shareId}`;

  return {
    title: pageTitle,
    description,
    openGraph: {
      title: pageTitle,
      description,
      url: path,
      siteName: 'MERKEN',
      type: 'website',
      locale: 'ja_JP',
    },
    twitter: {
      card: 'summary_large_image',
      title: pageTitle,
      description,
    },
  };
}

export default function SharedWordbookLayout({ children }: LayoutProps) {
  return children;
}
