import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../src/reporters/markdown.js";
import type { RenderOptions, ReviewReport, RiskFinding } from "../src/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const authFinding: RiskFinding = {
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
  file: "supabase/migrations/20260604_add.sql",
  reason: "Migration file was added",
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
  reason: "Lockfile changed",
  requiredReview: "lockfile/dependency resolution",
};

function makeReport(
  findings: RiskFinding[],
  overallRisk: ReviewReport["overallRisk"] = "high"
): ReviewReport {
  return { base: "main", head: "HEAD", overallRisk, totalFiles: findings.length, findings };
}

const failedOpts: RenderOptions = { failOn: "high", result: "failed" };
const passedOpts: RenderOptions = { failOn: "high", result: "passed" };
const mediumOpts: RenderOptions = { failOn: "medium", result: "failed" };

// ---------------------------------------------------------------------------
// Heading and risk level
// ---------------------------------------------------------------------------

describe("renderMarkdown — heading", () => {
  it("opens with ## Agent PR Risk: High", () => {
    const out = renderMarkdown(makeReport([authFinding], "high"), failedOpts);
    expect(out).toMatch(/^## Agent PR Risk: High/);
  });

  it("capitalizes Medium", () => {
    const out = renderMarkdown(makeReport([mediumFinding], "medium"), mediumOpts);
    expect(out).toMatch(/^## Agent PR Risk: Medium/);
  });

  it("capitalizes Low", () => {
    const out = renderMarkdown(makeReport([], "low"), passedOpts);
    expect(out).toMatch(/^## Agent PR Risk: Low/);
  });
});

// ---------------------------------------------------------------------------
// No-findings path
// ---------------------------------------------------------------------------

describe("renderMarkdown — no findings", () => {
  it("emits 'No risky areas detected.'", () => {
    const out = renderMarkdown(makeReport([], "low"), passedOpts);
    expect(out).toContain("No risky areas detected.");
  });

  it("does not emit the table header when there are no findings", () => {
    const out = renderMarkdown(makeReport([], "low"), passedOpts);
    expect(out).not.toContain("| Severity |");
  });

  it("does not emit '### Changed risky areas' when there are no findings", () => {
    const out = renderMarkdown(makeReport([], "low"), passedOpts);
    expect(out).not.toContain("### Changed risky areas");
  });

  it("matches exact no-findings output", () => {
    const out = renderMarkdown(makeReport([], "low"), passedOpts);
    expect(out).toBe(
      [
        "## Agent PR Risk: Low",
        "No risky areas detected.",
        "### CI result",
        "- fail-on: high",
        "- result: passed",
      ].join("\n")
    );
  });
});

// ---------------------------------------------------------------------------
// Table structure
// ---------------------------------------------------------------------------

describe("renderMarkdown — findings table", () => {
  it("emits '### Changed risky areas' section heading", () => {
    const out = renderMarkdown(makeReport([authFinding]), failedOpts);
    expect(out).toContain("### Changed risky areas");
  });

  it("emits the correct column headers", () => {
    const out = renderMarkdown(makeReport([authFinding]), failedOpts);
    expect(out).toContain("| Severity | File | Finding | Required review |");
  });

  it("emits the separator row", () => {
    const out = renderMarkdown(makeReport([authFinding]), failedOpts);
    expect(out).toContain("|---|---|---|---|");
  });

  it("file path is wrapped in backticks", () => {
    const out = renderMarkdown(makeReport([authFinding]), failedOpts);
    expect(out).toContain("`src/auth/session.ts`");
  });

  it("severity is capitalized in the table", () => {
    const out = renderMarkdown(makeReport([authFinding]), failedOpts);
    expect(out).toContain("| High |");
  });

  it("medium severity is capitalized", () => {
    const out = renderMarkdown(makeReport([mediumFinding], "medium"), mediumOpts);
    expect(out).toContain("| Medium |");
  });

  it("uses label as finding text for standard rules", () => {
    const out = renderMarkdown(makeReport([authFinding]), failedOpts);
    expect(out).toContain("Auth / session file touched");
  });

  it("uses reason as finding text for dependency-added (carries package name)", () => {
    const out = renderMarkdown(makeReport([depFinding], "medium"), mediumOpts);
    expect(out).toContain("Added dependency: zod");
    expect(out).not.toContain("New dependency added |");
  });

  it("required review column is populated", () => {
    const out = renderMarkdown(makeReport([authFinding]), failedOpts);
    expect(out).toContain("auth/session");
  });

  it("required review column is empty string when undefined", () => {
    const noReview: RiskFinding = { ...authFinding, requiredReview: undefined };
    const out = renderMarkdown(makeReport([noReview]), failedOpts);
    // The column value should be empty (two consecutive | separated by space)
    expect(out).toMatch(/\| Auth \/ session file touched \|  \|/);
  });

  it("preserves original file order in table rows", () => {
    const report = makeReport([authFinding, migrationFinding, depFinding]);
    const out = renderMarkdown(report, failedOpts);
    const authIdx = out.indexOf("src/auth/session.ts");
    const migIdx = out.indexOf("supabase/migrations/");
    const depIdx = out.indexOf("package.json");
    expect(authIdx).toBeLessThan(migIdx);
    expect(migIdx).toBeLessThan(depIdx);
  });

  it("deduplicates rows with the same rule/file pair", () => {
    const dup = { ...authFinding };
    const out = renderMarkdown(makeReport([authFinding, dup]), failedOpts);
    const count = (out.match(/src\/auth\/session\.ts/g) ?? []).length;
    expect(count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Required human review section
// ---------------------------------------------------------------------------

describe("renderMarkdown — required human review", () => {
  it("emits '### Required human review' heading", () => {
    const out = renderMarkdown(makeReport([authFinding]), failedOpts);
    expect(out).toContain("### Required human review");
  });

  it("lists review labels as markdown list items", () => {
    const out = renderMarkdown(makeReport([authFinding]), failedOpts);
    expect(out).toContain("- auth/session");
  });

  it("labels are unique and sorted alphabetically", () => {
    const report = makeReport([authFinding, migrationFinding, depFinding]);
    const out = renderMarkdown(report, failedOpts);
    const lines = out.split("\n");
    const reviewIdx = lines.findIndex((l) => l === "### Required human review");
    const ciIdx = lines.findIndex((l) => l === "### CI result");
    const reviewItems = lines
      .slice(reviewIdx + 1, ciIdx)
      .filter((l) => l.startsWith("- "))
      .map((l) => l.slice(2));
    expect(reviewItems).toEqual([...reviewItems].sort());
    expect(new Set(reviewItems).size).toBe(reviewItems.length);
  });

  it("does not emit required human review when no findings", () => {
    const out = renderMarkdown(makeReport([], "low"), passedOpts);
    expect(out).not.toContain("### Required human review");
  });
});

// ---------------------------------------------------------------------------
// CI result section
// ---------------------------------------------------------------------------

describe("renderMarkdown — CI result", () => {
  it("emits '### CI result' heading", () => {
    const out = renderMarkdown(makeReport([authFinding]), failedOpts);
    expect(out).toContain("### CI result");
  });

  it("emits fail-on level", () => {
    const out = renderMarkdown(makeReport([authFinding]), failedOpts);
    expect(out).toContain("- fail-on: high");
  });

  it("emits result: failed when appropriate", () => {
    const out = renderMarkdown(makeReport([authFinding]), failedOpts);
    expect(out).toContain("- result: failed");
  });

  it("emits result: passed when risk is below threshold", () => {
    const out = renderMarkdown(makeReport([], "low"), passedOpts);
    expect(out).toContain("- result: passed");
  });

  it("emits fail-on: medium when configured", () => {
    const out = renderMarkdown(makeReport([mediumFinding], "medium"), mediumOpts);
    expect(out).toContain("- fail-on: medium");
    expect(out).toContain("- result: failed");
  });
});

// ---------------------------------------------------------------------------
// Exact full-output snapshot
// ---------------------------------------------------------------------------

describe("renderMarkdown — exact output snapshot", () => {
  it("matches spec example for findings present", () => {
    const report = makeReport([authFinding, migrationFinding, depFinding], "high");
    const out = renderMarkdown(report, failedOpts);
    expect(out).toBe(
      [
        "## Agent PR Risk: High",
        "### Changed risky areas",
        "| Severity | File | Finding | Required review |",
        "|---|---|---|---|",
        "| High | `src/auth/session.ts` | Auth / session file touched | auth/session |",
        "| High | `supabase/migrations/20260604_add.sql` | Database migration changed | database migration |",
        "| Medium | `package.json` | Added dependency: zod | dependency changes |",
        "### Required human review",
        "- auth/session",
        "- database migration",
        "- dependency changes",
        "### CI result",
        "- fail-on: high",
        "- result: failed",
      ].join("\n")
    );
  });
});
