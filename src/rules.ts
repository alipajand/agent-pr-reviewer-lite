import type { ChangedFile, RiskFinding, RiskLevel } from "./types.js";

export type Rule = {
  id: string;
  label: string;
  severity: RiskLevel;
  requiredReview?: string;
  match: (file: ChangedFile) => string | null;
};

const SENSITIVE_PATHS = [
  /^\.env/i,
  /secrets?\//i,
  /credentials?\//i,
  /private[_-]?key/i,
];

const CI_CD_PATHS = [
  /^\.github\//,
  /^\.gitlab-ci/,
  /^\.circleci\//,
  /^Jenkinsfile/,
  /^\.buildkite\//,
  /^\.travis\.yml/,
  /^azure-pipelines\.yml/,
];

const INFRA_PATHS = [
  /\.tf$/,
  /\.tfvars$/,
  /^terraform\//,
  /^infra\//,
  /^infrastructure\//,
  /^deploy\//,
  /^k8s\//,
  /^kubernetes\//,
  /helm\//,
  /\.yaml$|\.yml$/,
];

const DEPENDENCY_FILES = [
  /^package\.json$/,
  /^package-lock\.json$/,
  /^pnpm-lock\.yaml$/,
  /^yarn\.lock$/,
  /^Gemfile(\.lock)?$/,
  /^requirements\.txt$/,
  /^Pipfile(\.lock)?$/,
  /^go\.mod$/,
  /^go\.sum$/,
  /^Cargo\.(toml|lock)$/,
];

const AUTH_PATHS = [
  /auth/i,
  /login/i,
  /oauth/i,
  /jwt/i,
  /token/i,
  /permission/i,
  /rbac/i,
  /acl/i,
];

const MIGRATION_PATHS = [
  /migration/i,
  /migrate/i,
  /schema\./i,
  /\.sql$/,
  /^db\//,
  /^database\//,
];

function matchesAny(path: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(path));
}

export const DEFAULT_RULES: Rule[] = [
  {
    id: "sensitive-file",
    label: "Sensitive file modified",
    severity: "high",
    requiredReview: "Security team",
    match(file) {
      if (matchesAny(file.path, SENSITIVE_PATHS)) {
        return `File '${file.path}' appears to contain sensitive credentials or secrets`;
      }
      return null;
    },
  },
  {
    id: "ci-cd-change",
    label: "CI/CD pipeline modified",
    severity: "high",
    requiredReview: "DevOps / platform team",
    match(file) {
      if (matchesAny(file.path, CI_CD_PATHS)) {
        return `CI/CD configuration '${file.path}' was ${file.status}`;
      }
      return null;
    },
  },
  {
    id: "infra-change",
    label: "Infrastructure-as-code modified",
    severity: "high",
    requiredReview: "Infrastructure team",
    match(file) {
      if (matchesAny(file.path, INFRA_PATHS)) {
        return `Infrastructure file '${file.path}' was ${file.status}`;
      }
      return null;
    },
  },
  {
    id: "dependency-change",
    label: "Dependency manifest modified",
    severity: "medium",
    requiredReview: "Security review for new packages",
    match(file) {
      if (matchesAny(file.path, DEPENDENCY_FILES)) {
        return `Dependency file '${file.path}' was ${file.status} — verify no malicious or unexpected packages were introduced`;
      }
      return null;
    },
  },
  {
    id: "auth-change",
    label: "Authentication / authorization logic modified",
    severity: "high",
    requiredReview: "Security team",
    match(file) {
      if (matchesAny(file.path, AUTH_PATHS)) {
        return `File '${file.path}' touches authentication or authorization logic`;
      }
      return null;
    },
  },
  {
    id: "database-migration",
    label: "Database migration or schema change",
    severity: "high",
    requiredReview: "DBA / backend lead",
    match(file) {
      if (matchesAny(file.path, MIGRATION_PATHS)) {
        return `Database migration or schema file '${file.path}' was ${file.status}`;
      }
      return null;
    },
  },
  {
    id: "bulk-deletion",
    label: "Large number of files deleted",
    severity: "medium",
    match(file) {
      if (file.status === "deleted") {
        return `File '${file.path}' was deleted — verify this is intentional`;
      }
      return null;
    },
  },
];

export function applyRules(
  files: ChangedFile[],
  rules: Rule[] = DEFAULT_RULES
): RiskFinding[] {
  const findings: RiskFinding[] = [];

  for (const file of files) {
    for (const rule of rules) {
      const reason = rule.match(file);
      if (reason !== null) {
        findings.push({
          id: rule.id,
          label: rule.label,
          severity: rule.severity,
          file: file.path,
          reason,
          requiredReview: rule.requiredReview,
        });
      }
    }
  }

  return findings;
}
