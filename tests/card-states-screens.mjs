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
  const lines = await page.$$eval(".cm-deck-cards li", (ls) => ls.map((li) => ({card: li.querySelector(".cm-card-name")?.dataset.card, pill: li.querySelector(".cm-deck-flags .cm-pill")?.textContent.trim(), role: li.querySelector(".cm-deck-flags .cm-badge-upgrade, .cm-deck-flags .cm-badge-reserved")?.textContent.trim() || ""})).filter((x) => x.card));
  ok(lines.length > 50, `the hundred is drawn (${lines.length} lines)`);
  const bad = lines.filter((l) => !/^(Watching|To buy( \d+)?|Ordered|To add|Target)$/.test(l.pill));
  eq(bad.slice(0, 3), [], "every slot's pill is a card-state word: Watching, To buy, Ordered, To add or Target");
  const deck = st.decks.find((d) => d.id === DECK);
  const waiting = new Set(waitingIn(DECK).map((l) => l.allocation.slotId));
  const waitingCards = new Set(deck.slots.filter((r) => waiting.has(r.id)).map((r) => r.cardId));
  eq(new Set(lines.filter((l) => l.pill === "To add").map((l) => l.card)), waitingCards, `"To add" is the pill on exactly the ${waitingCards.size} slots with an owned copy reserved for them and not in the box`);
  /* Outside the box a slot wears its role. Every box here is full, so each is an upgrade and the deck plays. */
  const readS = M.stateReader(st), full = M.readiness(st, deck).playable;
  ok(full, `${deck.name}'s box is full`);
  const outside = lines.filter((l) => l.pill !== "Target" && l.pill !== "Watching");
  ok(outside.length > 0 && outside.every((l) => l.role === "Upgrade"), `every slot outside the box wears "Upgrade" (${outside.length}), because the full box holds its seat`);
  ok(lines.filter((l) => l.pill === "Target").every((l) => !l.role), "and no Target in the box wears a role badge");
  ok(/^Playable: every seat holds a card · \d+ upgrades? to make$/.test(await page.locator(".cm-deck-playable").innerText()), `the hundred says the deck plays, and how many upgrades are left: "${await page.locator(".cm-deck-playable").innerText()}"`);

  /* 2. The inspector, for the card on this deck's list whose records fall in the most different states, so a
     count put under the wrong word has somewhere to show. */
  const recsOf = (id) => [...M.projection(st).filter((r) => r.cardId === id), ...st.groups.flatMap((g) => g.entries.filter((r) => r.cardId === id).map((r) => ({...r, kind: "entry", groupId: g.id})))].map((r) => ({r, s: readS(r)}));
  const variety = (id) => new Set(recsOf(id).map(({s}) => M.stateLabel(s))).size;
  const owned = [...lines].sort((a, b) => variety(b.card) - variety(a.card))[0];
  ok(variety(owned.card) >= 3, `the inspector is read for a card in ${variety(owned.card)} different states`);
  await page.locator(`.cm-deck-cards li .cm-card-name[data-card="${owned.card}"]`).first().click();
  await page.locator("#cm-dialog[open] .cm-standing").waitFor({timeout: 30000});
  const chips = await page.$$eval("#cm-dialog .cm-standing p:first-child .cm-pill", (ps) => ps.map((p) => { const n = p.querySelector("strong"); return [p.textContent.replace(n ? n.textContent : "", "").trim(), Number(n ? n.textContent : 0)]; }));
  /* The same count, in Node: the card's copies and needs from the projection, and its group entries. */
  const recs = recsOf(owned.card);
  const count = (f) => recs.filter(({s}) => f(s)).reduce((n, {r}) => n + r.quantity, 0);
  const want = [["Owned", count((s) => s.stage === "owned")], ...M.STATE_LABELS.map((l) => [l, count((s) => M.stateLabel(s) === l)]), ["Upgrade", count((s) => !!s.deckId && !s.inBox && s.role === "upgrade")], ["Reserved", count((s) => !!s.deckId && !s.inBox && s.role === "reserved")]].filter(([, n]) => n > 0);
  eq(chips.filter(([l]) => l !== "Option" && l !== "Pinned"), want, `the inspector's Status chips for ${st.cards[owned.card]?.name || owned.card} are the model's card states, counted: ${JSON.stringify(want)}`);
  ok(chips.every(([l]) => ["Owned", "Upgrade", "Reserved", "Option", "Pinned", ...M.STATE_LABELS].includes(l)), "and every chip is a card-state word");
  await page.keyboard.press("Escape");

  /* 4. The Table view (step 2c): its status piles are the card states, each counting the copies the model puts in it,
     and "To add" is the pile Ready to add empties. Its own Status dropdown offers the same words. */
  await page.goto(`${base}/index.html#cards?view=tabletop`);
  await page.locator("[data-pile^='status:']").first().waitFor({timeout: 30000});
  const piles = Object.fromEntries(await page.$$eval("[data-pile^='status:']", (ps) => ps.map((x) => { const m = x.getAttribute("aria-label").match(/^(.*), ([\d,]+) cards?$/); return m ? [m[1], Number(m[2].replace(/,/g, ""))] : [x.getAttribute("aria-label"), -1]; })));
  const all = [...M.projection(st), ...st.groups.flatMap((g) => g.entries.map((r) => ({...r, kind: "entry", groupId: g.id})))].map((r) => ({r, s: readS(r)}));
  const n = (f) => all.filter(({s}) => f(s)).reduce((k, {r}) => k + r.quantity, 0);
  const own = (f) => n((s) => s.stage === "owned" && f(s));
  const pileWant = {"Target": own((s) => s.role === "target" && s.inBox), "To add": own((s) => !!s.deckId && !s.inBox), "Substitute": own((s) => s.role === "substitute"), "Ordered": n((s) => s.stage === "ordered"), "To buy": n((s) => s.stage === "buy"), "Watching": n((s) => s.stage === "watching")};
  for (const k of Object.keys(pileWant)) if (!pileWant[k]) delete pileWant[k];
  eq(piles, pileWant, "the Table view's status piles are the card states, each counting what the model puts in it");
  eq(await page.$$eval("[name=ttStatus] option", (os) => os.map((o) => o.textContent)), ["Any status", "Owned (any)", "Target", "To add", "Substitute", "Bench", "Ordered", "To buy", "Watching"], "and its Status dropdown offers the same words");

  /* 5. Ready to add: a copy waiting outside its box wears "To add", with where to find it. */
  /* A deck whose waiting copy sits on the Bench, which is the group that wears this pill. */
  const PULL = st.decks.find((d) => !d.archived && waitingIn(d.id).some((l) => l.location?.kind !== "deck"))?.id;
  ok(PULL, "some deck has a copy waiting on the Bench, so the check below can fail");
  await page.goto(`${base}/index.html#pull?deck=${encodeURIComponent(PULL)}`);
  await page.waitForTimeout(1500);
  /* The waiting copies' pills: the Bench group's, which used to read "Bench · <box>". */
  const pullPills = await page.$$eval(".cm-pill", (ps) => ps.map((p) => p.textContent.trim()).filter((t) => /^(Bench|To add)\b/.test(t)));
  ok(pullPills.some((t) => /^To add · /.test(t)) && !pullPills.some((t) => /^Bench · /.test(t)), `Ready to add names each waiting copy "To add", then where it is, where it said "Bench": ${pullPills.slice(0, 3).join(" | ")}`);

  /* 3. The ladder. */
  await page.goto(`${base}/index.html#how`);
  await page.locator(".cm-how-ladder li").first().waitFor({timeout: 30000});
  eq(await page.$$eval(".cm-how-ladder li strong", (s) => s.map((x) => x.textContent)), ["Watching", "To buy", "Ordered", "Owned", "In the box"], "How a deck comes together climbs the four stages, then the box");
  await context.close();
} finally {
  await close();
}
console.log(`card-states-screens: ${checks} checks passed — the deck page, the card inspector and the ladder speak the card states.`);
