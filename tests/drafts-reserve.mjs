/* EVERY DECK RESERVES, AND EVERY DECK HAS A BUY LIST (Rob, 2026-09-28, D4: "automatic reservations"; docs/plan-groups.md
 * G3d). A draft used to hold nothing until Finalize & reserve, and its missing cards were a Draft list of their own.
 * Now a card you own is reserved for the deck the moment the deck lists it, the rest are To buy, and Finalize is the
 * badge that says the list is settled.
 *
 *   Create     a new draft reserves the free copies you own for its seats
 *   To buy     its missing cards are To buy rows, as a final deck's are; a card you own is not on the list
 *   Add        a card added to a draft reserves a free copy on the way in
 *   Replace    a draft's list replaced lets go of copies for seats that are gone, and reserves for the new ones
 *   Acquire    copies recorded as owned for a draft are reserved to it
 *   Keep       a copy you took back to the Bench, and a copy offered for trade, are not taken
 *   Lobby      a lobby deck reserves nothing and asks for nothing
 *   Finalize   changes the badge only: the same reservations and the same buy list before and after
 *   Screens    the Deck page offers Finalize, not Finalize & reserve; the Library has no Draft list rows, and the
 *              To buy tab carries the draft's missing cards
 */
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {mkdirSync} from "node:fs";
import path from "node:path";
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";

const require = createRequire(import.meta.url);
const M = require("../collection-model.js");
let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

/* ---- the model ---- */
let s = M.empty(), serial = 0;
const run = (type, args = {}) => {s = M.apply(s, {type, id: "t" + ++serial, at: "2026-09-28T00:00:00Z", ...args}).state; return s;};
const card = (id, name, typeLine = "Artifact") => ({id, name, typeLine, verified: true, colorIdentity: [], legalities: {commander: "legal"}, ...(id === "leader" ? {commander: true, typeLine: "Legendary Creature — Wizard"} : {})});
run("cards", {cards: [card("leader", "Leader"), card("ring", "Sol Ring"), card("stone", "Mind Stone"), card("signet", "Arcane Signet"), card("land", "Wastes", "Basic Land")]});
run("acquire", {lot: {id: "ring1", cardId: "ring", quantity: 1}});
run("acquire", {lot: {id: "stone1", cardId: "stone", quantity: 1}});
const lot = (id) => s.lots.find((l) => l.id === id);
const needs = (deckId) => M.projection(s).filter((r) => r.kind === "need" && r.deckId === deckId).map((r) => [r.card.name, r.quantity]).sort();

/* CREATE */
run("createDeck", {deckId: "dr", name: "Draft", commanders: ["leader"], slots: [{id: "c", cardId: "leader", quantity: 1}, {id: "r", cardId: "ring", quantity: 1}, {id: "w", cardId: "land", quantity: 97}]});
eq(M.deck(s, "dr").status, "draft", "a new deck is a draft");
eq(lot("ring1").allocation, {deckId: "dr", slotId: "r"}, "the Sol Ring you own is reserved for the draft's seat as the deck is made");
/* TO BUY */
eq(needs("dr"), [["Leader", 1], ["Wastes", 97]], "the draft's missing cards are To buy rows, and the Sol Ring you own is not among them");
ok(!M.projection(s).some((r) => r.kind === "draft"), "and there is no Draft list row: the model has no such thing");
eq(M.readiness(s, M.deck(s, "dr")).costToFinish >= 0, true, "a draft has a cost to finish, as a final deck has");
/* ADD */
run("target", {deckId: "dr", cardId: "stone", quantity: 1, confirmed: true});
eq(lot("stone1").allocation && lot("stone1").allocation.deckId, "dr", "a card added to a draft reserves the free copy you own on the way in");
/* REPLACE */
run("editDeck", {deckId: "dr", slots: [{id: "c", cardId: "leader", quantity: 1}, {id: "r", cardId: "signet", quantity: 1}, {id: "w", cardId: "land", quantity: 97}, {id: "s2", cardId: "ring", quantity: 1}]});
eq(lot("stone1").allocation, null, "a list replaced lets go of the copy whose card left it");
eq(lot("ring1").allocation, {deckId: "dr", slotId: "s2"}, "and the Sol Ring moves to the seat that lists it now, not the seat that names another card");
M.validate(s); checks += 1;
/* ACQUIRE */
run("acquireSlots", {deckId: "dr", source: "owned", slotIds: ["r"]});
const signet = s.lots.find((l) => l.cardId === "signet");
eq([signet.source, signet.allocation && signet.allocation.slotId], ["owned", "r"], "a copy recorded as owned for a draft is reserved to its seat");
/* KEEP (each copy its own printing, so the library keeps them as separate records) */
run("acquire", {lot: {id: "ring2", cardId: "ring", quantity: 1, printing: {set: "c21"}}});
run("acquire", {lot: {id: "ring3", cardId: "ring", quantity: 1, printing: {set: "c20"}}});
run("offer", {lotId: "ring2", quantity: 1, offer: "available"});
run("createDeck", {deckId: "dr2", name: "Second", commanders: ["leader"], slots: [{id: "c2", cardId: "leader", quantity: 1}, {id: "r2", cardId: "ring", quantity: 1}, {id: "w2", cardId: "land", quantity: 98}]});
eq([lot("ring2").allocation, lot("ring3").allocation && lot("ring3").allocation.deckId], [null, "dr2"], "a free copy is taken; one offered for Sell / Trade, though it came first, is not");
eq(lot("ring1").allocation.deckId, "dr", "and a copy already reserved for another deck stays where it is");
eq(needs("dr2"), [["Leader", 1], ["Wastes", 98]], "what is left is To buy");
/* LOBBY */
run("acquire", {lot: {id: "stone2", cardId: "stone", quantity: 1, printing: {set: "c19"}}});
run("createDeck", {deckId: "lob", name: "Lobby", kind: "lobby", commanders: ["leader"], slots: [{id: "c3", cardId: "leader", quantity: 1}, {id: "m3", cardId: "stone", quantity: 1}]});
eq([s.lots.filter((l) => l.allocation && l.allocation.deckId === "lob").length, needs("lob")], [0, []], "a lobby deck reserves nothing, though a Mind Stone is free, and puts nothing on the buy list");
/* FINALIZE */
const before = {alloc: s.lots.map((l) => [l.id, l.allocation]), needs: needs("dr2")};
run("finalize", {deckId: "dr2", confirmed: true});
eq(M.deck(s, "dr2").status, "final", "Finalize makes the deck final");
eq({alloc: s.lots.map((l) => [l.id, l.allocation]), needs: needs("dr2")}, before, "and changes nothing else: the same reservations, the same buy list");

/* ---- the screens ---- */
const SHOTS = process.env.UAT_SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, {recursive: true});
const shot = async (page, name) => {if (SHOTS) await page.screenshot({path: path.join(SHOTS, `${name}.png`)});};
const {browser, base, stub, close} = await openBrowser({name: "drafts-reserve", flag: "GEOMETRY_REQUIRED"});
if (browser) try {
  const context = await browser.newContext({viewport: {width: 1280, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  await page.addInitScript(() => (globalThis.CrankFeatures ||= []).push((C) => {globalThis.__cm = C;}));
  await loadLiveState(page, base);
  /* A draft from a card Rob owns, free on the Bench, and a card he does not own at all. */
  const made = await page.evaluate(async () => {const C = globalThis.__cm, st = C.state;
    const free = st.lots.find((l) => l.source === "owned" && l.location?.kind === "bench" && !l.allocation && l.offer === "none" && !l.keepBench);
    const owned = new Set(st.lots.map((l) => l.cardId));
    const leader = st.decks[0].commanders[0], missing = Object.keys(st.cards).find((id) => !owned.has(id) && id !== leader && !st.decks.some((d) => d.slots.some((r) => r.cardId === id)));
    await C.commit({type: "createDeck", deckId: "deck:g3d", name: "G3d draft", commanders: [leader], slots: [{id: "s-free", cardId: free.cardId, quantity: 1}, {id: "s-miss", cardId: missing, quantity: 1}]}, {renderView: false});
    const l = C.state.lots.find((x) => x.id === free.id);
    return {lotId: free.id, reserved: l.allocation?.deckId || "", missing: C.card(missing).name, free: C.card(free.cardId).name};});
  eq(made.reserved, "deck:g3d", `the Bench copy of ${made.free} is reserved for the new draft as it is made`);
  await page.goto(`${base}/index.html#decks?deck=deck%3Ag3d`);
  await page.getByRole("tab", {name: /^Overview/}).waitFor({timeout: 30000});
  eq([await page.getByRole("button", {name: "Finalize", exact: true}).count() > 0, await page.getByRole("button", {name: "Finalize & reserve"}).count()], [true, 0], "the Deck page offers Finalize, and no Finalize & reserve");
  await shot(page, "draft-deck-page-1280");
  await page.goto(`${base}/index.html#cards?tab=buy`);
  await page.locator("#cm-roster-query").waitFor({timeout: 60000});
  await page.fill("#cm-roster-query", made.missing);
  await page.locator("#cm-roster-table tbody tr", {hasText: made.missing}).first().waitFor({timeout: 30000});
  ok(/To buy/.test(await page.locator("#cm-roster-table tbody tr", {hasText: made.missing}).first().innerText()), `the To buy tab carries the draft's missing card, ${made.missing}`);
  await shot(page, "draft-to-buy-1280");
  await page.goto(`${base}/index.html#cards`);
  await page.locator("#cm-roster-query").waitFor({timeout: 60000});
  await page.fill("#cm-roster-query", made.missing);
  await page.waitForTimeout(600);
  eq(await page.locator("#cm-roster-table tbody tr", {hasText: "G3d draft"}).count(), 1, "the Library has one row for it in the draft, its To buy row: no second Draft list row beside it");
  await context.close();
} finally {
  await close();
}
console.log(`drafts-reserve: ${checks} checks passed — a draft reserves what you own as the cards go in, its missing cards are To buy, and Finalize is the badge.`);
