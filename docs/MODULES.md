# Module layout

## Source modules (`src/`)

| File                    | Exports                                                                      | Responsibility                                     |
| ----------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------- |
| `cli.ts`                | binary entry                                                                 | CLI flag parsing, orchestration, exit codes        |
| `index.ts`              | public API                                                                   | Re-exports types + functions for library consumers |
| `types.ts`              | types, constants                                                             | All shared TypeScript types; `RISK_LEVEL_ORDER`    |
| `rules.ts`              | `DEFAULT_RULES`, `applyRules`, `buildExtraRules`, `extractAddedDependencies` | Deterministic risk rules engine                    |
| `risk.ts`               | `buildReport`, `shouldFail`                                                  | Combines files + rules into a `ReviewReport`       |
| `git.ts`                | `getChangedFiles`, `parseNameStatus`                                         | Shells out to `git diff --name-status`             |
| `config.ts`             | `loadConfig`, `globToRegex`                                                  | Config auto-discovery and glob-to-regex conversion |
| `github.ts`             | `postOrUpdateComment`                                                        | Posts or updates a PR comment via fetch            |
| `reporters/text.ts`     | `renderText`                                                                 | Human-readable text output                         |
| `reporters/json.ts`     | `renderJson`                                                                 | Machine-readable JSON output (`JsonReport` shape)  |
| `reporters/markdown.ts` | `renderMarkdown`                                                             | GitHub Markdown table output                       |

## Tests (`tests/`)

| File                             | What it covers                                                    |
| -------------------------------- | ----------------------------------------------------------------- |
| `rules.test.ts`                  | One test per rule: match, non-match, edge cases                   |
| `reporters.test.ts`              | Text and JSON reporter output shape and content                   |
| `markdown-reporter.test.ts`      | Markdown reporter table structure and edge cases                  |
| `config.test.ts`                 | Config loading, auto-discovery, glob-to-regex conversion          |
| `edge-cases.test.ts`             | `parseNameStatus` edge cases, renamed files, unknown status codes |
| `github.test.ts`                 | GitHub comment helper with mocked fetch                           |
| `git-no-shell-injection.test.ts` | Null-byte and shell-metacharacter rejection                       |
| `e2e.test.ts`                    | End-to-end CLI integration tests                                  |

## Docs (`docs/`)

| File                         | Audience                                                    |
| ---------------------------- | ----------------------------------------------------------- |
| `ARCHITECTURE.md`            | Developers — system boundaries, data flow, extension points |
| `MODULES.md`                 | Agents / developers — module map and test index             |
| `SCORING.md`                 | Developers — how the overall risk level is computed         |
| `github-actions.md`          | DevOps — full GitHub Actions workflow setup                 |
| `prompts/ADD_RULE_PROMPT.md` | AI agents — add a new risk rule task template               |

## Examples (`examples/`)

| Directory      | Purpose                                                                |
| -------------- | ---------------------------------------------------------------------- |
| `ledgerguard/` | Strict preset config for financial SaaS (7 high-severity custom rules) |

## Risk levels

| Level    | Value | Typical triggers                                                             |
| -------- | ----- | ---------------------------------------------------------------------------- |
| `low`    | 0     | (reserved)                                                                   |
| `medium` | 1     | Env files, lockfiles, generated files, public routes, pricing copy, new deps |
| `high`   | 2     | Auth, billing, security, migrations, deleted tests                           |

## Exit codes

| Code | Meaning                                                           |
| ---- | ----------------------------------------------------------------- |
| `0`  | Risk below `--fail-on` threshold, or no findings                  |
| `1`  | Risk meets or exceeds `--fail-on` threshold                       |
| `2`  | Tool error: git failure, invalid config, unexpected runtime error |

## Config file shape

`agent-pr-reviewer-lite.config.json` (optional, auto-discovered):

```json
{
  "base": "main",
  "failOn": "high",
  "ignore": ["docs/**", "*.md"],
  "extraRiskPaths": [
    {
      "id": "my-rule",
      "label": "My custom rule",
      "severity": "high",
      "patterns": ["src/sensitive/**"],
      "requiredReview": "sensitive area"
    }
  ]
}
```
