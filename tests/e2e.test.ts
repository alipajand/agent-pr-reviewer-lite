/**
 * End-to-end CLI tests.
 *
 * Each test case:
 *   1. Creates a temporary git repository.
 *   2. Commits a baseline.
 *   3. Creates / modifies files to represent the PR under review.
 *   4. Commits those changes.
 *   5. Runs the CLI via `tsx src/cli.ts` as a subprocess, pointing at the
 *      temp repo as the working directory.
 *   6. Asserts on exit code, stdout, and stderr.
 *
 * The CLI subprocess inherits the real git binary and the real src/ tree,
 * so this exercises the full path: git diff → rules → reporter → process.exit.
 */

import { describe, it, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = resolve(__dirname, "../src/cli.ts");
const TSX_BIN = resolve(__dirname, "../node_modules/.bin/tsx");

// ─── helpers ────────────────────────────────────────────────────────────────

type CliResult = { stdout: string; stderr: string; exitCode: number };

/** Run the CLI in a subprocess with cwd set to the temp repo. */
function runCli(args: string[], cwd: string): CliResult {
  const result = spawnSync(TSX_BIN, [CLI_PATH, ...args], {
    cwd,
    encoding: "utf8",
    // Disable colour codes so assertions on stdout are predictable.
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    // Long-running tests would stall CI — 30 s is generous for a local git op.
    timeout: 30_000,
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.status ?? -1,
  };
}

/** Run git in a directory; throws on non-zero exit. */
function git(args: string[], cwd: string): void {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed:\n${r.stderr}`);
  }
}

/** Create a minimal isolated git repository. */
function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "apr-e2e-"));
  git(["init"], dir);
  git(["config", "user.email", "ci@example.com"], dir);
  git(["config", "user.name", "CI Test"], dir);
  return dir;
}

/** Write one or more files (creating parent dirs as needed) and commit them. */
function writeAndCommit(
  dir: string,
  files: Record<string, string>,
  message: string
): void {
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content, "utf8");
  }
  git(["add", "-A"], dir);
  git(["commit", "-m", message], dir);
}

/** Directories to remove after each test. */
const cleanups: string[] = [];

afterEach(() => {
  for (const dir of cleanups.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  }
});

/**
 * Build a repo with a baseline commit (README.md only) and return its path.
 * The caller is responsible for the subsequent commit(s) that represent the PR.
 */
function setup(): string {
  const dir = makeRepo();
  cleanups.push(dir);
  writeAndCommit(dir, { "README.md": "# baseline\n" }, "baseline");
  return dir;
}

// ─── test cases ─────────────────────────────────────────────────────────────

describe("E2E CLI — temp git repo", () => {
  // ── 1. no risky changes → low risk → exit 0 ───────────────────────────────
  it("no risky changes → low risk → exit 0", () => {
    const repo = setup();
    writeAndCommit(repo, { "utils/helpers.ts": "export const noop = () => {};\n" }, "add helper");

    const { exitCode, stdout } = runCli(["--base", "HEAD~1", "--head", "HEAD"], repo);

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/low/i);
  });

  // ── 2. auth/session file changed → high risk → exit 1 with --fail-on high ─
  it("auth/session file changed → high risk → exit 1 with --fail-on high", () => {
    const repo = setup();
    writeAndCommit(
      repo,
      { "src/auth/session.ts": "export const getSession = () => null;\n" },
      "add auth session"
    );

    const { exitCode, stdout } = runCli(
      ["--base", "HEAD~1", "--head", "HEAD", "--fail-on", "high"],
      repo
    );

    expect(exitCode).toBe(1);
    expect(stdout).toMatch(/high/i);
    expect(stdout).toMatch(/auth-file-touched|auth.*session/i);
  });

  // ── 3. lockfile changed → medium risk → exit 0 with --fail-on high ────────
  it("lockfile changed → medium risk → exit 0 with --fail-on high", () => {
    const repo = setup();
    writeAndCommit(
      repo,
      { "pnpm-lock.yaml": "lockfileVersion: '6.0'\n" },
      "add lockfile"
    );

    const { exitCode, stdout } = runCli(
      ["--base", "HEAD~1", "--head", "HEAD", "--fail-on", "high"],
      repo
    );

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/medium/i);
  });

  // ── 4. lockfile changed → medium risk → exit 1 with --fail-on medium ──────
  it("lockfile changed → medium risk → exit 1 with --fail-on medium", () => {
    const repo = setup();
    writeAndCommit(
      repo,
      { "pnpm-lock.yaml": "lockfileVersion: '6.0'\n" },
      "add lockfile"
    );

    const { exitCode, stdout } = runCli(
      ["--base", "HEAD~1", "--head", "HEAD", "--fail-on", "medium"],
      repo
    );

    expect(exitCode).toBe(1);
    expect(stdout).toMatch(/medium/i);
    expect(stdout).toMatch(/package-lock-changed|lockfile/i);
  });

  // ── 5. docs-only change ignored by config → low risk ─────────────────────
  //
  // src/docs/billing-guide.md would normally trigger "billing-file-touched"
  // (high) because its path contains "billing". With an ignore pattern in
  // config the file is filtered before rule evaluation, yielding low risk.
  it("docs-only change ignored by config → low risk", () => {
    const repo = setup();

    // Write the config so the CLI picks it up automatically.
    const configPath = join(repo, "agent-pr-reviewer-lite.config.json");
    writeFileSync(
      configPath,
      JSON.stringify({ ignore: ["src/docs/**"] }),
      "utf8"
    );
    git(["add", "-A"], repo);
    git(["commit", "-m", "add config"], repo);

    // This path matches BILLING_PATHS (/billing/i) → high risk without ignore.
    writeAndCommit(
      repo,
      { "src/docs/billing-guide.md": "# Billing guide\n" },
      "add billing guide doc"
    );

    const { exitCode, stdout } = runCli(
      ["--base", "HEAD~1", "--head", "HEAD", "--fail-on", "high"],
      repo
    );

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/low/i);
  });

  // ── 6. package.json added dependency → finding dependency-added ───────────
  it("package.json added dependency → finding dependency-added", () => {
    const repo = setup();

    // Baseline already committed with README.md; add an initial package.json.
    writeAndCommit(
      repo,
      {
        "package.json": JSON.stringify(
          { name: "sample", version: "1.0.0", dependencies: {} },
          null,
          2
        ) + "\n",
      },
      "add package.json"
    );

    // Now add a new dependency.
    writeAndCommit(
      repo,
      {
        "package.json": JSON.stringify(
          { name: "sample", version: "1.0.0", dependencies: { lodash: "^4.17.21" } },
          null,
          2
        ) + "\n",
      },
      "add lodash dependency"
    );

    const { exitCode, stdout } = runCli(
      ["--base", "HEAD~1", "--head", "HEAD", "--fail-on", "high"],
      repo
    );

    // dependency-added is medium severity → does not fail with --fail-on high.
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/dependency-added|Added dependency/i);
  });

  // ── 7. invalid base ref → exit code 2 ────────────────────────────────────
  it("invalid base ref → exit code 2", () => {
    const repo = setup();

    const { exitCode, stderr } = runCli(
      ["--base", "nonexistent-branch-xyz-abc", "--head", "HEAD"],
      repo
    );

    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/git command failed|Failed to run git diff/i);
  });
});
