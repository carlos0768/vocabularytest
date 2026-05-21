import type { ExtractMode } from '@/lib/scan/mode-provider';

export interface HomeBackgroundScanJobCreatePayload {
  imagePaths: string[];
  projectTitle: string;
  scanMode: ExtractMode;
  eikenLevel: string | null;
  targetProjectId?: string;
  clientPlatform: 'web';
}

export function buildHomeBackgroundScanJobCreatePayload(params: {
  imagePaths: readonly string[];
  scanMode: ExtractMode;
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
    eikenLevel: null,
    targetProjectId: params.targetProjectId || undefined,
    clientPlatform: 'web',
  };
}
