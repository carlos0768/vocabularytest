import type { ExtractMode } from '@/lib/scan/mode-provider';

export type HomeBackgroundScanEikenLevel = '5' | '4' | '3' | 'pre2' | '2' | 'pre1' | '1' | null;

export interface HomeBackgroundScanJobCreatePayload {
  imagePaths: string[];
  projectTitle: string;
  scanMode: ExtractMode;
  eikenLevel: HomeBackgroundScanEikenLevel;
  targetProjectId?: string;
  clientPlatform: 'web';
}

export function buildHomeBackgroundScanJobCreatePayload(params: {
  imagePaths: readonly string[];
  scanMode: ExtractMode;
  eikenLevel?: HomeBackgroundScanEikenLevel;
  targetProjectId?: string | null;
  now?: Date;
}): HomeBackgroundScanJobCreatePayload {
  const dateLabel = (params.now ?? new Date()).toLocaleDateString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
  });

  return {
    imagePaths: [...params.imagePaths],
    projectTitle: `スキャン ${dateLabel}`,
    scanMode: params.scanMode,
    eikenLevel: params.scanMode === 'eiken' ? params.eikenLevel ?? null : null,
    targetProjectId: params.targetProjectId || undefined,
    clientPlatform: 'web',
  };
}
