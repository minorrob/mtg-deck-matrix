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
  "Gallery Deck Page": {
    route: "decks?deck=FIRST",
    wait: ".cm-bento",
    items: [
      {name: "hero grid", app: ".cm-deck-hero", screen: "grid:2", what: ["x", "width", "columnGap"]},
      {name: "commander card", app: ".cm-deck-hero-card img", screen: "img[alt='Krenko, Mob Boss']", what: ["width", "borderRadius"]},
      {name: "deck name", app: ".cm-deck-hero-copy h1", screen: "h1", what: ["fontSize", "lineHeight"]},
      {name: "the bento", app: ".cm-bento", screen: "grid:6", what: ["x", "width", "columnGap", "rowGap"]},
      {name: "a bento card", app: ".cm-bento-progress", screen: "grid:6 > *:nth-child(2)", what: ["width", "borderRadius", "paddingTop"]},
      {name: "Next card", app: ".cm-bento-next", screen: "grid:6 > *:first-child", what: ["width", "height"]},
    ],
  },
  "Gallery Explore Entry": {
    route: "discover",
    wait: ".cm-explore-doors",
    items: [
      {name: "entry heading", app: ".cm-explore-title", screen: "h1", what: ["fontSize", "lineHeight"]},
      {name: "head grid", app: ".cm-explore-head", screen: "[style*='380px']", what: ["x", "width", "columnGap"]},
      {name: "the doors", app: ".cm-explore-doors", screen: "[style*='repeat(3']", what: ["x", "width", "columnGap"]},
      {name: "a door", app: ".cm-explore-door", screen: "[style*='repeat(3'] > *:first-child", what: ["width", "height", "borderRadius"]},
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
/* A selector, or "grid:N" — the element whose computed grid-template-columns has N tracks.
   The screens are rendered from templates and their style attributes are re-serialised, so a
   [style*=] match tests the source rather than the DOM. What a bento is, is six tracks. */
const readBox = ([sel, what]) => {
  const find = (q) => {
    const child = /^grid:(\d+) > (.+)$/.exec(q);
    if (child) { const host = find("grid:" + child[1]); return host ? host.querySelector(":scope > " + child[2]) : null; }
    const m = /^grid:(\d+)$/.exec(q);
    if (!m) return document.querySelector(q);
    const want = Number(m[1]);
    for (const node of document.querySelectorAll("*")) {
      const cols = getComputedStyle(node).gridTemplateColumns;
      /* The shell is a two-track grid too — the 216px rail and the main beside it — and it comes
         first in the document, so an unqualified "grid:2" found the page rather than the hero
         inside it. The rail is what identifies the shell, so skip any grid whose first track is
         it. This is the difference between measuring a thing and measuring its container. */
      if (!cols || cols === "none") continue;
      const tracks = cols.trim().split(/\s+/);
      if (/^2[01][0-9](\.\d+)?px$/.test(tracks[0])) continue;
      if (tracks.length === want && node.getBoundingClientRect().width > 200) return node;
    }
    return null;
  };
  const el = find(sel);
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

    /* FIRST is the library's first deck, the same substitution tools/render-routes.mjs makes:
       a deck page cannot be opened without naming a deck, and naming one in this file would
       tie the comparison to one library. */
    const firstDeck = await page.evaluate(() => { const a = document.querySelector('[data-action="deck"][data-deck]'); return a ? a.dataset.deck : ''; }).catch(() => '');
    await page.goto(`${appBase}/index.html#${spec.route.replace('FIRST', encodeURIComponent(firstDeck))}`);
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
