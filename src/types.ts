export type ChangeStatus = "added" | "modified" | "deleted" | "renamed";

export type ChangedFile = {
  path: string;
  previousPath?: string;
  status: ChangeStatus;
  /** Added lines from the diff (lines starting with +, stripped of the leading +). */
  addedLines?: string[];
};

export type RiskLevel = "low" | "medium" | "high";

export type RiskFinding = {
  id: string;
  label: string;
  severity: RiskLevel;
  file: string;
  reason: string;
  explain?: string;
  requiredReview?: string;
};

export type ReviewReport = {
  base: string;
  head: string;
  overallRisk: RiskLevel;
  totalFiles: number;
  findings: RiskFinding[];
};

export type PresetName = "nextjs-saas" | "supabase" | "stripe";

export type OutputFormat = "text" | "json" | "markdown" | "sarif" | "junit";

export type CliOptions = {
  base: string;
  head: string;
  format: OutputFormat;
  failOn: RiskLevel;
  changedFiles?: string;
  explain?: boolean;
  presets?: PresetName[];
};

/** Options passed to every reporter so they can render the CI block. */
export type RenderOptions = {
  failOn: RiskLevel;
  result: "passed" | "failed";
  explain?: boolean;
};

/** A single entry in the extraRiskPaths config array. */
export type ExtraRiskPath = {
  id: string;
  label: string;
  severity: RiskLevel;
  patterns: string[];
  requiredReview?: string;
};

/** Shape of agent-pr-reviewer-lite.config.json. All fields are optional. */
export type Config = {
  base?: string;
  failOn?: RiskLevel;
  ignore?: string[];
  presets?: PresetName[];
  extraRiskPaths?: ExtraRiskPath[];
};

/** Exact JSON output shape exposed to callers / CI systems. */
export type JsonReport = {
  risk: RiskLevel;
  findingCount: number;
  findings: Array<{
    id: string;
    label: string;
    severity: RiskLevel;
    file: string;
    reason: string;
    requiredReview?: string;
  }>;
  requiredHumanReview: string[];
  ci: {
    failOn: RiskLevel;
    result: "passed" | "failed";
  };
};

export const RISK_LEVEL_ORDER: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
};
