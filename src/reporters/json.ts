import type { JsonReport, RenderOptions, ReviewReport, RiskFinding } from "../types.js";

function deduplicate(findings: RiskFinding[]): RiskFinding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.id}\0${f.file}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function requiredReviewLabels(findings: RiskFinding[]): string[] {
  const labels = new Set<string>();
  for (const f of findings) {
    if (f.requiredReview) labels.add(f.requiredReview);
  }
  return [...labels].sort();
}

export function renderJson(report: ReviewReport, opts: RenderOptions): string {
  const unique = deduplicate(report.findings);

  const payload: JsonReport = {
    risk: report.overallRisk,
    findingCount: unique.length,
    findings: unique.map((f) => ({
      id: f.id,
      label: f.label,
      severity: f.severity,
      file: f.file,
      reason: f.reason,
      ...(f.requiredReview !== undefined && { requiredReview: f.requiredReview }),
    })),
    requiredHumanReview: requiredReviewLabels(unique),
    ci: {
      failOn: opts.failOn,
      result: opts.result,
    },
  };

  return JSON.stringify(payload, null, 2);
}
