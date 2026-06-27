import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BUILTIN_PRESET_NAMES } from "./rules.js";
import type { Config, ExtraRiskPath, PresetName, RiskLevel } from "./types.js";

export const CONFIG_FILE_NAME = "agent-pr-reviewer-lite.config.json";

// ---------------------------------------------------------------------------
// Glob matcher
// ---------------------------------------------------------------------------

/**
 * Convert a glob pattern to a RegExp.
 *
 * Supported: *, ** (cross-directory), prefix/suffix matching.
 * All other characters are treated as literals (dots are escaped, etc.).
 */
// Private-Use-Area sentinels — safe because file paths never contain these.
const T_DSTAR_SLASH = "\uE000"; // **/  → zero or more path-segment prefixes
const T_SLASH_DSTAR = "\uE001"; // /**  → optional trailing path
const T_DSTAR = "\uE002"; // **   → any chars including /
const T_STAR = "\uE003"; // *    → any chars except /

export function globToRegex(pattern: string): RegExp {
  // 1. Escape regex metacharacters, intentionally leaving * unescaped.
  let p = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");

  // 2. Tokenise ** variants before * so replacements don't collide.
  p = p.replace(/\*\*\//g, T_DSTAR_SLASH);
  p = p.replace(/\/\*\*/g, T_SLASH_DSTAR);
  p = p.replace(/\*\*/g, T_DSTAR);
  p = p.replace(/\*/g, T_STAR);

  // 3. Expand tokens to regex fragments.
  p = p.replace(/\uE000/g, "(?:[^/]+/)*"); // **/ → zero or more `segment/`
  p = p.replace(/\uE001/g, "(?:/.*)?"); // /** → optional `/rest`
  p = p.replace(/\uE002/g, ".*"); // **  → anything
  p = p.replace(/\uE003/g, "[^/]*"); // *   → no slashes

  return new RegExp(`^${p}$`);
}

/**
 * Returns true if `path` matches any of the given glob `patterns`.
 */
export function isIgnored(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => globToRegex(pattern).test(path));
}

// ---------------------------------------------------------------------------
// Config validation
// ---------------------------------------------------------------------------

function isValidRiskLevel(v: unknown): v is RiskLevel {
  return v === "low" || v === "medium" || v === "high";
}

function isValidPresetName(v: unknown): v is PresetName {
  return (
    typeof v === "string" && BUILTIN_PRESET_NAMES.includes(v as PresetName)
  );
}

function parseExtraRiskPath(item: unknown, index: number): ExtraRiskPath {
  if (typeof item !== "object" || item === null) {
    throw new Error(`config.extraRiskPaths[${index}] must be an object`);
  }
  const e = item as Record<string, unknown>;

  if (typeof e.id !== "string" || e.id.trim() === "") {
    throw new Error(
      `config.extraRiskPaths[${index}].id must be a non-empty string`,
    );
  }
  if (typeof e.label !== "string" || e.label.trim() === "") {
    throw new Error(
      `config.extraRiskPaths[${index}].label must be a non-empty string`,
    );
  }
  if (!isValidRiskLevel(e.severity)) {
    throw new Error(
      `config.extraRiskPaths[${index}].severity must be "low", "medium", or "high"`,
    );
  }
  if (
    !Array.isArray(e.patterns) ||
    e.patterns.length === 0 ||
    e.patterns.some((p) => typeof p !== "string")
  ) {
    throw new Error(
      `config.extraRiskPaths[${index}].patterns must be a non-empty array of strings`,
    );
  }

  const entry: ExtraRiskPath = {
    id: e.id,
    label: e.label,
    severity: e.severity,
    patterns: e.patterns as string[],
  };
  if (typeof e.requiredReview === "string") {
    entry.requiredReview = e.requiredReview;
  }
  return entry;
}

function parseConfig(raw: unknown): Config {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Config must be a JSON object");
  }
  const obj = raw as Record<string, unknown>;
  const config: Config = {};

  if ("base" in obj) {
    if (typeof obj.base !== "string") {
      throw new Error("config.base must be a string");
    }
    config.base = obj.base;
  }

  if ("failOn" in obj) {
    if (!isValidRiskLevel(obj.failOn)) {
      throw new Error('config.failOn must be "low", "medium", or "high"');
    }
    config.failOn = obj.failOn;
  }

  if ("ignore" in obj) {
    if (
      !Array.isArray(obj.ignore) ||
      obj.ignore.some((x) => typeof x !== "string")
    ) {
      throw new Error("config.ignore must be an array of strings");
    }
    config.ignore = obj.ignore as string[];
  }

  if ("presets" in obj) {
    if (
      !Array.isArray(obj.presets) ||
      obj.presets.some((preset) => !isValidPresetName(preset))
    ) {
      throw new Error(
        `config.presets must be an array containing only: ${BUILTIN_PRESET_NAMES.join(", ")}`,
      );
    }
    config.presets = obj.presets as PresetName[];
  }

  if ("extraRiskPaths" in obj) {
    if (!Array.isArray(obj.extraRiskPaths)) {
      throw new Error("config.extraRiskPaths must be an array");
    }
    config.extraRiskPaths = obj.extraRiskPaths.map(parseExtraRiskPath);
  }

  return config;
}

// ---------------------------------------------------------------------------
// Public loader
// ---------------------------------------------------------------------------

/**
 * Load and parse the config file.
 *
 * - If `configPath` is provided, reads from that path (throws if missing).
 * - Otherwise auto-discovers `agent-pr-reviewer-lite.config.json` from `cwd`
 *   (defaults to `process.cwd()`).
 * - Returns `null` when no config file is found during auto-discovery.
 */
export function loadConfig(configPath?: string, cwd?: string): Config | null {
  const filePath = configPath
    ? resolve(configPath)
    : resolve(cwd ?? process.cwd(), CONFIG_FILE_NAME);

  if (!existsSync(filePath)) {
    if (configPath) {
      throw new Error(`Config file not found: ${filePath}`);
    }
    return null;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse config file '${filePath}': ${msg}`);
  }

  return parseConfig(raw);
}
