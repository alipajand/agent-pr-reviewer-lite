---
description: Run the required checks (format, typecheck, build, test) and report the results
allowed-tools: Bash(pnpm format:check), Bash(pnpm typecheck), Bash(pnpm build), Bash(pnpm test)
---

Run these commands in order and stop at the first failure:

1. `pnpm format:check`
2. `pnpm typecheck`
3. `pnpm build`
4. `pnpm test`

Report each command with pass or fail. For a failure, show the relevant error lines and the
file and line to fix. Do not change any files.
