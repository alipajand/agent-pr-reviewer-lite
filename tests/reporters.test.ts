import { describe, it, expect } from "vitest";
import { renderText } from "../src/reporters/text.js";
import { renderJson } from "../src/reporters/json.js";
import { renderSarif } from "../src/reporters/sarif.js";
import { renderJunit } from "../src/reporters/junit.js";
import type { RenderOptions, ReviewReport, RiskFinding } from "../src/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const highFinding: RiskFinding = {
  id: "auth-file-touched",
  label: "Auth / session file touched",
  severity: "high",
  file: "src/auth/session.ts",
  reason: "File 'src/auth/session.ts' touches authentication or session logic",
  requiredReview: "auth/session",
};

const migrationFinding: RiskFinding = {
  id: "migration-changed",
  label: "Database migration changed",
  severity: "high",
  file: "supabase/migrations/20260604_add_org_policy.sql",
  reason:
    "Migration file 'supabase/migrations/20260604_add_org_policy.sql' was added",
  requiredReview: "database migration",
};

const depFinding: RiskFinding = {
  id: "dependency-added",
  label: "New dependency added",
  severity: "medium",
  file: "package.json",
  reason: "Added dependency: zod",
  requiredReview: "dependency changes",
};

const mediumFinding: RiskFinding = {
  id: "package-lock-changed",
  label: "Lockfile changed",
  severity: "medium",
  file: "pnpm-lock.yaml",
  reason:
    "Lockfile 'pnpm-lock.yaml' was modified — verify dependency resolution is correct",
  requiredReview: "lockfile/dependency resolution",
};

function makeReport(
  findings: RiskFinding[],
  overallRisk: ReviewReport["overallRisk"] = "high",
): ReviewReport {
  return {
    base: "main",
    head: "HEAD",
    overallRisk,
    totalFiles: findings.length,
    findings,
  };
}

const failedOpts: RenderOptions = { failOn: "high", result: "failed" };
const passedOpts: RenderOptions = { failOn: "high", result: "passed" };
const mediumOpts: RenderOptions = { failOn: "medium", result: "failed" };

// ---------------------------------------------------------------------------
// Text reporter
// ---------------------------------------------------------------------------

describe("renderText", () => {
  it("opens with capitalized risk title", () => {
    const out = renderText(makeReport([highFinding], "high"), failedOpts);
    expect(out).toMatch(/^Agent PR Risk: High/);
  });

  it("capitalizes Medium correctly", () => {
    const out = renderText(makeReport([mediumFinding], "medium"), mediumOpts);
    expect(out).toMatch(/^Agent PR Risk: Medium/);
  });

  it("capitalizes Low correctly", () => {
    const out = renderText(makeReport([], "low"), passedOpts);
    expect(out).toMatch(/^Agent PR Risk: Low/);
  });

  it("shows 'No risky areas detected.' when there are no findings", () => {
    const out = renderText(makeReport([], "low"), passedOpts);
    expect(out).toContain("No risky areas detected.");
    expect(out).not.toContain("Changed risky areas:");
  });

  it("shows 'Changed risky areas:' section when findings exist", () => {
    const out = renderText(makeReport([highFinding]), failedOpts);
    expect(out).toContain("Changed risky areas:");
  });

  it("lists each finding as '- <file> — <label>'", () => {
    const out = renderText(makeReport([highFinding]), failedOpts);
    expect(out).toContain(
      "- src/auth/session.ts — Auth / session file touched",
    );
  });

  it("uses reason (not label) for dependency-added findings", () => {
    const out = renderText(makeReport([depFinding], "medium"), mediumOpts);
    expect(out).toContain("- package.json — Added dependency: zod");
    expect(out).not.toContain("New dependency added");
  });

  it("preserves original file order across findings", () => {
    const report = makeReport([highFinding, migrationFinding, depFinding]);
    const out = renderText(report, failedOpts);
    const authIdx = out.indexOf("src/auth/session.ts");
    const migIdx = out.indexOf("supabase/migrations/");
    const depIdx = out.indexOf("package.json");
    expect(authIdx).toBeLessThan(migIdx);
    expect(migIdx).toBeLessThan(depIdx);
  });

  it("shows 'Required human review:' section with unique sorted labels", () => {
    const report = makeReport([highFinding, migrationFinding, depFinding]);
    const out = renderText(report, failedOpts);
    expect(out).toContain("Required human review:");
    const lines = out.split("\n");
    const reviewIdx = lines.findIndex((l) => l === "Required human review:");
    const ciIdx = lines.findIndex((l) => l === "CI result:");
    const reviewLines = lines
      .slice(reviewIdx + 1, ciIdx)
      .filter((l) => l.startsWith("- "))
      .map((l) => l.slice(2));
    expect(reviewLines).toEqual(
      ["auth/session", "database migration", "dependency changes"].sort(),
    );
  });

  it("deduplicates findings with the same rule/file pair", () => {
    const dup = { ...highFinding };
    const report = makeReport([highFinding, dup]);
    const out = renderText(report, failedOpts);
    const count = (out.match(/src\/auth\/session\.ts/g) ?? []).length;
    expect(count).toBe(1);
  });

  it("does not show 'Required human review:' when no findings", () => {
    const out = renderText(makeReport([], "low"), passedOpts);
    expect(out).not.toContain("Required human review:");
  });

  it("omits 'Required human review:' when findings exist but none require review", () => {
    const noReview: RiskFinding = { ...highFinding, requiredReview: undefined };
    const out = renderText(makeReport([noReview], "high"), failedOpts);
    expect(out).toContain("Changed risky areas:");
    expect(out).toContain(
      "- src/auth/session.ts — Auth / session file touched",
    );
    expect(out).not.toContain("Required human review:");
  });

  it("shows CI block with fail-on and result", () => {
    const out = renderText(makeReport([highFinding]), failedOpts);
    expect(out).toContain("CI result:");
    expect(out).toContain("- fail-on: high");
    expect(out).toContain("- result: failed");
  });

  it("shows result: passed when risk is below threshold", () => {
    const out = renderText(makeReport([], "low"), passedOpts);
    expect(out).toContain("- result: passed");
  });

  it("shows result: failed with medium fail-on threshold", () => {
    const out = renderText(makeReport([mediumFinding], "medium"), mediumOpts);
    expect(out).toContain("- fail-on: medium");
    expect(out).toContain("- result: failed");
  });

  it("matches exact no-findings output shape", () => {
    const out = renderText(makeReport([], "low"), passedOpts);
    expect(out).toBe(
      [
        "Agent PR Risk: Low",
        "No risky areas detected.",
        "CI result:",
        "- fail-on: high",
        "- result: passed",
      ].join("\n"),
    );
  });

  it("matches exact findings output shape for one finding", () => {
    const report = makeReport([highFinding], "high");
    const out = renderText(report, failedOpts);
    expect(out).toBe(
      [
        "Agent PR Risk: High",
        "Changed risky areas:",
        "- src/auth/session.ts — Auth / session file touched",
        "Required human review:",
        "- auth/session",
        "CI result:",
        "- fail-on: high",
        "- result: failed",
      ].join("\n"),
    );
  });

  it("includes deterministic explanation lines when explain mode is enabled", () => {
    const out = renderText(
      makeReport([
        { ...highFinding, explain: "Matched built-in path pattern /auth/" },
      ]),
      { ...failedOpts, explain: true },
    );
    expect(out).toContain("explain: Matched built-in path pattern /auth/");
  });
});

// ---------------------------------------------------------------------------
// JSON reporter
// ---------------------------------------------------------------------------

describe("renderJson", () => {
  it("produces valid JSON", () => {
    const out = renderJson(makeReport([highFinding]), failedOpts);
    expect(() => JSON.parse(out)).not.toThrow();
  });

  it("top-level risk matches overallRisk", () => {
    const parsed = JSON.parse(
      renderJson(makeReport([highFinding], "high"), failedOpts),
    );
    expect(parsed.risk).toBe("high");
  });

  it("findingCount reflects deduplicated count", () => {
    const dup = { ...highFinding };
    const parsed = JSON.parse(
      renderJson(makeReport([highFinding, dup], "high"), failedOpts),
    );
    expect(parsed.findingCount).toBe(1);
  });

  it("findings array contains correct shape", () => {
    const parsed = JSON.parse(
      renderJson(makeReport([highFinding]), failedOpts),
    );
    const f = parsed.findings[0];
    expect(f).toHaveProperty("id", "auth-file-touched");
    expect(f).toHaveProperty("label", "Auth / session file touched");
    expect(f).toHaveProperty("severity", "high");
    expect(f).toHaveProperty("file", "src/auth/session.ts");
    expect(f).toHaveProperty("reason");
    expect(f).toHaveProperty("requiredReview", "auth/session");
  });

  it("omits requiredReview key when undefined", () => {
    const noReview: RiskFinding = { ...highFinding, requiredReview: undefined };
    const parsed = JSON.parse(
      renderJson(makeReport([noReview], "high"), failedOpts),
    );
    expect(parsed.findings[0]).not.toHaveProperty("requiredReview");
  });

  it("requiredHumanReview is unique and sorted", () => {
    const report = makeReport([highFinding, migrationFinding, depFinding]);
    const parsed = JSON.parse(renderJson(report, failedOpts));
    const labels: string[] = parsed.requiredHumanReview;
    expect(labels).toEqual([...labels].sort());
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("ci.failOn and ci.result are correct when failed", () => {
    const parsed = JSON.parse(
      renderJson(makeReport([highFinding]), failedOpts),
    );
    expect(parsed.ci.failOn).toBe("high");
    expect(parsed.ci.result).toBe("failed");
  });

  it("ci.result is 'passed' when risk is below threshold", () => {
    const parsed = JSON.parse(renderJson(makeReport([], "low"), passedOpts));
    expect(parsed.ci.result).toBe("passed");
  });

  it("produces empty findings and zero findingCount for no-risk report", () => {
    const parsed = JSON.parse(renderJson(makeReport([], "low"), passedOpts));
    expect(parsed.findingCount).toBe(0);
    expect(parsed.findings).toHaveLength(0);
    expect(parsed.requiredHumanReview).toHaveLength(0);
  });

  it("matches exact JsonReport schema shape", () => {
    const parsed = JSON.parse(
      renderJson(makeReport([highFinding]), failedOpts),
    );
    const keys = Object.keys(parsed);
    expect(keys).toEqual(
      expect.arrayContaining([
        "risk",
        "findingCount",
        "findings",
        "requiredHumanReview",
        "ci",
      ]),
    );
    expect(Object.keys(parsed.ci)).toEqual(
      expect.arrayContaining(["failOn", "result"]),
    );
  });

  it("preserves original file order in findings array", () => {
    const report = makeReport([highFinding, migrationFinding, depFinding]);
    const parsed = JSON.parse(renderJson(report, failedOpts));
    expect(parsed.findings[0].file).toBe("src/auth/session.ts");
    expect(parsed.findings[1].file).toBe(
      "supabase/migrations/20260604_add_org_policy.sql",
    );
    expect(parsed.findings[2].file).toBe("package.json");
  });
});

describe("renderSarif", () => {
  it("produces valid SARIF 2.1.0 JSON", () => {
    const parsed = JSON.parse(
      renderSarif(makeReport([highFinding]), failedOpts),
    );
    expect(parsed.version).toBe("2.1.0");
    expect(parsed.runs[0].tool.driver.name).toBe("agent-pr-reviewer-lite");
    expect(parsed.runs[0].results[0].ruleId).toBe("auth-file-touched");
  });

  it("includes explanation text in the SARIF message when enabled", () => {
    const parsed = JSON.parse(
      renderSarif(
        makeReport([
          { ...highFinding, explain: "Matched built-in path pattern /auth/" },
        ]),
        { ...failedOpts, explain: true },
      ),
    );
    expect(parsed.runs[0].results[0].message.text).toContain(
      "Matched built-in path pattern /auth/",
    );
  });
});

describe("renderJunit", () => {
  it("produces JUnit XML with one testcase per finding", () => {
    const out = renderJunit(
      makeReport([highFinding, mediumFinding], "high"),
      failedOpts,
    );
    expect(out).toContain('<testsuite name="agent-pr-reviewer-lite" tests="2"');
    expect((out.match(/<testcase /g) ?? []).length).toBe(2);
  });

  it("marks only findings at or above the fail-on threshold as failures", () => {
    const out = renderJunit(makeReport([highFinding, mediumFinding], "high"), {
      failOn: "high",
      result: "failed",
    });
    expect((out.match(/<failure /g) ?? []).length).toBe(1);
  });
});
