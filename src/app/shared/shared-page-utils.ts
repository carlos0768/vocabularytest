import type { SharedProjectCard, SharedProjectMetricsMap } from '@/lib/shared-projects/types';

export function mergeUniqueProjectCards(
  existing: SharedProjectCard[],
  incoming: SharedProjectCard[],
): SharedProjectCard[] {
  if (incoming.length === 0) return existing;

  const merged = [...existing];
  const seen = new Set(existing.map((item) => item.project.id));

  for (const item of incoming) {
    if (seen.has(item.project.id)) continue;
    seen.add(item.project.id);
    merged.push(item);
  }

  return merged;
}

export function mergeMetricsIntoCards(
  cards: SharedProjectCard[],
  metrics: SharedProjectMetricsMap,
): SharedProjectCard[] {
  let changed = false;

  const nextCards = cards.map((card) => {
    const metric = metrics[card.project.id];
    if (!metric) {
      return card;
    }

    if (
      card.wordCount === metric.wordCount
      && card.collaboratorCount === metric.collaboratorCount
      && card.likeCount === metric.likeCount
    ) {
      return card;
    }

    changed = true;
    return {
      ...card,
      wordCount: metric.wordCount,
      collaboratorCount: metric.collaboratorCount,
      likeCount: metric.likeCount,
    };
  });

  return changed ? nextCards : cards;
}

export function collectMetricProjectIds(
  ...groups: SharedProjectCard[][]
): string[] {
  const projectIds = new Set<string>();

  for (const group of groups) {
    for (const card of group) {
      if (card.wordCount !== undefined && card.collaboratorCount !== undefined) {
        continue;
      }

      projectIds.add(card.project.id);
    }
  }

  return Array.from(projectIds);
}
