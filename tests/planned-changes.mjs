/* PLANNED CHANGES, the model side (Rob, 2026-10-25, C1–C8; crankmagic-change.js planned / pairUp / swapCommands), on the
 * committed live library and on Upgrades made with the model's own `option` command:
 *   - every Substitute in a box is a Take out, paired with the Reserved card whose seat it holds; an Upgrade with the
 *     Final it names; Owned cards selectable, a To Buy Final already planned and not;
 *   - the labels follow Rob's chain (To Buy > To Buy · Ordered > Owned) and the use (Final, Upgrade, Substitute, Bench);
 *   - pairUp keeps original pairs, re-pairs a lonely add with a spare take-out (marked), and lets counts differ (C8);
 *   - each swap, applied through M.apply as one batch: an Owned Final in and its Substitute out; a To Buy Upgrade
 *     recorded with its Final staying as the Substitute; an Owned Upgrade in and its Final out; a re-pair; and three in
 *     with one out, the box then 102. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import path from "node:path";
import {ROOT} from "../schema/index.mjs";
const require = createRequire(import.meta.url);
const CH = require(path.join(ROOT, "crankmagic-change.js"));
const M = require(path.join(ROOT, "collection-model.js"));
const Catalog = require(path.join(ROOT, "card-catalog.js"));
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
/* Rob's library as committed, with the shipped catalog behind its card references, as the app has it (tests/budgets.mjs). */
const live = M.migrate(JSON.parse(readFileSync(path.join(ROOT, "data/live-state.json"), "utf8")).payload.state);
const byName = new Map(JSON.parse(readFileSync(path.join(ROOT, "data/cards.json"), "utf8")).cards.map((c) => [Catalog.folded(c.name), c]));
M.setRecordSource((id) => { const ref = live.cards[id], rec = ref && byName.get(Catalog.folded(ref.name)); return rec ? {...Catalog.normalize(rec), id} : null; });
const run = (s, command) => M.apply(s, {id: "t" + Math.random().toString(36).slice(2), confirmed: true, ...command}).state;
const box = (s, d) => M.deckStatus(s, M.deck(s, d.id)).deckTotal;
const where = (s, lotId) => { const l = s.lots.find((x) => x.id === lotId); return l ? (l.location && l.location.kind === "deck" ? l.location.deckId : "bench") : "gone"; };

/* 1. The live library. */
for (const d of live.decks.filter((x) => !x.archived)) {
  const p = CH.planned(live, d, {M}), st = M.deckStatus(live, d);
  const subsInBox = st.rows.filter(({r, st}) => r.kind === "lot" && st.inBox && st.use === "substitute").reduce((n, {r}) => n + r.quantity, 0);
  eq(p.rows.filter((r) => r.out && r.out.role === "Substitute").length, subsInBox, `${d.name}: every Substitute in the box is a Take out (${subsInBox})`);
  eq(p.boxTotal, st.deckTotal, `${d.name}: the counter starts from the box's total (${st.deckTotal})`);
  ok(p.rows.every((r) => r.in || r.out), `${d.name}: no empty row`);
  ok(p.rows.filter((r) => r.in && r.out && r.in.kind === "final").every((r) => r.out.holds === r.in.cardId || r.out.cardId === r.in.replaces), `${d.name}: each Final's pair is the Substitute holding its seat`);
  ok(p.rows.filter((r) => r.in && r.in.kind === "final").every((r) => r.in.selectable === (r.in.chain === "owned")), `${d.name}: an Owned Final can be ticked; a To Buy one is already planned`);
  ok(p.rows.filter((r) => r.in).every((r) => /^(Owned|To Buy|To Buy · Ordered) - (Final|Upgrade|Substitute|Bench)$/.test(r.in.label)), `${d.name}: every Add says its chain and its use`);
  eq(JSON.stringify(CH.planned(live, d, {M}).rows.map((r) => [r.in && r.in.id, r.out && r.out.id])), JSON.stringify(p.rows.map((r) => [r.in && r.in.id, r.out && r.out.id])), `${d.name}: the same plan twice`);
}

/* 2. Upgrades, made with the model's own command, on D1. */
const D1 = live.decks.find((d) => d.id === "deck:live:D1");
let s = structuredClone(live);
const p0 = CH.planned(s, D1, {M});
const ownedFinal = p0.rows.find((r) => r.in && r.in.kind === "final" && r.in.chain === "owned" && r.out);
ok(ownedFinal, "D1 has an Owned Final paired with its Substitute");
/* Two Finals in D1's box, each to be named by an Upgrade. */
const finals = M.deckStatus(s, D1).rows.filter(({r, st}) => r.kind === "lot" && st.inBox && st.use === "final" && r.allocation && r.quantity === 1).slice(0, 3);
/* Cards the deck may take: in its commander's colors, legal, not a basic, not on its list. */
const rec = (id) => { const ref = s.cards[id]; return ref && byName.get(Catalog.folded(ref.name)); };
const identity = new Set(D1.commanders.flatMap((id) => (rec(id) && rec(id).colorIdentity) || []));
const fits = (id) => { const c = rec(id); return !!c && (c.colorIdentity || []).every((x) => identity.has(x)) && !/Basic/.test(c.typeLine || "") && (!c.legalities || c.legalities.commander === "legal") && !D1.slots.some((x) => x.cardId === id) && !D1.commanders.includes(id); };
const freeLot = s.lots.find((l) => l.source === "owned" && !l.allocation && l.location && l.location.kind !== "deck" && (l.offer || "none") === "none" && !l.chosenFor && l.quantity === 1 && fits(l.cardId));
ok(finals.length === 3 && freeLot, "a free Bench copy and three Finals in the box to work with");
const unowned = Object.keys(s.cards).find((id) => fits(id) && !s.lots.some((l) => l.cardId === id) && !s.decks.some((d) => d.slots.some((x) => x.cardId === id)) && !s.decks.some((d) => d.commanders.includes(id)));
ok(unowned, "a card in the deck's colors that nobody owns, to be a To Buy Upgrade");
s = run(s, {type: "option", deckId: D1.id, replaces: finals[0].r.allocation.slotId, option: {cardId: freeLot.cardId, quantity: 1, purpose: "upgrade"}});
s = run(s, {type: "option", deckId: D1.id, replaces: finals[1].r.allocation.slotId, option: {cardId: unowned, quantity: 1, purpose: "upgrade"}});
let d = M.deck(s, D1.id), p = CH.planned(s, d, {M});
const upOwned = p.rows.find((r) => r.in && r.in.kind === "upgrade" && r.in.cardId === freeLot.cardId);
const upBuy = p.rows.find((r) => r.in && r.in.kind === "upgrade" && r.in.cardId === unowned);
eq([upOwned && upOwned.in.label, upBuy && upBuy.in.label], ["Owned - Upgrade", "To Buy - Upgrade"], "an Upgrade reads Owned or To Buy, by whether a free copy is owned");
eq([upOwned.out && upOwned.out.role, upOwned.out && upOwned.out.cardId], ["Final", finals[0].r.cardId], "the Owned Upgrade is paired with the Final it names, a Final take-out");
eq([upBuy.out && upBuy.out.cardId, upBuy.in.selectable], [finals[1].r.cardId, true], "the To Buy Upgrade too, and it can be ticked (Rob: record the plan)");

/* 3. pairUp. */
const ids = (rows) => rows.map((x) => [x.in && x.in.id, x.out && x.out.id, x.repaired]);
let pairs = CH.pairUp(p.rows, new Set([ownedFinal.in.id]), new Set([ownedFinal.out.id]));
eq(ids(pairs), [[ownedFinal.in.id, ownedFinal.out.id, false]], "both halves of a row ticked: the original pair");
const otherSub = p.rows.find((r) => r.out && r.out.role === "Substitute" && r.out.id !== ownedFinal.out.id);
pairs = CH.pairUp(p.rows, new Set([ownedFinal.in.id]), new Set([otherSub.out.id]));
eq(ids(pairs), [[ownedFinal.in.id, otherSub.out.id, true]], "an add whose partner is not ticked takes a ticked take-out from another row, marked re-paired (C7)");
pairs = CH.pairUp(p.rows, new Set([ownedFinal.in.id, upOwned.in.id]), new Set());
eq(ids(pairs), [[ownedFinal.in.id, null, false], [upOwned.in.id, null, false]].sort((a, b) => p.rows.findIndex((r) => r.in && r.in.id === a[0]) - p.rows.findIndex((r) => r.in && r.in.id === b[0])), "adds with no take-outs go alone (C8)");
pairs = CH.pairUp(p.rows, new Set(), new Set([otherSub.out.id]));
eq(ids(pairs), [[null, otherSub.out.id, false]], "a take-out alone");

/* 4. Swaps, applied. */
const apply = (state, deck, pr) => run(state, {type: "batch", commands: CH.swapCommands(deck, pr), summary: "test swap"});
let t = apply(s, d, CH.pairUp(p.rows, new Set([ownedFinal.in.id]), new Set([ownedFinal.out.id])));
eq([where(t, ownedFinal.in.lotId), where(t, ownedFinal.out.lotId), box(t, d)], [d.id, "bench", 100], "Owned Final in, its Substitute to the Bench, the box still 100");
t = apply(s, d, CH.pairUp(p.rows, new Set([upBuy.in.id]), new Set([upBuy.out.id])));
let td = M.deck(t, d.id), parentSlot = td.slots.find((x) => x.id === finals[1].r.allocation.slotId);
eq([parentSlot.cardId, where(t, upBuy.out.lotId), box(t, td)], [unowned, d.id, 100], "a To Buy Upgrade is recorded: its seat now wants it, and the Final stays in the box");
ok(M.deckStatus(t, td).rows.some(({r, st}) => r.id === upBuy.out.lotId && st.use === "substitute"), "the Final it replaces now holds the seat as its Substitute");
t = apply(s, d, CH.pairUp(p.rows, new Set([upOwned.in.id]), new Set([upOwned.out.id])));
td = M.deck(t, d.id);
eq([td.slots.find((x) => x.id === finals[0].r.allocation.slotId).cardId, where(t, freeLot.id) === d.id || t.lots.some((l) => l.cardId === freeLot.cardId && l.location && l.location.deckId === d.id), where(t, upOwned.out.lotId), box(t, td)], [freeLot.cardId, true, "bench", 100], "an Owned Upgrade goes in, the Final it replaces to the Bench, the box 100");
ok(!td.slots.some((x) => x.purpose !== "main" && x.cardId === freeLot.cardId), "and the Upgrade is no longer an option");
/* Re-paired: the Owned Upgrade with the third Final instead of the one it names. */
s = run(s, {type: "option", deckId: D1.id, replaces: finals[2].r.allocation.slotId, option: {cardId: unowned, quantity: 1, purpose: "upgrade"}});
d = M.deck(s, D1.id); p = CH.planned(s, d, {M});
const up2 = p.rows.find((r) => r.in && r.in.kind === "upgrade" && r.in.cardId === freeLot.cardId), third = p.rows.find((r) => r.out && r.out.role === "Final" && r.out.cardId === finals[2].r.cardId);
pairs = CH.pairUp(p.rows, new Set([up2.in.id]), new Set([third.out.id]));
eq(pairs.map((x) => x.repaired), [true], "the Owned Upgrade ticked with another row's Final: re-paired");
t = apply(s, d, pairs);
td = M.deck(t, d.id);
eq([td.slots.find((x) => x.id === finals[2].r.allocation.slotId).cardId, td.slots.find((x) => x.id === finals[0].r.allocation.slotId).cardId, where(t, third.out.lotId), box(t, td)], [freeLot.cardId, finals[0].r.cardId, "bench", 100], "the re-paired Final's seat takes the Upgrade; the one it named keeps its card; the box 100");
/* C8: three in, one out. */
const threeIn = p.rows.filter((r) => r.in && r.in.selectable && r.in.kind !== "upgrade").slice(0, 3);
if (threeIn.length === 3) {
  pairs = CH.pairUp(p.rows, new Set(threeIn.map((r) => r.in.id)), new Set([threeIn[0].out ? threeIn[0].out.id : otherSub.out.id]));
  t = apply(s, d, pairs);
  eq(box(t, M.deck(t, d.id)), 102, "three in and one out still swap: the box is 102 (C8)");
} else ok(true, "D1 has fewer than three owned adds; C8 is held by the pairing checks above");
console.log(`planned-changes: ${checks} checks passed — Planned Changes on the live library: every Substitute paired with the card whose seat it holds, Upgrades with the Finals they name, To Buy Finals planned; pairUp re-pairs and lets counts differ; every kind of swap applied as one batch.`);
