@AGENTS.md

## Claude Code

AGENTS.md above is the source of truth. This file only adds what is specific to Claude Code.

- `/verify` runs the required checks and reports the results.
- `/review-branch` runs agent-pr-reviewer-lite against the current branch and explains the findings.
- The `security-reviewer` subagent reviews a diff against the safety rules in AGENTS.md
  (no shell injection, refs validated, untrusted config and paths, escaped output, comment
  ownership). Use it before finishing changes to `src/git.ts`, `src/github.ts`,
  `src/config.ts`, `src/glob.ts`, `src/codeowners.ts`, or `src/reporters/`.
- The `adding-a-risk-rule` skill walks through adding a rule end to end.
- `.claude/settings.json` allows the project's pnpm scripts and read-only git commands,
  asks before pushing, and denies reading `.env` files and running network or destructive
  commands. Personal overrides go in `.claude/settings.local.json`, which is not committed.
