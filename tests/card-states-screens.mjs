/* THE CARD STATES ON THE SCREENS BEYOND THE LIBRARY (docs/card-states.md, step 2b).
 *
 * In a real page with the committed library restored:
 *
 *   1. The deck page's hundred: each slot's pill is a card-state word (Watching, To buy, Ordered, Target), and
 *      "To add" sits beside exactly the slots with an owned copy reserved for them and not yet in the box,
 *      judged from the stored copies.
 *   2. The card inspector's Status chips count the card's records by their state, and every figure agrees
 *      with the model's cardState run here, in Node, on the same stored library.
 *   3. How a deck comes together: the ladder is the four stages and the box.
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
  /* The deck with the most copies waiting outside its box, so "To add" has something to find. */
  const waitingIn = (id) => st.lots.filter((l) => l.source === "owned" && l.allocation?.deckId === id && !(l.location?.kind === "deck" && l.location.deckId === id));
  const DECK = [...st.decks].filter((d) => !d.archived).sort((a, b) => waitingIn(b.id).length - waitingIn(a.id).length)[0]?.id || D6;
  ok(waitingIn(DECK).length > 0, `${DECK} has copies waiting outside its box, so the check below can fail`);
  await page.goto(`${base}/index.html#decks?deck=${encodeURIComponent(DECK)}&tab=hundred`);
  await page.locator(".cm-deck-cards li .cm-deck-flags .cm-pill").first().waitFor({timeout: 30000});

  /* 1. The hundred. */
  const lines = await page.$$eval(".cm-deck-cards li", (ls) => ls.map((li) => ({card: li.querySelector(".cm-card-name")?.dataset.card, pill: li.querySelector(".cm-deck-flags .cm-pill")?.textContent.trim(), toAdd: !!li.querySelector(".cm-deck-flags .cm-badge-toadd")})).filter((x) => x.card));
  ok(lines.length > 50, `the hundred is drawn (${lines.length} lines)`);
  const bad = lines.filter((l) => !/^(Watching|To buy( \d+)?|Ordered|Target)$/.test(l.pill));
  eq(bad.slice(0, 3), [], "every slot's pill is a card-state word: Watching, To buy, Ordered or Target");
  const deck = st.decks.find((d) => d.id === DECK);
  const waiting = new Set(waitingIn(DECK).map((l) => l.allocation.slotId));
  const waitingCards = new Set(deck.slots.filter((r) => waiting.has(r.id)).map((r) => r.cardId));
  eq(new Set(lines.filter((l) => l.toAdd).map((l) => l.card)), waitingCards, `"To add" sits beside exactly the ${waitingCards.size} slots with an owned copy reserved for them and not in the box`);
  ok(lines.filter((l) => l.toAdd).every((l) => l.pill === "Target"), "and each of them is a Target");

  /* 2. The inspector, for the card on this deck's list whose records fall in the most different states, so a
     count put under the wrong word has somewhere to show. */
  const recsOf = (id) => [...M.projection(st).filter((r) => r.cardId === id), ...st.groups.flatMap((g) => g.entries.filter((r) => r.cardId === id).map((r) => ({...r, kind: "entry", groupId: g.id})))].map((r) => ({r, s: M.cardState(r)}));
  const variety = (id) => new Set(recsOf(id).map(({s}) => M.stateLabel(s))).size;
  const owned = [...lines].sort((a, b) => variety(b.card) - variety(a.card))[0];
  ok(variety(owned.card) >= 3, `the inspector is read for a card in ${variety(owned.card)} different states`);
  await page.locator(`.cm-deck-cards li .cm-card-name[data-card="${owned.card}"]`).first().click();
  await page.locator("#cm-dialog[open] .cm-standing").waitFor({timeout: 30000});
  const chips = await page.$$eval("#cm-dialog .cm-standing p:first-child .cm-pill", (ps) => ps.map((p) => { const n = p.querySelector("strong"); return [p.textContent.replace(n ? n.textContent : "", "").trim(), Number(n ? n.textContent : 0)]; }));
  /* The same count, in Node: the card's copies and needs from the projection, and its group entries. */
  const recs = recsOf(owned.card);
  const count = (f) => recs.filter(({s}) => f(s)).reduce((n, {r}) => n + r.quantity, 0);
  const want = [["Owned", count((s) => s.stage === "owned")], ...M.STATE_LABELS.map((l) => [l, count((s) => M.stateLabel(s) === l)]), ["To add", count((s) => s.stage === "owned" && s.role === "target" && !s.inBox)]].filter(([, n]) => n > 0);
  eq(chips.filter(([l]) => l !== "Option" && l !== "Pinned"), want, `the inspector's Status chips for ${st.cards[owned.card]?.name || owned.card} are the model's card states, counted: ${JSON.stringify(want)}`);
  ok(chips.every(([l]) => ["Owned", "To add", "Option", "Pinned", ...M.STATE_LABELS].includes(l)), "and every chip is a card-state word");
  await page.keyboard.press("Escape");

  /* 3. The ladder. */
  await page.goto(`${base}/index.html#how`);
  await page.locator(".cm-how-ladder li").first().waitFor({timeout: 30000});
  eq(await page.$$eval(".cm-how-ladder li strong", (s) => s.map((x) => x.textContent)), ["Watching", "To buy", "Ordered", "Owned", "In the box"], "How a deck comes together climbs the four stages, then the box");
  await context.close();
} finally {
  await close();
}
console.log(`card-states-screens: ${checks} checks passed — the deck page, the card inspector and the ladder speak the card states.`);
