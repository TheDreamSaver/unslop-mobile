// Errors that the command-line tools report as plain messages instead of stack traces.

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
    this.exitCode = 1;
  }
}

export class DependencyError extends Error {
  constructor(message) {
    super(message);
    this.name = "DependencyError";
    this.exitCode = 2;
  }
}

export class EvidenceError extends Error {
  constructor(message) {
    super(message);
    this.name = "EvidenceError";
    this.exitCode = 3;
  }
}

// True when this module is the script node was asked to run. Paths are compared after resolving
// symlinks, so a skill folder linked into ~/.claude/skills or a temp folder under /var still runs.
export function isMain(url) {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(url));
  } catch {
    return false;
  }
}

export async function runCli(main) {
  try {
    await main();
  } catch (error) {
    if (error instanceof UsageError || error instanceof DependencyError || error instanceof EvidenceError) {
      console.error(`${error.name === "UsageError" ? "usage" : error.name === "DependencyError" ? "missing dependency" : "evidence check failed"}: ${error.message}`);
      process.exit(error.exitCode);
    }
    throw error;
  }
}
