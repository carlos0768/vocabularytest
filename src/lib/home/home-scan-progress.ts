export interface HomeScanProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'complete' | 'error';
}

export function buildSingleScanInitialSteps(): HomeScanProgressStep[] {
  return [
    { id: 'upload', label: '画像をアップロード中...', status: 'active' },
    { id: 'analyze', label: '文字を解析中...', status: 'pending' },
  ];
}

export function buildSingleScanAnalyzeSteps(): HomeScanProgressStep[] {
  return [
    { id: 'upload', label: '画像をアップロード中...', status: 'complete' },
    { id: 'analyze', label: '文字を解析中...', status: 'active' },
  ];
}

export function buildSingleScanCompleteSteps(): HomeScanProgressStep[] {
  return [
    { id: 'upload', label: '画像をアップロード中...', status: 'complete' },
    { id: 'analyze', label: '文字を解析中...', status: 'complete' },
  ];
}

export function buildMultipleScanInitialSteps(totalFiles: number): HomeScanProgressStep[] {
  return Array.from({ length: totalFiles }, (_, index) => ({
    id: `file-${index}`,
    label: buildMultipleScanProcessingLabel(index, totalFiles),
    status: index === 0 ? 'active' : 'pending',
  }));
}

export function activateMultipleScanFileStep(
  steps: readonly HomeScanProgressStep[],
  fileIndex: number,
  totalFiles: number,
): HomeScanProgressStep[] {
  return steps.map((step, index) => ({
    ...step,
    status: index < fileIndex ? 'complete' : index === fileIndex ? 'active' : 'pending',
    label: index === fileIndex ? buildMultipleScanProcessingLabel(fileIndex, totalFiles) : step.label,
  }));
}

export function markMultipleScanFileProcessingError(
  steps: readonly HomeScanProgressStep[],
  fileIndex: number,
): HomeScanProgressStep[] {
  return steps.map((step, index) => ({
    ...step,
    status: index === fileIndex ? 'error' : step.status,
    label: index === fileIndex ? `画像 ${fileIndex + 1}: 処理エラー` : step.label,
  }));
}

export function markMultipleScanFileApiError(
  steps: readonly HomeScanProgressStep[],
  fileIndex: number,
): HomeScanProgressStep[] {
  return steps.map((step, index) => ({
    ...step,
    status: index === fileIndex ? 'error' : step.status,
    label: index === fileIndex ? `画像 ${fileIndex + 1}: エラー` : step.label,
  }));
}

export function completeMultipleScanFileStep(
  steps: readonly HomeScanProgressStep[],
  fileIndex: number,
  totalFiles: number,
): HomeScanProgressStep[] {
  return steps.map((step, index) => ({
    ...step,
    status: index === fileIndex ? 'complete' : step.status,
    label: index === fileIndex ? `画像 ${fileIndex + 1}/${totalFiles} 完了` : step.label,
  }));
}

export function appendMultipleScanNavigateStep(
  steps: readonly HomeScanProgressStep[],
): HomeScanProgressStep[] {
  return [
    ...steps.map((step) => ({ ...step, status: 'complete' as const })),
    { id: 'navigate', label: '結果を表示中...', status: 'active' },
  ];
}

export function markActiveOrPendingScanStepsError(
  steps: readonly HomeScanProgressStep[],
  errorLabel: string,
): HomeScanProgressStep[] {
  return steps.map((step) =>
    step.status === 'active' || step.status === 'pending'
      ? { ...step, status: 'error', label: errorLabel }
      : step,
  );
}

function buildMultipleScanProcessingLabel(fileIndex: number, totalFiles: number): string {
  return `画像 ${fileIndex + 1}/${totalFiles} を処理中...`;
}
