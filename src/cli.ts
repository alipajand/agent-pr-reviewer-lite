#!/usr/bin/env node
import { Command } from "commander";
import { loadConfig, isIgnored } from "./config.js";
import { getChangedFiles } from "./git.js";
import { buildReport, shouldFail } from "./risk.js";
import { DEFAULT_RULES, buildExtraRules } from "./rules.js";
import { renderText } from "./reporters/text.js";
import { renderJson } from "./reporters/json.js";
import { renderMarkdown } from "./reporters/markdown.js";
import type { CliOptions, OutputFormat, RenderOptions, RiskLevel } from "./types.js";

const VALID_FORMATS: OutputFormat[] = ["text", "json", "markdown"];
const VALID_RISK_LEVELS: RiskLevel[] = ["low", "medium", "high"];

function assertOutputFormat(value: string): OutputFormat {
  if (!VALID_FORMATS.includes(value as OutputFormat)) {
    console.error(`Error: --format must be one of: ${VALID_FORMATS.join(", ")}`);
    process.exit(1);
  }
  return value as OutputFormat;
}

function assertRiskLevel(value: string): RiskLevel {
  if (!VALID_RISK_LEVELS.includes(value as RiskLevel)) {
    console.error(`Error: --fail-on must be one of: ${VALID_RISK_LEVELS.join(", ")}`);
    process.exit(1);
  }
  return value as RiskLevel;
}

async function main() {
  const program = new Command();

  program
    .name("agent-pr-reviewer-lite")
    .description("Deterministic PR risk reviewer for agent-generated code changes")
    .version("0.1.0")
    // --config is optional; if omitted, auto-discover from cwd
    .option("--config <path>", "Path to config file (default: agent-pr-reviewer-lite.config.json in cwd)")
    // --base and --fail-on intentionally have no Commander default so config values win
    .option("--base <ref>", "Base git ref to compare from")
    .option("--head <ref>", "Head git ref to compare to", "HEAD")
    .option("--format <format>", "Output format: text, json, or markdown", "text")
    .option("--fail-on <level>", "Exit with code 1 when risk >= this level (low|medium|high)")
    .action(async (opts) => {
      // Load config (throws on parse errors; returns null when file absent)
      let config = null;
      try {
        config = loadConfig(opts.config as string | undefined);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error: ${msg}`);
        process.exit(2);
      }

      // CLI flags > config values > built-in defaults
      const options: CliOptions = {
        base: (opts.base as string | undefined) ?? config?.base ?? "main",
        head: opts.head as string,
        format: assertOutputFormat(opts.format as string),
        failOn: assertRiskLevel(
          (opts.failOn as string | undefined) ?? config?.failOn ?? "high"
        ),
      };

      const ignorePatterns = config?.ignore ?? [];
      const extraRules = config?.extraRiskPaths
        ? buildExtraRules(config.extraRiskPaths)
        : [];
      const rules = [...DEFAULT_RULES, ...extraRules];

      let allFiles;
      try {
        allFiles = getChangedFiles(options.base, options.head);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Error: ${message}`);
        process.exit(2);
      }

      // Apply ignore patterns before building the report
      const files = ignorePatterns.length > 0
        ? allFiles.filter((f) => !isIgnored(f.path, ignorePatterns))
        : allFiles;

      const report = buildReport(options.base, options.head, files, rules);
      const failed = shouldFail(report.overallRisk, options.failOn);

      const renderOpts: RenderOptions = {
        failOn: options.failOn,
        result: failed ? "failed" : "passed",
      };

      if (options.format === "json") {
        console.log(renderJson(report, renderOpts));
      } else if (options.format === "markdown") {
        console.log(renderMarkdown(report, renderOpts));
      } else {
        console.log(renderText(report, renderOpts));
      }

      if (failed) {
        process.exit(1);
      }
    });

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(2);
});
