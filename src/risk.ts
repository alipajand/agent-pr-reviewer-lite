import type {
  ChangedFile,
  ReviewReport,
  RiskFinding,
  RiskLevel,
} from "./types.js";
import { RISK_LEVEL_ORDER } from "./types.js";
import { applyRules, DEFAULT_RULES } from "./rules.js";
import type { Rule } from "./rules.js";

function computeOverallRisk(findings: RiskFinding[]): RiskLevel {
  if (findings.length === 0) return "low";

  let max = RISK_LEVEL_ORDER["low"];
  for (const f of findings) {
    const level = RISK_LEVEL_ORDER[f.severity];
    if (level > max) max = level;
  }

  const entry = Object.entries(RISK_LEVEL_ORDER).find(([, v]) => v === max);
  return (entry?.[0] ?? "low") as RiskLevel;
}

export function buildReport(
  base: string,
  head: string,
  files: ChangedFile[],
  rules: Rule[] = DEFAULT_RULES,
): ReviewReport {
  const findings = applyRules(files, rules);
  const overallRisk = computeOverallRisk(findings);

  return {
    base,
    head,
    overallRisk,
    totalFiles: files.length,
    findings,
  };
}

export function shouldFail(overallRisk: RiskLevel, failOn: RiskLevel): boolean {
  return RISK_LEVEL_ORDER[overallRisk] >= RISK_LEVEL_ORDER[failOn];
}
