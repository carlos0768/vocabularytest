export interface ProjectScanProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'complete' | 'error';
}

export function buildProjectSingleScanInitialSteps(): ProjectScanProgressStep[] {
  return [
    { id: 'upload', label: '画像をアップロード中...', status: 'active' },
    { id: 'analyze', label: '文字を解析中...', status: 'pending' },
  ];
}

export function buildProjectSingleScanAnalyzeSteps(): ProjectScanProgressStep[] {
  return [
    { id: 'upload', label: '画像をアップロード中...', status: 'complete' },
    { id: 'analyze', label: '文字を解析中...', status: 'active' },
  ];
}

export function buildProjectMultipleScanInitialSteps(totalFiles: number): ProjectScanProgressStep[] {
  return Array.from({ length: totalFiles }, (_, index) => ({
    id: `file-${index}`,
    label: buildProjectMultipleScanProcessingLabel(index, totalFiles),
    status: index === 0 ? 'active' : 'pending',
  }));
}

export function activateProjectMultipleScanFileStep(
  steps: readonly ProjectScanProgressStep[],
  fileIndex: number,
  totalFiles: number,
): ProjectScanProgressStep[] {
  return steps.map((step, index) => ({
    ...step,
    status: index < fileIndex ? 'complete' : index === fileIndex ? 'active' : 'pending',
    label: index === fileIndex ? buildProjectMultipleScanProcessingLabel(fileIndex, totalFiles) : step.label,
  }));
}

export function markProjectMultipleScanFileProcessingError(
  steps: readonly ProjectScanProgressStep[],
  fileIndex: number,
): ProjectScanProgressStep[] {
  return steps.map((step, index) => ({
    ...step,
    status: index === fileIndex ? 'error' : step.status,
    label: index === fileIndex ? `画像 ${fileIndex + 1}: 処理エラー` : step.label,
  }));
}

export function markProjectMultipleScanFileApiError(
  steps: readonly ProjectScanProgressStep[],
  fileIndex: number,
): ProjectScanProgressStep[] {
  return steps.map((step, index) => ({
    ...step,
    status: index === fileIndex ? 'error' : step.status,
    label: index === fileIndex ? `画像 ${fileIndex + 1}: エラー` : step.label,
  }));
}

export function completeProjectMultipleScanFileStep(
  steps: readonly ProjectScanProgressStep[],
  fileIndex: number,
  totalFiles: number,
): ProjectScanProgressStep[] {
  return steps.map((step, index) => ({
    ...step,
    status: index === fileIndex ? 'complete' : step.status,
    label: index === fileIndex ? `画像 ${fileIndex + 1}/${totalFiles} 完了` : step.label,
  }));
}

export function markActiveOrPendingProjectScanStepsError(
  steps: readonly ProjectScanProgressStep[],
  errorLabel: string,
): ProjectScanProgressStep[] {
  return steps.map((step) =>
    step.status === 'active' || step.status === 'pending'
      ? { ...step, status: 'error', label: errorLabel }
      : step,
  );
}

function buildProjectMultipleScanProcessingLabel(fileIndex: number, totalFiles: number): string {
  return `画像 ${fileIndex + 1}/${totalFiles} を処理中...`;
}
