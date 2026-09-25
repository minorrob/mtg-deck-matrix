/* BUMP A FILE'S ?v= PIN EVERYWHERE THE WEB APP NAMES IT.
 *
 *   node tools/bump-pins.mjs crankmagic-app.js crankmagic.css data/cards.json …
 *
 * A browser keeps a shipped file until its address changes, so a changed file ships under a new
 * `?v=` and every reference to it must move together: the two pages, the service worker's lists,
 * crankmagic-assets.js for the data files, and any script that names another. This raises each named
 * file's pin by one in every tracked page and script outside the folders that never ship, and refuses
 * when the references to one file already disagree, since that is a bug to look at rather than paper
 * over. Then record the result with `node tests/asset-versions.mjs --update`, which the gate holds to.
 *
 * Bumping a file edits the files that pin it. When one of those is itself pinned (crankmagic-assets.js,
 * the service worker), bump it too. The tool prints every file it changed so that step is not missed. */
import {execFileSync} from "node:child_process";
import {readFileSync, writeFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const names = process.argv.slice(2);
if (!names.length) { console.error("usage: node tools/bump-pins.mjs <file> [file …]"); process.exit(2); }

const tracked = execFileSync("git", ["-C", ROOT, "ls-files", "--", "*.html", "*.js", "*.mjs"], {encoding: "utf8"})
  .split("\n").filter((f) => f && !/^(docs|design|prototype|tests|game|tools|graph|sim|payload)\//.test(f));
const texts = new Map(tracked.map((f) => [f, readFileSync(path.join(ROOT, f), "utf8")]));
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const changed = new Set();

for (const name of names) {
  const re = new RegExp(`(^|[^A-Za-z0-9_./-])(${escape(name)})\\?v=(\\d+)`, "g");
  const seen = new Map();
  for (const [f, text] of texts) for (const m of text.matchAll(re)) seen.set(f, [...(seen.get(f) || []), Number(m[3])]);
  const versions = new Set([...seen.values()].flat());
  if (!versions.size) { console.log(`${name}: not pinned anywhere; nothing to bump`); continue; }
  if (versions.size > 1) { console.error(`${name}: its references disagree ${JSON.stringify(Object.fromEntries(seen))}; fix them first`); process.exit(1); }
  const [v] = versions;
  for (const f of seen.keys()) { texts.set(f, texts.get(f).replace(re, (all, before, file) => `${before}${file}?v=${v + 1}`)); changed.add(f); }
  console.log(`${name}: ${v} -> ${v + 1} in ${[...seen.keys()].join(", ")}`);
}
for (const f of changed) writeFileSync(path.join(ROOT, f), texts.get(f));
if (changed.size) console.log(`changed ${[...changed].join(", ")}. If any of those is pinned itself, bump it too; then run node tests/asset-versions.mjs --update`);
