import { buildHeuristicAssessment } from '../risk-scorer.js';
import type { RiskAssessmentProvider } from './types.js';

export class HeuristicProvider implements RiskAssessmentProvider {
  readonly name = 'heuristic';

  async assess(input: Parameters<RiskAssessmentProvider['assess']>[0]) {
    return buildHeuristicAssessment(input.detection);
  }
}
