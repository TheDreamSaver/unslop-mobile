// The package itself: the skill loads, its links work, the credit is intact, and nothing private
// or machine-specific is published.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { ROOT } from "./helpers.mjs";

const IGNORED = new Set(["node_modules", ".git", "captures", ".playwright-mcp"]);
function files(dir = ROOT) {
  return readdirSync(dir).flatMap((name) => {
    if (IGNORED.has(name) || name.endsWith(".frames")) return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}
const published = files();
const text = published.filter((file) => [".md", ".mjs", ".js", ".json", ".html", ".css", ".txt", ".cff", ".yaml", ".yml"].includes(extname(file)) || !extname(file));

function frontmatter(source) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(source);
  assert.ok(match, "SKILL.md starts with frontmatter");
  const fields = {};
  let parent = null;
  for (const line of match[1].split("\n")) {
    const nested = /^ {2}([\w-]+):\s*(.*)$/.exec(line);
    const top = /^([\w-]+):\s*(.*)$/.exec(line);
    if (nested && parent) fields[parent][nested[1]] = nested[2];
    else if (top) {
      parent = top[2] === "" ? top[1] : null;
      fields[top[1]] = top[2] === "" ? {} : top[2].replace(/^"|"$/g, "");
    }
  }
  return fields;
}

test("SKILL.md has the frontmatter both Claude Code and Codex read", () => {
  const fields = frontmatter(readFileSync(join(ROOT, "SKILL.md"), "utf8"));
  assert.deepEqual(Object.keys(fields).sort(), ["description", "license", "metadata", "name"]);
  assert.equal(fields.name, "unslop-mobile");
  assert.match(fields.name, /^[a-z0-9-]{1,64}$/);
  assert.ok(fields.description.length > 100 && fields.description.length <= 1024, `description is ${fields.description.length} characters`);
  assert.doesNotMatch(fields.description, /[<>]/);
  assert.equal(fields.license, "CC-BY-4.0");
  assert.ok(fields.metadata["short-description"].length <= 64);
});

const slug = (heading) => heading.trim().toLowerCase().replace(/[`*_]/g, "").replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s/g, "-");

test("every relative link in the documentation points at a file and heading that exist", () => {
  const broken = [];
  for (const file of published.filter((path) => path.endsWith(".md"))) {
    const source = readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
    for (const [, target] of source.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^(https?:|mailto:)/.test(target)) continue;
      const [path, anchor] = target.split("#");
      const resolved = path ? join(dirname(file), decodeURIComponent(path)) : file;
      if (!existsSync(resolved)) {
        broken.push(`${relative(ROOT, file)} → ${target}`);
        continue;
      }
      if (anchor && resolved.endsWith(".md")) {
        const headings = [...readFileSync(resolved, "utf8").matchAll(/^#{1,6} (.+)$/gm)].map(([, heading]) => slug(heading));
        if (!headings.includes(anchor)) broken.push(`${relative(ROOT, file)} → ${target} (no such heading)`);
      }
    }
  }
  assert.deepEqual(broken, []);
});

test("the original creator is credited wherever upstream material is used", () => {
  const read = (path) => readFileSync(join(ROOT, path), "utf8");
  for (const path of ["SKILL.md", "README.md", "ATTRIBUTION.md"]) {
    assert.match(read(path), /Damir Sokolovsky/, path);
    assert.match(read(path), /https:\/\/github\.com\/heydamir\/unslop/, path);
  }
  assert.match(read("ATTRIBUTION.md"), /4652254daff586ff4739849395a127b56f7f8cc7/, "the upstream revision is recorded");
  assert.match(read("ATTRIBUTION.md"), /not affiliated|not endorsed/i);
  assert.match(read("scripts/story.mjs"), /Adapted from story\.mjs in unslop by Damir Sokolovsky/);
  assert.match(read("scripts/lib/stage.mjs"), /adapted from unslop by @heydamir/);
  assert.match(read("LICENSE"), /Attribution 4\.0 International/);
});

test("bundled fonts ship with their licences", () => {
  for (const font of ["HankenGrotesk", "PlayfairDisplay"]) {
    const licence = readFileSync(join(ROOT, "examples", "crosspaths", "assets", "fonts", `${font}-OFL.txt`), "utf8");
    assert.match(licence, /SIL OPEN FONT LICENSE Version 1\.1/);
  }
});

test("nothing private or machine-specific is published", () => {
  const patterns = [/\/Users\/[a-z]/i, /\/home\/[a-z]+\//, /\/private\/var\/folders\//, /@gmail\.com/i, /mongodb(\+srv)?:\/\//i, /BEGIN (RSA |OPENSSH )?PRIVATE KEY/, /\bsk-[A-Za-z0-9]{20,}/, /emergent(agent)?\.(sh|host)/i, /password\s*[:=]\s*["'][^"']+/i];
  const hits = [];
  for (const file of text) {
    const source = readFileSync(file, "utf8");
    for (const pattern of patterns) if (pattern.test(source)) hits.push(`${relative(ROOT, file)}: ${pattern}`);
  }
  assert.deepEqual(hits, []);
});

test("the example's people are all marked fictional", () => {
  const source = readFileSync(join(ROOT, "examples", "crosspaths", "assets", "fixture.js"), "utf8");
  const data = JSON.parse(source.slice(source.indexOf("{"), source.lastIndexOf("}") + 1));
  assert.equal(data.fictional, true);
  assert.equal(data.records.length, 12);
});
