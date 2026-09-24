import type { RenderOptions, ReviewReport } from "../types.js";
import {
  capitalize,
  escapeMarkdownCell,
  explainText,
  markdownCodeCell,
  markdownFindingText,
  requiredReviewLabels,
  reviewOwners,
  shouldExplain,
  uniqueFindings,
} from "./shared.js";

export function renderMarkdown(
  report: ReviewReport,
  opts: RenderOptions,
): string {
  const unique = uniqueFindings(report);
  const lines: string[] = [];

  lines.push(`## Agent PR Risk: ${capitalize(report.overallRisk)}`);

  if (unique.length === 0) {
    lines.push("No risky areas detected.");
  } else {
    lines.push("### Changed risky areas");
    if (shouldExplain(opts)) {
      lines.push("| Severity | File | Finding | Required review | Explain |");
      lines.push("|---|---|---|---|---|");
    } else {
      lines.push("| Severity | File | Finding | Required review |");
      lines.push("|---|---|---|---|");
    }

    for (const f of unique) {
      const severity = capitalize(f.severity);
      const filePath = markdownCodeCell(f.file);
      const finding = markdownFindingText(f);
      const review = escapeMarkdownCell(f.requiredReview ?? "");
      if (shouldExplain(opts)) {
        const explain = escapeMarkdownCell(explainText(f) ?? "");
        lines.push(
          `| ${severity} | ${filePath} | ${finding} | ${review} | ${explain} |`,
        );
      } else {
        lines.push(`| ${severity} | ${filePath} | ${finding} | ${review} |`);
      }
    }

    const reviewLabels = requiredReviewLabels(unique);
    if (reviewLabels.length > 0) {
      lines.push("### Required human review");
      const owners = reviewOwners(unique);
      for (const label of reviewLabels) {
        const who = owners.get(label);
        lines.push(
          who
            ? `- ${escapeMarkdownCell(label)} — ${who.map(markdownCodeCell).join(", ")}`
            : `- ${escapeMarkdownCell(label)}`,
        );
      }
    }
  }

  lines.push("### CI result");
  lines.push(`- fail-on: ${opts.failOn}`);
  lines.push(`- result: ${opts.result}`);

  return lines.join("\n");
}
