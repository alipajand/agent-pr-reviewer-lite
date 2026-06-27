# Architecture

## Overview

`agent-pr-reviewer-lite` is a single-responsibility CLI + library. It answers one question:

> Did this PR touch areas that deserve human review before merge?

It does this by diffing two git refs with `git diff --name-status`, applying a fixed set of deterministic path-pattern rules, and emitting a risk report in text, JSON, or Markdown format. There are no LLM calls, no external API calls (except the optional GitHub PR comment), and no filesystem writes.

---

## System boundaries

```
┌──────────────────────────────────────────────────────────┐
│                   agent-pr-reviewer-lite                  │
│                                                          │
│  CLI (cli.ts)                                            │
│    │                                                     │
│    ├── Config loader (config.ts)                         │
│    │     └── auto-discover agent-pr-reviewer-lite.config.json
│    │                                                     │
│    ├── Git layer (git.ts)                                │
│    │     └── execFileSync("git", ["diff", ...])          │
│    │           → ChangedFile[]                           │
│    │                                                     │
│    ├── Rule engine (rules.ts + risk.ts)                  │
│    │     ├── DEFAULT_RULES (11 built-in rules)           │
│    │     ├── buildExtraRules (from config.extraRiskPaths) │
│    │     └── applyRules → RiskFinding[]                  │
│    │           └── buildReport → ReviewReport            │
│    │                                                     │
│    ├── Reporters (reporters/)                            │
│    │     ├── text.ts → stdout                            │
│    │     ├── json.ts → stdout                            │
│    │     └── markdown.ts → stdout                        │
│    │                                                     │
│    └── GitHub comment (github.ts)  [optional]           │
│          └── fetch() → GitHub API /issues/:id/comments  │
│                                                          │
└──────────────────────────────────────────────────────────┘

External boundary:
  git binary (local, no network)
  GitHub API (only when --github-comment is passed and env vars present)
```

---

## Module responsibilities

### `src/cli.ts`

Commander entry point. Parses `--base`, `--head`, `--format`, `--fail-on`, `--config`, `--github-comment`. Calls config loader, git layer, rule engine, and selected reporter. Handles exit codes 0/1/2.

### `src/rules.ts`

Defines `Rule` interface, the 11 `DEFAULT_RULES`, path-pattern sets (regexes), `extractAddedDependencies` for `package.json` content inspection, `applyRules` engine, and `buildExtraRules` for config-driven custom rules.

All rules are pure functions — they take a `ChangedFile` and return `RiskFinding[] | string | null`. No side effects.

### `src/risk.ts`

`buildReport` combines changed files + rules into a `ReviewReport`.
`shouldFail` compares overall risk against `--fail-on` threshold using `RISK_LEVEL_ORDER`.

### `src/git.ts`

`getChangedFiles` shells out to `git diff --name-status`. Uses `execFileSync` with an argument array to prevent shell injection. Validates inputs for null bytes. For `package.json`, also fetches added lines for content inspection.

### `src/config.ts`

Auto-discovers `agent-pr-reviewer-lite.config.json` by walking up from `cwd`. Parses and validates the JSON shape. Provides `globToRegex` to convert config glob patterns to RegExp objects.

### `src/github.ts`

Posts or updates a PR comment using `fetch`. Reads `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, and `GITHUB_EVENT_PATH` from the environment. Silently skips when any are absent. No Octokit dependency.

### `src/types.ts`

Single source of truth for all shared TypeScript types (`ChangedFile`, `RiskFinding`, `ReviewReport`, `Config`, `JsonReport`, etc.) and the `RISK_LEVEL_ORDER` severity map.

### `src/reporters/`

Three reporter functions, each accepting `(report: ReviewReport, opts: RenderOptions) => string`:

- `text.ts` — human-readable terminal output
- `json.ts` — machine-readable JSON (stable schema, `JsonReport` type)
- `markdown.ts` — GitHub Markdown table suitable for PR comments

---

## Data flow

```
git diff --name-status base...head
  → raw lines
  → parseNameStatus()       (git.ts)
  → ChangedFile[]

ChangedFile[] + rules
  → applyRules()             (rules.ts)
  → RiskFinding[]

RiskFinding[]
  → buildReport()            (risk.ts)
  → ReviewReport

ReviewReport + RenderOptions
  → reporter(report, opts)   (reporters/*.ts)
  → string → stdout

shouldFail(overallRisk, failOn)
  → exit code 0 or 1
```

---

## Risk levels and rules

| Level    | Meaning                                                                      |
| -------- | ---------------------------------------------------------------------------- |
| `high`   | Auth, billing, security, migrations, deleted tests                           |
| `medium` | Env files, lockfiles, generated files, public routes, pricing copy, new deps |
| `low`    | (reserved for future rules)                                                  |

Severity order: `low` (0) < `medium` (1) < `high` (2), stored in `RISK_LEVEL_ORDER`.

Overall risk = max severity across all findings.

---

## Configuration

Zero-config by default. Optional `agent-pr-reviewer-lite.config.json` supports:

| Field            | Purpose                            |
| ---------------- | ---------------------------------- |
| `base`           | Default base ref                   |
| `failOn`         | Default fail threshold             |
| `ignore`         | Glob patterns to skip              |
| `extraRiskPaths` | Custom rules appended to built-ins |

CLI flags always override config file values.

---

## Extension points

- **Add a new rule** — add an entry to `DEFAULT_RULES` in `src/rules.ts` with a `match` function, then add tests in `tests/rules.test.ts`.
- **Add a new reporter** — add `src/reporters/<format>.ts`, wire it in `src/cli.ts`, and extend the `OutputFormat` type.
- **Add a new config field** — extend the `Config` type in `src/types.ts`, update `src/config.ts` validation.
- **Custom rules at runtime** — use `extraRiskPaths` in the config JSON or call `buildExtraRules` from the library API.

---

## Security notes

- `git` is invoked with `execFileSync` and an argument array. Shell metacharacters in refs are inert.
- Null bytes in `--base` or `--head` are rejected before reaching git.
- `GITHUB_TOKEN` is read from the environment and never printed or logged.
- The tool never writes to the filesystem.
- The tool never makes network calls unless `--github-comment` is passed and all three required environment variables are present.

---

## Testing strategy

- `tests/rules.test.ts` — unit tests per rule (match, non-match, edge cases)
- `tests/reporters.test.ts` — text and JSON reporter output shape
- `tests/markdown-reporter.test.ts` — Markdown reporter
- `tests/config.test.ts` — config loading and glob-to-regex
- `tests/edge-cases.test.ts` — `parseNameStatus` edge cases, rule boundary conditions
- `tests/github.test.ts` — GitHub comment helper (mocked fetch)
- `tests/git-no-shell-injection.test.ts` — null byte and metacharacter rejection
- `tests/e2e.test.ts` — end-to-end CLI integration

All tests are offline and deterministic. No real git repos or network calls.
