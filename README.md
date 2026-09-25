# agent-pr-reviewer-lite

`agent-pr-reviewer-lite` checks a git diff and flags files that deserve human review before merge. It is deterministic, local-first, and intentionally conservative.

It is part of a suite of tools that help maintainers make repositories safer and easier for AI coding agents to work in. These tools are deterministic, local-first, open source, and designed to complement human review — not replace it.

## What it is

`agent-pr-reviewer-lite` scans the git diff between two refs and applies a fixed set of deterministic rules to flag files in risk-sensitive areas: authentication, billing, database migrations, security policies, CI pipelines, AI agent permissions and instructions, committed keys, lockfiles, generated files, and more. It also reads the added lines to catch skipped or focused tests, lint suppressions, new dependencies, and agent commands that run shell without asking. Each finding lists the file's CODEOWNERS owners, read from the base branch.

It answers one question:

> **Did this PR touch areas that deserve human review before merge?**

It outputs human-readable **text** and **Markdown** reports, machine-readable **JSON**, **SARIF**, and **JUnit XML**, and **GitHub annotations** on the pull request. It exits non-zero when the risk level meets or exceeds a configurable threshold, making it suitable as a CI gate.

What it is **not**:

- It is **not** an AI code reviewer.
- It does **not** understand code semantics — it matches file paths and added lines against fixed patterns.
- It does **not** replace human review.
- It is **conservative by design**: it would rather flag a safe file than miss a risky one.

It is useful **before or alongside** an LLM reviewer — a fast, reproducible, offline pre-screen that runs before the expensive part.

## Why it exists

Agent-generated PRs often touch many files across many directories. A deterministic pre-screen that flags auth, billing, and migration files in milliseconds means your LLM review budget — or your engineers' attention — goes only where it is genuinely needed.

| Concern              | LLM reviewer       | agent-pr-reviewer-lite               |
| -------------------- | ------------------ | ------------------------------------ |
| Reproducibility      | Non-deterministic  | Identical output for identical input |
| Cost                 | Per-token API cost | Zero                                 |
| Offline / air-gapped | No                 | Yes                                  |
| Auditability         | Hard to verify     | Rules are readable TypeScript        |
| Speed                | Seconds to minutes | ~100 ms                              |
| Customization        | Prompt engineering | JSON config file                     |

## Quick start

`agent-pr-reviewer-lite` is not published to npm yet, and nobody owns that name there. Until it is published by this project, do not install it from the npm registry: a package someone else registers under that name would run in your CI. Install a release from GitHub instead (the CLI is built during install). Tags can be moved, so in CI you can pin the tag's commit SHA for an exact, reviewed version:

```bash
# Add to a project
pnpm add -D github:alipajand/agent-pr-reviewer-lite#v1.0.0
# or globally:
npm install -g github:alipajand/agent-pr-reviewer-lite#v1.0.0

# Run against main
agent-pr-reviewer-lite --base main

# Fail CI if risk is high or above (the default)
agent-pr-reviewer-lite --base origin/main --head HEAD --fail-on high
```

No config file is required. The tool runs with sensible defaults.

### CLI options

```
Usage: agent-pr-reviewer-lite [options]

Options:
  --config <path>      Path to config JSON file (default: auto-discover)
  --base <ref>         Base git ref to compare from (default: main)
  --head <ref>         Head git ref to compare to (default: HEAD)
  --config-ref <ref>   Read the config file from this git ref (e.g. origin/main)
  --format <format>    Output format: text | json | markdown | sarif | junit | github (default: text)
  --fail-on <level>    Exit 1 when risk >= level: low | medium | high (default: high)
  --preset <name>      Built-in preset: nextjs-saas | supabase | stripe (repeatable)
  --changed-files <path>
                       Read newline-delimited changed files from a file or stdin (-)
  --explain            Include deterministic rule-trigger details in human-readable output
  --github-comment     Post/update a PR comment with the markdown report
  --github-comment-author <login>
                       Only update an earlier report comment by this login
                       (default: any bot account, e.g. github-actions[bot])
  -V, --version        Print version
  -h, --help           Show help
```

**Precedence**: CLI flags > config file values > built-in defaults.

## Example output

### Text (default)

```
Agent PR Risk: High
Changed risky areas:
- migrations/0012_add_tenant_rls.sql — Database migration changed
- pnpm-lock.yaml — Lockfile changed
- src/auth/session.ts — Auth / session file touched
Required human review:
- auth/session
- database migration
- lockfile/dependency resolution
CI result:
- fail-on: high
- result: failed
```

### JSON

```json
{
  "risk": "high",
  "findingCount": 3,
  "findings": [
    {
      "id": "migration-changed",
      "label": "Database migration changed",
      "severity": "high",
      "file": "migrations/0012_add_tenant_rls.sql",
      "reason": "Migration file 'migrations/0012_add_tenant_rls.sql' was added",
      "requiredReview": "database migration"
    },
    {
      "id": "package-lock-changed",
      "label": "Lockfile changed",
      "severity": "medium",
      "file": "pnpm-lock.yaml",
      "reason": "Lockfile 'pnpm-lock.yaml' was added — verify dependency resolution is correct",
      "requiredReview": "lockfile/dependency resolution"
    },
    {
      "id": "auth-file-touched",
      "label": "Auth / session file touched",
      "severity": "high",
      "file": "src/auth/session.ts",
      "reason": "File 'src/auth/session.ts' touches authentication or session logic",
      "requiredReview": "auth/session"
    }
  ],
  "requiredHumanReview": [
    "auth/session",
    "database migration",
    "lockfile/dependency resolution"
  ],
  "ci": {
    "failOn": "high",
    "result": "failed"
  }
}
```

### Markdown

```markdown
## Agent PR Risk: High

### Changed risky areas

| Severity | File                                 | Finding                     | Required review                |
| -------- | ------------------------------------ | --------------------------- | ------------------------------ |
| High     | `migrations/0012_add_tenant_rls.sql` | Database migration changed  | database migration             |
| Medium   | `pnpm-lock.yaml`                     | Lockfile changed            | lockfile/dependency resolution |
| High     | `src/auth/session.ts`                | Auth / session file touched | auth/session                   |

### Required human review

- auth/session
- database migration
- lockfile/dependency resolution

### CI result

- fail-on: high
- result: failed
```

### SARIF

Use `--format sarif` to emit SARIF 2.1.0 for code-scanning style consumers such as GitHub Advanced Security uploads or other SARIF-aware tooling.

### JUnit

Use `--format junit` to emit one test case per finding. Findings at or above `--fail-on` are serialized as failing test cases so CI dashboards can render them like tests.

## Configuration

`agent-pr-reviewer-lite` is zero-config by default. Create `agent-pr-reviewer-lite.config.json` in your project root to customize behaviour (or pass `--config <path>`).

```json
{
  "base": "main",
  "failOn": "high",
  "presets": ["supabase", "stripe"],
  "ignore": ["docs/**", "*.md", "**/*.test.ts"],
  "extraRiskPaths": [
    {
      "id": "renewals-changed",
      "label": "Renewals workflow changed",
      "severity": "high",
      "patterns": ["apps/api/**/renewals/**", "apps/web/app/**/renewals/**"],
      "requiredReview": "renewals workflow"
    }
  ]
}
```

### Config fields

| Field            | Type                                                   | Description                                                                                                                    |
| ---------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `base`           | `string`                                               | Default base ref (overridden by `--base`)                                                                                      |
| `failOn`         | `"low" \| "medium" \| "high"`                          | Default fail threshold (overridden by `--fail-on`)                                                                             |
| `presets`        | `PresetName[]`                                         | Built-in rule packs layered on top of the defaults                                                                             |
| `ignore`         | `string[]`                                             | Glob patterns — matched files are skipped by all rules                                                                         |
| `extraRiskPaths` | `ExtraRiskPath[]`                                      | Custom path rules appended to the built-in set                                                                                 |
| `rules`          | `Record<string, "off" \| "low" \| "medium" \| "high">` | Turn a rule off or change its severity. Unknown IDs are rejected; `reviewer-config-changed` cannot be turned off or downgraded |

### Built-in presets

Preset rules are deterministic high-severity path rules that layer on top of the built-ins:

| Preset        | Adds rules for                                                                     |
| ------------- | ---------------------------------------------------------------------------------- |
| `nextjs-saas` | `app/api`, `pages/api`, server actions, `next.config.*`                            |
| `supabase`    | `supabase/functions/**`, `supabase/config.toml`, common Supabase integration paths |
| `stripe`      | webhook handlers and common Stripe integration paths                               |

You can repeat `--preset` or combine multiple entries in config.

### `extraRiskPaths` fields

| Field            | Required | Description                                              |
| ---------------- | -------- | -------------------------------------------------------- |
| `id`             | yes      | Unique rule identifier (appears in JSON output)          |
| `label`          | yes      | Short human-readable label                               |
| `severity`       | yes      | `"low"`, `"medium"`, or `"high"`                         |
| `patterns`       | yes      | Glob patterns — file matches any one to trigger the rule |
| `requiredReview` | no       | Label shown in the "Required human review" section       |

### Glob pattern syntax

| Syntax        | Matches                                                   |
| ------------- | --------------------------------------------------------- |
| `*`           | Any characters except `/`                                 |
| `**`          | Any characters including `/` (zero or more path segments) |
| `**/foo`      | `foo` at any directory depth                              |
| `docs/**`     | Everything under `docs/`                                  |
| `src/**/*.ts` | All `.ts` files under `src/`                              |

Patterns are matched in linear time, so a hostile pattern cannot stall a CI run.

### Example: LedgerGuard preset

A strict preset config for a financial application (contract ingestion, tenant isolation, renewals, commitment ledger, currency normalization, and billing) is available in [`examples/ledgerguard/`](examples/ledgerguard/). It defines seven high-severity custom rules that go beyond the built-ins.

```bash
cp examples/ledgerguard/agent-pr-reviewer-lite.config.json .
```

See [`examples/ledgerguard/README.md`](examples/ledgerguard/README.md) for full documentation.

## GitHub Actions

Add `agent-pr-reviewer-lite` as a PR check:

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
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
          persist-credentials: false

      - uses: pnpm/action-setup@v6

      - uses: actions/setup-node@v7
        with:
          node-version: "22"

      - run: pnpm install --frozen-lockfile

      - name: Run agent-pr-reviewer-lite
        run: |
          pnpm agent-pr-reviewer-lite \
            --base "origin/${BASE_REF}" \
            --head HEAD \
            --format markdown \
            --fail-on high \
            --github-comment
        env:
          BASE_REF: ${{ github.base_ref }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Always pass `--base` explicitly in CI. By default the config file is read from the pull request's own checkout, so its values are controlled by the PR author. Pass `--config-ref "origin/${BASE_REF}"` to read the config from the base branch instead; then a pull request cannot change the rules, ignore patterns, or presets that review it.

`--format github` prints workflow annotations, so each finding appears inline on the changed file in the pull request.

`fetch-depth: 0` is required so the base branch history is available for the diff. `--github-comment` posts (or updates) the markdown report as a PR comment; it is silently skipped when `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, or `GITHUB_EVENT_PATH` are absent — safe for local runs.

For PR comment internals, JSON output for downstream steps, and stricter thresholds, see **[docs/github-actions.md](docs/github-actions.md)**.

### Exit codes

| Code | Meaning                                                                                  |
| ---- | ---------------------------------------------------------------------------------------- |
| `0`  | Risk is below the `--fail-on` threshold, or no risky files found                         |
| `1`  | Risk meets or exceeds the `--fail-on` threshold                                          |
| `2`  | Tool error: git command failed, config file is invalid JSON, or unexpected runtime error |

The `--github-comment` flag never changes the exit code. A comment-posting failure prints a warning to stderr but the process exits according to `--fail-on` only.

## Built-in rules

All built-in rules are deterministic regex pattern matches. No ML, no heuristics.

| ID                               | Severity   | Trigger                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth-file-touched`              | **High**   | Files matching `/auth/`, `session.ts`, `middleware.ts`, `jwt`, Clerk, NextAuth                                                                                                                                                                                                                                                                                                   |
| `billing-file-touched`           | **High**   | Files matching `/billing/`, `/stripe/`, `checkout`, `subscription`, `invoice`, `payment`                                                                                                                                                                                                                                                                                         |
| `security-file-touched`          | **High**   | Files matching `/security/`, `rls`, `policy`, `permissions`, `access-control`, `rate-limit`, `csrf`, `cors`                                                                                                                                                                                                                                                                      |
| `migration-changed`              | **High**   | Files under `supabase/migrations/`, `migrations/`, `prisma/migrations/`, or `*.sql` in a migrations dir                                                                                                                                                                                                                                                                          |
| `test-deleted`                   | **High**   | Deleted files matching `*.test.*`, `*.spec.*`, `__tests__/`, `tests/`, or `test/`, or tests moved out of those                                                                                                                                                                                                                                                                   |
| `reviewer-config-changed`        | **High**   | `agent-pr-reviewer-lite.config.json` (any depth) or the file passed to `--config`; `ignore` cannot hide it                                                                                                                                                                                                                                                                       |
| `ci-workflow-changed`            | **High**   | `.github/workflows/*.yml`, `.github/actions/**`, `action.yml`, GitLab CI, CircleCI, Jenkinsfile, Azure Pipelines, Buildkite, Travis, Drone                                                                                                                                                                                                                                       |
| `agent-permissions-changed`      | **High**   | `.claude/settings.json`, `.claude/hooks/**`, `.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`, `.gemini/settings.json`, `.codex/config.toml`. The reason names risky keys the change adds: `bypassPermissions`, unrestricted `Bash`, hooks, status line, credential helpers, endpoint or proxy overrides, `enableAllProjectMcpServers`, `additionalDirectories`, `curl \| sh` |
| `agent-local-settings-committed` | **High**   | Added or modified `.claude/settings.local.json` or `CLAUDE.local.md` (any depth): personal files that override the shared settings and instructions                                                                                                                                                                                                                              |
| `agent-auto-run-added`           | **High**   | Added lines in Claude commands or skills with `` !`cmd` `` or ` ```! ` (run on invocation without a prompt) or `allowed-tools` that approve any `Bash`, and subagents with `permissionMode: bypassPermissions`                                                                                                                                                                   |
| `codeowners-changed`             | **High**   | `CODEOWNERS` (root, `.github/`, `docs/`), `.github/settings.yml`                                                                                                                                                                                                                                                                                                                 |
| `secret-material-committed`      | **High**   | Added or modified `*.pem`, `*.key`, `*.p12`, `*.jks`, private SSH keys, `credentials.*`, `secrets.*`, service-account JSON, `.netrc`, `*.tfstate`                                                                                                                                                                                                                                |
| `test-skipped`                   | **High**   | Added lines in test files that skip or focus tests: `it.skip`, `.only`, `xit`, `fdescribe`, `test.fixme`, `pytest.mark.skip`/`xfail`, `t.Skip`, `@Disabled`, `#[ignore]`. Conditional skips (`skipIf`, `runIf`, `skipif`) are reported too, including platform-only ones                                                                                                         |
| `env-var-file-changed`           | **Medium** | `.env`, `.env.local`, `.env.production`, `.env.development`, `.env.example`                                                                                                                                                                                                                                                                                                      |
| `package-lock-changed`           | **Medium** | `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`                                                                                                                                                                                                                                                                                                                  |
| `generated-file-edited`          | **Medium** | Paths containing `generated/`, `__generated__/`, `.generated.ts`, `.gen.ts`                                                                                                                                                                                                                                                                                                      |
| `public-route-changed`           | **Medium** | Next.js `app/**/page.tsx`, `app/**/layout.tsx`, `pages/**` (src/ variants too)                                                                                                                                                                                                                                                                                                   |
| `pricing-copy-changed`           | **Medium** | Files matching `pricing`, `plans`, `checkout`, `subscription`, `billing`, `marketing`, `landing`                                                                                                                                                                                                                                                                                 |
| `agent-instructions-changed`     | **Medium** | `AGENTS.md`/`CLAUDE.md`/`GEMINI.md` (any depth), Cursor rules, Copilot instructions and prompts, Claude commands/agents/skills/rules/output styles, Windsurf, Cline, Roo, Kiro, Junie, Goose, Continue rules                                                                                                                                                                     |
| `infra-changed`                  | **Medium** | Terraform, Kubernetes/Helm/Kustomize, Dockerfiles, Compose files, Vercel/Netlify/Fly/Render/Railway/Firebase/Wrangler/CDK/Pulumi config                                                                                                                                                                                                                                          |
| `package-manager-config-changed` | **Medium** | `.npmrc`, `.yarnrc(.yml)`, `.pnpmfile.cjs`, `pnpm-workspace.yaml`, `bunfig.toml`, `pip.conf`, `.pypirc`                                                                                                                                                                                                                                                                          |
| `git-hooks-changed`              | **Medium** | `.husky/**`, `lefthook.yml`, `.pre-commit-config.yaml`, `.githooks/**`, lint-staged config                                                                                                                                                                                                                                                                                       |
| `lint-suppression-added`         | **Medium** | Added `eslint-disable`, `@ts-ignore`/`@ts-expect-error`, `# noqa`, `# type: ignore`, `nolint`, `rubocop:disable`, `@SuppressWarnings`, `#[allow(...)]`, or coverage ignores in non-test files                                                                                                                                                                                    |
| `dependency-added`               | **Medium** | New entries in `dependencies`, `devDependencies`, `peerDependencies`, or `optionalDependencies` in `package.json`                                                                                                                                                                                                                                                                |

Custom rules added via `extraRiskPaths` appear after the built-ins at whatever severity you configure.

Renamed files are checked against both the new and the previous path, so moving `src/auth/tokens.ts` to `scratch/tokens.ts` is still flagged. An `ignore` pattern hides a rename only when it matches both paths.

## Code owners

When the repository has a `CODEOWNERS` file (`.github/CODEOWNERS`, `CODEOWNERS`, or `docs/CODEOWNERS`), each finding gets the owners of its file, and the required-review list names them:

```
Required human review:
- auth/session (owners: @org/security)
```

JSON findings get an `owners` array. The file is read from the `--base` ref, because that is the copy GitHub enforces; a pull request that edits `CODEOWNERS` cannot change who reviews it. Patterns follow GitHub's rules, and the last matching line wins.

## Security

The tool is designed to run on pull requests you do not control:

- **No option injection.** `--base` and `--head` (including `base` from the config file) must be git refs. Values that start with `-` are rejected, and git receives `--end-of-options` before the refs.
- **Exact paths.** Changed files are read with `git diff -z`, so paths with spaces, quotes, or non-ASCII characters are matched exactly instead of in git's quoted form.
- **A PR cannot hide its own review.** Changes to the reviewer config are always reported as `reviewer-config-changed` (high); `ignore` patterns cannot suppress them and `rules` cannot turn them off. With `--config-ref`, the config in effect comes from a trusted ref, so a PR's edits to it have no effect on its own review. Renames are evaluated on both paths.
- **Safe output.** File names and dependency names are rendered as inline code in Markdown, HTML is escaped, and control characters are removed from text output, so a file name cannot inject `::workflow-commands::` or terminal escapes.
- **PR comments.** Only a comment that starts with the report marker and was written by a bot account (or by `--github-comment-author`) is updated. Pasting the marker into your own comment does not make the bot overwrite it.
- **Bounded work.** Glob patterns match in linear time, and config files must be regular files under 1 MiB.

See [SECURITY.md](SECURITY.md) to report a vulnerability.

## False positives

This tool is intentionally conservative. A false positive is cheaper than silently merging a risky agent-generated change. Use `ignore` rules for known safe paths.

## Limitations

- **No semantic understanding.** The tool matches file paths and `package.json` content against regexes. It does not read or understand the code inside those files.
- **No cross-file analysis.** Each file is evaluated independently. The tool cannot reason about how changes in one file affect another.
- **Content inspection is line-based.** Rules such as `test-skipped`, `lint-suppression-added`, and `dependency-added` read added lines from one `git diff -U0` of the whole change. They do not parse code, and dependency detection covers `package.json` files only (not `requirements.txt`, `Gemfile`, etc.). With `--changed-files` there is no diff content, so only path rules run.
- **`--changed-files` is path-only unless name-status is provided.** Plain newline-delimited paths are treated as `modified`, so rules that depend on delete/rename semantics need `git diff --name-status` style input.
- **Git is required unless `--changed-files` is used.** The default mode shells out to `git diff --name-status`. The repository must be a git repo with the base ref reachable (fetch it in CI with `git fetch origin <base>`).
- **No history.** The tool inspects only the diff between `--base` and `--head`. It has no awareness of past changes or PR history.
- **Path-based rules can produce false positives.** A file named `billing-utils-test.ts` will trigger `billing-file-touched` even if it is a test helper with no payment logic. Use `ignore` patterns to suppress known false positives.

## Recent additions

- `--preset nextjs-saas`, `--preset supabase`, and `--preset stripe`
- `--format sarif`
- `--format junit`
- `--explain`
- `--changed-files <path>`
- `reviewer-config-changed` rule and rename-aware rule evaluation
- `--github-comment-author <login>`
- `--config-ref <ref>`, per-rule `rules` settings, and `--format github`

## Related tools

- [agent-readiness-kit](https://github.com/alipajand/agent-readiness-kit) — audits whether a repository is ready for AI coding agents.
- [agent-context-doctor](https://github.com/alipajand/agent-context-doctor) — checks whether agent instruction files are specific, safe, and usable.
- [agent-readiness-action](https://github.com/alipajand/agent-readiness-action) — runs readiness audits in GitHub Actions.

## Development

```bash
# Run tests (no network, no LLM)
pnpm test

# Build TypeScript
pnpm build

# Typecheck / lint
pnpm typecheck

# Run in dev mode without building
pnpm dev -- --base main --format text
```

### Project structure

```
src/
  cli.ts              # CLI entry point (commander)
  index.ts            # Public API exports
  git.ts              # git diff --name-status -z parser
  glob.ts             # Linear-time glob matcher
  rules.ts            # Deterministic risk rules
  risk.ts             # Report builder and fail logic
  config.ts           # Config file loader and ignore matching
  github.ts           # GitHub PR comment (fetch-based, no Octokit)
  types.ts            # Shared TypeScript types
  reporters/
    text.ts           # Human-readable text output
    junit.ts          # JUnit XML output
    sarif.ts          # SARIF 2.1.0 output
    json.ts           # Machine-readable JSON output
    markdown.ts       # GitHub Markdown output
tests/                # Vitest unit + edge-case tests
docs/
  github-actions.md   # GitHub Actions integration guide
  ARCHITECTURE.md     # System boundaries and data flow
  MODULES.md          # Module-by-module responsibilities
  SCORING.md          # How the overall risk level is computed
examples/
  ledgerguard/        # Strict preset config for financial applications
```

## License

MIT
