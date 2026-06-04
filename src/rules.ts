import type { ChangedFile, RiskFinding, RiskLevel } from "./types.js";

export type Rule = {
  id: string;
  label: string;
  severity: RiskLevel;
  requiredReview?: string;
  match: (file: ChangedFile) => RiskFinding[] | string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchesAny(path: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(path));
}

function finding(
  rule: Rule,
  file: ChangedFile,
  reason: string
): RiskFinding {
  return {
    id: rule.id,
    label: rule.label,
    severity: rule.severity,
    file: file.path,
    reason,
    requiredReview: rule.requiredReview,
  };
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
  /generated/i,
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
      if (matchesAny(file.path, AUTH_PATHS)) {
        return `File '${file.path}' touches authentication or session logic`;
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
      if (matchesAny(file.path, BILLING_PATHS)) {
        return `File '${file.path}' touches billing or payment logic`;
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
      if (matchesAny(file.path, SECURITY_PATHS)) {
        return `File '${file.path}' touches security or access-control logic`;
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
      if (matchesAny(file.path, MIGRATION_PATHS)) {
        return `Migration file '${file.path}' was ${file.status}`;
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
      if (file.status === "deleted" && matchesAny(file.path, TEST_PATHS)) {
        return `Test file '${file.path}' was deleted`;
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
      if (matchesAny(file.path, ENV_PATHS)) {
        return `Environment file '${file.path}' was ${file.status}`;
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
      if (matchesAny(file.path, LOCKFILE_PATHS)) {
        return `Lockfile '${file.path}' was ${file.status} — verify dependency resolution is correct`;
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
      if (matchesAny(file.path, GENERATED_PATHS)) {
        return `Generated file '${file.path}' was manually ${file.status} — regenerate instead of editing by hand`;
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
      if (matchesAny(file.path, PUBLIC_ROUTE_PATHS)) {
        return `Public route file '${file.path}' was ${file.status}`;
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
      if (matchesAny(file.path, PRICING_COPY_PATHS)) {
        return `Pricing or marketing file '${file.path}' was ${file.status}`;
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
          `Added dependency: ${name}`
        )
      );
    },
  },
];

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export function applyRules(
  files: ChangedFile[],
  rules: Rule[] = DEFAULT_RULES
): RiskFinding[] {
  const findings: RiskFinding[] = [];

  for (const file of files) {
    for (const rule of rules) {
      const result = rule.match(file);
      if (result === null) continue;

      if (Array.isArray(result)) {
        findings.push(...result);
      } else {
        findings.push(finding(rule, file, result));
      }
    }
  }

  return findings;
}

export { extractAddedDependencies };
