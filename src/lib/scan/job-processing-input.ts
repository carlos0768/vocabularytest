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

// スキャンで1語も抽出できなかったときのエラーメッセージ。
// 画像ごとの抽出エラー（多くはAIが返す日本語メッセージ）があればそれを優先し、
// 無い場合は「単語帳が写っていない」ケースを想定した、理由の伝わる日本語文言を返す。
// （英語の技術的メッセージをそのままユーザーに見せない）
export const SCAN_JOB_NO_WORDS_FALLBACK_MESSAGE =
  '画像から単語を読み取れませんでした。単語帳や英単語がはっきり写るように、もう一度撮影してください。';

export function buildScanJobNoWordsErrorMessage(
  firstExtractionError: string | null | undefined,
): string {
  return firstExtractionError?.trim() || SCAN_JOB_NO_WORDS_FALLBACK_MESSAGE;
}
