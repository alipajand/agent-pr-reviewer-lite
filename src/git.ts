import { execFileSync } from "node:child_process";
import type { ChangedFile, ChangeStatus } from "./types.js";

/** Files whose diff content we want to capture for content-inspection rules. */
const CONTENT_INSPECT_FILES = new Set(["package.json"]);

/**
 * Reject refs containing null bytes before they reach execFileSync, which
 * would throw its own lower-level error. Keeps the error message consistent.
 */
function assertNoNullBytes(value: string, name: string): void {
  if (value.includes("\x00")) {
    throw new Error(`Failed to run git diff: ${name} contains a null byte`);
  }
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
 *
 * execFileSync("git", args) never invokes a shell — filePath is passed
 * directly to git as a separate argv element, so no quoting or escaping
 * is required.
 */
function getAddedLines(base: string, head: string, filePath: string): string[] {
  try {
    const output = execFileSync(
      "git",
      ["diff", `${base}...${head}`, "--", filePath],
      { encoding: "utf8" },
    );
    const added: string[] = [];
    for (const line of output.split("\n")) {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        added.push(line.slice(1));
      }
    }
    return added;
  } catch {
    return [];
  }
}

/**
 * Return all files changed between base and head.
 *
 * execFileSync("git", args) executes git directly without a shell, so
 * shell metacharacters in base or head are inert — git receives them as
 * literal string arguments and rejects unknown refs normally.
 */
export function getChangedFiles(base: string, head: string): ChangedFile[] {
  assertNoNullBytes(base, "--base");
  assertNoNullBytes(head, "--head");

  let output: string;
  try {
    output = execFileSync(
      "git",
      ["diff", "--name-status", `${base}...${head}`],
      { encoding: "utf8" },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to run git diff: ${message}`);
  }

  const lines = output.trim().split("\n").filter(Boolean);
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
