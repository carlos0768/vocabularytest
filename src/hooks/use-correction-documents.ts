'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  CorrectionDocument,
  CorrectionFinding,
  CorrectionReviewItem,
  LearningAssetSummary,
  StructureSourceType,
} from '@/types';
import { requestJson } from './api-client';

type CorrectionDocumentResponse = {
  success: boolean;
  asset: LearningAssetSummary;
  document: CorrectionDocument;
  findings: CorrectionFinding[];
  reviewItems: CorrectionReviewItem[];
};

type CreateCorrectionDocumentInput = {
  title: string;
  collectionId?: string;
  text: string;
  sourceType: StructureSourceType;
};

export function useCorrectionDocument(assetId?: string | null) {
  const [asset, setAsset] = useState<LearningAssetSummary | null>(null);
  const [document, setDocument] = useState<CorrectionDocument | null>(null);
  const [findings, setFindings] = useState<CorrectionFinding[]>([]);
  const [reviewItems, setReviewItems] = useState<CorrectionReviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!assetId) {
      setAsset(null);
      setDocument(null);
      setFindings([]);
      setReviewItems([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const payload = await requestJson<CorrectionDocumentResponse>(`/api/correction-documents/${assetId}`);
      setAsset(payload.asset);
      setDocument(payload.document);
      setFindings(payload.findings ?? []);
      setReviewItems(payload.reviewItems ?? []);
      return payload;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '添削ドキュメントの取得に失敗しました。');
      throw requestError;
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const reanalyze = useCallback(async () => {
    if (!assetId) {
      throw new Error('assetId is required');
    }

    const payload = await requestJson<CorrectionDocumentResponse>(`/api/correction-documents/${assetId}/reanalyze`, {
      method: 'POST',
    });
    setAsset(payload.asset);
    setDocument(payload.document);
    setFindings(payload.findings ?? []);
    setReviewItems(payload.reviewItems ?? []);
    return payload;
  }, [assetId]);

  return {
    asset,
    document,
    findings,
    reviewItems,
    loading,
    error,
    refresh,
    reanalyze,
  };
}

export function useCreateCorrectionDocument() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (input: CreateCorrectionDocumentInput) => {
    try {
      setLoading(true);
      setError(null);
      return await requestJson<CorrectionDocumentResponse>('/api/correction-documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '添削ドキュメントの作成に失敗しました。');
      throw requestError;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    create,
    loading,
    error,
  };
}
