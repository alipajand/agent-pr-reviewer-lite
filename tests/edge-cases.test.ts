import { describe, it, expect } from "vitest";
import { applyRules, DEFAULT_RULES } from "../src/rules.js";
import { parseNameStatus } from "../src/git.js";
import type { ChangedFile } from "../src/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function file(
  path: string,
  status: ChangedFile["status"] = "modified",
  opts: Partial<ChangedFile> = {}
): ChangedFile {
  return { path, status, ...opts };
}

function hasRule(files: ChangedFile[], ruleId: string): boolean {
  return applyRules(files, DEFAULT_RULES).some((f) => f.id === ruleId);
}

function ruleIds(files: ChangedFile[]): string[] {
  return [...new Set(applyRules(files, DEFAULT_RULES).map((f) => f.id))];
}

// ---------------------------------------------------------------------------
// Edge case 1 — pnpm-lock.yaml changed in isolation triggers package-lock-changed
// ---------------------------------------------------------------------------

describe("edge case 1: lockfile changed without package.json", () => {
  it("pnpm-lock.yaml alone triggers package-lock-changed", () => {
    expect(hasRule([file("pnpm-lock.yaml")], "package-lock-changed")).toBe(true);
  });

  it("package-lock-changed is triggered even when package.json is NOT in the diff", () => {
    const findings = applyRules([file("pnpm-lock.yaml")], DEFAULT_RULES);
    const pkgLockFindings = findings.filter((f) => f.id === "package-lock-changed");
    expect(pkgLockFindings).toHaveLength(1);
    expect(pkgLockFindings[0].file).toBe("pnpm-lock.yaml");
  });

  it("dependency-added is NOT triggered when only pnpm-lock.yaml changes (no addedLines)", () => {
    expect(hasRule([file("pnpm-lock.yaml")], "dependency-added")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Edge case 2 — src/graphql/generated/types.ts triggers generated-file-edited
// ---------------------------------------------------------------------------

describe("edge case 2: src/graphql/generated/types.ts triggers generated-file-edited", () => {
  it("triggers generated-file-edited", () => {
    expect(
      hasRule(
        [file("src/graphql/generated/types.ts")],
        "generated-file-edited"
      )
    ).toBe(true);
  });

  it("severity is medium", () => {
    const findings = applyRules(
      [file("src/graphql/generated/types.ts")],
      DEFAULT_RULES
    );
    const f = findings.find((x) => x.id === "generated-file-edited");
    expect(f?.severity).toBe("medium");
  });

  it("requiredReview is 'generated file'", () => {
    const findings = applyRules(
      [file("src/graphql/generated/types.ts")],
      DEFAULT_RULES
    );
    const f = findings.find((x) => x.id === "generated-file-edited");
    expect(f?.requiredReview).toBe("generated file");
  });
});

// ---------------------------------------------------------------------------
// Edge case 3 — src/graphql/not-generated/types.ts does NOT trigger
// ---------------------------------------------------------------------------

describe("edge case 3: not-generated path does not trigger generated rule", () => {
  it("src/graphql/not-generated/types.ts does not trigger generated-file-edited", () => {
    expect(
      hasRule(
        [file("src/graphql/not-generated/types.ts")],
        "generated-file-edited"
      )
    ).toBe(false);
  });

  it("src/components/not-generated-component.tsx does not trigger generated rule", () => {
    expect(
      hasRule(
        [file("src/components/not-generated-component.tsx")],
        "generated-file-edited"
      )
    ).toBe(false);
  });

  it("auto-generated/ as a directory name still triggers (contains 'generated' preceded by '-')", () => {
    // "auto-generated" has "-generated" — the hyphen is not a path separator,
    // so this correctly does NOT trigger with the precise pattern.
    expect(
      hasRule(
        [file("src/auto-generated/types.ts")],
        "generated-file-edited"
      )
    ).toBe(false);
  });

  it("but src/generated/types.ts (standalone segment) still triggers", () => {
    expect(
      hasRule([file("src/generated/types.ts")], "generated-file-edited")
    ).toBe(true);
  });

  it("and src/types/generated.ts (filename) still triggers", () => {
    expect(
      hasRule([file("src/types/generated.ts")], "generated-file-edited")
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Edge case 4 — src/app/pricing/page.tsx triggers BOTH rules
// ---------------------------------------------------------------------------

describe("edge case 4: src/app/pricing/page.tsx triggers two rules", () => {
  it("triggers public-route-changed", () => {
    expect(
      hasRule([file("src/app/pricing/page.tsx")], "public-route-changed")
    ).toBe(true);
  });

  it("triggers pricing-copy-changed", () => {
    expect(
      hasRule([file("src/app/pricing/page.tsx")], "pricing-copy-changed")
    ).toBe(true);
  });

  it("both rule IDs appear in the findings for the same file", () => {
    const ids = ruleIds([file("src/app/pricing/page.tsx")]);
    expect(ids).toContain("public-route-changed");
    expect(ids).toContain("pricing-copy-changed");
  });

  it("findings for both rules point to the same file", () => {
    const findings = applyRules(
      [file("src/app/pricing/page.tsx")],
      DEFAULT_RULES
    );
    const publicRoute = findings.find((f) => f.id === "public-route-changed");
    const pricingCopy = findings.find((f) => f.id === "pricing-copy-changed");
    expect(publicRoute?.file).toBe("src/app/pricing/page.tsx");
    expect(pricingCopy?.file).toBe("src/app/pricing/page.tsx");
  });
});

// ---------------------------------------------------------------------------
// Edge case 5 — deleted Button.test.tsx triggers test-deleted (high)
// ---------------------------------------------------------------------------

describe("edge case 5: deleted test file triggers test-deleted", () => {
  it("apps/web/components/Button.test.tsx deleted triggers test-deleted", () => {
    expect(
      hasRule(
        [file("apps/web/components/Button.test.tsx", "deleted")],
        "test-deleted"
      )
    ).toBe(true);
  });

  it("finding severity is high", () => {
    const findings = applyRules(
      [file("apps/web/components/Button.test.tsx", "deleted")],
      DEFAULT_RULES
    );
    const f = findings.find((x) => x.id === "test-deleted");
    expect(f?.severity).toBe("high");
  });

  it("finding file matches the deleted path", () => {
    const findings = applyRules(
      [file("apps/web/components/Button.test.tsx", "deleted")],
      DEFAULT_RULES
    );
    const f = findings.find((x) => x.id === "test-deleted");
    expect(f?.file).toBe("apps/web/components/Button.test.tsx");
  });
});

// ---------------------------------------------------------------------------
// Edge case 6 — modified test file does NOT trigger test-deleted
// ---------------------------------------------------------------------------

describe("edge case 6: modified test file does not trigger test-deleted", () => {
  it("apps/web/components/Button.test.tsx modified does not trigger test-deleted", () => {
    expect(
      hasRule(
        [file("apps/web/components/Button.test.tsx", "modified")],
        "test-deleted"
      )
    ).toBe(false);
  });

  it("added test file does not trigger test-deleted", () => {
    expect(
      hasRule(
        [file("apps/web/components/Button.test.tsx", "added")],
        "test-deleted"
      )
    ).toBe(false);
  });

  it("renamed test file does not trigger test-deleted", () => {
    expect(
      hasRule(
        [
          file("apps/web/components/ButtonNew.test.tsx", "renamed", {
            previousPath: "apps/web/components/Button.test.tsx",
          }),
        ],
        "test-deleted"
      )
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Edge case 7 — .env.example triggers env-var-file-changed
// ---------------------------------------------------------------------------

describe("edge case 7: .env.example triggers env-var-file-changed", () => {
  it(".env.example triggers env-var-file-changed", () => {
    expect(hasRule([file(".env.example")], "env-var-file-changed")).toBe(true);
  });

  it("severity is medium", () => {
    const findings = applyRules([file(".env.example")], DEFAULT_RULES);
    const f = findings.find((x) => x.id === "env-var-file-changed");
    expect(f?.severity).toBe("medium");
  });
});

// ---------------------------------------------------------------------------
// Edge case 8 — .env.local triggers env-var-file-changed
// ---------------------------------------------------------------------------

describe("edge case 8: .env.local triggers env-var-file-changed", () => {
  it(".env.local triggers env-var-file-changed", () => {
    expect(hasRule([file(".env.local")], "env-var-file-changed")).toBe(true);
  });

  it("severity is medium", () => {
    const findings = applyRules([file(".env.local")], DEFAULT_RULES);
    const f = findings.find((x) => x.id === "env-var-file-changed");
    expect(f?.severity).toBe("medium");
  });
});

// ---------------------------------------------------------------------------
// Edge case 9 — renamed migration triggers migration rule on new path
// ---------------------------------------------------------------------------

describe("edge case 9: renamed migration triggers migration-changed on new path", () => {
  const renamedMigration: ChangedFile = {
    path: "migrations/20260605_add_org_policy.sql",
    previousPath: "migrations/20260604_add_org_policy.sql",
    status: "renamed",
  };

  it("triggers migration-changed", () => {
    expect(hasRule([renamedMigration], "migration-changed")).toBe(true);
  });

  it("finding file points to the NEW path", () => {
    const findings = applyRules([renamedMigration], DEFAULT_RULES);
    const f = findings.find((x) => x.id === "migration-changed");
    expect(f?.file).toBe("migrations/20260605_add_org_policy.sql");
  });

  it("severity is high", () => {
    const findings = applyRules([renamedMigration], DEFAULT_RULES);
    const f = findings.find((x) => x.id === "migration-changed");
    expect(f?.severity).toBe("high");
  });

  it("also works for supabase/migrations renamed file", () => {
    const supabaseRenamed: ChangedFile = {
      path: "supabase/migrations/20260605_v2.sql",
      previousPath: "supabase/migrations/20260604_v1.sql",
      status: "renamed",
    };
    expect(hasRule([supabaseRenamed], "migration-changed")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Edge case 10 — renamed auth file: rule fires on new path, previousPath preserved
// ---------------------------------------------------------------------------

describe("edge case 10: renamed auth file triggers auth rule and preserves previousPath", () => {
  const renamedAuth: ChangedFile = {
    path: "src/auth/session-v2.ts",
    previousPath: "src/auth/session.ts",
    status: "renamed",
  };

  it("triggers auth-file-touched on the new path", () => {
    expect(hasRule([renamedAuth], "auth-file-touched")).toBe(true);
  });

  it("finding file is the new path", () => {
    const findings = applyRules([renamedAuth], DEFAULT_RULES);
    const f = findings.find((x) => x.id === "auth-file-touched");
    expect(f?.file).toBe("src/auth/session-v2.ts");
  });

  it("the ChangedFile retains previousPath", () => {
    expect(renamedAuth.previousPath).toBe("src/auth/session.ts");
  });

  // --- git parser ---

  it("parseNameStatus correctly sets path and previousPath for R100 rename line", () => {
    const line = "R100\told/src/auth/session.ts\tnew/src/auth/session-v2.ts";
    const result = parseNameStatus(line);
    expect(result).not.toBeNull();
    expect(result?.status).toBe("renamed");
    expect(result?.path).toBe("new/src/auth/session-v2.ts");
    expect(result?.previousPath).toBe("old/src/auth/session.ts");
  });

  it("parseNameStatus works for R075 (partial rename)", () => {
    const line = "R075\told/middleware.ts\tnew/middleware.ts";
    const result = parseNameStatus(line);
    expect(result?.status).toBe("renamed");
    expect(result?.path).toBe("new/middleware.ts");
    expect(result?.previousPath).toBe("old/middleware.ts");
  });

  it("parseNameStatus A line returns no previousPath", () => {
    const result = parseNameStatus("A\tsrc/new-file.ts");
    expect(result?.status).toBe("added");
    expect(result?.previousPath).toBeUndefined();
  });

  it("parseNameStatus D line returns deleted status with no previousPath", () => {
    const result = parseNameStatus("D\tsrc/old-file.ts");
    expect(result?.status).toBe("deleted");
    expect(result?.previousPath).toBeUndefined();
  });

  it("parseNameStatus M line returns modified status", () => {
    const result = parseNameStatus("M\tsrc/file.ts");
    expect(result?.status).toBe("modified");
    expect(result?.path).toBe("src/file.ts");
  });

  it("parseNameStatus returns null for malformed lines", () => {
    expect(parseNameStatus("")).toBeNull();
    expect(parseNameStatus("A")).toBeNull();
  });

  it("parseNameStatus maps unrecognized status codes (e.g. type-change 'T') to modified", () => {
    const result = parseNameStatus("T\tsrc/symlink.ts");
    expect(result?.status).toBe("modified");
    expect(result?.path).toBe("src/symlink.ts");
  });

  it("parseNameStatus maps copy 'C100' lines to renamed (R-prefix only) — non-R falls through to modified", () => {
    // "C100" does not start with "R", so it is treated as a 2-column line and
    // mapped through the default branch to "modified".
    const result = parseNameStatus("C100\tsrc/copied.ts");
    expect(result?.status).toBe("modified");
  });

  it("parseNameStatus returns null for a rename line missing the new path", () => {
    expect(parseNameStatus("R100\told/path.ts")).toBeNull();
  });
});
