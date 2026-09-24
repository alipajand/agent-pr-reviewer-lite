# Changelog

All notable changes to this project are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project uses [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added

- `test-skipped` (high): added lines in test files that skip or focus tests (`it.skip`, `.only`, `xit`, `fdescribe`, `test.fixme`, `pytest.mark.skip`/`xfail`, `t.Skip`, `@Disabled`, `#[ignore]`).
- `lint-suppression-added` (medium): added lint, type-check, or coverage suppressions in non-test files.
- `dependency-added` covers every `package.json` in the change, not only the root one.
- `ci-workflow-changed` (high): GitHub Actions workflows and actions, GitLab CI, CircleCI, Jenkins, Azure Pipelines, Buildkite, Travis, and Drone config.
- `agent-permissions-changed` (high): Claude Code settings, MCP server configs, and Codex config — they decide which tools agents use without asking.
- `agent-instructions-changed` (medium): AGENTS.md/CLAUDE.md/GEMINI.md at any depth and tool-specific rule files (Cursor, Copilot, Claude commands/agents/skills, Windsurf, Cline, Roo, Kiro, Junie, Goose, Continue).
- `codeowners-changed` (high), `secret-material-committed` (high: keys, credentials files, service-account JSON, `.netrc`, Terraform state), `infra-changed` (medium), `package-manager-config-changed` (medium: `.npmrc`, `pnpm-workspace.yaml`, …), and `git-hooks-changed` (medium).
- `reviewer-config-changed` (high): flags changes to `agent-pr-reviewer-lite.config.json` or the `--config` file. `ignore` patterns cannot hide it.
- `test-deleted` also fires when a test file is moved out of the test suite.
- `--github-comment-author <login>` to pick which account's report comment is updated.
- `compileGlob`, `globMatch`, and `parseNameStatusZ` library exports.

### Changed

- Added lines come from a single `git diff -U0` for the whole change instead of one call per inspected file. Header paths are unquoted and prefixes forced, so `core.quotePath` and `diff.noprefix` settings do not affect it. `ChangedFile.addedLines` is now set for every non-deleted text file.
- Renamed files are evaluated against both their new and previous paths. An `ignore` pattern hides a rename only when it matches both.
- Markdown output renders dependency names as inline code.
- Dependabot groups minor/patch updates and also updates GitHub Actions; CI runs on Node 22 and 24 with SHA-pinned actions and a read-only token.
- Removed the stale `package-lock.json`; pnpm is the only package manager.

### Fixed

- The repository's own PR risk workflow ran `pnpm agent-pr-reviewer-lite`, which does not resolve inside this package, so every pull request failed the check. It now builds and runs `dist/cli.js`.
- Existing report comments are found on PRs with more than 30 comments (the API is now paginated), and oversized reports are truncated to fit GitHub's comment limit.

### Security

- `--base`/`--head` values (including `base` from the config file) that start with `-` are rejected, and git gets `--end-of-options`. Previously a config file in the reviewed PR could set `base` to `--output=<path>` and make `git diff` write to an arbitrary file.
- Changed files are read with `git diff -z`. Previously git quoted non-ASCII paths (`"supabase/migrations/\303\274.sql"`), so anchored rules such as `migration-changed` silently missed them.
- Renames no longer bypass path rules, and moving a test out of the suite is no longer a silent way to delete it.
- A pull request can no longer disable its own review by adding `ignore` patterns to the config file.
- Glob matching is linear-time. The previous regex backtracked exponentially: `*a*a*a*a*b` took about 9 seconds on a single 200-character path segment.
- Markdown reports keep file names inside inline code even when they contain backticks, and HTML in dependency names, labels, and review names is escaped. Text output strips control characters so file names cannot start GitHub Actions workflow commands, and JUnit output drops XML-illegal characters.
- Only comments that start with the report marker and were written by a bot (or `--github-comment-author`) are updated. Previously any comment containing the marker could be overwritten with the report.
- Config files must be regular files under 1 MiB.
- Bumped `vitest` to 4.1.11 for the `@vitest/mocker` path-traversal advisory.

---

## [0.1.0] — 2025-01-01

### Added

- Initial release
- 11 deterministic built-in risk rules: `auth-file-touched`, `billing-file-touched`, `security-file-touched`, `migration-changed`, `test-deleted`, `env-var-file-changed`, `package-lock-changed`, `generated-file-edited`, `public-route-changed`, `pricing-copy-changed`, `dependency-added`
- Text, JSON, and Markdown output formats (`--format`)
- Configurable fail threshold (`--fail-on low | medium | high`)
- Config file support (`agent-pr-reviewer-lite.config.json`) with `ignore` patterns and `extraRiskPaths`
- GitHub PR comment integration (`--github-comment`)
- Exit codes: `0` pass, `1` fail, `2` tool error
- Shell injection protection: git called via `execFileSync` with argument array
- LedgerGuard example config (`examples/ledgerguard/`)
- 266 tests, fully offline and deterministic
