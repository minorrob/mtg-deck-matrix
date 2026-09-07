/* The cache is only safe if the version moves when the file does.
 *
 * Every script, stylesheet and data file this app fetches carries a ?v= in its
 * URL, and every fetch now goes through the browser cache (`cache: "default"`),
 * which is what makes a second visit cost zero requests. The whole arrangement
 * rests on one rule: A CHANGED FILE MUST GET A NEW URL. Break it and the failure
 * is not a stale render for a few minutes -- it is a browser running last
 * month's code, indefinitely, with nothing on screen to say so.
 *
 * It had already broken twice by the time this was written, and neither was
 * visible by reading either file:
 *
 *   deck-generator.js was rewritten to rank cards by EDHREC synergy, and
 *   index.html was bumped to v=5 while matrix.html stayed at v=3 -- a number set
 *   the day BEFORE the rewrite. Anybody who had opened the Matrix before that
 *   kept the old generator forever. lineup-model.js and scryfall-client.js
 *   disagreed the same way, in the other direction.
 *
 * So two rules, both mechanical:
 *
 *   1. ONE FILE, ONE VERSION. Two pages asking for two URLs is two cached copies
 *      of the same module, and the older page keeps whichever it already had.
 *   2. A CHANGED FILE HAS A CHANGED VERSION, checked against a committed hash of
 *      what each version was recorded against.
 *
 * WHEN THIS FAILS, the fix is to bump the version -- everywhere it appears --
 * and then re-record:  node tests/asset-versions.mjs --update
 * Doing that without bumping is the mistake this exists to catch, so the update
 * refuses to record a changed file whose version has not moved.
 */
import assert from "node:assert/strict";
import {readFile, writeFile} from "node:fs/promises";
import {existsSync} from "node:fs";
import {createHash} from "node:crypto";

const ROOT = new URL("../", import.meta.url);
const PAGES = ["index.html", "matrix.html", "graph.html", "crankmagic.html", "legacy-decks.html", "legacy-graph.html"];
const MANIFEST = new URL("./fixtures/asset-versions.json", import.meta.url);
const UPDATE = process.argv.includes("--update");

const hash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);

/* Assets referenced from the HTML, and the data files the modules fetch. Both
   are cached the same way, so both need the same guarantee. */
const refs = new Map();   // file -> Map(page -> version)
const note = (file, where, version) => {
  if (!refs.has(file)) refs.set(file, new Map());
  refs.get(file).set(where, version);
};

// Follow loaded local modules/styles, including the worker's explicit offline
// inventory. Font/image changes need the same protection as JavaScript. Remote
// card URLs and data: embedded font payloads are deliberately outside this scan.
const queue = [...PAGES, "app.js", "viewer.js", "graph-page.js"], scanned = new Set();
while (queue.length) {
  const file = queue.shift();
  if (scanned.has(file)) continue;
  scanned.add(file);
  const src = await readFile(new URL(file, ROOT), "utf8");
  for (const m of src.matchAll(/["'(]((?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.(?:js|css|json|svg|png|webp|woff2))\?v=(\d+)/g)) {
    note(m[1], file, Number(m[2]));
    if (/\.(?:js|css)$/.test(m[1])) queue.push(m[1]);
  }
}

assert.ok(refs.size > 25, `only ${refs.size} versioned assets found — the scan is not seeing the pages`);

// ---------------------------------------------------------------------------
// 1. One file, one version
// ---------------------------------------------------------------------------
const split = [];
for (const [file, seen] of refs) {
  const versions = [...new Set(seen.values())];
  if (versions.length > 1) {
    split.push(`${file} is requested as ${[...seen].map(([w, v]) => `${w}→v=${v}`).join(" and ")}`);
  }
}
assert.deepEqual(split, [],
  "the same file is being fetched under two URLs, so a browser keeps two copies of it " +
  "and the page with the older number never sees the change:\n  " + split.join("\n  "));

// ---------------------------------------------------------------------------
// 2. A changed file has a changed version
// ---------------------------------------------------------------------------
let manifest = {};
if (existsSync(MANIFEST)) manifest = JSON.parse(await readFile(MANIFEST, "utf8")).assets || {};

const current = {};
const stale = [];
const added = [];
for (const [file, seen] of [...refs].sort()) {
  const version = [...seen.values()][0];
  let body;
  try {
    body = await readFile(new URL(file, ROOT));
  } catch {
    assert.fail(`${file} is referenced with ?v=${version} but is not in the repo`);
  }
  const sha = hash(body);
  current[file] = {version, sha};
  const was = manifest[file];
  if (!was) { added.push(`${file} (v=${version})`); continue; }
  if (was.sha !== sha && was.version === version) {
    stale.push(`${file} changed but is still ?v=${version} — every browser that ` +
      `already fetched it will keep the old copy`);
  }
}

if (UPDATE) {
  assert.deepEqual(stale, [],
    "refusing to record these: bump the version first, in every page that names it.\n  " +
    stale.join("\n  "));
  await writeFile(MANIFEST, JSON.stringify({
    note: "Written by tests/asset-versions.mjs --update. Each entry records the " +
      "content a ?v= was last bumped for; the test fails when content moves and the " +
      "version does not.",
    assets: current
  }, null, 2) + "\n");
  console.log(`asset-versions: recorded ${Object.keys(current).length} assets` +
    (added.length ? ` (${added.length} new)` : ""));
} else {
  assert.deepEqual(stale, [],
    "a file changed without its ?v= moving, so the browser cache will serve the old one:\n  " +
    stale.join("\n  ") + "\n  Bump it in every page that names it, then: node tests/asset-versions.mjs --update");
  assert.deepEqual(added, [],
    "these versioned assets are not in the manifest yet — run: node tests/asset-versions.mjs --update\n  " +
    added.join("\n  "));
  console.log(`asset-versions: ${refs.size} assets, one version each, every hash matching its recorded bump`);
}
