import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { ChangedFile, ChangeStatus } from "./types.js";

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

/** Added lines kept per file; enough for content rules without unbounded memory. */
const MAX_ADDED_LINES_PER_FILE = 5000;

const C_ESCAPES: Record<string, number> = {
  a: 7,
  b: 8,
  t: 9,
  n: 10,
  v: 11,
  f: 12,
  r: 13,
  '"': 34,
  "\\": 92,
};

/**
 * Undo git's C-style path quoting (`"sup\303\274.sql"`), used in diff headers
 * for paths with non-ASCII or special characters.
 */
export function unquoteGitPath(value: string): string {
  if (!value.startsWith('"') || !value.endsWith('"')) return value;
  // Code points, not UTF-16 units: with core.quotePath=false, raw
  // non-ASCII characters (including emoji) can appear inside the quotes.
  const chars = Array.from(value.slice(1, -1));
  const bytes: number[] = [];
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    if (char !== "\\") {
      bytes.push(...Buffer.from(char, "utf8"));
      continue;
    }
    const next = chars[i + 1] ?? "";
    if (/[0-7]/.test(next)) {
      bytes.push(parseInt(chars.slice(i + 1, i + 4).join(""), 8));
      i += 3;
    } else {
      bytes.push(C_ESCAPES[next] ?? next.charCodeAt(0));
      i += 1;
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

/**
 * Map each file in a unified diff to its added lines (without the leading
 * `+`). Paths come from the `+++ b/<path>` header, unquoted; deleted files
 * (`+++ /dev/null`) have no entry.
 */
export function parseAddedLines(diff: string): Map<string, string[]> {
  const byFile = new Map<string, string[]>();
  let current: string[] | null = null;

  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      current = null;
    } else if (line.startsWith("+++ ")) {
      const target = unquoteGitPath(line.slice(4));
      if (target === "/dev/null" || !target.startsWith("b/")) {
        current = null;
      } else {
        current = [];
        byFile.set(target.slice(2), current);
      }
    } else if (
      current &&
      line.startsWith("+") &&
      current.length < MAX_ADDED_LINES_PER_FILE
    ) {
      current.push(line.slice(1));
    }
  }
  return byFile;
}

/**
 * Added lines for every changed file, from one `git diff` call. Returns null
 * when the diff cannot be produced (for example when it exceeds the buffer),
 * so callers fall back to path-only rules.
 *
 * The diff is forced to a plain, predictable form regardless of user or repo
 * config: no colour, external diff drivers, textconv filters, or custom
 * prefixes that could hide added lines or change header paths.
 */
export function getAddedLinesByFile(
  base: string,
  head: string,
): Map<string, string[]> | null {
  try {
    const output = execFileSync(
      "git",
      [
        "diff",
        "--no-color",
        "--no-ext-diff",
        "--no-textconv",
        "--src-prefix=a/",
        "--dst-prefix=b/",
        "-U0",
        "--end-of-options",
        `${base}...${head}`,
      ],
      { encoding: "utf8", maxBuffer: MAX_GIT_OUTPUT_BYTES },
    );
    return parseAddedLines(output);
  } catch {
    return null;
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

  const addedLines = files.length > 0 ? getAddedLinesByFile(base, head) : null;
  for (const file of files) {
    if (file.status === "deleted") continue;
    const lines = addedLines?.get(file.path);
    if (lines) file.addedLines = lines;
  }

  return files;
}
