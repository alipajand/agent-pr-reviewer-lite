/**
 * Security: git commands must not be built via shell-interpolated strings.
 *
 * getChangedFiles uses spawnSync("git", [...args]) so that shell metacharacters
 * in --base or --head are never interpreted by a shell. These tests verify that
 * values containing shell metacharacters produce a clean git error (unknown ref)
 * rather than executing arbitrary shell code.
 *
 * We cannot mock spawnSync here because we specifically want to exercise the
 * real OS-level exec path. The tests assert on the *type* of error thrown: a
 * "Failed to run git diff" message (git process exited non-zero), NOT with any
 * sign of shell execution such as a filesystem side-effect or a different error
 * class.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, unlinkSync } from "node:fs";
import { getChangedFiles } from "../src/git.js";

/** Sentinel file that the redirect payload would create if the shell ran it. */
const REDIRECT_SENTINEL = "/tmp/agent-pr-reviewer-lite-injection-test";

const SHELL_PAYLOADS = [
  // classic command substitution
  "$(echo pwned)",
  "`echo pwned`",
  // semicolon chaining
  "main; echo pwned",
  // pipe
  "main | cat /etc/passwd",
  // subshell
  "(echo pwned)",
  // redirect — if the shell executes this, REDIRECT_SENTINEL is created on disk
  `main > ${REDIRECT_SENTINEL}`,
  // logical operator
  "main && echo pwned",
  "main || echo pwned",
  // newline injection
  "main\necho pwned",
  // null byte (belt-and-suspenders)
  "main\x00echo pwned",
];

describe("getChangedFiles — no shell injection via --base or --head", () => {
  beforeAll(() => {
    // Remove the sentinel file before the suite so a stale file from a
    // previous run does not mask a real injection.
    if (existsSync(REDIRECT_SENTINEL)) unlinkSync(REDIRECT_SENTINEL);
  });

  afterAll(() => {
    // If shell injection occurred the sentinel file would exist — remove it to
    // keep the environment clean even when the assertion below already failed.
    if (existsSync(REDIRECT_SENTINEL)) unlinkSync(REDIRECT_SENTINEL);
  });

  for (const payload of SHELL_PAYLOADS) {
    it(`does not execute shell code when --base is: ${JSON.stringify(payload)}`, () => {
      // git cannot resolve a ref with shell metacharacters in it, so
      // getChangedFiles must throw. The important assertion is that it throws
      // with a "Failed to run git diff" message (git process exited non-zero),
      // NOT with an unrelated error or filesystem side-effect.
      expect(() => getChangedFiles(payload, "HEAD")).toThrow(/Failed to run git diff/);
    });

    it(`does not execute shell code when --head is: ${JSON.stringify(payload)}`, () => {
      expect(() => getChangedFiles("main", payload)).toThrow(/Failed to run git diff/);
    });
  }

  /**
   * Explicit filesystem side-effect check for the redirect payload.
   *
   * If getChangedFiles had passed the argument through a shell (e.g. via
   * execSync("git diff " + ref)), the shell would have interpreted `>` and
   * created REDIRECT_SENTINEL. Verifying the file is absent after all
   * shell-payload calls proves args are forwarded verbatim to the git process,
   * not interpreted by any shell.
   */
  it("redirect payload did not create a file on disk (args are not shell-expanded)", () => {
    // The redirect-payload cases above have already run; the sentinel must be absent.
    expect(existsSync(REDIRECT_SENTINEL)).toBe(false);
  });
});
