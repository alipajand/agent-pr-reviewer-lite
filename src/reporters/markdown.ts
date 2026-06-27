import type {
  RenderOptions,
  ReviewReport,
  RiskFinding,
  RiskLevel,
} from "../types.js";

function capitalize(level: RiskLevel): string {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

function displayText(finding: RiskFinding): string {
  return finding.id === "dependency-added" ? finding.reason : finding.label;
}

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

export function renderMarkdown(
  report: ReviewReport,
  opts: RenderOptions,
): string {
  const unique = deduplicate(report.findings);
  const lines: string[] = [];

  lines.push(`## Agent PR Risk: ${capitalize(report.overallRisk)}`);

  if (unique.length === 0) {
    lines.push("No risky areas detected.");
  } else {
    lines.push("### Changed risky areas");
    lines.push("| Severity | File | Finding | Required review |");
    lines.push("|---|---|---|---|");

    for (const f of unique) {
      const severity = capitalize(f.severity);
      const filePath = `\`${f.file}\``;
      const finding = displayText(f);
      const review = f.requiredReview ?? "";
      lines.push(`| ${severity} | ${filePath} | ${finding} | ${review} |`);
    }

    const reviewLabels = requiredReviewLabels(unique);
    if (reviewLabels.length > 0) {
      lines.push("### Required human review");
      for (const label of reviewLabels) {
        lines.push(`- ${label}`);
      }
    }
  }

  lines.push("### CI result");
  lines.push(`- fail-on: ${opts.failOn}`);
  lines.push(`- result: ${opts.result}`);

  return lines.join("\n");
}
