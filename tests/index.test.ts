/**
 * Public API surface tests.
 *
 * src/index.ts is the package entry point (the "." export). These tests guard
 * the published surface: every documented function / value must be exported
 * and callable, so an accidental rename or dropped re-export is caught here
 * rather than by downstream consumers.
 */

import { describe, it, expect } from "vitest";
import * as api from "../src/index.js";

describe("public API — git helpers", () => {
  it("exports getChangedFiles and parseNameStatus as functions", () => {
    expect(typeof api.getChangedFiles).toBe("function");
    expect(typeof api.parseNameStatus).toBe("function");
  });

  it("parseNameStatus is the real implementation", () => {
    const parsed = api.parseNameStatus("A\tsrc/index.ts");
    expect(parsed).toEqual({ path: "src/index.ts", status: "added" });
  });
});

describe("public API — github helpers", () => {
  it("exports the expected github functions and the comment marker", () => {
    expect(typeof api.getPrNumber).toBe("function");
    expect(typeof api.readEventPayload).toBe("function");
    expect(typeof api.buildCommentBody).toBe("function");
    expect(typeof api.isValidRepository).toBe("function");
    expect(typeof api.postOrUpdateComment).toBe("function");
    expect(typeof api.tryPostGitHubComment).toBe("function");
    expect(api.COMMENT_MARKER).toBe("<!-- agent-pr-reviewer-lite -->");
  });
});

describe("public API — config helpers", () => {
  it("exports config helpers and the config file name constant", () => {
    expect(typeof api.loadConfig).toBe("function");
    expect(typeof api.isIgnored).toBe("function");
    expect(typeof api.globToRegex).toBe("function");
    expect(api.CONFIG_FILE_NAME).toBe("agent-pr-reviewer-lite.config.json");
  });

  it("globToRegex re-export behaves like the source implementation", () => {
    expect(api.globToRegex("docs/**").test("docs/guide.md")).toBe(true);
  });
});

describe("public API — rules", () => {
  it("exports applyRules, buildExtraRules, and a non-empty DEFAULT_RULES", () => {
    expect(typeof api.applyRules).toBe("function");
    expect(typeof api.buildExtraRules).toBe("function");
    expect(Array.isArray(api.DEFAULT_RULES)).toBe(true);
    expect(api.DEFAULT_RULES.length).toBeGreaterThan(0);
  });

  it("every DEFAULT_RULE has the expected shape", () => {
    for (const rule of api.DEFAULT_RULES) {
      expect(typeof rule.id).toBe("string");
      expect(typeof rule.label).toBe("string");
      expect(["low", "medium", "high"]).toContain(rule.severity);
      expect(typeof rule.match).toBe("function");
    }
  });
});

describe("public API — risk engine", () => {
  it("exports buildReport and shouldFail", () => {
    expect(typeof api.buildReport).toBe("function");
    expect(typeof api.shouldFail).toBe("function");
  });

  it("buildReport produces a well-formed report through the barrel export", () => {
    const report = api.buildReport("main", "HEAD", [
      { path: "src/auth/session.ts", status: "modified" },
    ]);
    expect(report.overallRisk).toBe("high");
    expect(report.base).toBe("main");
    expect(report.head).toBe("HEAD");
  });
});

describe("public API — reporters", () => {
  it("exports the three render functions", () => {
    expect(typeof api.renderText).toBe("function");
    expect(typeof api.renderJson).toBe("function");
    expect(typeof api.renderMarkdown).toBe("function");
  });
});

describe("public API — constants", () => {
  it("exports RISK_LEVEL_ORDER with the correct ordering", () => {
    expect(api.RISK_LEVEL_ORDER).toEqual({ low: 0, medium: 1, high: 2 });
  });
});
