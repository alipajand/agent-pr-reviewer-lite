import { describe, it, expect } from "vitest";
import { applyRules, DEFAULT_RULES, extractAddedDependencies } from "../src/rules.js";
import { buildReport, shouldFail } from "../src/risk.js";
import type { ChangedFile } from "../src/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function file(
  path: string,
  status: ChangedFile["status"] = "modified",
  addedLines?: string[]
): ChangedFile {
  return { path, status, addedLines };
}

function hasRule(
  files: ChangedFile[],
  ruleId: string,
  severity?: string
): boolean {
  const findings = applyRules(files, DEFAULT_RULES);
  return findings.some(
    (f) => f.id === ruleId && (severity === undefined || f.severity === severity)
  );
}

// ---------------------------------------------------------------------------
// auth-file-touched
// ---------------------------------------------------------------------------

describe("auth-file-touched", () => {
  it("triggers on /auth/ in path", () => {
    expect(hasRule([file("src/auth/login.ts")], "auth-file-touched", "high")).toBe(true);
  });

  it("triggers on auth.ts filename", () => {
    expect(hasRule([file("src/lib/auth.ts")], "auth-file-touched", "high")).toBe(true);
  });

  it("triggers on session.ts filename", () => {
    expect(hasRule([file("lib/session.ts")], "auth-file-touched", "high")).toBe(true);
  });

  it("triggers on middleware.ts", () => {
    expect(hasRule([file("src/middleware.ts")], "auth-file-touched", "high")).toBe(true);
  });

  it("triggers on jwt in path", () => {
    expect(hasRule([file("src/utils/jwtHelper.ts")], "auth-file-touched", "high")).toBe(true);
  });

  it("triggers on supabase/auth path", () => {
    expect(hasRule([file("supabase/auth/config.ts")], "auth-file-touched", "high")).toBe(true);
  });

  it("triggers on clerk path", () => {
    expect(hasRule([file("src/clerk/webhooks.ts")], "auth-file-touched", "high")).toBe(true);
  });

  it("triggers on next-auth path", () => {
    expect(hasRule([file("src/next-auth/options.ts")], "auth-file-touched", "high")).toBe(true);
  });

  it("does NOT trigger on unrelated file", () => {
    expect(hasRule([file("src/components/Button.tsx")], "auth-file-touched")).toBe(false);
  });

  it("has requiredReview label 'auth/session'", () => {
    const findings = applyRules([file("src/auth/index.ts")], DEFAULT_RULES);
    const f = findings.find((x) => x.id === "auth-file-touched");
    expect(f?.requiredReview).toBe("auth/session");
  });
});

// ---------------------------------------------------------------------------
// billing-file-touched
// ---------------------------------------------------------------------------

describe("billing-file-touched", () => {
  it("triggers on /billing/ path", () => {
    expect(hasRule([file("src/billing/plans.ts")], "billing-file-touched", "high")).toBe(true);
  });

  it("triggers on /stripe/ path", () => {
    expect(hasRule([file("src/stripe/webhooks.ts")], "billing-file-touched", "high")).toBe(true);
  });

  it("triggers on stripe.ts filename", () => {
    expect(hasRule([file("lib/stripe.ts")], "billing-file-touched", "high")).toBe(true);
  });

  it("triggers on checkout in path", () => {
    expect(hasRule([file("src/pages/checkout.tsx")], "billing-file-touched", "high")).toBe(true);
  });

  it("triggers on subscription in path", () => {
    expect(hasRule([file("src/hooks/useSubscription.ts")], "billing-file-touched", "high")).toBe(true);
  });

  it("triggers on invoice in path", () => {
    expect(hasRule([file("src/api/invoice.ts")], "billing-file-touched", "high")).toBe(true);
  });

  it("triggers on payment in path", () => {
    expect(hasRule([file("src/services/paymentService.ts")], "billing-file-touched", "high")).toBe(true);
  });

  it("does NOT trigger on unrelated file", () => {
    expect(hasRule([file("src/utils/format.ts")], "billing-file-touched")).toBe(false);
  });

  it("has requiredReview label 'billing/payments'", () => {
    const findings = applyRules([file("src/billing/index.ts")], DEFAULT_RULES);
    const f = findings.find((x) => x.id === "billing-file-touched");
    expect(f?.requiredReview).toBe("billing/payments");
  });
});

// ---------------------------------------------------------------------------
// security-file-touched
// ---------------------------------------------------------------------------

describe("security-file-touched", () => {
  it("triggers on /security/ path", () => {
    expect(hasRule([file("src/security/headers.ts")], "security-file-touched", "high")).toBe(true);
  });

  it("triggers on rls in path", () => {
    expect(hasRule([file("supabase/rls-policies.sql")], "security-file-touched", "high")).toBe(true);
  });

  it("triggers on policy in path", () => {
    expect(hasRule([file("src/access/policy.ts")], "security-file-touched", "high")).toBe(true);
  });

  it("triggers on permissions in path", () => {
    expect(hasRule([file("src/utils/permissions.ts")], "security-file-touched", "high")).toBe(true);
  });

  it("triggers on access-control in path", () => {
    expect(hasRule([file("src/lib/access-control.ts")], "security-file-touched", "high")).toBe(true);
  });

  it("triggers on rate-limit in path", () => {
    expect(hasRule([file("src/middleware/rate-limit.ts")], "security-file-touched", "high")).toBe(true);
  });

  it("triggers on csrf in path", () => {
    expect(hasRule([file("src/middleware/csrf.ts")], "security-file-touched", "high")).toBe(true);
  });

  it("triggers on cors in path", () => {
    expect(hasRule([file("src/config/cors.ts")], "security-file-touched", "high")).toBe(true);
  });

  it("does NOT trigger on unrelated file", () => {
    expect(hasRule([file("src/components/Header.tsx")], "security-file-touched")).toBe(false);
  });

  it("has requiredReview label 'security/access-control'", () => {
    const findings = applyRules([file("src/security/index.ts")], DEFAULT_RULES);
    const f = findings.find((x) => x.id === "security-file-touched");
    expect(f?.requiredReview).toBe("security/access-control");
  });
});

// ---------------------------------------------------------------------------
// migration-changed
// ---------------------------------------------------------------------------

describe("migration-changed", () => {
  it("triggers on supabase/migrations/ path", () => {
    expect(hasRule([file("supabase/migrations/001_create_users.sql")], "migration-changed", "high")).toBe(true);
  });

  it("triggers on migrations/ path", () => {
    expect(hasRule([file("migrations/20240101_add_index.sql")], "migration-changed", "high")).toBe(true);
  });

  it("triggers on prisma/migrations/ path", () => {
    expect(hasRule([file("prisma/migrations/0001_init/migration.sql")], "migration-changed", "high")).toBe(true);
  });

  it("triggers on .sql under a migrations folder", () => {
    expect(hasRule([file("db/migrations/schema.sql")], "migration-changed", "high")).toBe(true);
  });

  it("does NOT trigger on a non-migration SQL file", () => {
    expect(hasRule([file("src/queries/users.sql")], "migration-changed")).toBe(false);
  });

  it("has requiredReview label 'database migration'", () => {
    const findings = applyRules([file("migrations/001.sql")], DEFAULT_RULES);
    const f = findings.find((x) => x.id === "migration-changed");
    expect(f?.requiredReview).toBe("database migration");
  });
});

// ---------------------------------------------------------------------------
// test-deleted
// ---------------------------------------------------------------------------

describe("test-deleted", () => {
  it("triggers when a .test. file is deleted", () => {
    expect(hasRule([file("src/utils/format.test.ts", "deleted")], "test-deleted", "high")).toBe(true);
  });

  it("triggers when a .spec. file is deleted", () => {
    expect(hasRule([file("src/api/users.spec.ts", "deleted")], "test-deleted", "high")).toBe(true);
  });

  it("triggers when a __tests__ file is deleted", () => {
    expect(hasRule([file("src/__tests__/helper.ts", "deleted")], "test-deleted", "high")).toBe(true);
  });

  it("triggers when a file in /tests/ is deleted", () => {
    expect(hasRule([file("tests/rules.test.ts", "deleted")], "test-deleted", "high")).toBe(true);
  });

  it("triggers when a file in /test/ is deleted", () => {
    expect(hasRule([file("test/unit/parser.ts", "deleted")], "test-deleted", "high")).toBe(true);
  });

  it("does NOT trigger when a test file is modified (not deleted)", () => {
    expect(hasRule([file("src/utils/format.test.ts", "modified")], "test-deleted")).toBe(false);
  });

  it("does NOT trigger when a non-test file is deleted", () => {
    expect(hasRule([file("src/utils/format.ts", "deleted")], "test-deleted")).toBe(false);
  });

  it("has requiredReview label 'deleted tests'", () => {
    const findings = applyRules([file("src/foo.test.ts", "deleted")], DEFAULT_RULES);
    const f = findings.find((x) => x.id === "test-deleted");
    expect(f?.requiredReview).toBe("deleted tests");
  });
});

// ---------------------------------------------------------------------------
// env-var-file-changed
// ---------------------------------------------------------------------------

describe("env-var-file-changed", () => {
  it("triggers on .env", () => {
    expect(hasRule([file(".env")], "env-var-file-changed", "medium")).toBe(true);
  });

  it("triggers on .env.example", () => {
    expect(hasRule([file(".env.example")], "env-var-file-changed", "medium")).toBe(true);
  });

  it("triggers on .env.local", () => {
    expect(hasRule([file(".env.local")], "env-var-file-changed", "medium")).toBe(true);
  });

  it("triggers on .env.production", () => {
    expect(hasRule([file(".env.production")], "env-var-file-changed", "medium")).toBe(true);
  });

  it("triggers on .env.development", () => {
    expect(hasRule([file(".env.development")], "env-var-file-changed", "medium")).toBe(true);
  });

  it("triggers on file containing env.example in name", () => {
    expect(hasRule([file("config/env.example.ts")], "env-var-file-changed", "medium")).toBe(true);
  });

  it("triggers on file containing environment in name", () => {
    expect(hasRule([file("src/config/environment.ts")], "env-var-file-changed", "medium")).toBe(true);
  });

  it("does NOT trigger on unrelated file", () => {
    expect(hasRule([file("src/components/Env.tsx")], "env-var-file-changed")).toBe(false);
  });

  it("has requiredReview label 'environment variables'", () => {
    const findings = applyRules([file(".env")], DEFAULT_RULES);
    const f = findings.find((x) => x.id === "env-var-file-changed");
    expect(f?.requiredReview).toBe("environment variables");
  });
});

// ---------------------------------------------------------------------------
// package-lock-changed
// ---------------------------------------------------------------------------

describe("package-lock-changed", () => {
  it("triggers on package-lock.json", () => {
    expect(hasRule([file("package-lock.json")], "package-lock-changed", "medium")).toBe(true);
  });

  it("triggers on pnpm-lock.yaml", () => {
    expect(hasRule([file("pnpm-lock.yaml")], "package-lock-changed", "medium")).toBe(true);
  });

  it("triggers on yarn.lock", () => {
    expect(hasRule([file("yarn.lock")], "package-lock-changed", "medium")).toBe(true);
  });

  it("triggers on bun.lockb", () => {
    expect(hasRule([file("bun.lockb")], "package-lock-changed", "medium")).toBe(true);
  });

  it("does NOT trigger on package.json itself", () => {
    expect(hasRule([file("package.json")], "package-lock-changed")).toBe(false);
  });

  it("has requiredReview label 'lockfile/dependency resolution'", () => {
    const findings = applyRules([file("pnpm-lock.yaml")], DEFAULT_RULES);
    const f = findings.find((x) => x.id === "package-lock-changed");
    expect(f?.requiredReview).toBe("lockfile/dependency resolution");
  });
});

// ---------------------------------------------------------------------------
// generated-file-edited
// ---------------------------------------------------------------------------

describe("generated-file-edited", () => {
  it("triggers on file containing 'generated' in path", () => {
    expect(hasRule([file("src/types/generated.ts")], "generated-file-edited", "medium")).toBe(true);
  });

  it("triggers on __generated__ directory", () => {
    expect(hasRule([file("src/__generated__/schema.ts")], "generated-file-edited", "medium")).toBe(true);
  });

  it("triggers on .generated.ts extension", () => {
    expect(hasRule([file("src/api/client.generated.ts")], "generated-file-edited", "medium")).toBe(true);
  });

  it("triggers on .generated.tsx extension", () => {
    expect(hasRule([file("src/components/Form.generated.tsx")], "generated-file-edited", "medium")).toBe(true);
  });

  it("triggers on .gen.ts extension", () => {
    expect(hasRule([file("src/types/schema.gen.ts")], "generated-file-edited", "medium")).toBe(true);
  });

  it("triggers on .gen.tsx extension", () => {
    expect(hasRule([file("src/hooks/query.gen.tsx")], "generated-file-edited", "medium")).toBe(true);
  });

  it("triggers on src/graphql/generated/ path", () => {
    expect(hasRule([file("src/graphql/generated/types.ts")], "generated-file-edited", "medium")).toBe(true);
  });

  it("does NOT trigger on regular source file", () => {
    expect(hasRule([file("src/utils/helpers.ts")], "generated-file-edited")).toBe(false);
  });

  it("has requiredReview label 'generated file'", () => {
    const findings = applyRules([file("src/graphql/generated/types.ts")], DEFAULT_RULES);
    const f = findings.find((x) => x.id === "generated-file-edited");
    expect(f?.requiredReview).toBe("generated file");
  });
});

// ---------------------------------------------------------------------------
// public-route-changed
// ---------------------------------------------------------------------------

describe("public-route-changed", () => {
  it("triggers on app/**/page.tsx", () => {
    expect(hasRule([file("app/dashboard/page.tsx")], "public-route-changed", "medium")).toBe(true);
  });

  it("triggers on app/**/layout.tsx", () => {
    expect(hasRule([file("app/dashboard/layout.tsx")], "public-route-changed", "medium")).toBe(true);
  });

  it("triggers on pages/ directory", () => {
    expect(hasRule([file("pages/index.tsx")], "public-route-changed", "medium")).toBe(true);
  });

  it("triggers on src/app/**/page.tsx", () => {
    expect(hasRule([file("src/app/settings/page.tsx")], "public-route-changed", "medium")).toBe(true);
  });

  it("triggers on src/app/**/layout.tsx", () => {
    expect(hasRule([file("src/app/settings/layout.tsx")], "public-route-changed", "medium")).toBe(true);
  });

  it("triggers on src/pages/ directory", () => {
    expect(hasRule([file("src/pages/api/users.ts")], "public-route-changed", "medium")).toBe(true);
  });

  it("does NOT trigger on a component file", () => {
    expect(hasRule([file("src/components/Layout.tsx")], "public-route-changed")).toBe(false);
  });

  it("has requiredReview label 'public route'", () => {
    const findings = applyRules([file("app/home/page.tsx")], DEFAULT_RULES);
    const f = findings.find((x) => x.id === "public-route-changed");
    expect(f?.requiredReview).toBe("public route");
  });
});

// ---------------------------------------------------------------------------
// pricing-copy-changed
// ---------------------------------------------------------------------------

describe("pricing-copy-changed", () => {
  it("triggers on pricing in path", () => {
    expect(hasRule([file("src/pages/pricing.tsx")], "pricing-copy-changed", "medium")).toBe(true);
  });

  it("triggers on plans in path", () => {
    expect(hasRule([file("src/components/Plans.tsx")], "pricing-copy-changed", "medium")).toBe(true);
  });

  it("triggers on checkout in path", () => {
    expect(hasRule([file("app/checkout/page.tsx")], "pricing-copy-changed", "medium")).toBe(true);
  });

  it("triggers on subscription in path", () => {
    expect(hasRule([file("src/copy/subscription-faq.md")], "pricing-copy-changed", "medium")).toBe(true);
  });

  it("triggers on billing in path", () => {
    expect(hasRule([file("src/marketing/billing-overview.tsx")], "pricing-copy-changed", "medium")).toBe(true);
  });

  it("triggers on marketing in path", () => {
    expect(hasRule([file("src/marketing/hero.tsx")], "pricing-copy-changed", "medium")).toBe(true);
  });

  it("triggers on landing in path", () => {
    expect(hasRule([file("src/pages/landing.tsx")], "pricing-copy-changed", "medium")).toBe(true);
  });

  it("does NOT trigger on unrelated file", () => {
    expect(hasRule([file("src/utils/math.ts")], "pricing-copy-changed")).toBe(false);
  });

  it("has requiredReview label 'pricing/public copy'", () => {
    const findings = applyRules([file("src/pricing/index.tsx")], DEFAULT_RULES);
    const f = findings.find((x) => x.id === "pricing-copy-changed");
    expect(f?.requiredReview).toBe("pricing/public copy");
  });
});

// ---------------------------------------------------------------------------
// dependency-added (content inspection)
// ---------------------------------------------------------------------------

describe("extractAddedDependencies", () => {
  it("extracts a dependency from added lines in dependencies section", () => {
    const addedLines = [
      '  "dependencies": {',
      '    "lodash": "^4.17.21"',
      "  }",
    ];
    expect(extractAddedDependencies(addedLines)).toEqual(["lodash"]);
  });

  it("extracts scoped packages", () => {
    const addedLines = [
      '  "devDependencies": {',
      '    "@types/node": "^20.0.0"',
      "  }",
    ];
    expect(extractAddedDependencies(addedLines)).toEqual(["@types/node"]);
  });

  it("extracts from multiple dep sections", () => {
    const addedLines = [
      '  "dependencies": {',
      '    "axios": "^1.0.0"',
      "  },",
      '  "devDependencies": {',
      '    "vitest": "^1.0.0"',
      "  }",
    ];
    expect(extractAddedDependencies(addedLines)).toEqual(["axios", "vitest"]);
  });

  it("ignores lines outside dep sections", () => {
    const addedLines = [
      '  "name": "my-app"',
      '  "version": "1.0.0"',
    ];
    expect(extractAddedDependencies(addedLines)).toEqual([]);
  });

  it("handles empty added lines", () => {
    expect(extractAddedDependencies([])).toEqual([]);
  });
});

describe("dependency-added rule", () => {
  it("produces one finding per added dependency", () => {
    const changedFile: ChangedFile = {
      path: "package.json",
      status: "modified",
      addedLines: [
        '  "dependencies": {',
        '    "axios": "^1.0.0"',
        '    "zod": "^3.22.0"',
        "  }",
      ],
    };
    const findings = applyRules([changedFile], DEFAULT_RULES).filter(
      (f) => f.id === "dependency-added"
    );
    expect(findings).toHaveLength(2);
    expect(findings[0].reason).toBe("Added dependency: axios");
    expect(findings[1].reason).toBe("Added dependency: zod");
    expect(findings[0].severity).toBe("medium");
    expect(findings[0].requiredReview).toBe("dependency changes");
  });

  it("produces no findings when no deps are added", () => {
    const changedFile: ChangedFile = {
      path: "package.json",
      status: "modified",
      addedLines: ['  "version": "2.0.0"'],
    };
    const findings = applyRules([changedFile], DEFAULT_RULES).filter(
      (f) => f.id === "dependency-added"
    );
    expect(findings).toHaveLength(0);
  });

  it("ignores non-package.json files", () => {
    const changedFile: ChangedFile = {
      path: "src/config.ts",
      status: "modified",
      addedLines: ['  "dependencies": {', '    "axios": "^1.0.0"', "  }"],
    };
    const findings = applyRules([changedFile], DEFAULT_RULES).filter(
      (f) => f.id === "dependency-added"
    );
    expect(findings).toHaveLength(0);
  });

  it("produces no findings when addedLines is undefined", () => {
    const changedFile: ChangedFile = { path: "package.json", status: "modified" };
    const findings = applyRules([changedFile], DEFAULT_RULES).filter(
      (f) => f.id === "dependency-added"
    );
    expect(findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Overall risk computation
// ---------------------------------------------------------------------------

describe("buildReport overall risk", () => {
  it("is 'low' when no files match any rule", () => {
    const report = buildReport("main", "HEAD", [file("src/utils/math.ts")]);
    expect(report.overallRisk).toBe("low");
  });

  it("is 'medium' when only medium findings exist", () => {
    const report = buildReport("main", "HEAD", [file("pnpm-lock.yaml")]);
    expect(report.overallRisk).toBe("medium");
  });

  it("is 'high' when at least one high finding exists", () => {
    const report = buildReport("main", "HEAD", [file("src/auth/session.ts")]);
    expect(report.overallRisk).toBe("high");
  });

  it("is 'high' when mixed high and medium findings exist", () => {
    const report = buildReport("main", "HEAD", [
      file("src/auth/session.ts"),
      file("pnpm-lock.yaml"),
    ]);
    expect(report.overallRisk).toBe("high");
  });

  it("is 'low' for empty file list", () => {
    const report = buildReport("main", "HEAD", []);
    expect(report.overallRisk).toBe("low");
    expect(report.findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// shouldFail
// ---------------------------------------------------------------------------

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
