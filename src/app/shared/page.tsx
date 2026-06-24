import SharedPageClient from './SharedPageClient';
import { listPublicStudyGroups } from '@/app/api/shared-projects/groups/shared';
import { listPublicSharedProjects, listPublicSharedUsers } from '@/app/api/shared-projects/shared';
import { readSingleLineEnv } from '@/lib/env';
import type { SharedDiscoverPayload } from '@/lib/shared-projects/types';

export const revalidate = 60;

export default async function SharedPage() {
  let initialDiscover: SharedDiscoverPayload = {
    category: 'all',
    users: [],
    projects: [],
    groups: [],
    nextCursor: null,
  };

  const supabaseUrl = readSingleLineEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = readSingleLineEnv('SUPABASE_SERVICE_ROLE_KEY');
  const normalizedSupabaseUrl = supabaseUrl
    ? (supabaseUrl.startsWith('http') ? supabaseUrl : `https://${supabaseUrl}`)
    : null;

  if (normalizedSupabaseUrl && serviceRoleKey) {
    try {
      new URL(normalizedSupabaseUrl);
      const [users, projects, groups] = await Promise.all([
        listPublicSharedUsers({ limit: 6 }),
        listPublicSharedProjects({ limit: 6 }),
        listPublicStudyGroups({ limit: 6 }),
      ]);
      initialDiscover = {
        category: 'all',
        users: users.users,
        projects: projects.items,
        groups: groups.groups,
        nextCursor: null,
      };
    } catch (error) {
      console.error('Failed to prerender public shared projects:', error);
    }
  }

  return (
    <SharedPageClient
      initialDiscover={initialDiscover}
    />
  );
}
