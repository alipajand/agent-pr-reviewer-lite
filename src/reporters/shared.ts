import type {
  RenderOptions,
  ReviewReport,
  RiskFinding,
  RiskLevel,
} from "../types.js";

export function capitalize(level: RiskLevel): string {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

export function displayText(finding: RiskFinding): string {
  return finding.id === "dependency-added" ? finding.reason : finding.label;
}

export function deduplicate(findings: RiskFinding[]): RiskFinding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.id}\0${f.file}\0${f.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function requiredReviewLabels(findings: RiskFinding[]): string[] {
  const labels = new Set<string>();
  for (const f of findings) {
    if (f.requiredReview) labels.add(f.requiredReview);
  }
  return [...labels].sort();
}

export function explainText(finding: RiskFinding): string | null {
  return finding.explain ?? null;
}

export function uniqueFindings(report: ReviewReport): RiskFinding[] {
  return deduplicate(report.findings);
}

export function shouldExplain(opts: RenderOptions): boolean {
  return opts.explain === true;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
