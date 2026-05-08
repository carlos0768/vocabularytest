export interface ScanConfirmStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SCAN_CONFIRM_SESSION_KEYS = {
  extractedWords: 'scanvocab_extracted_words',
  sourceLabels: 'scanvocab_source_labels',
  lexiconEntries: 'scanvocab_lexicon_entries',
  projectName: 'scanvocab_project_name',
  projectIcon: 'scanvocab_project_icon',
  existingProjectId: 'scanvocab_existing_project_id',
} as const;

export interface ScanConfirmResultPayload {
  words: unknown;
  sourceLabels: unknown;
  lexiconEntries: unknown;
}

export interface ScanConfirmProjectDraft {
  title: string;
  iconDataUrl?: string;
}

export function saveScanConfirmResultPayload(
  storage: ScanConfirmStorage,
  payload: ScanConfirmResultPayload,
): void {
  storage.setItem(SCAN_CONFIRM_SESSION_KEYS.extractedWords, JSON.stringify(payload.words));
  storage.setItem(SCAN_CONFIRM_SESSION_KEYS.sourceLabels, JSON.stringify(payload.sourceLabels));
  storage.setItem(SCAN_CONFIRM_SESSION_KEYS.lexiconEntries, JSON.stringify(payload.lexiconEntries));
}

export function saveScanConfirmProjectDraft(
  storage: ScanConfirmStorage,
  params: {
    projectName: string;
    projectIcon?: string | null;
  },
): void {
  storage.setItem(SCAN_CONFIRM_SESSION_KEYS.projectName, params.projectName);
  if (params.projectIcon) {
    storage.setItem(SCAN_CONFIRM_SESSION_KEYS.projectIcon, params.projectIcon);
  } else {
    storage.removeItem(SCAN_CONFIRM_SESSION_KEYS.projectIcon);
  }
}

export function setScanConfirmExistingProject(
  storage: ScanConfirmStorage,
  projectId: string,
): void {
  storage.setItem(SCAN_CONFIRM_SESSION_KEYS.existingProjectId, projectId);
  storage.removeItem(SCAN_CONFIRM_SESSION_KEYS.projectName);
  storage.removeItem(SCAN_CONFIRM_SESSION_KEYS.projectIcon);
}

export function prepareScanConfirmForExistingProject(
  storage: ScanConfirmStorage,
  projectId: string,
): void {
  setScanConfirmExistingProject(storage, projectId);
  storage.removeItem(SCAN_CONFIRM_SESSION_KEYS.sourceLabels);
  storage.removeItem(SCAN_CONFIRM_SESSION_KEYS.lexiconEntries);
}

export function hasScanConfirmExistingProject(storage: ScanConfirmStorage): boolean {
  return Boolean(storage.getItem(SCAN_CONFIRM_SESSION_KEYS.existingProjectId));
}

export function getScanConfirmProjectDraft(
  storage: ScanConfirmStorage,
): ScanConfirmProjectDraft | null {
  if (hasScanConfirmExistingProject(storage)) {
    return null;
  }

  const title = storage.getItem(SCAN_CONFIRM_SESSION_KEYS.projectName);
  const trimmedTitle = title?.trim();
  if (!trimmedTitle) {
    return null;
  }

  return {
    title: trimmedTitle,
    iconDataUrl: storage.getItem(SCAN_CONFIRM_SESSION_KEYS.projectIcon) || undefined,
  };
}

export function clearScanConfirmProjectIcon(storage: ScanConfirmStorage): void {
  storage.removeItem(SCAN_CONFIRM_SESSION_KEYS.projectIcon);
}
