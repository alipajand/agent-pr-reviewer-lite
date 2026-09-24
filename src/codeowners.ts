import { compileGlob } from "./glob.js";
import { readFileAtRef } from "./git.js";
import { readRegularFileSync } from "./readFile.js";

/** Where GitHub looks for CODEOWNERS, in order. */
export const CODEOWNERS_LOCATIONS = [
  ".github/CODEOWNERS",
  "CODEOWNERS",
  "docs/CODEOWNERS",
];

const MAX_CODEOWNERS_BYTES = 512 * 1024;

export type CodeownersRule = {
  pattern: string;
  owners: string[];
  matches: (path: string) => boolean;
};

/**
 * Translate a CODEOWNERS pattern (gitignore-style) into globs for
 * `compileGlob`. A leading `/`, or a `/` inside the pattern, anchors it to
 * the repository root; otherwise it matches at any depth. A pattern whose
 * last segment has no wildcard also covers everything under it when it names
 * a directory (`/apps/github` owns `apps/github/**`), while `docs/*` only
 * covers files directly inside `docs/`.
 */
export function codeownersGlobs(pattern: string): string[] {
  const trimmed = pattern.replace(/^\//, "");
  const anchored =
    pattern.startsWith("/") || trimmed.replace(/\/$/, "").includes("/");
  const directory = trimmed.endsWith("/");
  const body = trimmed.replace(/\/$/, "");
  const base = anchored ? body : `**/${body}`;

  if (directory) return [`${base}/**`];
  const last = body.split("/").pop() ?? "";
  return /[*?]/.test(last) ? [base] : [base, `${base}/**`];
}

/** Text before a `#` that starts the line or follows whitespace. */
function stripComment(line: string): string {
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
  }
  return line;
}

/** Parse CODEOWNERS text into rules, in file order. */
export function parseCodeowners(text: string): CodeownersRule[] {
  const rules: CodeownersRule[] = [];
  for (const raw of text.split("\n")) {
    const line = stripComment(raw).trim();
    if (!line) continue;
    const [pattern, ...owners] = line.split(/\s+/);
    const matchers = codeownersGlobs(pattern).map(compileGlob);
    rules.push({
      pattern,
      owners,
      matches: (path) => matchers.some((m) => m(path)),
    });
  }
  return rules;
}

/** Owners of `path`: the last matching rule wins, as on GitHub. */
export function ownersFor(rules: CodeownersRule[], path: string): string[] {
  let owners: string[] = [];
  for (const rule of rules) {
    if (rule.matches(path)) owners = rule.owners;
  }
  return owners;
}

function readWorkingTreeFile(path: string): string | null {
  try {
    const read = readRegularFileSync(path, MAX_CODEOWNERS_BYTES);
    return read.status === "ok" ? read.content : null;
  } catch {
    return null;
  }
}

/**
 * Load CODEOWNERS rules. With a `ref` (the PR base), the file is read from
 * that ref, since GitHub enforces the base branch's CODEOWNERS and a pull
 * request cannot change who owns its own files. Without one, or when git
 * cannot read it, the working tree is used. Returns [] when there is none.
 */
export function loadCodeowners(ref?: string): CodeownersRule[] {
  for (const location of CODEOWNERS_LOCATIONS) {
    let text: string | null;
    try {
      text = ref
        ? readFileAtRef(ref, location, MAX_CODEOWNERS_BYTES)
        : readWorkingTreeFile(location);
    } catch {
      // git could not read the ref at all (for example outside a checkout).
      text = readWorkingTreeFile(location);
    }
    if (text !== null) return parseCodeowners(text);
  }
  return [];
}
