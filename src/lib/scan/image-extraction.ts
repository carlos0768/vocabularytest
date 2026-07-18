import { Buffer } from 'node:buffer';

import { normalizeExtractModes, type ExtractMode } from '@/lib/scan/mode-provider';
import { toUserFacingScanErrorMessage } from '@/lib/scan/scan-error-message';
import { ensureSourceLabels } from '../../../shared/source-labels';

export type ScanImageApiKeys = {
  gemini?: string;
  openai?: string;
};

export type ScanImageExtractionLikeResult =
  | { success: true; data: { words: unknown[]; sourceLabels?: unknown[] } }
  | { success: false; error: string; reason?: string };

export interface ScanImageExtractionResult<TWord, TWarningCode extends string = string> {
  words: TWord[];
  sourceLabels: string[];
  warningCode?: TWarningCode;
  error?: string;
  pageWarning?: string;
  downloadMs?: number;
  extractionMs?: number;
}

interface DownloadedImageData {
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface ScanImageExtractionDeps<TWord, TWarningCode extends string = string> {
  downloadImage: (imagePath: string) => Promise<{
    data: DownloadedImageData | null;
    error: unknown;
  }>;
  extractImage: (
    base64Image: string,
    modes: ExtractMode[],
    eikenLevel: string | null,
    apiKeys: ScanImageApiKeys,
  ) => Promise<{
    result: ScanImageExtractionLikeResult;
    warningCode?: TWarningCode;
  }>;
  parseWords: (rawWords: unknown[]) => TWord[];
  withTimingPhase: <T>(phase: 'aiExtraction', task: () => Promise<T>) => Promise<T>;
  withTimeout: <T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string) => Promise<T>;
  normalizeSourceLabels?: (values: Iterable<unknown> | null | undefined) => string[];
  now?: () => number;
  logError?: (message: string, error: unknown) => void;
}

export interface ProcessScanImageParams {
  imagePath: string;
  pageIndex: number;
  modes: ExtractMode[];
  eikenLevel: string | null;
  apiKeys: ScanImageApiKeys;
  timeoutMs: number;
  timeoutMessage: string;
}

export function getScanImageMimeType(imagePath: string): string {
  const ext = imagePath.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

export async function processScanImage<TWord, TWarningCode extends string = string>(
  params: ProcessScanImageParams,
  deps: ScanImageExtractionDeps<TWord, TWarningCode>,
): Promise<ScanImageExtractionResult<TWord, TWarningCode>> {
  const {
    imagePath,
    pageIndex,
    modes,
    eikenLevel,
    apiKeys,
    timeoutMs,
    timeoutMessage,
  } = params;
  const normalizedModes = normalizeExtractModes(modes);
  const pageLabel = `ページ${pageIndex + 1}`;
  const now = deps.now ?? Date.now;
  const logError = deps.logError ?? ((message: string, error: unknown) => console.error(message, error));

  const dlStart = now();
  const { data: imageData, error: downloadError } = await deps.downloadImage(imagePath);
  const dlMs = now() - dlStart;

  if (downloadError || !imageData) {
    logError(`Failed to download image ${imagePath}:`, downloadError);
    return {
      words: [],
      sourceLabels: [],
      error: '画像データの取得に失敗しました',
      pageWarning: `${pageLabel}: 画像データの取得に失敗しました`,
      downloadMs: dlMs,
    };
  }

  const buffer = await imageData.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  const mimeType = getScanImageMimeType(imagePath);
  const base64Image = `data:${mimeType};base64,${base64}`;

  try {
    const exStart = now();
    const extractionResult = await deps.withTimeout(
      deps.withTimingPhase('aiExtraction', () =>
        deps.extractImage(base64Image, normalizedModes, eikenLevel, apiKeys)
      ),
      timeoutMs,
      timeoutMessage,
    );
    const exMs = now() - exStart;

    const { result, warningCode } = extractionResult;

    if (result.success && result.data?.words) {
      const normalizeSourceLabels = deps.normalizeSourceLabels ?? ensureSourceLabels;
      return {
        words: deps.parseWords(result.data.words),
        sourceLabels: normalizeSourceLabels(result.data.sourceLabels),
        warningCode,
        downloadMs: dlMs,
        extractionMs: exMs,
      };
    } else if (!result.success) {
      const errMsg = result.error || '画像の解析に失敗しました';
      return {
        words: [],
        sourceLabels: [],
        warningCode,
        error: errMsg,
        pageWarning: `${pageLabel}: ${errMsg}`,
        downloadMs: dlMs,
        extractionMs: exMs,
      };
    }

    return {
      words: [],
      sourceLabels: [],
      warningCode,
      downloadMs: dlMs,
      extractionMs: exMs,
    };
  } catch (error) {
    logError(`Extraction timed out or failed unexpectedly for ${imagePath}:`, error);
    // 予期しない例外の生メッセージ（英語）はユーザーに見せず、理由の伝わる日本語文言に変換する
    const errMsg = toUserFacingScanErrorMessage(error, '画像の解析に失敗しました。もう一度お試しください。');
    return {
      words: [],
      sourceLabels: [],
      error: errMsg,
      pageWarning: `${pageLabel}: ${errMsg}`,
    };
  }
}
