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
import {readFileSync, existsSync, mkdirSync, rmSync} from "node:fs";
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

/* The browser binary. Playwright's own default first, then the path this
   project's container puts it at. */
const EXECUTABLE = process.env.UAT_CHROMIUM ||
  ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find((p) => existsSync(p));

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
    await healthy(page, screen.tag, "first · lands");
    console.log(`  first · lands            ${decks} decks, ${adds} ways to add one`);

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

  // ═══ EXIT: takes the work out, wipes, puts it back ═══
  {
    const {ctx, page} = await freshPage(screen, {acceptDownloads: true});
    await page.goto(`${BASE}/matrix.html`, {waitUntil: "domcontentloaded"});
    await page.evaluate((s) =>
      localStorage.setItem("mtg-deck-matrix-state-v1", JSON.stringify(s)), seed);
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
      console.log(`  exit · export            ${file.suggestedFilename()} · ${n} picks inside`);
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
