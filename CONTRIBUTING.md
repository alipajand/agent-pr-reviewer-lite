# Contributing

## Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9

## Setup

```bash
git clone https://github.com/alipajand/agent-pr-reviewer-lite.git
cd agent-pr-reviewer-lite
pnpm install
```

## Development workflow

```bash
# Run the CLI without building
pnpm dev -- --base main --format text

# Run tests
pnpm test

# Watch mode
pnpm test:watch

# Typecheck
pnpm typecheck

# Build
pnpm build
```

## Before submitting a PR

1. `pnpm typecheck` — must pass with no errors
2. `pnpm test` — all tests must pass
3. `pnpm build` — must compile cleanly

## Adding a new risk rule

See `docs/prompts/ADD_RULE_PROMPT.md` for the full checklist.

Summary:

1. Add regex patterns and a rule entry in `src/rules.ts`
2. Add tests in `tests/rules.test.ts` (positive, negative, edge cases)
3. Update the rule table in `README.md`
4. Run the full test suite

## Commit style

Lowercase conventional commits:

```
feat: add new rule for CI config changes
fix: correct regex for renamed files
docs: update github-actions integration guide
test: add edge case for null-byte rejection
```

No emoji. Summary ≤ 72 characters. Body explains _why_, not _what_.

## What requires human review

- Any change to `src/github.ts`
- New external dependencies
- Breaking changes to CLI flags, exit codes, or JSON output schema
- npm publish configuration

## Reporting issues

Open an issue at https://github.com/alipajand/agent-pr-reviewer-lite/issues.
Include: OS, Node version, pnpm version, command run, and full output.
