/* THE CARD STATUS ON THE SCREENS (docs/card-states.md; Rob, 2026-10-18).
 *
 * In a real page with the committed library restored:
 *
 *   1. The deck page's hundred is the deck's view: In the deck (Final and Substitute), then Loading, Reserved and
 *      Upgrades, each line wearing the model's pill and note, every count the model's deckStatus.
 *   2. The Library scoped to the same deck counts the same: its tiles and caption are that deckStatus too, and it
 *      lists the deck's group -- no Bench copies unless asked.
 *   3. The card panel's Status chips count the card's records by their status, as labels, not links; Change status
 *      and Change assignment sit at the end of the lines.
 *   4. The Table view's piles are places, and Planned Changes (once Ready to add) names a waiting copy Owned - Final.
 *   5. About Deck Building climbs the ownership words, then the uses.
 *
 * Needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure.
 */
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";
const require = createRequire(import.meta.url), M = require("../collection-model.js");

let checks = 0;
const ok = (c, msg) => { checks++; assert.ok(c, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };
const D6 = "deck:live:D6";

const {browser, base, stub, close} = await openBrowser({name: "card-states-screens", flag: "GEOMETRY_REQUIRED"});
const stateOf = (page) => page.evaluate(async () => { const r = await CrankRepository.open(); try { return await r.getState(); } finally { r.close(); } });

try {
  const context = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  await loadLiveState(page, base);
  const st = await stateOf(page);
  /* The deck with the most copies loading or claimed from another box, so every part of the hundred has rows. */
  const waitingIn = (id) => st.lots.filter((l) => l.source === "owned" && l.allocation?.deckId === id && !(l.location?.kind === "deck" && l.location.deckId === id));
  const DECK = [...st.decks].filter((d) => !d.archived).sort((a, b) => waitingIn(b.id).length - waitingIn(a.id).length)[0]?.id || D6;
  const deck = st.decks.find((d) => d.id === DECK), ds = M.deckStatus(st, deck);
  ok(ds.loading + ds.reserved.total > 0, `${deck.name} has cards loading or reserved, so the checks below can fail`);
  await page.goto(`${base}/index.html#decks?deck=${encodeURIComponent(DECK)}&tab=hundred`);
  await page.locator(".cm-deck-cards li .cm-deck-flags .cm-pill").first().waitFor({timeout: 30000});

  /* 1. The hundred. */
  const lines = await page.$$eval(".cm-deck-cards li", (ls) => ls.map((li) => ({card: li.querySelector(".cm-card-name")?.dataset.card, pill: li.querySelector(".cm-deck-flags .cm-pill")?.textContent.trim(), note: li.querySelector(".cm-deck-flags .cm-badge")?.textContent.trim() || ""})).filter((x) => x.card));
  eq(lines.length, ds.rows.length, `the hundred lists every record of ${deck.name}'s view (${ds.rows.length})`);
  const bad = lines.filter((l) => !["Final", "Substitute", "Loading", "Reserved", "Upgrade"].includes(l.pill));
  eq(bad.slice(0, 3), [], "every line wears a deck use: Final, Substitute, Loading, Reserved or Upgrade");
  const tally = (list) => list.reduce((m, x) => ({...m, [x]: (m[x] || 0) + 1}), {});
  eq(tally(lines.map((l) => l.pill)), tally(ds.rows.map(({st: x}) => M.stateLabel(x))), "and each word as often as the model's deckStatus says");
  const parts = Object.fromEntries(await page.$$eval(".cm-deck-cards h3.cm-deck-part", (hs) => hs.map((h) => [h.childNodes[0].textContent.trim(), Number(h.querySelector("small").textContent.replace(/,/g, ""))])));
  eq(parts["In the deck"], ds.deckTotal, `In the deck is the Deck total, Final + Substitute (${ds.deckTotal})`);
  eq([parts.Loading || 0, parts.Reserved || 0, parts.Upgrades || 0], [ds.loading, ds.reserved.total, ds.upgrade], "Loading, Reserved and Upgrades count what the model counts");
  const readD = M.stateReader(st, DECK), name = (id) => st.cards[id]?.name || id, deckName = (id) => (st.decks.find((d) => d.id === id)?.name.match(/^(D\d+)\b/) || [])[1] || "";
  const notes = tally(ds.rows.map(({st: x}) => M.stateNote(x, name, deckName)).filter(Boolean));
  eq(tally(lines.map((l) => l.note).filter(Boolean)), notes, "and each line's note is the model's, word for word");
  ok(/^Boxed: the box holds 100: Final \d+ \+ Substitute \d+/.test(await page.locator(".cm-deck-playable").innerText()), `the hundred says why the deck plays: "${await page.locator(".cm-deck-playable").innerText()}"`);
  /* And a deck with Upgrades lists them in their own part, each naming what it would replace or asking. */
  {
    const UP = [...st.decks].filter((d) => !d.archived).sort((a, b) => M.deckStatus(st, b).upgrade - M.deckStatus(st, a).upgrade)[0], up = M.deckStatus(st, UP);
    ok(up.upgrade > 0, `${UP.name} has Upgrades (${up.upgrade}), so the check below can fail`);
    await page.goto(`${base}/index.html#decks?deck=${encodeURIComponent(UP.id)}&tab=hundred`);
    await page.locator(".cm-deck-cards h3.cm-deck-part").first().waitFor({timeout: 30000});
    const upParts = Object.fromEntries(await page.$$eval(".cm-deck-cards h3.cm-deck-part", (hs) => hs.map((h) => [h.childNodes[0].textContent.trim(), Number(h.querySelector("small").textContent.replace(/,/g, ""))])));
    eq(upParts.Upgrades, up.upgrade, `${UP.name}'s Upgrades part lists its ${up.upgrade} Upgrades`);
    const upPills = await page.$$eval(".cm-deck-cards li .cm-deck-flags", (fs) => fs.map((f) => [f.querySelector(".cm-pill")?.textContent.trim(), f.querySelector(".cm-badge")?.textContent.trim() || ""]).filter(([p]) => p === "Upgrade"));
    ok(upPills.length === up.upgrade && upPills.every(([, n]) => /would replace|choose what it replaces/.test(n)), "each wearing Upgrade and saying what it would replace, or asking");
  }

  /* 2. The Library scoped to the same deck: the same deckStatus on its tiles, and no Bench copy unless asked. */
  await page.goto(`${base}/index.html#cards?deck=${encodeURIComponent(DECK)}`);
  await page.locator(".cm-kpi").first().waitFor({timeout: 30000});
  const tiles = Object.fromEntries(await page.$$eval(".cm-kpi", (ks) => ks.map((k) => [k.querySelector("span").textContent.trim(), Number(k.querySelector("strong").textContent.replace(/,/g, ""))])));
  eq([tiles.Final, tiles.Substitute, tiles.Reserved, tiles.Upgrade, tiles.Loading, tiles.Bench], [ds.final, ds.substitute, ds.reserved.total, ds.upgrade, ds.loading, 0], "the Library scoped to the deck counts what the hundred counts, and no Bench");
  ok((await page.locator(".cm-kpi-caption").innerText()).startsWith(`Deck total ${ds.deckTotal} = Final ${ds.final} + Substitute ${ds.substitute} · Group total ${ds.groupTotal}`), "its caption states the Deck total and the Group total");
  await page.locator("#cm-bench-too").check();
  await page.waitForFunction(() => Number(document.querySelectorAll(".cm-kpi")[5]?.querySelector("strong")?.textContent.replace(/,/g, "")) > 0);
  ok(true, "ticking Show Bench cards that could go in brings the Bench back beside the deck's cards");

  /* 3. The card panel, for the card on this deck's list whose records fall in the most different states. */
  const recsOf = (id) => M.records(st).filter((r) => r.cardId === id).map((r) => ({r, s: M.stateReader(st)(r)}));
  const variety = (id) => new Set(recsOf(id).map(({s}) => M.stateLabel(s))).size;
  const pickCard = [...new Set(lines.map((l) => l.card))].sort((a, b) => variety(b) - variety(a))[0];
  ok(variety(pickCard) >= 2, `the card panel is read for a card in ${variety(pickCard)} different states`);
  await page.goto(`${base}/index.html#decks?deck=${encodeURIComponent(DECK)}&tab=hundred`);
  await page.locator(`.cm-deck-cards li .cm-card-name[data-card="${pickCard}"]`).first().click();
  await page.locator("#cm-dialog[open] .cm-standing").waitFor({timeout: 30000});
  const chips = await page.$$eval("#cm-dialog .cm-standing p:first-child .cm-pill", (ps) => ps.map((p) => { const n = p.querySelector("strong"); return [p.textContent.replace(n ? n.textContent : "", "").trim(), Number(n ? n.textContent : 0)]; }));
  const recs = recsOf(pickCard), count = (f) => recs.filter(({s}) => f(s)).reduce((n, {r}) => n + (r.quantity || 1), 0);
  const want = [["Own", count((s) => s.ownership === "own")], ...M.STATE_LABELS.map((l) => [l, count((s) => M.stateLabel(s) === l)])].filter(([, n]) => n > 0);
  eq(chips.filter(([l]) => l !== "Option" && l !== "Pinned"), want, `the card panel's Status chips for ${name(pickCard)} are the model's, counted: ${JSON.stringify(want)}`);
  eq(await page.$$eval("#cm-dialog .cm-standing .cm-pill", (ps) => ps.filter((p) => p.closest("[data-action]")).length), 0, "and they are labels: none opens the Library");
  eq(await page.$$eval("#cm-dialog .cm-standing .cm-standing-act", (bs) => bs.map((b) => b.textContent)), ["Change status", "Change assignment"], "Change status and Change assignment end the two lines");
  await page.keyboard.press("Escape");

  /* 4. The Table view: Group piles by Status breaks the table into places (the model's placeLabel), and its Status
     dropdown offers the same words. */
  await page.goto(`${base}/index.html#cards?view=tabletop`);
  await page.locator("select[name=tabletopGroupBy]").waitFor({timeout: 30000});
  await page.selectOption("select[name=tabletopGroupBy]", "status");
  await page.locator(".cm-tt-mat [data-pile^='group:status:']").first().waitFor({timeout: 30000});
  const piles = Object.fromEntries(await page.$$eval(".cm-tt-mat [data-pile^='group:status:']", (ps) => ps.map((x) => { const m = x.getAttribute("aria-label").match(/^(.*), ([\d,]+) cards?$/); return m ? [m[1], Number(m[2].replace(/,/g, ""))] : [x.getAttribute("aria-label"), -1]; })));
  const read = M.stateReader(st), all = M.records(st).map((r) => ({r, s: read(r)}));
  const pileWant = {};
  for (const {r, s} of all) { const k = M.placeLabel(s); if (k !== "Bench") pileWant[k] = (pileWant[k] || 0) + (r.quantity || 1); }
  ok(Object.keys(piles).every((k) => k === "Bench" || k in pileWant), `the breakout's piles are places (${Object.keys(piles).join(", ")})`);
  eq(Object.fromEntries(Object.keys(pileWant).map((k) => [k, piles[k]])), pileWant, "each counting what the model puts there");
  eq(await page.$$eval("[name=ttStatus] option", (os) => os.map((o) => o.textContent)), ["Any status", "Own (any)", "Final", "Loading", "Substitute", "Bench", "To Buy · Ordered", "To buy", "Watch"], "and its Status dropdown offers the same words");

  /* 5. Planned Changes (once Ready to add; Rob, C5): a copy waiting on the Bench is an add, "Owned - Final", with where
     it is when that is another deck -- not the old pills. */
  const PULL = st.decks.find((d) => !d.archived && waitingIn(d.id).some((l) => l.location?.kind !== "deck"))?.id;
  ok(PULL, "some deck has a copy waiting on the Bench, so the check below can fail");
  await page.goto(`${base}/index.html#pull?deck=${encodeURIComponent(PULL)}`);
  await page.locator(".cm-plan-side.is-in .cm-plan-role").first().waitFor({timeout: 30000});
  const pullRoles = await page.$$eval(".cm-plan-side.is-in .cm-plan-role", (ps) => ps.map((p) => p.textContent.trim()));
  ok(pullRoles.includes("Owned - Final") && !(await page.$$eval(".cm-plan .cm-pill", (ps) => ps.length)), `Planned Changes names each waiting copy "Owned - Final": ${[...new Set(pullRoles)].join(" | ")}`);

  /* 6. The ladder. */
  await page.goto(`${base}/index.html#how`);
  await page.locator("#cm-how-ladder li").first().waitFor({timeout: 30000});
  eq(await page.$$eval("#cm-how-ladder li strong", (s) => s.map((x) => x.textContent)), ["Watch", "To buy", "To Buy · Ordered", "Own", "Upgrade", "Reserved", "Loading", "Substitute", "Final"], "About Deck Building (still at #how) climbs the ownership words, then the uses that bring a card into a deck, Loading among them (ABT-3)");
  await context.close();
} finally {
  await close();
}
console.log(`card-states-screens: ${checks} checks passed — the hundred, the Library scoped to a deck, the card panel, the Table and the ladder speak the card status.`);
