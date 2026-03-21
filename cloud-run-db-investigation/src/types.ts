export type ChangeType = 'added' | 'modified' | 'removed' | 'renamed';

export interface ChangedFile {
  path: string;
  changeType?: ChangeType;
  additions?: number;
  deletions?: number;
  patch?: string;
}

export interface InvestigationRequest {
  repository: string;
  prNumber?: number;
  prUrl?: string;
  commitSha?: string;
  actor?: string;
  triggeredAt?: string;
  source?: 'github-webhook' | 'github-actions' | 'manual';
  changedFiles: ChangedFile[];
}

export interface DetectionMatch {
  path: string;
  rule: string;
  reason: string;
  weight: number;
}

export interface DbDetectionResult {
  isDbRelated: boolean;
  matches: DetectionMatch[];
  changedFileCount: number;
  dbChangedFileCount: number;
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface IoRiskAssessment {
  provider: string;
  summary: string;
  riskScore: number;
  riskLevel: RiskLevel;
  ioBudgetExhaustionRisk: number;
  factors: string[];
  recommendations: string[];
}

export interface NotionWriteResult {
  attempted: boolean;
  written: boolean;
  pageId?: string;
  skippedReason?: string;
}
