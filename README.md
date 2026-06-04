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
| `--base <ref>` | `main` | Base git ref to compare from |
| `--head <ref>` | `HEAD` | Head git ref to compare to |
| `--format <text\|json>` | `text` | Output format |
| `--fail-on <low\|medium\|high>` | `high` | Exit code 1 when overall risk ≥ this level |

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
