import { globToRegex } from "./config.js";
import type {
  ChangedFile,
  ExtraRiskPath,
  RiskFinding,
  RiskLevel,
  PresetName,
} from "./types.js";

export type RuleMatchDetail = {
  reason: string;
  explain?: string;
};

export type RuleMatch = string | RuleMatchDetail | RiskFinding;

export type Rule = {
  id: string;
  label: string;
  severity: RiskLevel;
  requiredReview?: string;
  match: (file: ChangedFile) => RuleMatch | RuleMatch[] | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchesAny(path: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(path));
}

function firstMatchingPattern(path: string, patterns: RegExp[]): RegExp | null {
  return patterns.find((p) => p.test(path)) ?? null;
}

function finding(
  rule: Rule,
  file: ChangedFile,
  reason: string,
  explain?: string,
): RiskFinding {
  return {
    id: rule.id,
    label: rule.label,
    severity: rule.severity,
    file: file.path,
    reason,
    ...(explain !== undefined && { explain }),
    requiredReview: rule.requiredReview,
  };
}

function normalizeMatch(
  rule: Rule,
  file: ChangedFile,
  match: RuleMatch,
): RiskFinding {
  if (typeof match === "string") {
    return finding(rule, file, match);
  }
  if ("id" in match) {
    return match;
  }
  return finding(rule, file, match.reason, match.explain);
}

// ---------------------------------------------------------------------------
// Path pattern sets
// ---------------------------------------------------------------------------

const AUTH_PATHS = [
  /\/auth\//i,
  /(?:^|\/)auth\.tsx?$/i,
  /(?:^|\/)session\.tsx?$/i,
  /(?:^|\/)middleware\.tsx?$/i,
  /jwt/i,
  /supabase\/auth/i,
  /clerk/i,
  /next-auth/i,
];

const BILLING_PATHS = [
  /\/billing\//i,
  /\/stripe\//i,
  /(?:^|\/)stripe\.tsx?$/i,
  /checkout/i,
  /subscription/i,
  /invoice/i,
  /payment/i,
];

const SECURITY_PATHS = [
  /\/security\//i,
  /\brls\b/i,
  /\bpolicy\b/i,
  /permissions/i,
  /access-control/i,
  /rate-limit/i,
  /\bcsrf\b/i,
  /\bcors\b/i,
];

const MIGRATION_PATHS = [
  /^supabase\/migrations\//,
  /^migrations\//,
  /^prisma\/migrations\//,
  /\/migrations\/.*\.sql$/i,
];

const TEST_PATHS = [
  /\.test\./,
  /\.spec\./,
  /__tests__/,
  /(?:^|\/)tests\//,
  /(?:^|\/)test\//,
];

const ENV_PATHS = [
  /^\.env$/,
  /^\.env\.example$/,
  /^\.env\.local$/,
  /^\.env\.production$/,
  /^\.env\.development$/,
  /env\.example/i,
  /environment/i,
];

const LOCKFILE_PATHS = [
  /^package-lock\.json$/,
  /^pnpm-lock\.yaml$/,
  /^yarn\.lock$/,
  /^bun\.lockb$/,
];

const GENERATED_PATHS = [
  // "generated" as a standalone path segment or filename base (not inside "not-generated")
  /(?:^|\/)generated(?:[/.]|$)/i,
  /__generated__/,
  /\.generated\.tsx?$/,
  /\.gen\.tsx?$/,
  /^src\/graphql\/generated\//,
];

const PUBLIC_ROUTE_PATHS = [
  /^app\/.*\/page\.tsx$/,
  /^app\/.*\/layout\.tsx$/,
  /^pages\//,
  /^src\/app\/.*\/page\.tsx$/,
  /^src\/app\/.*\/layout\.tsx$/,
  /^src\/pages\//,
];

const PRICING_COPY_PATHS = [
  /pricing/i,
  /\bplans?\b/i,
  /checkout/i,
  /subscription/i,
  /billing/i,
  /marketing/i,
  /landing/i,
];

// ---------------------------------------------------------------------------
// Dependency-added parser (content inspection)
// ---------------------------------------------------------------------------

const DEP_SECTION_KEYS = new Set([
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
]);

/**
 * Parse added lines from a package.json diff to find newly added dependency
 * names. The simple heuristic: if we see a line that looks like
 *   `"<name>": "<version>"`
 * inside a dep section, consider it added.
 */
function extractAddedDependencies(addedLines: string[]): string[] {
  const deps: string[] = [];
  let inDepSection = false;

  for (const raw of addedLines) {
    const line = raw.trim();

    // Detect entering a dependency section header: `"dependencies": {`
    const sectionMatch = line.match(/^"([^"]+)"\s*:\s*\{/);
    if (sectionMatch && DEP_SECTION_KEYS.has(sectionMatch[1])) {
      inDepSection = true;
      continue;
    }

    // Closing brace — exit dep section
    if (line === "}" || line === "},") {
      inDepSection = false;
      continue;
    }

    if (inDepSection) {
      // Match `"package-name": "version"`
      const depMatch = line.match(/^"(@?[^"]+)"\s*:/);
      if (depMatch) {
        deps.push(depMatch[1]);
      }
    }
  }

  return deps;
}

// ---------------------------------------------------------------------------
// Rule definitions
// ---------------------------------------------------------------------------

export const DEFAULT_RULES: Rule[] = [
  // --- HIGH severity ---

  {
    id: "auth-file-touched",
    label: "Auth / session file touched",
    severity: "high",
    requiredReview: "auth/session",
    match(file) {
      const matched = firstMatchingPattern(file.path, AUTH_PATHS);
      if (matched) {
        return {
          reason: `File '${file.path}' touches authentication or session logic`,
          explain: `Matched built-in path pattern ${matched.toString()}`,
        };
      }
      return null;
    },
  },

  {
    id: "billing-file-touched",
    label: "Billing / payment file touched",
    severity: "high",
    requiredReview: "billing/payments",
    match(file) {
      const matched = firstMatchingPattern(file.path, BILLING_PATHS);
      if (matched) {
        return {
          reason: `File '${file.path}' touches billing or payment logic`,
          explain: `Matched built-in path pattern ${matched.toString()}`,
        };
      }
      return null;
    },
  },

  {
    id: "security-file-touched",
    label: "Security / access-control file touched",
    severity: "high",
    requiredReview: "security/access-control",
    match(file) {
      const matched = firstMatchingPattern(file.path, SECURITY_PATHS);
      if (matched) {
        return {
          reason: `File '${file.path}' touches security or access-control logic`,
          explain: `Matched built-in path pattern ${matched.toString()}`,
        };
      }
      return null;
    },
  },

  {
    id: "migration-changed",
    label: "Database migration changed",
    severity: "high",
    requiredReview: "database migration",
    match(file) {
      const matched = firstMatchingPattern(file.path, MIGRATION_PATHS);
      if (matched) {
        return {
          reason: `Migration file '${file.path}' was ${file.status}`,
          explain: `Matched built-in path pattern ${matched.toString()}`,
        };
      }
      return null;
    },
  },

  {
    id: "test-deleted",
    label: "Test file deleted",
    severity: "high",
    requiredReview: "deleted tests",
    match(file) {
      const matched =
        file.status === "deleted"
          ? firstMatchingPattern(file.path, TEST_PATHS)
          : null;
      if (matched) {
        return {
          reason: `Test file '${file.path}' was deleted`,
          explain: `Matched built-in path pattern ${matched.toString()} with deleted status`,
        };
      }
      return null;
    },
  },

  // --- MEDIUM severity ---

  {
    id: "env-var-file-changed",
    label: "Environment variable file changed",
    severity: "medium",
    requiredReview: "environment variables",
    match(file) {
      const matched = firstMatchingPattern(file.path, ENV_PATHS);
      if (matched) {
        return {
          reason: `Environment file '${file.path}' was ${file.status}`,
          explain: `Matched built-in path pattern ${matched.toString()}`,
        };
      }
      return null;
    },
  },

  {
    id: "package-lock-changed",
    label: "Lockfile changed",
    severity: "medium",
    requiredReview: "lockfile/dependency resolution",
    match(file) {
      const matched = firstMatchingPattern(file.path, LOCKFILE_PATHS);
      if (matched) {
        return {
          reason: `Lockfile '${file.path}' was ${file.status} — verify dependency resolution is correct`,
          explain: `Matched built-in path pattern ${matched.toString()}`,
        };
      }
      return null;
    },
  },

  {
    id: "generated-file-edited",
    label: "Generated file edited",
    severity: "medium",
    requiredReview: "generated file",
    match(file) {
      const matched = firstMatchingPattern(file.path, GENERATED_PATHS);
      if (matched) {
        return {
          reason: `Generated file '${file.path}' was manually ${file.status} — regenerate instead of editing by hand`,
          explain: `Matched built-in path pattern ${matched.toString()}`,
        };
      }
      return null;
    },
  },

  {
    id: "public-route-changed",
    label: "Public route changed",
    severity: "medium",
    requiredReview: "public route",
    match(file) {
      const matched = firstMatchingPattern(file.path, PUBLIC_ROUTE_PATHS);
      if (matched) {
        return {
          reason: `Public route file '${file.path}' was ${file.status}`,
          explain: `Matched built-in path pattern ${matched.toString()}`,
        };
      }
      return null;
    },
  },

  {
    id: "pricing-copy-changed",
    label: "Pricing or public copy changed",
    severity: "medium",
    requiredReview: "pricing/public copy",
    match(file) {
      const matched = firstMatchingPattern(file.path, PRICING_COPY_PATHS);
      if (matched) {
        return {
          reason: `Pricing or marketing file '${file.path}' was ${file.status}`,
          explain: `Matched built-in path pattern ${matched.toString()}`,
        };
      }
      return null;
    },
  },

  // --- MEDIUM severity with content inspection ---

  {
    id: "dependency-added",
    label: "New dependency added",
    severity: "medium",
    requiredReview: "dependency changes",
    match(file) {
      if (file.path !== "package.json") return null;
      if (!file.addedLines || file.addedLines.length === 0) return null;

      const added = extractAddedDependencies(file.addedLines);
      if (added.length === 0) return null;

      return added.map((name) =>
        finding(
          this as Rule,
          file,
          `Added dependency: ${name}`,
          `Matched added package.json dependency entry "${name}"`,
        ),
      );
    },
  },
];

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export function applyRules(
  files: ChangedFile[],
  rules: Rule[] = DEFAULT_RULES,
): RiskFinding[] {
  const findings: RiskFinding[] = [];

  for (const file of files) {
    for (const rule of rules) {
      const result = rule.match(file);
      if (result === null) continue;

      if (Array.isArray(result)) {
        findings.push(
          ...result.map((item) => normalizeMatch(rule, file, item)),
        );
      } else {
        findings.push(normalizeMatch(rule, file, result));
      }
    }
  }

  return findings;
}

export { extractAddedDependencies };

// ---------------------------------------------------------------------------
// Extra rules from config
// ---------------------------------------------------------------------------

export const BUILTIN_PRESETS: Record<PresetName, ExtraRiskPath[]> = {
  "nextjs-saas": [
    {
      id: "nextjs-api-route-changed",
      label: "Next.js API route changed",
      severity: "high",
      patterns: [
        "app/api/**",
        "pages/api/**",
        "src/app/api/**",
        "src/pages/api/**",
      ],
      requiredReview: "next.js API route",
    },
    {
      id: "nextjs-server-action-changed",
      label: "Next.js server action changed",
      severity: "high",
      patterns: [
        "app/**/actions.ts",
        "app/**/actions/**",
        "src/app/**/actions.ts",
        "src/app/**/actions/**",
      ],
      requiredReview: "server actions",
    },
    {
      id: "nextjs-runtime-config-changed",
      label: "Next.js runtime config changed",
      severity: "high",
      patterns: ["next.config.js", "next.config.mjs", "next.config.ts"],
      requiredReview: "next.js runtime config",
    },
  ],
  supabase: [
    {
      id: "supabase-edge-function-changed",
      label: "Supabase edge function changed",
      severity: "high",
      patterns: ["supabase/functions/**"],
      requiredReview: "supabase edge functions",
    },
    {
      id: "supabase-project-config-changed",
      label: "Supabase project config changed",
      severity: "high",
      patterns: ["supabase/config.toml"],
      requiredReview: "supabase project config",
    },
    {
      id: "supabase-integration-changed",
      label: "Supabase integration changed",
      severity: "high",
      patterns: [
        "src/lib/supabase/**",
        "lib/supabase/**",
        "src/integrations/supabase/**",
      ],
      requiredReview: "supabase integration",
    },
  ],
  stripe: [
    {
      id: "stripe-webhook-changed",
      label: "Stripe webhook changed",
      severity: "high",
      patterns: [
        "app/api/**/webhooks/**",
        "src/app/api/**/webhooks/**",
        "pages/api/**/webhooks/**",
        "src/pages/api/**/webhooks/**",
        "src/**/webhook*.ts",
      ],
      requiredReview: "stripe webhooks",
    },
    {
      id: "stripe-integration-changed",
      label: "Stripe integration changed",
      severity: "high",
      patterns: ["stripe/**", "src/lib/stripe/**", "lib/stripe/**"],
      requiredReview: "stripe integration",
    },
  ],
};

export const BUILTIN_PRESET_NAMES = Object.keys(
  BUILTIN_PRESETS,
) as PresetName[];

/**
 * Convert `extraRiskPaths` config entries into Rule objects that behave
 * identically to built-in path rules.
 */
export function buildExtraRules(extraRiskPaths: ExtraRiskPath[]): Rule[] {
  return extraRiskPaths.map((erp) => {
    const regexes = erp.patterns.map(globToRegex);
    return {
      id: erp.id,
      label: erp.label,
      severity: erp.severity,
      requiredReview: erp.requiredReview,
      match(file: ChangedFile): RuleMatchDetail | null {
        const matchIndex = regexes.findIndex((r) => r.test(file.path));
        if (matchIndex !== -1) {
          return {
            reason: `File '${file.path}' matches configured risk pattern for '${erp.label}'`,
            explain: `Matched configured glob pattern "${erp.patterns[matchIndex]}"`,
          };
        }
        return null;
      },
    };
  });
}

export function buildPresetRules(presets: PresetName[]): Rule[] {
  const extraRiskPaths = presets.flatMap(
    (preset) => BUILTIN_PRESETS[preset] ?? [],
  );
  return buildExtraRules(extraRiskPaths);
}
