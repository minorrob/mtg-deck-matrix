/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 51 (THE CATALOG'S ORDER): "WHENEVER A LAND IS TAPPED FOR MANA" (Forge's TapsForMana, CR 605.1b).
 *
 * The mana event says whether its source was tapped. A trigger watches who tapped it, what, and what it made. One that
 * adds mana is a mana ability: it is not put on the stack, but happens at once, as part of the mana ability that
 * triggered it -- to the player who tapped ("its controller adds"), "one mana of any type that land produced" one of what
 * it made. Any other triggers as triggers do. And a token's controller may be a target player.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {characteristicsOf} from "../game/engine/rules/layers.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const land = (name, produces, subtypes = []) => ({card: name, types: ["Land"], subtypes, abilities: [{id: "m", kind: "mana", tapSelf: true, produces}]});
const WASTES = land("Wastes", {C: 1});
const SWAMP = land("Swamp", {B: 1}, ["Swamp"]);
function table() {
  const s = createState({matchId: "m", seed: "tapped-for-mana", players: [{name: "Rob"}, {name: "Maya"}]});
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  beginGame(s);
  for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s);
  return s;
}
const put = (s, o, seat) => addObject(s, {...o, owner: seat, controller: seat}, "battlefield", null);
const tap = (s, seat, id, which = 0) => applyAction(s, seat, legalActions(s, seat).filter((a) => a.kind === "activate-mana" && a.objectId === id)[which]);
const pool = (s, seat) => Object.fromEntries(Object.entries(s.players[seat].manaPool).filter(([, n]) => n > 0));

{
  /* A triggered mana ability: at once, off the stack -- nothing waits to go on it. */
  const s = table();
  put(s, card("Nirkana Revenant"), 0);
  const swamp = put(s, SWAMP, 0), wastes = put(s, WASTES, 0);
  const events = tap(s, 0, swamp);
  eq([pool(s, 0), s.stack.length, (s.pendingTriggers ?? []).length], [{B: 2}, 0, 0], "a Swamp tapped: {B}{B} at once; nothing on the stack, nothing waiting");
  eq(events.filter((e) => e.kind === "GameEventManaPool").map((e) => e.data.fields.tapped === true), [true, false], "two mana events: the Swamp's, tapped; Nirkana's, not -- it triggers nothing further");
  tap(s, 0, wastes);
  eq(pool(s, 0), {B: 2, C: 1}, "a Wastes: not a Swamp, one {C}");
}
{
  /* Whose: Mirari's Wake, the land's tapper is you; Wild Growth, anyone's -- its controller adds it. */
  const s = table();
  put(s, card("Mirari's Wake"), 0);
  const hers = put(s, land("Forest", {G: 1}), 1);
  const dual = put(s, {card: "Dual", types: ["Land"], abilities: [{id: "m", kind: "mana", tapSelf: true, produces: [{W: 1}, {U: 1}]}]}, 0);
  tap(s, 0, dual, 1);
  eq(pool(s, 0), {U: 2}, "his dual land tapped for {U}: another of the type it produced, {U}");
  s.activePlayer = 1; s.priorityPlayer = 1;
  tap(s, 1, hers);
  eq(pool(s, 1), {G: 1}, "Maya's Forest: Rob's Wake gives her nothing");
  const t = table();
  const aura = put(t, card("Wild Growth"), 0);
  const herForest = put(t, land("Forest", {G: 1}), 1);
  t.objects[aura].attachedTo = herForest; t.objects[herForest].attachments = [aura];
  t.activePlayer = 1; t.priorityPlayer = 1;
  tap(t, 1, herForest);
  eq([pool(t, 1), pool(t, 0)], [{G: 2}, {}], "Rob's Wild Growth on Maya's Forest: she taps it, and she adds the {G}");
  tap(t, 1, put(t, land("Forest", {G: 1}), 1));
  eq(pool(t, 1), {G: 3}, "her other Forest, not enchanted: one {G}");
}
{
  /* What it made: Forsaken Monument's {C}. A mana ability that does not tap its source is not "tapped for mana". */
  const s = table();
  put(s, card("Forsaken Monument"), 0);
  const forest = put(s, land("Forest", {G: 1}), 0), wastes = put(s, WASTES, 0);
  tap(s, 0, forest); tap(s, 0, wastes);
  eq(pool(s, 0), {G: 1, C: 2}, "the Forest's {G}: nothing; the Wastes' {C}: another {C}");
  const altar = put(s, {card: "Altar", types: ["Artifact"], abilities: [{id: "m", kind: "mana", tapSelf: false, payLife: 1, produces: {C: 1}}]}, 0);
  tap(s, 0, altar);
  eq(pool(s, 0), {G: 1, C: 3}, "pay 1 life: Add {C} -- made {C}, but nothing was tapped: no more");
  /* Its anthem reads "colorless" through the layers: a colorless Golem +2/+2, a green Bear not. */
  const golem = put(s, {card: "Golem", types: ["Artifact", "Creature"], colors: [], power: 1, toughness: 1}, 0), bear = put(s, {card: "Bear", types: ["Creature"], colors: ["G"], power: 2, toughness: 2}, 0);
  eq([characteristicsOf(s, golem).power, characteristicsOf(s, bear).power], [3, 2], "the Golem 3/3; the Bear 2/2");
}
{
  /* Any other: on the stack, as triggers go. */
  const s = table();
  put(s, card("Manabarbs"), 1);
  tap(s, 0, put(s, land("Mountain", {R: 1}), 0));
  eq([pool(s, 0), (s.pendingTriggers ?? []).length + s.stack.length > 0], [{R: 1}, true], "Maya's Manabarbs: Rob's {R} added, and its trigger waits to be put on the stack");
  /* "Whenever you tap this land": this one, not another. */
  const t = table();
  const orchard = put(t, card("Forbidden Orchard"), 0);
  tap(t, 0, put(t, WASTES, 0));
  eq((t.pendingTriggers ?? []).length + t.stack.length + (t.awaiting ? 1 : 0), 0, "a Wastes tapped beside Forbidden Orchard: nothing");
  tap(t, 0, orchard);
  eq((t.pendingTriggers ?? []).length + t.stack.length + (t.awaiting ? 1 : 0) > 0, true, "the Orchard itself: its trigger");
}
{
  /* A token's controller, a target player as binding leaves it (script/bind.mjs: the seat, or -1 for no one). */
  const s = table();
  runEffects(s, [{effect: "createToken", controller: 1, token: {name: "Spirit", types: ["Creature"], power: 1, toughness: 1}}], {controller: 0, source: null});
  const spirit = s.zones.battlefield.map((id) => s.objects[id]).find((o) => o.card === "Spirit");
  eq([spirit.owner, spirit.controller], [1, 1], "created for Maya: hers");
  runEffects(s, [{effect: "createToken", controller: -1, token: {name: "Ghost", types: ["Creature"], power: 1, toughness: 1}}], {controller: 0, source: null});
  eq(s.zones.battlefield.some((id) => s.objects[id].card === "Ghost"), false, "for no one: nothing");
}
{
  eq(missingFor({triggers: ["TapsForMana"]}), [], "the catalog credits the trigger");
}

console.log(`engine-tapped-for-mana: ${checks} checks passed — a mana trigger at once, off the stack; whose, what, what it made; only when tapped; others on the stack; a token for a target player.`);
