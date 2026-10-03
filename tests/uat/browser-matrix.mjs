/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE BROWSER MATRIX: THE END-TO-END WALK IN EVERY BROWSER ON THE DESK.
 *
 * docs/plan-to-done-2026-09-30.md, Part 6: "a browser and device matrix for the end-to-end walk: Chrome, Edge, Safari
 * and Firefox on the desk; Safari on an iPhone and Chrome on an Android phone in landscape for Play; the walk records
 * which pass" -- and Part 7's G-B: "the browser and device matrix ... the matrix table". This runs the walks in each
 * browser the machine has (browser-runner.mjs's UAT_BROWSER: chromium, msedge, firefox, webkit -- WebKit being Safari's
 * engine) and writes the table to docs/uat/browser-matrix.md. A browser that will not start here is recorded as such,
 * with the reason, rather than left out. The phones are a person's to run: their rows say so.
 *
 * The walks:
 *   release-acceptance  the workshop, end to end, against a built release (UAT_BASE, as release-pages.md serves it)
 *   first-look          Rob's first-look list against the same release
 *   play-journeys       a four-seat game through the real board, a phone seat among them
 *   play-e2e            the staging release's Play under wrangler dev (WRANGLER, as the release steps run it)
 *
 *   UAT_BASE=http://crankmagic.localhost:8790 WRANGLER=<wrangler.js> node tests/uat/browser-matrix.mjs [--write]
 */
import {spawnSync} from "node:child_process";
import {writeFileSync} from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {BROWSERS, ROOT, findPlaywright} from "./browser-runner.mjs";

const LABEL = {chromium: "Chrome (Chromium)", msedge: "Microsoft Edge", firefox: "Firefox", webkit: "Safari (WebKit)"};
const WALKS = [
  {name: "release-acceptance", file: "tests/uat/release-acceptance.mjs", needs: "UAT_BASE", env: {UAT_STATIC: "1", UAT_LIVE_NETWORK: "1"}},
  {name: "first-look", file: "tests/uat/first-look.mjs", needs: "UAT_BASE", env: {UAT_LIVE_NETWORK: "1"}},
  {name: "play-journeys", file: "tests/uat/play-journeys.mjs", env: {PLAY_JOURNEYS_REQUIRED: "1"}},
  {name: "play-e2e", file: "tests/uat/play-e2e.mjs", needs: "WRANGLER"},
];

/* Whether a browser starts at all, and its version: a failure here is the row's whole story. */
async function probe(name) {
  const entry = findPlaywright();
  const pw = await import(path.isAbsolute(entry) ? pathToFileURL(entry).href : entry);
  const {launchBrowser} = await import("./browser-runner.mjs");
  process.env.UAT_BROWSER = name;
  try {
    const browser = await launchBrowser(pw.chromium ? pw : pw.default);
    const version = browser.version();
    await browser.close();
    return {ok: true, version};
  } catch (error) {
    const why = String(error.message).split("\n")[0].replace(/^browserType\.launch: /, "").slice(0, 160);
    /* "spawn UNKNOWN" is Windows refusing to start the executable at all; for Playwright's Firefox build that is a
       side-by-side configuration error, the Microsoft Visual C++ runtime it links against being absent. */
    const hint = /spawn UNKNOWN/.test(why) ? " (Windows would not start the executable; for Firefox, the Microsoft Visual C++ runtime is missing)" : "";
    return {ok: false, why: why + hint};
  } finally { delete process.env.UAT_BROWSER; }
}

/* A walk's own summary line: the last line it printed, which every walk ends with. */
function run(walk, browser) {
  if (walk.needs && !process.env[walk.needs]) return {status: "not run", note: `needs ${walk.needs}`};
  const started = Date.now();
  const out = spawnSync(process.execPath, [path.join(ROOT, walk.file)], {
    cwd: ROOT, encoding: "utf8", timeout: 20 * 60 * 1000, env: {...process.env, ...walk.env, UAT_BROWSER: browser},
  });
  const lines = `${out.stdout || ""}\n${out.stderr || ""}`.split("\n").map((l) => l.trim()).filter(Boolean);
  const summary = (lines.filter((l) => l.startsWith(walk.name)).pop() || lines.pop() || "").replace(/\s+/g, " ").slice(0, 220);
  return {status: out.status === 0 ? "pass" : "fail", note: summary, seconds: Math.round((Date.now() - started) / 1000)};
}

const rows = [];
for (const browser of BROWSERS) {
  const started = await probe(browser);
  if (!started.ok) { rows.push({browser, version: "", walks: WALKS.map(() => ({status: "cannot start here", note: started.why}))}); continue; }
  const walks = WALKS.map((walk) => { const r = run(walk, browser); console.log(`${browser.padEnd(9)} ${walk.name.padEnd(19)} ${r.status}  ${r.note}`); return r; });
  rows.push({browser, version: started.version, walks});
}

const commit = spawnSync("git", ["rev-parse", "--short", "HEAD"], {cwd: ROOT, encoding: "utf8"}).stdout.trim();
const date = new Date().toISOString().slice(0, 10);
const cell = (r) => (r.status === "pass" ? `pass -- ${r.note}` : r.status === "fail" ? `**fail** -- ${r.note}` : `${r.status}: ${r.note}`).replace(/\|/g, "/");
const md = [
  "# The browser matrix",
  "",
  `Written by \`node tests/uat/browser-matrix.mjs --write\` on ${date}, at \`${commit}\`, on Personal-HP. Each cell is the walk's own summary line.`,
  "The phones are a person's to run: Safari on an iPhone and Chrome on an Android phone, in landscape, for Play (Part 6).",
  "",
  "| Browser | Version | " + WALKS.map((w) => w.name).join(" | ") + " |",
  "| --- | --- | " + WALKS.map(() => "---").join(" | ") + " |",
  ...rows.map((r) => `| ${LABEL[r.browser]} | ${r.version || "--"} | ${r.walks.map(cell).join(" | ")} |`),
  "| Safari on an iPhone | -- | " + WALKS.map(() => "Rob's to run").join(" | ") + " |",
  "| Chrome on an Android phone | -- | " + WALKS.map(() => "Rob's to run").join(" | ") + " |",
  "",
].join("\n");
console.log("\n" + md);
if (process.argv.includes("--write")) writeFileSync(path.join(ROOT, "docs", "uat", "browser-matrix.md"), md);
