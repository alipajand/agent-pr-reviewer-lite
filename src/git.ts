import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { ChangedFile, ChangeStatus } from "./types.js";

/** Files whose diff content we want to capture for content-inspection rules. */
const CONTENT_INSPECT_FILES = new Set(["package.json"]);

/** Large monorepo diffs exceed Node's 1 MiB default; beyond this, fail loudly. */
const MAX_GIT_OUTPUT_BYTES = 64 * 1024 * 1024;

/**
 * Reject refs containing null bytes before they reach execFileSync, which
 * would throw its own lower-level error. Keeps the error message consistent.
 */
function assertNoNullBytes(value: string, name: string): void {
  if (value.includes("\x00")) {
    throw new Error(`Failed to run git diff: ${name} contains a null byte`);
  }
}

/**
 * Refs can come from the config file of the repository under review, so a
 * value such as `--output=/some/file` must never reach git as an option.
 * `--end-of-options` is passed as well; this check gives a clear error first.
 */
function assertSafeRef(value: string, name: string): void {
  assertNoNullBytes(value, name);
  if (value.trim() === "") {
    throw new Error(`Failed to run git diff: ${name} is empty`);
  }
  if (value.startsWith("-")) {
    throw new Error(
      `Failed to run git diff: ${name} must be a git ref, not an option ("${value}")`,
    );
  }
  if (/[\x00-\x1f\x7f]/.test(value)) {
    throw new Error(
      `Failed to run git diff: ${name} contains a control character`,
    );
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

function toChangeStatus(statusCode: string): ChangeStatus {
  switch (statusCode.charAt(0)) {
    case "A":
    case "C":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    default:
      return "modified";
  }
}

/**
 * Parse `git diff --name-status -z` output. NUL-separated output is used
 * because git otherwise quotes and octal-escapes unusual paths
 * (`"supabase/migrations/\303\274.sql"`), which would slip past anchored
 * rule patterns such as `^supabase/migrations/`.
 */
export function parseNameStatusZ(output: string): ChangedFile[] {
  const tokens = output.split("\0");
  const files: ChangedFile[] = [];

  let i = 0;
  while (i < tokens.length) {
    const statusCode = tokens[i++]?.trim();
    if (!statusCode) continue;

    const status = toChangeStatus(statusCode);
    if (statusCode.startsWith("R") || statusCode.startsWith("C")) {
      const previousPath = tokens[i++];
      const path = tokens[i++];
      if (!previousPath || !path) break;
      files.push(
        status === "renamed"
          ? { path, previousPath, status }
          : { path, status },
      );
      continue;
    }

    const path = tokens[i++];
    if (!path) break;
    files.push({ path, status });
  }

  return files;
}

export function parseChangedFilesInput(input: string): ChangedFile[] {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parsed = parseNameStatus(line);
      if (parsed) return parsed;
      return { path: line, status: "modified" as const };
    });
}

export function getChangedFilesFromInput(source: string): ChangedFile[] {
  const content =
    source === "-" ? readFileSync(0, "utf8") : readFileSync(source, "utf8");
  return parseChangedFilesInput(content);
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
    // Plain unified diff regardless of user or repo config: no colour codes,
    // external diff drivers, or textconv filters that could hide added lines.
    const output = execFileSync(
      "git",
      [
        "diff",
        "--no-color",
        "--no-ext-diff",
        "--no-textconv",
        "--end-of-options",
        `${base}...${head}`,
        "--",
        filePath,
      ],
      { encoding: "utf8", maxBuffer: MAX_GIT_OUTPUT_BYTES },
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
  assertSafeRef(base, "--base");
  assertSafeRef(head, "--head");

  let output: string;
  try {
    output = execFileSync(
      "git",
      [
        "diff",
        "--name-status",
        "-z",
        "--no-color",
        "--end-of-options",
        `${base}...${head}`,
      ],
      { encoding: "utf8", maxBuffer: MAX_GIT_OUTPUT_BYTES },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to run git diff: ${message}`);
  }

  const files = parseNameStatusZ(output);

  for (const file of files) {
    if (CONTENT_INSPECT_FILES.has(file.path) && file.status !== "deleted") {
      file.addedLines = getAddedLines(base, head, file.path);
    }
  }

  return files;
}
