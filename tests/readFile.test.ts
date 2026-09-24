import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRegularFileSync } from "../src/readFile.js";
import { markdownCodeCell } from "../src/reporters/shared.js";

describe("readRegularFileSync", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "apr-read-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reports why a file was not read", () => {
    const file = join(dir, "a.json");
    writeFileSync(file, "{}");
    expect(readRegularFileSync(file, 10)).toEqual({
      status: "ok",
      content: "{}",
    });
    expect(readRegularFileSync(file, 1)).toEqual({ status: "too-large" });
    expect(readRegularFileSync(dir, 10)).toEqual({ status: "not-a-file" });
    expect(readRegularFileSync(join(dir, "nope"), 10)).toEqual({
      status: "missing",
    });
  });

  it.skipIf(process.platform === "win32")("does not wait on a FIFO", () => {
    const fifo = join(dir, "pipe.json");
    execFileSync("mkfifo", [fifo]);
    expect(readRegularFileSync(fifo, 10)).toEqual({ status: "not-a-file" });
  });
});

describe("markdownCodeCell", () => {
  it("keeps a backslash from cancelling the pipe escape", () => {
    expect(markdownCodeCell("a\\|b")).toBe("`a\\\\\\|b`");
    expect(markdownCodeCell("a\\\\|b")).toBe("`a\\\\\\\\\\|b`");
  });

  it("leaves other backslashes as written", () => {
    expect(markdownCodeCell("src\\win\\path.ts")).toBe("`src\\win\\path.ts`");
  });

  it("stays fast on a long backslash run", () => {
    const start = Date.now();
    markdownCodeCell("\\".repeat(200_000));
    expect(Date.now() - start).toBeLessThan(1000);
  });
});
