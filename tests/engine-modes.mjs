/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 35 (THE CATALOG'S ORDER): MODES CHOSEN AS A SPELL IS CAST (CR 700.2), AND A COMPARISON.
 *
 * A modal spell's modes are chosen as it is cast, with each chosen mode's targets (CR 700.2a, 601.2b-c): one offer per
 * choice of modes, in the card's order, a mode at most once (700.2d). "If you control a Wizard as you cast this spell,
 * you may choose two instead" is asked then, and only then. As it resolves, each chosen mode does what it says to its
 * own targets; a mode whose targets have all become illegal does nothing while the others still happen (608.2b). A copy
 * keeps the modes (707.10). And an amount may be one number or another by a condition, asked as it is counted.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {resolveTop} from "../game/engine/rules/stack.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {modalScript} from "../game/engine/script/bind.mjs";
import {amountOf, amountProblems} from "../game/engine/script/amount.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {offerDetails} from "../game/room/room.mjs";
import {loadCardIndex, loadCardScripts} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const pod = {matchId: "m", seed: "modes", players: [{name: "Rob"}, {name: "Maya"}]};
function table() {
  const s = createState(pod);
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  beginGame(s);
  for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s);
  return s;
}
const on = (s, o, seat) => addObject(s, {...o, owner: seat, controller: seat}, "battlefield", null);
const inHand = (s, o, seat) => addObject(s, {...o, owner: seat, controller: seat}, "hand", seat);
const flames = (s) => legalActions(s, 0).filter((a) => a.kind === "cast" && a.label === "Flame of Anor");
const MANA = {U: 1, R: 1, C: 1};

{
  /* The offers: one mode, or -- with a Wizard, as it is cast -- two, in order, never one twice. */
  const s = table();
  inHand(s, card("Flame of Anor"), 0);
  on(s, {card: "Relic", types: ["Artifact"]}, 1);
  on(s, {card: "Ogre", types: ["Creature"], power: 4, toughness: 4}, 1);
  Object.assign(s.players[0].manaPool, MANA);
  eq([...new Set(flames(s).map((a) => JSON.stringify(a.modes)))], ["[0]", "[1]", "[2]"], "no Wizard: one mode at a time");
  on(s, {card: "Apprentice", types: ["Creature"], subtypes: ["Human", "Wizard"], power: 1, toughness: 1}, 0);
  const modes = [...new Set(flames(s).map((a) => JSON.stringify(a.modes)))];
  eq(modes, ["[0]", "[0,1]", "[0,2]", "[1]", "[1,2]", "[2]"], "a Wizard: any one, or any two in the card's order -- never the same mode twice");
  const both = flames(s).find((a) => JSON.stringify(a.modes) === "[0,2]" && a.targets[0].id === 0 && s.objects[a.targets[1].id]?.card === "Ogre");
  eq(offerDetails(s, 0, [both])[0].startsWith("Target player draws two cards. + Flame of Anor deals 5 damage to target creature."), true, "the table names the modes chosen in the card's words");
}
{
  /* A mode's targets are its own: the script moves each mode's references past the modes before it. */
  const modal = card("Flame of Anor").spell.modal;
  const {targets, effects} = modalScript(modal, [0, 2]);
  eq([targets.length, effects.map((e) => e.who ?? e.targets)], [2, [{target: 0}, {target: 1}]], "modes 1 and 3: two targets, and the damage aims at the second");
}
{
  /* Asked as it is cast: the Wizard leaving afterwards changes nothing. Then each mode to its own target; a mode whose
     target has gone does nothing, and the other still happens. */
  const s = table();
  inHand(s, card("Flame of Anor"), 0);
  const wizard = on(s, {card: "Apprentice", types: ["Creature"], subtypes: ["Human", "Wizard"], power: 1, toughness: 1}, 0);
  const relic = on(s, {card: "Relic", types: ["Artifact"]}, 1);
  const ogre = on(s, {card: "Ogre", types: ["Creature"], power: 4, toughness: 4}, 1);
  Object.assign(s.players[0].manaPool, MANA);
  applyAction(s, 0, flames(s).find((a) => JSON.stringify(a.modes) === "[1,2]" && a.targets[0].id === relic && a.targets[1].id === ogre));
  eq(s.stack[0].modes, [1, 2], "cast with two modes: the entry remembers them");
  beginResolution(s, [{effect: "moveZone", targets: [wizard], to: "exile"}, {effect: "moveZone", targets: [relic], to: "hand"}], {controller: 1, source: null});
  resolveTop(s);
  eq([s.objects[ogre].damage, s.zones.hand[1].filter((id) => s.objects[id].card === "Relic").length, s.zones.graveyard[0].map((id) => s.objects[id].card)], [5, 1, ["Flame of Anor"]],
    "the Wizard gone and the Relic back in Maya's hand: the destroy does nothing, the 5 damage still lands on the Ogre -- and it resolved, not fizzled");
}
{
  /* An action naming modes nobody offered is refused; a copy keeps the modes. */
  const s = table();
  inHand(s, card("Flame of Anor"), 0);
  const ogre = on(s, {card: "Ogre", types: ["Creature"], power: 4, toughness: 4}, 1);
  Object.assign(s.players[0].manaPool, MANA);
  const one = flames(s).find((a) => JSON.stringify(a.modes) === "[2]" && a.targets[0].id === ogre);
  assert.throws(() => applyAction(s, 0, {...one, modes: [0, 2], targets: [{kind: "player", id: 0}, {kind: "object", id: ogre}]}), /not a legal action/, "two modes without a Wizard: refused");
  checks += 1;
  assert.throws(() => applyAction(s, 0, {...one, modes: [1]}), /not a legal action/, "the same target, another mode (\"destroy target artifact\" at the Ogre): refused -- the modes are part of the action");
  checks += 1;
  applyAction(s, 0, one);
  on(s, {card: "Bear", types: ["Creature"], power: 2, toughness: 2}, 0);
  on(s, {card: "Relic", types: ["Artifact"]}, 1);
  beginResolution(s, [{effect: "copySpell", spells: [s.stack[0].objectId], newTargets: true}], {controller: 0, source: null});
  eq([s.stack[1].modes, awaitingChoice(s).options.map((o) => o.label)], [[2], ["Keep Ogre", "Bear"]],
    "the copy has mode 3 too, and its new target is asked by that mode's spec: a creature -- the Bear, not the Relic or a player");
}
{
  /* The comparison: one amount or another, by a condition asked as it is counted. */
  const s = table();
  const big = {if: {present: {what: "permanent", types: ["Creature"], power: {min: 4}, controller: "you"}}, then: 3, else: 2};
  eq(amountOf(s, big, {controller: 0, source: null}), 2, "no creature with power 4: two");
  on(s, {card: "Ogre", types: ["Creature"], power: 4, toughness: 4}, 0);
  eq([amountOf(s, big, {controller: 0, source: null}), amountOf(s, big, {controller: 1, source: null})], [3, 2], "Rob's Ogre: three for Rob, still two for Maya");
  eq(amountProblems({if: {sometimes: true}, then: 1}).length > 0, true, "a condition the grammar does not know is refused");
}
{
  /* "When you cast your next instant or sorcery spell this turn": once -- and gone at the end of the turn unfired. */
  const s = table();
  const twin = inHand(s, card("Twinferno"), 0);
  Object.assign(s.players[0].manaPool, {R: 1, C: 1});
  applyAction(s, 0, legalActions(s, 0).find((a) => a.objectId === twin && JSON.stringify(a.modes) === "[0]"));
  resolveTop(s);
  eq((s.delayedTriggers ?? []).map((d) => [d.thisTurn, d.once]), [[true, true]], "mode 1: a delayed trigger, this turn, once");
  for (let n = 0; n < 200 && s.turn === 1; n += 1) {
    if (s.awaiting) { resolveAwaiting(s, awaitingChoice(s).options.slice(0, awaitingChoice(s).min ?? 0).map((o) => o.index)); continue; }
    if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s);
  }
  eq(s.delayedTriggers ?? [], [], "unfired at the end of the turn: gone");
}
{
  /* The schema: a mode names its own targets. */
  const script = structuredClone(loadCardScripts().find(({script: one}) => one.identity.name === "Flame of Anor").script);
  script.abilities[0].effects[0].modes[1].effects[0].targets = {target: 1};
  eq(validateScript(script).errors.some((e) => /A mode names target 1, and declares 1/.test(e.message)), true, "a mode naming a target it does not declare is refused");
}

console.log(`engine-modes: ${checks} checks passed — modes chosen as it is cast with their own targets, "choose two" asked then; each mode to its own targets, one gone and the other still happens; a copy keeps them; an amount by a condition; a delayed trigger once this turn.`);
