import { describe, it, expect, vi, afterEach } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  COMMENT_MARKER,
  getPrNumber,
  buildCommentBody,
  isValidRepository,
  postOrUpdateComment,
  tryPostGitHubComment,
} from "../src/github.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFetchOk(body: unknown = {}): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body,
  }) as unknown as typeof fetch;
}

function makeFetchFail(status = 403, statusText = "Forbidden"): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText,
    json: async () => ({}),
  }) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// isValidRepository
// ---------------------------------------------------------------------------

describe("isValidRepository", () => {
  it("accepts standard owner/repo format", () => {
    expect(isValidRepository("owner/repo")).toBe(true);
    expect(isValidRepository("my-org/my-repo")).toBe(true);
    expect(isValidRepository("alipajand/agent-pr-reviewer-lite")).toBe(true);
  });

  it("accepts names with dots, underscores, and digits", () => {
    expect(isValidRepository("my.org/my_repo123")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidRepository("")).toBe(false);
  });

  it("rejects a value with no slash", () => {
    expect(isValidRepository("just-a-name")).toBe(false);
  });

  it("rejects a value with more than one slash", () => {
    expect(isValidRepository("owner/repo/extra")).toBe(false);
  });

  it("rejects a value where the owner segment is empty", () => {
    expect(isValidRepository("/repo")).toBe(false);
  });

  it("rejects a value where the repo segment is empty", () => {
    expect(isValidRepository("owner/")).toBe(false);
  });

  it("rejects values with spaces", () => {
    expect(isValidRepository("owner /repo")).toBe(false);
    expect(isValidRepository("owner/ repo")).toBe(false);
  });

  it("rejects a bare slash", () => {
    expect(isValidRepository("/")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getPrNumber
// ---------------------------------------------------------------------------

describe("getPrNumber", () => {
  it("extracts the PR number from a valid pull_request payload", () => {
    expect(getPrNumber({ pull_request: { number: 42 } })).toBe(42);
  });

  it("returns null for a push event (no pull_request key)", () => {
    expect(getPrNumber({ ref: "refs/heads/main", after: "abc" })).toBeNull();
  });

  it("returns null when pull_request.number is a string", () => {
    expect(getPrNumber({ pull_request: { number: "42" } })).toBeNull();
  });

  it("returns null when pull_request.number is 0", () => {
    expect(getPrNumber({ pull_request: { number: 0 } })).toBeNull();
  });

  it("returns null when pull_request.number is negative", () => {
    expect(getPrNumber({ pull_request: { number: -1 } })).toBeNull();
  });

  it("returns null when payload is null", () => {
    expect(getPrNumber(null)).toBeNull();
  });

  it("returns null when payload is a primitive", () => {
    expect(getPrNumber("not-an-object")).toBeNull();
    expect(getPrNumber(42)).toBeNull();
  });

  it("returns null when pull_request is null", () => {
    expect(getPrNumber({ pull_request: null })).toBeNull();
  });

  it("returns null when pull_request has no number field", () => {
    expect(getPrNumber({ pull_request: { title: "My PR" } })).toBeNull();
  });

  it("handles large PR numbers", () => {
    expect(getPrNumber({ pull_request: { number: 9999 } })).toBe(9999);
  });
});

// ---------------------------------------------------------------------------
// buildCommentBody
// ---------------------------------------------------------------------------

describe("buildCommentBody", () => {
  it("prepends the COMMENT_MARKER on its own line", () => {
    const body = buildCommentBody("## Agent PR Risk: Low\nNo risky areas.");
    expect(body.startsWith(COMMENT_MARKER + "\n")).toBe(true);
  });

  it("contains the original markdown after the marker", () => {
    const md = "## Agent PR Risk: High\n- auth/session";
    const body = buildCommentBody(md);
    expect(body).toContain(md);
  });

  it("COMMENT_MARKER is the expected HTML comment string", () => {
    expect(COMMENT_MARKER).toBe("<!-- agent-pr-reviewer-lite -->");
  });

  it("marker and content are separated by exactly one newline", () => {
    const body = buildCommentBody("content");
    const [first, ...rest] = body.split("\n");
    expect(first).toBe(COMMENT_MARKER);
    expect(rest.join("\n")).toBe("content");
  });
});

// ---------------------------------------------------------------------------
// postOrUpdateComment — creates a new comment when none exists
// ---------------------------------------------------------------------------

describe("postOrUpdateComment — creates new comment", () => {
  it("calls list then POST when no existing bot comment is found", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200, statusText: "OK",
        json: async () => [],  // empty list — no existing comments
      })
      .mockResolvedValueOnce({
        ok: true, status: 201, statusText: "Created",
        json: async () => ({ id: 1, body: "new comment" }),
      }) as unknown as typeof fetch;

    await postOrUpdateComment({
      token: "ghs_token",
      repository: "owner/repo",
      prNumber: 7,
      body: "comment body",
      fetchFn,
    });

    expect(fetchFn).toHaveBeenCalledTimes(2);

    // First call: LIST comments
    const [listUrl, listOpts] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(listUrl).toBe("https://api.github.com/repos/owner/repo/issues/7/comments");
    expect(listOpts.headers?.Authorization).toBe("Bearer ghs_token");

    // Second call: POST new comment
    const [createUrl, createOpts] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(createUrl).toBe("https://api.github.com/repos/owner/repo/issues/7/comments");
    expect(createOpts.method).toBe("POST");
    expect(JSON.parse(createOpts.body as string)).toEqual({ body: "comment body" });
  });

  it("sends the correct Accept and API version headers", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;

    await postOrUpdateComment({
      token: "tok", repository: "a/b", prNumber: 1, body: "x", fetchFn,
    });

    const [, listOpts] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(listOpts.headers?.Accept).toBe("application/vnd.github+json");
    expect(listOpts.headers?.["X-GitHub-Api-Version"]).toBe("2022-11-28");
  });
});

// ---------------------------------------------------------------------------
// postOrUpdateComment — updates existing comment
// ---------------------------------------------------------------------------

describe("postOrUpdateComment — updates existing comment", () => {
  it("calls PATCH on the existing comment id when marker is found", async () => {
    const existingComments = [
      { id: 99, body: `${COMMENT_MARKER}\n## Old report` },
    ];
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => existingComments })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;

    await postOrUpdateComment({
      token: "tok", repository: "owner/repo", prNumber: 5,
      body: "updated body", fetchFn,
    });

    expect(fetchFn).toHaveBeenCalledTimes(2);
    const [patchUrl, patchOpts] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(patchUrl).toBe("https://api.github.com/repos/owner/repo/issues/comments/99");
    expect(patchOpts.method).toBe("PATCH");
    expect(JSON.parse(patchOpts.body as string)).toEqual({ body: "updated body" });
  });

  it("ignores non-bot comments and creates a new comment when marker absent", async () => {
    const existingComments = [
      { id: 55, body: "A human comment without the marker" },
    ];
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => existingComments })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;

    await postOrUpdateComment({
      token: "tok", repository: "a/b", prNumber: 3, body: "new", fetchFn,
    });

    const [, createOpts] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(createOpts.method).toBe("POST");
  });
});

// ---------------------------------------------------------------------------
// postOrUpdateComment — error handling
// ---------------------------------------------------------------------------

describe("postOrUpdateComment — error handling", () => {
  it("throws when the list request fails", async () => {
    const fetchFn = makeFetchFail(403, "Forbidden");
    await expect(
      postOrUpdateComment({ token: "t", repository: "a/b", prNumber: 1, body: "x", fetchFn })
    ).rejects.toThrow("403");
  });

  it("throws when the create request fails", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: false, status: 422, statusText: "Unprocessable Entity", json: async () => ({}) }) as unknown as typeof fetch;

    await expect(
      postOrUpdateComment({ token: "t", repository: "a/b", prNumber: 1, body: "x", fetchFn })
    ).rejects.toThrow("422");
  });

  it("throws when the update request fails", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 1, body: COMMENT_MARKER }] })
      .mockResolvedValueOnce({ ok: false, status: 404, statusText: "Not Found", json: async () => ({}) }) as unknown as typeof fetch;

    await expect(
      postOrUpdateComment({ token: "t", repository: "a/b", prNumber: 1, body: "x", fetchFn })
    ).rejects.toThrow("404");
  });
});

// ---------------------------------------------------------------------------
// tryPostGitHubComment — env-var guard
// ---------------------------------------------------------------------------

describe("tryPostGitHubComment — prerequisite checks", () => {
  afterEach(() => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.GITHUB_EVENT_PATH;
  });

  it("does nothing when GITHUB_TOKEN is absent", async () => {
    process.env.GITHUB_REPOSITORY = "owner/repo";
    process.env.GITHUB_EVENT_PATH = "/tmp/event.json";
    const fetchFn = makeFetchOk([]);
    await tryPostGitHubComment("## markdown", fetchFn);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("does nothing when GITHUB_REPOSITORY is absent", async () => {
    process.env.GITHUB_TOKEN = "tok";
    process.env.GITHUB_EVENT_PATH = "/tmp/event.json";
    const fetchFn = makeFetchOk([]);
    await tryPostGitHubComment("## markdown", fetchFn);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("does nothing when GITHUB_EVENT_PATH is absent", async () => {
    process.env.GITHUB_TOKEN = "tok";
    process.env.GITHUB_REPOSITORY = "owner/repo";
    const fetchFn = makeFetchOk([]);
    await tryPostGitHubComment("## markdown", fetchFn);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("does nothing when event file does not exist", async () => {
    process.env.GITHUB_TOKEN = "tok";
    process.env.GITHUB_REPOSITORY = "owner/repo";
    process.env.GITHUB_EVENT_PATH = "/nonexistent/path/event.json";
    const fetchFn = makeFetchOk([]);
    await tryPostGitHubComment("## markdown", fetchFn);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("does nothing when event payload has no pull_request", async () => {
    const eventFile = join(tmpdir(), `event-${Date.now()}.json`);
    writeFileSync(eventFile, JSON.stringify({ ref: "refs/heads/main" }));
    process.env.GITHUB_TOKEN = "tok";
    process.env.GITHUB_REPOSITORY = "owner/repo";
    process.env.GITHUB_EVENT_PATH = eventFile;
    const fetchFn = makeFetchOk([]);
    await tryPostGitHubComment("## markdown", fetchFn);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("skips and warns when GITHUB_REPOSITORY is not in owner/repo format", async () => {
    const eventFile = join(tmpdir(), `event-${Date.now()}.json`);
    writeFileSync(eventFile, JSON.stringify({ pull_request: { number: 5 } }));
    process.env.GITHUB_TOKEN = "tok";
    process.env.GITHUB_REPOSITORY = "not-a-valid-repo-format";
    process.env.GITHUB_EVENT_PATH = eventFile;

    const fetchFn = makeFetchOk([]);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await tryPostGitHubComment("## markdown", fetchFn);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(stderrWrite).toHaveBeenCalledWith(
      expect.stringContaining("owner/repo format")
    );

    stderrWrite.mockRestore();
  });

  it("skips and warns when GITHUB_REPOSITORY has too many slashes", async () => {
    const eventFile = join(tmpdir(), `event-${Date.now()}.json`);
    writeFileSync(eventFile, JSON.stringify({ pull_request: { number: 5 } }));
    process.env.GITHUB_TOKEN = "tok";
    process.env.GITHUB_REPOSITORY = "owner/repo/extra";
    process.env.GITHUB_EVENT_PATH = eventFile;

    const fetchFn = makeFetchOk([]);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await tryPostGitHubComment("## markdown", fetchFn);

    expect(fetchFn).not.toHaveBeenCalled();

    stderrWrite.mockRestore();
  });

  it("calls postOrUpdateComment when all prerequisites are satisfied", async () => {
    const eventFile = join(tmpdir(), `event-${Date.now()}.json`);
    writeFileSync(eventFile, JSON.stringify({ pull_request: { number: 12 } }));
    process.env.GITHUB_TOKEN = "ghs_token";
    process.env.GITHUB_REPOSITORY = "owner/repo";
    process.env.GITHUB_EVENT_PATH = eventFile;

    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;

    await tryPostGitHubComment("## Agent PR Risk: Low", fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(2);

    // Verify the body sent to GitHub contains the marker
    const [, createOpts] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[1];
    const sentBody = JSON.parse(createOpts.body as string).body as string;
    expect(sentBody).toContain(COMMENT_MARKER);
    expect(sentBody).toContain("## Agent PR Risk: Low");
  });
});
