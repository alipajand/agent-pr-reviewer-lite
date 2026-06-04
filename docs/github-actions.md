# GitHub Actions Integration

`agent-pr-reviewer-lite` is designed to run as a pull-request CI gate with zero configuration.

## Quick start

Copy `.github/workflows/agent-pr-risk.yml` from this repository into your own project, or create it manually:

```yaml
name: Agent PR Risk Check

on:
  pull_request:
    branches:
      - "**"

permissions:
  contents: read
  pull-requests: write

jobs:
  risk-check:
    name: Deterministic PR Risk Review
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository (full history)
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Set up Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Set up pnpm
        uses: pnpm/action-setup@v4
        with:
          version: latest

      - name: Install dependencies
        run: pnpm install

      - name: Fetch base branch
        run: git fetch origin ${{ github.base_ref }}

      - name: Run agent-pr-reviewer-lite
        run: |
          pnpm agent-pr-reviewer-lite \
            --base origin/${{ github.base_ref }} \
            --head HEAD \
            --fail-on high
```

## PR comment mode

Pass `--github-comment` to automatically post (or update) a Markdown report as a PR comment. The bot finds any existing comment it previously left (identified by a hidden HTML marker) and updates it in place, so there is only ever one comment per PR.

```yaml
permissions:
  contents: read
  pull-requests: write   # required to post/update comments

jobs:
  risk-check:
    steps:
      # ... checkout, setup, install steps ...

      - name: Run agent-pr-reviewer-lite with PR comment
        run: |
          pnpm agent-pr-reviewer-lite \
            --base origin/${{ github.base_ref }} \
            --head HEAD \
            --format markdown \
            --github-comment
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Prerequisites for PR comment mode

The comment is only posted when **all** of the following are present at runtime — missing any one silently skips the comment without affecting the exit code:

| Variable | Source | Purpose |
|----------|--------|---------|
| `GITHUB_TOKEN` | `secrets.GITHUB_TOKEN` (auto-injected) | Authenticates GitHub API calls |
| `GITHUB_REPOSITORY` | Auto-injected by Actions | `owner/repo` to target |
| `GITHUB_EVENT_PATH` | Auto-injected by Actions | Path to the event JSON (supplies the PR number) |

The event payload must contain a `pull_request.number` field (i.e. the workflow runs on a `pull_request` trigger).

### Comment format

The comment is a GitHub-flavoured Markdown table topped by a hidden marker comment:

```
<!-- agent-pr-reviewer-lite -->
## Agent PR Risk: High
### Changed risky areas
| Severity | File | Finding | Required review |
...
```

The marker allows subsequent runs to find and overwrite the same comment instead of creating duplicates.

## Why `fetch-depth: 0`?

The tool compares two git refs using `git diff`. A shallow clone (the default) may not contain the base branch history, causing the diff to fail. `fetch-depth: 0` ensures the full history is available.

## Fail thresholds

### Default — fail on high risk only

```bash
pnpm agent-pr-reviewer-lite \
  --base origin/${{ github.base_ref }} \
  --head HEAD \
  --fail-on high
```

The check passes for `low` and `medium` risk. It only blocks merges when a **high**-severity finding is present (e.g. auth file changed, migration added, CI/CD pipeline modified).

### Stricter — fail on medium or higher

```bash
pnpm agent-pr-reviewer-lite \
  --base origin/${{ github.base_ref }} \
  --head HEAD \
  --fail-on medium
```

Recommended for security-sensitive projects. Blocks merges when any **medium** or **high** finding is detected (e.g. lockfile changed, generated file edited, public route modified).

## Using a config file

If `agent-pr-reviewer-lite.config.json` is present at the repo root, the workflow picks it up automatically — no extra flags needed:

```yaml
      - name: Run agent-pr-reviewer-lite
        run: |
          pnpm agent-pr-reviewer-lite \
            --base origin/${{ github.base_ref }} \
            --head HEAD
```

See [Configuration](../README.md#configuration) for the full config schema.

## JSON output for downstream steps

Pass `--format json` to emit machine-readable output that a subsequent step can parse:

```yaml
      - name: Run agent-pr-reviewer-lite (JSON)
        id: risk
        run: |
          pnpm agent-pr-reviewer-lite \
            --base origin/${{ github.base_ref }} \
            --head HEAD \
            --format json \
            --fail-on high \
            | tee risk-report.json
        continue-on-error: true

      - name: Upload risk report
        uses: actions/upload-artifact@v4
        with:
          name: risk-report
          path: risk-report.json
```

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Risk is below the `--fail-on` threshold — check passes |
| `1` | Risk meets or exceeds the `--fail-on` threshold — check fails |
| `2` | Unexpected error (e.g. git command failed, bad config) |
