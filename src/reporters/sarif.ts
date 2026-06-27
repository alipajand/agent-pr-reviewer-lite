import type { RenderOptions, ReviewReport, RiskLevel } from "../types.js";
import { displayText, explainText, uniqueFindings } from "./shared.js";

function sarifLevel(severity: RiskLevel): "error" | "warning" | "note" {
  if (severity === "high") return "error";
  if (severity === "medium") return "warning";
  return "note";
}

export function renderSarif(report: ReviewReport, opts: RenderOptions): string {
  const findings = uniqueFindings(report);
  const rules = Array.from(
    new Map(
      findings.map((finding) => [
        finding.id,
        {
          id: finding.id,
          name: finding.label,
          shortDescription: { text: finding.label },
          defaultConfiguration: { level: sarifLevel(finding.severity) },
          properties: { severity: finding.severity },
        },
      ]),
    ).values(),
  );

  const results = findings.map((finding) => {
    const explain = opts.explain ? explainText(finding) : null;
    return {
      ruleId: finding.id,
      level: sarifLevel(finding.severity),
      message: {
        text: explain ? `${finding.reason} (${explain})` : finding.reason,
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: {
              uri: finding.file,
            },
          },
        },
      ],
      properties: {
        label: finding.label,
        displayText: displayText(finding),
        severity: finding.severity,
        ...(finding.requiredReview !== undefined && {
          requiredReview: finding.requiredReview,
        }),
      },
    };
  });

  return JSON.stringify(
    {
      $schema: "https://json.schemastore.org/sarif-2.1.0.json",
      version: "2.1.0",
      runs: [
        {
          tool: {
            driver: {
              name: "agent-pr-reviewer-lite",
              rules,
            },
          },
          results,
          properties: {
            overallRisk: report.overallRisk,
            findingCount: findings.length,
            failOn: opts.failOn,
            result: opts.result,
          },
        },
      ],
    },
    null,
    2,
  );
}
