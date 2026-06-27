/**
 * Unit tests for getChangedFiles against a real, isolated git repository.
 *
 * getChangedFiles shells out to the real git binary in the current working
 * directory, so each test creates a temp repo, chdir's into it, runs git to
 * build a known history, then asserts on the parsed ChangedFile[] result.
 *
 * This exercises the full git.ts surface that the unit-level shell-injection
 * and parseNameStatus tests do not: status mapping for added/modified/deleted/
 * renamed files and the package.json content-inspection path (addedLines).
 */

import { describe, it, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getChangedFiles,
  getChangedFilesFromInput,
  parseChangedFilesInput,
} from "../src/git.js";

// ─── helpers ────────────────────────────────────────────────────────────────

function git(args: string[], cwd: string): void {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed:\n${r.stderr}`);
  }
}

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "apr-git-unit-"));
  git(["init"], dir);
  git(["config", "user.email", "ci@example.com"], dir);
  git(["config", "user.name", "CI Test"], dir);
  // Isolated repos must never inherit the host's commit-signing config.
  git(["config", "commit.gpgsign", "false"], dir);
  // Stable default branch name regardless of the host git config.
  git(["checkout", "-b", "main"], dir);
  return dir;
}

function writeFiles(dir: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content, "utf8");
  }
}

function commit(dir: string, message: string): void {
  git(["add", "-A"], dir);
  git(["commit", "-m", message], dir);
}

function writeAndCommit(
  dir: string,
  files: Record<string, string>,
  message: string,
): void {
  writeFiles(dir, files);
  commit(dir, message);
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

/** Create a repo with a baseline commit and chdir into it. */
function setup(): string {
  const dir = makeRepo();
  cleanups.push(dir);
  writeAndCommit(dir, { "README.md": "# baseline\n" }, "baseline");
  originalCwd = process.cwd();
  process.chdir(dir);
  return dir;
}

// ─── status mapping ──────────────────────────────────────────────────────────

describe("getChangedFiles — status mapping", () => {
  it("returns an empty array when nothing changed between identical refs", () => {
    setup();
    expect(getChangedFiles("HEAD", "HEAD")).toEqual([]);
  });

  it("detects an added file", () => {
    const repo = setup();
    writeAndCommit(repo, { "src/new.ts": "export const a = 1;\n" }, "add file");

    const files = getChangedFiles("HEAD~1", "HEAD");
    const added = files.find((f) => f.path === "src/new.ts");
    expect(added).toBeDefined();
    expect(added?.status).toBe("added");
    expect(added?.previousPath).toBeUndefined();
  });

  it("detects a modified file", () => {
    const repo = setup();
    writeAndCommit(
      repo,
      { "src/file.ts": "export const a = 1;\n" },
      "add file",
    );
    writeAndCommit(
      repo,
      { "src/file.ts": "export const a = 2;\n" },
      "modify file",
    );

    const files = getChangedFiles("HEAD~1", "HEAD");
    const modified = files.find((f) => f.path === "src/file.ts");
    expect(modified?.status).toBe("modified");
  });

  it("detects a deleted file", () => {
    const repo = setup();
    writeAndCommit(
      repo,
      { "src/gone.ts": "export const a = 1;\n" },
      "add file",
    );
    rmSync(join(repo, "src/gone.ts"));
    commit(repo, "delete file");

    const files = getChangedFiles("HEAD~1", "HEAD");
    const deleted = files.find((f) => f.path === "src/gone.ts");
    expect(deleted?.status).toBe("deleted");
  });

  it("detects a renamed file and reports the new path", () => {
    const repo = setup();
    // A reasonably large file so git records a pure rename (R100).
    const body =
      Array.from({ length: 20 }, (_, i) => `export const v${i} = ${i};`).join(
        "\n",
      ) + "\n";
    writeAndCommit(repo, { "src/old-name.ts": body }, "add file");
    git(["mv", "src/old-name.ts", "src/new-name.ts"], repo);
    commit(repo, "rename file");

    const files = getChangedFiles("HEAD~1", "HEAD");
    const renamed = files.find((f) => f.status === "renamed");
    expect(renamed).toBeDefined();
    expect(renamed?.path).toBe("src/new-name.ts");
    expect(renamed?.previousPath).toBe("src/old-name.ts");
  });

  it("returns multiple changed files in a single diff", () => {
    const repo = setup();
    writeAndCommit(
      repo,
      {
        "src/auth/session.ts": "export const s = 1;\n",
        "migrations/001.sql": "CREATE TABLE t;\n",
        "pnpm-lock.yaml": "lockfileVersion: '6.0'\n",
      },
      "multi-file change",
    );

    const files = getChangedFiles("HEAD~1", "HEAD");
    const paths = files.map((f) => f.path).sort();
    expect(paths).toEqual(
      ["migrations/001.sql", "pnpm-lock.yaml", "src/auth/session.ts"].sort(),
    );
  });
});

// ─── content inspection (package.json → addedLines) ──────────────────────────

describe("getChangedFiles — package.json content inspection", () => {
  it("populates addedLines for a modified package.json", () => {
    const repo = setup();
    writeAndCommit(
      repo,
      {
        "package.json":
          JSON.stringify(
            { name: "x", version: "1.0.0", dependencies: {} },
            null,
            2,
          ) + "\n",
      },
      "add package.json",
    );
    writeAndCommit(
      repo,
      {
        "package.json":
          JSON.stringify(
            {
              name: "x",
              version: "1.0.0",
              dependencies: { lodash: "^4.17.21" },
            },
            null,
            2,
          ) + "\n",
      },
      "add lodash",
    );

    const files = getChangedFiles("HEAD~1", "HEAD");
    const pkg = files.find((f) => f.path === "package.json");
    expect(pkg).toBeDefined();
    expect(pkg?.status).toBe("modified");
    expect(pkg?.addedLines).toBeDefined();
    expect(pkg?.addedLines?.some((l) => l.includes("lodash"))).toBe(true);
  });

  it("does NOT populate addedLines for a deleted package.json", () => {
    const repo = setup();
    writeAndCommit(
      repo,
      { "package.json": '{"name":"x"}\n' },
      "add package.json",
    );
    rmSync(join(repo, "package.json"));
    commit(repo, "delete package.json");

    const files = getChangedFiles("HEAD~1", "HEAD");
    const pkg = files.find((f) => f.path === "package.json");
    expect(pkg?.status).toBe("deleted");
    expect(pkg?.addedLines).toBeUndefined();
  });

  it("does NOT populate addedLines for non-package.json files", () => {
    const repo = setup();
    writeAndCommit(
      repo,
      { "src/config.ts": "export const a = 1;\n" },
      "add config",
    );

    const files = getChangedFiles("HEAD~1", "HEAD");
    const cfg = files.find((f) => f.path === "src/config.ts");
    expect(cfg?.addedLines).toBeUndefined();
  });
});

// ─── error handling ──────────────────────────────────────────────────────────

describe("getChangedFiles — error handling", () => {
  it("throws a wrapped error for an invalid base ref", () => {
    setup();
    expect(() => getChangedFiles("nonexistent-ref-xyz", "HEAD")).toThrow(
      /Failed to run git diff/,
    );
  });

  it("rejects a base ref containing a null byte before invoking git", () => {
    setup();
    expect(() => getChangedFiles("main\x00", "HEAD")).toThrow(
      /--base contains a null byte/,
    );
  });

  it("rejects a head ref containing a null byte before invoking git", () => {
    setup();
    expect(() => getChangedFiles("main", "HEAD\x00")).toThrow(
      /--head contains a null byte/,
    );
  });
});

describe("changed-files input parsing", () => {
  it("parses newline-delimited plain paths as modified files", () => {
    expect(
      parseChangedFilesInput("src/auth/session.ts\npnpm-lock.yaml\n"),
    ).toEqual([
      { path: "src/auth/session.ts", status: "modified" },
      { path: "pnpm-lock.yaml", status: "modified" },
    ]);
  });

  it("parses git --name-status lines including rename semantics", () => {
    expect(
      parseChangedFilesInput(
        "A\tsrc/auth/session.ts\nD\ttests/auth.test.ts\nR100\told.ts\tnew.ts\n",
      ),
    ).toEqual([
      { path: "src/auth/session.ts", status: "added" },
      { path: "tests/auth.test.ts", status: "deleted" },
      { path: "new.ts", previousPath: "old.ts", status: "renamed" },
    ]);
  });

  it("reads changed files from an input file", () => {
    const repo = setup();
    const inputPath = join(repo, "changed-files.txt");
    writeFileSync(inputPath, "A\tsupabase/functions/send.ts\n", "utf8");

    expect(getChangedFilesFromInput(inputPath)).toEqual([
      { path: "supabase/functions/send.ts", status: "added" },
    ]);
  });
});
