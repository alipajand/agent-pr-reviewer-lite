# Release Checklist

Follow these steps in order before every `npm publish`.

---

## 1. Build

Compile TypeScript to `dist/`.

```bash
pnpm build
```

Expected: no compiler errors; `dist/` contains `.js`, `.d.ts`, and `.js.map` files for every module in `src/`.

---

## 2. Test

Run the full test suite (unit + integration + E2E).

```bash
pnpm test
```

Expected: all tests pass, no skipped tests.

---

## 3. Pack (dry-run tarball)

Create a local tarball without publishing. This reveals exactly what will be shipped.

```bash
pnpm pack
```

Inspect the generated `agent-pr-reviewer-lite-<version>.tgz`:

```bash
tar -tzf agent-pr-reviewer-lite-*.tgz | sort
```

Verify:
- `package/dist/cli.js` is present (the `bin` entry point).
- `package/dist/index.js` and `package/dist/index.d.ts` are present (the library entry point).
- `package/README.md` is present.
- No `src/`, `tests/`, or `node_modules/` directories are included.
- No secrets (`.env`, tokens, credentials) are included.

---

## 4. Install tarball locally

Smoke-test the packed tarball in a throw-away directory.

```bash
mkdir /tmp/apr-smoke && cd /tmp/apr-smoke
npm install --no-save /path/to/agent-pr-reviewer-lite-<version>.tgz
```

---

## 5. Run CLI help

Verify the installed binary is accessible and shows correct help output.

```bash
./node_modules/.bin/agent-pr-reviewer-lite --help
```

Expected:
- Help text includes `--base`, `--head`, `--format`, `--fail-on`.
- Exit code 0.

---

## 6. Run CLI against a sample repo

Point the installed CLI at a real git repository to confirm the end-to-end path works.

```bash
cd /path/to/any-git-repo
/path/to/apr-smoke/node_modules/.bin/agent-pr-reviewer-lite \
  --base HEAD~1 \
  --head HEAD \
  --format text
```

Expected: output includes a risk level (`low`, `medium`, or `high`) and exits 0 or 1.

---

## 7. npm publish dry-run

Validate the publish metadata without actually publishing.

```bash
npm publish --dry-run
```

Check the output:
- Correct `name` and `version`.
- Only files listed in the `files` field are included.
- No unexpected files or directories.

---

## 8. npm publish

Publish to the registry.

```bash
npm publish --access public
```

After publishing:
- Verify the package appears at `https://www.npmjs.com/package/agent-pr-reviewer-lite`.
- Run `npx agent-pr-reviewer-lite --help` in a clean environment to confirm the published version is functional.
- Tag the release commit: `git tag v<version> && git push --tags`.
