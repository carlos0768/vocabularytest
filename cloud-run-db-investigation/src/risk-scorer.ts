import type { DbDetectionResult, IoRiskAssessment, RiskLevel } from './types.js';

function toRiskLevel(score: number): RiskLevel {
  if (score >= 85) return 'critical';
  if (score >= 65) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

export function buildHeuristicAssessment(result: DbDetectionResult): IoRiskAssessment {
  const baseScore = Math.min(100, result.matches.reduce((sum, cur) => sum + cur.weight, 0));
  const fileSpreadBonus = Math.min(20, result.dbChangedFileCount * 3);
  const score = Math.min(100, baseScore + fileSpreadBonus);
  const riskLevel = toRiskLevel(score);

  const factors = [
    `DB-matched files: ${result.dbChangedFileCount}/${result.changedFileCount}`,
    `Rule matches: ${result.matches.length}`,
  ];

  const topMatches = [...result.matches]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5)
    .map((m) => `${m.rule}: ${m.path}`);

  factors.push(...topMatches);

  const recommendations = [
    'Confirm index coverage for newly added predicates and sort keys.',
    'Estimate row-scan delta with EXPLAIN (ANALYZE, BUFFERS) in staging.',
    'Set temporary budget/alert thresholds before production rollout.',
  ];

  const ioBudgetExhaustionRisk = Math.min(100, Math.round(score * 0.9 + result.dbChangedFileCount * 2));

  return {
    provider: 'heuristic',
    summary: 'Heuristic DB IO-risk estimate based on change-path and patch signatures.',
    riskScore: score,
    riskLevel,
    ioBudgetExhaustionRisk,
    factors,
    recommendations,
  };
}
