# QA audit prompt

Use this template when asking an AI agent to review or test the `agent-pr-reviewer-lite` tool.

---

## Task

You are a QA engineer reviewing the `agent-pr-reviewer-lite` tool. Your goal is to verify that the risk detection rules are correct, complete, and well-tested.

## Scope

Review the following modules:

1. `src/rules.ts` — all 11 built-in rules
2. `src/risk.ts` — `buildReport` and `shouldFail`
3. `src/git.ts` — `getChangedFiles` and `parseNameStatus`
4. `tests/rules.test.ts` — rule coverage

## Checklist

For each built-in rule, verify:

- [ ] The rule has a positive match test (a path that should trigger it)
- [ ] The rule has a negative match test (a path that should not trigger it)
- [ ] The rule has at least one edge case (e.g. case sensitivity, partial path matches, file status conditions)
- [ ] The `severity` is appropriate for the risk area
- [ ] The `requiredReview` label is human-readable

For the rule engine:
- [ ] `applyRules` returns an empty array when no rules match
- [ ] `applyRules` handles rules that return arrays of findings (e.g. `dependency-added`)
- [ ] `buildReport` sets `overallRisk` to the maximum severity in findings
- [ ] `buildReport` returns `overallRisk: "low"` when there are no findings
- [ ] `shouldFail` returns `true` when risk >= threshold, `false` when risk < threshold

For git safety:
- [ ] Null bytes in `--base` or `--head` throw a clear error
- [ ] Renamed files are parsed correctly from `R<score>\told\tnew` lines
- [ ] Unknown status codes default to `"modified"`

## Output

Report your findings as a list of:
- PASS: description
- FAIL: description + file + line number
- SUGGESTION: description (optional improvements)

Focus only on correctness issues. Do not suggest style changes.
