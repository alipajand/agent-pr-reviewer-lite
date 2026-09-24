# Risk scoring

## Overview

`agent-pr-reviewer-lite` computes a single **overall risk level** (`low`, `medium`, or `high`) for a PR by applying deterministic rules to the list of changed files. No weighted scoring — the overall risk is the **maximum severity** across all findings.

## Risk levels

| Level    | Numeric order | Meaning                                                                 |
| -------- | ------------- | ----------------------------------------------------------------------- |
| `low`    | 0             | No risky changes detected (or no findings)                              |
| `medium` | 1             | Changes in areas that deserve a second look                             |
| `high`   | 2             | Changes in safety-critical areas that require human review before merge |

The order is defined in `src/types.ts`:

```ts
export const RISK_LEVEL_ORDER: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
};
```

## Overall risk calculation

```
overallRisk = max(severity of all findings)
```

If there are no findings, `overallRisk = "low"`.

Implemented in `src/risk.ts`:

```ts
function computeOverallRisk(findings: RiskFinding[]): RiskLevel {
  if (findings.length === 0) return "low";
  let max = RISK_LEVEL_ORDER["low"];
  for (const f of findings) {
    const level = RISK_LEVEL_ORDER[f.severity];
    if (level > max) max = level;
  }
  // ...
}
```

## Fail threshold

The `--fail-on` flag sets the threshold for CI failure (default: `high`).

```
exit 1  when  overallRisk >= failOn
exit 0  when  overallRisk < failOn
```

Implemented as:

```ts
export function shouldFail(overallRisk: RiskLevel, failOn: RiskLevel): boolean {
  return RISK_LEVEL_ORDER[overallRisk] >= RISK_LEVEL_ORDER[failOn];
}
```

## Built-in rule severities

| Rule ID                          | Severity | Rationale                                                    |
| -------------------------------- | -------- | ------------------------------------------------------------ |
| `auth-file-touched`              | **high** | Auth bugs can lead to account takeover                       |
| `billing-file-touched`           | **high** | Billing bugs can cause financial loss                        |
| `security-file-touched`          | **high** | RLS / CORS / CSRF changes can expose data                    |
| `migration-changed`              | **high** | DB migrations are irreversible in production                 |
| `test-deleted`                   | **high** | Deleting tests reduces confidence in future changes          |
| `reviewer-config-changed`        | **high** | A PR could weaken its own review (`ignore`, `base`)          |
| `ci-workflow-changed`            | **high** | Pipelines hold secrets and decide which checks run           |
| `agent-permissions-changed`      | **high** | Controls which tools and MCP servers agents use unprompted   |
| `agent-local-settings-committed` | **high** | Personal settings override the shared ones for everyone      |
| `agent-auto-run-added`           | **high** | Commands that run shell or skip prompts act without asking   |
| `codeowners-changed`             | **high** | Decides who must approve changes                             |
| `secret-material-committed`      | **high** | Keys, credentials, or infra state must not be committed      |
| `test-skipped`                   | **high** | Skipping or focusing tests hides failures from CI            |
| `env-var-file-changed`           | medium   | Env file changes can expose or break secrets                 |
| `package-lock-changed`           | medium   | Lockfile changes can introduce supply chain issues           |
| `generated-file-edited`          | medium   | Manual edits to generated files drift from source of truth   |
| `public-route-changed`           | medium   | Route changes can break SEO, redirects, or user-facing flows |
| `pricing-copy-changed`           | medium   | Pricing copy changes affect revenue and user expectations    |
| `dependency-added`               | medium   | New deps introduce maintenance and security surface          |
| `agent-instructions-changed`     | medium   | Agents follow these files on every task                      |
| `infra-changed`                  | medium   | Deployment and infrastructure changes affect production      |
| `package-manager-config-changed` | medium   | Registries and overrides decide what gets installed          |
| `git-hooks-changed`              | medium   | Hooks run on every developer machine                         |
| `lint-suppression-added`         | medium   | Suppressions hide the errors that checks exist to catch      |

## Custom rule scoring

Custom rules added via `extraRiskPaths` use whatever severity you configure (`low`, `medium`, or `high`). They are treated identically to built-in rules when computing the overall risk.

## JSON output

The `--format json` output includes:

```json
{
  "risk": "high",
  "findingCount": 3,
  "findings": [...],
  "requiredHumanReview": ["auth/session", "database migration"],
  "ci": {
    "failOn": "high",
    "result": "failed"
  }
}
```

The `risk` field is the overall risk level. `ci.result` is `"failed"` if `risk >= failOn`, otherwise `"passed"`.
