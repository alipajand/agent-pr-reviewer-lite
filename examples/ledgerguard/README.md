# LedgerGuard — agent-pr-reviewer-lite preset

This is a strict preset config for **LedgerGuard**, a platform that handles contract document ingestion, tenant data, financial commitments, billing, and renewals.

## Why this config is intentionally strict

LedgerGuard operates in a domain where a silent regression can cause real financial exposure:

- **Contract documents** are ingested, parsed via OCR, and verified by human reviewers. Any bug in the upload, extraction, or verification flow can corrupt data that drives business decisions.
- **Tenant isolation** is enforced by Supabase Row-Level Security (RLS) policies. A missing or incorrect policy can expose one customer's data to another.
- **Commitments ledger** tracks financial obligations. A logic error here directly affects reported numbers and downstream billing.
- **Renewals workflow** drives revenue. Silent failures mean missed renewals or incorrect pricing applied at renewal time.
- **Currency normalization** converts foreign amounts before they enter the ledger. Rounding or exchange-rate bugs compound over time and are hard to audit after the fact.
- **Billing plans and pricing** are high-visibility surfaces — a wrong price or plan change goes straight to customers.

For these reasons, every one of the extra risk rules in this config is set to `"severity": "high"` and requires a named human reviewer before merge.

## Usage

Copy `agent-pr-reviewer-lite.config.json` from this directory into your LedgerGuard repo root:

```bash
cp examples/ledgerguard/agent-pr-reviewer-lite.config.json ./agent-pr-reviewer-lite.config.json
```

Then run the checker (the config is auto-discovered):

```bash
pnpm agent-pr-reviewer-lite --base main
```

Or in GitHub Actions:

```bash
pnpm agent-pr-reviewer-lite \
  --base origin/${{ github.base_ref }} \
  --head HEAD \
  --fail-on high
```

## What this config adds on top of built-in rules

The built-in rules already catch auth, security, migrations, lockfile changes, and dependency additions. This preset layers in seven LedgerGuard-specific high-severity rules:

| Rule ID | Trigger paths | Required reviewer |
|---------|--------------|-------------------|
| `ledgerguard-document-ingestion` | `upload/`, `documents/`, `extractions/`, OCR/extraction workers | document ingestion/extraction |
| `ledgerguard-verification` | `review/`, `verification/` under web and API | human verification workflow |
| `ledgerguard-renewals` | `renewals/` across web, API, and packages | renewals workflow |
| `ledgerguard-commitments-ledger` | `commitments/` across web, API, and packages | commitments ledger |
| `ledgerguard-normalization` | `currency/`, `normalization/`, `money/` | currency normalization |
| `ledgerguard-billing-plans` | `pricing/`, `billing/`, `stripe/`, `plans/` | pricing/billing plans |
| `ledgerguard-rls-policy` | `supabase/migrations/`, `supabase/policies/`, `tenant/`, `rls/` | tenant isolation/RLS |

## Ignore patterns

Markdown files (`**/*.md`), `docs/**`, `README.md`, and `CHANGELOG.md` are excluded from all rules. Documentation-only PRs will always pass with zero risk findings.
