#!/usr/bin/env node
import { Command } from "commander";
import { getChangedFiles } from "./git.js";
import { buildReport, shouldFail } from "./risk.js";
import { renderText } from "./reporters/text.js";
import { renderJson } from "./reporters/json.js";
import type { CliOptions, OutputFormat, RiskLevel } from "./types.js";

const VALID_FORMATS: OutputFormat[] = ["text", "json"];
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
    .option("--base <ref>", "Base git ref to compare from", "main")
    .option("--head <ref>", "Head git ref to compare to", "HEAD")
    .option("--format <format>", "Output format: text or json", "text")
    .option("--fail-on <level>", "Exit with code 1 when risk >= this level (low|medium|high)", "high")
    .action(async (opts) => {
      const options: CliOptions = {
        base: opts.base as string,
        head: opts.head as string,
        format: assertOutputFormat(opts.format as string),
        failOn: assertRiskLevel(opts.failOn as string),
      };

      let files;
      try {
        files = getChangedFiles(options.base, options.head);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Error: ${message}`);
        process.exit(2);
      }

      const report = buildReport(options.base, options.head, files);

      if (options.format === "json") {
        console.log(renderJson(report));
      } else {
        console.log(renderText(report));
      }

      if (shouldFail(report.overallRisk, options.failOn)) {
        process.exit(1);
      }
    });

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(2);
});
