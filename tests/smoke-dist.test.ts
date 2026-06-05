/**
 * Dist smoke tests — validate the compiled package (dist/cli.js), not tsx src/cli.ts.
 *
 * Pre-condition: `pnpm build` must have been run first.
 * The suite is skipped when dist/cli.js is absent so watch-mode tests keep
 * working without a prior build step.
 */

import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_CLI = resolve(__dirname, "../dist/cli.js");

const distExists = existsSync(DIST_CLI);

// ─── helpers ────────────────────────────────────────────────────────────────

type CliResult = { stdout: string; stderr: string; exitCode: number };

function runDist(args: string[], cwd?: string): CliResult {
  const result = spawnSync("node", [DIST_CLI, ...args], {
    cwd: cwd ?? process.cwd(),
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    timeout: 30_000,
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.status ?? -1,
  };
}

function git(args: string[], cwd: string): void {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed:\n${r.stderr}`);
  }
}

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "apr-dist-smoke-"));
  git(["init"], dir);
  git(["config", "user.email", "ci@example.com"], dir);
  git(["config", "user.name", "CI Test"], dir);
  // Isolated repos must never inherit the host's commit-signing config.
  git(["config", "commit.gpgsign", "false"], dir);
  return dir;
}

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

function setup(): string {
  const dir = makeRepo();
  cleanups.push(dir);
  writeAndCommit(dir, { "README.md": "# baseline\n" }, "baseline");
  return dir;
}

// ─── test cases ─────────────────────────────────────────────────────────────

describe.skipIf(!distExists)("Dist smoke — node dist/cli.js", () => {
  // ── 1. --help ─────────────────────────────────────────────────────────────
  it("--help exits 0 and includes all expected flags", () => {
    const { exitCode, stdout } = runDist(["--help"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("--base");
    expect(stdout).toContain("--head");
    expect(stdout).toContain("--format");
    expect(stdout).toContain("--fail-on");
    expect(stdout).toContain("--github-comment");
  });

  // ── 2. --version ──────────────────────────────────────────────────────────
  it("--version exits 0 and prints a semver string", () => {
    const { exitCode, stdout } = runDist(["--version"]);

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  // ── 3. no risky changes → low risk → exit 0 ───────────────────────────────
  it("no risky changes → low risk → exit 0", () => {
    const repo = setup();
    writeAndCommit(repo, { "utils/helpers.ts": "export const noop = () => {};\n" }, "add helper");

    const { exitCode, stdout } = runDist(["--base", "HEAD~1", "--head", "HEAD"], repo);

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/low/i);
  });

  // ── 4. auth file changed → high risk → exit 1 ─────────────────────────────
  it("auth file changed → high risk → exit 1 with --fail-on high", () => {
    const repo = setup();
    writeAndCommit(
      repo,
      { "src/auth/session.ts": "export const getSession = () => null;\n" },
      "add auth session"
    );

    const { exitCode, stdout } = runDist(
      ["--base", "HEAD~1", "--head", "HEAD", "--fail-on", "high"],
      repo
    );

    expect(exitCode).toBe(1);
    expect(stdout).toMatch(/high/i);
    expect(stdout).toMatch(/auth/i);
  });

  // ── 5. --format json produces valid JSON with the correct schema ───────────
  it("--format json produces valid JSON with the expected schema", () => {
    const repo = setup();
    writeAndCommit(repo, { "utils/helpers.ts": "export const noop = () => {};\n" }, "add helper");

    const { exitCode, stdout } = runDist(
      ["--base", "HEAD~1", "--head", "HEAD", "--format", "json"],
      repo
    );

    expect(exitCode).toBe(0);

    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    expect(parsed).toHaveProperty("risk");
    expect(parsed).toHaveProperty("findingCount");
    expect(parsed).toHaveProperty("findings");
    expect(parsed).toHaveProperty("requiredHumanReview");
    expect(parsed).toHaveProperty("ci");
    expect((parsed.ci as Record<string, unknown>)).toHaveProperty("failOn");
    expect((parsed.ci as Record<string, unknown>)).toHaveProperty("result");
  });

  // ── 6. invalid base ref → exit 2 ──────────────────────────────────────────
  it("invalid base ref → exit 2 with git error on stderr", () => {
    const repo = setup();

    const { exitCode, stderr } = runDist(
      ["--base", "nonexistent-branch-xyz-abc", "--head", "HEAD"],
      repo
    );

    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/git command failed/i);
  });

  // ── 7. multiple risky files → high risk → exit 1 ──────────────────────────
  it("multiple risky files (auth + migration + lockfile) → high risk → exit 1", () => {
    const repo = setup();
    writeAndCommit(
      repo,
      {
        "src/auth/session.ts": "export const getSession = () => null;\n",
        "migrations/0012_add_tenant_rls.sql": "CREATE TABLE t;\n",
        "pnpm-lock.yaml": "lockfileVersion: '6.0'\n",
      },
      "risky PR"
    );

    const { exitCode, stdout } = runDist(
      ["--base", "HEAD~1", "--head", "HEAD", "--fail-on", "high"],
      repo
    );

    expect(exitCode).toBe(1);
    expect(stdout).toMatch(/high/i);
    expect(stdout).toMatch(/auth/i);
    expect(stdout).toMatch(/migration/i);
    expect(stdout).toMatch(/lockfile/i);
  });
});
