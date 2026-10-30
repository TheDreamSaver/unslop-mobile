// A small argument parser: positionals, --flag and --key=value. No dependency needed.

import { UsageError } from "./errors.mjs";

export function parseArgs(argv, { flags = [], options = [] } = {}) {
  const positionals = [];
  const values = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const [key, ...rest] = arg.slice(2).split("=");
    if (rest.length) {
      if (!options.includes(key)) throw new UsageError(`unknown option --${key}`);
      values[key] = rest.join("=");
    } else {
      if (!flags.includes(key)) {
        throw new UsageError(options.includes(key) ? `--${key} needs a value, like --${key}=...` : `unknown option --${key}`);
      }
      values[key] = true;
    }
  }
  return { positionals, values };
}

export function list(value) {
  if (value === undefined || value === true) return undefined;
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

export function number(value, name, { min = -Infinity, max = Infinity } = {}) {
  if (value === undefined) return undefined;
  const result = Number(value);
  if (!Number.isFinite(result) || result < min || result > max) throw new UsageError(`--${name} must be a number between ${min} and ${max}, got "${value}"`);
  return result;
}
