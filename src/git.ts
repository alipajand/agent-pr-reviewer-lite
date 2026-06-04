import { spawnSync } from "node:child_process";
import type { ChangedFile, ChangeStatus } from "./types.js";

/** Files whose diff content we want to capture for content-inspection rules. */
const CONTENT_INSPECT_FILES = new Set(["package.json"]);

/**
 * Run git with an explicit args array so that base/head/filePath values are
 * never interpreted by a shell. Each element is passed directly to the git
 * process via execve — no quoting, escaping, or shell-injection risk.
 */
function runGit(args: string[]): { stdout: string; stderr: string; ok: boolean } {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.error) {
    return { stdout: "", stderr: result.error.message, ok: false };
  }
  if (result.status !== 0) {
    return { stdout: "", stderr: result.stderr ?? "", ok: false };
  }
  return { stdout: result.stdout, stderr: "", ok: true };
}

export function parseNameStatus(line: string): ChangedFile | null {
  const parts = line.split("\t");
  if (parts.length < 2) return null;

  const statusCode = parts[0].trim();

  if (statusCode.startsWith("R")) {
    const previousPath = parts[1];
    const path = parts[2];
    if (!previousPath || !path) return null;
    return { path, previousPath, status: "renamed" };
  }

  const path = parts[1];
  if (!path) return null;

  let status: ChangeStatus;
  switch (statusCode) {
    case "A":
      status = "added";
      break;
    case "M":
      status = "modified";
      break;
    case "D":
      status = "deleted";
      break;
    default:
      status = "modified";
  }

  return { path, status };
}

/**
 * Extract lines that were added (start with `+`) from a unified diff for a
 * specific file, excluding the diff header (`+++` lines).
 */
function getAddedLines(base: string, head: string, filePath: string): string[] {
  // filePath is a separate argument — no shell, no escaping needed
  const { stdout, ok } = runGit(["diff", `${base}...${head}`, "--", filePath]);
  if (!ok) return [];

  const added: string[] = [];
  for (const line of stdout.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      added.push(line.slice(1));
    }
  }
  return added;
}

/**
 * Reject refs containing null bytes before they reach spawnSync, which would
 * throw its own lower-level error. Keeps the error message consistent.
 */
function assertNoNullBytes(value: string, name: string): void {
  if (value.includes("\x00")) {
    throw new Error(`Failed to run git diff: ${name} contains a null byte`);
  }
}

export function getChangedFiles(base: string, head: string): ChangedFile[] {
  assertNoNullBytes(base, "--base");
  assertNoNullBytes(head, "--head");

  // base and head are passed as a single argument, not interpolated into a
  // shell string, so shell metacharacters in either value are inert.
  const { stdout, stderr, ok } = runGit(["diff", "--name-status", `${base}...${head}`]);
  if (!ok) {
    throw new Error(`Failed to run git diff: ${stderr}`);
  }

  const lines = stdout.trim().split("\n").filter(Boolean);
  const files: ChangedFile[] = [];

  for (const line of lines) {
    const file = parseNameStatus(line);
    if (!file) continue;

    if (CONTENT_INSPECT_FILES.has(file.path) && file.status !== "deleted") {
      file.addedLines = getAddedLines(base, head, file.path);
    }

    files.push(file);
  }

  return files;
}
