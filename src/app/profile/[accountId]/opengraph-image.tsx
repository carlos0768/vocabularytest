import { renderProfileShareImage } from '@/lib/profile/share-image';
import { getProfileSharePreview } from '@/lib/profile/share-preview-server';

// プロフィールのシェアカード(OG/Twitter)。描画は lib/profile/share-image.tsx。
// 鍵アカウント・見つからない ID では個人情報を載せない汎用カードになる。

export const runtime = 'nodejs';
export const alt = 'MERKEN プロフィール';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const preview = await getProfileSharePreview(accountId);
  return renderProfileShareImage(preview);
}
