# Agent instructions

## Project overview

**agent-pr-reviewer-lite** is a TypeScript Node.js CLI and library that reviews git diffs for agent-generated PR risk. It is deterministic, fully offline, and makes no external API calls, no LLM calls, and no telemetry. It reads a `git diff --name-status` output, applies a fixed set of rules, and emits a text, JSON, or Markdown risk report.

Published as the `agent-pr-reviewer-lite` binary. Also importable as a library via the `index.ts` public API.

## Architecture boundaries

Read `docs/ARCHITECTURE.md` before large changes. Respect module boundaries:

| Module                      | Responsibility                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `src/cli.ts`                | Commander CLI entry point — parses flags, loads config, calls core, selects reporter |
| `src/rules.ts`              | Deterministic risk rules — `DEFAULT_RULES`, `applyRules`, `buildExtraRules`          |
| `src/risk.ts`               | `buildReport` orchestrator — combines files + rules into a `ReviewReport`            |
| `src/git.ts`                | `getChangedFiles` — shells out to `git diff --name-status` (no shell injection)      |
| `src/config.ts`             | Config file auto-discovery, JSON parsing, Zod-free validation, `globToRegex`         |
| `src/github.ts`             | `postOrUpdateComment` — posts a PR comment via `fetch` (no Octokit)                  |
| `src/types.ts`              | All shared TypeScript types and the `RISK_LEVEL_ORDER` constant                      |
| `src/index.ts`              | Public API surface — re-exports types and functions for library consumers            |
| `src/reporters/text.ts`     | Human-readable text report                                                           |
| `src/reporters/json.ts`     | Machine-readable JSON report                                                         |
| `src/reporters/markdown.ts` | GitHub Markdown table report                                                         |
| `tests/*`                   | Vitest coverage — unit, integration, edge-cases, and reporter tests                  |

## Agent-editable areas

- `src/rules.ts` — add, modify, or remove risk rules
- `src/reporters/` — change output formatting
- `src/config.ts` — config loading logic
- `tests/` — add or update test coverage
- `docs/` — documentation and prompt assets
- `examples/` — example configs

## Human review required

- Any change to `src/github.ts` (network calls, token handling)
- Any new external dependency in `dependencies` or `devDependencies`
- Changes to exit-code semantics or public CLI flag names/behavior
- Changes to the JSON output schema (breaking change for downstream consumers)
- npm publish configuration (`files`, `bin`, `main`, `exports` in `package.json`)

## Commands

```bash
# Development — run CLI without building
pnpm dev -- --base main --format text

# Build TypeScript to dist/
pnpm build

# Typecheck only (no emit)
pnpm typecheck

# Run all tests (deterministic, no network)
pnpm test

# Watch mode
pnpm test:watch

# Lint
pnpm lint

# Format check
pnpm format:check

# Run risk check against current repo (main → HEAD)
pnpm pr:risk
```

## Testing expectations

- `pnpm test` must pass before finishing any task.
- Every rule needs: a positive match case, a non-match case, and at least one edge case.
- Every new public function in `src/` needs at least one test.
- Tests must be isolated: no shared mutable state, no real git operations (mock or use fixtures).
- Do not disable or skip tests without explicit approval.

## Rules and scoring

Risk levels: `low` < `medium` < `high`

A finding is emitted when a changed file's path matches a rule's pattern. The overall risk is the maximum severity across all findings.

`--fail-on` controls the exit-code threshold (default: `high`). Exit codes:

- `0` — risk is below threshold, or no findings
- `1` — risk meets or exceeds threshold
- `2` — tool error (git failure, invalid config, unexpected runtime error)

## Safety boundaries

- **No shell injection.** `git` is called via `execFileSync` with an array of arguments — never a shell string. Null-byte validation is applied to all ref inputs.
- **No secrets.** `GITHUB_TOKEN` is read from the environment and never logged or stored.
- **No filesystem writes.** The tool only reads the git diff and writes to stdout/stderr.
- **No network except `--github-comment`.** The GitHub comment feature is the only network path. It is silently skipped when environment variables (`GITHUB_TOKEN`, `GITHUB_REPOSITORY`, `GITHUB_EVENT_PATH`) are absent — safe for local runs.

## Commit style

Lowercase conventional commits: `feat:`, `fix:`, `improve:`, `docs:`, `test:`, `refactor:`, `chore:`.
No emoji. Summary ≤ 72 chars. Body explains why, not what.

## Final report format

When completing a task, report:

1. Summary of changes
2. Files created or modified
3. Commands run (install, build, test, lint)
4. Test results
5. Known limitations or follow-ups
