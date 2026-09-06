/* Three people, six journeys, two screen sizes, in a real browser.
 *
 * See README.md for who the three are and why this is separate from the Node
 * suites. The short version: every browser check written before this one seeded
 * a full collection into localStorage first, which is a returning user, and a
 * first-time visitor is the persona that finds the dead ends.
 *
 * SKIPS RATHER THAN FAILS when Playwright or the dev server is missing. This
 * repo has no package.json and the twenty-three Node suites need nothing but
 * Node; a missing browser is a missing tool, not a failing app, and a test that
 * cannot tell those apart is one people learn to ignore.
 */
import {readFileSync, existsSync, mkdirSync, rmSync, readdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const SHOTS = join(HERE, "shots");
const BASE = process.env.UAT_BASE || "http://localhost:8790";
const HEADED = process.argv.includes("--headed");

/* Playwright is not a dependency of this repo and usually is not installed.
   UAT_PLAYWRIGHT points at a copy somewhere else -- a global install, or the
   scratchpad of whoever set this up -- so it need not be vendored here. */
let chromium;
for (const from of [process.env.UAT_PLAYWRIGHT, "playwright"].filter(Boolean)) {
  try {
    const mod = await import(from);
    // Playwright's entry is CommonJS, so importing it by path puts everything
    // under `default`, while importing it by bare specifier does not.
    chromium = mod.chromium || mod.default?.chromium;
    if (chromium) break;
  } catch { /* try the next one */ }
}
if (!chromium) {
  console.log("SKIP  playwright is not installed. Either:");
  console.log("        npm install playwright && npx playwright install chromium");
  console.log("      or point at an existing copy:");
  console.log("        UAT_PLAYWRIGHT=/path/to/node_modules/playwright/index.js node tests/uat/journeys.mjs");
  process.exit(0);
}

/* The browser binary. Playwright's own default first, then whatever this
   project's container has put under /opt/pw-browsers -- found by looking rather
   than by a pinned build number, because the build number changes with the
   image and a hard-coded one turns "the browser moved" into "the app is fine",
   silently, which is the failure mode this whole file exists to avoid. */
function containerChromium() {
  const root = "/opt/pw-browsers";
  if (!existsSync(root)) return null;
  const builds = readdirSync(root)
    .filter((name) => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  return builds.map((name) => join(root, name, "chrome-linux", "chrome")).find((p) => existsSync(p)) || null;
}
const EXECUTABLE = process.env.UAT_CHROMIUM || containerChromium();

try {
  const ping = await fetch(`${BASE}/matrix.html`, {method: "GET"});
  if (!ping.ok) throw new Error(String(ping.status));
} catch {
  console.log(`SKIP  no server at ${BASE} — start one with:  python3 -m http.server 8790`);
  process.exit(0);
}

const seed = JSON.parse(readFileSync(join(ROOT, "data", "active-state.json"), "utf8")).state;
const SCREENS = [{w: 1400, h: 950, tag: "desktop"}, {w: 390, h: 780, tag: "phone"}];
const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();

rmSync(SHOTS, {recursive: true, force: true});
mkdirSync(SHOTS, {recursive: true});

const problems = [];
const fail = (screen, journey, why) => problems.push(`${screen} · ${journey}: ${why}`);
let passed = 0;

const browser = await chromium.launch(
  Object.assign({headless: !HEADED}, EXECUTABLE ? {executablePath: EXECUTABLE} : {}));

/** A page with nothing saved, no network beyond localhost, and its own error log. */
async function freshPage(screen, options = {}) {
  const ctx = await browser.newContext(Object.assign(
    {viewport: {width: screen.w, height: screen.h}}, options));
  const page = await ctx.newPage();
  page.errors = [];
  page.dialogs = [];
  page.on("pageerror", (e) => page.errors.push("pageerror: " + String(e).slice(0, 160)));
  page.on("console", (m) => {
    const t = m.text();
    // A blocked external request is this harness's own doing, not the app's.
    if (m.type() === "error" && !/Failed to load resource|ERR_|net::/.test(t)) {
      page.errors.push("console: " + t.slice(0, 160));
    }
  });
  page.on("dialog", (d) => { page.dialogs.push(clean(d.message()).slice(0, 60)); d.accept(); });
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  return {ctx, page};
}

const shot = async (page, name) => {
  const cdp = await page.context().newCDPSession(page);
  const {data} = await cdp.send("Page.captureScreenshot", {format: "png"});
  const {writeFileSync} = await import("node:fs");
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, "base64"));
};

const picksIn = (page) => page.evaluate(() => {
  try {
    const s = JSON.parse(localStorage.getItem("mtg-deck-matrix-state-v1") || "{}");
    return Object.keys(s.compareSelections || {}).length;
  } catch { return -1; }
});

function check(ok, screen, journey, why) {
  if (ok) passed += 1; else fail(screen, journey, why);
  return ok;
}

/* Health every journey is held to, whatever else it asserts. */
async function healthy(page, screen, journey) {
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, screen, journey, `${overflow}px of horizontal overflow`);
  const tiny = await page.evaluate(() => [...document.querySelectorAll("body *")]
    .filter((el) => el.offsetParent &&
      [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) &&
      parseFloat(getComputedStyle(el).fontSize) < 9.5).length);
  check(tiny === 0, screen, journey, `${tiny} elements below the 9.5px floor`);
  page.errors.forEach((e) => fail(screen, journey, e));
  page.errors.length = 0;
}

/* Two years of weekly Commander, roughly. The result must not correlate with the
   deck index: six decks cycled on i % 6 against a result on i % 3 gave deck zero
   a 42-0 record and made the result filter look inert. */
function seasonOfGames() {
  const ids = Object.values(seed.compareSelections || {});
  return Array.from({length: 250}, (unused, i) => {
    const when = new Date(2024, 0, 1 + i * 3);
    const roll = (i * 7 + 3) % 11;
    return {
      id: `uat-g${i}`, schema: 1, variantId: ids[i % ids.length],
      result: roll < 3 ? "win" : roll === 4 ? "draw" : "loss",
      playedOn: when.toISOString().slice(0, 10), players: 4,
      turns: 9 + (i % 7), knockouts: i % 4, eliminatedTurn: 8 + (i % 5),
      podFun: 1 + (i % 5), myFun: 1 + (i % 5),
      note: i % 10 === 0 ? "A note long enough to matter to the row width." : "",
      recordedAt: when.toISOString()
    };
  });
}

/* A collection that grew: what somebody's browser holds after a year of use.
 *
 * Ten decks added by hand on top of the workbook's six, and a real collection
 * uploaded -- 3,200 distinct names, which is a shoebox, not a hoard. Built from
 * the repo's own card graph so the names, types and prices are real ones, and
 * built deterministically so a number in a failure message means the same thing
 * on the next run.
 *
 * This is the persona the app was thinnest on. "Continued use" had been tested
 * as "leave and come back" and as "250 logged games"; nobody had ever asked what
 * the app looks like once the collection behind it is large. */
function grownCollection() {
  const graph = JSON.parse(readFileSync(join(ROOT, "data", "graph.json"), "utf8"));
  const pool = graph.cards.filter((c) => !/^(Plains|Island|Swamp|Mountain|Forest|Wastes)$/.test(c.name));
  const commanders = graph.cards.filter((c) => c.isCommander);
  let n = 20260906;
  const rnd = () => (n = (n * 1103515245 + 12345) % 2147483648) / 2147483648;
  const asCard = (c, isCommander) => ({
    name: c.name, quantity: 1, isCommander, typeLine: c.type, manaCost: "", oracleText: "",
    keywords: [], colorIdentity: String(c.ci || "").split("").filter((x) => "WUBRG".includes(x)),
    mv: c.mv || 0, price: c.price == null ? null : c.price, gameChanger: false, image: c.image || ""
  });

  const decks = Array.from({length: 10}, (unused, d) => {
    const cmd = commanders[Math.floor(rnd() * commanders.length)];
    const picked = new Map();
    while (picked.size < 99) {
      const c = pool[Math.floor(rnd() * pool.length)];
      if (!picked.has(c.name)) picked.set(c.name, c);
    }
    const cards = [asCard(cmd, true)].concat([...picked.values()].map((c) => asCard(c, false)));
    return {
      schema: 1, id: `U${d + 1}`, label: `${cmd.name.split(",")[0]} build`, commander: cmd.name,
      imported: true, source: "paste", sourceUrl: null,
      importedAt: new Date(Date.UTC(2026, 2 + (d % 6), 3 + d)).toISOString(),
      cards, total: 100, unresolved: [], warnings: [], measured: null, generated: null
    };
  });

  const held = new Map();
  decks.forEach((d) => d.cards.forEach((c) => held.set(c.name, (held.get(c.name) || 0) + 1)));
  while (held.size < 3200) {
    const c = pool[Math.floor(rnd() * pool.length)];
    if (!held.has(c.name)) held.set(c.name, rnd() < 0.15 ? 2 : 1);
  }
  ["Plains", "Island", "Swamp", "Mountain", "Forest"].forEach((b) => held.set(b, 60));

  return {
    decks,
    inventory: {
      cards: [...held.entries()].map(([name, quantity]) => ({name, quantity})),
      uploadedAt: new Date(Date.UTC(2026, 7, 14)).toISOString(), source: "collection.csv"
    }
  };
}
const GROWN = grownCollection();

for (const screen of SCREENS) {
  console.log(`\n──────── ${screen.tag} ${screen.w}×${screen.h} ────────`);

  // ═══ FIRST: never seen this, nothing saved ═══
  {
    const {ctx, page} = await freshPage(screen);

    await page.goto(`${BASE}/index.html`, {waitUntil: "domcontentloaded"});
    await page.waitForSelector(".deck-card", {timeout: 20000});
    const decks = await page.locator(".deck-card").count();
    const adds = await page.locator(".deck-add").count();
    check(decks === 6, screen.tag, "first · lands", `${decks} decks on the front page, expected 6`);
    check(adds >= 2, screen.tag, "first · lands", `${adds} ways to add a deck, expected 2`);

    /* Compare, Deck, Shop, the Game Log and the Tour are all on matrix.html, and
       for a while the only route there was a footer link -- 1.0 screens below the
       fold on a desktop and 2.9 on a phone. A first-time visitor saw six decks
       and no sign the rest of the app existed, the tour built to show them around
       included. Above the fold or it may as well not be there. */
    const routes = await page.evaluate(() => {
      const seen = (a) => a.getBoundingClientRect().top < window.innerHeight && a.offsetParent;
      return [...document.querySelectorAll('a[href="matrix.html"], a[href="graph.html"]')]
        .filter(seen).map((a) => a.getAttribute("href"));
    });
    check(routes.includes("matrix.html"), screen.tag, "first · lands",
      "nothing above the fold leads to Compare, Deck, Shop, the Game Log or the Tour");
    check(routes.includes("graph.html"), screen.tag, "first · lands",
      "nothing above the fold leads to the card graph");
    await healthy(page, screen.tag, "first · lands");
    console.log(`  first · lands            ${decks} decks, ${adds} ways to add one, ` +
      `${routes.length} routes onward without scrolling`);

    await page.goto(`${BASE}/matrix.html`, {waitUntil: "domcontentloaded"});
    await page.waitForTimeout(5000);
    check(await picksIn(page) === 0, screen.tag, "first · lands", "a first visit already has picks");

    // The journey that used to dead-end.
    await page.click('.main-tab[data-view="deck2"]');
    await page.waitForTimeout(2200);
    const empty = page.locator("#view-deck2 .fr-empty");
    if (check(await empty.count() > 0, screen.tag, "first · empty tab", "Deck has no first-run screen")) {
      const head = clean(await empty.locator("h2").textContent());
      const acts = await empty.locator("button").count();
      check(head.length > 10, screen.tag, "first · empty tab", "the first-run screen has no heading");
      check(acts === 3, screen.tag, "first · empty tab", `${acts} ways out, expected 3`);
      console.log(`  first · empty tab        "${head}" · ${acts} ways out`);
    }
    await shot(page, `${screen.tag}-first-empty`);
    await healthy(page, screen.tag, "first · empty tab");

    // The tour, reached the way a phone user has to reach it.
    await page.click("[data-first-run-tour]");
    await page.waitForTimeout(1500);
    const title = clean(await page.locator("#tour-title").textContent());
    const box = await page.locator("#tour-spotlight").boundingBox();
    check(/nothing/i.test(title), screen.tag, "first · tour",
      `the tour opens with "${title}" instead of saying nothing is picked`);
    check(box && box.width >= 24 && box.height >= 24, screen.tag, "first · tour",
      `the spotlight is ${box ? Math.round(box.width) : 0}px wide — it is pointing at nothing`);
    console.log(`  first · tour             "${title}" · spotlight ${box ? Math.round(box.width) : 0}×${box ? Math.round(box.height) : 0}` +
      ` on ${await page.locator("#tour-layer").getAttribute("data-tour-hit")}`);
    await shot(page, `${screen.tag}-first-tour`);
    await page.click("#tour-close");
    await page.waitForTimeout(700);

    // Taking the offer.
    await page.click('.main-tab[data-view="deck2"]');
    await page.waitForTimeout(1500);
    page.dialogs.length = 0;
    await page.click("[data-first-run-load]");
    await page.waitForTimeout(4500);
    const rail = await page.locator(".dp-rail .rail-btn").count();
    const view = await page.evaluate(() =>
      [...document.querySelectorAll(".view")].find((v) => v.classList.contains("is-active"))?.id);
    check(page.dialogs.length === 0, screen.tag, "first · accepts",
      `warned a first-timer about losing work: "${page.dialogs[0]}"`);
    check(rail === 6, screen.tag, "first · accepts", `${rail} decks arrived, expected 6`);
    check(view === "view-deck2", screen.tag, "first · accepts",
      `the load bounced away from Deck to ${view}`);
    console.log(`  first · accepts          ${rail} decks, still on ${view}, ${page.dialogs.length ? "WARNED" : "no dialog"}`);
    await shot(page, `${screen.tag}-first-loaded`);
    await healthy(page, screen.tag, "first · accepts");

    // ═══ CONTINUED: comes back ═══
    await page.goto(`${BASE}/matrix.html`, {waitUntil: "domcontentloaded"});
    await page.waitForTimeout(4500);
    await page.click('.main-tab[data-view="deck2"]');
    await page.waitForTimeout(2500);
    const back = await page.locator(".dp-rail .rail-btn").count();
    check(back === rail, screen.tag, "continued · returns",
      `came back to ${back} decks, left with ${rail}`);
    console.log(`  continued · returns      ${back} decks still there`);
    await healthy(page, screen.tag, "continued · returns");
    await ctx.close();
  }

  // ═══ CONTINUED, at scale: two years of games ═══
  {
    const {ctx, page} = await freshPage(screen);
    await page.goto(`${BASE}/matrix.html`, {waitUntil: "domcontentloaded"});
    await page.evaluate(([s, g]) =>
      localStorage.setItem("mtg-deck-matrix-state-v1", JSON.stringify({...s, gameLog: g})),
      [seed, seasonOfGames()]);
    await page.reload({waitUntil: "domcontentloaded"});
    await page.waitForTimeout(5000);
    await page.click('.main-tab[data-view="log"]');
    await page.waitForTimeout(2500);

    const rows = await page.locator(".log-list .log-row-card").count();
    const tall = await page.evaluate(() => document.querySelector("#view-log").scrollHeight);
    const screens = tall / screen.h;
    check(rows <= 30, screen.tag, "continued · a season",
      `${rows} entries rendered at once — the log has no ceiling`);
    check(screens < 12, screen.tag, "continued · a season",
      `the log is ${Math.round(screens)} screens tall, which is not a page anybody reads`);
    check(await page.locator(".log-chip").count() > 0, screen.tag, "continued · a season",
      "250 games and no way to narrow them");
    console.log(`  continued · a season     ${rows} of 250 shown · ${Math.round(screens)} screens · ${await page.locator(".log-chip").count()} filters`);

    // Narrowing has to actually narrow, and revealing has to actually reveal.
    await page.locator("[data-log-filter-deck]").nth(1).click();
    await page.waitForTimeout(900);
    const oneDeck = clean(await page.locator(".log-filter-count").textContent().catch(() => ""));
    await page.locator('[data-log-filter-result="win"]').click();
    await page.waitForTimeout(900);
    const justWins = clean(await page.locator(".log-filter-count").textContent().catch(() => ""));
    check(oneDeck !== justWins, screen.tag, "continued · a season",
      `adding a result filter changed nothing: "${oneDeck}" then "${justWins}"`);
    console.log(`     one deck "${oneDeck}" → wins only "${justWins}"`);
    await shot(page, `${screen.tag}-continued-season`);
    await healthy(page, screen.tag, "continued · a season");
    await ctx.close();
  }

  // ═══ CONTINUED, at scale: a collection that grew ═══
  {
    const {ctx, page} = await freshPage(screen);
    await page.goto(`${BASE}/index.html`, {waitUntil: "domcontentloaded"});
    await page.evaluate(([decks, inventory]) => {
      localStorage.setItem("mtg-imported-decks.v1", JSON.stringify({schema: 1, decks}));
      localStorage.setItem("mtg-viewer-inventory.v1", JSON.stringify(inventory));
    }, [GROWN.decks, GROWN.inventory]);
    // A full load, not a hash change: navigating to a URL that differs only by
    // its fragment is a same-document navigation, so the app would still be the
    // one that booted before any of this was written. That mistake made this
    // harness report an eleven-fold difference in the bench count twice.
    await page.goto("about:blank");
    await page.goto(`${BASE}/index.html`, {waitUntil: "domcontentloaded"});
    await page.waitForSelector(".deck-card", {timeout: 20000});

    const decks = await page.locator(".deck-card").count();
    check(decks === 16, screen.tag, "continued · a collection",
      `${decks} decks with ten added to the six, expected 16`);
    await healthy(page, screen.tag, "continued · a collection");

    await page.locator(".tab").filter({hasText: /^\s*Bench/}).first().click();
    await page.waitForTimeout(600);

    const benchTall = await page.evaluate(() => document.documentElement.scrollHeight);
    const benchScreens = benchTall / screen.h;
    const rows = await page.locator(".pick-row").count();
    check(benchScreens < 10, screen.tag, "continued · a collection",
      `the bench is ${Math.round(benchScreens)} screens tall — 1,940 spare cards in one list`);
    check(rows < 120, screen.tag, "continued · a collection",
      `${rows} rows rendered at once — the bench has no ceiling`);

    // The count has to name what is held back, or the cap is just a lie of
    // omission: a reader who cannot see the other 1,890 must at least be told.
    const capped = clean(await page.locator(".section-head p").nth(1).textContent());
    check(/^\d+ of [\d,]+ cards/.test(capped), screen.tag, "continued · a collection",
      `a capped group must say how many it is holding back, said "${capped}"`);

    // Sorted by what a spare card is worth, not by its initial: the first fifty
    // of two thousand is only a useful answer if the fifty were chosen.
    const top = Number(clean(await page.locator(".pick-row .money").first().textContent()).replace(/[^0-9.]/g, ""));
    const tenth = Number(clean(await page.locator(".pick-row .money").nth(9).textContent()).replace(/[^0-9.]/g, ""));
    check(top >= tenth && top > 5, screen.tag, "continued · a collection",
      `the bench opens on $${top} then $${tenth} — it is not showing the valuable spares first`);
    console.log(`  continued · a collection ${decks} decks · bench ${rows} rows, ${Math.round(benchScreens)} screens · "${capped}"`);

    // Everything is still reachable, and reaching it does not move the reader.
    await page.evaluate(() => {
      const b = document.querySelector(".show-rest");
      window.scrollTo(0, window.scrollY + b.getBoundingClientRect().top - 400);
    });
    await page.waitForTimeout(150);
    const anchored = await page.evaluate(() => {
      const rowsAbove = [...document.querySelector(".show-rest").previousElementSibling
        .querySelectorAll(".pick-row")];
      const last = rowsAbove[rowsAbove.length - 1];
      return {name: last.querySelector("b").textContent, top: Math.round(last.getBoundingClientRect().top)};
    });
    // .click() would scroll the button into view first and measure its own move.
    await page.evaluate(() => document.querySelector(".show-rest").click());
    await page.waitForTimeout(500);
    const after = await page.evaluate((name) => {
      // The ROW, not the <b> inside it. Measuring the row before and the label
      // after reported a 9px shift on desktop and 11px on a phone that was
      // nothing but the label's own offset inside its row -- a harness bug that
      // looked exactly like a layout bug, on a check written to catch one.
      const b = [...document.querySelectorAll(".pick-row b")].find((x) => x.textContent === name);
      return {rows: document.querySelectorAll(".pick-row").length,
        top: b ? Math.round(b.closest(".pick-row").getBoundingClientRect().top) : null};
    }, anchored.name);
    check(after.rows > 1500, screen.tag, "continued · a collection",
      `showing the rest gave ${after.rows} rows — the whole bench must still be reachable`);
    // Two pixels, not twelve: measured, the row does not move at all, so the
    // margin here is for sub-pixel rounding and nothing else. A loose threshold
    // on a check like this passes the bug it was written to catch.
    check(after.top !== null && Math.abs(after.top - anchored.top) <= 2, screen.tag,
      "continued · a collection",
      `"${anchored.name}" moved ${after.top - anchored.top}px when the rest was shown`);
    console.log(`     show the rest → ${after.rows} rows, "${anchored.name}" moved ` +
      `${after.top === null ? "off the page" : after.top - anchored.top + "px"}`);
    await shot(page, `${screen.tag}-continued-collection`);
    await healthy(page, screen.tag, "continued · a collection");

    /* The buy list is deliberately NOT capped. It is worked through in a shop
       rather than browsed, and a shopping list that hides its last forty cards
       behind a tap is a shopping list you get home without. */
    await page.locator(".tab").filter({hasText: /^\s*To Buy/}).first().click();
    await page.waitForTimeout(600);
    await page.locator(".filter button").filter({hasText: /^All$/}).first().click();
    await page.waitForTimeout(400);
    const buyRest = await page.locator(".show-rest").count();
    const buyRows = await page.locator(".pick-row").count();
    check(buyRest === 0 && buyRows > 100, screen.tag, "continued · a collection",
      `the buy list showed ${buyRows} rows behind ${buyRest} "show the rest" buttons`);
    console.log(`     buy list ${buyRows} rows, uncapped`);
    await healthy(page, screen.tag, "continued · a collection");

    /* How the lists are arranged is a preference, and this persona's whole
       complaint is work that is not where they left it. */
    await page.locator(".tab").filter({hasText: /^\s*Bench/}).first().click();
    await page.waitForTimeout(400);
    await page.locator(".filter button").filter({hasText: "A to Z"}).first().click();
    await page.waitForTimeout(300);
    await page.goto("about:blank");
    await page.goto(`${BASE}/index.html#/bench`, {waitUntil: "domcontentloaded"});
    await page.waitForSelector(".pick-row", {timeout: 20000});
    await page.waitForTimeout(400);
    const kept = await page.locator('.filter button[aria-pressed="true"]').allTextContents();
    check(kept.includes("A to Z"), screen.tag, "continued · a collection",
      `the sort was set to A to Z and came back as ${JSON.stringify(kept)}`);
    const reopened = await page.locator(".pick-row").count();
    check(reopened < 120, screen.tag, "continued · a collection",
      `${reopened} rows on a fresh visit — "show the rest" must not be what comes back`);
    console.log(`     after a reload: ${JSON.stringify(kept)} · ${reopened} rows`);
    await healthy(page, screen.tag, "continued · a collection");

    /* Load Active is on the Matrix header and gets pressed out of habit. It
       ships data/active-state.json, which is the workbook's Matrix state and
       says nothing at all about anybody's own decks -- so it must leave them
       alone. A payload with no My Decks block means "this file has no opinion",
       never "delete them", and ten decks is what that distinction is worth. */
    await page.goto(`${BASE}/matrix.html`, {waitUntil: "domcontentloaded"});
    await page.waitForTimeout(4500);
    if (!(await page.locator("#load-active-button").isVisible().catch(() => false))) {
      await page.click("#header-toggle").catch(() => {});
      await page.waitForTimeout(600);
    }
    await page.click("#load-active-button");
    await page.waitForTimeout(4000);
    const survived = await page.evaluate(() => {
      const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
      return {decks: ((read("mtg-imported-decks.v1") || {}).decks || []).length,
        cards: ((read("mtg-viewer-inventory.v1") || {}).cards || []).length};
    });
    check(survived.decks === 10 && survived.cards > 3000, screen.tag, "continued · a collection",
      `Load Active left ${survived.decks} added decks and ${survived.cards} collection cards`);
    console.log(`     Load Active kept ${survived.decks} added decks, ${survived.cards.toLocaleString()} cards`);
    await ctx.close();
  }

  // ═══ EXIT: takes the work out, wipes, puts it back ═══
  {
    const {ctx, page} = await freshPage(screen, {acceptDownloads: true});
    await page.goto(`${BASE}/matrix.html`, {waitUntil: "domcontentloaded"});
    /* Exit with the collection behind it, not just the six picks. The export is
       written by the Matrix and My Decks keeps three keys of its own in the same
       origin -- added decks, an uploaded collection, picks. None of them was in
       the file, and the button said "Exported your full state", so somebody with
       ten decks and three thousand cards could back up, move browser, load the
       file and find both gone, having been told they had not been. */
    await page.evaluate(([s, decks, inventory]) => {
      localStorage.setItem("mtg-deck-matrix-state-v1", JSON.stringify(s));
      localStorage.setItem("mtg-imported-decks.v1", JSON.stringify({schema: 1, decks}));
      localStorage.setItem("mtg-viewer-inventory.v1", JSON.stringify(inventory));
    }, [seed, GROWN.decks, GROWN.inventory]);
    await page.reload({waitUntil: "domcontentloaded"});
    await page.waitForTimeout(4500);

    // On a phone the header is folded, so these controls need it opened first --
    // which is what a person does too.
    if (!(await page.locator("#export-state-button").isVisible().catch(() => false))) {
      await page.click("#header-toggle").catch(() => {});
      await page.waitForTimeout(600);
    }

    const wait = page.waitForEvent("download", {timeout: 25000});
    await page.click("#export-state-button");
    const file = await wait.catch(() => null);
    let saved = null;
    if (check(Boolean(file), screen.tag, "exit · export", "Export produced no file")) {
      saved = join(SHOTS, file.suggestedFilename());
      await file.saveAs(saved);
      const body = JSON.parse(readFileSync(saved, "utf8"));
      const n = Object.keys(body.state?.compareSelections || {}).length;
      check(n === 6, screen.tag, "exit · export", `the export carries ${n} picks, not 6`);
      check(Boolean(body.exportedAt), screen.tag, "exit · export",
        "the export has no exportedAt, so nothing can say how old it is");
      const mine = body.myDecks || {};
      const carried = ((mine.decks || {}).decks || []).length;
      const held = ((mine.inventory || {}).cards || []).length;
      check(carried === 10, screen.tag, "exit · export",
        `the export carries ${carried} of the 10 added decks — the rest leave with nothing`);
      check(held > 3000, screen.tag, "exit · export",
        `the export carries ${held} collection cards, and the upload had over three thousand`);
      console.log(`  exit · export            ${file.suggestedFilename()} · ${n} picks, ` +
        `${carried} added decks, ${held.toLocaleString()} collection cards`);
    }

    await page.click("#reset-button");
    await page.waitForTimeout(2500);
    const wiped = await picksIn(page);
    check(wiped === 0, screen.tag, "exit · reset", `Reset All left ${wiped} picks behind`);
    console.log(`  exit · reset             ${wiped} picks`);

    if (saved) {
      await page.setInputFiles("#import-state-input", saved);
      await page.waitForTimeout(4000);
      const restored = await picksIn(page);
      check(restored === 6, screen.tag, "exit · import",
        `the round trip came back with ${restored} picks, not 6`);
      await page.click('.main-tab[data-view="deck2"]');
      await page.waitForTimeout(2500);
      const rail = await page.locator(".dp-rail .rail-btn").count();
      check(rail === 6, screen.tag, "exit · import", `Deck shows ${rail} decks after re-importing`);
      console.log(`  exit · import            ${restored} picks, ${rail} decks on the Deck page`);

      /* The other half of the round trip, on the page that owns it. A file that
         restores the Matrix and leaves My Decks empty is a backup that loses the
         part somebody typed in by hand. */
      await page.goto("about:blank");
      await page.goto(`${BASE}/index.html`, {waitUntil: "domcontentloaded"});
      await page.waitForSelector(".deck-card", {timeout: 20000});
      await page.waitForTimeout(800);
      const cards = await page.locator(".deck-card").count();
      check(cards === 16, screen.tag, "exit · import",
        `My Decks came back with ${cards} decks, not the six built in plus the ten added`);
      const benchTab = clean(await page.locator(".tab").filter({hasText: /Bench/}).first().textContent());
      check(/\d{3,}/.test(benchTab), screen.tag, "exit · import",
        `the uploaded collection did not survive the round trip: bench reads "${benchTab}"`);
      console.log(`     back on My Decks: ${cards} decks · ${benchTab}`);
      await healthy(page, screen.tag, "exit · import");
    }
    await healthy(page, screen.tag, "exit · import");
    await ctx.close();
  }
}

await browser.close();

console.log(`\n${"═".repeat(60)}`);
if (problems.length) {
  console.log(`${problems.length} problem${problems.length === 1 ? "" : "s"} across ${SCREENS.length} screens:`);
  problems.forEach((p) => console.log(`  ${p}`));
  process.exit(1);
}
console.log(`uat: ${passed} checks passed · first, continued and exit clean on ` +
  `${SCREENS.map((s) => s.tag).join(" and ")} · screenshots in tests/uat/shots/`);
