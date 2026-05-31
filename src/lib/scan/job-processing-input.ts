export type ScanJobProcessSaveMode = 'server_cloud' | 'client_local';

export interface ScanJobProcessingInputSource {
  image_path?: string | null;
  image_paths?: string[] | null;
  save_mode?: string | null;
}

export interface ScanJobProcessingInput {
  imagePaths: string[];
  saveMode: ScanJobProcessSaveMode;
}

export function buildScanJobProcessingInput(
  job: ScanJobProcessingInputSource,
): ScanJobProcessingInput {
  return {
    imagePaths: job.image_paths || (job.image_path ? [job.image_path] : []),
    saveMode: job.save_mode === 'client_local' ? 'client_local' : 'server_cloud',
  };
}

export function buildScanJobNoWordsErrorMessage(
  firstExtractionError: string | null | undefined,
): string {
  return firstExtractionError || 'No words found in any image';
}
