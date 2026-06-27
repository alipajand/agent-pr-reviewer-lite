import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  globToRegex,
  isIgnored,
  loadConfig,
  CONFIG_FILE_NAME,
} from "../src/config.js";
import { buildExtraRules } from "../src/rules.js";
import { applyRules, DEFAULT_RULES } from "../src/rules.js";
import { buildReport } from "../src/risk.js";
import type { ChangedFile, ExtraRiskPath } from "../src/types.js";

// ---------------------------------------------------------------------------
// globToRegex
// ---------------------------------------------------------------------------

describe("globToRegex", () => {
  describe("literal patterns", () => {
    it("matches an exact filename", () => {
      expect(globToRegex("README.md").test("README.md")).toBe(true);
    });

    it("does not match a path-prefixed version of a literal pattern", () => {
      expect(globToRegex("README.md").test("docs/README.md")).toBe(false);
    });

    it("escapes dots so they are treated as literals", () => {
      expect(globToRegex("file.ts").test("fileXts")).toBe(false);
      expect(globToRegex("file.ts").test("file.ts")).toBe(true);
    });
  });

  describe("* (single star)", () => {
    it("matches any chars except /", () => {
      expect(globToRegex("src/*.ts").test("src/index.ts")).toBe(true);
    });

    it("does not cross directory boundaries", () => {
      expect(globToRegex("src/*.ts").test("src/nested/index.ts")).toBe(false);
    });

    it("matches prefix pattern *.md at root", () => {
      expect(globToRegex("*.md").test("README.md")).toBe(true);
      expect(globToRegex("*.md").test("docs/README.md")).toBe(false);
    });
  });

  describe("** (double star)", () => {
    it("docs/** matches files directly inside docs/", () => {
      expect(globToRegex("docs/**").test("docs/README.md")).toBe(true);
    });

    it("docs/** matches deeply nested files", () => {
      expect(globToRegex("docs/**").test("docs/api/reference/index.md")).toBe(
        true,
      );
    });

    it("docs/** also matches the bare directory itself", () => {
      expect(globToRegex("docs/**").test("docs")).toBe(true);
    });

    it("**/ prefix — matches at any nesting level", () => {
      const re = globToRegex("**/renewals/**");
      expect(re.test("renewals/index.ts")).toBe(true);
      expect(re.test("apps/web/renewals/index.ts")).toBe(true);
      expect(re.test("apps/web/app/renewals/index.ts")).toBe(true);
    });

    it("mid-path ** matches zero or more segments", () => {
      const re = globToRegex("apps/web/app/**/renewals/**");
      expect(re.test("apps/web/app/renewals/index.ts")).toBe(true);
      expect(re.test("apps/web/app/foo/renewals/bar.ts")).toBe(true);
      expect(re.test("apps/web/app/a/b/renewals/c/d.ts")).toBe(true);
    });

    it("mid-path ** does not match a wrong prefix", () => {
      const re = globToRegex("apps/web/app/**/renewals/**");
      expect(re.test("apps/api/renewals/index.ts")).toBe(false);
    });
  });

  describe("suffix patterns", () => {
    it("matches .generated.ts extension", () => {
      expect(globToRegex("*.generated.ts").test("schema.generated.ts")).toBe(
        true,
      );
    });

    it("does not match in a subdirectory", () => {
      expect(
        globToRegex("*.generated.ts").test("src/schema.generated.ts"),
      ).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// isIgnored
// ---------------------------------------------------------------------------

describe("isIgnored", () => {
  it("returns false when patterns list is empty", () => {
    expect(isIgnored("src/auth/session.ts", [])).toBe(false);
  });

  it("ignores a file matching a literal pattern", () => {
    expect(isIgnored("README.md", ["README.md"])).toBe(true);
  });

  it("does not ignore a file that doesn't match", () => {
    expect(isIgnored("src/index.ts", ["README.md"])).toBe(false);
  });

  it("ignores files under docs/** glob", () => {
    expect(isIgnored("docs/guide.md", ["docs/**"])).toBe(true);
    expect(isIgnored("docs/api/ref.md", ["docs/**"])).toBe(true);
  });

  it("does not ignore files outside the glob", () => {
    expect(isIgnored("src/index.ts", ["docs/**"])).toBe(false);
  });

  it("ignores when any pattern in the list matches", () => {
    const patterns = ["docs/**", "README.md"];
    expect(isIgnored("README.md", patterns)).toBe(true);
    expect(isIgnored("docs/guide.md", patterns)).toBe(true);
    expect(isIgnored("src/index.ts", patterns)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// loadConfig
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(
    tmpdir(),
    `apr-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeConfig(content: unknown, dir = tmpDir): string {
  const filePath = join(dir, CONFIG_FILE_NAME);
  writeFileSync(filePath, JSON.stringify(content), "utf8");
  return filePath;
}

describe("loadConfig", () => {
  it("returns null when no config file exists and no path given", () => {
    expect(loadConfig(undefined, tmpDir)).toBeNull();
  });

  it("throws when an explicit path does not exist", () => {
    expect(() => loadConfig(join(tmpDir, "nonexistent.json"))).toThrow(
      "not found",
    );
  });

  it("loads a valid minimal config", () => {
    const filePath = writeConfig({ base: "develop" });
    const config = loadConfig(filePath);
    expect(config?.base).toBe("develop");
  });

  it("loads all top-level fields", () => {
    writeConfig({
      base: "main",
      failOn: "medium",
      ignore: ["docs/**", "README.md"],
      extraRiskPaths: [],
    });
    const config = loadConfig(join(tmpDir, CONFIG_FILE_NAME));
    expect(config?.base).toBe("main");
    expect(config?.failOn).toBe("medium");
    expect(config?.ignore).toEqual(["docs/**", "README.md"]);
    expect(config?.extraRiskPaths).toEqual([]);
  });

  it("loads extraRiskPaths correctly", () => {
    writeConfig({
      extraRiskPaths: [
        {
          id: "renewals-rule",
          label: "Renewals workflow changed",
          severity: "high",
          patterns: ["apps/web/app/**/renewals/**"],
          requiredReview: "renewals workflow",
        },
      ],
    });
    const config = loadConfig(join(tmpDir, CONFIG_FILE_NAME));
    expect(config?.extraRiskPaths).toHaveLength(1);
    const erp = config!.extraRiskPaths![0];
    expect(erp.id).toBe("renewals-rule");
    expect(erp.label).toBe("Renewals workflow changed");
    expect(erp.severity).toBe("high");
    expect(erp.patterns).toEqual(["apps/web/app/**/renewals/**"]);
    expect(erp.requiredReview).toBe("renewals workflow");
  });

  it("extraRiskPath without requiredReview is valid", () => {
    writeConfig({
      extraRiskPaths: [
        { id: "x", label: "X", severity: "low", patterns: ["src/x/**"] },
      ],
    });
    const config = loadConfig(join(tmpDir, CONFIG_FILE_NAME));
    expect(config?.extraRiskPaths?.[0].requiredReview).toBeUndefined();
  });

  it("throws on invalid JSON", () => {
    const filePath = join(tmpDir, CONFIG_FILE_NAME);
    writeFileSync(filePath, "{ not valid json", "utf8");
    expect(() => loadConfig(filePath)).toThrow("Failed to parse");
  });

  it("throws when config is not an object", () => {
    const filePath = writeConfig([1, 2, 3]);
    expect(() => loadConfig(filePath)).toThrow("JSON object");
  });

  it("throws on invalid failOn value", () => {
    const filePath = writeConfig({ failOn: "critical" });
    expect(() => loadConfig(filePath)).toThrow("failOn");
  });

  it("throws when ignore is not an array", () => {
    const filePath = writeConfig({ ignore: "docs/**" });
    expect(() => loadConfig(filePath)).toThrow("ignore");
  });

  it("throws when extraRiskPaths entry is missing required field", () => {
    const filePath = writeConfig({
      extraRiskPaths: [{ id: "x", label: "X" }], // missing severity and patterns
    });
    expect(() => loadConfig(filePath)).toThrow(/severity/);
  });

  it("throws when base is not a string", () => {
    const filePath = writeConfig({ base: 123 });
    expect(() => loadConfig(filePath)).toThrow(/config.base must be a string/);
  });

  it("throws when extraRiskPaths is not an array", () => {
    const filePath = writeConfig({ extraRiskPaths: { id: "x" } });
    expect(() => loadConfig(filePath)).toThrow(
      /config.extraRiskPaths must be an array/,
    );
  });

  it("throws when an extraRiskPaths entry is not an object", () => {
    const filePath = writeConfig({ extraRiskPaths: ["not-an-object"] });
    expect(() => loadConfig(filePath)).toThrow(/must be an object/);
  });

  it("throws when an extraRiskPaths entry has an empty id", () => {
    const filePath = writeConfig({
      extraRiskPaths: [
        { id: "  ", label: "X", severity: "low", patterns: ["a"] },
      ],
    });
    expect(() => loadConfig(filePath)).toThrow(/id must be a non-empty string/);
  });

  it("throws when an extraRiskPaths entry has an empty label", () => {
    const filePath = writeConfig({
      extraRiskPaths: [
        { id: "x", label: "", severity: "low", patterns: ["a"] },
      ],
    });
    expect(() => loadConfig(filePath)).toThrow(
      /label must be a non-empty string/,
    );
  });

  it("throws when an extraRiskPaths entry has empty patterns", () => {
    const filePath = writeConfig({
      extraRiskPaths: [{ id: "x", label: "X", severity: "low", patterns: [] }],
    });
    expect(() => loadConfig(filePath)).toThrow(
      /patterns must be a non-empty array of strings/,
    );
  });

  it("throws when an extraRiskPaths entry has a non-string pattern", () => {
    const filePath = writeConfig({
      extraRiskPaths: [
        { id: "x", label: "X", severity: "low", patterns: [42] },
      ],
    });
    expect(() => loadConfig(filePath)).toThrow(
      /patterns must be a non-empty array of strings/,
    );
  });

  it("parses an extraRiskPaths entry that includes requiredReview", () => {
    const filePath = writeConfig({
      extraRiskPaths: [
        {
          id: "x",
          label: "X",
          severity: "high",
          patterns: ["a/**"],
          requiredReview: "team-x",
        },
      ],
    });
    const config = loadConfig(filePath);
    expect(config?.extraRiskPaths?.[0].requiredReview).toBe("team-x");
  });

  it("auto-discovers config from cwd", () => {
    writeConfig({ base: "develop" });
    const config = loadConfig(undefined, tmpDir);
    expect(config?.base).toBe("develop");
  });
});

// ---------------------------------------------------------------------------
// buildExtraRules
// ---------------------------------------------------------------------------

describe("buildExtraRules", () => {
  const extraPaths: ExtraRiskPath[] = [
    {
      id: "ledgerguard-renewals",
      label: "Renewals workflow changed",
      severity: "high",
      patterns: ["apps/web/app/**/renewals/**", "apps/api/**/renewals/**"],
      requiredReview: "renewals workflow",
    },
  ];

  it("returns one Rule per extraRiskPath entry", () => {
    expect(buildExtraRules(extraPaths)).toHaveLength(1);
  });

  it("rule id, label, severity, requiredReview match the config entry", () => {
    const [rule] = buildExtraRules(extraPaths);
    expect(rule.id).toBe("ledgerguard-renewals");
    expect(rule.label).toBe("Renewals workflow changed");
    expect(rule.severity).toBe("high");
    expect(rule.requiredReview).toBe("renewals workflow");
  });

  it("rule matches a path covered by one of its patterns", () => {
    const [rule] = buildExtraRules(extraPaths);
    const file: ChangedFile = {
      path: "apps/web/app/dashboard/renewals/index.ts",
      status: "modified",
    };
    expect(rule.match(file)).not.toBeNull();
  });

  it("rule matches apps/api pattern too", () => {
    const [rule] = buildExtraRules(extraPaths);
    const file: ChangedFile = {
      path: "apps/api/handlers/renewals/process.ts",
      status: "modified",
    };
    expect(rule.match(file)).not.toBeNull();
  });

  it("rule does not match an unrelated path", () => {
    const [rule] = buildExtraRules(extraPaths);
    const file: ChangedFile = { path: "src/utils/math.ts", status: "modified" };
    expect(rule.match(file)).toBeNull();
  });

  it("returns empty array for empty input", () => {
    expect(buildExtraRules([])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Ignore integration — files matching ignore patterns excluded from findings
// ---------------------------------------------------------------------------

describe("ignore integration", () => {
  function reviewWithIgnore(files: ChangedFile[], ignorePatterns: string[]) {
    const filtered = files.filter((f) => !isIgnored(f.path, ignorePatterns));
    return buildReport("main", "HEAD", filtered);
  }

  it("ignored file produces no findings", () => {
    const files: ChangedFile[] = [
      { path: "docs/guide.md", status: "modified" },
    ];
    // docs/guide.md would normally not trigger any rule, but let's use a
    // file that would trigger a rule and then ignore it.
    const authFiles: ChangedFile[] = [
      { path: "src/auth/session.ts", status: "modified" },
    ];
    const withIgnore = reviewWithIgnore(authFiles, ["src/auth/**"]);
    expect(withIgnore.overallRisk).toBe("low");
    expect(withIgnore.findings).toHaveLength(0);
  });

  it("non-ignored files still produce findings", () => {
    const files: ChangedFile[] = [
      { path: "src/auth/session.ts", status: "modified" },
      { path: "docs/guide.md", status: "modified" },
    ];
    const result = reviewWithIgnore(files, ["docs/**"]);
    expect(result.findings.some((f) => f.file === "src/auth/session.ts")).toBe(
      true,
    );
    expect(result.findings.every((f) => f.file !== "docs/guide.md")).toBe(true);
  });

  it("README.md literal ignore works", () => {
    const files: ChangedFile[] = [{ path: "README.md", status: "modified" }];
    // README.md alone won't trigger rules, but verify it gets filtered
    const filtered = files.filter((f) => !isIgnored(f.path, ["README.md"]));
    expect(filtered).toHaveLength(0);
  });

  it("extra rules also respect ignore patterns", () => {
    const extras: ExtraRiskPath[] = [
      {
        id: "renewals",
        label: "Renewals",
        severity: "high",
        patterns: ["apps/**/renewals/**"],
      },
    ];
    const extraRules = buildExtraRules(extras);
    const allRules = [...DEFAULT_RULES, ...extraRules];

    const files: ChangedFile[] = [
      { path: "apps/web/renewals/index.ts", status: "modified" },
    ];
    const filtered = files.filter(
      (f) => !isIgnored(f.path, ["apps/web/renewals/**"]),
    );
    const report = buildReport("main", "HEAD", filtered, allRules);
    expect(report.overallRisk).toBe("low");
  });
});

// ---------------------------------------------------------------------------
// Extra risk paths integration — full round-trip through buildReport
// ---------------------------------------------------------------------------

describe("extraRiskPaths integration", () => {
  it("finds a high-severity finding for a matching file", () => {
    const extras: ExtraRiskPath[] = [
      {
        id: "renewals-rule",
        label: "Renewals workflow changed",
        severity: "high",
        patterns: ["apps/web/app/**/renewals/**", "apps/api/**/renewals/**"],
        requiredReview: "renewals workflow",
      },
    ];
    const allRules = [...DEFAULT_RULES, ...buildExtraRules(extras)];
    const files: ChangedFile[] = [
      { path: "apps/web/app/dashboard/renewals/index.ts", status: "modified" },
    ];
    const report = buildReport("main", "HEAD", files, allRules);
    expect(report.overallRisk).toBe("high");
    const f = report.findings.find((x) => x.id === "renewals-rule");
    expect(f).toBeDefined();
    expect(f?.requiredReview).toBe("renewals workflow");
  });

  it("does not find a finding for a non-matching file", () => {
    const extras: ExtraRiskPath[] = [
      {
        id: "renewals-rule",
        label: "Renewals workflow changed",
        severity: "high",
        patterns: ["apps/web/app/**/renewals/**"],
      },
    ];
    const allRules = [...DEFAULT_RULES, ...buildExtraRules(extras)];
    const files: ChangedFile[] = [
      { path: "src/utils/math.ts", status: "modified" },
    ];
    const report = buildReport("main", "HEAD", files, allRules);
    expect(
      report.findings.find((x) => x.id === "renewals-rule"),
    ).toBeUndefined();
  });
});
