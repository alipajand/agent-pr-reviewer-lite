#!/usr/bin/env node
import { Command } from "commander";
import { loadConfig, isIgnored } from "./config.js";
import { getChangedFiles } from "./git.js";
import { tryPostGitHubComment } from "./github.js";
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
    console.error(
      `Error: --format "${value}" is not valid.\n` +
      `  Allowed values: ${VALID_FORMATS.join(", ")}\n` +
      `  Example: --format markdown`
    );
    process.exit(1);
  }
  return value as OutputFormat;
}

function assertRiskLevel(value: string): RiskLevel {
  if (!VALID_RISK_LEVELS.includes(value as RiskLevel)) {
    console.error(
      `Error: --fail-on "${value}" is not valid.\n` +
      `  Allowed values: ${VALID_RISK_LEVELS.join(", ")}\n` +
      `  Example: --fail-on high`
    );
    process.exit(1);
  }
  return value as RiskLevel;
}

async function main() {
  const program = new Command();

  program
    .name("agent-pr-reviewer-lite")
    .description(
      "Deterministic PR risk reviewer for agent-generated code changes.\n\n" +
      "Scans the git diff between two refs and flags files in risk-sensitive areas\n" +
      "(auth, billing, migrations, security, lockfiles, etc.) using built-in rules\n" +
      "and optional config-file rules. No LLM. No external API. Works offline."
    )
    .version("0.1.0")
    .option(
      "--config <path>",
      "Path to config JSON file. When omitted, the tool looks for\n" +
      "  agent-pr-reviewer-lite.config.json in the current directory."
    )
    .option(
      "--base <ref>",
      "Base git ref (branch, tag, or commit SHA) to compare from.\n" +
      "  Overrides the config file value. Default: main"
    )
    .option(
      "--head <ref>",
      "Head git ref to compare to.",
      "HEAD"
    )
    .option(
      "--format <format>",
      "Output format: text (human-readable), json (machine-readable),\n" +
      "  or markdown (GitHub PR comment).",
      "text"
    )
    .option(
      "--fail-on <level>",
      "Exit with code 1 when the overall risk is at or above this level.\n" +
      "  Allowed: low | medium | high. Overrides the config file value.\n" +
      "  Default: high"
    )
    .option(
      "--github-comment",
      "Post (or update) a Markdown report as a GitHub PR comment.\n" +
      "  Requires GITHUB_TOKEN, GITHUB_REPOSITORY, and GITHUB_EVENT_PATH\n" +
      "  environment variables and a pull_request event payload.\n" +
      "  Silently skipped when any prerequisite is missing (safe for local use)."
    )
    .addHelpText(
      "after",
      `
Exit codes:
  0  Risk is below the --fail-on threshold (or no risky files found)
  1  Risk meets or exceeds the --fail-on threshold
  2  Tool error: git command failed, config file invalid, or unexpected error

Examples:
  # Review current branch against main, fail if high risk
  agent-pr-reviewer-lite --base main --fail-on high

  # JSON output for downstream CI steps
  agent-pr-reviewer-lite --base origin/main --head HEAD --format json

  # Markdown report + PR comment (GitHub Actions)
  agent-pr-reviewer-lite --base origin/\$BASE_REF --format markdown --github-comment

  # Use a custom config file
  agent-pr-reviewer-lite --config path/to/my.config.json --base main`
    )
    .action(async (opts) => {
      let config = null;
      try {
        config = loadConfig(opts.config as string | undefined);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const path = opts.config ? `"${opts.config as string}"` : "agent-pr-reviewer-lite.config.json";
        console.error(
          `Error: Failed to load config file ${path}.\n` +
          `  ${msg}\n` +
          `  Make sure the file contains valid JSON.`
        );
        process.exit(2);
      }

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
        console.error(
          `Error: git command failed.\n` +
          `  ${message}\n` +
          `  Make sure "${options.base}" and "${options.head}" are valid git refs,\n` +
          `  and that you have fetched the base branch (git fetch origin ${options.base}).`
        );
        process.exit(2);
      }

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

      if (opts.githubComment) {
        const md = renderMarkdown(report, renderOpts);
        try {
          await tryPostGitHubComment(md);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`Warning: Failed to post GitHub comment: ${msg}`);
        }
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
