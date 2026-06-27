import type { RenderOptions, ReviewReport } from "../types.js";
import {
  capitalize,
  displayText,
  explainText,
  requiredReviewLabels,
  shouldExplain,
  uniqueFindings,
} from "./shared.js";

export function renderText(report: ReviewReport, opts: RenderOptions): string {
  const unique = uniqueFindings(report);
  const lines: string[] = [];

  lines.push(`Agent PR Risk: ${capitalize(report.overallRisk)}`);

  if (unique.length === 0) {
    lines.push("No risky areas detected.");
  } else {
    lines.push("Changed risky areas:");
    for (const f of unique) {
      lines.push(`- ${f.file} — ${displayText(f)}`);
      if (shouldExplain(opts)) {
        const explain = explainText(f);
        if (explain) lines.push(`  explain: ${explain}`);
      }
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
