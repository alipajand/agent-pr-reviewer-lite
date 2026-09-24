#!/usr/bin/env node
import { Command } from "commander";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { loadConfig, loadConfigFromRef, isIgnored } from "./config.js";
import { getChangedFiles, getChangedFilesFromInput } from "./git.js";
import { tryPostGitHubComment } from "./github.js";
import { buildReport, shouldFail } from "./risk.js";
import {
  BUILTIN_PRESET_NAMES,
  DEFAULT_RULES,
  REVIEWER_CONFIG_PATH,
  applyRuleSettings,
  buildExtraRules,
  buildPresetRules,
} from "./rules.js";
import { renderText } from "./reporters/text.js";
import { renderJson } from "./reporters/json.js";
import { renderMarkdown } from "./reporters/markdown.js";
import { renderSarif } from "./reporters/sarif.js";
import { renderJunit } from "./reporters/junit.js";
import { renderGithub } from "./reporters/github.js";
import { loadCodeowners, ownersFor } from "./codeowners.js";
import { VERSION } from "./version.js";
import type {
  ChangedFile,
  CliOptions,
  OutputFormat,
  PresetName,
  RenderOptions,
  RiskLevel,
} from "./types.js";

const VALID_FORMATS: OutputFormat[] = [
  "text",
  "json",
  "markdown",
  "sarif",
  "junit",
  "github",
];
const VALID_RISK_LEVELS: RiskLevel[] = ["low", "medium", "high"];

function collectPreset(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

function assertOutputFormat(value: string): OutputFormat {
  if (!VALID_FORMATS.includes(value as OutputFormat)) {
    console.error(
      `Error: --format "${value}" is not valid.\n` +
        `  Allowed values: ${VALID_FORMATS.join(", ")}\n` +
        `  Example: --format markdown`,
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
        `  Example: --fail-on high`,
    );
    process.exit(1);
  }
  return value as RiskLevel;
}

function assertPresets(values: string[]): PresetName[] {
  const invalid = values.filter(
    (value) => !BUILTIN_PRESET_NAMES.includes(value as PresetName),
  );
  if (invalid.length > 0) {
    console.error(
      `Error: --preset contains invalid value(s): ${invalid.join(", ")}.\n` +
        `  Allowed values: ${BUILTIN_PRESET_NAMES.join(", ")}\n` +
        `  Example: --preset nextjs-saas --preset stripe`,
    );
    process.exit(1);
  }
  return [...new Set(values)] as PresetName[];
}

/**
 * Repo-relative, forward-slash form of a custom `--config` path, or null when
 * it lives outside the working directory and so cannot appear in the diff.
 */
function customConfigDiffPath(configPath: string | undefined): string | null {
  if (!configPath) return null;
  const rel = relative(process.cwd(), resolve(configPath));
  if (
    rel === "" ||
    rel.startsWith(`..${sep}`) ||
    rel === ".." ||
    isAbsolute(rel)
  ) {
    return null;
  }
  return rel.split(sep).join("/");
}

/**
 * Ignore patterns come from the repository under review, so they must not be
 * able to hide a change to the reviewer's own config, and a rename is hidden
 * only when both its old and new paths are ignored.
 */
function filterIgnored(
  files: ChangedFile[],
  patterns: string[],
  protectedPaths: string[],
): ChangedFile[] {
  if (patterns.length === 0) return files;
  const isProtected = (p: string) =>
    REVIEWER_CONFIG_PATH.test(p) || protectedPaths.includes(p);
  return files.filter((f) => {
    const paths = [f.path, f.previousPath].filter(
      (p): p is string => p !== undefined,
    );
    if (paths.some(isProtected)) return true;
    return !paths.every((p) => isIgnored(p, patterns));
  });
}

export async function run(argv: string[] = process.argv): Promise<void> {
  const program = new Command();

  program
    .name("agent-pr-reviewer-lite")
    .description(
      "Deterministic PR risk reviewer for agent-generated code changes.\n\n" +
        "Scans the git diff between two refs and flags files in risk-sensitive areas\n" +
        "(auth, billing, migrations, security, lockfiles, etc.) using built-in rules\n" +
        "and optional config-file rules. No LLM. No external API. Works offline.",
    )
    .version(VERSION)
    .option(
      "--config <path>",
      "Path to config JSON file. When omitted, the tool looks for\n" +
        "  agent-pr-reviewer-lite.config.json in the current directory.",
    )
    .option(
      "--base <ref>",
      "Base git ref (branch, tag, or commit SHA) to compare from.\n" +
        "  Overrides the config file value. Default: main",
    )
    .option("--head <ref>", "Head git ref to compare to.", "HEAD")
    .option(
      "--config-ref <ref>",
      "Read the config file from this git ref (for example origin/main)\n" +
        "  instead of the working tree, so a pull request cannot change the\n" +
        "  settings that review it.",
    )
    .option(
      "--format <format>",
      "Output format: text (human-readable), json (machine-readable),\n" +
        "  markdown (GitHub PR comment), sarif, junit, or github (workflow annotations).",
      "text",
    )
    .option(
      "--fail-on <level>",
      "Exit with code 1 when the overall risk is at or above this level.\n" +
        "  Allowed: low | medium | high. Overrides the config file value.\n" +
        "  Default: high",
    )
    .option(
      "--preset <name>",
      "Apply a built-in preset rule pack. Repeatable.\n" +
        `  Allowed: ${BUILTIN_PRESET_NAMES.join(" | ")}`,
      collectPreset,
      [],
    )
    .option(
      "--changed-files <path>",
      "Read changed files from a newline-delimited file instead of git diff.\n" +
        "  Accepts plain paths or git --name-status lines. Use '-' for stdin.",
    )
    .option(
      "--explain",
      "Include deterministic rule-trigger details in human-readable output.",
    )
    .option(
      "--github-comment",
      "Post (or update) a Markdown report as a GitHub PR comment.\n" +
        "  Requires GITHUB_TOKEN, GITHUB_REPOSITORY, and GITHUB_EVENT_PATH\n" +
        "  environment variables and a pull_request event payload.\n" +
        "  Silently skipped when any prerequisite is missing (safe for local use).",
    )
    .option(
      "--github-comment-author <login>",
      "Only update an earlier report comment written by this login.\n" +
        "  Default: any bot account (GITHUB_TOKEN posts as github-actions[bot]).\n" +
        "  Set it when posting with a personal access token.",
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

  # SARIF for code-scanning style consumers
  agent-pr-reviewer-lite --base origin/main --format sarif

  # Read changed files from stdin
  git diff --name-status origin/main...HEAD | agent-pr-reviewer-lite --changed-files -

  # Markdown report + PR comment (GitHub Actions)
  agent-pr-reviewer-lite --base origin/\$BASE_REF --format markdown --github-comment

  # Use a custom config file
  agent-pr-reviewer-lite --config path/to/my.config.json --base main`,
    )
    .action(async (opts) => {
      let config = null;
      try {
        config = opts.configRef
          ? loadConfigFromRef(
              opts.configRef as string,
              opts.config as string | undefined,
            )
          : loadConfig(opts.config as string | undefined);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const path = opts.config
          ? `"${opts.config as string}"`
          : "agent-pr-reviewer-lite.config.json";
        console.error(
          `Error: Failed to load config file ${path}.\n` +
            `  ${msg}\n` +
            `  Make sure the file contains valid JSON.`,
        );
        process.exit(2);
      }

      const options: CliOptions = {
        base: (opts.base as string | undefined) ?? config?.base ?? "main",
        head: opts.head as string,
        format: assertOutputFormat(opts.format as string),
        failOn: assertRiskLevel(
          (opts.failOn as string | undefined) ?? config?.failOn ?? "high",
        ),
        changedFiles: opts.changedFiles as string | undefined,
        explain: Boolean(opts.explain),
        presets: assertPresets([
          ...((config?.presets ?? []) as string[]),
          ...((opts.preset as string[]) ?? []),
        ]),
      };

      const ignorePatterns = config?.ignore ?? [];
      const presetRules = (options.presets ?? []).length
        ? buildPresetRules(options.presets ?? [])
        : [];
      const extraRules = config?.extraRiskPaths
        ? buildExtraRules(config.extraRiskPaths)
        : [];
      const configDiffPath = customConfigDiffPath(
        opts.config as string | undefined,
      );
      const configRules = configDiffPath
        ? buildExtraRules([
            {
              id: "reviewer-config-changed",
              label: "PR risk reviewer config changed",
              severity: "high",
              patterns: [configDiffPath],
              requiredReview: "risk review policy",
            },
          ])
        : [];
      let rules;
      try {
        rules = applyRuleSettings(
          [...DEFAULT_RULES, ...configRules, ...presetRules, ...extraRules],
          config?.rules,
        );
      } catch (err) {
        console.error(
          `Error: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(2);
      }

      let allFiles;
      try {
        allFiles = options.changedFiles
          ? getChangedFilesFromInput(options.changedFiles)
          : getChangedFiles(options.base, options.head);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (options.changedFiles) {
          console.error(
            `Error: failed to read changed files input.\n` +
              `  ${message}\n` +
              `  Make sure "${options.changedFiles}" exists and contains newline-delimited paths or git --name-status lines.`,
          );
        } else {
          console.error(
            `Error: git command failed.\n` +
              `  ${message}\n` +
              `  Make sure "${options.base}" and "${options.head}" are valid git refs,\n` +
              `  and that you have fetched the base branch (git fetch origin ${options.base}).`,
          );
        }
        process.exit(2);
      }

      const files = filterIgnored(
        allFiles,
        ignorePatterns,
        configDiffPath ? [configDiffPath] : [],
      );

      const report = buildReport(options.base, options.head, files, rules);

      // GitHub enforces the base branch's CODEOWNERS, so read it from there.
      const codeowners = loadCodeowners(
        options.changedFiles ? undefined : options.base,
      );
      if (codeowners.length > 0) {
        report.findings = report.findings.map((f) => {
          const owners = ownersFor(codeowners, f.file);
          return owners.length > 0 ? { ...f, owners } : f;
        });
      }
      const failed = shouldFail(report.overallRisk, options.failOn);

      const renderOpts: RenderOptions = {
        failOn: options.failOn,
        result: failed ? "failed" : "passed",
        explain: options.explain,
      };

      if (options.format === "json") {
        console.log(renderJson(report, renderOpts));
      } else if (options.format === "markdown") {
        console.log(renderMarkdown(report, renderOpts));
      } else if (options.format === "sarif") {
        console.log(renderSarif(report, renderOpts));
      } else if (options.format === "junit") {
        console.log(renderJunit(report, renderOpts));
      } else if (options.format === "github") {
        console.log(renderGithub(report, renderOpts));
      } else {
        console.log(renderText(report, renderOpts));
      }

      if (opts.githubComment) {
        const md = renderMarkdown(report, renderOpts);
        try {
          await tryPostGitHubComment(
            md,
            undefined,
            opts.githubCommentAuthor as string | undefined,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`Warning: Failed to post GitHub comment: ${msg}`);
        }
      }

      if (failed) {
        process.exit(1);
      }
    });

  await program.parseAsync(argv);
}

/**
 * Auto-execute only when this file is invoked directly as the program
 * entrypoint (`node dist/cli.js`, `tsx src/cli.ts`, or the installed
 * `agent-pr-reviewer-lite` bin). When imported as a module (e.g. by tests)
 * `run` is not called, so callers control argv.
 *
 * `process.argv[1]` may be a symlink — npm/pnpm place the bin in
 * `node_modules/.bin/` — so it is resolved with `realpathSync` before being
 * compared to this module's real URL. Without this, the symlinked bin's path
 * never equals `import.meta.url` and the CLI silently does nothing.
 */
function isInvokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

const invokedDirectly = isInvokedDirectly();

if (invokedDirectly) {
  run().catch((err) => {
    console.error("Unexpected error:", err);
    process.exit(2);
  });
}
