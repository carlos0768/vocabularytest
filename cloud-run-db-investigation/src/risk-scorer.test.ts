import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHeuristicAssessment } from './risk-scorer.js';

test('buildHeuristicAssessment returns high risk for many weighted matches', () => {
  const assessment = buildHeuristicAssessment({
    isDbRelated: true,
    changedFileCount: 5,
    dbChangedFileCount: 3,
    matches: [
      { path: 'supabase/migrations/a.sql', rule: 'supabase-migrations', reason: 'x', weight: 35 },
      { path: 'supabase/migrations/a.sql', rule: 'ddl-statement', reason: 'x', weight: 35 },
      { path: 'src/lib/db/query.ts', rule: 'query-shape-risk', reason: 'x', weight: 20 },
    ],
  });

  assert.equal(assessment.provider, 'heuristic');
  assert.ok(assessment.riskScore >= 65);
  assert.ok(['high', 'critical'].includes(assessment.riskLevel));
});
