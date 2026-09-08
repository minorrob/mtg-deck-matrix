/* The geometry pass, wired into `bash runtests.sh`.
 *
 * tests/uat/geometry.mjs holds the checks; this file finds a browser, serves the repo on
 * an ephemeral port, and runs them. It is here rather than only in tests/uat/ because a
 * check that lives in a directory nothing runs is a check nobody performs -- which was
 * the finding this closes.
 *
 * WHEN THERE IS NO BROWSER it prints SKIPPED and exits 0. A contributor with a plain Node
 * install must not see a red suite for a dependency the repo does not declare. That is a
 * real hole, so it is a loud line rather than a silent pass, and .github/workflows/tests.yml
 * installs Chromium precisely so that CI never takes this branch. Set GEOMETRY_REQUIRED=1
 * to turn the skip into a failure.
 */
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";
import {existsSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {geometryPass} from "./uat/geometry.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRED = process.env.GEOMETRY_REQUIRED === "1";
const VERBOSE = process.env.GEOMETRY_VERBOSE === "1";

function skip(why) {
  if (REQUIRED) {
    console.error(`browser-geometry: REQUIRED but ${why}`);
    process.exit(1);
  }
  console.log(`browser-geometry: SKIPPED — ${why}. Run it with GEOMETRY_REQUIRED=1 once Playwright and Chromium are installed; CI always runs it.`);
  process.exit(0);
}

/* Playwright is not a declared dependency of this repo -- it is zero-dependency on
   purpose -- so it is looked for where it actually tends to be rather than imported. */
function findPlaywright() {
  if (process.env.UAT_PLAYWRIGHT) return process.env.UAT_PLAYWRIGHT;
  const require_ = createRequire(import.meta.url);
  try {return require_.resolve("playwright");} catch {}
  for (const dir of [process.env.PLAYWRIGHT_HOME, process.env.CLAUDE_SCRATCHPAD, ROOT].filter(Boolean)) {
    const candidate = path.join(dir, "node_modules", "playwright", "index.js");
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const entry = findPlaywright();
if (!entry) skip("Playwright is not installed");

const module_ = await import(entry.startsWith("/") ? `file://${entry}` : entry);
const chromium = module_.chromium || (module_.default && module_.default.chromium);
if (!chromium) skip("the Playwright entry point exposes no chromium");

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".webp": "image/webp", ".png": "image/png", ".woff2": "font/woff2",
};

/* Serves the repo, and nothing above it: the path is resolved and then checked to be
   inside ROOT, so a ../ in a request cannot read the machine. */
const server = createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent(new URL(req.url, "http://localhost").pathname).replace(/^\/+/, "") || "index.html";
    const full = path.resolve(ROOT, rel);
    if (!full.startsWith(ROOT + path.sep)) {res.writeHead(403).end(); return;}
    const body = await readFile(full);
    res.writeHead(200, {"content-type": TYPES[path.extname(full)] || "application/octet-stream"}).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

let stub = null;
try {({stubNetwork: stub} = await import("./uat/scryfall-stub.mjs"));} catch {}

let browser = null;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.UAT_CHROME ? {executablePath: process.env.UAT_CHROME} : {}),
  });
} catch (error) {
  server.close();
  skip(`Chromium would not launch (${String(error.message).split("\n")[0]})`);
}

try {
  const {checks, failures} = await geometryPass({
    browser, base, stub,
    log: VERBOSE ? (line) => process.stdout.write(line + "\n") : () => {},
  });
  assert.deepEqual(failures, [],
    `the layout is wrong at ${failures.length} place(s):\n  ` + failures.join("\n  "));
  console.log(`browser-geometry: ${checks} checks passed — no sideways scroll, no tap target under 32px and no header overlap at 320, 375, 390, 430, 768 or 1400.`);
} finally {
  await browser.close();
  server.close();
}
