import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createSharedTagsEmbedding } from '@/lib/shared-projects/tag-embeddings';
import { normalizeSharedTags } from '../../../../../../shared/shared-tags';
import {
  getSharedProjectsSchemaIssue,
  requireAuthenticatedUser,
} from '../../shared';

const sharedTagsPatchSchema = z.object({
  sharedTags: z.array(z.string().trim().min(1).max(64).regex(/^[#＃]/)).max(8),
}).strict();

type SharedTagsPatchDeps = {
  requireAuthenticatedUser?: typeof requireAuthenticatedUser;
  createSharedTagsEmbedding?: typeof createSharedTagsEmbedding;
  updateProjectSharedTags?: typeof updateProjectSharedTags;
};

type ProjectOwnerRow = {
  id: string;
  user_id: string;
};

class SharedTagsUpdateHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'SharedTagsUpdateHttpError';
  }
}

export async function handleSharedProjectSharedTagsPatch(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
  deps: SharedTagsPatchDeps = {},
) {
  const requireAuthenticated = deps.requireAuthenticatedUser ?? requireAuthenticatedUser;
  const createEmbedding = deps.createSharedTagsEmbedding ?? createSharedTagsEmbedding;
  const updateTags = deps.updateProjectSharedTags ?? updateProjectSharedTags;

  try {
    const auth = await requireAuthenticated(request);
    if (!auth.ok) {
      return auth.response;
    }

    const parsed = await parseJsonWithSchema(request, sharedTagsPatchSchema, {
      invalidMessage: 'タグは # から始めてください。',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const { projectId } = await context.params;
    const sharedTags = normalizeSharedTags(parsed.data.sharedTags);
    let sharedTagsEmbedding: number[] | null = null;

    try {
      sharedTagsEmbedding = await createEmbedding(sharedTags);
    } catch (error) {
      console.warn('shared tag embedding generation failed:', error);
    }

    const savedTags = await updateTags(projectId, auth.user.id, sharedTags, sharedTagsEmbedding);

    return NextResponse.json({
      success: true,
      sharedTags: savedTags,
      embeddingUpdated: Boolean(sharedTagsEmbedding),
    });
  } catch (error) {
    if (error instanceof SharedTagsUpdateHttpError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }

    console.error('shared-project shared-tags update error:', error);
    return NextResponse.json({ success: false, error: 'タグの保存に失敗しました。' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  return handleSharedProjectSharedTagsPatch(request, context);
}

export async function updateProjectSharedTags(
  projectId: string,
  userId: string,
  sharedTags: string[],
  sharedTagsEmbedding: number[] | null,
) {
  const admin = getSupabaseAdmin();
  const { data: project, error: projectError } = await admin
    .from('projects')
    .select('id,user_id')
    .eq('id', projectId)
    .maybeSingle<ProjectOwnerRow>();

  if (projectError) {
    throw new Error(projectError.message || 'shared_project_lookup_failed');
  }

  if (!project) {
    throw new SharedTagsUpdateHttpError(404, '単語帳が見つかりません。');
  }

  if (project.user_id !== userId) {
    throw new SharedTagsUpdateHttpError(403, '単語帳を更新できません。');
  }

  const payload = {
    shared_tags: sharedTags,
    shared_tags_embedding: sharedTags.length > 0 ? sharedTagsEmbedding : null,
  };

  const result = await admin
    .from('projects')
    .update(payload)
    .eq('id', projectId)
    .eq('user_id', userId)
    .select('shared_tags')
    .maybeSingle<{ shared_tags?: unknown[] | null }>();

  if (result.error && getSharedProjectsSchemaIssue(result.error) === 'shared_tag_embeddings') {
    const retry = await admin
      .from('projects')
      .update({ shared_tags: sharedTags })
      .eq('id', projectId)
      .eq('user_id', userId)
      .select('shared_tags')
      .maybeSingle<{ shared_tags?: unknown[] | null }>();

    if (retry.error) {
      throw new Error(retry.error.message || 'shared_tags_update_failed');
    }

    return normalizeSharedTags(retry.data?.shared_tags?.map(String) ?? sharedTags);
  }

  if (result.error) {
    throw new Error(result.error.message || 'shared_tags_update_failed');
  }

  return normalizeSharedTags(result.data?.shared_tags?.map(String) ?? sharedTags);
}
