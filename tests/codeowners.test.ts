import { describe, it, expect } from "vitest";
import {
  codeownersGlobs,
  ownersFor,
  parseCodeowners,
} from "../src/codeowners.js";

// Examples from GitHub's CODEOWNERS documentation.
const CODEOWNERS = `
# Default owners for everything
*       @global-owner

# Order matters: the last matching pattern wins.
*.js    @js-owner  # inline comment
/build/logs/ @doctocat
docs/*  docs@example.com
apps/   @octocat
/apps/github @doctocat
**/logs @logs-owner
/scripts/ @doctocat @octocat
/unowned/
`;

const rules = parseCodeowners(CODEOWNERS);
const owners = (path: string) => ownersFor(rules, path);

describe("CODEOWNERS matching", () => {
  it.each([
    ["README.md", ["@global-owner"]],
    ["src/index.js", ["@js-owner"]],
    // `**/logs` appears later and also matches, so it wins.
    ["build/logs/app.log", ["@logs-owner"]],
    ["build/logs/deep/app.log", ["@logs-owner"]],
    ["build/output.txt", ["@global-owner"]],
    ["docs/getting-started.md", ["docs@example.com"]],
    ["docs/build-app/troubleshooting.md", ["@global-owner"]],
    ["apps/web/index.ts", ["@octocat"]],
    ["packages/apps/web/index.ts", ["@octocat"]],
    ["apps/github/index.ts", ["@doctocat"]],
    ["deploy/logs/out.txt", ["@logs-owner"]],
    ["scripts/release.sh", ["@doctocat", "@octocat"]],
    ["unowned/file.txt", []],
  ])("%s → %j", (path, expected) => {
    expect(owners(path)).toEqual(expected);
  });

  it("returns no owners without rules", () => {
    expect(ownersFor([], "src/a.ts")).toEqual([]);
  });
});

describe("codeownersGlobs", () => {
  it.each([
    ["*.js", ["**/*.js"]],
    ["/build/logs/", ["build/logs/**"]],
    ["docs/*", ["docs/*"]],
    ["apps/", ["**/apps/**"]],
    ["/apps/github", ["apps/github", "apps/github/**"]],
  ])("%s", (pattern, globs) => {
    expect(codeownersGlobs(pattern)).toEqual(globs);
  });
});

describe("CODEOWNERS comment handling", () => {
  it("strips comments that start a line or follow whitespace", () => {
    const rules = parseCodeowners(
      "# header\n/docs/ @docs # trailing\n/a#b/ @hash\n",
    );
    expect(rules.map((r) => [r.pattern, r.owners])).toEqual([
      ["/docs/", ["@docs"]],
      ["/a#b/", ["@hash"]],
    ]);
  });

  it("stays fast on hostile comment input", () => {
    const line = " # ".repeat(50_000);
    const start = Date.now();
    parseCodeowners(line);
    expect(Date.now() - start).toBeLessThan(1000);
  });
});
