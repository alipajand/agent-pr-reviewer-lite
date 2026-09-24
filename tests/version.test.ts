import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { VERSION } from "../src/version.js";
import { renderSarif } from "../src/reporters/sarif.js";

describe("VERSION", () => {
  it("matches package.json", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    expect(VERSION).toBe(pkg.version);
  });

  it("is reported as the SARIF tool version", () => {
    const sarif = JSON.parse(
      renderSarif(
        {
          base: "main",
          head: "HEAD",
          overallRisk: "low",
          totalFiles: 0,
          findings: [],
        },
        { failOn: "high", result: "passed" },
      ),
    );
    expect(sarif.runs[0].tool.driver).toMatchObject({
      name: "agent-pr-reviewer-lite",
      version: VERSION,
      informationUri: "https://github.com/alipajand/agent-pr-reviewer-lite",
    });
  });
});
