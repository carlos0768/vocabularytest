import type { ExtractMode } from '@/lib/scan/mode-provider';

export type HomeBackgroundScanEikenLevel = '5' | '4' | '3' | 'pre2' | '2' | 'pre1' | '1' | null;

export interface HomeBackgroundScanJobCreatePayload {
  imagePaths: string[];
  projectTitle: string;
  scanMode: ExtractMode;
  scanModes?: ExtractMode[];
  eikenLevel: HomeBackgroundScanEikenLevel;
  includeMorphology?: boolean;
  targetProjectId?: string;
  clientPlatform: 'web';
}

export function buildHomeBackgroundScanJobCreatePayload(params: {
  imagePaths: readonly string[];
  scanMode: ExtractMode;
  scanModes?: readonly ExtractMode[];
  eikenLevel?: HomeBackgroundScanEikenLevel;
  includeMorphology?: boolean;
  projectTitle?: string | null;
  targetProjectId?: string | null;
  now?: Date;
}): HomeBackgroundScanJobCreatePayload {
  const dateLabel = (params.now ?? new Date()).toLocaleDateString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
  });

  return {
    imagePaths: [...params.imagePaths],
    projectTitle: params.projectTitle || `スキャン ${dateLabel}`,
    scanMode: params.scanMode,
    ...(params.scanModes && params.scanModes.length > 0 ? { scanModes: [...params.scanModes] } : {}),
    eikenLevel: params.scanMode === 'eiken' || params.scanModes?.includes('eiken')
      ? params.eikenLevel ?? null
      : null,
    ...(params.includeMorphology ? { includeMorphology: true } : {}),
    targetProjectId: params.targetProjectId || undefined,
    clientPlatform: 'web',
  };
}
