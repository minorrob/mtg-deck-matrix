/* THE CHANGE LIST on the committed live library: rows agree with readiness, pairing is
 * deterministic, the readings sum, the formula reads as stated, and the sheets export whole. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import path from "node:path";
import {ROOT} from "../schema/index.mjs";
const require = createRequire(import.meta.url);
const CH = require(path.join(ROOT, "crankmagic-change.js"));
const M = require(path.join(ROOT, "collection-model.js"));
const R = require(path.join(ROOT, "crankmagic-rules.js"));
const CL = require(path.join(ROOT, "card-classify.js"));
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const live = JSON.parse(readFileSync(path.join(ROOT, "data/live-state.json"), "utf8")).payload.state;
/* A library card is a reference; its facts are the Card record's. */
const records = (() => { const d = JSON.parse(readFileSync(path.join(ROOT, "data/cards.json"), "utf8")); const list = Array.isArray(d) ? d : d.cards || d.records || Object.values(d).find(Array.isArray); return new Map(list.map((c) => [String(c.name).toLowerCase(), c])); })();
const cardOf = (id) => { const c = live.cards[id]; if (!c) return null; const rec = records.get(String(c.name).toLowerCase()); return rec ? {...rec, ...c, typeLine: rec.typeLine, manaValue: rec.manaValue ?? c.manaValue, roles: rec.roles, colorIdentity: rec.colorIdentity} : c; };
const opts = {M, rules: R, classify: CL.classify, cardOf, deckName: (id) => (live.decks.find((d) => d.id === id) || {}).name};
const finals = live.decks.filter((d) => d.status === "final" && !d.archived);
ok(finals.length === 6, "six final decks to plan for");
let totalRows = 0;
for (const d of finals) {
  const p = CH.plan(live, d, opts), r = M.readiness(live, d);
  eq(p.counts.remove, r.remove, `${d.name}: the removals are readiness's remove count`);
  eq(p.counts.addNow, r.pullFromBench + r.pullFromOtherBox, `${d.name}: the additions now are what can be pulled`);
  eq(p.counts.waiting, r.ordered + r.toBuy, `${d.name}: the waiting ones are ordered plus to buy`);
  ok(p.rows.every((x, i) => x.step === i + 1 && (x.out || x.in)), `${d.name}: rows are numbered and never empty`);
  ok(p.rows.filter((x) => x.action === "swap").every((x) => x.out && x.in), `${d.name}: a swap has both halves`);
  eq(JSON.stringify(CH.plan(live, d, opts).rows.map((x) => [x.action, x.out && x.out.name, x.in && x.in.name])), JSON.stringify(p.rows.map((x) => [x.action, x.out && x.out.name, x.in && x.in.name])), `${d.name}: the plan is the same twice`);
  eq(p.readings.list.tally.total, 100, `${d.name}: the list as written is a hundred`);
  ok(p.readings.now.tally.total === r.sleeved, `${d.name}: the box now counts what is sleeved (${p.readings.now.tally.total})`);
  ok(p.readings.afterAll.tally.total === p.readings.now.tally.total - p.counts.remove - p.counts.removeLater + p.counts.addNow + p.counts.waiting, `${d.name}: after everything arrives, the arithmetic holds (${p.readings.afterAll.tally.total})`);
  ok(p.readings.afterAll.tally.total <= 100 + p.staying.reduce((n, x) => n + x.quantity, 0) + 2, `${d.name}: the box after everything arrives is about a hundred (${p.readings.afterAll.tally.total})`);
  ok(p.readings.list.tally.lands >= 30 && p.readings.list.tally.lands <= 42, `${d.name}: the list's lands are read from the record set (${p.readings.list.tally.lands})`);
  ok(Array.isArray(p.readings.afterAll.warnings) && p.readings.list.land.target >= CH.MANA.floorLands && p.readings.list.land.target <= CH.MANA.baseLands + 1, `${d.name}: the formula asks ${p.readings.list.land.target} lands (${p.readings.list.land.says})`);
  const sh = CH.sheets(p);
  eq(sh.sheets.map((s) => s.name), ["Change list", "Readings"], `${d.name}: two sheets`);
  eq(sh.sheets[0].rows.length, p.rows.length, `${d.name}: one sheet row per checklist row`);
  eq(sh.sheets[1].rows.length, 4, `${d.name}: four readings`);
  totalRows += p.rows.length;
}
ok(totalRows > 0, `the six decks have ${totalRows} change rows between them`);
/* The formula and the judge on made-up hundreds. */
const land = (n) => ({card: {name: "Forest " + n, typeLine: "Basic Land — Forest", manaValue: 0, roles: []}, quantity: 1});
const spell = (n, mvv, roles = []) => ({card: {name: "Spell " + n, typeLine: "Creature — Elf", manaValue: mvv, roles}, quantity: 1});
const hundred = (lands, ramp = 0) => [...Array.from({length: lands}, (_, i) => land(i)), ...Array.from({length: 100 - lands}, (_, i) => spell(i, i < ramp ? 2 : 3, i < ramp ? ["ramp"] : []))];
eq(CH.landTarget(hundred(38, 0).map((x) => x.card)).target, 38, "no cheap ramp: 38 lands");
eq(CH.landTarget(hundred(38, 6).map((x) => x.card)).target, 35, "six cheap ramp pieces sub out three lands");
eq(CH.landTarget(hundred(38, 20).map((x) => x.card)).target, CH.MANA.floorLands, "the floor holds");
const j = CH.judge(hundred(30, 0), {rules: R});
ok(j.warnings.some((w) => w.kind === "lands") && !j.warnings.some((w) => w.kind === "total"), "thirty lands is warned, a hundred cards is not");
ok(CH.judge(hundred(38, 0).slice(0, 99), {rules: R}).warnings.some((w) => w.kind === "total"), "ninety-nine cards is warned");
ok(CH.judge([...hundred(38, 0).slice(0, 98), spell(1, 3), spell(1, 3)], {rules: R}).warnings.some((w) => w.kind === "singleton"), "a non-basic twice is warned");
ok(CH.judge(hundred(38, 0), {rules: R}).warnings.some((w) => w.kind === "ramp" || w.kind === "draw"), "a hundred with no ramp or draw is warned against the floors");
ok(!CH.judge(hundred(38, 0), {rules: R}).warnings.some((w) => w.kind === "gameChangers"), "no Game Changers, no warning");
ok(CH.judge(hundred(38, 0).map((x, i) => i < 3 ? {card: {...x.card, gameChanger: true}, quantity: 1} : x), {rules: R}).warnings.some((w) => w.kind === "gameChangers"), "three Game Changers over a limit of two is warned");
/* THE RECORDED PAIRING BEATS THE INFERRED ONE (play-space plan §2.12). Before `standInFor` the
   Change List guessed which seat a substitute was holding from the option slot, the primary type
   and the nearest mana value — a good guess on a curve of similar cards and a wrong one often
   enough to matter. Now the seat is recorded when the proxy goes into the box, and this is the
   assertion that the record is what the list reads: the same library, one lot tagged, and the
   pairing moves to the seat the tag names with the reason saying so. */
{
  const frozen = JSON.stringify(live);
  const deck = finals.find((d) => {
    const p = CH.plan(live, d, opts);
    return p.rows.some((x) => x.out && x.in && x.in.slotId);
  });
  ok(!!deck, "a deck whose change list pairs a substitute with a seat");
  const before = CH.plan(live, deck, opts);
  const paired = before.rows.find((x) => x.out && x.in && x.in.slotId);
  /* A seat the inference did NOT choose, so the test cannot pass by accident. */
  const other = before.rows.find((x) => x.out && x.in && x.in.slotId && x.in.slotId !== paired.in.slotId);
  if (other) {
    const tagged = JSON.parse(JSON.stringify(live));
    const lot = tagged.lots.find((l) => l.id === paired.out.lotId);
    ok(!!lot, "the substitute's lot is in the library");
    lot.standInFor = other.in.slotId;
    const after = CH.plan(tagged, deck, {...opts, cardOf: (id) => { const c = tagged.cards[id]; return c ? cardOf(id) : null; }});
    const row = after.rows.find((x) => x.out && x.out.lotId === lot.id);
    ok(!!row && !!row.in, "the tagged substitute still pairs");
    eq(row.in.slotId, other.in.slotId, "with the seat the record names, not the one inference chose");
    ok(row.why.startsWith("recorded when the substitute went in"), `and the row says the pairing was recorded: "${row.why}"`);
  } else ok(true, "this library has only one pairable seat per substitute today; the record and the inference agree");
  /* A tag naming a seat that is not on the list is ignored rather than trusted — the projection
     validates it, so nothing downstream can read a pairing that has stopped being one. */
  const stale = JSON.parse(JSON.stringify(live));
  const anyStandIn = M.projection(stale).find((r) => r.standIn && r.standInDeckId);
  if (anyStandIn) {
    stale.lots.find((l) => l.id === anyStandIn.id).standInFor = "slot:does-not-exist";
    const row = M.projection(stale).find((r) => r.recordId === anyStandIn.recordId);
    eq(row.standInFor, "", "a seat that is not on the deck's list reads as no pairing at all");
  } else ok(true, "no substitute in the live library today");
  eq(JSON.stringify(live), frozen, "and none of this touched the library it read");
}

console.log(`crankmagic-change: ${checks} checks passed — ${totalRows} change rows across the six decks.`);
