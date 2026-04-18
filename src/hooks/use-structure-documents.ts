'use client';

import { useCallback, useEffect, useState } from 'react';
import type { LearningAssetSummary, StructureDocument, StructureSourceType } from '@/types';
import { requestJson } from './api-client';

type StructureDocumentResponse = {
  success: boolean;
  asset: LearningAssetSummary;
  document: StructureDocument;
};

type CreateStructureDocumentInput = {
  title: string;
  collectionId?: string;
  text: string;
  sourceType: StructureSourceType;
};

export function useStructureDocument(assetId?: string | null) {
  const [asset, setAsset] = useState<LearningAssetSummary | null>(null);
  const [document, setDocument] = useState<StructureDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!assetId) {
      setAsset(null);
      setDocument(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const payload = await requestJson<StructureDocumentResponse>(`/api/structure-documents/${assetId}`);
      setAsset(payload.asset);
      setDocument(payload.document);
      return payload;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '構造解析ドキュメントの取得に失敗しました。');
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

    const payload = await requestJson<StructureDocumentResponse>(`/api/structure-documents/${assetId}/reanalyze`, {
      method: 'POST',
    });
    setAsset(payload.asset);
    setDocument(payload.document);
    return payload;
  }, [assetId]);

  return {
    asset,
    document,
    loading,
    error,
    refresh,
    reanalyze,
  };
}

export function useCreateStructureDocument() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (input: CreateStructureDocumentInput) => {
    try {
      setLoading(true);
      setError(null);
      return await requestJson<StructureDocumentResponse>('/api/structure-documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '構造解析ドキュメントの作成に失敗しました。');
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
