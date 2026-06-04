#!/usr/bin/env bash
# Tarball smoke test for agent-pr-reviewer-lite.
#
# What it does:
#   1. Builds TypeScript to dist/.
#   2. Runs `pnpm pack` to create a local .tgz without publishing.
#   3. Installs the tarball into a throw-away directory.
#   4. Verifies the installed binary's --help output.
#   5. Runs the binary against a temp git repository.
#
# Does NOT publish. Safe to run locally or in CI.
#
# Usage:
#   pnpm smoke:tarball
#   bash scripts/tarball-smoke.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SMOKE_DIR="$(mktemp -d /tmp/apr-tarball-smoke-XXXX)"
REPO_DIR="$(mktemp -d /tmp/apr-smoke-repo-XXXX)"

cleanup() {
  rm -rf "$SMOKE_DIR" "$REPO_DIR"
}
trap cleanup EXIT

echo "==> Building TypeScript..."
cd "$ROOT"
pnpm build

echo ""
echo "==> Packing..."
pnpm pack --pack-destination "$SMOKE_DIR"

TGZ=$(ls "$SMOKE_DIR"/*.tgz | head -1)
echo "    Created: $TGZ"

echo ""
echo "==> Inspecting tarball contents..."
tar -tzf "$TGZ" | sort

echo ""
echo "==> Verifying required files are present..."
tar -tzf "$TGZ" | grep -q "package/dist/cli.js" \
  || { echo "FAIL: dist/cli.js missing from tarball"; exit 1; }
tar -tzf "$TGZ" | grep -q "package/dist/index.js" \
  || { echo "FAIL: dist/index.js missing from tarball"; exit 1; }
tar -tzf "$TGZ" | grep -q "package/dist/index.d.ts" \
  || { echo "FAIL: dist/index.d.ts missing from tarball"; exit 1; }
tar -tzf "$TGZ" | grep -q "package/README.md" \
  || { echo "FAIL: README.md missing from tarball"; exit 1; }

if tar -tzf "$TGZ" | grep -q "package/src/"; then
  echo "FAIL: src/ directory must not be shipped in the package"
  exit 1
fi
if tar -tzf "$TGZ" | grep -q "package/tests/"; then
  echo "FAIL: tests/ directory must not be shipped in the package"
  exit 1
fi
if tar -tzf "$TGZ" | grep -q "package/node_modules/"; then
  echo "FAIL: node_modules/ must not be shipped in the package"
  exit 1
fi

echo "    Tarball contents OK"

echo ""
echo "==> Installing into $SMOKE_DIR..."
cd "$SMOKE_DIR"
npm install --no-save "$TGZ" --loglevel error

BIN="$SMOKE_DIR/node_modules/.bin/agent-pr-reviewer-lite"
[ -x "$BIN" ] || { echo "FAIL: binary not found or not executable at $BIN"; exit 1; }

echo ""
echo "==> Testing --help..."
"$BIN" --help
echo ""

echo "==> Checking --help output includes required flags..."
HELP_OUT="$("$BIN" --help 2>&1)"
echo "$HELP_OUT" | grep -q -- "--base"        || { echo "FAIL: --base missing from help"; exit 1; }
echo "$HELP_OUT" | grep -q -- "--head"        || { echo "FAIL: --head missing from help"; exit 1; }
echo "$HELP_OUT" | grep -q -- "--format"      || { echo "FAIL: --format missing from help"; exit 1; }
echo "$HELP_OUT" | grep -q -- "--fail-on"     || { echo "FAIL: --fail-on missing from help"; exit 1; }
echo "$HELP_OUT" | grep -q -- "--github-comment" || { echo "FAIL: --github-comment missing from help"; exit 1; }
echo "    Help output OK"

echo ""
echo "==> Creating temp git repository..."
cd "$REPO_DIR"
git init -q
git config user.email "smoke@example.com"
git config user.name "Smoke Test"
echo "# baseline" > README.md
git add -A
git commit -q -m "baseline"

mkdir -p src/auth
echo 'export const getSession = () => null;' > src/auth/session.ts
git add -A
git commit -q -m "add auth session"

echo ""
echo "==> Running CLI against temp repo (expect high risk, exit 1)..."
set +e
"$BIN" --base HEAD~1 --head HEAD --fail-on high
EXIT_CODE=$?
set -e

if [ "$EXIT_CODE" -ne 1 ]; then
  echo "FAIL: expected exit code 1, got $EXIT_CODE"
  exit 1
fi
echo "    Exit code 1 as expected."

echo ""
echo "==> Validating JSON output schema..."
JSON_OUT="$("$BIN" --base HEAD~1 --head HEAD --format json --fail-on high 2>&1 || true)"
node -e "
  const j = JSON.parse(process.argv[1]);
  const required = ['risk', 'findingCount', 'findings', 'requiredHumanReview', 'ci'];
  for (const k of required) {
    if (!(k in j)) { console.error('FAIL: missing key:', k); process.exit(1); }
  }
  if (!('failOn' in j.ci) || !('result' in j.ci)) {
    console.error('FAIL: ci.failOn or ci.result missing'); process.exit(1);
  }
  console.log('    JSON schema OK');
" "$JSON_OUT"

echo ""
echo "✓ Tarball smoke test passed."
