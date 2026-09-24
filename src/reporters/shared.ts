import type {
  RenderOptions,
  ReviewReport,
  RiskFinding,
  RiskLevel,
} from "../types.js";

export function capitalize(level: RiskLevel): string {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

export function displayText(finding: RiskFinding): string {
  return finding.id === "dependency-added" ? finding.reason : finding.label;
}

export function deduplicate(findings: RiskFinding[]): RiskFinding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.id}\0${f.file}\0${f.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function requiredReviewLabels(findings: RiskFinding[]): string[] {
  const labels = new Set<string>();
  for (const f of findings) {
    if (f.requiredReview) labels.add(f.requiredReview);
  }
  return [...labels].sort();
}

/** Owners per required-review label, merged across findings and sorted. */
export function reviewOwners(findings: RiskFinding[]): Map<string, string[]> {
  const byLabel = new Map<string, Set<string>>();
  for (const f of findings) {
    if (!f.requiredReview || !f.owners?.length) continue;
    const set = byLabel.get(f.requiredReview) ?? new Set<string>();
    f.owners.forEach((o) => set.add(o));
    byLabel.set(f.requiredReview, set);
  }
  return new Map([...byLabel].map(([label, set]) => [label, [...set].sort()]));
}

export function explainText(finding: RiskFinding): string | null {
  return finding.explain ?? null;
}

export function uniqueFindings(report: ReviewReport): RiskFinding[] {
  return deduplicate(report.findings);
}

export function shouldExplain(opts: RenderOptions): boolean {
  return opts.explain === true;
}

// All C0/C1 control characters, tab and newline included: file names from
// `git diff -z` can contain raw newlines and escape sequences.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

// Zero-width characters, bidi controls, and Unicode tag characters. Kept as
// numeric ranges so formatters cannot rewrite them into literal characters.
const INVISIBLE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x00ad, 0x00ad],
  [0x180e, 0x180e],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x2064],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
  [0xe0000, 0xe007f],
];

/**
 * Make text from the repository under review safe to print on one line.
 * Control characters become spaces, so a file name cannot start a new line
 * that GitHub Actions would read as a `::workflow-command::` or that a terminal
 * would interpret as an escape sequence. Invisible characters are shown as
 * `<U+XXXX>` so they cannot disguise a path.
 */
export function toSafeText(value: string): string {
  let out = "";
  for (const char of value.replace(CONTROL_CHARS, " ")) {
    const code = char.codePointAt(0) ?? 0;
    const invisible = INVISIBLE_RANGES.some(
      ([start, end]) => code >= start && code <= end,
    );
    out += invisible
      ? `<U+${code.toString(16).toUpperCase().padStart(4, "0")}>`
      : char;
  }
  return out;
}

/**
 * Escape a value for safe inclusion in a single Markdown table cell.
 * Pipes would otherwise be parsed as column separators, and newlines would
 * break the row. Built-in `--explain` text embeds `RegExp.toString()`, which
 * routinely contains `|` (alternation), so this is required for correct tables.
 * HTML is escaped so text such as `<!--` cannot hide the rest of the comment.
 */
export function escapeMarkdownCell(value: string): string {
  return toSafeText(value)
    .replace(/\\/g, "\\\\")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "\\|");
}

/**
 * Inline code for a Markdown table cell. The fence is longer than any backtick
 * run in the value, so a file name containing backticks cannot break out of
 * the span; inside it, HTML, links, and @mentions are inert.
 */
export function markdownCodeCell(value: string): string {
  const text = toSafeText(value);
  const longestRun = Math.max(
    0,
    ...(text.match(/`+/g) ?? []).map((run) => run.length),
  );
  const fence = "`".repeat(longestRun + 1);
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
  // GFM splits rows on `|` even inside code spans unless it is escaped, and
  // a backslash run before the pipe would cancel that escape, so each run is
  // doubled first. Only pipes are unescaped inside the span, so backslashes
  // elsewhere still display as written.
  return `${fence}${pad}${text}${pad}${fence}`
    .replace(/\\+/g, (run: string, offset: number, all: string) =>
      all[offset + run.length] === "|" ? run + run : run,
    )
    .replace(/\|/g, "\\|");
}

const DEPENDENCY_PREFIX = "Added dependency: ";

/** Finding text for Markdown; dependency names come from the diff, so they are code. */
export function markdownFindingText(finding: RiskFinding): string {
  if (
    finding.id === "dependency-added" &&
    finding.reason.startsWith(DEPENDENCY_PREFIX)
  ) {
    return `${DEPENDENCY_PREFIX}${markdownCodeCell(finding.reason.slice(DEPENDENCY_PREFIX.length))}`;
  }
  return escapeMarkdownCell(displayText(finding));
}

// Characters XML 1.0 forbids outright (tab, LF, and CR are allowed).
const XML_ILLEGAL_CHARS =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g;

export function escapeXml(value: string): string {
  return value
    .replace(XML_ILLEGAL_CHARS, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
