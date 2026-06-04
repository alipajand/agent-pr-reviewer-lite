# agent-pr-reviewer-lite

A deterministic, local/CI tool that reviews git diffs for agent-generated PR risk — **no LLM, no external API**.

## Overview

`agent-pr-reviewer-lite` analyzes the files changed between two git refs and applies a set of deterministic rules to flag risk areas: sensitive files, CI/CD changes, infrastructure-as-code, dependency bumps, auth logic, and database migrations.

It outputs a human-readable **text** report or a machine-readable **JSON** report, and can exit with a non-zero code when the risk level meets or exceeds a configurable threshold — making it suitable as a CI gate.

## Installation

```bash
pnpm install
```

## Usage

```bash
# Compare current branch against main (text output)
pnpm agent-pr-reviewer-lite --base main --format text

# Compare current branch against main (JSON output)
pnpm agent-pr-reviewer-lite --base main --format json

# Fail CI if risk is medium or higher
pnpm agent-pr-reviewer-lite --base main --fail-on medium

# Compare arbitrary refs
pnpm agent-pr-reviewer-lite --base origin/main --head feature/my-branch --format text
```

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--config <path>` | auto-discover | Path to config file |
| `--base <ref>` | `main` | Base git ref to compare from |
| `--head <ref>` | `HEAD` | Head git ref to compare to |
| `--format <text\|json>` | `text` | Output format |
| `--fail-on <low\|medium\|high>` | `high` | Exit code 1 when overall risk ≥ this level |

CLI flags always override config file values.

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success — risk is below the `--fail-on` threshold |
| `1` | Risk at or above the `--fail-on` threshold |
| `2` | Unexpected error (e.g., git command failed) |

## Risk Rules

| ID | Severity | Trigger |
|----|----------|---------|
| `sensitive-file` | high | `.env*`, `secrets/`, `credentials/`, private key paths |
| `ci-cd-change` | high | `.github/`, `.gitlab-ci`, Jenkinsfile, etc. |
| `infra-change` | high | `.tf`, `terraform/`, `k8s/`, `helm/`, YAML files |
| `auth-change` | high | Files with `auth`, `login`, `oauth`, `jwt`, `rbac` in path |
| `database-migration` | high | SQL files, `migration/`, `schema.`, `db/` directories |
| `dependency-change` | medium | `package.json`, lock files, `requirements.txt`, etc. |
| `bulk-deletion` | medium | Any deleted file |

## CI / GitHub Actions

Add `agent-pr-reviewer-lite` as a PR check in one step. See **[docs/github-actions.md](docs/github-actions.md)** for the full workflow, fail-threshold options, JSON output, and config-file usage.

Quick example:

```yaml
- name: Run agent-pr-reviewer-lite
  run: |
    pnpm agent-pr-reviewer-lite \
      --base origin/${{ github.base_ref }} \
      --head HEAD \
      --fail-on high
```

## Configuration

`agent-pr-reviewer-lite` is zero-config by default. To customize behaviour, create `agent-pr-reviewer-lite.config.json` in your project root (or pass `--config <path>`).

```json
{
  "base": "main",
  "failOn": "high",
  "ignore": [
    "docs/**",
    "README.md"
  ],
  "extraRiskPaths": [
    {
      "id": "ledgerguard-renewals",
      "label": "Renewals workflow changed",
      "severity": "high",
      "patterns": [
        "apps/web/app/**/renewals/**",
        "apps/api/**/renewals/**"
      ],
      "requiredReview": "renewals workflow"
    }
  ]
}
```

### Config fields

| Field | Type | Description |
|-------|------|-------------|
| `base` | `string` | Default base ref (overridden by `--base`) |
| `failOn` | `"low" \| "medium" \| "high"` | Default fail threshold (overridden by `--fail-on`) |
| `ignore` | `string[]` | Glob patterns — matched files are excluded from all rules |
| `extraRiskPaths` | `ExtraRiskPath[]` | Custom path-based rules appended to the built-in set |

### `extraRiskPaths` entries

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Unique rule identifier (appears in JSON output) |
| `label` | yes | Short human-readable label |
| `severity` | yes | `"low"`, `"medium"`, or `"high"` |
| `patterns` | yes | Glob patterns — file matches any one to trigger the rule |
| `requiredReview` | no | Label shown in the "Required human review" section |

### Glob pattern syntax

| Syntax | Matches |
|--------|---------|
| `*` | Any characters except `/` |
| `**` | Any characters including `/` (zero or more path segments) |
| `**/foo` | `foo` at any directory depth |
| `docs/**` | Everything under `docs/` |
| `src/**/*.ts` | All `.ts` files under `src/` |

## Development

```bash
# Run tests
pnpm test

# Build TypeScript
pnpm build

# Run in dev mode (tsx, no build needed)
pnpm dev -- --base main --format text
```

## Project Structure

```
src/
  cli.ts          # CLI entry point (commander)
  index.ts        # Public API exports
  git.ts          # git diff --name-status parser
  rules.ts        # Deterministic risk rules
  risk.ts         # Report builder & fail logic
  types.ts        # Shared TypeScript types
  reporters/
    text.ts       # Human-readable text output
    json.ts       # Machine-readable JSON output
tests/
  rules.test.ts   # Vitest unit tests
```

## License

MIT
