/* RENDER EVERY WORKSHOP ROUTE from the committed live library, at the widths that matter, into a
 * folder: the before-and-after of any visual change, as pictures of the real pages.
 *
 *   node tools/render-routes.mjs <outdir> [--widths 390,1136,1400] [--routes decks,cards,...]
 *
 * Needs a browser: the same Playwright the browser suites use (tests/uat/browser-runner.mjs,
 * UAT_PLAYWRIGHT / UAT_CHROME). GEOMETRY_REQUIRED=1 makes a missing browser an error rather
 * than a skip. Written for the design intake of 2026-09-20 (docs/design-intake-2026-09-20.md):
 * the first run is the baseline of the build the redesign replaces; every design PR runs it
 * again and puts the two folders side by side for Rob.
 *
 * Nothing here writes to the repository or the library; the pages are restored from
 * data/live-state.json into a fresh browser context, as tests/page-budget.mjs does.
 */
import {mkdirSync, writeFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith("--"));
if (!out) { console.error("usage: node tools/render-routes.mjs <outdir> [--widths 390,1136,1400] [--routes decks,cards]"); process.exit(2); }
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const widths = opt("--widths", "390,1136,1400").split(",").map(Number);

/* The routes a reader visits, with what to wait for before the picture is taken. The deck route
   is filled in from the library's first deck. */
const ROUTES = [
  ["decks", "decks-home", ".cm-deck-tile"],
  ["decks?deck=FIRST", "deck-overview", ".cm-deck-summary"],
  ["decks?deck=FIRST&tab=hundred", "deck-hundred", ".cm-deck-summary, #cm-main table"],
  ["decks?deck=FIRST&tab=upgrades", "deck-upgrades", "#cm-main"],
  ["cards", "library-list", "#cm-roster-table table"],
  ["cards?tab=buy", "library-to-buy", "#cm-roster-table table, .cm-shop-strip"],
  ["cards?view=sheet", "library-sheet", "#cm-sheet-table table"],
  ["cards?view=tabletop", "library-table", "#cm-tt-status, .cm-tt"],
  ["lab", "lab", "#cm-main"],
  ["discover", "explore", "#cm-main"],
  ["game", "play-lobby", ".cm-lobby-seats"],
  ["how", "how", "#cm-main"],
];
const only = opt("--routes", "").split(",").filter(Boolean);
const routes = only.length ? ROUTES.filter(([, name]) => only.includes(name) || only.includes(name.split("-")[0])) : ROUTES;

const runner = await import(pathToFileURL(path.join(ROOT, "tests/uat/browser-runner.mjs")).href);
const {browser, base, stub, close} = await runner.openBrowser({name: "render-routes", flag: "GEOMETRY_REQUIRED"});
mkdirSync(out, {recursive: true});
const index = [];
try {
  for (const width of widths) {
    const phone = width <= 640;
    const context = await browser.newContext({viewport: {width, height: phone ? 844 : 900}, hasTouch: phone, isMobile: phone, deviceScaleFactor: 1});
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).split("\n")[0]));
    if (stub) await stub(page);
    await runner.loadLiveState(page, base);
    await page.addStyleTag({content: "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }"});
    const first = await page.evaluate(() => { const a = document.querySelector('[data-action="deck"][data-deck]'); return a ? a.dataset.deck : ""; });
    for (const [route, name, waitFor] of routes) {
      const hash = route.replace("FIRST", encodeURIComponent(first));
      const file = path.join(out, `${name}@${width}.png`);
      try {
        await page.goto(`${base}/index.html#${hash}`);
        await page.locator("#cm-main").waitFor({timeout: 30000});
        await page.locator(".cm-starting").waitFor({state: "detached", timeout: 30000}).catch(() => {});
        await page.locator(waitFor).first().waitFor({timeout: 30000}).catch(() => {});
        await page.waitForTimeout(600);
        await page.screenshot({path: file, fullPage: true});
        index.push({route: hash, name, width, file: path.basename(file), ok: true});
        process.stdout.write(`  ${name}@${width}\n`);
      } catch (error) {
        index.push({route: hash, name, width, file: null, ok: false, error: String(error.message || error).split("\n")[0]});
        process.stdout.write(`  ${name}@${width}: ${String(error.message || error).split("\n")[0]}\n`);
      }
    }
    if (errors.length) index.push({width, pageErrors: errors});
    await context.close();
  }
} finally {
  await close();
}
writeFileSync(path.join(out, "index.json"), JSON.stringify({renderedAt: new Date().toISOString(), widths, routes: index}, null, 2));
const okCount = index.filter((r) => r.ok).length, total = index.filter((r) => "ok" in r).length;
console.log(`render-routes: ${okCount} of ${total} pictures in ${out}${okCount < total ? " (some routes did not render; see index.json)" : ""}`);
process.exit(okCount === total ? 0 : 1);
