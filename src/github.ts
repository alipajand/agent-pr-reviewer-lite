import { readFileSync } from "node:fs";

export const COMMENT_MARKER = "<!-- agent-pr-reviewer-lite -->";

/** GitHub rejects issue comments longer than 65,536 characters. */
const MAX_COMMENT_LENGTH = 65_000;
const TRUNCATION_NOTE =
  "\n\n_Report truncated to fit GitHub's comment size limit. Run the CLI locally for the full list._";

/** Comments fetched per page, and the most pages scanned for an existing report. */
const COMMENTS_PER_PAGE = 100;
const MAX_COMMENT_PAGES = 50;

type FetchFn = typeof fetch;

// ---------------------------------------------------------------------------
// Event payload helpers
// ---------------------------------------------------------------------------

/**
 * Extract the PR number from a parsed GitHub event payload.
 * Returns null if the payload does not look like a pull_request event.
 */
export function getPrNumber(eventPayload: unknown): number | null {
  if (typeof eventPayload !== "object" || eventPayload === null) return null;
  const pr = (eventPayload as Record<string, unknown>)["pull_request"];
  if (typeof pr !== "object" || pr === null) return null;
  const num = (pr as Record<string, unknown>)["number"];
  if (typeof num !== "number" || !Number.isInteger(num) || num < 1) return null;
  return num;
}

/**
 * Read and parse the GitHub event payload from disk.
 * Returns null on any read or parse error.
 */
export function readEventPayload(eventPath: string): unknown {
  try {
    return JSON.parse(readFileSync(eventPath, "utf8"));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Comment body
// ---------------------------------------------------------------------------

/**
 * Prepend the bot-identification marker to the markdown string so that
 * subsequent runs can find and update the comment instead of creating a new one.
 */
export function buildCommentBody(markdown: string): string {
  const body = `${COMMENT_MARKER}\n${markdown}`;
  if (body.length <= MAX_COMMENT_LENGTH) return body;
  return (
    body.slice(0, MAX_COMMENT_LENGTH - TRUNCATION_NOTE.length) + TRUNCATION_NOTE
  );
}

// ---------------------------------------------------------------------------
// GitHub API calls
// ---------------------------------------------------------------------------

export type GitHubComment = {
  id: number;
  body?: string | null;
  user?: { login?: string; type?: string } | null;
};

/**
 * True for a report comment this tool posted earlier. Anyone can paste the
 * marker into their own comment, so matching on it alone would let a user bait
 * the bot into overwriting their comment with the report — which they could
 * then edit. The comment must start with the marker and be written by
 * `authorLogin` when given, or otherwise by a bot account (`GITHUB_TOKEN`
 * posts as `github-actions[bot]`).
 */
export function isOwnReportComment(
  comment: GitHubComment,
  authorLogin?: string,
): boolean {
  if (typeof comment.body !== "string") return false;
  if (!comment.body.startsWith(COMMENT_MARKER)) return false;
  if (authorLogin) return comment.user?.login === authorLogin;
  return comment.user?.type === "Bot";
}

/**
 * Find an existing report comment on the PR (see `isOwnReportComment`), then
 * update it or create a new one.
 *
 * Accepts an optional `fetchFn` for dependency injection in tests.
 */
export async function postOrUpdateComment(opts: {
  token: string;
  repository: string;
  prNumber: number;
  body: string;
  authorLogin?: string;
  fetchFn?: FetchFn;
}): Promise<void> {
  const { token, repository, prNumber, body, authorLogin } = opts;
  const fetchImpl = opts.fetchFn ?? fetch;

  const [owner, repo] = repository.split("/");
  const base = "https://api.github.com";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  // 1. Page through PR comments (PR comments use the Issues API) looking for
  //    an earlier report; the default page size of 30 would miss it on busy PRs.
  let existing: GitHubComment | undefined;
  for (let page = 1; page <= MAX_COMMENT_PAGES && !existing; page++) {
    const listRes = await fetchImpl(
      `${base}/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=${COMMENTS_PER_PAGE}&page=${page}`,
      { headers },
    );
    if (!listRes.ok) {
      throw new Error(
        `GitHub API error listing comments: ${listRes.status} ${listRes.statusText}`,
      );
    }
    const comments = (await listRes.json()) as GitHubComment[];
    if (!Array.isArray(comments)) break;

    // 2. Look for an existing report comment we own
    existing = comments.find((c) => isOwnReportComment(c, authorLogin));
    if (comments.length < COMMENTS_PER_PAGE) break;
  }

  if (existing) {
    // 3a. Update the existing comment
    const updateRes = await fetchImpl(
      `${base}/repos/${owner}/${repo}/issues/comments/${existing.id}`,
      { method: "PATCH", headers, body: JSON.stringify({ body }) },
    );
    if (!updateRes.ok) {
      throw new Error(
        `GitHub API error updating comment ${existing.id}: ${updateRes.status} ${updateRes.statusText}`,
      );
    }
  } else {
    // 3b. Create a new comment
    const createRes = await fetchImpl(
      `${base}/repos/${owner}/${repo}/issues/${prNumber}/comments`,
      { method: "POST", headers, body: JSON.stringify({ body }) },
    );
    if (!createRes.ok) {
      throw new Error(
        `GitHub API error creating comment: ${createRes.status} ${createRes.statusText}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// High-level helper called from the CLI
// ---------------------------------------------------------------------------

/**
 * Return true when `value` matches the `owner/repo` format expected by the
 * GitHub API.  The owner and repo segments may contain letters, digits,
 * hyphens, underscores, and dots — but must each be non-empty and there must
 * be exactly one `/` separator.
 */
export function isValidRepository(value: string): boolean {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);
}

/**
 * Post or update a PR comment if all required environment variables are present
 * and the event payload contains a pull_request.number.
 *
 * Silently skips when prerequisites are not met so local runs are unaffected.
 * Skips with a warning when GITHUB_REPOSITORY is not in owner/repo format.
 * Accepts optional `fetchFn` for testing without live network calls.
 */
export async function tryPostGitHubComment(
  markdown: string,
  fetchFn?: FetchFn,
  authorLogin?: string,
): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const eventPath = process.env.GITHUB_EVENT_PATH;

  if (!token || !repository || !eventPath) return;

  if (!isValidRepository(repository)) {
    process.stderr.write(
      `Warning: GITHUB_REPOSITORY "${repository}" is not in owner/repo format; skipping comment.\n`,
    );
    return;
  }

  const payload = readEventPayload(eventPath);
  const prNumber = getPrNumber(payload);
  if (prNumber === null) return;

  const body = buildCommentBody(markdown);
  await postOrUpdateComment({
    token,
    repository,
    prNumber,
    body,
    authorLogin,
    fetchFn,
  });
}
