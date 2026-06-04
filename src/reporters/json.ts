import type { ReviewReport } from "../types.js";

export function renderJson(report: ReviewReport): string {
  return JSON.stringify(report, null, 2);
}
