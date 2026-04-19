import { v4 as uuidv4 } from 'uuid';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildVocabularyAssetDetail,
  mapCollectionItemSummary,
  mapCollectionNotebookBindingFromRow,
  mapCorrectionDocumentFromRow,
  mapCorrectionFindingFromRow,
  mapCorrectionReviewItemFromRow,
  mapLearningAssetFromRow,
  mapProjectFromRow,
  mapStructureDocumentFromRow,
  mapVocabularyProjectPreviewFromRow,
  mapWordFromRow,
  type CollectionItemRow,
  type CollectionNotebookBindingRow,
  type CorrectionDocumentRow,
  type CorrectionFindingRow,
  type CorrectionReviewItemRow,
  type LearningAssetRow,
  type ProjectRow,
  type StructureDocumentRow,
  type VocabularyProjectPreviewRow,
  type WordRow,
} from '../../../shared/db';
import type {
  CollectionItemSummary,
  CollectionNotebookBinding,
  CorrectionDocument,
  CorrectionFinding,
  CorrectionReviewItem,
  LearningAssetSummary,
  Project,
  StructureDocument,
  StructureSourceType,
  VocabularyAssetDetail,
  Word,
} from '@/types';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { calculateNextReviewByQuality, getStatusAfterAnswer } from '@/lib/spaced-repetition';
import { analyzeCorrectionText, analyzeStructureText } from './ai';
import { insertProjectWithSourceLabelsCompat } from '@/lib/supabase/project-source-labels-compat';
import { RESOLVED_WORD_SELECT_COLUMNS } from '@/lib/words/resolved';

export type StructureDocumentResult = {
  asset: LearningAssetSummary;
  document: StructureDocument;
};

export type VocabularyAssetResult = VocabularyAssetDetail;

export type CorrectionDocumentResult = {
  asset: LearningAssetSummary;
  document: CorrectionDocument;
  findings: CorrectionFinding[];
  reviewItems: CorrectionReviewItem[];
};

export type CorrectionReviewQueueItem = {
  asset: LearningAssetSummary;
  finding: CorrectionFinding;
  reviewItem: CorrectionReviewItem;
};

type AdminDeps = {
  admin?: SupabaseClient;
};

type CreateStructureInput = {
  title: string;
  text: string;
  sourceType: StructureSourceType;
  collectionId?: string;
  wordbookAssetId?: string;
};

type CreateVocabularyInput = {
  title: string;
  collectionId: string;
  iconImage?: string;
};

type CreateCorrectionInput = {
  title: string;
  text: string;
  sourceType: StructureSourceType;
  collectionId?: string;
  wordbookAssetId?: string;
};

type CreateNotebookBindingInput = {
  wordbookAssetId: string;
  structureAssetId?: string;
  correctionAssetId?: string;
};

type UpdateNotebookBindingInput = {
  wordbookAssetId?: string;
  structureAssetId?: string | null;
  correctionAssetId?: string | null;
};

type ReviewFilters = {
  collectionId?: string;
  status?: 'due' | 'new' | 'review';
};

function getAdminClient(deps?: AdminDeps): SupabaseClient {
  return deps?.admin ?? getSupabaseAdmin();
}

async function requireOwnedCollection(admin: SupabaseClient, userId: string, collectionId: string): Promise<void> {
  const { data, error } = await admin
    .from('collections')
    .select('id')
    .eq('id', collectionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(`collection_lookup_failed:${error.message}`);
  if (!data) throw new Error('collection_not_found');
}

async function requireOwnedAsset(
  admin: SupabaseClient,
  userId: string,
  assetId: string,
  kind?: LearningAssetSummary['kind'],
): Promise<LearningAssetSummary> {
  let query = admin
    .from('learning_assets')
    .select('*')
    .eq('id', assetId)
    .eq('user_id', userId);

  if (kind) {
    query = query.eq('kind', kind);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`asset_lookup_failed:${error.message}`);
  if (!data) throw new Error('asset_not_found');
  return mapLearningAssetFromRow(data as LearningAssetRow);
}

async function requireOwnedVocabularyAssetByIdentifier(
  admin: SupabaseClient,
  userId: string,
  identifier: string,
): Promise<LearningAssetSummary> {
  try {
    return await requireOwnedAsset(admin, userId, identifier, 'vocabulary_project');
  } catch (error) {
    const code = error instanceof Error ? error.message.split(':', 1)[0] : '';
    if (code !== 'asset_not_found') {
      throw error;
    }
  }

  const { data, error } = await admin
    .from('learning_assets')
    .select('*')
    .eq('user_id', userId)
    .eq('kind', 'vocabulary_project')
    .eq('legacy_project_id', identifier)
    .maybeSingle();

  if (error) throw new Error(`asset_lookup_failed:${error.message}`);
  if (data) {
    return mapLearningAssetFromRow(data as LearningAssetRow);
  }

  await ensureVocabularyAssetsForLegacyProjects(admin, userId, [identifier]);

  const { data: backfilledData, error: backfilledError } = await admin
    .from('learning_assets')
    .select('*')
    .eq('user_id', userId)
    .eq('kind', 'vocabulary_project')
    .eq('legacy_project_id', identifier)
    .maybeSingle();

  if (backfilledError) throw new Error(`asset_lookup_failed:${backfilledError.message}`);
  if (!backfilledData) throw new Error('asset_not_found');
  return mapLearningAssetFromRow(backfilledData as LearningAssetRow);
}

async function requireOwnedAssetByKind(
  admin: SupabaseClient,
  userId: string,
  assetId: string | undefined,
  kind: LearningAssetSummary['kind'],
): Promise<LearningAssetSummary | null> {
  if (!assetId) return null;
  return requireOwnedAsset(admin, userId, assetId, kind);
}

async function fetchCollectionNotebookBinding(
  admin: SupabaseClient,
  userId: string,
  collectionId: string,
  args: { wordbookAssetId?: string; assetId?: string },
): Promise<CollectionNotebookBinding | null> {
  await requireOwnedCollection(admin, userId, collectionId);

  let query = admin
    .from('collection_notebook_bindings')
    .select('*')
    .eq('collection_id', collectionId);

  if (args.wordbookAssetId) {
    query = query.eq('wordbook_asset_id', args.wordbookAssetId);
  } else if (args.assetId) {
    query = query.or(
      `wordbook_asset_id.eq.${args.assetId},structure_asset_id.eq.${args.assetId},correction_asset_id.eq.${args.assetId}`,
    );
  } else {
    throw new Error('notebook_binding_lookup_missing_key');
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`notebook_binding_lookup_failed:${error.message}`);
  if (!data) return null;
  return mapCollectionNotebookBindingFromRow(data as CollectionNotebookBindingRow);
}

async function upsertCollectionNotebookBindingInternal(
  admin: SupabaseClient,
  userId: string,
  collectionId: string,
  input: CreateNotebookBindingInput,
): Promise<CollectionNotebookBinding> {
  await requireOwnedCollection(admin, userId, collectionId);
  await requireOwnedAsset(admin, userId, input.wordbookAssetId, 'vocabulary_project');
  await requireOwnedAssetByKind(admin, userId, input.structureAssetId, 'structure_document');
  await requireOwnedAssetByKind(admin, userId, input.correctionAssetId, 'correction_document');
  const existing = await fetchCollectionNotebookBinding(admin, userId, collectionId, {
    wordbookAssetId: input.wordbookAssetId,
  });

  const { data, error } = await admin
    .from('collection_notebook_bindings')
    .upsert({
      collection_id: collectionId,
      wordbook_asset_id: input.wordbookAssetId,
      structure_asset_id: input.structureAssetId ?? existing?.structureAssetId ?? null,
      correction_asset_id: input.correctionAssetId ?? existing?.correctionAssetId ?? null,
    }, { onConflict: 'collection_id,wordbook_asset_id' })
    .select('*')
    .single();

  if (error) throw new Error(`notebook_binding_upsert_failed:${error.message}`);
  return mapCollectionNotebookBindingFromRow(data as CollectionNotebookBindingRow);
}

async function getNextCollectionSortOrder(admin: SupabaseClient, collectionId: string): Promise<number> {
  const { data, error } = await admin
    .from('collection_items')
    .select('sort_order')
    .eq('collection_id', collectionId)
    .order('sort_order', { ascending: false })
    .limit(1);

  if (error) throw new Error(`collection_items_sort_failed:${error.message}`);
  return data && data.length > 0 ? Number(data[0].sort_order) + 1 : 0;
}

async function addAssetToCollectionInternal(
  admin: SupabaseClient,
  userId: string,
  collectionId: string,
  assetId: string,
): Promise<void> {
  await requireOwnedCollection(admin, userId, collectionId);
  await requireOwnedAsset(admin, userId, assetId);

  const sortOrder = await getNextCollectionSortOrder(admin, collectionId);
  const { error } = await admin
    .from('collection_items')
    .upsert({
      collection_id: collectionId,
      asset_id: assetId,
      sort_order: sortOrder,
    }, { onConflict: 'collection_id,asset_id' });

  if (error) throw new Error(`collection_items_upsert_failed:${error.message}`);
}

async function updateCollectionNotebookBindingInternal(
  admin: SupabaseClient,
  userId: string,
  collectionId: string,
  bindingId: string,
  input: UpdateNotebookBindingInput,
): Promise<CollectionNotebookBinding> {
  await requireOwnedCollection(admin, userId, collectionId);

  const { data: existingRow, error: existingError } = await admin
    .from('collection_notebook_bindings')
    .select('*')
    .eq('id', bindingId)
    .eq('collection_id', collectionId)
    .maybeSingle();

  if (existingError) throw new Error(`notebook_binding_lookup_failed:${existingError.message}`);
  if (!existingRow) throw new Error('notebook_binding_not_found');

  const nextWordbookAssetId = input.wordbookAssetId ?? existingRow.wordbook_asset_id;
  await requireOwnedAsset(admin, userId, nextWordbookAssetId, 'vocabulary_project');
  await requireOwnedAssetByKind(admin, userId, input.structureAssetId ?? undefined, 'structure_document');
  await requireOwnedAssetByKind(admin, userId, input.correctionAssetId ?? undefined, 'correction_document');

  const payload: Record<string, string | null> = {
    wordbook_asset_id: nextWordbookAssetId,
  };
  if ('structureAssetId' in input) {
    payload.structure_asset_id = input.structureAssetId ?? null;
  }
  if ('correctionAssetId' in input) {
    payload.correction_asset_id = input.correctionAssetId ?? null;
  }

  const { data, error } = await admin
    .from('collection_notebook_bindings')
    .update(payload)
    .eq('id', bindingId)
    .eq('collection_id', collectionId)
    .select('*')
    .single();

  if (error) throw new Error(`notebook_binding_update_failed:${error.message}`);
  return mapCollectionNotebookBindingFromRow(data as CollectionNotebookBindingRow);
}

async function fetchStructureDocument(admin: SupabaseClient, assetId: string): Promise<StructureDocument> {
  const { data, error } = await admin
    .from('structure_documents')
    .select('*')
    .eq('asset_id', assetId)
    .maybeSingle();

  if (error) throw new Error(`structure_document_lookup_failed:${error.message}`);
  if (!data) throw new Error('structure_document_not_found');
  return mapStructureDocumentFromRow(data as StructureDocumentRow);
}

async function fetchCorrectionDocument(admin: SupabaseClient, assetId: string): Promise<CorrectionDocument> {
  const { data, error } = await admin
    .from('correction_documents')
    .select('*')
    .eq('asset_id', assetId)
    .maybeSingle();

  if (error) throw new Error(`correction_document_lookup_failed:${error.message}`);
  if (!data) throw new Error('correction_document_not_found');
  return mapCorrectionDocumentFromRow(data as CorrectionDocumentRow);
}

async function fetchCorrectionFindings(admin: SupabaseClient, assetId: string): Promise<CorrectionFinding[]> {
  const { data, error } = await admin
    .from('correction_findings')
    .select('*')
    .eq('asset_id', assetId)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(`correction_findings_lookup_failed:${error.message}`);
  return ((data ?? []) as CorrectionFindingRow[]).map(mapCorrectionFindingFromRow);
}

async function fetchCorrectionReviewItems(admin: SupabaseClient, userId: string, findingIds: string[]): Promise<CorrectionReviewItem[]> {
  if (findingIds.length === 0) return [];

  const { data, error } = await admin
    .from('correction_review_items')
    .select('*')
    .eq('user_id', userId)
    .in('finding_id', findingIds)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`correction_review_items_lookup_failed:${error.message}`);
  return ((data ?? []) as CorrectionReviewItemRow[]).map(mapCorrectionReviewItemFromRow);
}

async function fetchOwnedProject(admin: SupabaseClient, userId: string, projectId: string): Promise<Project> {
  const { data, error } = await admin
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(`project_lookup_failed:${error.message}`);
  if (!data) throw new Error('project_not_found');
  return mapProjectFromRow(data as ProjectRow);
}

async function ensureVocabularyAssetsForLegacyProjects(
  admin: SupabaseClient,
  userId: string,
  projectIds: string[],
): Promise<void> {
  if (projectIds.length === 0) return;

  const { data: existingAssets, error: existingAssetsError } = await admin
    .from('learning_assets')
    .select('legacy_project_id')
    .eq('user_id', userId)
    .eq('kind', 'vocabulary_project')
    .in('legacy_project_id', projectIds);

  if (existingAssetsError) {
    throw new Error(`legacy_learning_assets_check_failed:${existingAssetsError.message}`);
  }

  const existingProjectIds = new Set(
    (existingAssets ?? [])
      .map((row) => (typeof row.legacy_project_id === 'string' ? row.legacy_project_id : null))
      .filter((value): value is string => Boolean(value)),
  );

  const missingProjectIds = projectIds.filter((projectId) => !existingProjectIds.has(projectId));
  if (missingProjectIds.length === 0) return;

  const { data: projects, error: projectsError } = await admin
    .from('projects')
    .select('id, user_id, title, created_at')
    .eq('user_id', userId)
    .in('id', missingProjectIds);

  if (projectsError) {
    throw new Error(`legacy_projects_lookup_failed:${projectsError.message}`);
  }

  const payload = (projects ?? []).map((project) => ({
    user_id: project.user_id as string,
    kind: 'vocabulary_project',
    title: project.title as string,
    status: 'ready',
    legacy_project_id: project.id as string,
    created_at: project.created_at as string,
    updated_at: project.created_at as string,
  }));

  if (payload.length === 0) return;

  const { error: upsertError } = await admin
    .from('learning_assets')
    .upsert(payload, { onConflict: 'legacy_project_id' });

  if (upsertError) {
    throw new Error(`legacy_learning_assets_backfill_failed:${upsertError.message}`);
  }
}

async function fetchProjectWords(admin: SupabaseClient, projectId: string): Promise<Word[]> {
  const { data, error } = await admin
    .from('words')
    .select(RESOLVED_WORD_SELECT_COLUMNS)
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`project_words_lookup_failed:${error.message}`);
  return ((data ?? []) as WordRow[]).map(mapWordFromRow);
}

function deriveIdioms(words: Word[]): string[] {
  const seen = new Set<string>();

  for (const word of words) {
    const normalized = word.english.trim();
    if (!normalized) continue;
    if (!/\s/.test(normalized)) continue;
    seen.add(normalized);
  }

  return Array.from(seen);
}

function buildVocabularyResult(
  asset: LearningAssetSummary,
  project: Project,
  words: Word[],
): VocabularyAssetResult {
  return buildVocabularyAssetDetail(asset, project, words, deriveIdioms(words));
}

export async function listCollectionItemsForUser(
  userId: string,
  collectionId: string,
  deps?: AdminDeps,
): Promise<CollectionItemSummary[]> {
  const admin = getAdminClient(deps);
  await requireOwnedCollection(admin, userId, collectionId);

  const { data: itemRows, error: itemError } = await admin
    .from('collection_items')
    .select('*')
    .eq('collection_id', collectionId)
    .order('sort_order', { ascending: true });

  if (itemError) throw new Error(`collection_items_list_failed:${itemError.message}`);

  const { data: legacyRows, error: legacyError } = await admin
    .from('collection_projects')
    .select('collection_id, project_id, sort_order, added_at')
    .eq('collection_id', collectionId)
    .order('sort_order', { ascending: true });

  if (legacyError) throw new Error(`collection_projects_list_failed:${legacyError.message}`);

  const collectionItems = (itemRows ?? []) as CollectionItemRow[];
  const legacyProjectIds = ((legacyRows ?? []) as Array<{ project_id: string; sort_order: number; added_at: string; collection_id: string }>)
    .map((row) => row.project_id);

  await ensureVocabularyAssetsForLegacyProjects(admin, userId, legacyProjectIds);

  const assetIds = collectionItems.map((row) => row.asset_id);
  const { data: directAssets, error: directAssetError } = assetIds.length === 0
    ? { data: [], error: null }
    : await admin
      .from('learning_assets')
      .select('*')
      .in('id', assetIds)
      .eq('user_id', userId);

  if (directAssetError) throw new Error(`learning_assets_lookup_failed:${directAssetError.message}`);

  const { data: legacyAssets, error: legacyAssetError } = legacyProjectIds.length === 0
    ? { data: [], error: null }
    : await admin
      .from('learning_assets')
      .select('*')
      .eq('user_id', userId)
      .in('legacy_project_id', legacyProjectIds);

  if (legacyAssetError) throw new Error(`legacy_learning_assets_lookup_failed:${legacyAssetError.message}`);

  const assetMap = new Map<string, LearningAssetSummary>();
  for (const row of [...(directAssets ?? []), ...(legacyAssets ?? [])]) {
    const asset = mapLearningAssetFromRow(row as LearningAssetRow);
    assetMap.set(asset.id, asset);
  }

  const seenAssetIds = new Set(collectionItems.map((row) => row.asset_id));
  const mergedRows: CollectionItemRow[] = [...collectionItems];
  for (const row of (legacyRows ?? []) as Array<{ project_id: string; sort_order: number; added_at: string; collection_id: string }>) {
    const matchingAsset = Array.from(assetMap.values()).find((asset) => asset.legacyProjectId === row.project_id);
    if (!matchingAsset || seenAssetIds.has(matchingAsset.id)) continue;
    mergedRows.push({
      collection_id: row.collection_id,
      asset_id: matchingAsset.id,
      sort_order: row.sort_order,
      added_at: row.added_at,
    });
  }

  const projectIds = Array.from(new Set(
    mergedRows
      .map((row) => assetMap.get(row.asset_id)?.legacyProjectId)
      .filter((value): value is string => Boolean(value)),
  ));

  const { data: projectRows, error: projectError } = projectIds.length === 0
    ? { data: [], error: null }
    : await admin
      .from('projects')
      .select('id, title, icon_image, source_labels, created_at')
      .in('id', projectIds)
      .eq('user_id', userId);

  if (projectError) throw new Error(`projects_preview_lookup_failed:${projectError.message}`);

  const projectMap = new Map<string, ReturnType<typeof mapVocabularyProjectPreviewFromRow>>();
  for (const row of (projectRows ?? []) as VocabularyProjectPreviewRow[]) {
    const project = mapVocabularyProjectPreviewFromRow(row);
    projectMap.set(project.id, project);
  }

  return mergedRows
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((row) => {
      const asset = assetMap.get(row.asset_id);
      if (!asset) {
        throw new Error('collection_item_asset_missing');
      }
      const project = asset.legacyProjectId ? projectMap.get(asset.legacyProjectId) : undefined;
      return mapCollectionItemSummary(row, asset, project);
    });
}

export async function addAssetToCollectionForUser(
  userId: string,
  collectionId: string,
  assetId: string,
  deps?: AdminDeps,
): Promise<void> {
  const admin = getAdminClient(deps);
  await addAssetToCollectionInternal(admin, userId, collectionId, assetId);
}

export async function getCollectionNotebookBindingForUser(
  userId: string,
  collectionId: string,
  args: { wordbookAssetId?: string; assetId?: string },
  deps?: AdminDeps,
): Promise<CollectionNotebookBinding | null> {
  const admin = getAdminClient(deps);
  return fetchCollectionNotebookBinding(admin, userId, collectionId, args);
}

export async function createCollectionNotebookBindingForUser(
  userId: string,
  collectionId: string,
  input: CreateNotebookBindingInput,
  deps?: AdminDeps,
): Promise<CollectionNotebookBinding> {
  const admin = getAdminClient(deps);
  return upsertCollectionNotebookBindingInternal(admin, userId, collectionId, input);
}

export async function updateCollectionNotebookBindingForUser(
  userId: string,
  collectionId: string,
  bindingId: string,
  input: UpdateNotebookBindingInput,
  deps?: AdminDeps,
): Promise<CollectionNotebookBinding> {
  const admin = getAdminClient(deps);
  return updateCollectionNotebookBindingInternal(admin, userId, collectionId, bindingId, input);
}

export async function getVocabularyAssetForUser(
  userId: string,
  identifier: string,
  deps?: AdminDeps,
): Promise<VocabularyAssetResult> {
  const admin = getAdminClient(deps);
  const asset = await requireOwnedVocabularyAssetByIdentifier(admin, userId, identifier);

  if (!asset.legacyProjectId) {
    throw new Error('vocabulary_asset_project_missing');
  }

  const [project, words] = await Promise.all([
    fetchOwnedProject(admin, userId, asset.legacyProjectId),
    fetchProjectWords(admin, asset.legacyProjectId),
  ]);

  return buildVocabularyResult(asset, project, words);
}

export async function createVocabularyAssetForUser(
  userId: string,
  input: CreateVocabularyInput,
  deps?: AdminDeps,
): Promise<VocabularyAssetResult> {
  const admin = getAdminClient(deps);
  await requireOwnedCollection(admin, userId, input.collectionId);

  const { data: projectRow, error: projectError } = await insertProjectWithSourceLabelsCompat<ProjectRow>(admin, {
    user_id: userId,
    title: input.title,
    source_labels: [],
    ...(input.iconImage ? { icon_image: input.iconImage } : {}),
  });

  if (projectError || !projectRow) {
    throw new Error(`project_create_failed:${projectError?.message ?? 'project_create_failed'}`);
  }

  const project = mapProjectFromRow(projectRow);
  const { data: assetRow, error: assetError } = await admin
    .from('learning_assets')
    .upsert({
      user_id: userId,
      kind: 'vocabulary_project',
      title: project.title,
      status: 'ready',
      legacy_project_id: project.id,
      created_at: project.createdAt,
      updated_at: project.createdAt,
    }, { onConflict: 'legacy_project_id' })
    .select('*')
    .single();

  if (assetError || !assetRow) {
    throw new Error(`vocabulary_asset_upsert_failed:${assetError?.message ?? 'vocabulary_asset_upsert_failed'}`);
  }

  const asset = mapLearningAssetFromRow(assetRow as LearningAssetRow);
  await addAssetToCollectionInternal(admin, userId, input.collectionId, asset.id);

  return buildVocabularyResult(asset, project, []);
}

export async function createStructureDocumentForUser(
  userId: string,
  input: CreateStructureInput,
  deps?: AdminDeps,
): Promise<StructureDocumentResult> {
  const admin = getAdminClient(deps);
  if (input.wordbookAssetId && !input.collectionId) {
    throw new Error('notebook_binding_requires_collection');
  }
  const analysis = await analyzeStructureText(input.text);

  const { data: assetRow, error: assetError } = await admin
    .from('learning_assets')
    .insert({
      user_id: userId,
      kind: 'structure_document',
      title: input.title,
      status: 'ready',
    })
    .select('*')
    .single();

  if (assetError) throw new Error(`structure_asset_insert_failed:${assetError.message}`);

  const asset = mapLearningAssetFromRow(assetRow as LearningAssetRow);
  const { data: documentRow, error: documentError } = await admin
    .from('structure_documents')
    .insert({
      asset_id: asset.id,
      original_text: input.text,
      normalized_text: analysis.normalizedText,
      source_type: input.sourceType,
      cefr_target: 'pre1',
      parse_tree_json: analysis.parseTree,
      analysis_summary_json: {
        ...analysis.analysisSummary,
        mentionedTerms: analysis.mentionedTerms,
      },
      last_analyzed_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (documentError) throw new Error(`structure_document_insert_failed:${documentError.message}`);
  if (input.collectionId) {
    await addAssetToCollectionInternal(admin, userId, input.collectionId, asset.id);
    if (input.wordbookAssetId) {
      await upsertCollectionNotebookBindingInternal(admin, userId, input.collectionId, {
        wordbookAssetId: input.wordbookAssetId,
        structureAssetId: asset.id,
      });
    }
  }

  return {
    asset,
    document: mapStructureDocumentFromRow(documentRow as StructureDocumentRow),
  };
}

export async function getStructureDocumentForUser(
  userId: string,
  assetId: string,
  deps?: AdminDeps,
): Promise<StructureDocumentResult> {
  const admin = getAdminClient(deps);
  const asset = await requireOwnedAsset(admin, userId, assetId, 'structure_document');
  const document = await fetchStructureDocument(admin, assetId);
  return { asset, document };
}

export async function reanalyzeStructureDocumentForUser(
  userId: string,
  assetId: string,
  deps?: AdminDeps,
): Promise<StructureDocumentResult> {
  const admin = getAdminClient(deps);
  const asset = await requireOwnedAsset(admin, userId, assetId, 'structure_document');
  const existing = await fetchStructureDocument(admin, assetId);
  const analysis = await analyzeStructureText(existing.originalText);

  const { error: assetError } = await admin
    .from('learning_assets')
    .update({ status: 'ready' })
    .eq('id', asset.id)
    .eq('user_id', userId);
  if (assetError) throw new Error(`structure_asset_update_failed:${assetError.message}`);

  const { data: documentRow, error: documentError } = await admin
    .from('structure_documents')
    .update({
      normalized_text: analysis.normalizedText,
      parse_tree_json: analysis.parseTree,
      analysis_summary_json: {
        ...analysis.analysisSummary,
        mentionedTerms: analysis.mentionedTerms,
      },
      last_analyzed_at: new Date().toISOString(),
      error_message: null,
    })
    .eq('asset_id', assetId)
    .select('*')
    .single();

  if (documentError) throw new Error(`structure_document_update_failed:${documentError.message}`);

  return {
    asset: await requireOwnedAsset(admin, userId, assetId, 'structure_document'),
    document: mapStructureDocumentFromRow(documentRow as StructureDocumentRow),
  };
}

export async function createCorrectionDocumentForUser(
  userId: string,
  input: CreateCorrectionInput,
  deps?: AdminDeps,
): Promise<CorrectionDocumentResult> {
  const admin = getAdminClient(deps);
  if (input.wordbookAssetId && !input.collectionId) {
    throw new Error('notebook_binding_requires_collection');
  }
  const analysis = await analyzeCorrectionText(input.text);

  const { data: assetRow, error: assetError } = await admin
    .from('learning_assets')
    .insert({
      user_id: userId,
      kind: 'correction_document',
      title: input.title,
      status: 'ready',
    })
    .select('*')
    .single();

  if (assetError) throw new Error(`correction_asset_insert_failed:${assetError.message}`);
  const asset = mapLearningAssetFromRow(assetRow as LearningAssetRow);

  const { data: documentRow, error: documentError } = await admin
    .from('correction_documents')
    .insert({
      asset_id: asset.id,
      original_text: input.text,
      corrected_text: analysis.correctedText,
      source_type: input.sourceType,
      inline_annotations_json: analysis.inlineAnnotations,
      summary_json: analysis.summary,
      last_analyzed_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (documentError) throw new Error(`correction_document_insert_failed:${documentError.message}`);

  const findingRows = analysis.findings.map((finding, index) => ({
    id: uuidv4(),
    asset_id: asset.id,
    span_start: finding.spanStart,
    span_end: finding.spanEnd,
    category: finding.category,
    rule_name_ja: finding.ruleNameJa,
    rule_name_en: finding.ruleNameEn,
    incorrect_text: finding.incorrectText,
    suggested_text: finding.suggestedText,
    formal_usage_ja: finding.formalUsageJa,
    example_sentence: finding.exampleSentence ?? null,
    example_sentence_ja: finding.exampleSentenceJa ?? null,
    learner_advice: finding.learnerAdvice,
    difficulty: finding.difficulty,
    sort_order: finding.sortOrder ?? index,
  }));

  const { data: insertedFindings, error: findingError } = findingRows.length === 0
    ? { data: [], error: null }
    : await admin
      .from('correction_findings')
      .insert(findingRows)
      .select('*');

  if (findingError) throw new Error(`correction_findings_insert_failed:${findingError.message}`);

  const insertedFindingRows = (insertedFindings ?? []) as CorrectionFindingRow[];
  const findingIdByIndex = new Map<number, string>();
  for (const row of insertedFindingRows) {
    findingIdByIndex.set(row.sort_order, row.id);
  }

  const reviewRows = analysis.reviewItems
    .map((reviewItem, index) => {
      const findingId = findingIdByIndex.get(index) ?? findingIdByIndex.get(reviewItem.findingIndex);
      if (!findingId) return null;
      return {
        id: uuidv4(),
        finding_id: findingId,
        user_id: userId,
        quiz_payload_json: reviewItem.quizPayload,
        status: 'new',
      };
    })
    .filter(Boolean);

  const { data: insertedReviewItems, error: reviewError } = reviewRows.length === 0
    ? { data: [], error: null }
    : await admin
      .from('correction_review_items')
      .insert(reviewRows)
      .select('*');

  if (reviewError) throw new Error(`correction_review_items_insert_failed:${reviewError.message}`);

  if (input.collectionId) {
    await addAssetToCollectionInternal(admin, userId, input.collectionId, asset.id);
    if (input.wordbookAssetId) {
      await upsertCollectionNotebookBindingInternal(admin, userId, input.collectionId, {
        wordbookAssetId: input.wordbookAssetId,
        correctionAssetId: asset.id,
      });
    }
  }

  return {
    asset,
    document: mapCorrectionDocumentFromRow(documentRow as CorrectionDocumentRow),
    findings: insertedFindingRows.map(mapCorrectionFindingFromRow),
    reviewItems: ((insertedReviewItems ?? []) as CorrectionReviewItemRow[]).map(mapCorrectionReviewItemFromRow),
  };
}

export async function getCorrectionDocumentForUser(
  userId: string,
  assetId: string,
  deps?: AdminDeps,
): Promise<CorrectionDocumentResult> {
  const admin = getAdminClient(deps);
  const asset = await requireOwnedAsset(admin, userId, assetId, 'correction_document');
  const document = await fetchCorrectionDocument(admin, assetId);
  const findings = await fetchCorrectionFindings(admin, assetId);
  const reviewItems = await fetchCorrectionReviewItems(admin, userId, findings.map((finding) => finding.id));

  return {
    asset,
    document,
    findings,
    reviewItems,
  };
}

export async function reanalyzeCorrectionDocumentForUser(
  userId: string,
  assetId: string,
  deps?: AdminDeps,
): Promise<CorrectionDocumentResult> {
  const admin = getAdminClient(deps);
  const asset = await requireOwnedAsset(admin, userId, assetId, 'correction_document');
  const existing = await fetchCorrectionDocument(admin, assetId);
  const analysis = await analyzeCorrectionText(existing.originalText);

  const { error: deleteFindingsError } = await admin
    .from('correction_findings')
    .delete()
    .eq('asset_id', assetId);
  if (deleteFindingsError) throw new Error(`correction_findings_delete_failed:${deleteFindingsError.message}`);

  const { data: documentRow, error: documentError } = await admin
    .from('correction_documents')
    .update({
      corrected_text: analysis.correctedText,
      inline_annotations_json: analysis.inlineAnnotations,
      summary_json: analysis.summary,
      last_analyzed_at: new Date().toISOString(),
      error_message: null,
    })
    .eq('asset_id', assetId)
    .select('*')
    .single();

  if (documentError) throw new Error(`correction_document_update_failed:${documentError.message}`);

  const { error: assetError } = await admin
    .from('learning_assets')
    .update({ status: 'ready' })
    .eq('id', assetId)
    .eq('user_id', userId);
  if (assetError) throw new Error(`correction_asset_update_failed:${assetError.message}`);

  const findingRows = analysis.findings.map((finding, index) => ({
    id: uuidv4(),
    asset_id: assetId,
    span_start: finding.spanStart,
    span_end: finding.spanEnd,
    category: finding.category,
    rule_name_ja: finding.ruleNameJa,
    rule_name_en: finding.ruleNameEn,
    incorrect_text: finding.incorrectText,
    suggested_text: finding.suggestedText,
    formal_usage_ja: finding.formalUsageJa,
    example_sentence: finding.exampleSentence ?? null,
    example_sentence_ja: finding.exampleSentenceJa ?? null,
    learner_advice: finding.learnerAdvice,
    difficulty: finding.difficulty,
    sort_order: finding.sortOrder ?? index,
  }));

  const { data: insertedFindings, error: findingError } = findingRows.length === 0
    ? { data: [], error: null }
    : await admin.from('correction_findings').insert(findingRows).select('*');
  if (findingError) throw new Error(`correction_findings_reinsert_failed:${findingError.message}`);

  const insertedFindingRows = (insertedFindings ?? []) as CorrectionFindingRow[];
  const findingIdByIndex = new Map<number, string>();
  for (const row of insertedFindingRows) {
    findingIdByIndex.set(row.sort_order, row.id);
  }

  const reviewRows = analysis.reviewItems
    .map((reviewItem, index) => {
      const findingId = findingIdByIndex.get(index) ?? findingIdByIndex.get(reviewItem.findingIndex);
      if (!findingId) return null;
      return {
        id: uuidv4(),
        finding_id: findingId,
        user_id: userId,
        quiz_payload_json: reviewItem.quizPayload,
        status: 'new',
      };
    })
    .filter(Boolean);

  const { data: insertedReviewItems, error: reviewError } = reviewRows.length === 0
    ? { data: [], error: null }
    : await admin.from('correction_review_items').insert(reviewRows).select('*');
  if (reviewError) throw new Error(`correction_review_items_reinsert_failed:${reviewError.message}`);

  return {
    asset: await requireOwnedAsset(admin, userId, assetId, 'correction_document'),
    document: mapCorrectionDocumentFromRow(documentRow as CorrectionDocumentRow),
    findings: insertedFindingRows.map(mapCorrectionFindingFromRow),
    reviewItems: ((insertedReviewItems ?? []) as CorrectionReviewItemRow[]).map(mapCorrectionReviewItemFromRow),
  };
}

export async function listCorrectionReviewQueueForUser(
  userId: string,
  filters: ReviewFilters,
  deps?: AdminDeps,
): Promise<CorrectionReviewQueueItem[]> {
  const admin = getAdminClient(deps);
  let scopeAssetIds: Set<string> | null = null;

  if (filters.collectionId) {
    await requireOwnedCollection(admin, userId, filters.collectionId);
    const { data, error } = await admin
      .from('collection_items')
      .select('asset_id')
      .eq('collection_id', filters.collectionId);
    if (error) throw new Error(`collection_review_scope_failed:${error.message}`);
    scopeAssetIds = new Set((data ?? []).map((row) => row.asset_id as string));
  }

  let reviewQuery = admin
    .from('correction_review_items')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (filters.status === 'new' || filters.status === 'review') {
    reviewQuery = reviewQuery.eq('status', filters.status);
  }

  const { data: reviewRows, error: reviewError } = await reviewQuery;
  if (reviewError) throw new Error(`review_queue_lookup_failed:${reviewError.message}`);

  const reviewItems = ((reviewRows ?? []) as CorrectionReviewItemRow[]).map(mapCorrectionReviewItemFromRow);
  const now = Date.now();
  const filteredReviewItems = filters.status === 'due'
    ? reviewItems.filter((item) => !item.nextReviewAt || Date.parse(item.nextReviewAt) <= now)
    : reviewItems;

  const findingIds = filteredReviewItems.map((item) => item.findingId);
  if (findingIds.length === 0) return [];

  const { data: findingRows, error: findingError } = await admin
    .from('correction_findings')
    .select('*')
    .in('id', findingIds);
  if (findingError) throw new Error(`review_queue_findings_lookup_failed:${findingError.message}`);

  const findings = ((findingRows ?? []) as CorrectionFindingRow[]).map(mapCorrectionFindingFromRow);
  const findingMap = new Map(findings.map((finding) => [finding.id, finding]));

  const assetIds = Array.from(new Set(findings.map((finding) => finding.assetId)));
  const { data: assetRows, error: assetError } = await admin
    .from('learning_assets')
    .select('*')
    .eq('user_id', userId)
    .in('id', assetIds);
  if (assetError) throw new Error(`review_queue_assets_lookup_failed:${assetError.message}`);

  const assets = ((assetRows ?? []) as LearningAssetRow[]).map(mapLearningAssetFromRow);
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]));

  return filteredReviewItems
    .map((reviewItem) => {
      const finding = findingMap.get(reviewItem.findingId);
      if (!finding) return null;
      if (scopeAssetIds && !scopeAssetIds.has(finding.assetId)) return null;
      const asset = assetMap.get(finding.assetId);
      if (!asset) return null;
      return { asset, finding, reviewItem };
    })
    .filter(Boolean) as CorrectionReviewQueueItem[];
}

export async function answerCorrectionReviewItemForUser(
  userId: string,
  reviewItemId: string,
  isCorrect: boolean,
  deps?: AdminDeps,
): Promise<CorrectionReviewItem> {
  const admin = getAdminClient(deps);
  const { data, error } = await admin
    .from('correction_review_items')
    .select('*')
    .eq('id', reviewItemId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(`review_item_lookup_failed:${error.message}`);
  if (!data) throw new Error('review_item_not_found');

  const current = mapCorrectionReviewItemFromRow(data as CorrectionReviewItemRow);
  const schedule = calculateNextReviewByQuality(isCorrect ? 4 : 1, {
    id: current.id,
    projectId: 'correction-review',
    english: current.quizPayload.question,
    japanese: current.quizPayload.correctAnswer,
    distractors: current.quizPayload.choices.filter((choice) => choice !== current.quizPayload.correctAnswer),
    status: current.status,
    createdAt: current.createdAt,
    easeFactor: current.easeFactor,
    intervalDays: current.intervalDays,
    repetition: current.repetition,
    isFavorite: false,
  });

  const nextStatus = getStatusAfterAnswer(current.status, isCorrect);
  const { data: updatedRow, error: updateError } = await admin
    .from('correction_review_items')
    .update({
      status: nextStatus,
      last_reviewed_at: schedule.lastReviewedAt,
      next_review_at: schedule.nextReviewAt,
      ease_factor: schedule.easeFactor,
      interval_days: schedule.intervalDays,
      repetition: schedule.repetition,
    })
    .eq('id', reviewItemId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (updateError) throw new Error(`review_item_update_failed:${updateError.message}`);
  return mapCorrectionReviewItemFromRow(updatedRow as CorrectionReviewItemRow);
}
