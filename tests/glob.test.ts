import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileGlob, globMatch } from "../src/glob.js";
import { globToRegex, loadConfig } from "../src/config.js";

// Deterministic PRNG so the differential test is reproducible.
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function randomString(next: () => number, alphabet: string[], max: number) {
  const length = Math.floor(next() * (max + 1));
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(next() * alphabet.length)];
  }
  return out;
}

describe("compileGlob", () => {
  it("matches the documented glob forms", () => {
    expect(globMatch("src/*.ts", "src/index.ts")).toBe(true);
    expect(globMatch("src/*.ts", "src/a/index.ts")).toBe(false);
    expect(globMatch("docs/**", "docs")).toBe(true);
    expect(globMatch("docs/**", "docs/a/b.md")).toBe(true);
    expect(globMatch("**/renewals/**", "apps/web/renewals/page.tsx")).toBe(
      true,
    );
    expect(globMatch("**/renewals/**", "renewals")).toBe(true);
    expect(globMatch("a/**/b", "a/b")).toBe(true);
    expect(globMatch("a/**/b", "a/x/y/b")).toBe(true);
    expect(globMatch("a/**/b", "a/x/y/c")).toBe(false);
    expect(globMatch("file.ts", "fileXts")).toBe(false);
  });

  it("lets ** span newlines in file names", () => {
    expect(globMatch("infra/**", "infra/a\nb.tf")).toBe(true);
    expect(globToRegex("infra/**").test("infra/a\nb.tf")).toBe(true);
  });

  it("agrees with globToRegex on random patterns and paths", () => {
    const next = lcg(20260924);
    const patternAlphabet = ["a", "b", "/", "*", "**", "**/", "/**", "."];
    const pathAlphabet = ["a", "b", "/", "."];

    for (let i = 0; i < 3000; i++) {
      const pattern = randomString(next, patternAlphabet, 6);
      const path = randomString(next, pathAlphabet, 10);
      const expected = globToRegex(pattern).test(path);
      expect(
        compileGlob(pattern)(path),
        `pattern ${JSON.stringify(pattern)} path ${JSON.stringify(path)}`,
      ).toBe(expected);
    }
  });

  it("stays fast on patterns that make the regex backtrack exponentially", () => {
    const cases: Array<[string, string]> = [
      ["*a*a*a*a*a*a*a*b", "a".repeat(4000)],
      ["**/**/**/**/**/**/**/**/**/x", "a/".repeat(2000) + "y"],
    ];
    for (const [pattern, path] of cases) {
      const started = performance.now();
      expect(compileGlob(pattern)(path)).toBe(false);
      expect(performance.now() - started).toBeLessThan(500);
    }
  });
});

describe("loadConfig — file guards", () => {
  it("rejects a config path that is a directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "apr-config-guard-"));
    try {
      mkdirSync(join(dir, "agent-pr-reviewer-lite.config.json"));
      expect(() => loadConfig(undefined, dir)).toThrow(/not a regular file/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
