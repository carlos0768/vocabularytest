const VISITED_PROJECT_IDS_KEY = 'merken_visited_project_ids';
const RECENT_PROJECT_VISITS_KEY = 'merken_recent_project_visits';
const MAX_RECENT_PROJECTS = 20;

type RecentProjectVisit = {
  projectId: string;
  visitedAt: number;
};

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
  upsertRecentProjectVisit(projectId);
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

function readRecentProjectVisits(): RecentProjectVisit[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_PROJECT_VISITS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is RecentProjectVisit =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as { projectId?: unknown }).projectId === 'string' &&
          typeof (item as { visitedAt?: unknown }).visitedAt === 'number',
      )
      .sort((a, b) => b.visitedAt - a.visitedAt);
  } catch {
    return [];
  }
}

function writeRecentProjectVisits(visits: RecentProjectVisit[]) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(RECENT_PROJECT_VISITS_KEY, JSON.stringify(visits.slice(0, MAX_RECENT_PROJECTS)));
  } catch {
    // ignore
  }
}

function upsertRecentProjectVisit(projectId: string, visitedAt: number = Date.now()) {
  const visits = readRecentProjectVisits();
  const next = [{ projectId, visitedAt }, ...visits.filter((item) => item.projectId !== projectId)];
  writeRecentProjectVisits(next);
}

export function getRecentVisitedProjectIds(limit: number = 5, maxAgeDays: number = 14): string[] {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  return readRecentProjectVisits()
    .filter((item) => item.visitedAt >= cutoff)
    .slice(0, limit)
    .map((item) => item.projectId);
}
