export interface HomeSessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const HOME_SESSION_STORAGE_KEYS = {
  selectedProjectId: 'scanvocab_selected_project_id',
  generatingWordbook: 'scanvocab_generating_wordbook',
  legacyProjectId: 'scanvocab_project_id',
} as const;

export interface HomeGeneratingWordbookPayload {
  id?: string;
  title: string;
  iconDataUrl?: string;
  linkedJobId?: string;
}

export function getHomeSelectedProjectId(storage: HomeSessionStorage): string | null {
  return storage.getItem(HOME_SESSION_STORAGE_KEYS.selectedProjectId);
}

export function saveHomeSelectedProjectId(
  storage: HomeSessionStorage,
  projectId: string,
): void {
  storage.setItem(HOME_SESSION_STORAGE_KEYS.selectedProjectId, projectId);
}

export function consumeHomeGeneratingWordbook(
  storage: HomeSessionStorage,
): HomeGeneratingWordbookPayload | null {
  const raw = storage.getItem(HOME_SESSION_STORAGE_KEYS.generatingWordbook);
  if (!raw) {
    return null;
  }

  storage.removeItem(HOME_SESSION_STORAGE_KEYS.generatingWordbook);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isGeneratingWordbookPayload(parsed)) {
    return null;
  }

  return {
    id: getOptionalString(parsed.id),
    title: parsed.title,
    iconDataUrl: getOptionalString(parsed.iconDataUrl),
    linkedJobId: getOptionalString(parsed.linkedJobId),
  };
}

export function clearHomeGeneratingWordbook(storage: HomeSessionStorage): void {
  storage.removeItem(HOME_SESSION_STORAGE_KEYS.generatingWordbook);
}

export function clearLegacyHomeProjectId(storage: HomeSessionStorage): void {
  storage.removeItem(HOME_SESSION_STORAGE_KEYS.legacyProjectId);
}

function isGeneratingWordbookPayload(
  value: unknown,
): value is Record<string, unknown> & { title: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const title = (value as Record<string, unknown>).title;
  return typeof title === 'string' && title.length > 0;
}

function getOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
