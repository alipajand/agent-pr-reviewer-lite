# Add a new risk rule

Use this template when asking an AI agent to add a new deterministic risk rule to `agent-pr-reviewer-lite`.

---

## Task

Add a new risk rule to `src/rules.ts` and corresponding tests in `tests/rules.test.ts`.

## Required information (fill in before handing to agent)

- **Rule ID**: `<kebab-case-id>` (unique, lowercase, no spaces)
- **Label**: `<Short human-readable label>`
- **Severity**: `high` | `medium` | `low`
- **Required review**: `<short label for the review type>` (optional)
- **Pattern description**: describe which file paths should trigger this rule
- **Example matching paths**: list 2–3 example paths that should trigger the rule
- **Example non-matching paths**: list 2–3 example paths that should NOT trigger the rule
- **Special conditions**: e.g. only trigger for `deleted` files, or only for `package.json` content

## Implementation steps

1. Add path-pattern regexes to a `const` near the other pattern sets in `src/rules.ts`
2. Add the rule object to `DEFAULT_RULES` in the correct severity section
3. Run `pnpm test` to confirm existing tests still pass
4. Add tests in `tests/rules.test.ts`:
   - Positive match (at least 2 matching paths)
   - Negative match (at least 2 non-matching paths)
   - Edge cases (partial path, case sensitivity, file status conditions if relevant)
5. Update `docs/MODULES.md` risk levels table if the new rule introduces a new category
6. Update `README.md` rule list table

## Rules to follow

- Rules must be pure: `match(file: ChangedFile): RiskFinding[] | string | null` — no side effects
- Use `matchesAny(file.path, patterns)` for path matching
- Use the `finding(rule, file, reason)` helper to create `RiskFinding` objects
- Do not add network calls, filesystem reads, or randomness
- Cap: rules returning arrays must return `RiskFinding[]`, not mixed types
- Run `pnpm typecheck` and `pnpm test` before finishing

## Forbidden without approval

- Changing existing rule IDs (breaking change for JSON consumers)
- Changing existing rule severity levels (changes CI behavior for existing users)
- Removing existing rules
