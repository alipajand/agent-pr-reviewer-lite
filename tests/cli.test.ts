/**
 * In-process tests for the CLI `run` entrypoint.
 *
 * Unlike the subprocess e2e tests, these import src/cli.ts directly and invoke
 * `run(argv)` so the logic is measured by coverage. process.exit, console.log,
 * and console.error are stubbed; a temp git repo + chdir provides a real diff
 * for getChangedFiles to read.
 *
 * Exit handling: process.exit is mocked to throw ExitSignal so control returns
 * to the test. An undefined captured code means run() completed without calling
 * process.exit (success / exit 0).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli.js";

// ─── exit / console capture ───────────────────────────────────────────────────

class ExitSignal extends Error {
  constructor(public code: number) {
    super(`exit:${code}`);
  }
}

type Captured = {
  stdout: string;
  stderr: string;
  exitCode: number | undefined;
};

/** Invoke run() with the given flags, capturing stdout/stderr/exit code. */
async function runCli(flags: string[]): Promise<Captured> {
  const out: string[] = [];
  const err: string[] = [];
  let exitCode: number | undefined;

  const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => {
    out.push(args.join(" "));
  });
  const errSpy = vi.spyOn(console, "error").mockImplementation((...args) => {
    err.push(args.join(" "));
  });
  const exitSpy = vi
    .spyOn(process, "exit")
    .mockImplementation(((code?: number) => {
      exitCode = code ?? 0;
      throw new ExitSignal(exitCode);
    }) as never);

  try {
    await run(["node", "cli", ...flags]);
  } catch (e) {
    if (!(e instanceof ExitSignal)) throw e;
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
    exitSpy.mockRestore();
  }

  return { stdout: out.join("\n"), stderr: err.join("\n"), exitCode };
}

// ─── temp git repo helpers ────────────────────────────────────────────────────

function git(args: string[], cwd: string): void {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed:\n${r.stderr}`);
  }
}

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "apr-cli-unit-"));
  git(["init"], dir);
  git(["config", "user.email", "ci@example.com"], dir);
  git(["config", "user.name", "CI Test"], dir);
  // Isolated repos must never inherit the host's commit-signing config.
  git(["config", "commit.gpgsign", "false"], dir);
  git(["checkout", "-b", "main"], dir);
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
let originalCwd: string | undefined;

afterEach(() => {
  if (originalCwd) {
    process.chdir(originalCwd);
    originalCwd = undefined;
  }
  for (const dir of cleanups.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  }
});

/** Make a repo with a baseline commit and chdir into it. */
function setup(): string {
  const dir = makeRepo();
  cleanups.push(dir);
  writeAndCommit(dir, { "README.md": "# baseline\n" }, "baseline");
  originalCwd = process.cwd();
  process.chdir(dir);
  return dir;
}

// ─── argument validation ──────────────────────────────────────────────────────

describe("run — argument validation", () => {
  it("exits 1 with a helpful message for an invalid --format", async () => {
    setup();
    const { exitCode, stderr } = await runCli([
      "--base", "HEAD~1", "--head", "HEAD", "--format", "xml",
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/--format "xml" is not valid/);
  });

  it("exits 1 with a helpful message for an invalid --fail-on", async () => {
    setup();
    const { exitCode, stderr } = await runCli([
      "--base", "HEAD~1", "--head", "HEAD", "--fail-on", "critical",
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/--fail-on "critical" is not valid/);
  });
});

// ─── config loading errors ────────────────────────────────────────────────────

describe("run — config errors", () => {
  it("exits 2 when an explicit --config file is malformed JSON", async () => {
    const repo = setup();
    const badConfig = join(repo, "bad.config.json");
    writeFileSync(badConfig, "{ not valid json", "utf8");

    const { exitCode, stderr } = await runCli([
      "--config", badConfig, "--base", "HEAD~1", "--head", "HEAD",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/Failed to load config file/);
  });
});

// ─── git errors ───────────────────────────────────────────────────────────────

describe("run — git errors", () => {
  it("exits 2 when the base ref does not exist", async () => {
    setup();
    const { exitCode, stderr } = await runCli([
      "--base", "nonexistent-ref-xyz", "--head", "HEAD",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/git command failed/);
  });
});

// ─── output formats ───────────────────────────────────────────────────────────

describe("run — output formats", () => {
  it("text format: low risk yields no exit call and prints 'Low'", async () => {
    const repo = setup();
    writeAndCommit(repo, { "utils/helpers.ts": "export const a = 1;\n" }, "add helper");

    const { exitCode, stdout } = await runCli(["--base", "HEAD~1", "--head", "HEAD"]);
    expect(exitCode).toBeUndefined();
    expect(stdout).toMatch(/Agent PR Risk: Low/);
  });

  it("json format: emits parseable JSON with the expected schema", async () => {
    const repo = setup();
    writeAndCommit(repo, { "utils/helpers.ts": "export const a = 1;\n" }, "add helper");

    const { stdout } = await runCli([
      "--base", "HEAD~1", "--head", "HEAD", "--format", "json",
    ]);
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    expect(parsed).toHaveProperty("risk");
    expect(parsed).toHaveProperty("findingCount");
    expect(parsed).toHaveProperty("ci");
  });

  it("markdown format: emits the markdown heading", async () => {
    const repo = setup();
    writeAndCommit(repo, { "utils/helpers.ts": "export const a = 1;\n" }, "add helper");

    const { stdout } = await runCli([
      "--base", "HEAD~1", "--head", "HEAD", "--format", "markdown",
    ]);
    expect(stdout).toMatch(/^## Agent PR Risk:/m);
  });
});

// ─── risk → exit code ─────────────────────────────────────────────────────────

describe("run — risk to exit code", () => {
  it("exits 1 when a high-risk auth file changes with --fail-on high", async () => {
    const repo = setup();
    writeAndCommit(
      repo,
      { "src/auth/session.ts": "export const s = 1;\n" },
      "add auth"
    );

    const { exitCode, stdout } = await runCli([
      "--base", "HEAD~1", "--head", "HEAD", "--fail-on", "high",
    ]);
    expect(exitCode).toBe(1);
    expect(stdout).toMatch(/High/);
  });

  it("exits 0 (no exit call) for a medium finding when --fail-on high", async () => {
    const repo = setup();
    writeAndCommit(repo, { "pnpm-lock.yaml": "lockfileVersion: '6.0'\n" }, "add lock");

    const { exitCode, stdout } = await runCli([
      "--base", "HEAD~1", "--head", "HEAD", "--fail-on", "high",
    ]);
    expect(exitCode).toBeUndefined();
    expect(stdout).toMatch(/Medium/);
  });
});

// ─── config-driven behavior ───────────────────────────────────────────────────

describe("run — config file behavior", () => {
  it("honors failOn from the config file (medium) → exits 1 on a lockfile change", async () => {
    const repo = setup();
    writeFileSync(
      join(repo, "agent-pr-reviewer-lite.config.json"),
      JSON.stringify({ failOn: "medium" }),
      "utf8"
    );
    git(["add", "-A"], repo);
    git(["commit", "-m", "add config"], repo);
    writeAndCommit(repo, { "pnpm-lock.yaml": "lockfileVersion: '6.0'\n" }, "add lock");

    const { exitCode, stdout } = await runCli(["--base", "HEAD~1", "--head", "HEAD"]);
    expect(exitCode).toBe(1);
    expect(stdout).toMatch(/Medium/);
  });

  it("honors ignore patterns from config → risky file filtered to low risk", async () => {
    const repo = setup();
    writeFileSync(
      join(repo, "agent-pr-reviewer-lite.config.json"),
      JSON.stringify({ ignore: ["src/auth/**"] }),
      "utf8"
    );
    git(["add", "-A"], repo);
    git(["commit", "-m", "add config"], repo);
    writeAndCommit(repo, { "src/auth/session.ts": "export const s = 1;\n" }, "add auth");

    const { exitCode, stdout } = await runCli([
      "--base", "HEAD~1", "--head", "HEAD", "--fail-on", "high",
    ]);
    expect(exitCode).toBeUndefined();
    expect(stdout).toMatch(/Low/);
  });

  it("applies extraRiskPaths from config to flag a custom path", async () => {
    const repo = setup();
    writeFileSync(
      join(repo, "agent-pr-reviewer-lite.config.json"),
      JSON.stringify({
        extraRiskPaths: [
          {
            id: "custom-rule",
            label: "Custom area changed",
            severity: "high",
            patterns: ["src/custom/**"],
          },
        ],
      }),
      "utf8"
    );
    git(["add", "-A"], repo);
    git(["commit", "-m", "add config"], repo);
    writeAndCommit(repo, { "src/custom/thing.ts": "export const t = 1;\n" }, "touch custom");

    const { exitCode, stdout } = await runCli([
      "--base", "HEAD~1", "--head", "HEAD", "--format", "json", "--fail-on", "high",
    ]);
    expect(exitCode).toBe(1);
    const parsed = JSON.parse(stdout) as { findings: Array<{ id: string }> };
    expect(parsed.findings.some((f) => f.id === "custom-rule")).toBe(true);
  });
});

// ─── --github-comment guard ───────────────────────────────────────────────────

describe("run — --github-comment without env", () => {
  const savedEnv: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const key of ["GITHUB_TOKEN", "GITHUB_REPOSITORY", "GITHUB_EVENT_PATH"]) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  it("is a no-op locally (no GitHub env) and still prints the report", async () => {
    for (const key of ["GITHUB_TOKEN", "GITHUB_REPOSITORY", "GITHUB_EVENT_PATH"]) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }

    const repo = setup();
    writeAndCommit(repo, { "utils/helpers.ts": "export const a = 1;\n" }, "add helper");

    const { exitCode, stdout } = await runCli([
      "--base", "HEAD~1", "--head", "HEAD", "--github-comment",
    ]);
    expect(exitCode).toBeUndefined();
    expect(stdout).toMatch(/Agent PR Risk: Low/);
  });
});
