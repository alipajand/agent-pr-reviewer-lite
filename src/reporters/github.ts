import type { RenderOptions, ReviewReport, RiskLevel } from "../types.js";
import { capitalize, toSafeText, uniqueFindings } from "./shared.js";

const COMMAND: Record<RiskLevel, "error" | "warning" | "notice"> = {
  high: "error",
  medium: "warning",
  low: "notice",
};

// Workflow command encoding: data escapes %, CR, and LF; property values also
// escape ':' and ','. Text is sanitized first so a crafted file name cannot
// end the annotation and start a new command.
function escapeData(value: string): string {
  return toSafeText(value)
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
}

function escapeProperty(value: string): string {
  return escapeData(value).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

/**
 * GitHub Actions workflow annotations: one per finding, attached to the
 * changed file so it shows on the pull request, plus a summary line.
 */
export function renderGithub(
  report: ReviewReport,
  opts: RenderOptions,
): string {
  const findings = uniqueFindings(report);
  const lines = findings.map(
    (f) =>
      `::${COMMAND[f.severity]} file=${escapeProperty(f.file)},title=${escapeProperty(
        `PR risk: ${f.label}`,
      )}::${escapeData(f.requiredReview ? `${f.reason} (review: ${f.requiredReview})` : f.reason)}`,
  );
  lines.push(
    `Agent PR Risk: ${capitalize(report.overallRisk)} — ${findings.length} finding${
      findings.length === 1 ? "" : "s"
    }, fail-on ${opts.failOn}, ${opts.result}`,
  );
  return lines.join("\n");
}
