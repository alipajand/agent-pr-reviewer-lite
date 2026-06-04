export type ChangeStatus = "added" | "modified" | "deleted" | "renamed";

export type ChangedFile = {
  path: string;
  previousPath?: string;
  status: ChangeStatus;
};

export type RiskLevel = "low" | "medium" | "high";

export type RiskFinding = {
  id: string;
  label: string;
  severity: RiskLevel;
  file: string;
  reason: string;
  requiredReview?: string;
};

export type ReviewReport = {
  base: string;
  head: string;
  overallRisk: RiskLevel;
  totalFiles: number;
  findings: RiskFinding[];
};

export type OutputFormat = "text" | "json";

export type CliOptions = {
  base: string;
  head: string;
  format: OutputFormat;
  failOn: RiskLevel;
};

export const RISK_LEVEL_ORDER: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
};
