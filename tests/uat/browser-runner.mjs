/* THE BROWSER, THE SERVER AND THE SKIP, in one place.
 *
 * Two suites drive a real Chromium from `bash runtests.sh`: the geometry pass and the page
 * budget. Both need the same three things -- a Playwright that this zero-dependency repo
 * does not declare, a static server that serves the repo and nothing above it, and a loud
 * SKIPPED (exit 0) when there is no browser, because a contributor with a plain Node
 * install must not see a red suite for a dependency the repo does not ask for. Set
 * `<NAME>_REQUIRED=1` to turn that skip into a failure; CI does.
 */
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";
import {existsSync, readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".webp": "image/webp", ".png": "image/png", ".woff2": "font/woff2",
};

/* Playwright is looked for where it actually tends to be rather than imported. */
export function findPlaywright() {
  if (process.env.UAT_PLAYWRIGHT) return process.env.UAT_PLAYWRIGHT;
  const require_ = createRequire(import.meta.url);
  try {return require_.resolve("playwright");} catch {}
  for (const dir of [process.env.PLAYWRIGHT_HOME, process.env.CLAUDE_SCRATCHPAD, ROOT].filter(Boolean)) {
    const candidate = path.join(dir, "node_modules", "playwright", "index.js");
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/* Serves the repo, and nothing above it: the path is resolved and then checked to be
   inside ROOT, so a ../ in a request cannot read the machine. */
export async function serveRepo() {
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
  const port = server.address().port;
  return {server, port, base: `http://${WEB_HOST}:${port}`};
}

/* THE PAGE IS SERVED AS THE WEB COPY, NOT THE LOCAL HOST. The app treats 127.0.0.1 and localhost
   as the game host's own copy and hides the rail there (Rob, 2026-09-24), so a suite that loaded
   the page from loopback was measuring a different product from the one it was written for, and
   could not reach Menu at all. Chromium resolves this name to the loopback server instead.
   The name ends in .localhost ON PURPOSE: the real web copy is https, and restoring a backup needs
   crypto.subtle, which only a secure context has. Every name under .localhost is a secure context
   by the Secure Contexts spec, with no flag. The first version used crankmagic.test plus
   --unsafely-treat-insecure-origin-as-secure; installed Chrome honored the flag, the headless
   Chromium in CI did not, and the restore failed there with nothing on screen but a timeout. */
export const WEB_HOST = "crankmagic.localhost";
const webArgs = () => [`--host-resolver-rules=MAP ${WEB_HOST} 127.0.0.1`];

/* Everything a browser suite needs, or a skip. `name` is the suite's own name for its
   messages and `flag` the environment variable that makes a missing browser a failure. */
export async function openBrowser({name, flag}) {
  const required = process.env[flag] === "1";
  const skip = (why) => {
    if (required) {
      console.error(`${name}: REQUIRED but ${why}`);
      process.exit(1);
    }
    console.log(`${name}: SKIPPED — ${why}. Run it with ${flag}=1 once Playwright and Chromium are installed; CI always runs it.`);
    process.exit(0);
  };
  const entry = findPlaywright();
  if (!entry) skip("Playwright is not installed");
  const module_ = await import(path.isAbsolute(entry) ? pathToFileURL(entry).href : entry);
  const chromium = module_.chromium || (module_.default && module_.default.chromium);
  if (!chromium) skip("the Playwright entry point exposes no chromium");

  const {server, port, base} = await serveRepo();
  let stub = null;
  try {({stubNetwork: stub} = await import("./scryfall-stub.mjs"));} catch {}

  let browser = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: webArgs(),
      ...(process.env.UAT_CHROME ? {executablePath: process.env.UAT_CHROME} : {}),
    });
  } catch (error) {
    server.close();
    skip(`Chromium would not launch (${String(error.message).split("\n")[0]})`);
  }
  return {browser, base, stub, close: async () => {await browser.close(); server.close();}};
}

/* THE LEGENDARY CARDS, by name, from the shipped card records (data/cards.json): a suite that stands every other card
   in as a vanilla creature makes these legendary, so a commander from the library is one the table seats (CR 903.3). */
let legends = null;
export function legendaryNames() {
  if (!legends) legends = new Set(JSON.parse(readFileSync(path.join(ROOT, "data", "cards.json"), "utf8")).cards.filter((c) => /\bLegendary\b/.test(c.typeLine || "")).map((c) => c.name));
  return legends;
}

/* Load the committed live library the way a reader does: Menu → Restore from a
   backup file → the file → validate → RESTORE. The page is then the six real decks. */
export async function loadLiveState(page, base) {
  await page.goto(`${base}/index.html#decks`);
  await page.getByRole("heading", {name: "Decks", level: 1}).waitFor({timeout: 60000});
  await page.getByRole("button", {name: "Menu", exact: true}).click();
  await page.getByRole("button", {name: "Restore from a backup file", exact: true}).click();
  await page.getByLabel("CrankMagic JSON backup").setInputFiles(path.join(ROOT, "data", "live-state.json"));
  await page.getByRole("button", {name: "Validate backup", exact: true}).click();
  await page.getByLabel("Type RESTORE to replace the library").fill("RESTORE");
  await page.getByRole("button", {name: "Restore reviewed backup", exact: true}).click();
  await page.getByRole("dialog").waitFor({state: "hidden"});
  await page.getByRole("heading", {name: "Decks", level: 1}).waitFor({timeout: 60000});
}
