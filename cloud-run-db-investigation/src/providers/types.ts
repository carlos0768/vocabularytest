import type { DbDetectionResult, InvestigationRequest, IoRiskAssessment } from '../types.js';

export interface RiskAssessmentProvider {
  name: string;
  assess(input: {
    request: InvestigationRequest;
    detection: DbDetectionResult;
  }): Promise<IoRiskAssessment>;
}
