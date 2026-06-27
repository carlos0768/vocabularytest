import type { Metadata } from 'next';
import { getPublicStudyGroupPreview } from '@/app/api/shared-projects/groups/shared';

// Per-group metadata for the public join page. Combined with the sibling
// opengraph-image.tsx, a link to /groups/[groupId]/join previews with the
// group's own title, stats and color-matched thumbnail across LINE / X /
// Instagram / Discord.

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ groupId: string }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ groupId: string }>;
}): Promise<Metadata> {
  const { groupId } = await params;

  let name = '学習グループ';
  let memberCount = 0;
  let projectCount = 0;
  try {
    const group = await getPublicStudyGroupPreview(groupId);
    if (group) {
      name = group.name;
      memberCount = group.memberCount;
      projectCount = group.projectCount;
    }
  } catch {
    // Fall back to the generic title if the group can't be loaded.
  }

  const title = `「${name}」で英単語を覚えよう｜MERKEN`;
  const description = `MERKENの学習グループ「${name}」に参加しよう。${memberCount}人が参加・${projectCount}冊の単語帳でランキングを競い合おう🔥`;
  const path = `/groups/${groupId}/join`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: path,
      siteName: 'MERKEN',
      type: 'website',
      locale: 'ja_JP',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default function GroupJoinLayout({ children }: LayoutProps) {
  return children;
}
