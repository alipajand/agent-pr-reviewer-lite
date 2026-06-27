import { RISK_LEVEL_ORDER } from "../types.js";
import type { RenderOptions, ReviewReport } from "../types.js";
import { escapeXml, explainText, uniqueFindings } from "./shared.js";

function shouldFailFinding(
  severity: ReviewReport["overallRisk"],
  failOn: RenderOptions["failOn"],
): boolean {
  return RISK_LEVEL_ORDER[severity] >= RISK_LEVEL_ORDER[failOn];
}

export function renderJunit(report: ReviewReport, opts: RenderOptions): string {
  const findings = uniqueFindings(report);
  const failures = findings.filter((finding) =>
    shouldFailFinding(finding.severity, opts.failOn),
  ).length;

  const testcases = findings.map((finding) => {
    const explain = opts.explain ? explainText(finding) : null;
    const body = shouldFailFinding(finding.severity, opts.failOn)
      ? `\n    <failure message="${escapeXml(finding.reason)}">${escapeXml(
          [finding.file, finding.label, explain].filter(Boolean).join("\n"),
        )}</failure>\n  `
      : "";

    return (
      `  <testcase classname="agent-pr-reviewer-lite.${escapeXml(
        finding.severity,
      )}" ` +
      `name="${escapeXml(`${finding.id} :: ${finding.file}`)}" ` +
      `file="${escapeXml(finding.file)}">` +
      body +
      `</testcase>`
    );
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="agent-pr-reviewer-lite" tests="${findings.length}" failures="${failures}">`,
    `  <properties>`,
    `    <property name="overallRisk" value="${escapeXml(report.overallRisk)}" />`,
    `    <property name="failOn" value="${escapeXml(opts.failOn)}" />`,
    `    <property name="result" value="${escapeXml(opts.result)}" />`,
    `  </properties>`,
    ...testcases,
    `</testsuite>`,
  ].join("\n");
}
