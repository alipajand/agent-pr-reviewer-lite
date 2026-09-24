import { compileGlob } from "./glob.js";
import type {
  ChangedFile,
  ChangeStatus,
  ExtraRiskPath,
  RiskFinding,
  RiskLevel,
  PresetName,
  RuleSetting,
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

/**
 * A rule that fires when a changed file (or, for renames, its previous path)
 * matches one of `patterns`. `statuses` limits it to some change types.
 */
function pathRule(spec: {
  id: string;
  label: string;
  severity: RiskLevel;
  requiredReview: string;
  patterns: RegExp[];
  reason: (file: ChangedFile) => string;
  statuses?: ChangeStatus[];
}): Rule {
  return {
    id: spec.id,
    label: spec.label,
    severity: spec.severity,
    requiredReview: spec.requiredReview,
    match(file) {
      if (spec.statuses && !spec.statuses.includes(file.status)) return null;
      const matched = firstMatchingPattern(file.path, spec.patterns);
      if (!matched) return null;
      return {
        reason: spec.reason(file),
        explain: `Matched built-in path pattern ${matched.toString()}`,
      };
    },
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

/** Matches the auto-discovered config file anywhere in the tree. */
export const REVIEWER_CONFIG_PATH =
  /(?:^|\/)agent-pr-reviewer-lite\.config\.json$/;

const PRICING_COPY_PATHS = [
  /pricing/i,
  /\bplans?\b/i,
  /checkout/i,
  /subscription/i,
  /billing/i,
  /marketing/i,
  /landing/i,
];

const CI_PATHS = [
  /^\.github\/workflows\/[^/]+\.ya?ml$/,
  /^\.github\/actions\//,
  /(?:^|\/)action\.ya?ml$/,
  /^\.gitlab-ci\.yml$/,
  /^\.gitlab\/ci\//,
  /^\.circleci\//,
  /(?:^|\/)Jenkinsfile$/,
  /^azure-pipelines\.ya?ml$/,
  /^\.azure-pipelines\//,
  /^bitbucket-pipelines\.yml$/,
  /^\.buildkite\//,
  /^\.travis\.yml$/,
  /^\.drone\.ya?ml$/,
];

// Settings that change what an AI agent may do without asking, and hook
// scripts those settings run automatically.
const AGENT_PERMISSION_PATHS = [
  /^\.claude\/settings\.json$/,
  /^\.claude\/hooks\//,
  /(?:^|\/)\.mcp\.json$/,
  /^\.cursor\/mcp\.json$/,
  /^\.vscode\/mcp\.json$/,
  /^\.gemini\/settings\.json$/,
  /^\.roo\/mcp\.json$/,
  /^\.codex\/config\.toml$/,
];

// Standing instructions an AI agent reads on every task.
const AGENT_INSTRUCTION_PATHS = [
  /(?:^|\/)(?:AGENTS|AGENT|CLAUDE|GEMINI)\.md$/,
  /^\.cursorrules$/,
  /^\.cursor\/rules\//,
  /^\.github\/copilot-instructions\.md$/,
  /^\.github\/(?:instructions|prompts|chatmodes|agents)\//,
  /^\.claude\/(?:CLAUDE\.md$|commands\/|agents\/|skills\/|rules\/|output-styles\/)/,
  /^\.windsurfrules$/,
  /^\.windsurf\/rules\//,
  /^\.clinerules(?:\/|$)/,
  /^\.roo\/rules/,
  /^\.kiro\/steering\//,
  /^\.junie\/guidelines\.md$/,
  /^\.goosehints$/,
  /^\.continue\/rules\//,
];

// Personal Claude Code files. They take precedence over the shared ones and
// are meant to stay on one machine.
const AGENT_LOCAL_PATHS = [
  /(?:^|\/)\.claude\/settings\.local\.json$/,
  /(?:^|\/)CLAUDE\.local\.md$/,
];

// Commands, skills, and subagents that run or approve things on their own.
const AGENT_COMMAND_PATHS = [/^\.claude\/(?:commands|skills)\/.+\.md$/];
const AGENT_SUBAGENT_PATHS = [/^\.claude\/agents\/.+\.md$/];

const AGENT_AUTO_RUN_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /!`[^`\n]+`/, label: "runs a shell command when invoked" },
  { pattern: /^\s*```!\s*$/, label: "runs a shell block when invoked" },
  {
    pattern:
      /^allowed-tools\s*:.*(?:^|[\s,[:"'])Bash(?:\((?:\*|:\*)?\))?(?=$|[\s,\]"'])/,
    label: "pre-approves any shell command",
  },
  {
    pattern: /^permissionMode\s*:\s*["']?bypassPermissions/,
    label: "skips every permission prompt",
  },
];

// Keys whose addition to agent settings deserves a closer look.
const RISKY_AGENT_SETTINGS: Array<{ pattern: RegExp; label: string }> = [
  {
    pattern: /"defaultMode"\s*:\s*"bypassPermissions"/,
    label: "bypassPermissions",
  },
  { pattern: /"Bash(?:\((?:\*|:\*)?\))?"/, label: "unrestricted Bash" },
  { pattern: /"hooks"\s*:/, label: "hooks" },
  { pattern: /"statusLine"\s*:/, label: "a status line command" },
  {
    pattern:
      /"(?:apiKeyHelper|awsCredentialExport|awsAuthRefresh|gcpAuthRefresh|otelHeadersHelper|headersHelper)"\s*:/,
    label: "a credential helper",
  },
  {
    pattern: /ANTHROPIC_(?:BEDROCK_|VERTEX_)?BASE_URL|"(?:HTTPS?|ALL)_PROXY"/i,
    label: "an API endpoint or proxy override",
  },
  {
    pattern: /"enableAllProjectMcpServers"\s*:\s*true/,
    label: "auto-approved MCP servers",
  },
  { pattern: /"additionalDirectories"\s*:/, label: "extra directories" },
];

function riskyAgentSettings(addedLines: string[] | undefined): string[] {
  const labels = new Set<string>();
  for (const line of addedLines ?? []) {
    for (const { pattern, label } of RISKY_AGENT_SETTINGS) {
      if (pattern.test(line)) labels.add(label);
    }
    // Two separate tests instead of one pattern keep this linear on long lines.
    if (
      /\b(?:curl|wget)\b/.test(line) &&
      /\|\s*(?:sudo\s+)?(?:ba|z)?sh\b/.test(line)
    ) {
      labels.add("a command that pipes a download into a shell");
    }
  }
  return [...labels];
}

const CODEOWNERS_PATHS = [
  /^(?:\.github\/|docs\/)?CODEOWNERS$/,
  /^\.github\/settings\.ya?ml$/,
];

const SECRET_MATERIAL_PATHS = [
  /\.(?:pem|key|p12|pfx|jks|keystore|ppk)$/i,
  /(?:^|\/)id_(?:rsa|dsa|ecdsa|ed25519)$/,
  /(?:^|\/)\.?(?:credentials|secrets)(?:\.[\w-]+)?\.(?:json|ya?ml|toml|ini)$/i,
  /(?:^|\/)[\w.-]*service[-_]?account[\w.-]*\.json$/i,
  /(?:^|\/)\.(?:netrc|pgpass|htpasswd)$/,
  /\.tfstate(?:\.backup)?$/,
];

const INFRA_PATHS = [
  /\.tf$/,
  /\.tfvars$/,
  /(?:^|\/)(?:terraform|k8s|kubernetes|helm|charts|kustomize)\//,
  /(?:^|\/)Dockerfile(?:\.[\w-]+)?$/,
  /(?:^|\/)(?:docker-)?compose[\w.-]*\.ya?ml$/,
  /(?:^|\/)(?:serverless\.ya?ml|vercel\.json|netlify\.toml|fly\.toml|render\.ya?ml|railway\.(?:json|toml)|Procfile|cloudbuild\.ya?ml|firebase\.json|wrangler\.toml|cdk\.json)$/,
  /(?:^|\/)Pulumi(?:\.[\w-]+)?\.ya?ml$/,
];

const PACKAGE_MANAGER_CONFIG_PATHS = [
  /(?:^|\/)\.npmrc$/,
  /(?:^|\/)\.yarnrc(?:\.yml)?$/,
  /(?:^|\/)\.pnpmfile\.cjs$/,
  /(?:^|\/)pnpm-workspace\.yaml$/,
  /(?:^|\/)bunfig\.toml$/,
  /(?:^|\/)(?:pip\.conf|\.pypirc)$/,
];

const GIT_HOOK_PATHS = [
  /^\.husky\//,
  /(?:^|\/)lefthook(?:-local)?\.ya?ml$/,
  /(?:^|\/)\.pre-commit-config\.ya?ml$/,
  /^\.git-?hooks\//,
  /(?:^|\/)\.lintstagedrc/,
  /(?:^|\/)lint-staged\.config\./,
];

// Added lines that skip or focus tests. `.only` counts too: it silently skips
// every other test in the file for most runners. Each pattern must start the
// statement, so test data such as "it.skip('x')" inside a string is ignored.
const TEST_SKIP_PATTERNS = [
  /^\s*(?:it|test|describe|context|suite|bench)\.(?:skip|only|todo|skipIf|runIf)\b/,
  /^\s*(?:xit|xtest|xdescribe|xcontext|fit|fdescribe|fcontext)\s*\(/,
  /^\s*test\.fixme\s*\(/,
  /^\s*@pytest\.mark\.(?:skip|skipif|xfail)\b/,
  /^\s*pytest\.skip\s*\(/,
  /^\s*@unittest\.skip/,
  /^\s*self\.skipTest\s*\(/,
  /^\s*t\.Skip(?:f|Now)?\s*\(/,
  /^\s*@(?:Disabled|Ignore)\b/,
  /^\s*#\[ignore\]/,
];

// Conditional skips whose only condition is the operating system, such as a
// test that needs mkfifo. They keep a test from running where it cannot, not
// from failing where it can, so they are not reported.
const PLATFORM_ONLY_SKIP = [
  /^\s*(?:it|test|describe|context|suite|bench)\.(?:skipIf|runIf)\(\s*(?:process\.platform|os\.platform\(\))\s*[!=]==?\s*["'][\w-]+["']\s*\)/,
  /^\s*@pytest\.mark\.skipif\(\s*(?:sys\.platform|os\.name)\s*[!=]=\s*["'][\w-]+["']\s*[,)]/,
];

// Suppressions in source files. Comment-based ones need the comment marker,
// so documentation or code that merely mentions them does not match.
const SUPPRESSION_PATTERNS = [
  /(?:\/\/|\/\*)\s*eslint-disable/,
  /(?:\/\/|\/\*)\s*@ts-(?:ignore|nocheck|expect-error)\b/,
  /(?:\/\/|\/\*)\s*biome-ignore/,
  /(?:\/\/|\/\*)\s*(?:istanbul|c8|v8)\s+ignore/,
  /\/\/\s*nolint\b/,
  /#\s*noqa\b/,
  /#\s*type:\s*ignore\b/,
  /#\s*pylint:\s*disable/,
  /#\s*rubocop:disable/,
  /^\s*@SuppressWarnings\b/,
  /^\s*#\[allow\(/,
];

const SOURCE_FILE =
  /\.(?:[cm]?[jt]sx?|vue|svelte|astro|py|go|rb|java|kt|kts|scala|rs|swift|php|cs|c|cc|cpp|h|hpp)$/;

function firstMatchingLine(lines: string[], patterns: RegExp[]): string | null {
  return lines.find((line) => patterns.some((p) => p.test(line))) ?? null;
}

function excerpt(line: string): string {
  const trimmed = line.trim().replace(/\s+/g, " ");
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
}

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
      if (file.status === "deleted") {
        const matched = firstMatchingPattern(file.path, TEST_PATHS);
        if (matched) {
          return {
            reason: `Test file '${file.path}' was deleted`,
            explain: `Matched built-in path pattern ${matched.toString()} with deleted status`,
          };
        }
      }
      // Moving a test out of the suite removes it from the run just like a delete.
      if (file.status === "renamed" && file.previousPath) {
        const matched = firstMatchingPattern(file.previousPath, TEST_PATHS);
        if (matched && !matchesAny(file.path, TEST_PATHS)) {
          return {
            reason: `Test file '${file.previousPath}' was moved out of the test suite to '${file.path}'`,
            explain: `Previous path matched built-in path pattern ${matched.toString()}; new path matches no test pattern`,
          };
        }
      }
      return null;
    },
  },

  {
    id: "reviewer-config-changed",
    label: "PR risk reviewer config changed",
    severity: "high",
    requiredReview: "risk review policy",
    match(file) {
      const paths = [file.path, file.previousPath].filter(
        (p): p is string => p !== undefined,
      );
      const matchedPath = paths.find((p) => REVIEWER_CONFIG_PATH.test(p));
      if (matchedPath) {
        return {
          reason: `Reviewer config '${matchedPath}' was ${file.status} — a pull request can use it to weaken its own review (ignore patterns, base ref)`,
          explain: `Matched built-in path pattern ${REVIEWER_CONFIG_PATH.toString()}`,
        };
      }
      return null;
    },
  },

  pathRule({
    id: "ci-workflow-changed",
    label: "CI/CD pipeline changed",
    severity: "high",
    requiredReview: "CI/CD pipeline",
    patterns: CI_PATHS,
    reason: (file) =>
      `CI/CD file '${file.path}' was ${file.status} — pipeline changes can expose secrets or skip required checks`,
  }),

  pathRule({
    id: "agent-permissions-changed",
    label: "AI agent permissions or tools changed",
    severity: "high",
    requiredReview: "agent permissions",
    patterns: AGENT_PERMISSION_PATHS,
    reason: (file) => {
      if (file.path.startsWith(".claude/hooks/")) {
        return `Agent hook script '${file.path}' was ${file.status} — hooks run automatically on agent events, on every contributor's machine`;
      }
      const risky = riskyAgentSettings(file.addedLines);
      const adds = risky.length > 0 ? `; adds ${risky.join(", ")}` : "";
      return `Agent configuration '${file.path}' was ${file.status} — it controls which tools and MCP servers agents may use without asking${adds}`;
    },
  }),

  pathRule({
    id: "agent-local-settings-committed",
    label: "Personal agent settings committed",
    severity: "high",
    requiredReview: "agent permissions",
    patterns: AGENT_LOCAL_PATHS,
    statuses: ["added", "modified", "renamed"],
    reason: (file) =>
      file.path.endsWith(".md")
        ? `'${file.path}' holds one person's Claude Code instructions — committed, it is loaded for everyone and is easy to miss in review`
        : `'${file.path}' holds one person's Claude Code permissions — committed, they override the shared settings for everyone`,
  }),

  {
    id: "agent-auto-run-added",
    label: "Agent command runs or pre-approves commands",
    severity: "high",
    requiredReview: "agent permissions",
    match(file) {
      if (!file.addedLines) return null;
      const isCommand = matchesAny(file.path, AGENT_COMMAND_PATHS);
      if (!isCommand && !matchesAny(file.path, AGENT_SUBAGENT_PATHS))
        return null;
      const patterns = AGENT_AUTO_RUN_PATTERNS.filter(
        ({ label }) => isCommand !== label.startsWith("skips"),
      );
      for (const line of file.addedLines) {
        const hit = patterns.find(({ pattern }) => pattern.test(line));
        if (hit) {
          return {
            reason: `'${file.path}' ${hit.label}, without a permission prompt: ${excerpt(line)}`,
            explain: `Matched an added line against ${hit.pattern.toString()}`,
          };
        }
      }
      return null;
    },
  },

  pathRule({
    id: "codeowners-changed",
    label: "Code ownership or repository settings changed",
    severity: "high",
    requiredReview: "code ownership",
    patterns: CODEOWNERS_PATHS,
    reason: (file) =>
      `'${file.path}' was ${file.status} — it decides who must approve changes`,
  }),

  pathRule({
    id: "secret-material-committed",
    label: "Key or credential file committed",
    severity: "high",
    requiredReview: "secrets",
    patterns: SECRET_MATERIAL_PATHS,
    statuses: ["added", "modified", "renamed"],
    reason: (file) =>
      `'${file.path}' looks like key material, credentials, or infrastructure state — keep it out of the repository`,
  }),

  // --- MEDIUM severity ---

  pathRule({
    id: "agent-instructions-changed",
    label: "AI agent instructions changed",
    severity: "medium",
    requiredReview: "agent instructions",
    patterns: AGENT_INSTRUCTION_PATHS,
    reason: (file) =>
      `Agent instruction file '${file.path}' was ${file.status} — agents follow it on every task`,
  }),

  pathRule({
    id: "infra-changed",
    label: "Infrastructure or deployment config changed",
    severity: "medium",
    requiredReview: "infrastructure",
    patterns: INFRA_PATHS,
    reason: (file) => `Infrastructure file '${file.path}' was ${file.status}`,
  }),

  pathRule({
    id: "package-manager-config-changed",
    label: "Package manager configuration changed",
    severity: "medium",
    requiredReview: "dependency changes",
    patterns: PACKAGE_MANAGER_CONFIG_PATHS,
    reason: (file) =>
      `'${file.path}' was ${file.status} — registries, overrides, and install-script settings decide what code gets installed`,
  }),

  pathRule({
    id: "git-hooks-changed",
    label: "Git hooks changed",
    severity: "medium",
    requiredReview: "git hooks",
    patterns: GIT_HOOK_PATHS,
    reason: (file) =>
      `Git hook config '${file.path}' was ${file.status} — hooks run on every developer machine`,
  }),

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

  // --- Content inspection (added lines) ---

  {
    id: "test-skipped",
    label: "Tests skipped or focused",
    severity: "high",
    requiredReview: "skipped tests",
    match(file) {
      if (!file.addedLines || !matchesAny(file.path, TEST_PATHS)) return null;
      const line = file.addedLines.find(
        (added) =>
          TEST_SKIP_PATTERNS.some((p) => p.test(added)) &&
          !PLATFORM_ONLY_SKIP.some((p) => p.test(added)),
      );
      if (!line) return null;
      return {
        reason: `Test file '${file.path}' adds a skipped or focused test: ${excerpt(line)}`,
        explain:
          "Matched an added line against built-in test skip/focus patterns",
      };
    },
  },

  {
    id: "lint-suppression-added",
    label: "Lint or type check suppressed",
    severity: "medium",
    requiredReview: "lint/type suppressions",
    match(file) {
      if (!file.addedLines || !SOURCE_FILE.test(file.path)) return null;
      if (matchesAny(file.path, TEST_PATHS)) return null;
      const count = file.addedLines.filter((line) =>
        SUPPRESSION_PATTERNS.some((p) => p.test(line)),
      ).length;
      if (count === 0) return null;
      const first =
        firstMatchingLine(file.addedLines, SUPPRESSION_PATTERNS) ?? "";
      return {
        reason: `'${file.path}' adds ${count} lint/type suppression${count === 1 ? "" : "s"}: ${excerpt(first)}`,
        explain: "Matched added lines against built-in suppression patterns",
      };
    },
  },

  // --- MEDIUM severity with content inspection ---

  {
    id: "dependency-added",
    label: "New dependency added",
    severity: "medium",
    requiredReview: "dependency changes",
    match(file) {
      if (
        file.path !== "package.json" &&
        !file.path.endsWith("/package.json")
      ) {
        return null;
      }
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

/**
 * A rename is evaluated against its new path first, then its previous path,
 * so moving `src/auth/session.ts` to an innocuous location is still flagged.
 */
function ruleViews(file: ChangedFile): ChangedFile[] {
  if (
    file.status !== "renamed" ||
    !file.previousPath ||
    file.previousPath === file.path
  ) {
    return [file];
  }
  return [file, { ...file, path: file.previousPath }];
}

export function applyRules(
  files: ChangedFile[],
  rules: Rule[] = DEFAULT_RULES,
): RiskFinding[] {
  const findings: RiskFinding[] = [];

  for (const file of files) {
    for (const rule of rules) {
      for (const view of ruleViews(file)) {
        const result = rule.match(view);
        if (result === null) continue;

        const matches = Array.isArray(result) ? result : [result];
        findings.push(
          ...matches.map((item) => normalizeMatch(rule, view, item)),
        );
        break;
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
    const matchers = erp.patterns.map(compileGlob);
    return {
      id: erp.id,
      label: erp.label,
      severity: erp.severity,
      requiredReview: erp.requiredReview,
      match(file: ChangedFile): RuleMatchDetail | null {
        const matchIndex = matchers.findIndex((matches) => matches(file.path));
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

/** Rules whose settings cannot be changed by config: they protect the review itself. */
const PROTECTED_RULE_IDS = new Set(["reviewer-config-changed"]);

/**
 * Apply `config.rules`: drop rules set to "off" and change the severity of the
 * rest. Unknown rule IDs are rejected so typos do not silently do nothing, and
 * `reviewer-config-changed` cannot be turned off or downgraded.
 */
export function applyRuleSettings(
  rules: Rule[],
  settings: Record<string, RuleSetting> | undefined,
): Rule[] {
  if (!settings) return rules;

  const known = new Set(rules.map((r) => r.id));
  for (const id of Object.keys(settings)) {
    if (!known.has(id)) {
      throw new Error(`config.rules: unknown rule "${id}"`);
    }
    if (PROTECTED_RULE_IDS.has(id) && settings[id] !== "high") {
      throw new Error(
        `config.rules: "${id}" cannot be turned off or downgraded`,
      );
    }
  }

  return rules
    .filter((rule) => settings[rule.id] !== "off")
    .map((rule) => {
      const setting = settings[rule.id];
      return setting && setting !== "off" && setting !== rule.severity
        ? { ...rule, severity: setting }
        : rule;
    });
}
