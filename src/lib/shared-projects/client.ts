import { formatSharedTag, normalizeSharedTags } from '../../../shared/shared-tags';

type SharedTagsPatchResponse = {
  success?: boolean;
  sharedTags?: string[];
  error?: string;
};

export async function saveProjectSharedTags(projectId: string, sharedTags: readonly string[]): Promise<string[]> {
  const response = await fetch(`/api/shared-projects/${encodeURIComponent(projectId)}/shared-tags`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sharedTags: sharedTags.map(formatSharedTag).filter(Boolean),
    }),
  });

  const payload = await response.json().catch(() => null) as SharedTagsPatchResponse | null;
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || 'shared_tags_update_failed');
  }

  return normalizeSharedTags(payload.sharedTags);
}
