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
 * "Failed to run git diff" message (git could not resolve the ref) rather than
 * any sign of shell execution such as a filesystem side-effect or a different
 * error class.
 */

import { describe, it, expect } from "vitest";
import { getChangedFiles } from "../src/git.js";

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
  // redirect
  "main > /tmp/agent-pr-reviewer-lite-injection-test",
  // logical operator
  "main && echo pwned",
  "main || echo pwned",
  // newline injection
  "main\necho pwned",
  // null byte (belt-and-suspenders)
  "main\x00echo pwned",
];

describe("getChangedFiles — no shell injection via --base or --head", () => {
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
});
