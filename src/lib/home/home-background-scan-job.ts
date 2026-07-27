import type { ExtractMode } from '@/lib/scan/mode-provider';

export type HomeBackgroundScanEikenLevel = '5' | '4' | '3' | 'pre2' | '2' | 'pre1' | '1' | null;

export interface HomeBackgroundScanJobCreatePayload {
  imagePaths: string[];
  projectTitle: string;
  scanMode: ExtractMode;
  scanModes?: ExtractMode[];
  eikenLevel: HomeBackgroundScanEikenLevel;
  includeMorphology?: boolean;
  customModeId?: string;
  customPrompt?: string;
  targetProjectId?: string;
  clientPlatform: 'web';
}

export function buildHomeBackgroundScanJobCreatePayload(params: {
  imagePaths: readonly string[];
  scanMode: ExtractMode;
  scanModes?: readonly ExtractMode[];
  eikenLevel?: HomeBackgroundScanEikenLevel;
  includeMorphology?: boolean;
  customModeId?: string | null;
  customPrompt?: string | null;
  projectTitle?: string | null;
  targetProjectId?: string | null;
  now?: Date;
}): HomeBackgroundScanJobCreatePayload {
  const dateLabel = (params.now ?? new Date()).toLocaleDateString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
  });
  const isCustomScan = params.scanMode === 'custom' || Boolean(params.scanModes?.includes('custom'));

  return {
    imagePaths: [...params.imagePaths],
    projectTitle: params.projectTitle || `スキャン ${dateLabel}`,
    scanMode: params.scanMode,
    ...(params.scanModes && params.scanModes.length > 0 ? { scanModes: [...params.scanModes] } : {}),
    eikenLevel: params.scanMode === 'eiken' || params.scanModes?.includes('eiken')
      ? params.eikenLevel ?? null
      : null,
    ...(params.includeMorphology ? { includeMorphology: true } : {}),
    // カスタムモード以外では抽出プロンプトを送らない（サーバー側でも無視される）
    ...(isCustomScan && params.customModeId ? { customModeId: params.customModeId } : {}),
    ...(isCustomScan && !params.customModeId && params.customPrompt
      ? { customPrompt: params.customPrompt }
      : {}),
    targetProjectId: params.targetProjectId || undefined,
    clientPlatform: 'web',
  };
}
