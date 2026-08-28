/**
 * Active and Assigned: the two things a slot holds.
 *
 * Active is the card the deck is counted, shopped and rules-checked as. Assigned is the
 * reviewed recommendation behind it -- what a reset returns to. They start identical and
 * only ever diverge because someone chose a different rung, which must change Active and
 * nothing else. These tests are the contract from the handoff workbook, checked against
 * the shipped state and the code that reads it.
 */
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";

const require = createRequire(import.meta.url);
const Lineup = require("../lineup-model.js");
const Slot = require("../slot-model.js");
const buyPlans = JSON.parse(await readFile(new URL("../data/buy-plans.json", import.meta.url), "utf8"));
const cardsDoc = JSON.parse(await readFile(new URL("../data/cards.json", import.meta.url), "utf8"));
const activeState = JSON.parse(await readFile(new URL("../data/active-state.json", import.meta.url), "utf8"));
const appSource = await readFile(new URL("../app.js", import.meta.url), "utf8");
const deckPageSource = await readFile(new URL("../deck-page.js", import.meta.url), "utf8");

const state = activeState.state;
const plans = buyPlans.plans;
const byKey = new Map();
const byName = {};
for (const card of cardsDoc.cards) {
  byKey.set(Slot.ownedKey(card.name), card);
  byName[Lineup.normalizeName(card.name)] = card;
  for (const face of card.name.split(" // ")) {
    const k = Slot.ownedKey(face);
    if (!byKey.has(k)) byKey.set(k, card);
  }
}
const graft = (id) => ({...plans[id], manual: (state.manualCards[id] || []).map((c) => ({...c}))});
const live = Object.keys(state.buySelections).filter((id) => plans[id]);

let checks = 0;
const ok = (label, fn) => { fn(); checks += 1; process.stdout.write(`  ok  ${label}\n`); };

/* ---------- the six imported decks ---------- */
ok("every live deck accounts for exactly a hundred cards", () => {
  for (const id of live) {
    const slots = Slot.deckSlots(graft(id), state.buySelections[id], {});
    const cards = slots.filter((s) => s.pick).reduce((n, s) => n + s.pick.quantity, 0);
    const holes = slots.filter((s) => !s.pick).length;
    assert.equal(cards + holes, 100, `${id}: ${cards} cards + ${holes} empty`);
    assert.equal(holes, 0, `${id} has ${holes} empty slots`);
  }
});

ok("every live deck has exactly one commander", () => {
  for (const id of live) {
    const seats = Slot.deckSlots(graft(id), state.buySelections[id], {})
      .filter((s) => s.type === "Commander" && s.pick);
    assert.equal(seats.length, 1, `${id} has ${seats.length} commanders`);
  }
});

ok("Active equals Assigned on the shipped state, as an import leaves it", () => {
  for (const id of live) {
    assert.ok(state.assignedSelections && state.assignedSelections[id],
      `${id} has no reviewed recommendation`);
    const a = Slot.deckSlots(graft(id), state.buySelections[id], {})
      .filter((s) => s.pick).map((s) => `${s.slotId}=${s.pick.name}`).sort();
    const b = Slot.deckSlots(graft(id), state.assignedSelections[id], {})
      .filter((s) => s.pick).map((s) => `${s.slotId}=${s.pick.name}`).sort();
    assert.deepEqual(a, b, `${id}: Active and Assigned compose differently`);
  }
});

ok("every active card is Commander legal and inside its commander's colours", () => {
  for (const id of live) {
    const slots = Slot.deckSlots(graft(id), state.buySelections[id], {});
    const seat = slots.find((s) => s.type === "Commander" && s.pick);
    const identity = new Set((byKey.get(Slot.ownedKey(seat.pick.name)) || {}).colorIdentity || []);
    assert.ok(identity.size, `${id}: no colours for ${seat.pick.name}`);
    for (const slot of slots) {
      if (!slot.pick) continue;
      const fact = byKey.get(Slot.ownedKey(slot.pick.name));
      assert.ok(fact, `${id}: ${slot.pick.name} is in no catalog`);
      const outside = (fact.colorIdentity || []).filter((c) => !identity.has(c));
      assert.equal(outside.length, 0,
        `${id}: ${slot.pick.name} is ${outside.join("")} outside ${seat.pick.name}'s ${[...identity].sort().join("")}`);
      const legal = (fact.legalities || {}).commander;
      assert.notEqual(legal, "not_legal", `${id}: ${slot.pick.name} is not Commander legal`);
    }
  }
});

ok("no active nonbasic card appears twice in a deck", () => {
  for (const id of live) {
    const seen = new Map();
    Slot.deckSlots(graft(id), state.buySelections[id], {}).forEach((slot) => {
      if (!slot.pick || Slot.isBasicLand({name: slot.pick.name})) return;
      const k = Slot.ownedKey(slot.pick.name);
      seen.set(k, (seen.get(k) || 0) + slot.pick.quantity);
    });
    const dupes = [...seen].filter(([, n]) => n > 1).map(([k, n]) => `${k} x${n}`);
    assert.deepEqual(dupes, [], `${id} runs a nonbasic more than once: ${dupes.join(", ")}`);
  }
});

/* Grouped basics survive as one row of many copies, not many rows of one. */
ok("basic-land quantities stay grouped", () => {
  for (const id of live) {
    const basics = Slot.deckSlots(graft(id), state.buySelections[id], {})
      .filter((s) => s.pick && s.isBasic);
    const names = basics.map((s) => Slot.ownedKey(s.pick.name));
    assert.equal(new Set(names).size, names.length, `${id} splits a basic across slots`);
  }
});

/* The one card the workbook rejected: outside Atraxa's colours, so it cannot be a
   candidate anywhere in that deck, not merely unselected. */
ok("Rugged Highlands is not offered in Atraxa", () => {
  const offered = [];
  Slot.deckSlots(graft("2c"), state.buySelections["2c"], {})
    .forEach((s) => (s.rungs || []).forEach((r) => {
      if (Slot.ownedKey(r.name) === "rugged-highlands") offered.push(s.slotId);
    }));
  assert.deepEqual(offered, [], `Rugged Highlands is a candidate on ${offered.join(", ")}`);
});

/* ---------- what the code promises ---------- */
ok("choosing a rung writes Active only", () => {
  const handler = appSource.slice(appSource.indexOf('closest("[data-dp-pick]")'),
                                 appSource.indexOf('closest("[data-dp-pick]")') + 1400);
  assert.ok(handler.indexOf("assignedSelections") < 0,
    "picking a rung must not touch the reviewed recommendation");
});

ok("reset returns Active to Assigned and nothing else", () => {
  const handler = appSource.slice(appSource.indexOf('closest("[data-dp-reset]")'),
                                  appSource.indexOf('closest("[data-dp-reset]")') + 1200);
  assert.match(handler, /assignSelection\(current, assigned\);/, "a deck reset copies Assigned onto Active");
  assert.match(handler, /Lineup\.applyChoice\(plan, current, seat\.pick\.entryId\)/,
    "a slot reset applies that slot's recommendation alone");
  assert.ok(handler.indexOf("state.manualCards") < 0, "a reset must not touch hand-added candidates");
  assert.ok(handler.indexOf("delete ") < 0, "a reset must not delete anything");
});

ok("Make Assigned is a separate, deliberate action", () => {
  assert.match(appSource, /data-dp-makeassigned/, "there must be a control for it");
  const handler = appSource.slice(appSource.indexOf('closest("[data-dp-makeassigned]")'),
                                  appSource.indexOf('closest("[data-dp-makeassigned]")') + 900);
  assert.match(handler, /state\.assignedSelections\[ctx\.deckId\] = next;/,
    "it writes the recommendation");
  assert.ok(handler.indexOf("ensureBuyState(ctx.deckId), Lineup") < 0,
    "and does not also move Active");
});

ok("a bulk stage falls back to Assigned wherever the rung is blank", () => {
  assert.match(appSource, /function withAssignedFallback\(variantId, plan, selection\)/,
    "the fallback must exist");
  assert.match(appSource, /withAssignedFallback\(ctx\.deckId, plan, Slot\.selectionForRung\(plan, el\.dataset\.dpRung\)\)/,
    "and the rung buttons must go through it");
});

ok("a bulk stage keeps every deck at a hundred", () => {
  for (const id of live) {
    const plan = graft(id);
    const assigned = state.assignedSelections[id];
    for (const rung of Slot.BUILD_RUNGS) {
      const raw = Slot.selectionForRung(plan, rung);
      // Mirror withAssignedFallback: the rung wins, Assigned fills the slots it leaves.
      const spokenFor = new Set();
      Slot.deckSlots(plan, raw, {}).forEach((s) => { if (s.pick) spokenFor.add(s.slotId); });
      const merged = {};
      Lineup.ARRAY_KEYS.forEach((k) => { merged[k] = (raw[k] || []).slice(); });
      Slot.deckSlots(plan, assigned, {}).forEach((slot) => {
        if (!slot.pick || spokenFor.has(slot.slotId)) return;
        const hit = (slot.rungs || []).find((r) => r.entryId === slot.pick.entryId);
        if (hit && merged[hit.kind]) merged[hit.kind].push(hit.entryId);
      });
      const slots = Slot.deckSlots(plan, merged, {});
      const cards = slots.filter((s) => s.pick).reduce((n, s) => n + s.pick.quantity, 0);
      const holes = slots.filter((s) => !s.pick).length;
      assert.equal(cards + holes, 100, `${id} ${rung}: ${cards} cards + ${holes} empty`);
      assert.equal(holes, 0, `${id} ${rung} leaves ${holes} slots empty even with the fallback`);
    }
  }
});

ok("the two states are told apart on screen", () => {
  assert.match(deckPageSource, /class="dp-badge is-active"/, "Active needs a badge");
  assert.match(deckPageSource, /class="dp-badge is-assigned"/, "Assigned needs a badge");
  /* One card, two badges. Rendering the same card twice -- once as Active, once as
     Assigned -- would put two buttons on screen that do the same thing. */
  assert.match(deckPageSource, /const both = isActive && isAssigned;/,
    "a card that is both must be drawn once with both labels");
});

/* ---------- older saved states ---------- */
ok("a legacy export migrates without losing anything", () => {
  assert.match(appSource, /const STATE_VERSION = 4;/, "the saved shape must carry a version");
  assert.match(appSource, /stateVersion: Number\(saved\.stateVersion\) \|\| 1,/,
    "an unversioned file must read as version 1, not as the current one");
  assert.match(appSource, /function ensureAssignedSeeded\(\)/, "migration seeds the recommendation");
  assert.match(appSource, /state\.assignedSelections\[variantId\] = cloneSelection\(state\.buySelections\[variantId\]\);/,
    "whatever an older file was selecting IS its recommendation");
  assert.match(appSource, /const already = state\.assignedSelections\[variantId\];\s*\n\s*if \(already && Object\.keys\(already\)\.length\) return;/,
    "a state that already carries recommendations must keep them");
  // Everything the reader owns comes through the load untouched.
  for (const key of ["found", "boughtQuantities", "purchasePrices", "liveSalvage",
                     "deckHolds", "comments", "liveTransfers", "manualCards", "deckActive"]) {
    assert.ok(appSource.indexOf(`${key}: saved.${key}`) >= 0, `${key} must survive a load`);
  }
  // Game logs are a list rather than a map, so they are restored with a shape check.
  assert.match(appSource, /gameLog: Array\.isArray\(saved\.gameLog\) \? saved\.gameLog : \[\]/,
    "game logs must survive a load");
  // Upgrade is Enhance's old name and is still read.
  assert.ok(Lineup.ARRAY_KEYS.includes("upgrade"), "the legacy Upgrade array must still be read");
  assert.ok(Lineup.ARRAY_KEYS.includes("enhance"), "alongside Enhance");
});

ok("the shipped state carries the user's own record intact", () => {
  assert.ok(Object.keys(state.owned || {}).length > 250, "ownership survives the import");
  assert.ok(Object.keys(state.purchasePrices || {}).length > 250, "paid prices survive the import");
  assert.ok(Object.keys(state.liveSalvage || {}).length > 40, "the bench survives the import");
  assert.ok(Object.keys(state.deckHolds || {}).length >= 6, "which box holds which copy survives");
  assert.equal(state.stateVersion, 4, "and the file says which shape it is");
});

console.log(`\n${checks} checks passed across ${live.length} live decks.`);
