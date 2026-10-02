import type { Metadata } from 'next';
import { getProfileSharePreview } from '@/lib/profile/share-preview-server';
import { buildProfileShareDescription, buildProfileShareText } from '@/lib/profile/share';

// プロフィールのリンクを LINE / X / Discord などに貼ったときのプレビュー。
// 隣の opengraph-image.tsx と組みで、その人の名前・アイコン・学習量が載る。
// 鍵アカウントや見つからない ID では個人を特定しない汎用の文言にする。

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ accountId: string }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ accountId: string }>;
}): Promise<Metadata> {
  const { accountId } = await params;
  const preview = await getProfileSharePreview(accountId);

  const title = preview
    ? `${buildProfileShareText(preview.name, preview.accountId)}｜MERKEN`
    : 'MERKENのプロフィール｜MERKEN';
  const description = buildProfileShareDescription(preview);
  const path = preview ? `/profile/${encodeURIComponent(preview.accountId)}` : undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: path,
      siteName: 'MERKEN',
      type: 'profile',
      locale: 'ja_JP',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default function ProfileAccountLayout({ children }: LayoutProps) {
  return children;
}
