import { describe, it, expect } from "vitest";
import { applyRules, DEFAULT_RULES } from "../src/rules.js";
import { buildReport, shouldFail } from "../src/risk.js";
import type { ChangedFile } from "../src/types.js";

describe("applyRules", () => {
  it("returns no findings for a plain source file", () => {
    const files: ChangedFile[] = [
      { path: "src/components/Button.tsx", status: "modified" },
    ];
    const findings = applyRules(files, DEFAULT_RULES);
    expect(findings).toHaveLength(0);
  });

  it("detects sensitive file (.env)", () => {
    const files: ChangedFile[] = [
      { path: ".env.production", status: "modified" },
    ];
    const findings = applyRules(files, DEFAULT_RULES);
    expect(findings.some((f) => f.id === "sensitive-file")).toBe(true);
    expect(findings.every((f) => f.severity === "high" || f.severity === "medium")).toBe(true);
  });

  it("detects CI/CD file change in .github/workflows", () => {
    const files: ChangedFile[] = [
      { path: ".github/workflows/ci.yml", status: "modified" },
    ];
    const findings = applyRules(files, DEFAULT_RULES);
    expect(findings.some((f) => f.id === "ci-cd-change")).toBe(true);
  });

  it("detects terraform infra file", () => {
    const files: ChangedFile[] = [
      { path: "infra/main.tf", status: "modified" },
    ];
    const findings = applyRules(files, DEFAULT_RULES);
    expect(findings.some((f) => f.id === "infra-change")).toBe(true);
  });

  it("detects package.json dependency change", () => {
    const files: ChangedFile[] = [
      { path: "package.json", status: "modified" },
    ];
    const findings = applyRules(files, DEFAULT_RULES);
    expect(findings.some((f) => f.id === "dependency-change")).toBe(true);
    expect(findings.find((f) => f.id === "dependency-change")?.severity).toBe("medium");
  });

  it("detects auth-related file change", () => {
    const files: ChangedFile[] = [
      { path: "src/services/authService.ts", status: "modified" },
    ];
    const findings = applyRules(files, DEFAULT_RULES);
    expect(findings.some((f) => f.id === "auth-change")).toBe(true);
  });

  it("detects database migration file", () => {
    const files: ChangedFile[] = [
      { path: "db/migrations/001_create_users.sql", status: "added" },
    ];
    const findings = applyRules(files, DEFAULT_RULES);
    expect(findings.some((f) => f.id === "database-migration")).toBe(true);
  });

  it("flags deleted files with bulk-deletion rule", () => {
    const files: ChangedFile[] = [
      { path: "src/old-module.ts", status: "deleted" },
    ];
    const findings = applyRules(files, DEFAULT_RULES);
    expect(findings.some((f) => f.id === "bulk-deletion")).toBe(true);
  });

  it("handles renamed files without crashing", () => {
    const files: ChangedFile[] = [
      { path: "src/newName.ts", previousPath: "src/oldName.ts", status: "renamed" },
    ];
    expect(() => applyRules(files, DEFAULT_RULES)).not.toThrow();
  });

  it("can apply an empty rule set", () => {
    const files: ChangedFile[] = [
      { path: ".env", status: "modified" },
    ];
    const findings = applyRules(files, []);
    expect(findings).toHaveLength(0);
  });
});

describe("buildReport", () => {
  it("produces low risk when no files match any rule", () => {
    const files: ChangedFile[] = [
      { path: "src/utils/format.ts", status: "modified" },
    ];
    const report = buildReport("main", "HEAD", files);
    expect(report.overallRisk).toBe("low");
    expect(report.totalFiles).toBe(1);
    expect(report.findings).toHaveLength(0);
  });

  it("produces high risk when a sensitive file is changed", () => {
    const files: ChangedFile[] = [
      { path: ".env", status: "modified" },
    ];
    const report = buildReport("main", "HEAD", files);
    expect(report.overallRisk).toBe("high");
  });

  it("produces medium risk when only dependency file changes", () => {
    const files: ChangedFile[] = [
      { path: "package.json", status: "modified" },
    ];
    const report = buildReport("main", "HEAD", files);
    // package.json also triggers bulk-deletion? No — it's modified, not deleted.
    // The report should be medium (dependency-change) at minimum.
    expect(["medium", "high"]).toContain(report.overallRisk);
  });

  it("returns low risk for empty file list", () => {
    const report = buildReport("main", "HEAD", []);
    expect(report.overallRisk).toBe("low");
    expect(report.totalFiles).toBe(0);
    expect(report.findings).toHaveLength(0);
  });
});

describe("shouldFail", () => {
  it("does not fail when risk is below threshold", () => {
    expect(shouldFail("low", "high")).toBe(false);
    expect(shouldFail("low", "medium")).toBe(false);
    expect(shouldFail("medium", "high")).toBe(false);
  });

  it("fails when risk equals threshold", () => {
    expect(shouldFail("low", "low")).toBe(true);
    expect(shouldFail("medium", "medium")).toBe(true);
    expect(shouldFail("high", "high")).toBe(true);
  });

  it("fails when risk exceeds threshold", () => {
    expect(shouldFail("high", "low")).toBe(true);
    expect(shouldFail("high", "medium")).toBe(true);
    expect(shouldFail("medium", "low")).toBe(true);
  });
});
