const VISITED_PROJECT_IDS_KEY = 'merken_visited_project_ids';

function readVisitedProjectIds(): Set<string> {
  if (typeof sessionStorage === 'undefined') return new Set();
  try {
    const raw = sessionStorage.getItem(VISITED_PROJECT_IDS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is string => typeof value === 'string' && value.length > 0));
  } catch {
    return new Set();
  }
}

function writeVisitedProjectIds(ids: Set<string>) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(VISITED_PROJECT_IDS_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore
  }
}

export function markProjectVisited(projectId: string) {
  if (!projectId) return;
  const ids = readVisitedProjectIds();
  ids.add(projectId);
  writeVisitedProjectIds(ids);
}

export function hasVisitedProject(projectId: string): boolean {
  if (!projectId) return false;
  return readVisitedProjectIds().has(projectId);
}

export function isRunningAsStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    nav.standalone === true
  );
}
