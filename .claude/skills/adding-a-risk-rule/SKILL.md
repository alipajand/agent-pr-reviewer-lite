---
name: adding-a-risk-rule
description: Add a new built-in risk rule to agent-pr-reviewer-lite end to end, including tests, docs, and a dogfood run. Use when asked to flag a new kind of risky change in pull requests.
---

# Adding a risk rule

1. **Pick the kind of rule.** Path-only rules use `pathRule({...})` in `src/rules.ts` with a
   pattern set. Content rules read `file.addedLines`; anchor patterns so string literals and
   documentation that merely mention the pattern do not match.
2. **Choose severity and review label.** High blocks the default `--fail-on high`, so reserve it
   for changes that need a human decision (auth, billing, CI, secrets, agent permissions).
3. **Test it** in `tests/rules.test.ts`: at least one positive match, one non-match, and one edge
   case (renames, deleted files, or near-miss paths). See `docs/prompts/ADD_RULE_PROMPT.md`.
4. **Dogfood it**: `pnpm build && node dist/cli.js --base main --head HEAD --explain` on this
   branch, and on another repository if possible. Fix false positives before finishing.
5. **Document it**: the rules table in `README.md`, `docs/SCORING.md`, and `CHANGELOG.md`.
6. Run `/verify`.
