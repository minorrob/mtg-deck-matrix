/* RENDER A DESIGN HANDOFF: every hi-fi mock-up and every wireframe screen, as PNGs to put beside the app.
 *
 *   node tools/render-design.mjs docs/design/2026-09-25-redesign-r3 <out folder> [--port 8805]
 *
 * A Claude Design handoff is HTML in its own "Design Component" format (a template, a small logic class,
 * mounted by support.js). It has to be served, not opened from disk, and it loads its fonts from CDNs, so
 * the network must be up. This serves the handoff folder, screenshots every *.dc.html it holds (full
 * page, 1600 wide), and, when the folder has a Wireframes v2 pack (wf2-screens.js), every screen that
 * pack builds, by the hash route each one answers to. Renders are working material and are not committed
 * (docs/design/README.md); the intake and each design PR compare them with tools/render-routes.mjs's
 * renders of the real pages.
 *
 * Playwright and Chrome are found the way the browser suites find them (UAT_PLAYWRIGHT, UAT_CHROME). */
import {createServer} from "node:http";
import {readFile, stat, readdir, mkdir} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {findPlaywright} from "../tests/uat/browser-runner.mjs";

const [folderArg, outArg] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const portAt = process.argv.indexOf("--port");
const PORT = portAt > 0 ? Number(process.argv[portAt + 1]) : 8805;
if (!folderArg || !outArg) { console.error("usage: node tools/render-design.mjs <handoff folder> <out folder> [--port 8805]"); process.exit(2); }
const ROOT = path.resolve(folderArg), OUT = path.resolve(outArg);

const TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".json": "application/json"};
const server = createServer(async (req, res) => {
  const rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "");
  const full = path.resolve(ROOT, rel);
  if (!full.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  try { if (!(await stat(full)).isFile()) throw Error("not a file"); res.writeHead(200, {"content-type": TYPES[path.extname(full)] || "application/octet-stream"}).end(await readFile(full)); }
  catch { res.writeHead(404).end("not found"); }
});
await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));
const BASE = `http://127.0.0.1:${PORT}`;

/* Every *.dc.html in the folder, a level or two down: a handoff keeps its screens under screens/ and
   wireframes/, and a whole project keeps more at its root. */
async function pages(dir, depth = 0) {
  const found = [];
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && depth < 3 && !/^(assets|uploads|node_modules)$/.test(entry.name)) found.push(...await pages(full, depth + 1));
    else if (entry.isFile() && entry.name.endsWith(".dc.html")) found.push(full);
  }
  return found;
}

const entry = findPlaywright();
if (!entry) { console.error("render-design: Playwright is not installed (set UAT_PLAYWRIGHT)"); process.exit(1); }
const pw = await import(path.isAbsolute(entry) ? pathToFileURL(entry).href : entry);
const chromium = pw.chromium || pw.default.chromium;
const browser = await chromium.launch({headless: true, ...(process.env.UAT_CHROME ? {executablePath: process.env.UAT_CHROME} : {})});
const page = await browser.newPage({viewport: {width: 1600, height: 1000}});
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
await mkdir(path.join(OUT, "hifi"), {recursive: true});

for (const file of await pages(ROOT)) {
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  if (/Wireframes v2\.dc\.html$/.test(rel)) continue;   // the pack is walked screen by screen below
  await page.goto(`${BASE}/${rel.split("/").map(encodeURIComponent).join("/")}`, {waitUntil: "load", timeout: 60000});
  await page.waitForTimeout(2500);
  const name = rel.replace(/\.dc\.html$/, "").replace(/[\/]/g, " · ");
  await page.screenshot({path: path.join(OUT, "hifi", `${name}.png`), fullPage: true});
  console.log(`rendered ${rel}`);
}

/* The Wireframes v2 pack: its screens come from wf2-screens.js, each at a hash route of the pack's page. */
const packs = (await pages(ROOT)).filter((f) => /Wireframes v2\.dc\.html$/.test(f));
for (const pack of packs.slice(0, 1)) {
  const screensFile = path.join(path.dirname(pack), "wf2-screens.js");
  const {build} = await import(pathToFileURL(screensFile).href);
  const screens = build((t, p, ...c) => ({t, p, c}), Symbol("Fragment"), () => {});
  await mkdir(path.join(OUT, "wireframes"), {recursive: true});
  const rel = path.relative(ROOT, pack).split(path.sep).map(encodeURIComponent).join("/");
  for (const [i, s] of screens.entries()) {
    await page.goto(`${BASE}/${rel}#${s.id}`, {waitUntil: "load", timeout: 60000});
    await page.waitForTimeout(1200);
    await page.screenshot({path: path.join(OUT, "wireframes", `${String(i + 1).padStart(2, "0")}-${s.id}.png`), fullPage: true});
  }
  console.log(`rendered ${screens.length} wireframe screens from ${path.relative(ROOT, pack)}`);
}
await browser.close(); server.close();
console.log(`render-design: done into ${OUT}; page errors ${errors.length}${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`);
