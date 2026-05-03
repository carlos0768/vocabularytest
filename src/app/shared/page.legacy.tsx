import SharedPageClient from './SharedPageClient';
import { listPublicSharedProjects } from '@/app/api/shared-projects/shared';
import type { SharedProjectCard } from '@/lib/shared-projects/types';

export const revalidate = 60;

export default async function SharedPage() {
  let initialPublicItems: SharedProjectCard[] = [];
  let initialPublicNextCursor: string | null = null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const normalizedSupabaseUrl = supabaseUrl
    ? (supabaseUrl.startsWith('http') ? supabaseUrl : `https://${supabaseUrl}`)
    : null;

  if (normalizedSupabaseUrl && serviceRoleKey) {
    try {
      new URL(normalizedSupabaseUrl);

      const payload = await listPublicSharedProjects({ limit: 8 });
      initialPublicItems = payload.items;
      initialPublicNextCursor = payload.nextCursor;
    } catch (error) {
      console.error('Failed to prerender public shared projects:', error);
    }
  }

  return (
    <SharedPageClient
      initialPublicItems={initialPublicItems}
      initialPublicNextCursor={initialPublicNextCursor}
    />
  );
}
