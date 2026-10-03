/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 60 (THE CATALOG'S ORDER): SAGAS (CR 714) -- Forge's Chapter -- AND KEYWORD COUNTERS (CR 122.1b).
 *
 * A Saga enters with a lore counter (714.3a) and its controller adds one as their precombat main phase begins (714.3b).
 * Chapter N triggers when lore counters go from below N to N or more (714.2c) -- "I" as it enters -- and a Saga at its
 * final chapter, the source of no chapter ability still waiting or on the stack, is sacrificed (714.4). A keyword
 * counter gives its keyword.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {keywordsOf} from "../game/engine/rules/layers.mjs";
import {collectTriggers} from "../game/engine/rules/trigger.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
function table() {
  const s = createState({matchId: "m", seed: "saga", players: [{name: "Rob"}, {name: "Maya"}]});
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
const put = (s, o, seat = 0) => addObject(s, {...o, owner: seat, controller: seat}, "battlefield", null);
const lore = (s, id, n) => runEffects(s, [{effect: "putCounter", targets: [id], counter: "lore", count: n}], {controller: s.objects[id].controller, source: id});
const chapters = (s, events) => { s.pendingTriggers = []; collectTriggers(s, events); return s.pendingTriggers.map((p) => p.text.split(" — ")[0]); };

{
  /* It enters with a lore counter, and chapter I triggers on its arrival. */
  const s = table();
  const binding = addObject(s, {...card("Binding the Old Gods"), owner: 0, controller: 0}, "hand", 0);
  const events = runEffects(s, [{effect: "moveZone", targets: [binding], to: "battlefield"}], {controller: 0, source: null});
  const saga = s.zones.battlefield.find((id) => s.objects[id].card === "Binding the Old Gods");
  eq([s.objects[saga].counters.lore, chapters(s, events)], [1, ["I"]], "one lore counter; chapter I triggers");
  /* Chapter N as lore counters cross N: one to two triggers II; two at once from one triggers II and III (714.2c). */
  eq(chapters(s, lore(s, saga, 1)), ["II"], "one more: II");
  const t = table();
  const other = put(t, card("Binding the Old Gods"));
  t.objects[other].counters = {lore: 1};
  eq(chapters(t, lore(t, other, 2)), ["II", "III"], "two at once: II and III");
}
{
  /* As his precombat main phase begins, a lore counter on each Saga he controls -- not on Maya's. */
  const s = table();
  const his = put(s, card("Binding the Old Gods"), 0), hers = put(s, card("The Eldest Reborn"), 1);
  s.objects[his].counters = {lore: 1}; s.objects[hers].counters = {lore: 1};
  beginGame(s);
  for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s);
  eq([s.objects[his].counters.lore, s.objects[hers].counters.lore], [2, 1], "his first main phase: his Saga 2, hers still 1");
}
{
  /* 714.4: at its final chapter it is sacrificed -- but not while its chapter ability waits or is on the stack. */
  const s = table();
  const saga = put(s, card("Summon: Titan"));
  s.objects[saga].counters = {lore: 2};
  s.pendingTriggers = [];
  collectTriggers(s, lore(s, saga, 1));
  eq([s.pendingTriggers.length, checkStateBasedActions(s).length, s.objects[saga]?.zone], [1, 0, "battlefield"], "III waiting: still there");
  s.pendingTriggers = [];
  checkStateBasedActions(s);
  eq(s.zones.graveyard[0].some((id) => s.objects[id].card === "Summon: Titan"), true, "nothing waiting: sacrificed");
  const t = table();
  const early = put(t, card("Summon: Titan"));
  t.objects[early].counters = {lore: 2};
  checkStateBasedActions(t);
  eq(t.objects[early].zone, "battlefield", "two of three: it stays");
}
{
  /* Urza's Saga has what its chapters gave from that many lore counters: its {C} from one, the Construct from two. */
  const s = table();
  const urza = put(s, card("Urza's Saga"));
  put(s, WASTES); put(s, WASTES);
  beginGame(s);
  for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s);
  for (let a; (a = legalActions(s, 0).find((x) => x.kind === "activate-mana" && x.label === "Wastes"));) applyAction(s, 0, a);
  s.objects[urza].counters = {lore: 1};
  const offers = () => [legalActions(s, 0).filter((a) => a.kind === "activate-mana" && a.objectId === urza).length, legalActions(s, 0).filter((a) => a.kind === "activate" && a.objectId === urza).length];
  eq(offers(), [1, 0], "one lore counter, {2} in the pool: it taps for {C}; no Construct yet");
  s.objects[urza].counters = {lore: 2};
  eq(offers(), [1, 1], "two: its {C}, and the Construct");
}
{
  /* Keyword counters (CR 122.1b): indestructible and flying give their keywords; a +1/+1 counter gives none. */
  const s = table();
  const bear = put(s, {card: "Bear", types: ["Creature"], power: 2, toughness: 2});
  s.objects[bear].counters = {indestructible: 1, flying: 1, "+1/+1": 2};
  eq(keywordsOf(s, bear).sort(), ["Flying", "Indestructible"], "indestructible and flying, from counters");
}
{
  /* Refused: a Saga's lore counter on a card that is not a Saga; a chapter with no number. Credited: Chapter. */
  const script = (subtypes, abilities) => compileScript({schema: "CrankCardScript@1", identity: {name: "Odd", oracleId: "x", types: ["Enchantment"], subtypes, manaCost: "{1}", colors: [], colorIdentity: []},
    oracleText: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after I.)\nI — You gain 1 life.", source: "hand", abilities});
  const SAGA = {kind: "keyword", text: "As this Saga enters and after your draw step, add a lore counter. Sacrifice after I.", keyword: "saga"};
  const I = (chapter) => ({kind: "triggered", text: "I — You gain 1 life.", trigger: {on: "chapter", chapter}, effects: [{effect: "gainLife", amount: 1}]});
  eq([script(["Saga"], [SAGA, I(1)]).problems.length, script([], [SAGA, I(1)]).problems.length > 0, script(["Saga"], [SAGA, I(0)]).problems.length > 0], [0, true, true],
    "a Saga: read; not a Saga: refused; chapter 0: refused");
  eq(missingFor({keywords: ["Chapter"]}), [], "the catalog credits Chapter");
}

console.log(`engine-saga: ${checks} checks passed — a lore counter as it enters and each precombat main phase; chapter N as the count crosses N; sacrificed at its last chapter once nothing of it waits; keyword counters give their keywords.`);
