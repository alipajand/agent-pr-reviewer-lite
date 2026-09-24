# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.x     | ✓ Current |

`agent-pr-reviewer-lite` requires Node.js 22.13 or later.

## Reporting a Vulnerability

**Do not open a public GitHub issue for undisclosed security vulnerabilities.**

Report vulnerabilities through [GitHub Security Advisories](https://github.com/alipajand/agent-pr-reviewer-lite/security/advisories/new). Include a description, steps to reproduce, the impact, and any suggested fix. You will receive a response within 7 days.

## Threat model

The tool is built to run in CI on pull requests you do not control. Everything that comes from the repository under review is treated as untrusted: the config file, file names, and diff content.

- **Git is never given attacker-controlled options.** Refs that start with `-` or contain control characters are rejected, and refs are passed after `--end-of-options`. Git runs via `execFileSync` with an argument array, never a shell.
- **A pull request cannot weaken its own review.** Changes to the reviewer config are always reported at high severity, `ignore` cannot hide them, and renames are checked against both paths. Always pass `--base` explicitly in CI.
- **Output cannot be hijacked.** Markdown escapes HTML and keeps file and dependency names in inline code. Text output strips control characters, so file names cannot inject terminal escapes or GitHub Actions workflow commands.
- **PR comments.** The only network call is `--github-comment`, which uses `GITHUB_TOKEN` from the environment and never logs it. It only updates a comment that starts with the report marker and was written by a bot account (or `--github-comment-author`).
- **Bounded work.** Glob patterns match in linear time, and config files must be regular files under 1 MiB.

## No telemetry

The tool makes no network calls other than the opt-in `--github-comment` request to `api.github.com`, and collects no telemetry.
