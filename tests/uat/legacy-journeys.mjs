/* Three people, twenty-one journeys, two screen sizes, in a real browser.
 *
 * See README.md for who the three are and why this is separate from the Node
 * suites. The short version: every browser check written before this one seeded
 * a full collection into localStorage first, which is a returning user, and a
 * first-time visitor is the persona that finds the dead ends.
 *
 * SKIPS RATHER THAN FAILS when Playwright or the dev server is missing. This
 * repo has no package.json and the thirty-three Node suites need nothing but
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
  process.exit(1);
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
  process.exit(1);
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

  /* Two things every control on every screen is held to, for anybody not using a
     mouse and eyes. They live here rather than in a journey of their own because
     they are properties of every view, and a journey that visits a view is the
     cheapest place to check them.
       A NAME. Placeholders do not count -- they are gone the moment you type.
       A STATED SELECTION. Looking chosen was a CSS class on the game log's
       seventeen chips and on the graph's view toggle, which says nothing to a
       screen reader. */
  const aria = await page.evaluate(() => {
    const seen = (n) => n.offsetParent !== null || getComputedStyle(n).position === "fixed";
    const named = (n) => ((n.getAttribute("aria-label") || "") ||
      (n.labels && n.labels[0] ? n.labels[0].textContent : "") ||
      n.textContent || n.title || "").replace(/\s+/g, " ").trim();
    const controls = [...document.querySelectorAll("button, a[href], input, select, textarea")].filter(seen);
    const SELECTED = /\b(is-active|is-on|is-selected|is-current)\b/;
    return {
      nameless: controls.filter((n) => !named(n))
        .map((n) => `${n.tagName.toLowerCase()}.${String(n.className).split(" ")[0] || "(no class)"}`),
      /* aria-sort belongs on the list: a column header that is the sort control says
         which way it is sorting with aria-sort, not with aria-pressed. Leaving it out
         made the one correct spelling of "this one is on" the only one that failed. */
      silent: controls.filter((n) => SELECTED.test(String(n.className)) &&
        !n.hasAttribute("aria-pressed") && !n.hasAttribute("aria-selected") &&
        !n.hasAttribute("aria-checked") && !n.hasAttribute("aria-current") &&
        !n.hasAttribute("aria-sort") && !n.hasAttribute("aria-expanded"))
        .map((n) => String(n.className).split(" ").slice(0, 2).join("."))
    };
  });
  check(aria.nameless.length === 0, screen, journey,
    `${aria.nameless.length} controls with no accessible name: ${[...new Set(aria.nameless)].slice(0, 4).join(", ")}`);
  check(aria.silent.length === 0, screen, journey,
    `${aria.silent.length} controls look selected and do not say so: ${[...new Set(aria.silent)].slice(0, 4).join(", ")}`);
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
// viewer.js caps a band before offering the rest behind a button: fifty where a row is
// one line, twenty-two where it folds into five. Counted in screens, not rows.
const GROUP_CAP = 50;

for (const screen of SCREENS) {
  console.log(`\n──────── ${screen.tag} ${screen.w}×${screen.h} ────────`);

  // ═══ FIRST: never seen this, nothing saved ═══
  {
    const {ctx, page} = await freshPage(screen);

    await page.goto(`${BASE}/legacy-decks.html`, {waitUntil: "domcontentloaded"});
    await page.waitForSelector(".start-tile", {timeout: 20000});

    /* A BROWSER THAT HAS NEVER OPENED THIS APP HAS NO DECKS.
     *
     * data/master-v2.json carries the card catalog AND one person's build of six decks.
     * Loading both meant a stranger opened the page to somebody else's decks and a
     * 176-card bench presented as their own, with nothing saying whose they were -- and
     * "Clear session" left them exactly where it found them. The build half is now gated
     * on this browser having saved something; the catalog is not, so search, the card
     * list and the graph are all untouched. */
    const blank = await page.evaluate(() => ({
      decks: document.querySelectorAll(".deck-card").length,
      note: (document.querySelector(".empty-note h3") || {}).textContent || "",
      load: [...document.querySelectorAll(".empty-note button")].map((b) => b.textContent.trim()),
      ribbon: (document.querySelector(".ribbon") || {}).textContent || ""
    }));
    check(blank.decks === 0, screen.tag, "first · lands",
      `${blank.decks} decks on a browser that has saved nothing — they are not this reader's`);
    check(/No decks yet/i.test(blank.note), screen.tag, "first · lands",
      `an empty deck list with no explanation reads as a failed load, not an empty list (saw "${blank.note}")`);
    check(blank.load.includes("Load default"), screen.tag, "first · lands",
      "nothing on an empty page offers the decks kept in the repository");
    check(/\b0 decks\b/.test(blank.ribbon.replace(/\s+/g, " ")), screen.tag, "first · lands",
      `the ribbon still counts somebody else's decks: ${blank.ribbon.replace(/\s+/g, " ").slice(0, 60)}`);

    const adds = await page.locator(".deck-add").count();
    check(adds >= 2, screen.tag, "first · lands", `${adds} ways to add a deck, expected 2`);

    /* THE THREE DOORS, ABOVE THE DECKS. Add and Build used to sit at the END of the deck
       grid, which holds at six decks and stops holding at sixteen: they end up behind
       every deck you were not looking for. Explore cards joins them because it is the
       same kind of thing -- a way in, not a deck -- and because the graph had no route
       from this page but a link in the bar and one in the footer. */
    const doors = await page.evaluate(() => {
      const tiles = [...document.querySelectorAll(".start-tile")];
      const head = document.querySelector(".section-head h2");
      const card = document.querySelector(".deck-grid > *");
      const box = (n) => n ? Math.round(n.getBoundingClientRect().top) : null;
      return {
        names: tiles.map((t) => ((t.querySelector("b") || {}).textContent || "").trim()),
        // A tile with no border is a line of text where a tile should be: it happened.
        framed: tiles.filter((t) => getComputedStyle(t).borderStyle !== "none").length,
        graph: tiles.filter((t) => t.getAttribute("href") === "legacy-graph.html").length,
        tileTop: box(tiles[0]), headTop: box(head), cardTop: box(card),
        heading: head ? head.textContent.trim() : ""
      };
    });
    check(doors.names.length === 3, screen.tag, "first · lands",
      `${doors.names.length} ways in above the decks: ${JSON.stringify(doors.names)}`);
    check(doors.graph === 1, screen.tag, "first · lands",
      "no tile beside Add and Build leads to the card graph");
    check(doors.framed === doors.names.length, screen.tag, "first · lands",
      `${doors.names.length - doors.framed} of the tiles have no frame, so they read as loose text`);
    check(doors.tileTop < doors.headTop && doors.headTop < doors.cardTop, screen.tag, "first · lands",
      `the tiles are not above the deck list: tiles ${doors.tileTop}, heading ${doors.headTop}, first deck ${doors.cardTop}`);
    check(doors.heading === "My Decks", screen.tag, "first · lands",
      `the deck list is headed "${doors.heading}"`);
    console.log(`     ${doors.names.join(" · ")} above "${doors.heading}"`);

    /* Compare, Deck, Shop, the Game Log and the Tour are all on matrix.html, and
       for a while the only route there was a footer link -- 1.0 screens below the
       fold on a desktop and 2.9 on a phone. A first-time visitor saw six decks
       and no sign the rest of the app existed, the tour built to show them around
       included. Above the fold or it may as well not be there. */
    const routes = await page.evaluate(() => {
      const seen = (a) => a.getBoundingClientRect().top < window.innerHeight && a.offsetParent;
      return [...document.querySelectorAll('a[href="matrix.html"], a[href="legacy-graph.html"]')]
        .filter(seen).map((a) => a.getAttribute("href"));
    });
    check(routes.includes("matrix.html"), screen.tag, "first · lands",
      "nothing above the fold leads to Compare, Deck, Shop, the Game Log or the Tour");
    check(routes.includes("legacy-graph.html"), screen.tag, "first · lands",
      "nothing above the fold leads to the card graph");
    await healthy(page, screen.tag, "first · lands");
    console.log(`  first · lands            ${blank.decks} decks on a clean browser, ${adds} ways to add one, ` +
      `${routes.length} routes onward without scrolling`);

    /* AND LOAD DEFAULT FILLS IT, then Clear session empties it again.
     *
     * In its own browser: pressing Load default writes a saved session, and the rest of
     * this persona is the person who has never saved one. Testing them in the same
     * context is how a first-run screen comes to be checked against a returning user. */
    {
      const away = await freshPage(screen);
      await away.page.goto(`${BASE}/legacy-decks.html`, {waitUntil: "domcontentloaded"});
      await away.page.waitForSelector(".empty-note button", {timeout: 20000});
      away.page.dialogs.length = 0;
      await away.page.locator(".empty-note button", {hasText: "Load default"}).first().click();
      await away.page.waitForSelector(".deck-card", {timeout: 20000});
      const loaded = await away.page.evaluate(() => ({
        decks: document.querySelectorAll(".deck-card").length,
        bench: Number((document.querySelector("#tab-bench .count") || {}).textContent || 0),
        upgrades: Number((document.querySelector("#tab-upgrades .count") || {}).textContent || 0),
        keys: Object.keys(localStorage)
      }));
      check(away.page.dialogs.length === 1, screen.tag, "first · load default",
        `${away.page.dialogs.length} confirmations before replacing what is saved, expected exactly 1`);
      check(loaded.decks === 6, screen.tag, "first · load default",
        `Load default gave ${loaded.decks} decks, expected 6`);
      check(loaded.bench > 0 && loaded.upgrades > 0, screen.tag, "first · load default",
        `the bench and the upgrades did not follow the decks: ${loaded.bench} and ${loaded.upgrades}`);
      check(loaded.keys.includes("mtg-deck-matrix-state-v1"), screen.tag, "first · load default",
        "nothing was written, so a reload would lose it");

      /* AND BACK. "Clear session" promises a browser that looks like one that has never
         opened the app; the only way to check a promise like that is to make it, and then
         look. It asks twice -- once offering a backup, once to confirm -- and the second
         answer is the one that clears. */
      away.page.dialogs.length = 0;
      await away.page.click("#admin-button");
      await away.page.waitForTimeout(300);
      await away.page.locator(".admin-item", {hasText: "Clear session"}).first().click();
      await away.page.waitForTimeout(2500);
      const after = await away.page.evaluate(() => ({
        keys: Object.keys(localStorage).filter((k) => k.startsWith("mtg-")),
        /* What the reader saved, as against the app's own note about which catalog this
           browser starts from. The note is WRITTEN BY the clear -- it is how "empty stays
           empty" survives adding a deck afterwards -- so counting it as a survivor would
           be reporting the fix as the bug. */
        saved: window.MtgUserState ? window.MtgUserState.present(localStorage).map((k) => k.key) : null,
        catalog: localStorage.getItem("mtg-catalog-source.v1"),
        decks: document.querySelectorAll(".deck-card").length,
        note: (document.querySelector(".empty-note h3") || {}).textContent || ""
      }));
      check(away.page.dialogs.length === 2, screen.tag, "first · clear session",
        `${away.page.dialogs.length} prompts before destroying everything, expected 2 (backup, then confirm)`);
      check(/backup/i.test(away.page.dialogs[0] || ""), screen.tag, "first · clear session",
        "the first prompt does not offer a backup");
      check(after.saved !== null && after.saved.length === 0, screen.tag, "first · clear session",
        `${(after.saved || after.keys).length} saved keys survived the clear: ${(after.saved || after.keys).join(", ")}`);
      check(after.catalog === "empty", screen.tag, "first · clear session",
        `after clearing, this browser starts from "${after.catalog}" — it must start empty, ` +
        `and stay empty when a deck is added`);
      check(after.keys.every((k) => k === "mtg-catalog-source.v1"), screen.tag, "first · clear session",
        `keys beyond the catalog note survived: ${after.keys.join(", ")}`);
      check(after.decks === 0 && /No decks yet/i.test(after.note), screen.tag, "first · clear session",
        `after clearing, ${after.decks} decks are still on the page`);
      console.log(`  first · load default     ${loaded.decks} decks, ${loaded.bench} on the bench, ` +
        `${loaded.upgrades} upgrades — and back to ${after.decks} after a clear`);
      await shot(away.page, `${screen.tag}-first-loaded-mydecks`);
      await away.ctx.close();
    }

    /* ADDING A DECK WITH A NAME THAT IS NOT A CARD.
     *
     * This journey did not exist, and its absence is why the bug shipped: every import
     * test used a clean list, so an unmatched name never came up. In real use it comes up
     * constantly -- a typo, a rename, or a name a language model invented -- and the app
     * used to report it on the review screen and offer a Save button that saved a 99-card
     * deck the simulator would then refuse to score. Every road out was worse than the
     * road in.
     *
     * Scryfall is stubbed rather than called. The container cannot reach it, and a check
     * that skips when a third party is slow is a check nobody trusts. The stub answers
     * autocomplete by prefix and collection by exact name, which is enough to drive every
     * rung of card-resolve.js. */
    {
      const fix = await freshPage(screen);
      const KNOWN = {
        "Sol Ring": "Artifact",
        "Splinter": "Sorcery",
        "Splinter, Radical Rat": "Legendary Creature — Rat Ninja",
        "Splinter, the Mentor": "Legendary Creature — Rat Ninja",
        "Command Tower": "Land",
        "Swamp": "Basic Land — Swamp"
      };
      await fix.page.route("**://api.scryfall.com/**", async (route) => {
        const url = new URL(route.request().url());
        const json = (body) => route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(body)});
        const card = (name) => ({name, type_line: KNOWN[name], legalities: {commander: "legal"}});
        if (url.pathname === "/cards/autocomplete") {
          const q = (url.searchParams.get("q") || "").toLowerCase();
          return json({data: Object.keys(KNOWN).filter((n) => n.toLowerCase().startsWith(q))});
        }
        if (url.pathname === "/cards/collection") {
          const body = JSON.parse(route.request().postData() || "{}");
          const data = [], not_found = [];
          (body.identifiers || []).forEach((id) => (KNOWN[id.name] ? data.push(card(id.name)) : not_found.push(id)));
          return json({data, not_found});
        }
        return route.fulfill({status: 404, contentType: "application/json", body: JSON.stringify({object: "error"})});
      });
      await fix.page.goto(`${BASE}/legacy-decks.html`, {waitUntil: "domcontentloaded"});
      await fix.page.waitForSelector(".start-tile", {timeout: 20000});
      await fix.page.click(".start-tile.deck-add");
      await fix.page.waitForSelector("[data-imp-text]", {timeout: 10000});
      await fix.page.fill("[data-imp-text]", [
        "1 Splinter, Radical Rat",          // real, and the commander
        "1 Splinter, Vengeful Sensei",      // invented: several plausible answers
        "1 Sol Rng",                        // a typo: one right answer
        "1 Zzzqqq Nonexistent Blorp",       // not a card at all: none
        "1 Command Tower", "20 Swamp"
      ].join("\n"));
      await fix.page.click("[data-imp-read]");
      await fix.page.waitForSelector(".imp-fix-row", {timeout: 25000});
      await fix.page.waitForTimeout(1500);

      const asked = await fix.page.evaluate(() => [...document.querySelectorAll(".imp-fix-row")].map((row) => ({
        name: row.querySelector(".imp-fix-asked b").textContent,
        options: [...row.querySelectorAll(".imp-fix-opt")].map((o) => o.querySelector("b").textContent),
        chosen: [...row.querySelectorAll(".imp-fix-opt.is-on")].map((o) => o.querySelector("b").textContent),
        links: row.querySelectorAll(".imp-fix-links a").length
      })));
      check(asked.length === 3, screen.tag, "first · bad names",
        `${asked.length} unmatched names were asked about, expected 3`);
      const invented = asked.find((row) => /Vengeful/.test(row.name));
      const typo = asked.find((row) => /Sol Rng/.test(row.name));
      const nonsense = asked.find((row) => /Zzzqqq/.test(row.name));
      check(invented && invented.options.length >= 3, screen.tag, "first · bad names",
        `an invented name must be answered with candidates, got ${invented ? invented.options.length : 0}`);
      check(typo && typo.chosen.includes("Sol Ring"), screen.tag, "first · bad names",
        `a typo with one right answer must be pre-chosen, got ${typo ? JSON.stringify(typo.chosen) : "no row"}`);
      check(nonsense && nonsense.options.length === 1 && /Leave it out/.test(nonsense.options[0]),
        screen.tag, "first · bad names",
        "a name that is not a card must be said to be one, with a way out");
      check(asked.every((row) => row.links === 2), screen.tag, "first · bad names",
        "every unmatched name must offer a second place to look it up by hand");
      /* THE DEAD END ITSELF: the way onward must be held until every name has an answer.
         It used to be a Save button that was always live. */
      check(await fix.page.locator("[data-imp-fixdone]").isDisabled(), screen.tag, "first · bad names",
        "the way onward is open while two names are still undecided");
      await shot(fix.page, `${screen.tag}-first-badnames`);

      await fix.page.locator('[data-fix-pick="Splinter, the Mentor"]').first().click();
      await fix.page.locator(".imp-fix-row", {hasText: "Zzzqqq"}).locator("[data-fix-drop]").click();
      await fix.page.waitForTimeout(400);
      check(!(await fix.page.locator("[data-imp-fixdone]").isDisabled()), screen.tag, "first · bad names",
        "every name is answered and the way onward is still shut");
      await fix.page.click("[data-imp-fixdone]");
      await fix.page.waitForSelector(".imp-problems, .imp-score", {timeout: 15000});
      await fix.page.waitForTimeout(800);

      const after = await fix.page.evaluate(() => ({
        lede: (document.querySelector(".imp-lede") || {}).textContent || "",
        problems: [...document.querySelectorAll(".imp-problems li")].map((n) => n.textContent.trim())
      }));
      const count = Number((after.lede.match(/(\d+) cards/) || [])[1] || 0);
      check(count === 24, screen.tag, "first · bad names",
        `the two chosen cards did not land in the deck: ${count} cards, expected 24`);
      check(!after.problems.some((p) => /could not be matched/.test(p)), screen.tag, "first · bad names",
        `a name the reader answered is still reported as a failure: ${JSON.stringify(after.problems)}`);
      check(after.problems.some((p) => /you left out/.test(p)), screen.tag, "first · bad names",
        "a name left out on purpose must be named as a decision, not swallowed");
      console.log(`  first · bad names        3 asked · "${typo ? typo.chosen[0] : "?"}" pre-chosen · ` +
        `${count} cards after · ${JSON.stringify(after.problems.filter((p) => /left out/.test(p)))}`);
      await healthy(fix.page, screen.tag, "first · bad names");
      await fix.ctx.close();
    }

    /* A FRIEND'S DECK, ON A BROWSER THAT HAS NEVER OPENED THE APP.
     *
     * tests/fixtures/splinter-deck.txt is a real export somebody handed over: 80 lines,
     * 100 cards, a Universes Beyond commander, and one name that is not a card. It is the
     * whole first-time experience in one paste, and it is the thing to get right, because
     * the person doing it has no reason to give the app a second try.
     *
     * Three promises are checked here that nothing else checks:
     *   1. every real name in a stranger's deck can be placed;
     *   2. the one bad name is answered with real cards, and never with a card the deck
     *      already holds -- this list carries four Splinter legends already;
     *   3. adding it leaves ONE deck on the page. Not seven. A browser that started empty
     *      stays empty apart from what its owner put in it.
     */
    {
      const friend = await freshPage(screen);
      const LIST = readFileSync(join(HERE, "..", "fixtures", "splinter-deck.txt"), "utf8");
      const REAL = LIST.split(/\r?\n/).filter(Boolean)
        .map((line) => (/^\s*\d+\s+(.+?)\s*$/.exec(line) || [])[1])
        .filter((name) => name && name !== "Splinter, Vengeful Sensei");
      /* The stub has to know more than this deck. The registry rung offers names and the
         ladder then turns them into cards in one request -- so a stub that only knows the
         deck answers "no such card" for every candidate it just offered, and the reader
         sees an empty list. Real Scryfall knows all of them. */
      const REG = JSON.parse(readFileSync(join(HERE, "..", "..", "data", "commander-universe.json"), "utf8"));
      const KNOWN = new Set(REAL.concat(
        REG.cards.map((row) => row[0]).filter((n) => /^Splinter/i.test(n))));
      await friend.page.route("**://api.scryfall.com/**", async (route) => {
        const url = new URL(route.request().url());
        const json = (body) => route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify(body)});
        const card = (name) => ({
          name, type_line: /Splinter|Leo|Donatello|Karai|Shredder|April/.test(name)
            ? "Legendary Creature — Rat Ninja" : "Artifact",
          legalities: {commander: "legal"}, cmc: 2, mana_cost: "{1}{B}",
          color_identity: ["B", "U"], prices: {usd: "1.00"},
          image_uris: {small: `${BASE}/og.png`, normal: `${BASE}/og.png`}
        });
        if (url.pathname === "/cards/autocomplete") {
          const q = (url.searchParams.get("q") || "").toLowerCase();
          return json({data: [...KNOWN].filter((n) => n.toLowerCase().startsWith(q)).slice(0, 20)});
        }
        if (url.pathname === "/cards/collection") {
          const body = JSON.parse(route.request().postData() || "{}");
          const data = [], not_found = [];
          (body.identifiers || []).forEach((id) =>
            (KNOWN.has(id.name) ? data.push(card(id.name)) : not_found.push(id)));
          return json({data, not_found});
        }
        // One exact printing, which is what a pasted Scryfall card link resolves to.
        if (/^\/cards\/[a-z0-9]+\/\d+/.test(url.pathname)) return json(card("Splinter's Technique"));
        return route.fulfill({status: 404, contentType: "application/json", body: JSON.stringify({object: "error"})});
      });
      await friend.page.goto(`${BASE}/legacy-decks.html`, {waitUntil: "domcontentloaded"});
      await friend.page.waitForSelector(".start-tile", {timeout: 20000});
      await friend.page.click(".start-tile.deck-add");
      await friend.page.waitForSelector("[data-imp-text]", {timeout: 10000});
      await friend.page.fill("[data-imp-text]", LIST);
      await friend.page.click("[data-imp-read]");
      await friend.page.waitForSelector(".imp-fix-row", {timeout: 30000});
      await friend.page.waitForTimeout(2000);

      const rows = await friend.page.evaluate(() => [...document.querySelectorAll(".imp-fix-row")].map((row) => ({
        name: row.querySelector(".imp-fix-asked b").textContent,
        options: [...row.querySelectorAll(".imp-fix-opt")].map((o) => o.querySelector("b").textContent),
        hasLink: Boolean(row.querySelector("[data-fix-link]"))
      })));
      check(rows.length === 1 && /Vengeful Sensei/.test(rows[0].name), screen.tag, "first · a friend's deck",
        `${rows.length} names could not be placed, expected exactly 1: ${rows.map((r) => r.name).join(", ")}`);
      const offered = (rows[0] || {options: []}).options.filter((n) => !/Leave it out/.test(n));
      check(offered.length >= 3, screen.tag, "first · a friend's deck",
        `only ${offered.length} candidates for the bad name: ${JSON.stringify(offered)}`);
      check(offered.every((n) => /^Splinter/i.test(n)), screen.tag, "first · a friend's deck",
        `a candidate unrelated to the name asked about: ${JSON.stringify(offered)}`);
      /* The deck already holds four Splinter legends. Offering one of them would build a
         hundred with two copies of a singleton card. */
      const held = ["Splinter, Radical Rat", "Splinter, Hamato Yoshi", "Splinter, the Mentor"];
      check(!offered.some((n) => held.includes(n)), screen.tag, "first · a friend's deck",
        `a card already in the deck was offered as the answer: ${JSON.stringify(offered)}`);
      check(rows[0] && rows[0].hasLink, screen.tag, "first · a friend's deck",
        "there is no way to give the card by link when none of the guesses is right");

      /* THE LINK. None of the guesses is the card, so the reader pastes the page they are
         looking at. It resolves to one exact printing and the row is decided. */
      await friend.page.fill("[data-fix-link]", "https://scryfall.com/card/tmnt/42/splinters-technique");
      await friend.page.click("[data-fix-linkgo]");
      await friend.page.waitForTimeout(1500);
      const linked = await friend.page.evaluate(() => ({
        note: (document.querySelector(".imp-fix-linknote") || {}).textContent || "",
        chosen: [...document.querySelectorAll(".imp-fix-opt.is-on")].map((o) => o.querySelector("b").textContent)
      }));
      check(linked.chosen.includes("Splinter's Technique"), screen.tag, "first · a friend's deck",
        `the link did not decide the row: ${JSON.stringify(linked)}`);
      await shot(friend.page, `${screen.tag}-first-friends-deck`);

      await friend.page.click("[data-imp-fixdone]");
      await friend.page.waitForSelector(".imp-score", {timeout: 20000});
      await friend.page.waitForTimeout(2500);
      const review = await friend.page.evaluate(() => ({
        lede: (document.querySelector(".imp-lede") || {}).textContent || "",
        problems: [...document.querySelectorAll(".imp-problems li")].map((n) => n.textContent.trim()),
        score: (document.querySelector(".mr-score b") || {}).textContent || "",
        // The readout, not just the number: "51.33" on its own was the complaint.
        parts: [...document.querySelectorAll(".mr-part")].map((n) =>
          (n.querySelector("b") || {}).textContent || ""),
        receipt: (document.querySelector(".mr-receipt") || {}).textContent || ""
      }));
      const cards = Number((review.lede.match(/(\d+) cards/) || [])[1] || 0);
      check(cards === 100, screen.tag, "first · a friend's deck",
        `the deck came out at ${cards} cards, not 100 — problems: ${JSON.stringify(review.problems)}`);
      check(Number(review.score) > 0, screen.tag, "first · a friend's deck",
        `a hundred cards with a commander must be scored, got "${review.score}"`);
      check(review.parts.length >= 6, screen.tag, "first · a friend's deck",
        `the score is shown with ${review.parts.length} of its parts — a bare number was the complaint`);
      check(/games/.test(review.receipt) && /a second/.test(review.receipt), screen.tag,
        "first · a friend's deck",
        `the run does not say how much work it did: "${review.receipt}"`);

      await friend.page.click("[data-imp-save]");
      await friend.page.waitForTimeout(2000);
      // Saving lands on the deck's own page, which is the right place to be sent; My Decks
      // is where the count lives.
      await friend.page.goto(`${BASE}/legacy-decks.html#/decks`, {waitUntil: "domcontentloaded"});
      await friend.page.waitForTimeout(2500);
      const mine = await friend.page.evaluate(() => ({
        decks: document.querySelectorAll(".deck-card").length,
        titles: [...document.querySelectorAll(".deck-card h3, .deck-card .deck-name")].map((n) => n.textContent.trim()),
        images: [...document.querySelectorAll("img")].filter((i) => i.getAttribute("src")).length
      }));
      check(mine.decks === 1, screen.tag, "first · a friend's deck",
        `after adding one deck to an empty browser there are ${mine.decks} decks: ${JSON.stringify(mine.titles)}`);
      await healthy(friend.page, screen.tag, "first · a friend's deck");
      console.log(`  first · a friend's deck  100 cards, 1 name asked about, ` +
        `${offered.length} real candidates, decided by link · scored ${review.score} · ` +
        `${mine.decks} deck on the page`);
      await friend.ctx.close();
    }

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

    /* THE SHOPPING TRIP. Shop has four views and a phone used to land on the
       table -- every card any selected deck wants, each row stacked into a 195px
       card, 414 of them: 105 screens at 390px. Store is the same trip in 23 and
       is the view built for it, with a search box, the seller's own letter
       groups and one Buy button per row. So a narrow screen must land somewhere
       it can actually shop. */
    await page.click('.main-tab[data-view="shop2"]');
    await page.waitForTimeout(3000);
    const shopTall = await page.evaluate(() => document.documentElement.scrollHeight);
    const shopScreens = shopTall / screen.h;
    const landed = clean(await page.locator('#view-shop2 [data-sp-view][aria-pressed="true"]')
      .first().textContent().catch(() => ""));
    check(shopScreens < 40, screen.tag, "continued · a shopping trip",
      `Shop opens ${Math.round(shopScreens)} screens tall on "${landed}"`);
    check(Boolean(landed), screen.tag, "continued · a shopping trip",
      "no Shop view is marked as the one you are looking at");
    // Every view stays one tap away, wherever the landing put you.
    const views = await page.locator("#view-shop2 [data-sp-view]").count();
    check(views === 4, screen.tag, "continued · a shopping trip",
      `${views} Shop views reachable, expected 4`);
    console.log(`  continued · a trip       lands on "${landed}" · ${Math.round(shopScreens)} screens · ${views} views`);

    /* The Gallery carries the same green Buy button as the Store, so it answers the same
       question and starts from the same place: what is still owed. It used to render every
       card any deck names to reach the ones that needed buying. "Show everything" is the
       way back, and it has to be ON the Gallery -- it used to live only in the Store's own
       toolbar, so scoping the Gallery without moving it would have hidden cards behind a
       button on another view. */
    await page.locator('#view-shop2 [data-sp-view="gallery"]').first().click();
    await page.waitForTimeout(2500);
    const owed = await page.evaluate(() => document.querySelectorAll("#view-shop2 .sp-card").length);
    const showAll = page.locator("#view-shop2 [data-sp-storeall]").first();
    check(await showAll.count() > 0, screen.tag, "continued · a shopping trip",
      "the Gallery is scoped to what is owed with no way back to everything");
    await showAll.click();
    await page.waitForTimeout(2500);
    const everything = await page.evaluate(() => document.querySelectorAll("#view-shop2 .sp-card").length);
    check(owed > 0 && everything > owed, screen.tag, "continued · a shopping trip",
      `the Gallery showed ${owed} owed and ${everything} in total — the scoping is doing nothing`);
    console.log(`     gallery ${owed} owed · ${everything} with "Show everything"`);

    /* THE WRITTEN PULL LIST. Fifty-five of its sixty-eight cards are named by no deck the
       app tracks, so nothing derived can produce them: if the merge silently drops out,
       every other number on this page still adds up and the cards simply are not there.
       Checked by count, against the file, with "Show everything" already on -- a card the
       ledger has since caught up with still has a row, it just has nothing owed on it. */
    const pullList = JSON.parse(readFileSync(join(ROOT, "data", "pull-list.json"), "utf8"));
    const listDrop = page.locator('#view-shop2 [data-sp-drop="list"]').first();
    check(await listDrop.count() > 0, screen.tag, "continued · a shopping trip",
      "no List filter, so there is no way to see which rows came off the written list");
    if (await listDrop.count() > 0) {
      /* On a phone every filter folds behind one button, so the List filter is reachable
         but not on screen. Open the fold first -- and check that opening it is enough,
         because a filter you cannot reach is a filter that is not there. */
      if (!(await listDrop.isVisible())) await page.locator("#view-shop2 [data-sp-mob]").first().click();
      check(await listDrop.isVisible(), screen.tag, "continued · a shopping trip",
        "the List filter never comes into view, even with the options open");
      await listDrop.click();
      await page.locator('#view-shop2 [data-sp-chk="list|Pull list"]').first().click();
      await page.waitForTimeout(2000);
      const onList = await page.evaluate(() => document.querySelectorAll("#view-shop2 .sp-card").length);
      const tagged = await page.evaluate(() => document.querySelectorAll("#view-shop2 .sp-card .sp-chip.is-list").length);
      check(onList === pullList.totals.cards, screen.tag, "continued · a shopping trip",
        `the pull list has ${pullList.totals.cards} cards, the Shop shows ${onList}`);
      check(tagged === onList, screen.tag, "continued · a shopping trip",
        `${onList} rows scoped to the pull list but only ${tagged} say so`);
      const named = clean(await page.locator("#view-shop2 .sp-list-tot, #view-shop2 .sp-store-list-note")
        .first().textContent().catch(() => ""));
      check(/Pull list/.test(named), screen.tag, "continued · a shopping trip",
        `the Shop does not name the list its extra rows came from (read "${named}")`);
      console.log(`     pull list ${onList} cards, all tagged · ${named}`);
      // Put it back, so the screenshot and the health sweep see the page as it opens.
      await page.locator('#view-shop2 [data-sp-chk="list|Pull list"]').first().click();
      await page.waitForTimeout(1500);
    }

    /* UNDO HAS TO BE A REAL UNDO. Buying a card writes two things -- the ledger and the
       per-deck holds -- and in this ledger a per-deck {inHand: 0, ordered: 0} is not
       "nothing", it is "this box was counted and holds none", which the allocator honours
       by refusing to serve the card at all. Undo used to write that assertion into every
       deck for a card none of them had been counted for, so the copy you bought the next
       day would be denied to all six boxes and the Shop would go on asking for a card
       already in the box. Nothing on screen said so, which is why this is measured in
       storage rather than in the markup. */
    const readShopState = () => page.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("mtg-deck-matrix-state-v1") || "{}");
      return {owned: st.owned || {}, holds: st.deckHolds || {}};
    });
    await page.locator('#view-shop2 [data-sp-view="store"]').first().click();
    await page.waitForTimeout(2000);
    /* "Show everything" is still on from the Gallery check above, and it shows rows that
       owe nothing. Those carry no Buy button -- a green button that changes nothing reads
       as having worked -- so put the Store back to what is owed before pressing one. */
    const showEverything = page.locator("#view-shop2 [data-sp-storeall][aria-pressed='true']").first();
    if (await showEverything.count() > 0) { await showEverything.click(); await page.waitForTimeout(2000); }
    const settled = await page.evaluate(() =>
      [...document.querySelectorAll("#view-shop2 .sp-store-row")]
        .filter((li) => !li.querySelector("[data-sp-buy]")).length);
    check(settled === 0, screen.tag, "continued · a shopping trip",
      `${settled} rows on the owed list have nothing to buy on them`);
    const buyable = page.locator("#view-shop2 [data-sp-buy]").first();
    if (await buyable.count() > 0) {
      const key = await buyable.getAttribute("data-sp-buy");
      const was = await readShopState();
      await buyable.click();
      await page.waitForTimeout(1500);
      const bought = await readShopState();
      check((bought.owned[key]?.inHand || 0) > (was.owned[key]?.inHand || 0), screen.tag,
        "continued · a shopping trip", `buying ${key} did not put a copy in the ledger`);
      await page.locator(`#view-shop2 [data-sp-unbuy="${key}"]`).first().click();
      await page.waitForTimeout(1500);
      const now = await readShopState();
      check(JSON.stringify(now.owned[key] || null) === JSON.stringify(was.owned[key] || {inHand: 0, ordered: 0}),
        screen.tag, "continued · a shopping trip",
        `undo left ${key} owned as ${JSON.stringify(now.owned[key])}, was ${JSON.stringify(was.owned[key] || null)}`);
      const planted = Object.entries(now.holds)
        .filter(([deck]) => was.holds[deck] && was.holds[deck][key] === undefined)
        .filter(([deck]) => now.holds[deck][key] !== undefined)
        .map(([deck]) => deck);
      check(planted.length === 0, screen.tag, "continued · a shopping trip",
        `undo left ${key} counted-and-absent in ${planted.join(", ")}, which denies the card to those decks`);
      console.log(`     buy then undo ${key} · ledger and ${Object.keys(now.holds).length} boxes back as they were`);
    }
    await healthy(page, screen.tag, "continued · a shopping trip");
    await shot(page, `${screen.tag}-continued-shop`);
    await healthy(page, screen.tag, "continued · a shopping trip");
    await ctx.close();
  }

  // ═══ CONTINUED: records a game the moment it ends ═══
  {
    const {ctx, page} = await freshPage(screen);
    await page.goto(`${BASE}/matrix.html`, {waitUntil: "domcontentloaded"});
    await page.evaluate((s) => localStorage.setItem("mtg-deck-matrix-state-v1", JSON.stringify(s)), seed);
    await page.reload({waitUntil: "domcontentloaded"});
    await page.waitForTimeout(4500);
    await page.click('.main-tab[data-view="log"]');
    await page.waitForTimeout(2000);

    /* WHERE THE KEYBOARD IS, VISIBLY. Taken COLD -- before anything on this page
       has been typed into -- because Chromium's :focus-visible heuristic turns
       permissive once the last interaction was a keypress, so a walk taken after
       filling the form tells you less. The ring is read off the computed style
       rather than from :focus-visible matching, for the same reason.
       This is a floor, not a trap: it holds every control on the form to showing
       SOMETHING when the keyboard reaches it, which is what a blanket
       `outline: none` would take away. It does not discriminate finer than that,
       and it did not catch the missing rule that prompted it -- removing that
       rule again leaves this passing. Said plainly so nobody reads more into a
       green run than it earns. */
    await page.evaluate(() => document.body.focus());
    let litUp = 0, tabbed = 0;
    for (let i = 0; i < 26; i += 1) {
      await page.keyboard.press("Tab");
      const lit = await page.evaluate(() => {
        const n = document.activeElement;
        if (!n || n === document.body || !n.closest("#view-log")) return null;
        const css = getComputedStyle(n);
        return (css.outlineStyle !== "none" && parseFloat(css.outlineWidth) > 0) ||
          css.boxShadow !== "none";
      });
      if (lit === null) continue;
      tabbed += 1;
      if (lit) litUp += 1;
    }
    check(tabbed > 0 && litUp === tabbed, screen.tag, "continued · records a game",
      `${tabbed - litUp} of ${tabbed} controls on this form show nothing when the keyboard reaches them`);

    /* The log had been read back at 250 games and never once WRITTEN to by a
       test. Everything below is what somebody does at the table with a phone in
       one hand. */
    const box = page.locator("#view-log");
    await box.locator("select").first().selectOption({index: 1});
    await box.locator("button", {hasText: /^Won$/}).first().click();
    await box.locator("button", {hasText: /^4$/}).first().click();
    await box.locator("input[type=number]").first().fill("11");
    await box.locator("button", {hasText: /^Great$/}).first().click();
    await box.locator("button", {hasText: /^Good$/}).last().click();
    await box.locator("input[type=text]").first().fill("Won on turn 11.");
    await box.locator("button", {hasText: /^Save game$/}).first().click();
    await page.waitForTimeout(1500);

    const saved = await page.evaluate(() => {
      const log = (JSON.parse(localStorage.getItem("mtg-deck-matrix-state-v1") || "{}").gameLog) || [];
      return log[log.length - 1] || null;
    });
    check(Boolean(saved), screen.tag, "continued · records a game", "pressing Save stored nothing");
    if (saved) {
      check(saved.result === "win" && saved.players === 4 && saved.turns === 11,
        screen.tag, "continued · records a game",
        `the entry lost what was typed into it: ${JSON.stringify(saved)}`);
      check(saved.podFun === 5 && saved.myFun === 4, screen.tag, "continued · records a game",
        `the two fun scales are crossed or dropped: pod ${saved.podFun}, mine ${saved.myFun}`);
    }
    const onScreen = clean(await page.locator("#view-log .log-list").innerText().catch(() => ""));
    check(/Won on turn 11\./.test(onScreen), screen.tag, "continued · records a game",
      "the game saved but is not in the list underneath");

    /* The two fun scales are the same five words twice -- Rough, Meh, Fine, Good,
       Great -- so without a group name they are ten identical buttons in a row to
       anybody not looking at the screen. And being chosen was a CSS class on all
       seventeen chips, which says nothing at all. */
    const aria = await page.evaluate(() => {
      const v = document.getElementById("view-log");
      const groups = [...v.querySelectorAll(".log-chips")];
      return {
        groups: groups.length,
        named: groups.filter((g) => g.getAttribute("aria-label")).length,
        distinct: new Set(groups.map((g) => g.getAttribute("aria-label"))).size,
        chips: v.querySelectorAll(".log-chips button").length,
        stated: v.querySelectorAll(".log-chips button[aria-pressed]").length
      };
    });
    check(aria.named === aria.groups && aria.distinct === aria.groups, screen.tag,
      "continued · records a game",
      `${aria.named} of ${aria.groups} chip groups are named, ${aria.distinct} of them distinctly`);
    check(aria.stated === aria.chips, screen.tag, "continued · records a game",
      `${aria.stated} of ${aria.chips} chips say whether they are the one chosen`);
    console.log(`  continued · a game       saved ${saved ? saved.result : "nothing"} in ${saved ? saved.turns : "?"} turns · ` +
      `${aria.chips} chips in ${aria.groups} named groups · ${litUp}/${tabbed} visible on tab`);
    await shot(page, `${screen.tag}-continued-game`);
    await healthy(page, screen.tag, "continued · records a game");
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

  // ═══ FIRST: opens the card graph, which is the whole rich corpus ═══
  {
    const {ctx, page} = await freshPage(screen);
    await page.goto(`${BASE}/legacy-graph.html`, {waitUntil: "domcontentloaded"});
    await page.waitForSelector(".gp-card", {timeout: 25000});
    /* content-visibility means the document height is an ESTIMATE until the
       tiles render, so measure nothing until it stops moving. A scroll computed
       from an unsettled page lands past the end, and the browser then satisfies
       that request as the real heights arrive -- which this harness twice read
       as the app scrolling itself. */
    await page.evaluate(() => new Promise((done) => {
      let last = -1, same = 0;
      const tick = () => {
        const h = document.documentElement.scrollHeight;
        if (h === last) { if (++same >= 5) return done(h); } else { same = 0; last = h; }
        requestAnimationFrame(tick);
      };
      tick();
    }));

    const tall = await page.evaluate(() => document.documentElement.scrollHeight);
    const tiles = await page.locator(".gp-card").count();
    const screens = tall / screen.h;
    check(screens < 10, screen.tag, "first · the graph",
      `the card list is ${Math.round(screens)} screens tall on a first look`);
    const legend = clean(await page.locator(".gp-legend").first().textContent().catch(() => ""));
    check(/of 7,7\d\d cards/.test(legend), screen.tag, "first · the graph",
      `the list must say how much of the catalog it is showing, said "${legend}"`);
    /* WHOSE CARDS THESE ARE. data/graph.json is baked from the collection as well as from
       Magic, so every card carried "in hand", "on order", "bench" and the decks that name
       it. For the person it was baked for that is the point of the page; for everybody
       else it was a claim about cards they have never owned. On a browser that has saved
       nothing those four fields are dropped, and the two facets that read them go with
       them. What is left is Magic, and the list stays full -- 7,764 cards. */
    const whose = await page.evaluate(() => ({
      facets: [...document.querySelectorAll(".gp-facet summary")].map((n) => n.textContent.trim().split(/\s/)[0]),
      owned: document.querySelectorAll(".gp-tag.own").length,
      decks: document.querySelectorAll(".gp-tag.deck").length,
      commanders: document.querySelectorAll(".gp-tag.cmdr").length
    }));
    check(whose.owned === 0 && whose.decks === 0, screen.tag, "first · the graph",
      `a browser that has saved nothing is shown ${whose.owned} "in hand" and ${whose.decks} deck tags`);
    check(!whose.facets.includes("Ownership") && !whose.facets.includes("In"), screen.tag, "first · the graph",
      `Ownership and In-a-deck are offered with nothing behind them: ${JSON.stringify(whose.facets)}`);
    check(whose.commanders > 0, screen.tag, "first · the graph",
      "no card says it can be a commander, which is the first thing asked of a legendary creature");
    check(tiles > 20, screen.tag, "first · the graph",
      `the card list is ${tiles} tiles — it is not me-specific and must stay full`);
    console.log(`  first · the graph        ${tiles} tiles · ${Math.round(screens)} screens · ` +
      `${whose.facets.length} facets, ${whose.commanders} commander tags, no ownership · "${legend.slice(0, 24)}…"`);

    /* Wheel and click, not scrollTo and .click(): a programmatic scroll on this
       page is what produced two invented "jumps" that a real gesture does not. */
    for (let i = 0; i < 60; i += 1) {
      const onScreen = await page.evaluate(() => {
        const b = document.querySelector(".gp-show-rest");
        if (!b) return true;
        const r = b.getBoundingClientRect();
        return r.top > 0 && r.bottom < window.innerHeight;
      });
      if (onScreen) break;
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(110);
    }
    await page.waitForTimeout(500);
    const held = await page.evaluate(() => {
      const vis = [...document.querySelectorAll(".gp-card")].filter((n) => {
        const r = n.getBoundingClientRect();
        return r.top > 40 && r.bottom < window.innerHeight - 40;
      });
      const t = vis[Math.floor(vis.length / 2)];
      return {name: t.querySelector("b").textContent, top: Math.round(t.getBoundingClientRect().top)};
    });
    await page.locator(".gp-show-rest").click();
    await page.waitForTimeout(1200);
    const grew = await page.evaluate((name) => {
      const b = [...document.querySelectorAll(".gp-card b")].find((x) => x.textContent === name);
      return {tiles: document.querySelectorAll(".gp-card").length,
        top: b ? Math.round(b.closest(".gp-card").getBoundingClientRect().top) : null};
    }, held.name);
    check(grew.tiles > tiles, screen.tag, "first · the graph",
      `asking for more left ${grew.tiles} tiles, the same as before`);
    check(grew.top !== null && Math.abs(grew.top - held.top) <= 2, screen.tag, "first · the graph",
      `"${held.name}" moved ${grew.top - held.top}px when more cards arrived`);
    console.log(`     more → ${grew.tiles} tiles, "${held.name}" moved ${grew.top - held.top}px`);
    await shot(page, `${screen.tag}-first-graph`);
    await healthy(page, screen.tag, "first · the graph");
    await ctx.close();
  }

  // ═══ FIRST: names the card they came to look at ═══
  /* The graph is drawn around ONE card, and until now the only way to choose that card
     was to find it in the list and press Focus inside its popup. That works for the cards
     cards the corpus was baked with; for anything else there was no way in at all, which
     is most of Magic. This journey types a name that is NOT in the catalog and asserts the
     page goes and gets it -- and refuses the one that is banned.

     Scryfall is stubbed with its own real answers, saved under fixtures/. The point is to
     exercise this page's path through a lookup, and a journey that fails when a third
     party is slow is a journey people learn to ignore. */
  {
    const {ctx, page} = await freshPage(screen);
    const answers = {
      "nine lives": readFileSync(join(HERE, "fixtures", "scryfall-nine-lives.json"), "utf8"),
      "dockside": readFileSync(join(HERE, "fixtures", "scryfall-dockside-extortionist.json"), "utf8")
    };
    await page.route(/api\.scryfall\.com\/cards\/named/, (route) => {
      const asked = decodeURIComponent(route.request().url()).toLowerCase();
      const key = Object.keys(answers).find((k) => asked.includes(k));
      if (!key) return route.fulfill({status: 404, contentType: "application/json",
        body: JSON.stringify({object: "error", status: 404, details: "No card"})});
      route.fulfill({status: 200, contentType: "application/json", body: answers[key]});
    });
    await page.goto(`${BASE}/legacy-graph.html`, {waitUntil: "domcontentloaded"});
    await page.waitForSelector(".gp-card", {timeout: 25000});
    const openPane = async () => {
      if (await page.locator("#pane").isVisible()) return;
      await page.locator("#pane-toggle").click();
      await page.waitForTimeout(350);
    };
    await openPane();
    check(await page.locator("#focus-q").isVisible(), screen.tag, "first · names a card",
      "the Filters pane has no way to name the card the graph is drawn around");

    // A card the catalog HAS comes up as you type, without a round trip.
    await page.locator("#focus-q").fill("Krenko");
    await page.waitForTimeout(400);
    const names = await page.evaluate(() => [...document.querySelectorAll("[data-focus-pick]")]
      .map((b) => (b.querySelector("b") || {}).textContent || ""));
    check(names.some((n) => /Krenko/.test(n)), screen.tag, "first · names a card",
      `typing a card in the catalog suggested ${JSON.stringify(names)}`);
    check(await page.locator("[data-focus-lookup]").count() > 0, screen.tag, "first · names a card",
      "there is no way on to the rest of Magic when the catalog's matches are not the card you meant");

    // And a card it does NOT have is fetched, read and drawn.
    await page.locator("#focus-q").fill("Nine Lives");
    await page.waitForTimeout(400);
    await page.locator("[data-focus-lookup]").first().click();
    await page.waitForTimeout(2500);
    const looked = await page.evaluate(() => ({
      msg: (document.getElementById("focus-msg") || {}).textContent || "",
      count: (document.getElementById("count") || {}).textContent || "",
      legend: (document.getElementById("legend") || {}).textContent || "",
      chips: [...document.querySelectorAll(".gp-focus-chip")].map((c) => c.textContent.replace("×", "").trim()),
      onGraph: (document.querySelector('[data-view="graph"]') || {}).getAttribute
        ? document.querySelector('[data-view="graph"]').getAttribute("aria-pressed") : null
    }));
    check(/Nine Lives/.test(looked.msg), screen.tag, "first · names a card",
      `looking up a card outside the catalog said "${clean(looked.msg)}"`);
    check(looked.onGraph === "true", screen.tag, "first · names a card",
      "a card was looked up but the graph was never shown");
    check(/Center: Nine Lives/.test(clean(looked.legend)), screen.tag, "first · names a card",
      `the graph is not centered on the card that was asked for: "${clean(looked.legend).slice(0, 90)}"`);
    check(/looked up/.test(looked.count), screen.tag, "first · names a card",
      `the count does not say the catalog grew: "${clean(looked.count)}"`);
    check(looked.chips.some((c) => /Nine Lives/.test(c)), screen.tag, "first · names a card",
      "a looked-up card cannot be seen or dropped once it is in");
    console.log(`  first · names a card     ${clean(looked.count)} · "${clean(looked.legend).slice(0, 40)}…"`);

    // A card that is not legal in Commander is refused, by name, with the reason.
    await openPane();
    await page.locator("#focus-q").fill("Dockside Extortionist");
    await page.waitForTimeout(400);
    await page.locator("[data-focus-lookup]").first().click();
    await page.waitForTimeout(2000);
    const refused = clean(await page.locator("#focus-msg").textContent());
    check(/banned|not legal/i.test(refused), screen.tag, "first · names a card",
      `a card banned in Commander was not refused: "${refused}"`);
    check(!/Dockside/.test(await page.locator("#focus-kept").textContent()), screen.tag,
      "first · names a card", "a banned card was refused and kept anyway");
    console.log(`     banned card refused: "${refused.slice(0, 70)}…"`);

    /* THE COPILOT'S OWN FILTERS. Twenty findings is a reading list, and its axes cut it
       down. The rule being checked is the one that makes them safe to leave on: what does
       not match FOLDS, with its count on the label, rather than vanishing -- a filter that
       hides evidence is one you have to remember you set.

       Kind and From are always there; Deck is only there when there are decks, and this
       persona's browser has saved nothing, so it is not. That is the point rather than a
       gap: an axis whose every option is "no deck" is a control that filters nothing. */
    await page.evaluate(() => { const d = document.getElementById("copilot"); if (d) d.open = true; });
    await page.waitForTimeout(300);
    const axes = await page.evaluate(() => [...document.querySelectorAll(".gp-cpf-row")]
      .map((r) => (r.querySelector(".gp-cpf-lab") || {}).textContent || ""));
    check(axes.length >= 2 && axes.includes("Kind") && axes.includes("From"), screen.tag,
      "first · names a card",
      `the Copilot offers ${axes.length} ways to narrow twenty findings: ${JSON.stringify(axes)}`);
    check(!axes.includes("Deck"), screen.tag, "first · names a card",
      "a browser with no decks is offered a Deck filter, which can only filter to nothing");
    const before = await page.locator("#copilot > .gp-cp-grid > .gp-cp").count();
    await page.locator('[data-cpf="kind"]').first().click();
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => ({
      shown: document.querySelectorAll("#copilot > .gp-cp-grid > .gp-cp").length,
      drawer: [...document.querySelectorAll(".gp-cp-set > summary")]
        .map((x) => x.textContent.replace(/\s+/g, " ").trim()),
      summary: (document.querySelector("#copilot summary") || {}).textContent || ""
    }));
    check(after.shown < before, screen.tag, "first · names a card",
      `filtering the Copilot by kind changed nothing: ${before} findings before and after`);
    check(after.drawer.some((d) => /outside these filters/.test(d)), screen.tag, "first · names a card",
      `the findings that do not match were hidden rather than folded: ${JSON.stringify(after.drawer)}`);
    check(/of \d+ showing/.test(clean(after.summary)), screen.tag, "first · names a card",
      `the Copilot does not say it is filtered: "${clean(after.summary)}"`);
    console.log(`     copilot ${before} → ${after.shown} on one filter · "${after.drawer[0]}"`);
    await shot(page, `${screen.tag}-first-focus`);
    await healthy(page, screen.tag, "first · names a card");
    await ctx.close();
  }

  // ═══ CONTINUED, at scale: a collection that grew ═══
  {
    const {ctx, page} = await freshPage(screen);
    await page.goto(`${BASE}/legacy-decks.html`, {waitUntil: "domcontentloaded"});
    await page.evaluate(([decks, inventory]) => {
      localStorage.setItem("mtg-imported-decks.v1", JSON.stringify({schema: 1, decks}));
      localStorage.setItem("mtg-viewer-inventory.v1", JSON.stringify(inventory));
      /* THIS PERSONA HAS THE SIX. Which catalog a browser starts from is a recorded
         decision now, not a guess at one -- so a fixture for somebody who has been using
         the app with the shipped decks has to say so, the same way their browser would
         after they pressed Load default. Without it this is a browser that started empty
         and then had ten decks pasted into it, which is a different person entirely (and
         is the journey two blocks up). */
      localStorage.setItem("mtg-catalog-source.v1", "default");
    }, [GROWN.decks, GROWN.inventory]);
    // A full load, not a hash change: navigating to a URL that differs only by
    // its fragment is a same-document navigation, so the app would still be the
    // one that booted before any of this was written. That mistake made this
    // harness report an eleven-fold difference in the bench count twice.
    await page.goto("about:blank");
    await page.goto(`${BASE}/legacy-decks.html`, {waitUntil: "domcontentloaded"});
    await page.waitForSelector(".deck-card", {timeout: 20000});

    const decks = await page.locator(".deck-card").count();
    check(decks === 16, screen.tag, "continued · a collection",
      `${decks} decks with ten added to the six, expected 16`);
    await healthy(page, screen.tag, "continued · a collection");

    await page.locator(".tab").filter({hasText: /^\s*Bench/}).first().click();
    await page.waitForTimeout(600);

    const benchTall = await page.evaluate(() => document.documentElement.scrollHeight);
    const benchScreens = benchTall / screen.h;
    const rows = await page.locator(".ct-row").count();
    check(benchScreens < 10, screen.tag, "continued · a collection",
      `the bench is ${Math.round(benchScreens)} screens tall — 1,940 spare cards in one list`);
    check(rows < 120, screen.tag, "continued · a collection",
      `${rows} rows rendered at once — the bench has no ceiling`);

    // The button has to name what is held back, or the cap is a lie of omission: a
    // reader who cannot see the other 1,890 must at least be told there are 1,890.
    const capped = clean(await page.locator(".ct-more").first().textContent());
    check(/^Show the other [\d,]+ cards?$/.test(capped), screen.tag, "continued · a collection",
      `a capped list must say how many it is holding back, said "${capped}"`);

    /* Sorted by what a spare card is WORTH -- its price times how many of it there are --
       not by its initial: the first fifty of two thousand is only a useful answer if the
       fifty were chosen. The column says so in its header, and the header is the control. */
    const worth = await page.$$eval(".ct-row .ct-cell:last-of-type",
      (ns) => ns.slice(0, 10).map((n) => Number(n.textContent.replace(/[^0-9.]/g, "")) || 0));
    check(worth[0] >= worth[9] && worth[0] > 5, screen.tag, "continued · a collection",
      `the bench opens on $${worth[0]} then $${worth[9]} — it is not showing the valuable spares first`);
    const sorted = await page.locator(".ct-sort.is-on").first().textContent();
    check(/Worth/.test(sorted), screen.tag, "continued · a collection",
      `the lit column header says "${clean(sorted)}", so the reader cannot tell what the order is`);
    console.log(`  continued · a collection ${decks} decks · bench ${rows} rows, ${Math.round(benchScreens)} screens · "${capped}"`);

    // Everything is still reachable, and reaching it does not move the reader.
    await page.evaluate(() => {
      const b = document.querySelector(".ct-more");
      window.scrollTo(0, window.scrollY + b.getBoundingClientRect().top - 400);
    });
    await page.waitForTimeout(150);
    const anchored = await page.evaluate(() => {
      const all = [...document.querySelectorAll(".ct-row")];
      const last = all[all.length - 1];
      return {name: last.querySelector("b").textContent, top: Math.round(last.getBoundingClientRect().top)};
    });
    // .click() would scroll the button into view first and measure its own move.
    await page.evaluate(() => document.querySelector(".ct-more").click());
    await page.waitForTimeout(600);
    const after = await page.evaluate((name) => {
      // The ROW, not the <b> inside it: measuring the row before and the label after
      // reported a shift that was nothing but the label's offset inside its row.
      const b = [...document.querySelectorAll(".ct-row b")].find((x) => x.textContent === name);
      return {rows: document.querySelectorAll(".ct-row").length,
        top: b ? Math.round(b.closest(".ct-row").getBoundingClientRect().top) : null};
    }, anchored.name);
    check(after.rows > 1500, screen.tag, "continued · a collection",
      `showing the rest gave ${after.rows} rows — the whole bench must still be reachable`);
    check(after.top !== null && Math.abs(after.top - anchored.top) <= 2, screen.tag,
      "continued · a collection",
      `"${anchored.name}" moved ${after.top - anchored.top}px when the rest was shown`);
    console.log(`     show the rest → ${after.rows} rows, "${anchored.name}" moved ` +
      `${after.top === null ? "off the page" : after.top - anchored.top + "px"}`);
    await shot(page, `${screen.tag}-continued-collection`);
    await healthy(page, screen.tag, "continued · a collection");

    /* THE FILTERS, AND THE PROMISE THEIR COUNTS MAKE.
     *
     * Nine dimensions as chip rows would be nine rows of chrome above the list that is
     * the actual page, so each is one button that opens its options. The number on an
     * option is computed against every OTHER filter, which is the only thing it can
     * honestly mean: click this, and you get that many. A count that does not match what
     * the click produces is worse than no count. */
    await page.goto(`${BASE}/legacy-decks.html#/bench`, {waitUntil: "domcontentloaded"});
    await page.waitForSelector(".ct-row", {timeout: 20000});
    const bar = await page.$$eval(".ct-facet-btn", (ns) => ns.map((n) => n.textContent.trim()));
    check(bar.length >= 5, screen.tag, "continued · filters",
      `${bar.length} filterable dimensions on the bench: ${JSON.stringify(bar)}`);
    const barRows = await page.evaluate(() => {
      const r = document.querySelector(".ct-bar").getBoundingClientRect();
      return {height: Math.round(r.height), top: Math.round(r.top)};
    });
    check(barRows.height <= 110, screen.tag, "continued · filters",
      `the filter row is ${barRows.height}px tall before anything is opened — that is chrome, not page`);

    await page.locator(".ct-facet-btn", {hasText: "Rarity"}).first().click();
    await page.waitForTimeout(300);
    const option = await page.evaluate(() => {
      const b = document.querySelector(".ct-menu .ct-opt");
      return b ? {label: b.textContent.replace(/\s+/g, " ").trim(),
                  value: b.getAttribute("data-ct-value"),
                  promised: Number(b.querySelector(".ct-n").textContent)} : null;
    });
    if (check(option !== null, screen.tag, "continued · filters", "the Rarity menu opened empty")) {
      await page.locator(`.ct-opt[data-ct-value="${option.value}"]`).first().click();
      await page.waitForTimeout(400);
      const got = await page.evaluate(() => {
        // Expand every capped band first, or the cap is counted as the filter's answer.
        document.querySelectorAll(".ct-more").forEach((b) => b.click());
        return document.querySelectorAll(".ct-row").length;
      });
      check(got === option.promised, screen.tag, "continued · filters",
        `"${option.label}" promised ${option.promised} rows and gave ${got}`);
      console.log(`     ${bar.length} filters, ${barRows.height}px of chrome · "${option.label}" → ${got} rows`);
    }
    await healthy(page, screen.tag, "continued · filters");

    /* How a list is arranged is a preference, and this persona's whole complaint is
       work that is not where they left it. The filter and the sort both have to survive
       a reload; the search box and the expanded bands deliberately do not. */
    /* Sorting, by whichever control this width offers. The header row IS the sort control
       on a desktop; below 760px the columns fold into the rows and take the header with
       them, so the same choice is a select in the filter bar. A phone that can filter and
       not sort is half a table, and that is what it was. */
    const headerSort = await page.locator(".ct-head").isVisible();
    if (headerSort) {
      await page.locator(".ct-sort", {hasText: "Card"}).first().click();
    } else {
      check(await page.locator("[data-ct-sortby]").isVisible(), screen.tag, "continued · a collection",
        "no way to sort at this width: the header is folded and nothing replaced it");
      await page.selectOption("[data-ct-sortby]", "name");
    }
    await page.waitForTimeout(400);
    await page.goto("about:blank");
    await page.goto(`${BASE}/legacy-decks.html#/bench`, {waitUntil: "domcontentloaded"});
    await page.waitForSelector(".ct-row", {timeout: 20000});
    await page.waitForTimeout(400);
    const kept = await page.evaluate(() => ({
      sort: (document.querySelector(".ct-sort.is-on") || {}).textContent
        || (document.querySelector("[data-ct-sortby] option:checked") || {}).textContent || "",
      chosen: [...document.querySelectorAll(".ct-facet.is-on .ct-facet-btn")].map((b) => b.textContent.trim()),
      rows: document.querySelectorAll(".ct-row").length,
      query: (document.querySelector("[data-ct-query]") || {}).value
    }));
    check(/Card/.test(kept.sort), screen.tag, "continued · a collection",
      `the sort was set to Card and came back as "${clean(kept.sort)}"`);
    check(kept.chosen.length === 1, screen.tag, "continued · a collection",
      `the filter came back as ${JSON.stringify(kept.chosen)}`);
    check(kept.rows <= GROUP_CAP, screen.tag, "continued · a collection",
      `${kept.rows} rows on a fresh visit — "show the rest" must not be what comes back`);
    console.log(`     after a reload: sorted on ${JSON.stringify(clean(kept.sort))}, ` +
      `filtered by ${JSON.stringify(kept.chosen)} · ${kept.rows} rows`);
    await healthy(page, screen.tag, "continued · a collection");

    /* UPGRADES: the card going in, the card coming out, and why -- side by side.
       It had no home at all before; the information existed as a paragraph inside each
       deck page, where nobody could sort it by price or filter it to one deck. */
    await page.locator(".tab").filter({hasText: /^\s*Upgrades/}).first().click();
    await page.waitForTimeout(700);
    const swaps = await page.evaluate(() => {
      const row = document.querySelector(".ct-row");
      if (!row) return null;
      return {
        rows: document.querySelectorAll(".ct-row").length,
        inCard: (row.querySelector(".ct-in b") || {}).textContent || "",
        outCard: (row.querySelector(".ct-out b") || {}).textContent || "",
        why: (row.querySelector(".ct-why") || {}).textContent || "",
        facets: [...document.querySelectorAll(".ct-facet-btn")].map((b) => b.textContent.trim())
      };
    });
    if (check(swaps !== null, screen.tag, "continued · upgrades", "the Upgrades tab is empty")) {
      check(swaps.inCard.length > 2 && swaps.outCard.length > 2, screen.tag, "continued · upgrades",
        `a swap must name both ends: in "${swaps.inCard}", out "${swaps.outCard}"`);
      check(swaps.why.length > 15, screen.tag, "continued · upgrades",
        `"${swaps.inCard}" is recommended with no reason given`);
      check(swaps.facets.length >= 5, screen.tag, "continued · upgrades",
        `${swaps.facets.length} ways to narrow the upgrades: ${JSON.stringify(swaps.facets)}`);
      console.log(`     upgrades ${swaps.rows} swaps · "${swaps.inCard}" → "${swaps.outCard}" · ` +
        `${swaps.facets.length} filters`);
    }
    await shot(page, `${screen.tag}-continued-upgrades`);
    await healthy(page, screen.tag, "continued · upgrades");

    /* THE BUY LIST IS ON THE MATRIX NOW, and the ribbon is how you get there. There were
       two buy lists that disagreed -- this page's, derived from the master plus the
       ledger, and the Shop's, which also knows the written pull list, what has been paid
       and where each card is being bought. One of them had to go, and the ribbon figure
       that summarizes it has to lead to the one that stayed. */
    await page.goto(`${BASE}/legacy-decks.html`, {waitUntil: "domcontentloaded"});
    await page.waitForSelector(".ribbon-stat", {timeout: 20000});
    const ribbon = await page.$$eval(".ribbon-stat", (ns) => ns.map((n) => ({
      text: n.textContent.replace(/\s+/g, " ").trim(), href: n.getAttribute("href")
    })));
    const owed = ribbon.find((r) => /still to buy/.test(r.text));
    const boxed = ribbon.find((r) => /cards boxed/.test(r.text));
    check(ribbon.length === 7, screen.tag, "continued · the ribbon",
      `${ribbon.length} of the ribbon's figures lead anywhere, expected all 7`);
    check(owed && owed.href === "matrix.html#shop", screen.tag, "continued · the ribbon",
      `"still to buy" goes to ${owed ? owed.href : "nowhere"}`);
    check(boxed && boxed.href === "matrix.html#deck", screen.tag, "continued · the ribbon",
      `"cards boxed" goes to ${boxed ? boxed.href : "nowhere"}`);
    check((await page.locator("#tab-buy").count()) === 0, screen.tag, "continued · the ribbon",
      "there are two buy lists again");
    console.log(`     ribbon: ${ribbon.length} figures link out · "${owed ? owed.text : "?"}" → ${owed ? owed.href : "?"}`);
    await healthy(page, screen.tag, "continued · the ribbon");

    /* Load default is in the Matrix's Admin menu and gets pressed out of habit. It
       ships data/active-state.json, which is the workbook's Matrix state and
       says nothing at all about anybody's own decks -- so it must leave them
       alone. A payload with no My Decks block means "this file has no opinion",
       never "delete them", and ten decks is what that distinction is worth. */
    await page.goto(`${BASE}/matrix.html`, {waitUntil: "domcontentloaded"});
    await page.waitForTimeout(4500);
    // Load default is a row in the Admin menu now, not a button in the banner.
    if (!(await page.locator("#admin-button").isVisible().catch(() => false))) {
      await page.click("#header-toggle").catch(() => {});
      await page.waitForTimeout(600);
    }
    await page.click("#admin-button");
    await page.waitForTimeout(400);
    await page.locator(".admin-item", {hasText: "Load default"}).first().click();
    await page.waitForTimeout(4000);
    const survived = await page.evaluate(() => {
      const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
      return {decks: ((read("mtg-imported-decks.v1") || {}).decks || []).length,
        cards: ((read("mtg-viewer-inventory.v1") || {}).cards || []).length};
    });
    check(survived.decks === 10 && survived.cards > 3000, screen.tag, "continued · a collection",
      `Load default left ${survived.decks} added decks and ${survived.cards} collection cards`);
    console.log(`     Load default kept ${survived.decks} added decks, ${survived.cards.toLocaleString()} cards`);
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

    /* On a phone the header is folded, so the Admin button needs it opened first --
       which is what a person does too. Export, Import, Load default, Reset and Clear are
       all rows in that menu now; they were five buttons in the banner, which is five
       things nobody presses in a normal session taking the space of the two they do. */
    const openAdmin = async () => {
      if (!(await page.locator("#admin-button").isVisible().catch(() => false))) {
        await page.click("#header-toggle").catch(() => {});
        await page.waitForTimeout(600);
      }
      await page.click("#admin-button");
      await page.waitForTimeout(400);
    };
    await openAdmin();

    const wait = page.waitForEvent("download", {timeout: 25000});
    await page.locator(".admin-item", {hasText: "Export a backup"}).first().click();
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

    await openAdmin();
    await page.locator(".admin-item", {hasText: "Reset picks"}).first().click();
    await page.waitForTimeout(2500);
    const wiped = await picksIn(page);
    check(wiped === 0, screen.tag, "exit · reset", `Reset All left ${wiped} picks behind`);
    console.log(`  exit · reset             ${wiped} picks`);

    if (saved) {
      await openAdmin();
      await page.setInputFiles(".admin-item.is-file input[type=file]", saved);
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
      await page.goto(`${BASE}/legacy-decks.html`, {waitUntil: "domcontentloaded"});
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

      /* PUTTING A DECK DOWN, WHICH IS WHAT SIXTEEN DECKS IS FOR.
         Archiving is not deleting, and the difference has to be visible in three places
         or it is not worth having: the deck leaves the list, its cards leave the buy
         total, and both come back on one click. The buy total is the one that used to
         only half work -- a deck's upgrade rows left with it and its shortfall rows
         stayed, because the shortfall is a column in the workbook rather than something
         derived from the decks. */
      /* The buy list moved to the Matrix's Shop, so the figure that has to fall when a
         deck is archived is the ribbon's, which is the same number in the place a reader
         now reads it. */
      const buyCount = async () =>
        Number(clean(await page.locator(".ribbon-stat", {hasText: "still to buy"}).first().textContent())
          .replace(/\D/g, "")) || 0;
      const wasDecks = cards, wasBuy = await buyCount();
      const archivedName = clean(await page.locator(".deck-card h3").first().textContent());
      await page.locator(".deck-menu-b").first().click();
      await page.waitForTimeout(300);
      const items = await page.evaluate(() => [...document.querySelectorAll(".deck-menu-pop:not([hidden]) .deck-menu-i b")]
        .map((b) => b.textContent.trim()));
      check(items.includes("Archive"), screen.tag, "exit · import",
        `the deck card offers no way to put a deck down: ${JSON.stringify(items)}`);
      await page.locator('.deck-menu-pop:not([hidden]) .deck-menu-i').first().click();
      await page.waitForTimeout(900);
      const nowDecks = await page.locator(".deck-card").count();
      const nowBuy = await buyCount();
      const drawer = clean(await page.locator(".archive-drawer > summary").textContent().catch(() => ""));
      check(nowDecks === wasDecks - 1, screen.tag, "exit · import",
        `archiving a deck left ${nowDecks} on the list, from ${wasDecks}`);
      check(nowBuy < wasBuy, screen.tag, "exit · import",
        `archiving a deck left the buy list at ${nowBuy}, the same as before — its cards are still being shopped for`);
      check(/archived deck/.test(drawer), screen.tag, "exit · import",
        `a deck vanished from the list with nothing saying where it went (drawer read "${drawer}")`);
      await page.reload({waitUntil: "domcontentloaded"});
      await page.waitForSelector(".deck-card", {timeout: 20000});
      await page.waitForTimeout(800);
      check(await page.locator(".deck-card").count() === wasDecks - 1, screen.tag, "exit · import",
        "the archive did not survive a reload");
      await page.evaluate(() => { document.querySelector(".archive-drawer").open = true; });
      await page.waitForTimeout(200);
      await page.locator(".archive-row .btn").first().click();
      await page.waitForTimeout(900);
      const backDecks = await page.locator(".deck-card").count();
      const backBuy = await buyCount();
      check(backDecks === wasDecks && backBuy === wasBuy, screen.tag, "exit · import",
        `putting it back left ${backDecks} decks and ${backBuy} to buy, from ${wasDecks} and ${wasBuy}`);
      console.log(`     archived "${archivedName}": ${wasDecks}→${nowDecks} decks, ${wasBuy}→${nowBuy} to buy, ` +
        `back to ${backDecks} and ${backBuy}`);

      /* DELETE IS THE OTHER HALF, AND IT IS NOT THE SAME ACT. It destroys the record, so
         it is offered only for a deck added on this device -- the six ship with the app
         and there is nothing local to destroy, and a button claiming otherwise would be
         lying about what it does. Both are checked because a menu that offers Delete on
         all sixteen is the failure, not a missing feature. */
      const menuFor = (added) => page.evaluate((wantAdded) => {
        const slot = [...document.querySelectorAll(".deck-slot")].find((s) =>
          /Added deck|Added · not scored/.test(s.textContent) === wantAdded);
        if (!slot) return null;
        slot.querySelector(".deck-menu-b").click();
        const items = [...slot.querySelectorAll(".deck-menu-pop:not([hidden]) .deck-menu-i b")]
          .map((b) => b.textContent.trim());
        return {items, name: (slot.querySelector("h3") || {}).textContent};
      }, added);
      const shipped = await menuFor(false);
      check(shipped && !shipped.items.includes("Delete"), screen.tag, "exit · import",
        `a deck that ships with the app offers Delete: ${JSON.stringify(shipped && shipped.items)}`);
      const mine = await menuFor(true);
      check(mine && mine.items.includes("Delete") && mine.items.includes("Archive"),
        screen.tag, "exit · import",
        `a deck added on this device offers ${JSON.stringify(mine && mine.items)}, expected both`);
      // The harness already accepts every dialog and records it; a second handler here
      // would try to accept one that is already answered.
      page.dialogs.length = 0;
      await page.evaluate(() => {
        const slot = [...document.querySelectorAll(".deck-slot")]
          .find((s) => /Added deck|Added · not scored/.test(s.textContent));
        [...slot.querySelectorAll(".deck-menu-pop:not([hidden]) .deck-menu-i")]
          .find((b) => /Delete/.test(b.textContent)).click();
      });
      await page.waitForTimeout(1000);
      const left = await page.locator(".deck-card").count();
      const stored = await page.evaluate(() =>
        (JSON.parse(localStorage.getItem("mtg-imported-decks.v1") || "{}").decks || []).length);
      check(left === backDecks - 1 && stored === 9, screen.tag, "exit · import",
        `deleting an added deck left ${left} on screen and ${stored} in storage, from ${backDecks} and 10`);
      // Destroying a deck is the one act on this page that should ask first.
      check(page.dialogs.length === 1, screen.tag, "exit · import",
        `Delete destroyed a deck with ${page.dialogs.length} confirmations`);
      console.log(`     menus: shipped ${JSON.stringify(shipped.items)}, added ${JSON.stringify(mine.items)} · ` +
        `deleted "${mine.name}" → ${left} decks, ${stored} stored`);
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
