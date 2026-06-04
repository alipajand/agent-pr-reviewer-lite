import { readFileSync } from "node:fs";

export const COMMENT_MARKER = "<!-- agent-pr-reviewer-lite -->";

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
  return `${COMMENT_MARKER}\n${markdown}`;
}

// ---------------------------------------------------------------------------
// GitHub API calls
// ---------------------------------------------------------------------------

type GitHubComment = {
  id: number;
  body: string;
};

/**
 * Find an existing bot comment on the PR (one whose body contains COMMENT_MARKER),
 * then update it or create a new one.
 *
 * Accepts an optional `fetchFn` for dependency injection in tests.
 */
export async function postOrUpdateComment(opts: {
  token: string;
  repository: string;
  prNumber: number;
  body: string;
  fetchFn?: FetchFn;
}): Promise<void> {
  const { token, repository, prNumber, body } = opts;
  const fetchImpl = opts.fetchFn ?? fetch;

  const [owner, repo] = repository.split("/");
  const base = "https://api.github.com";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  // 1. List all PR comments (PR comments use the Issues API)
  const listRes = await fetchImpl(
    `${base}/repos/${owner}/${repo}/issues/${prNumber}/comments`,
    { headers }
  );
  if (!listRes.ok) {
    throw new Error(
      `GitHub API error listing comments: ${listRes.status} ${listRes.statusText}`
    );
  }
  const comments = (await listRes.json()) as GitHubComment[];

  // 2. Look for an existing bot comment
  const existing = comments.find((c) => c.body.includes(COMMENT_MARKER));

  if (existing) {
    // 3a. Update the existing comment
    const updateRes = await fetchImpl(
      `${base}/repos/${owner}/${repo}/issues/comments/${existing.id}`,
      { method: "PATCH", headers, body: JSON.stringify({ body }) }
    );
    if (!updateRes.ok) {
      throw new Error(
        `GitHub API error updating comment ${existing.id}: ${updateRes.status} ${updateRes.statusText}`
      );
    }
  } else {
    // 3b. Create a new comment
    const createRes = await fetchImpl(
      `${base}/repos/${owner}/${repo}/issues/${prNumber}/comments`,
      { method: "POST", headers, body: JSON.stringify({ body }) }
    );
    if (!createRes.ok) {
      throw new Error(
        `GitHub API error creating comment: ${createRes.status} ${createRes.statusText}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// High-level helper called from the CLI
// ---------------------------------------------------------------------------

/**
 * Post or update a PR comment if all required environment variables are present
 * and the event payload contains a pull_request.number.
 *
 * Silently skips when prerequisites are not met so local runs are unaffected.
 * Accepts optional `fetchFn` for testing without live network calls.
 */
export async function tryPostGitHubComment(
  markdown: string,
  fetchFn?: FetchFn
): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const eventPath = process.env.GITHUB_EVENT_PATH;

  if (!token || !repository || !eventPath) return;

  const payload = readEventPayload(eventPath);
  const prNumber = getPrNumber(payload);
  if (prNumber === null) return;

  const body = buildCommentBody(markdown);
  await postOrUpdateComment({ token, repository, prNumber, body, fetchFn });
}
