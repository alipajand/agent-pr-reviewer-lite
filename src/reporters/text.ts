import type { ReviewReport, RiskLevel } from "../types.js";

const SEVERITY_ICON: Record<RiskLevel, string> = {
  low: "[ LOW ]",
  medium: "[MEDIUM]",
  high: "[ HIGH ]",
};

const SEVERITY_PREFIX: Record<RiskLevel, string> = {
  low: "  ",
  medium: "! ",
  high: "!!",
};

function separator(char = "-", width = 60): string {
  return char.repeat(width);
}

export function renderText(report: ReviewReport): string {
  const lines: string[] = [];

  lines.push(separator("="));
  lines.push("  agent-pr-reviewer-lite  |  PR Risk Report");
  lines.push(separator("="));
  lines.push(`  Base  : ${report.base}`);
  lines.push(`  Head  : ${report.head}`);
  lines.push(`  Files : ${report.totalFiles}`);
  lines.push(`  Risk  : ${report.overallRisk.toUpperCase()}`);
  lines.push(separator("="));

  if (report.findings.length === 0) {
    lines.push("  No risk findings detected.");
    lines.push(separator("="));
    return lines.join("\n");
  }

  lines.push(`  Findings (${report.findings.length}):`);
  lines.push(separator("-"));

  for (const finding of report.findings) {
    const icon = SEVERITY_ICON[finding.severity];
    const prefix = SEVERITY_PREFIX[finding.severity];
    lines.push(`${prefix}${icon}  ${finding.label}`);
    lines.push(`        File   : ${finding.file}`);
    lines.push(`        Reason : ${finding.reason}`);
    if (finding.requiredReview) {
      lines.push(`        Review : ${finding.requiredReview}`);
    }
    lines.push("");
  }

  lines.push(separator("="));
  lines.push(`  Overall Risk: ${report.overallRisk.toUpperCase()}`);
  lines.push(separator("="));

  return lines.join("\n");
}
