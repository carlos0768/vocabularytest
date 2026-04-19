import type { CollectionItemSummary, LearningAssetKind } from '@/types';

export const NOTEBOOK_KIND_ORDER: LearningAssetKind[] = [
  'vocabulary_project',
  'structure_document',
  'correction_document',
];

export function getNotebookKindLabel(kind: LearningAssetKind): string {
  switch (kind) {
    case 'structure_document':
      return '構造解析';
    case 'correction_document':
      return '添削';
    case 'vocabulary_project':
    default:
      return '単語帳';
  }
}

export function getNotebookKindSegment(kind: LearningAssetKind): 'wordbook' | 'structure' | 'correction' {
  switch (kind) {
    case 'structure_document':
      return 'structure';
    case 'correction_document':
      return 'correction';
    case 'vocabulary_project':
    default:
      return 'wordbook';
  }
}

export function getNotebookKindFromSegment(segment: string | null | undefined): LearningAssetKind | null {
  switch (segment) {
    case 'wordbook':
      return 'vocabulary_project';
    case 'structure':
      return 'structure_document';
    case 'correction':
      return 'correction_document';
    default:
      return null;
  }
}

export function getNotebookAssetHref(collectionId: string, item: CollectionItemSummary): string {
  return `/collections/${collectionId}/notes/${getNotebookKindSegment(item.asset.kind)}/${item.assetId}`;
}

export function getNotebookCreateHref(
  collectionId: string,
  kind: LearningAssetKind,
  options?: { wordbookAssetId?: string },
): string {
  const params = new URLSearchParams({ kind: getNotebookKindSegment(kind) });
  if (options?.wordbookAssetId) {
    params.set('wordbookAssetId', options.wordbookAssetId);
  }
  return `/collections/${collectionId}/notes/new?${params.toString()}`;
}

export function findNotebookItemByKind(
  items: CollectionItemSummary[],
  kind: LearningAssetKind,
): CollectionItemSummary | undefined {
  return items.find((item) => item.asset.kind === kind);
}

export function getStandaloneWordbookHref(identifier: string): string {
  return `/wordbook/${identifier}`;
}

export function getStandaloneStructureHref(assetId: string): string {
  return `/structure/${assetId}`;
}

export function getStandaloneCorrectionHref(assetId: string): string {
  return `/correction/${assetId}`;
}

export function getProjectNotebookCreateHref(
  projectId: string,
  kind: Exclude<LearningAssetKind, 'vocabulary_project'>,
): string {
  return `/project/${projectId}/new?kind=${getNotebookKindSegment(kind)}`;
}
