/* r3's DECK PAGE, FIRST HALF (R3.5a; wireframes 29-deck-more-menu, 31-deck-guide, 11-mobile-deck-detail).
 *
 * In a real page with the committed library restored:
 *
 *   1. "Full guide and SWOT" opens Guide & SWOT as a dialog, in place: the address does not move (the first
 *      look's rule), and the dialog holds the strategy, the deck's notes, the four SWOT quarters and the
 *      recommendations. They are no longer printed at the foot of the Overview.
 *   2. The More menu leads with the design's order -- Measure, Trace in Explore, Guide & SWOT, Export /
 *      print, Compare with…, then Rename and Archive -- and still carries everything it did before.
 *      Guide & SWOT from another tab opens the Overview and the dialog; Compare with… ticks the deck.
 *   3. On an archived deck the menu offers Restore and a red Delete deck….
 *   4. On a phone the action bar is one row that scrolls sideways: every label whole, Make the change
 *      included, and the hero no longer repeats it.
 *   0. (Rob, 2026-10-01) The Overview reads About the commander, then the Simulation history, then the Record; the
 *      header's commander line shows the commander's printed cost; and every mana symbol is the same circle at the
 *      same size, a generic {1} among them, in the header, in About the commander and in the card's dialog.
 *   5. (R3.5b, 30-measure-report) A filed Measure opens as a report: the fidelity notice ABOVE the score,
 *      computed from the report's own facts (unread cards: Medium; a changed list: Low), the score of 100,
 *      and the score's own breakdown as the checks. Export report downloads the report itself.
 *
 * Needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";

let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };

const {browser, base, stub, close} = await openBrowser({name: "deck-page-r3", flag: "GEOMETRY_REQUIRED"});
const DECK = "deck:live:D6";
const openDeck = async (page, tab = "") => { await page.goto(`${base}/index.html#decks?deck=${encodeURIComponent(DECK)}${tab ? "&tab=" + tab : ""}`); await page.locator(".cm-deck-hero h1").waitFor({timeout: 30000}); };
const menuEntries = (page) => page.$$eval(".cm-menu:popover-open button, .cm-menu:popover-open p", (els) => els.map((el) => (el.tagName === "P" ? "§" : "") + (el.querySelector(".cm-rung-label")?.textContent || el.textContent).trim()));

try {
  const context = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  await page.addInitScript(() => (globalThis.CrankFeatures ||= []).push((C) => {globalThis.__cm = C;}));
  await loadLiveState(page, base);

  /* 0. Rob's deck-page findings of 2026-10-01. */
  {
    await openDeck(page);
    await page.locator("#cm-sec-commander").waitFor({timeout: 30000});
    const order = await page.evaluate(() => ["#cm-sec-commander", "#cm-sec-history", "#cm-sec-record"].map((q) => {const el = document.querySelector(q); return el ? [...document.querySelectorAll("#cm-sec-commander, #cm-sec-history, #cm-sec-record")].indexOf(el) : -1;}));
    eq(order, [0, 1, 2], "the Overview reads About the commander first, then the Simulation history, then the Record below it");
    const records = new Map(JSON.parse(readFileSync(new URL("../data/cards.json", import.meta.url), "utf8")).cards.map((c) => [c.name, c]));
    const hero = await page.evaluate(() => {const line = document.querySelector(".cm-deck-hero .cm-hero-commander"); const m = line && line.querySelector(".cm-mana"); return line ? {name: line.textContent.trim(), cost: m && m.getAttribute("aria-label"), symbols: m ? m.children.length : 0} : null;});
    const krenko = records.get("Krenko, Mob Boss");
    eq([hero && hero.name, hero && hero.cost, hero && hero.symbols], ["Krenko, Mob Boss", `Mana cost ${krenko.manaCost}`, krenko.manaCost.match(/\{[^}]+\}/g).length], `the header's commander line shows the commander's printed cost, as the card does (${krenko.manaCost}), not the color identity's pips`);
    const boxes = (sel) => page.evaluate((q) => [...document.querySelectorAll(`${q} .cm-mana > *`)].map((el) => {const r = el.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)];}), sel);
    for (const [where, sel] of [["the header", ".cm-deck-hero"], ["About the commander", "#cm-sec-commander"]]) {
      const b = await boxes(sel);
      ok(b.length >= 3 && b.every(([w, h]) => w === 19 && h === 19), `in ${where} every mana symbol is the same 19px circle (${b.map((x) => x.join("x")).join(", ")})`);
    }
    const drawn = await page.evaluate(() => {
      const box = document.createElement("div"); box.id = "mana-probe"; box.innerHTML = globalThis.__cm.mana("{1}{W}{U}{B}{R}") + globalThis.__cm.mana("{X}{C}{W/U}{4}");
      document.querySelector("#cm-sec-commander").append(box);
      const sizes = [...box.querySelectorAll(".cm-mana > *")].map((el) => {const r = el.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`;});
      const one = box.querySelector(".cm-mana > :first-child");
      const out = {sizes, one: one && one.tagName.toLowerCase(), circle: !!(one && one.querySelector("circle")), glyph: one && one.textContent.replace(/\{1\}/, "").trim(), label: one && one.getAttribute("aria-label")};
      box.remove();
      return out;
    });
    ok(drawn.sizes.length === 9 && drawn.sizes.every((x) => x === "19x19") && drawn.one === "svg" && drawn.circle && drawn.glyph === "1" && drawn.label === "{1}", `a generic {1} is drawn as the same circle as the colored symbols, and so are {X}, {C}, a hybrid and {4} (${drawn.sizes.join(", ")})`);
    await page.locator("#cm-sec-commander").getByRole("button", {name: "Full card & rules"}).click();
    await page.locator("#cm-dialog[open] .cm-mana").first().waitFor();
    const inDialog = await boxes("#cm-dialog[open]");
    ok(inDialog.length >= 3 && inDialog.every(([w, h]) => w === inDialog[0][0] && h === inDialog[0][1] && w >= 15), `and in the card's dialog the symbols are all one size, none squeezed (${inDialog.map((x) => x.join("x")).join(", ")})`);
    await page.keyboard.press("Escape");
    await page.locator("#cm-dialog[open]").waitFor({state: "detached"}).catch(() => {});
  }

  /* 1. Guide & SWOT, in place. */
  await openDeck(page);
  await page.locator(".cm-plays-grid").waitFor({timeout: 30000});
  ok(!(await page.$("#cm-main #cm-sec-swot")) && !(await page.$("#cm-main #cm-sec-guide")), "the guide and the SWOT are no longer printed at the foot of the Overview");
  ok(await page.locator("#cm-sec-commander").isVisible(), "About the Commander stays on the page");
  const before = page.url();
  await page.getByRole("button", {name: "Full guide and SWOT", exact: true}).click();
  await page.locator("#cm-dialog.cm-guide-modal").waitFor();
  eq(await page.locator("#cm-dialog-title").textContent(), "Guide & SWOT · Krenko Goblins", "the dialog is titled for the deck, without its filing number");
  eq(page.url(), before, "and the address does not move: the link stays on the deck");
  const inside = await page.evaluate(() => ({
    strategy: Boolean(document.querySelector("#cm-dialog #cm-sec-guide")), notes: /Your notes/.test(document.querySelector("#cm-dialog").textContent),
    quarters: [...document.querySelectorAll("#cm-dialog .cm-swot > div h3")].map((h) => h.textContent),
    recommend: Boolean(document.querySelector('#cm-dialog [data-action="deck-suggestions"]'))}));
  ok(inside.strategy && inside.notes && inside.recommend, `the dialog holds the strategy, the notes and the recommendations: ${JSON.stringify(inside)}`);
  eq(inside.quarters.length, 4, `and the four SWOT quarters: ${inside.quarters.join(", ")}`);
  await page.locator("#cm-dialog").getByRole("button", {name: "Close", exact: true}).click();
  await page.locator("#cm-dialog").waitFor({state: "hidden"});

  /* 2. The More menu's order. */
  await page.locator(".cm-deck-hero").getByRole("button", {name: /^More/}).click();
  await page.locator(".cm-menu:popover-open").waitFor();
  const entries = await menuEntries(page);
  eq(entries.slice(0, 10), ["§This deck", "Measure", "Trace in Explore", "Guide & SWOT", "Export / print", "Compare with…", "Rename & edit definition", "Change commander", "Archive", "Delete deck…"],
    "the More menu leads with the design's order");
  ok(entries.includes("Change the collection group") || entries.includes("Attach a collection group"), "and still carries the collection group entry (Change or Attach, as the deck has one or not)");
  for (const kept of ["Reserve available copies", "Recommendations", "Reports & advice", "About this page"])
    ok(entries.some((x) => x === kept || x.startsWith(kept)), `and still carries ${kept}`);
  ok(entries.some((x) => /^Upgrades \(\d+\)$/.test(x)), "and Upgrades with its count");
  eq(entries.at(-1), "About this page", "About this page is last");
  await page.keyboard.press("Escape");

  /* Guide & SWOT from another tab: the Overview draws, then the dialog opens. */
  await openDeck(page, "hundred");
  await page.locator(".cm-deck-hero").getByRole("button", {name: /^More/}).click();
  await page.locator(".cm-menu:popover-open").getByRole("button", {name: "Guide & SWOT"}).click();
  await page.locator("#cm-dialog.cm-guide-modal #cm-sec-swot").waitFor({timeout: 30000});
  ok(!/tab=hundred/.test(page.url()), "from The hundred, Guide & SWOT goes to the Overview and opens the dialog");
  await page.keyboard.press("Escape");

  /* Compare with…: this deck is ticked on Decks. */
  await page.locator(".cm-deck-hero").getByRole("button", {name: /^More/}).click();
  await page.locator(".cm-menu:popover-open").getByRole("button", {name: "Compare with…"}).click();
  await page.locator(".cm-deck-grid").waitFor();
  ok(await page.$eval(`input[data-action=compare-pick][data-deck="${DECK}"]`, (i) => i.checked), "Compare with… lands on Decks with this deck ticked");
  ok(/Tick another deck to compare with Krenko Goblins/.test(await page.locator("#cm-notice").innerText()), "and says what to do next");

  /* 3. An archived deck: Restore, and a red Delete deck…. */
  await page.evaluate(async (id) => { const r = await CrankRepository.open(); try { const s = await r.getState(); await r.commit({id: crypto.randomUUID(), type: "archive", deckId: id, confirmed: true}, s.revision); } finally { r.close(); } }, DECK);
  await openDeck(page);
  await page.locator(".cm-deck-hero").getByRole("button", {name: /^More/}).click();
  await page.locator(".cm-menu:popover-open").waitFor();
  const archived = await menuEntries(page);
  ok(archived.includes("Restore as draft") && archived.includes("Delete deck…") && !archived.includes("Archive") && !archived.includes("Measure"), `an archived deck offers Restore and Delete, not Archive or Measure: ${archived.slice(0, 9).join(" | ")}`);
  ok(await page.$eval(".cm-menu:popover-open [data-action=delete-deck]", (b) => b.classList.contains("cm-danger")), "and Delete deck… is red");
  await page.keyboard.press("Escape");

  /* 5. The Measure report. Reports are built by the app's own CrankSim.packFor and filed through the
     repository, as Measure files them; a real Measure takes minutes, and what is under test is the view. */
  const OTHER = "deck:live:D5";
  const file = (fingerprintOf, read) => page.evaluate(async ([id, fingerprintOf, read]) => {
    const r = await CrankRepository.open();
    try {
      const s = await r.getState(), d = s.decks.find((x) => x.id === id);
      const list = d.slots.filter((x) => x.purpose === "main").map((x) => ({cardId: x.cardId, quantity: x.quantity}));
      const report = CrankSim.packFor({hash: fingerprintOf === "current" ? CrankCollection.fingerprint(d, s) : "a-list-this-deck-no-longer-holds",
        score: 78.4, se: 1.3, winRate: 0.31, games: 4000, elapsedMs: 9000, measuredAt: "2026-09-25T20:40:00Z",
        scoreParts: [{label: "Wins games", reads: "wins 31.0% of games against a 25% share of a four-player pod", points: 30.1, max: 35},
          {label: "Casts its spells", reads: "mana screwed in 7.0% of games, against a 10.0% target", points: 14.2, max: 20},
          {label: "Has answers when it needs them", reads: "an answer in hand on 38.0% of turns, against a 40.0% target", points: 14.3, max: 15}]},
        {protocol: "published", coverage: {known: read}});
      report.list = list; report.commanders = [...d.commanders];
      await r.commit({id: crypto.randomUUID(), type: "report", deckId: id, report}, s.revision);
      return (await r.getState()).reports.at(-1).id;
    } finally { r.close(); }
  }, [OTHER, fingerprintOf, read]);
  const current = await file("current", 98), stale = await file("stale", 100);
  await page.goto(`${base}/index.html#decks?deck=${encodeURIComponent(OTHER)}`);
  await page.locator("#cm-sec-reports").waitFor({timeout: 30000});
  await page.locator("#cm-sec-reports").getByRole("link", {name: "Open report"}).last().click();
  await page.locator(".cm-report-checks").waitFor();
  ok(page.url().includes(`report=${encodeURIComponent(current)}`) || page.url().includes(`report=${encodeURIComponent(stale)}`), "the deck's Reports list opens a report by its own address");
  await page.goto(`${base}/index.html#decks?deck=${encodeURIComponent(OTHER)}&report=${encodeURIComponent(current)}`);
  await page.locator(".cm-report-checks").waitFor();
  eq(await page.locator("#cm-main h1").textContent(), "Measure", "the report is titled Measure");
  const order = await page.evaluate(() => { const f = document.querySelector(".cm-fidelity"), sc = document.querySelector(".cm-report-score"); return {before: Boolean(f.compareDocumentPosition(sc) & Node.DOCUMENT_POSITION_FOLLOWING), above: f.getBoundingClientRect().bottom <= sc.getBoundingClientRect().top}; });
  ok(order.before && order.above, `the fidelity notice sits above the score: ${JSON.stringify(order)}`);
  const fidelity = await page.locator(".cm-fidelity").innerText();
  ok(/Fidelity: Medium/i.test(fidelity) && /2 cards the engine could not read/.test(fidelity), `two unread cards make it Medium, and it says so: ${fidelity.split("\n").slice(0, 2).join(" / ")}`);
  ok(/What any Measure is/.test(fidelity), "and the measurement's own limits sit under the notice");
  eq([await page.locator(".cm-report-number").textContent(), await page.locator(".cm-report-score").getByText("of 100").count()], ["78", 1], "the score reads 78 of 100");
  eq(await page.$$eval(".cm-report-checks tbody tr", (rows) => rows.map((r) => [r.querySelector("th").textContent, r.lastElementChild.textContent])),
    [["Wins games", "30.1 of 35"], ["Casts its spells", "14.2 of 20"], ["Has answers when it needs them", "14.3 of 15"]], "the checks are the score's own breakdown, points of the points possible");
  const download = page.waitForEvent("download");
  await page.getByRole("button", {name: "Export report"}).click();
  const saved = JSON.parse(readFileSync(await (await download).path(), "utf8"));
  eq([saved.id, saved.metrics.score.value, saved.kind], [current, 78.4, "report"], "Export report downloads the report itself");
  await page.goto(`${base}/index.html#decks?deck=${encodeURIComponent(OTHER)}&report=${encodeURIComponent(stale)}`);
  await page.locator(".cm-fidelity").waitFor();
  const low = await page.locator(".cm-fidelity").innerText();
  ok(/Fidelity: Low/i.test(low) && /list has changed/.test(low), `a report of a list the deck no longer holds is Low, and says why: ${low.split("\n").slice(0, 2).join(" / ")}`);
  await page.getByRole("link", {name: "Back to deck"}).click();
  await page.locator(".cm-deck-hero h1").waitFor();
  ok(!/report=/.test(page.url()), "Back to deck returns to the deck");
  await context.close();

  /* 4. A phone: one row, sideways, every label whole. */
  const phone = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, serviceWorkers: "block"});
  const small = await phone.newPage();
  if (stub) await stub(small);
  await loadLiveState(small, base);
  await openDeck(small);
  await small.locator(".cm-action-bar").waitFor();
  const bar = await small.$eval(".cm-action-bar", (nav) => {
    const bs = [...nav.querySelectorAll(".v-button")].map((b) => ({label: b.textContent.trim(), top: Math.round(b.getBoundingClientRect().top), whole: b.scrollWidth <= b.clientWidth + 1}));
    return {bs, scrolls: nav.scrollWidth > nav.clientWidth, overflowX: getComputedStyle(nav).overflowX};
  });
  ok(new Set(bar.bs.map((b) => b.top)).size === 1, `the bar is one row: ${bar.bs.map((b) => b.label).join(" · ")}`);
  ok(bar.bs.every((b) => b.whole), `every label is whole, none cut to an ellipsis: ${JSON.stringify(bar.bs.filter((b) => !b.whole))}`);
  ok(bar.bs.some((b) => /^Make the change/.test(b.label)), "Make the change rides in the bar");
  ok(bar.overflowX === "auto" && bar.scrolls, `and the row scrolls sideways when it is wider than the screen (overflow ${bar.overflowX})`);
  ok(!(await small.locator(".cm-deck-hero [data-action=deck-change]").isVisible()), "the hero no longer repeats Make the change on a phone");
  ok(await small.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "and the page itself does not scroll sideways");
  await phone.close();
} finally {
  await close();
}
console.log(`deck-page-r3: ${checks} checks passed — Guide & SWOT as a dialog in place, the More menu in the design's order with nothing lost, and a phone action bar of whole labels in one sideways row.`);
