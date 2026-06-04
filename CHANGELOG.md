# Changelog

All notable changes to this project are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project uses [Semantic Versioning](https://semver.org/).

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
