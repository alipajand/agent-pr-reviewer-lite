import { execSync } from "node:child_process";
import type { ChangedFile, ChangeStatus } from "./types.js";

function parseNameStatus(line: string): ChangedFile | null {
  const parts = line.split("\t");
  if (parts.length < 2) return null;

  const statusCode = parts[0].trim();

  if (statusCode.startsWith("R")) {
    // Renamed: R100\told/path\tnew/path
    const previousPath = parts[1];
    const path = parts[2];
    if (!previousPath || !path) return null;
    return { path, previousPath, status: "renamed" };
  }

  const path = parts[1];
  if (!path) return null;

  let status: ChangeStatus;
  switch (statusCode) {
    case "A":
      status = "added";
      break;
    case "M":
      status = "modified";
      break;
    case "D":
      status = "deleted";
      break;
    default:
      status = "modified";
  }

  return { path, status };
}

export function getChangedFiles(base: string, head: string): ChangedFile[] {
  const command = `git diff --name-status ${base}...${head}`;

  let output: string;
  try {
    output = execSync(command, { encoding: "utf8" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to run git diff: ${message}`);
  }

  const lines = output.trim().split("\n").filter(Boolean);
  const files: ChangedFile[] = [];

  for (const line of lines) {
    const file = parseNameStatus(line);
    if (file) files.push(file);
  }

  return files;
}
