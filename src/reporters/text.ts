import type {
  RenderOptions,
  ReviewReport,
  RiskFinding,
  RiskLevel,
} from "../types.js";

function capitalize(level: RiskLevel): string {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

/**
 * Short display text for a finding line.
 * For `dependency-added` the reason already carries the package name;
 * for every other rule the label is concise and avoids repeating the path.
 */
function displayText(finding: RiskFinding): string {
  return finding.id === "dependency-added" ? finding.reason : finding.label;
}

/**
 * Deduplicate findings by (id, file) pair, preserving original order.
 */
function deduplicate(findings: RiskFinding[]): RiskFinding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.id}\0${f.file}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Collect unique required-review labels, sorted alphabetically.
 */
function requiredReviewLabels(findings: RiskFinding[]): string[] {
  const labels = new Set<string>();
  for (const f of findings) {
    if (f.requiredReview) labels.add(f.requiredReview);
  }
  return [...labels].sort();
}

export function renderText(report: ReviewReport, opts: RenderOptions): string {
  const unique = deduplicate(report.findings);
  const lines: string[] = [];

  lines.push(`Agent PR Risk: ${capitalize(report.overallRisk)}`);

  if (unique.length === 0) {
    lines.push("No risky areas detected.");
  } else {
    lines.push("Changed risky areas:");
    for (const f of unique) {
      lines.push(`- ${f.file} — ${displayText(f)}`);
    }

    const reviewLabels = requiredReviewLabels(unique);
    if (reviewLabels.length > 0) {
      lines.push("Required human review:");
      for (const label of reviewLabels) {
        lines.push(`- ${label}`);
      }
    }
  }

  lines.push("CI result:");
  lines.push(`- fail-on: ${opts.failOn}`);
  lines.push(`- result: ${opts.result}`);

  return lines.join("\n");
}
