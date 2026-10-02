/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 34 (THE CATALOG'S ORDER): "THAT ABILITY TRIGGERS AN ADDITIONAL TIME" (CR 603.2d).
 *
 * Panharmonicon, Yarok, Isshin and Teysa name what has to cause the trigger -- an artifact or creature entering, a
 * permanent entering, a creature attacking, a creature dying; Annie Joins Up, Katara and Echoes of Eternity name whose
 * ability it is. Either way it is a triggered ability of a permanent its controller controls -- an opponent's is not --
 * and each such static adds one more. A creature's own "when this dies" counts, read as it last was; and a "one or
 * more" trigger triggers again about everything it is about.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance} from "../game/engine/rules/turn.mjs";
import {keywordsOf} from "../game/engine/rules/layers.mjs";
import {collectTriggers} from "../game/engine/rules/trigger.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {loadCardIndex, loadCardScripts} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const BEAR = {card: "Bear", types: ["Creature"], power: 2, toughness: 2};
const pod = {matchId: "m", seed: "again", players: [{name: "Rob"}, {name: "Maya"}]};
function table() {
  const s = createState(pod);
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  beginGame(s);
  for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s);
  return s;
}
const on = (s, o, seat) => addObject(s, {...o, owner: seat, controller: seat}, "battlefield", null);
const inHand = (s, o, seat) => addObject(s, {...o, owner: seat, controller: seat}, "hand", seat);
/* What triggers on what these effects do: each pending trigger's source, by name. */
const triggered = (s, effects, controller = 0) => { s.pendingTriggers = []; collectTriggers(s, runEffects(s, effects, {controller, source: null})); return s.pendingTriggers.map((t) => t.source.name); };
const enter = (id) => [{effect: "moveZone", targets: [id], to: "battlefield"}];

{
  /* Panharmonicon: an artifact or creature entering; one more for each Panharmonicon; not a land; not an opponent's. */
  const s = table();
  on(s, card("Panharmonicon"), 0);
  eq(triggered(s, enter(inHand(s, card("Elvish Visionary"), 0))), ["Elvish Visionary", "Elvish Visionary"], "Elvish Visionary enters: its trigger twice");
  eq(triggered(s, enter(inHand(s, card("Scoured Barrens"), 0))), ["Scoured Barrens"], "Scoured Barrens enters: a land is not an artifact or creature -- once");
  eq(triggered(s, enter(inHand(s, card("Elvish Visionary"), 1)), 1), ["Elvish Visionary"], "Maya's Elvish Visionary: not a permanent Rob controls -- once");
  on(s, card("Panharmonicon"), 0);
  eq(triggered(s, enter(inHand(s, card("Elvish Visionary"), 0))).length, 3, "two Panharmonicons: three times");
}
{
  /* Yarok: any permanent entering -- the land too. Isshin: an attack, not an arrival. */
  const s = table();
  on(s, card("Yarok, the Desecrated"), 0);
  eq(triggered(s, enter(inHand(s, card("Scoured Barrens"), 0))).length, 2, "Yarok: a land entering counts -- twice");
  const t = table();
  on(t, card("Isshin, Two Heavens as One"), 0);
  eq(triggered(t, enter(inHand(t, card("Elvish Visionary"), 0))).length, 1, "Isshin: something entering is not an attack -- once");
}
{
  /* Teysa: a creature dying -- another's, or its own trigger's source; not exile. And her tokens. */
  const s = table();
  on(s, card("Teysa Karlov"), 0);
  on(s, card("Zulaport Cutthroat"), 0);
  const bear = on(s, BEAR, 0);
  eq(triggered(s, [{effect: "destroy", targets: [bear]}]), ["Zulaport Cutthroat", "Zulaport Cutthroat"], "the Bear dies: Zulaport Cutthroat's trigger twice");
  const bear2 = on(s, BEAR, 0);
  eq(triggered(s, [{effect: "moveZone", targets: [bear2], to: "exile"}]), [], "exiled is not dying: nothing triggers");
  on(s, {card: "Leaver", types: ["Enchantment"], abilities: [{id: "l", kind: "triggered", text: "Whenever a creature leaves the battlefield, draw a card.",
    trigger: {on: "GameEventCardChangeZone", from: "Battlefield", who: "any", filter: {types: ["Creature"]}}, effects: [{effect: "draw", count: 1}]}]}, 0);
  const bear3 = on(s, BEAR, 0);
  eq(triggered(s, [{effect: "moveZone", targets: [bear3], to: "exile"}]), ["Leaver"], "a creature exiled triggers a leaves-the-battlefield ability -- but it did not die: once");
  runEffects(s, [{effect: "createToken", token: {name: "Spirit", types: ["Creature"], power: 1, toughness: 1}}], {controller: 0, source: null});
  const spirit = s.zones.battlefield.find((id) => s.objects[id].card === "Spirit");
  eq(["Vigilance", "Lifelink"].filter((k) => keywordsOf(s, spirit).includes(k)), ["Vigilance", "Lifelink"], "Teysa: Rob's creature token has vigilance and lifelink");
}
{
  /* Whose ability: Katara's Allies (Zulaport is one; Blood Artist is not). */
  const s = table();
  on(s, card("Katara, the Fearless"), 0);
  on(s, card("Zulaport Cutthroat"), 0);
  on(s, card("Blood Artist"), 0);
  const bear = on(s, BEAR, 0);
  eq(triggered(s, [{effect: "destroy", targets: [bear]}]).sort(), ["Blood Artist", "Zulaport Cutthroat", "Zulaport Cutthroat"], "the Bear dies: the Ally's trigger twice, Blood Artist's once");
}
{
  /* Echoes of Eternity: ANOTHER colorless permanent -- not its own trigger; not a colored permanent's. */
  const s = table();
  on(s, card("Echoes of Eternity"), 0);
  on(s, card("Howling Mine"), 0);
  for (let n = 0; n < 40 && !(s.turn === 2 && s.phase === "DRAW"); n += 1) { s.awaiting = null; s.pendingTriggers = []; advance(s); }
  eq(s.pendingTriggers.filter((t) => t.source.name === "Howling Mine").length, 2, "Howling Mine at Maya's draw step: another colorless permanent of Rob's -- twice");
  const t = table();
  on(t, card("Echoes of Eternity"), 0);
  eq(triggered(t, enter(inHand(t, card("Elvish Visionary"), 0))).length, 1, "Elvish Visionary is green: once");
}
{
  /* "Whenever one or more creatures die": again, about every one of them. */
  const s = table();
  on(s, card("Teysa Karlov"), 0);
  const watcher = on(s, {card: "Watcher", types: ["Enchantment"], abilities: [{id: "w", kind: "triggered", text: "Whenever one or more creatures die, draw a card.",
    trigger: {on: "GameEventCardChangeZone", from: "Battlefield", to: "Graveyard", who: "any", batch: true, filter: {types: ["Creature"]}}, effects: [{effect: "draw", count: 1}]}]}, 0);
  on(s, BEAR, 0); on(s, BEAR, 1);
  s.pendingTriggers = [];
  collectTriggers(s, runEffects(s, [{effect: "destroyAll", selector: {what: "permanent", types: ["Creature"]}}], {controller: 0, source: null}));
  const mine = s.pendingTriggers.filter((t) => t.source.cardId === watcher);
  eq(mine.map((t) => (t.about?.cards ?? []).length), [3, 3], "a wipe of two Bears and Teysa herself: the one-or-more trigger twice -- she looks back as she dies with them -- each about all three");
}
{
  /* The look-back is a departure's only: a Panharmonicon that leaves as a creature enters doubles nothing. */
  const s = table();
  const harmonicon = on(s, card("Panharmonicon"), 0);
  const visionary = inHand(s, card("Elvish Visionary"), 0);
  eq(triggered(s, [{effect: "moveZone", targets: [harmonicon], to: "exile"}, ...enter(visionary)]), ["Elvish Visionary"], "Panharmonicon exiled in the same resolution as Elvish Visionary enters: once");
}
{
  /* What may cause it. */
  const script = structuredClone(loadCardScripts().find(({script: one}) => one.identity.name === "Panharmonicon").script);
  script.abilities[0].cause = {event: "casts"};
  eq(validateScript(script).errors.some((e) => /enters, dies or attacks/.test(e.message)), true, "a cause that is not an arrival, a death or an attack is refused");
}

console.log(`engine-triggers-again: ${checks} checks passed — one more for each static: by what caused it (entering, attacking, dying, its own death read as it was) or whose it is; never an opponent's; a one-or-more trigger again about all of them.`);
