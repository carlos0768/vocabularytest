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

export function getNotebookCreateHref(collectionId: string, kind: LearningAssetKind): string {
  return `/collections/${collectionId}/notes/new?kind=${getNotebookKindSegment(kind)}`;
}

export function findNotebookItemByKind(
  items: CollectionItemSummary[],
  kind: LearningAssetKind,
): CollectionItemSummary | undefined {
  return items.find((item) => item.asset.kind === kind);
}
