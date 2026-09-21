/* MEASURE THE APP AGAINST THE DESIGNER'S SCREEN, at 1280, in numbers.
 *
 *   node tools/compare-to-screen.mjs [name ...]
 *
 * The implementation guide's definition of done ends with: "Screenshot side-by-side with the
 * matching screens/*.dc.html at 1280px: same structure, same spacing within ±4px." Two pictures
 * beside each other cannot answer that. A person looking at them cannot tell 4px from 14px, and
 * every "pixel perfect" claim made from a screenshot is a guess.
 *
 * This measures instead. It opens the app's route and the designer's screen at the same width in
 * the same browser, reads the geometry of the elements the two have in common -- the ones named
 * in PAIRS below -- and prints the difference for each, marking anything past the tolerance. It
 * reports numbers, not a verdict, because some differences are the app carrying data the screen
 * does not and those are for a person to judge.
 *
 * It needs the same browser the suites use (UAT_PLAYWRIGHT / UAT_CHROME), and it serves both the
 * repository and the handoff folder so relative assets resolve on each side.
 */
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCREENS = path.join(ROOT, "docs/design/2026-09-20-deck-page-r2/design_handoff_crankmagic_gallery/screens");
const WIDTH = 1280, TOLERANCE = 4;

/* What to measure, per screen. `app` is a selector in the app, `screen` a selector in the
   designer's file, and `what` the properties worth comparing. A pair is only useful when both
   sides mean the same thing, so these are chosen rather than generated. */
const PAIRS = {
  "Gallery Decks": {
    route: "decks",
    wait: ".cm-deck-tile",
    items: [
      {name: "page heading", app: "#cm-main h1", screen: "h1", what: ["fontSize", "lineHeight", "x", "y"]},
      {name: "deck grid", app: ".cm-deck-grid", screen: "[style*='repeat(3']", what: ["x", "width", "columnGap"]},
      {name: "first tile", app: ".cm-deck-tile", screen: "article", what: ["width", "height", "borderRadius"]},
      {name: "commander name", app: ".cm-deck-tile h3", screen: "article h3", what: ["fontSize", "lineHeight"]},
    ],
  },
  "Gallery Library": {
    route: "cards",
    wait: "#cm-roster-table table",
    items: [
      {name: "page heading", app: "#cm-main h1", screen: "h1", what: ["fontSize", "x", "y"]},
      {name: "count tiles", app: ".cm-kpis", screen: "[style*='repeat(7']", what: ["x", "width", "columnGap"]},
      {name: "a table row", app: "#cm-roster-table tbody tr", screen: "tbody tr", what: ["height"]},
    ],
  },
};

const px = (v) => Math.round(parseFloat(v) || 0);
/* One argument, because page.evaluate passes exactly one: the pair arrives as an array. */
const readBox = ([sel, what]) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
  const out = {};
  for (const k of what) {
    if (k === "x") out.x = Math.round(r.x);
    else if (k === "y") out.y = Math.round(r.y);
    else if (k === "width") out.width = Math.round(r.width);
    else if (k === "height") out.height = Math.round(r.height);
    else out[k] = cs[k];
  }
  return out;
};

const serve = async (dir) => {
  const server = createServer(async (req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\//, "") || "index.html";
    try {
      const body = await readFile(path.join(dir, rel));
      const ext = path.extname(rel).toLowerCase();
      const type = {".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
        ".json": "application/json", ".woff2": "font/woff2", ".webp": "image/webp", ".svg": "image/svg+xml",
        ".png": "image/png", ".jpg": "image/jpeg"}[ext] || "application/octet-stream";
      res.writeHead(200, {"content-type": type});
      res.end(body);
    } catch { res.writeHead(404); res.end(""); }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {base: `http://127.0.0.1:${server.address().port}`, close: () => server.close()};
};

const wanted = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const names = wanted.length ? wanted : Object.keys(PAIRS);

const runner = await import(pathToFileURL(path.join(ROOT, "tests/uat/browser-runner.mjs")).href);
const {browser, base: appBase, stub, close} = await runner.openBrowser({name: "compare-to-screen", flag: "GEOMETRY_REQUIRED"});
const screens = await serve(SCREENS);
let off = 0, measured = 0;
try {
  const context = await browser.newContext({viewport: {width: WIDTH, height: 900}, deviceScaleFactor: 1});
  const page = await context.newPage();
  if (stub) await stub(page);
  await runner.loadLiveState(page, appBase);

  for (const name of names) {
    const spec = PAIRS[name];
    if (!spec) { console.log(`  ${name}: no pairs defined`); continue; }
    console.log(`\n${name} — the app against screens/${name}.dc.html at ${WIDTH}px`);

    await page.goto(`${appBase}/index.html#${spec.route}`);
    await page.locator("#cm-main").waitFor({timeout: 30000});
    await page.locator(".cm-starting").waitFor({state: "detached", timeout: 30000}).catch(() => {});
    await page.locator(spec.wait).first().waitFor({timeout: 30000}).catch(() => {});
    const appSide = {};
    for (const item of spec.items) appSide[item.name] = await page.evaluate(readBox, [item.app, item.what]).catch(() => null);

    const sp = await context.newPage();
    await sp.goto(`${screens.base}/${encodeURIComponent(name)}.dc.html`, {waitUntil: "networkidle"});
    await sp.waitForTimeout(1200);
    const screenSide = {};
    for (const item of spec.items) screenSide[item.name] = await sp.evaluate(readBox, [item.screen, item.what]).catch(() => null);
    await sp.close();

    for (const item of spec.items) {
      const a = appSide[item.name], s = screenSide[item.name];
      if (!a || !s) { console.log(`  ${item.name.padEnd(18)} — not found on ${!a ? "the app" : "the screen"}`); continue; }
      for (const k of item.what) {
        measured++;
        const av = a[k], sv = s[k];
        const numeric = typeof av === "number" || /^-?[\d.]+px$/.test(String(av));
        if (numeric) {
          const d = px(av) - px(sv);
          const bad = Math.abs(d) > TOLERANCE;
          if (bad) off++;
          console.log(`  ${item.name.padEnd(18)} ${k.padEnd(13)} app ${String(px(av)).padStart(5)}  screen ${String(px(sv)).padStart(5)}  ${d >= 0 ? "+" : ""}${d}${bad ? "  <-- past ±" + TOLERANCE : ""}`);
        } else {
          const bad = String(av) !== String(sv);
          if (bad) off++;
          console.log(`  ${item.name.padEnd(18)} ${k.padEnd(13)} app ${av}  screen ${sv}${bad ? "  <-- differs" : ""}`);
        }
      }
    }
  }
  await context.close();
} finally { await close(); screens.close(); }

console.log(`\ncompare-to-screen: ${measured} measurements, ${off} past ±${TOLERANCE}px or differing.`);
console.log("Numbers, not a verdict: some differences are the app carrying data the screen does not.");
process.exit(0);
