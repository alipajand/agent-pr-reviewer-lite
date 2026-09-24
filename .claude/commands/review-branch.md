---
description: Run agent-pr-reviewer-lite on the current branch against main and explain the findings
allowed-tools: Bash(pnpm build), Bash(node dist/cli.js:*), Bash(git fetch origin main)
---

1. Run `pnpm build`.
2. Run `node dist/cli.js --base main --head HEAD --explain`.

Summarize the overall risk, then each finding with the file, the rule, and why it needs
review. If a finding looks like a false positive, name the rule and the pattern that matched
and suggest how to tighten it. Do not change any files.
