# agent-pr-reviewer-lite

A deterministic, local/CI tool that reviews git diffs for agent-generated PR risk — **no LLM, no external API**.

---

## What it is

`agent-pr-reviewer-lite` scans the git diff between two refs and applies a fixed set of deterministic rules to flag files in risk-sensitive areas: authentication, billing, database migrations, security policies, lockfiles, generated files, and more.

It answers one question:

> **Did this PR touch areas that deserve human review before merge?**

It outputs a human-readable **text** report, a machine-readable **JSON** report, or a **Markdown** table suitable for GitHub PR comments. It exits non-zero when the risk level meets or exceeds a configurable threshold, making it suitable as a CI gate.

---

## What it is not

`agent-pr-reviewer-lite` is **not** an AI code reviewer. It does not judge code quality, correctness, architecture, or style. It does not understand what the code does. It only looks at which files changed and whether those files match known risk patterns.

If you need semantic understanding of code, use an LLM-powered reviewer. This tool is the complement: a fast, reproducible, offline pre-screen that runs before the expensive part.

---

## Why deterministic instead of LLM?

| Concern | LLM reviewer | agent-pr-reviewer-lite |
|---------|-------------|------------------------|
| Reproducibility | Non-deterministic | Identical output for identical input |
| Cost | Per-token API cost | Zero |
| Offline / air-gapped | No | Yes |
| Auditability | Hard to verify | Rules are readable TypeScript |
| Speed | Seconds to minutes | ~100 ms |
| Customization | Prompt engineering | JSON config file |

Agent-generated PRs often touch many files across many directories. A deterministic pre-screen that flags auth, billing, and migration files in milliseconds means your LLM review budget — or your engineers' attention — goes only where it is genuinely needed.

---

## Quick start

```bash
# 1. Install (or add to a project)
pnpm add -D agent-pr-reviewer-lite
# or globally:
pnpm add -g agent-pr-reviewer-lite

# 2. Run against main
agent-pr-reviewer-lite --base main

# 3. Fail CI if risk is high or above (the default)
agent-pr-reviewer-lite --base origin/main --head HEAD --fail-on high
```

No config file is required. The tool runs with sensible defaults.

---

## CLI options

```
Usage: agent-pr-reviewer-lite [options]

Options:
  --config <path>      Path to config JSON file (default: auto-discover)
  --base <ref>         Base git ref to compare from (default: main)
  --head <ref>         Head git ref to compare to (default: HEAD)
  --format <format>    Output format: text | json | markdown (default: text)
  --fail-on <level>    Exit 1 when risk >= level: low | medium | high (default: high)
  --github-comment     Post/update a PR comment with the markdown report
  -V, --version        Print version
  -h, --help           Show help
```

**Precedence**: CLI flags > config file values > built-in defaults.

---

## Example output

### Text (default)

```
Agent PR Risk: High

Changed risky areas:
- src/auth/session.ts  — Auth / session file touched
- migrations/0012_add_tenant_rls.sql  — Database migration changed
- pnpm-lock.yaml  — Lockfile changed

Required human review:
  auth/session, database migration, lockfile/dependency resolution

CI result: FAILED (fail-on: high)
```

### JSON

```json
{
  "schemaVersion": "1",
  "base": "main",
  "head": "HEAD",
  "overallRisk": "high",
  "findingCount": 3,
  "findings": [
    {
      "id": "auth-file-touched",
      "label": "Auth / session file touched",
      "severity": "high",
      "file": "src/auth/session.ts",
      "reason": "File 'src/auth/session.ts' touches authentication or session logic",
      "requiredReview": "auth/session"
    }
  ],
  "requiredReviews": ["auth/session", "database migration", "lockfile/dependency resolution"],
  "result": "failed",
  "failOn": "high"
}
```

### Markdown

```markdown
## Agent PR Risk: High

### Changed risky areas

| Severity | File | Finding | Required review |
|---|---|---|---|
| High | `src/auth/session.ts` | Auth / session file touched | auth/session |
| High | `migrations/0012_add_tenant_rls.sql` | Database migration changed | database migration |
| Medium | `pnpm-lock.yaml` | Lockfile changed | lockfile/dependency resolution |

### Required human review

auth/session · database migration · lockfile/dependency resolution

---
**CI result: FAILED** (fail-on: high)
```

---

## Config file

`agent-pr-reviewer-lite` is zero-config by default. Create `agent-pr-reviewer-lite.config.json` in your project root to customize behaviour (or pass `--config <path>`).

```json
{
  "base": "main",
  "failOn": "high",
  "ignore": [
    "docs/**",
    "*.md",
    "**/*.test.ts"
  ],
  "extraRiskPaths": [
    {
      "id": "renewals-changed",
      "label": "Renewals workflow changed",
      "severity": "high",
      "patterns": [
        "apps/api/**/renewals/**",
        "apps/web/app/**/renewals/**"
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
| `ignore` | `string[]` | Glob patterns — matched files are skipped by all rules |
| `extraRiskPaths` | `ExtraRiskPath[]` | Custom path rules appended to the built-in set |

### `extraRiskPaths` fields

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

---

## GitHub Actions

Add `agent-pr-reviewer-lite` as a PR check. See **[docs/github-actions.md](docs/github-actions.md)** for the full workflow, permissions, and PR comment setup.

Quick example:

```yaml
name: Agent PR Risk Check

on:
  pull_request:

permissions:
  contents: read
  pull-requests: write

jobs:
  risk-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: "20"

      - uses: pnpm/action-setup@v4

      - run: pnpm install

      - run: git fetch origin ${{ github.base_ref }}

      - name: Run agent-pr-reviewer-lite
        run: |
          pnpm agent-pr-reviewer-lite \
            --base origin/${{ github.base_ref }} \
            --head HEAD \
            --format markdown \
            --fail-on high \
            --github-comment
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

`--github-comment` posts (or updates) the markdown report as a PR comment. It is silently skipped when `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, or `GITHUB_EVENT_PATH` are absent — safe for local runs.

---

## LedgerGuard example

A strict preset config for LedgerGuard (contract ingestion, tenant isolation, renewals, commitment ledger, currency normalization, and billing) is available in [`examples/ledgerguard/`](examples/ledgerguard/). It defines seven high-severity custom rules that go beyond the built-ins.

Copy the config to your repo root and the tool picks it up automatically:

```bash
cp examples/ledgerguard/agent-pr-reviewer-lite.config.json .
```

See [`examples/ledgerguard/README.md`](examples/ledgerguard/README.md) for full documentation.

---

## Rule list

All built-in rules are deterministic regex pattern matches. No ML, no heuristics.

| ID | Severity | Trigger |
|----|----------|---------|
| `auth-file-touched` | **High** | Files matching `/auth/`, `session.ts`, `middleware.ts`, `jwt`, Clerk, NextAuth |
| `billing-file-touched` | **High** | Files matching `/billing/`, `/stripe/`, `checkout`, `subscription`, `invoice`, `payment` |
| `security-file-touched` | **High** | Files matching `/security/`, `rls`, `policy`, `permissions`, `access-control`, `rate-limit`, `csrf`, `cors` |
| `migration-changed` | **High** | Files under `supabase/migrations/`, `migrations/`, `prisma/migrations/`, or `*.sql` in a migrations dir |
| `test-deleted` | **High** | Deleted files matching `*.test.*`, `*.spec.*`, `__tests__/`, `tests/`, or `test/` |
| `env-var-file-changed` | **Medium** | `.env`, `.env.local`, `.env.production`, `.env.development`, `.env.example` |
| `package-lock-changed` | **Medium** | `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb` |
| `generated-file-edited` | **Medium** | Paths containing `generated/`, `__generated__/`, `.generated.ts`, `.gen.ts` |
| `public-route-changed` | **Medium** | Next.js `app/**/page.tsx`, `app/**/layout.tsx`, `pages/**` (src/ variants too) |
| `pricing-copy-changed` | **Medium** | Files matching `pricing`, `plans`, `checkout`, `subscription`, `billing`, `marketing`, `landing` |
| `dependency-added` | **Medium** | New entries in `dependencies`, `devDependencies`, `peerDependencies`, or `optionalDependencies` in `package.json` |

Custom rules added via `extraRiskPaths` appear after the built-ins at whatever severity you configure.

---

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Risk is below the `--fail-on` threshold, or no risky files found |
| `1` | Risk meets or exceeds the `--fail-on` threshold |
| `2` | Tool error: git command failed, config file is invalid JSON, or unexpected runtime error |

The `--github-comment` flag never changes the exit code. A comment-posting failure prints a warning to stderr but the process exits according to `--fail-on` only.

---

## Limitations

- **No semantic understanding.** The tool matches file paths and `package.json` content against regexes. It does not read or understand the code inside those files.
- **No cross-file analysis.** Each file is evaluated independently. The tool cannot reason about how changes in one file affect another.
- **package.json only for content inspection.** Dependency detection reads added lines from `package.json`. It does not inspect lockfiles or other manifests (`requirements.txt`, `Gemfile`, etc.).
- **Git required.** The tool shells out to `git diff --name-status`. The repository must be a git repo with the base ref reachable (fetch it in CI with `git fetch origin <base>`).
- **No history.** The tool inspects only the diff between `--base` and `--head`. It has no awareness of past changes or PR history.
- **Path-based rules can produce false positives.** A file named `billing-utils-test.ts` will trigger `billing-file-touched` even if it is a test helper with no payment logic. Use `ignore` patterns to suppress known false positives.

---

## Development

```bash
# Run tests (266 tests, no network, no LLM)
pnpm test

# Build TypeScript
pnpm build

# Run in dev mode without building
pnpm dev -- --base main --format text
```

### Project structure

```
src/
  cli.ts              # CLI entry point (commander)
  index.ts            # Public API exports
  git.ts              # git diff --name-status parser
  rules.ts            # Deterministic risk rules
  risk.ts             # Report builder and fail logic
  config.ts           # Config file loader and glob matcher
  github.ts           # GitHub PR comment (fetch-based, no Octokit)
  types.ts            # Shared TypeScript types
  reporters/
    text.ts           # Human-readable text output
    json.ts           # Machine-readable JSON output
    markdown.ts       # GitHub Markdown output
tests/
  rules.test.ts       # Rule unit tests
  reporters.test.ts   # Text and JSON reporter tests
  config.test.ts      # Config loader and glob matcher tests
  edge-cases.test.ts  # Rule edge-case and parseNameStatus tests
  markdown-reporter.test.ts  # Markdown reporter tests
  github.test.ts      # GitHub comment helper tests
docs/
  github-actions.md   # GitHub Actions integration guide
examples/
  ledgerguard/        # Strict preset config for financial applications
```

---

## License

MIT
