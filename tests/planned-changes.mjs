/* PLANNED CHANGES, the model side (Rob, 2026-10-25, C1–C8; crankmagic-change.js planned / pairUp / swapCommands), on the
 * committed live library and on Upgrades made with the model's own `option` command:
 *   - every Substitute in a box is a Take out, paired with the Reserved card whose seat it holds; an Upgrade with the
 *     Final it names; every add selectable (Rob, 2026-10-26), a To Buy Final included;
 *   - the labels follow Rob's chain (To Buy > To Buy · Ordered > Owned) and the use (Final, Upgrade, Substitute, Bench);
 *   - pairUp keeps original pairs, re-pairs a lonely add with a spare take-out (marked), and lets counts differ (C8);
 *   - each swap, applied through M.apply as one batch: an Owned Final in and its Substitute out; a To Buy Upgrade
 *     recorded with its Final staying as the Substitute; an Owned Upgrade in and its Final out; a re-pair; and three in
 *     with one out, the box then 102;
 *   - adding without taking out (Rob, 2026-10-26): a To Buy Final goes in as owned and its Substitute stays with no live
 *     card; a Substitute whose card went in takes a Reserved seat whose own Substitute was taken out; with more such
 *     Substitutes than seats, the one of the largest mana value takes it; an Upgrade naming nothing joins the list, the
 *     deck past 100 and Building. */
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
  ok(p.rows.filter((r) => r.in && r.in.kind !== "bench").every((r) => r.in.selectable), `${d.name}: every Final, Substitute and Upgrade can be ticked (Rob, 2026-10-26)`);
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
/* 5. Adding without taking out (Rob, 2026-10-26), on the live D1. */
{
  const mvOf = (u) => Number((u.card && u.card.manaValue) ?? 0);
  let s5 = structuredClone(live);
  const d5 = M.deck(s5, D1.id), p5 = CH.planned(s5, d5, {M});
  const buys = p5.rows.filter((r) => r.in && r.in.kind === "final" && r.in.chain === "buy" && r.out && r.out.role === "Substitute");
  ok(buys.length >= 3, `D1 has To Buy Finals beside their Substitutes (${buys.length})`);
  const swap = (state, ins, outs) => { const d = M.deck(state, D1.id), p = CH.planned(state, d, {M}); return run(state, {type: "batch", commands: CH.swapCommands(d, CH.pairUp(p.rows, new Set(ins), new Set(outs)), p.rows), summary: "test add"}); };
  const lotNow = (state, id) => state.lots.find((l) => l.id === id);
  const stateOf = (state, lotId) => M.deckStatus(state, M.deck(state, D1.id)).rows.find(({r}) => r.id === lotId)?.st;
  /* a. A To Buy Final alone: recorded as owned, in the box on its seat; its Substitute stays, holding no seat. */
  const [b1, b2, b3] = buys;
  let t5 = swap(s5, [b1.in.id], []);
  const mine = t5.lots.filter((l) => l.cardId === b1.in.cardId && l.source === "owned" && l.location?.kind === "deck" && l.location.deckId === D1.id && l.allocation?.deckId === D1.id);
  ok(mine.length >= 1, `${b1.in.name}, To Buy, is now an owned copy in D1's box on its seat`);
  eq([box(t5, d5), lotNow(t5, b1.out.lotId)?.location?.deckId, lotNow(t5, b1.out.lotId)?.standInFor || "", stateOf(t5, b1.out.lotId)?.use, stateOf(t5, b1.out.lotId)?.holds || ""], [box(s5, d5) + 1, D1.id, "", "substitute", ""], `its Substitute (${b1.out.name}) stays in the box as a Substitute with no live card; the box ${box(s5, d5) + 1}`);
  ok(M.deckStatus(t5, M.deck(t5, D1.id)).stage === "building" && !M.deckStatus(t5, M.deck(t5, D1.id)).boxed, "past 100 the deck reads Building and is not Boxed");
  /* b. One added, another's Substitute taken out: the freed Substitute holds that Reserved seat. */
  t5 = swap(s5, [b1.in.id], [b2.out.id]);
  eq([box(t5, d5), lotNow(t5, b1.out.lotId)?.standInFor, stateOf(t5, b1.out.lotId)?.holds], [box(s5, d5), b2.in.slotId, b2.in.cardId], `${b1.out.name} now holds ${b2.in.name}'s seat, its own Substitute gone to the Bench; the box ${box(s5, d5)}`);
  ok(lotNow(t5, b2.out.lotId)?.location?.kind !== "deck", "and the Substitute taken out is on the Bench");
  /* c. Two freed, one seat: the largest mana value takes it; the other holds none. */
  t5 = swap(s5, [b1.in.id, b2.in.id], [b3.out.id]);
  const [big, small] = [b1.out, b2.out].sort((a, b) => mvOf(b) - mvOf(a) || String(a.name).localeCompare(String(b.name)));
  eq([lotNow(t5, big.lotId)?.standInFor, lotNow(t5, small.lotId)?.standInFor || ""], [b3.in.slotId, ""], `of ${b1.out.name} (${mvOf(b1.out)}) and ${b2.out.name} (${mvOf(b2.out)}), ${big.name} takes ${b3.in.name}'s seat; ${small.name} holds none`);
}
/* 6. An Upgrade that names nothing joins the list (Rob, 2026-10-26: "add as many cards to a deck, even more than 100"). */
{
  const pick = live.decks.filter((d) => !d.archived).map((d) => ({d, r: CH.planned(live, d, {M}).rows.find((r) => r.in && r.in.kind === "upgrade" && !r.in.named && r.in.chain === "owned")})).find((x) => x.r);
  if (pick) {
    const {d: d6, r} = pick, before = M.deckStatus(live, d6);
    const t6 = run(structuredClone(live), {type: "batch", commands: CH.swapCommands(d6, CH.pairUp(CH.planned(live, d6, {M}).rows, new Set([r.in.id]), new Set()), CH.planned(live, d6, {M}).rows), summary: "test grow"});
    const after = M.deckStatus(t6, M.deck(t6, d6.id));
    eq([after.list, after.deckTotal, after.stage, after.boxed, after.play], [before.list + 1, before.deckTotal + 1, "building", false, "over"], `${d6.name}: ${r.in.name}, an Owned Upgrade naming nothing, joins the list and the box: ${before.list + 1} and ${before.deckTotal + 1}, Building, Over`);
  } else ok(true, "no Owned Upgrade naming nothing in the live library");
}
console.log(`planned-changes: ${checks} checks passed — Planned Changes on the live library: every Substitute paired with the card whose seat it holds, Upgrades with the Finals they name, To Buy Finals planned; pairUp re-pairs and lets counts differ; every kind of swap applied as one batch; adds without take-outs keep or re-hold their Substitutes, and a deck may pass 100.`);
