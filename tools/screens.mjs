/* SCREENSHOTS OF THE LIVE STATE, for a pull request.
 *
 * Every UX PR attaches the same five views at two widths, with Rob's collection loaded, so
 * a reviewer compares like with like rather than a fresh library against a full one. This
 * serves the repo itself, restores data/live-state.json through the app's own Restore
 * dialog (the same checksum and schema checks a hand-picked backup gets), and writes the
 * pages under docs/screens/<name>/. It also prints the reconciled totals -- the readiness
 * segments per deck and the Shop's money -- so the PR body can quote figures that were
 * read from the page, not from memory.
 *
 *   UAT_PLAYWRIGHT=... UAT_CHROME=... node tools/screens.mjs <name> [route ...]
 *
 * Routes default to the five the plan names; a route the app does not have yet renders
 * whatever the router falls back to, which is My Decks, so the file still says something. */
import {createServer} from "node:http";
import {createRequire} from "node:module";
import {readFile, mkdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const name = process.argv[2] || "screens";
const routes = process.argv.length > 3 ? process.argv.slice(3) : [
  "decks", "decks?deck=deck:live:D3", "pull?deck=deck:live:D3", "shop", "shop?tab=orders",
];
const require_ = createRequire(import.meta.url);
const {chromium} = require_(process.env.UAT_PLAYWRIGHT || "playwright");
const TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".woff2": "font/woff2"};
const server = createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent(new URL(req.url, "http://localhost").pathname).replace(/^\/+/, "") || "index.html";
    const full = path.resolve(ROOT, rel);
    if (!full.startsWith(ROOT + path.sep)) {res.writeHead(403).end(); return;}
    res.writeHead(200, {"content-type": TYPES[path.extname(full)] || "application/octet-stream"}).end(await readFile(full));
  } catch {res.writeHead(404).end("not found");}
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const out = path.join(ROOT, "docs", "screens", name);
await mkdir(out, {recursive: true});
const browser = await chromium.launch({headless: true, ...(process.env.UAT_CHROME ? {executablePath: process.env.UAT_CHROME} : {})});
const slug = (r) => r.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const phone = w < 640;
    const context = await browser.newContext({viewport: {width: w, height: h}, hasTouch: phone, isMobile: phone, deviceScaleFactor: 1});
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${base}/index.html`);
    await page.getByRole("heading", {name: "Build it. Make it yours."}).waitFor({timeout: 60000});
    // Load Live, the way the reader does it: User Functions -> Restore -> the committed file.
    await page.getByRole("button", {name: "User Functions", exact: true}).click();
    await page.getByRole("button", {name: "Restore from a backup file", exact: true}).click();
    await page.getByLabel("CrankMagic JSON backup").setInputFiles(path.join(ROOT, "data", "live-state.json"));
    await page.getByRole("button", {name: "Validate backup", exact: true}).click();
    await page.getByLabel("Type RESTORE to replace the library").fill("RESTORE");
    await page.getByRole("button", {name: "Restore reviewed backup", exact: true}).click();
    await page.getByRole("dialog").waitFor({state: "hidden"});
    await page.waitForTimeout(600);
    for (const route of routes) {
      await page.goto(`${base}/index.html#${route}`);
      /* The deck overview waits on Scryfall for its commanders before it paints, and a
         sandbox without the network waits until that times out -- so wait for the view's
         own landmark rather than a fixed pause, and give up loudly rather than shooting
         whatever was there before. */
      const landmark = /deck=/.test(route) && /^decks/.test(route) ? ".cm-deck-hero" : /^pull/.test(route) ? ".cm-pull" : /^shop|^collection/.test(route) ? "#cm-roster-table table, .cm-orders" : ".cm-deck-grid";
      await page.locator(landmark).first().waitFor({timeout: 90000}).catch(() => console.log(`no ${landmark} on ${route} at ${w}px`));
      await page.waitForTimeout(900);
      const file = path.join(out, `${slug(route)}-${w}.png`);
      await page.screenshot({path: file, fullPage: true});
      console.log(`wrote ${path.relative(ROOT, file)}`);
    }
    if (w === 1440) {
      const totals = await page.evaluate(async () => {
        const M = CrankCollection, r = await CrankRepository.open();
        try {
          const s = await r.getState();
          const decks = s.decks.map((d) => ({deck: d.name, ...M.readiness(s, d)}));
          const needs = M.projection(s).filter((x) => x.kind === "need");
          const priced = needs.reduce((n, x) => n + (Number.isFinite(x.card.price) ? x.card.price * x.quantity : 0), 0);
          return {decks, toBuyRows: needs.length, toBuyCopies: needs.reduce((n, x) => n + x.quantity, 0), toBuyAtSheetPrices: Math.round(priced * 100) / 100, counters: M.counters(s)};
        } finally {r.close();}
      });
      console.log("TOTALS " + JSON.stringify(totals));
    }
    if (errors.length) console.log(`page errors at ${w}px: ${errors.join(" | ")}`);
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
