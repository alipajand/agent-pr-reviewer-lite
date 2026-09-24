import type { JsonReport, RenderOptions, ReviewReport } from "../types.js";
import { requiredReviewLabels, uniqueFindings } from "./shared.js";

export function renderJson(report: ReviewReport, opts: RenderOptions): string {
  const unique = uniqueFindings(report);

  const payload: JsonReport = {
    risk: report.overallRisk,
    findingCount: unique.length,
    findings: unique.map((f) => ({
      id: f.id,
      label: f.label,
      severity: f.severity,
      file: f.file,
      reason: f.reason,
      ...(f.requiredReview !== undefined && {
        requiredReview: f.requiredReview,
      }),
      ...(f.owners !== undefined &&
        f.owners.length > 0 && { owners: f.owners }),
    })),
    requiredHumanReview: requiredReviewLabels(unique),
    ci: {
      failOn: opts.failOn,
      result: opts.result,
    },
  };

  return JSON.stringify(payload, null, 2);
}
