# LedgerGuard — agent-pr-reviewer-lite preset

This directory contains a ready-to-use, strict configuration of `agent-pr-reviewer-lite` for the LedgerGuard application (contract ingestion, tenant isolation, renewals, commitment ledger, currency normalization, and billing).

---

## Installation status

> **TODO — package not yet published.**
>
> `agent-pr-reviewer-lite` has not been released to the npm registry yet.
> Once it is published, follow the steps below to integrate it into LedgerGuard.

---

## Integration steps (run once the package is published)

### 1. Install as a dev dependency

```bash
# in the LedgerGuard repository root
pnpm add -D agent-pr-reviewer-lite
```

### 2. Copy the config file

```bash
cp examples/ledgerguard/agent-pr-reviewer-lite.config.json agent-pr-reviewer-lite.config.json
```

The tool auto-discovers `agent-pr-reviewer-lite.config.json` in the working directory. No `--config` flag is needed.

### 3. Add the package script

Add this to `package.json` (see `package.json.snippet` in this directory for the full snippet):

```json
{
  "scripts": {
    "pr:risk": "agent-pr-reviewer-lite --base main --head HEAD --fail-on high"
  }
}
```

### 4. Add the GitHub Actions workflow

```bash
mkdir -p .github/workflows
cp examples/ledgerguard/.github/workflows/agent-pr-risk.yml .github/workflows/agent-pr-risk.yml
```

### 5. Verify locally

```bash
pnpm install
pnpm pr:risk
```

---

## Config file overview

`agent-pr-reviewer-lite.config.json` extends the 11 built-in rules with 7 high-severity LedgerGuard-specific rules:

| Rule ID | Trigger paths | Required review |
|---------|---------------|-----------------|
| `ledgerguard-document-ingestion` | `**/upload/**`, `**/documents/**`, `**/extractions/**`, `**/ocr/**` | document ingestion/extraction |
| `ledgerguard-verification` | `**/review/**`, `**/verification/**` | human verification workflow |
| `ledgerguard-renewals` | `**/renewals/**` | renewals workflow |
| `ledgerguard-commitments-ledger` | `**/commitments/**` | commitments ledger |
| `ledgerguard-normalization` | `**/currency/**`, `**/normalization/**`, `**/money/**` | currency normalization |
| `ledgerguard-billing-plans` | `**/pricing/**`, `**/billing/**`, `**/stripe/**`, `**/plans/**` | pricing/billing plans |
| `ledgerguard-rls-policy` | `supabase/migrations/**`, `supabase/policies/**`, `**/tenant/**`, `**/rls/**` | tenant isolation/RLS |

All 7 are `severity: "high"` and will cause the CI job to fail (`--fail-on high`).

Markdown and documentation files are ignored via the `ignore` config field so doc-only PRs pass without review gates.

---

## Why every rule is high severity

| Domain | Risk |
|--------|------|
| Document ingestion / extraction | Corrupted parsing loses contract data permanently |
| Human verification | Bypassing verification allows unreviewed data into the ledger |
| Renewals | Incorrect renewal logic mischarges customers or misses deadlines |
| Commitments ledger | Ledger corruption is a financial and audit integrity issue |
| Currency normalization | Rounding or FX errors propagate silently into financial records |
| Pricing / billing plans | Wrong prices affect revenue; Stripe webhook bugs cause double charges |
| Supabase RLS / tenant isolation | A broken RLS policy leaks one tenant's data to another |

---

## CI workflow behaviour

The workflow in `.github/workflows/agent-pr-risk.yml`:

- Runs on every pull request to any branch
- Fails the check (`exit 1`) only when overall risk is **high** — meaning medium-risk findings (lockfiles, generated files, public routes, pricing copy) produce a warning comment but do **not** block the PR
- Posts (or updates) a Markdown report as a PR comment via `--github-comment`
- Requires `permissions: pull-requests: write` (set in the workflow file)
- Does **not** touch any production application code

### Exit codes in CI

| Code | Meaning |
|------|---------|
| `0` | No high-risk findings — PR can proceed |
| `1` | High-risk finding detected — PR is blocked pending human review |
| `2` | Tool/config/git error — investigate before merging |

---

## Files in this directory

```
examples/ledgerguard/
  agent-pr-reviewer-lite.config.json   # Strict LedgerGuard config (copy to repo root)
  package.json.snippet                 # package.json additions (devDependency + pr:risk script)
  .github/
    workflows/
      agent-pr-risk.yml                # GitHub Actions workflow (copy to .github/workflows/)
  README.md                            # This file
```
