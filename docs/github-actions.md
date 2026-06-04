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
