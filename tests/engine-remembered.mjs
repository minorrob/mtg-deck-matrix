/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 17 (THE CATALOG'S ORDER): REMEMBERING AN OBJECT.
 *
 * An ability that triggers on a zone change finds what the card became, when it went somewhere public (CR 400.7e):
 * "return that card to its owner's hand" returns the card in the graveyard. A delayed trigger remembers what it names
 * as it is made (CR 603.7c) -- the card, the target, the player -- and does nothing to an object that has since left
 * the zone it was expected in. It fires at the next end step, at the next turn's upkeep, or on an event: once, for the
 * object it waits on, or every time for the rest of the turn (CR 603.7b), and never on what happened before it was made
 * (CR 603.7a). An effect remembers what it moved ("a copy of it") and the set it fixed ("those permanents"). Damage
 * prevented for a while is prevented for exactly the objects it named. A creature may attack as though it didn't have
 * defender. And a choice can be another player's: "its controller may draw up to two cards".
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {characteristicsOf, keywordsOf} from "../game/engine/rules/layers.mjs";
import {collectTriggers} from "../game/engine/rules/trigger.mjs";
import {applyReplacements} from "../game/engine/rules/replacement.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {canAttack} from "../game/engine/rules/combat.mjs";
import {combatDamageOf} from "../game/engine/rules/statics.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const ISLAND = {card: "Island", types: ["Land"], supertypes: ["Basic"], subtypes: ["Island"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {U: 1}}]};
const creature = (name, power = 2, extra = {}) => ({card: name, types: ["Creature"], manaCost: "{1}", power, toughness: power, ...extra});
const sorcery = (name, effects) => ({card: name, types: ["Sorcery"], manaCost: "{0}", spell: {id: "s", text: name, targets: [], effects}});
const pod = {matchId: "m", seed: "remembered", players: [{name: "Rob"}, {name: "Maya"}]};
function table() {
  const s = createState(pod);
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
const on = (s, o, seat, zone = "battlefield") => addObject(s, {...o, owner: seat, controller: seat}, zone, ["battlefield", "exile"].includes(zone) ? null : seat);
function main(s) { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; }
/* The room's loop without the people: pass, advance, nobody attacks or blocks, triggers in the order offered; it stops at
   `until` or at any other question. */
function run(s, until) {
  for (let n = 0; n < 600 && !until(s); n += 1) {
    if (s.awaiting) {
      const kind = s.awaiting.kind;
      if (kind === "declare-attackers" || kind === "declare-blockers") resolveAwaiting(s, []);
      else if (kind === "order-triggers") resolveAwaiting(s, awaitingChoice(s).options.map((o) => o.index));
      else break;
      continue;
    }
    if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s);
  }
}
const settled = (s) => s.stack.length === 0 && !(s.pendingTriggers ?? []).length && s.priorityPlayer !== null && !s.awaiting;
const ctx = (controller = 0, source = null, extra = {}) => ({controller, source, ...extra});
const named = (s, name, zone = "battlefield") => Object.keys(s.objects).map(Number).filter((id) => s.objects[id].card === name && s.objects[id].zone === zone);
const cast = (s, seat, name) => applyAction(s, seat, legalActions(s, seat).find((a) => a.kind === "cast" && a.label === name));
const DIES = {on: "GameEventCardChangeZone", from: "Battlefield", to: "Graveyard", who: "any"};

/* ---- what a card became (CR 400.7e) ---- */
{
  const s = table();
  const bear = on(s, creature("Bear"), 0), elf = on(s, creature("Elf", 1), 0);
  main(s);
  const died = beginResolution(s, [{effect: "destroy", targets: [bear]}], ctx()).events.find((e) => e.kind === "GameEventCardChangeZone");
  eq(died.data.fields.becomes, named(s, "Bear", "graveyard")[0], "a creature dies: the event names what it became in the graveyard, a new object (CR 400.7e)");
  const bounced = beginResolution(s, [{effect: "moveZone", targets: [elf], to: "hand"}], ctx()).events.find((e) => e.kind === "GameEventCardChangeZone");
  eq(bounced.data.fields.becomes, undefined, "returned to a hand, a hidden zone: nothing names what it became there");
}

{
  /* Deaths the rules make, not an effect: lethal damage (CR 704.5g), and a token arriving, and a permanent spell resolving. */
  const s = table();
  on(s, card("Liesa, Forgotten Archangel"), 0);
  const bear = on(s, creature("Bear"), 0);
  main(s);
  s.objects[bear].damage = 2;
  const sba = checkStateBasedActions(s);
  const died = sba.find((e) => e.kind === "GameEventCardChangeZone");
  eq(died?.data.fields.becomes, named(s, "Bear", "graveyard")[0], "a creature dead of lethal damage, a state-based action: the event names the card it became too");
  collectTriggers(s, sba);
  eq(s.pendingTriggers.map((t) => t.about?.card), [named(s, "Bear", "graveyard")[0]], "so Liesa's trigger is about that card, and will return it");
  s.pendingTriggers = [];
  const made = beginResolution(s, [{effect: "createToken", count: 1, token: {name: "Spirit", types: ["Creature"], power: 1, toughness: 1}}], ctx()).events.find((e) => e.kind === "GameEventCardChangeZone");
  eq(made.data.fields.becomes, named(s, "Spirit")[0], "a token created: the event names the token");
}
{
  /* A creature spell resolving: the permanent it became (CR 400.7e), which "whenever one or more creatures enter" reads. */
  const s = table();
  on(s, creature("Cub"), 0, "hand"); on(s, WASTES, 0);
  main(s);
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana"));
  cast(s, 0, "Cub");
  passPriority(s);
  const arrived = (passPriority(s).events ?? []).find((e) => e.kind === "GameEventCardChangeZone" && e.data.fields.to?.zoneType === "Battlefield");
  eq(arrived?.data.fields.becomes, named(s, "Cub")[0], "a creature spell resolving: the event names the permanent it became");
}
{
  /* The Scarab God dies in combat-sized damage, not to a destroy effect: it still comes back. */
  const s = table();
  main(s);
  const god = on(s, card("The Scarab God"), 0);
  s.objects[god].damage = 5;
  collectTriggers(s, checkStateBasedActions(s));
  eq(s.pendingTriggers.map((t) => t.about?.card), [named(s, "The Scarab God", "graveyard")[0]], "dead of damage, its own \"when this dies\" is about the card in the graveyard");
}

/* ---- Liesa: that card, back at the end step; an opponent's creature exiled instead ---- */
{
  const s = table();
  on(s, card("Liesa, Forgotten Archangel"), 0);
  const bear = on(s, creature("Bear"), 0), cub = on(s, creature("Cub"), 0), spirit = on(s, creature("Spirit", 1, {token: true}), 0);
  const ogre = on(s, creature("Ogre", 3), 1);
  on(s, sorcery("Cull", [{effect: "destroy", targets: [bear, cub, spirit, ogre]}]), 0, "hand");
  main(s);
  cast(s, 0, "Cull");
  run(s, settled);
  eq([named(s, "Ogre", "exile").length, named(s, "Ogre", "graveyard").length], [1, 0], "Maya's Ogre would have died: exiled instead, so it never died");
  eq((s.delayedTriggers ?? []).length, 2, "Bear and Cub died -- two returns waiting; the Spirit token was not a nontoken creature");
  eq(s.delayedTriggers.map((d) => s.objects[d.effects[0].targets[0]]?.card).sort(), ["Bear", "Cub"],
    "each remembers its card, as the card it became in the graveyard (CR 603.7c)");
  /* The Cub leaves the graveyard before the end step: a new object, and the return finds nothing (CR 603.7c). */
  beginResolution(s, [{effect: "moveZone", targets: named(s, "Cub", "graveyard"), to: "exile"}], ctx(1));
  /* And the game is saved and reloaded on the way: what was remembered is plain data. */
  const saved = JSON.parse(JSON.stringify(s));
  run(saved, (x) => x.turn > 1 || named(x, "Bear", "hand").length > 0);
  run(saved, settled);
  eq([named(saved, "Bear", "hand").length, named(saved, "Cub", "exile").length, named(saved, "Cub", "hand").length], [1, 1, 0],
    "at the end step the Bear returns to Rob's hand, in a game saved and reloaded; the Cub, exiled meanwhile, stays where it is");
}

/* ---- The Scarab God: a copy of what it exiled; it returns when it dies, unless it left the graveyard ---- */
{
  const s = table();
  const god = on(s, card("The Scarab God"), 0);
  const bird = on(s, creature("Bird", 1, {colors: ["U"], subtypes: ["Bird"], keywords: ["Flying"]}), 1, "graveyard");
  main(s);
  const ability = s.objects[god].abilities.find((a) => a.kind === "activated");
  beginResolution(s, ability.effects, ctx(0, god, {targets: [{kind: "object", id: bird}]}));
  const [copy] = named(s, "Bird");
  const c = characteristicsOf(s, copy);
  eq([named(s, "Bird", "exile").length, s.objects[copy].token, c.power, c.toughness, c.colors, s.objects[copy].subtypes, keywordsOf(s, copy).includes("Flying")],
    [1, true, 4, 4, ["B"], ["Zombie"], true],
    "the Bird card exiled; a token copy of it -- the card it became in exile -- except a 4/4 black Zombie, still flying");
}
{
  const s = table();
  main(s);
  /* Put down in the main phase, so its upkeep trigger has not asked anything yet. */
  const god = on(s, card("The Scarab God"), 0);
  on(s, sorcery("Doom", [{effect: "destroy", targets: [god]}]), 0, "hand");
  cast(s, 0, "Doom");
  run(s, settled);
  eq([named(s, "The Scarab God", "graveyard").length, (s.delayedTriggers ?? []).length], [1, 1], "it dies: a return is waiting for the end step");
  const kept = JSON.parse(JSON.stringify(s));
  run(s, (x) => x.turn > 1 || named(x, "The Scarab God", "hand").length > 0);
  eq(named(s, "The Scarab God", "hand").length, 1, "and at the end step it is back in Rob's hand");
  beginResolution(kept, [{effect: "moveZone", targets: named(kept, "The Scarab God", "graveyard"), to: "exile"}], ctx(1));
  run(kept, (x) => x.turn > 1);
  eq([named(kept, "The Scarab God", "hand").length, named(kept, "The Scarab God", "exile").length], [0, 1], "exiled from the graveyard first: it stays exiled");
}

/* ---- a delayed trigger that waits for an event (CR 603.7a, 603.7b) ---- */
{
  const s = table();
  const elf = on(s, creature("Elf", 1), 0), bear = on(s, creature("Bear"), 0), ogre = on(s, creature("Ogre", 3), 1);
  main(s);
  /* "Destroy the Elf. Whenever a creature dies this turn, you gain 1 life": the Elf died before the trigger existed. */
  const made = beginResolution(s, [{effect: "destroy", targets: [elf]}, {effect: "delayedTrigger", on: DIES, thisTurn: true, effects: [{effect: "gainLife", amount: 1}]}], ctx());
  collectTriggers(s, made.events);
  eq((s.pendingTriggers ?? []).length, 0, "it does not trigger on a death that happened before it was made, in the same resolution (CR 603.7a)");
  collectTriggers(s, beginResolution(s, [{effect: "destroy", targets: [bear, ogre]}], ctx()).events);
  eq(s.pendingTriggers.length, 2, "afterwards it triggers for every creature that dies, both of these, Maya's included (CR 603.7b, \"this turn\")");
  s.pendingTriggers = [];
  run(s, (x) => x.turn === 2 && x.phase === "MAIN1");
  eq((s.delayedTriggers ?? []).filter((d) => d.thisTurn).length, 0, "and the turn's end ends it (CR 514.2)");
}
{
  const s = table();
  const elf = on(s, creature("Elf", 1), 0), bear = on(s, creature("Bear"), 0), cub = on(s, creature("Cub"), 0);
  main(s);
  /* "When that creature dies this turn, return that card to its owner's hand": the Bear, by the object it is now. */
  beginResolution(s, [{effect: "delayedTrigger", on: DIES, watch: [bear], thisTurn: true, effects: [{effect: "moveZone", targets: "that card", to: "hand"}]}], ctx());
  collectTriggers(s, []);
  collectTriggers(s, beginResolution(s, [{effect: "destroy", targets: [elf]}], ctx()).events);
  eq((s.pendingTriggers ?? []).length, 0, "another creature dying is not that creature");
  collectTriggers(s, beginResolution(s, [{effect: "destroy", targets: [bear]}], ctx()).events);
  const [fired] = s.pendingTriggers;
  eq([s.pendingTriggers.length, fired.about?.card, fired.script.effects[0].targets], [1, named(s, "Bear", "graveyard")[0], "that card"],
    "the Bear dies: it triggers, about the card in the graveyard, and \"that card\" is left for that event to name");
  beginResolution(s, fired.script.effects, ctx(0, null, {about: fired.about}));
  eq(named(s, "Bear", "hand").length, 1, "which returns the Bear to Rob's hand");
}

/* ---- Massacre Girl: the chain, and only this turn ---- */
{
  const s = table();
  on(s, card("Massacre Girl"), 0, "hand");
  for (let i = 0; i < 2; i += 1) on(s, {...WASTES, card: "Swamp", subtypes: ["Swamp"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {B: 1}}]}, 0);
  for (let i = 0; i < 3; i += 1) on(s, WASTES, 0);
  const elf = on(s, creature("Elf", 1), 1), bear = on(s, creature("Bear"), 1), ogre = on(s, creature("Ogre", 3), 1), giant = on(s, creature("Giant", 5), 1);
  main(s);
  for (const a of legalActions(s, 0).filter((x) => x.kind === "activate-mana")) applyAction(s, 0, a);
  cast(s, 0, "Massacre Girl");
  run(s, settled);
  void elf; void bear; void ogre;
  eq([named(s, "Elf", "graveyard").length + named(s, "Bear", "graveyard").length + named(s, "Ogre", "graveyard").length, characteristicsOf(s, giant).toughness],
    [3, 1], "the 1/1 dies, which shrinks the rest, the 2/2 dies, and the 3/3: three deaths, and the 5/5 is left 1/1 (-1/-1 four times)");
  ok(named(s, "Massacre Girl").length === 1, "Massacre Girl is never one of the creatures it shrinks");
  run(s, (x) => x.turn === 2 && x.phase === "MAIN1");
  const before = characteristicsOf(s, giant).toughness;
  collectTriggers(s, beginResolution(s, [{effect: "destroy", targets: named(s, "Massacre Girl")}], ctx()).events);
  eq([(s.pendingTriggers ?? []).filter((t) => t.abilityId === "delayed").length, before], [0, 5], "the next turn the Giant is 5/5 again and a death triggers nothing: it was \"this turn\"");
}

/* ---- Arcane Denial: the next turn's upkeep, and a choice that is the other player's ---- */
{
  const s = table();
  on(s, creature("Bear"), 0, "hand"); on(s, WASTES, 0);
  on(s, card("Arcane Denial"), 1, "hand"); on(s, ISLAND, 1); on(s, WASTES, 1);
  main(s);
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana"));
  cast(s, 0, "Bear");
  passPriority(s);
  for (const a of legalActions(s, 1).filter((x) => x.kind === "activate-mana")) applyAction(s, 1, a);
  applyAction(s, 1, legalActions(s, 1).find((a) => a.kind === "cast" && a.label === "Arcane Denial"));
  run(s, settled);
  eq([named(s, "Bear", "graveyard").length, (s.delayedTriggers ?? []).map((d) => d.at)], [1, ["upkeep", "upkeep"]], "the Bear is countered; two draws wait for the next upkeep");
  const hands = () => [0, 1].map((seat) => s.zones.hand[seat].length);
  const [robBefore, mayaBefore] = hands();
  run(s, (x) => x.turn === 2 && x.phase === "UPKEEP" && x.awaiting?.kind === "effect-choice");
  const choice = awaitingChoice(s);
  eq([s.awaiting.player, choice.options.map((o) => o.label)], [0, ["Draw two cards", "Draw one card", "Draw no cards"]],
    "at Maya's upkeep -- the next turn's -- Rob, who controlled the countered spell, chooses how many to draw: the choice is his, not Maya's");
  resolveAwaiting(s, [0]);
  run(s, settled);
  eq(hands(), [robBefore + 2, mayaBefore + 1], "Rob draws two; Maya, Arcane Denial's controller, draws one");
}

{
  /* A choice named by a target ("target player may draw a card"): that player makes it, not the controller. */
  const s = table();
  main(s);
  beginResolution(s, [{effect: "modal", chooser: {target: 0}, title: "Draw a card?", modes: [{text: "Yes", effects: [{effect: "draw", count: 1, who: {target: 0}}]}, {text: "No", effects: []}]}],
    ctx(0, null, {targets: [{kind: "player", id: 1}]}));
  eq(s.awaiting?.player, 1, "a choice whose chooser is a targeted player is that player's: Maya chooses, not Rob");
  resolveAwaiting(s, [1]);
}

/* ---- prevention for a while: to and by that creature, combat only, this turn ---- */
{
  const s = table();
  const ogre = on(s, creature("Ogre", 3), 1), bear = on(s, creature("Bear"), 0);
  main(s);
  beginResolution(s, [{effect: "effectUntil", rule: "prevent-damage", targets: [ogre], apply: {to: true, by: true, combat: true}, until: "end-of-turn"}], ctx());
  const hit = (p) => applyReplacements(s, {event: "damage", amount: 3, ...p}).proposal;
  eq([hit({toCard: ogre, sourceId: bear, combat: true}).prevented, hit({toPlayer: 0, sourceId: ogre, combat: true}).prevented,
    hit({toCard: ogre, sourceId: null, combat: false}).prevented ?? false, hit({toCard: bear, sourceId: null, combat: true}).prevented ?? false],
    [true, true, false, false], "combat damage to the Ogre and by it is prevented; damage that isn't combat damage, or to another creature, is not");
  run(s, (x) => x.turn === 2 && x.phase === "MAIN1");
  eq(hit({toCard: ogre, sourceId: bear, combat: true}).prevented ?? false, false, "and next turn nothing is prevented");
}
{
  /* Maze of Ith: "target attacking creature" -- outside combat it has nothing to aim at. */
  const s = table();
  on(s, card("Maze of Ith"), 0); on(s, creature("Ogre", 3), 1);
  main(s);
  eq(legalActions(s, 0).filter((a) => a.kind === "activate").length, 0, "outside combat there is no attacking creature: Maze of Ith offers nothing");
}
{
  const s = table();
  const scarred = on(s, creature("Scarred"), 0), plain = on(s, creature("Plain"), 0);
  on(s, card("Mutational Advantage"), 0, "hand");
  main(s);
  s.objects[scarred].counters["+1/+1"] = 1;
  beginResolution(s, card("Mutational Advantage").spell.effects, ctx());
  resolveAwaiting(s, []);
  s.objects[plain].counters["+1/+1"] = 1;   /* a counter afterwards: not one of "those permanents" */
  const hit = (id) => applyReplacements(s, {event: "damage", toCard: id, amount: 5, sourceId: null, combat: false}).proposal.prevented ?? false;
  eq([hit(scarred), hit(plain), keywordsOf(s, scarred).includes("Hexproof"), keywordsOf(s, scarred).includes("Indestructible"), keywordsOf(s, plain).includes("Hexproof")],
    [true, false, true, true, false], "the creature that had a counter is safe from damage, hexproof and indestructible this turn; one that got a counter afterwards is not");
}

/* ---- defender, as though it didn't have it ---- */
{
  const s = table();
  const wall = on(s, creature("Wall", 0, {toughness: 4, keywords: ["Defender"]}), 0);
  on(s, card("Assault Formation"), 0);
  main(s);
  eq([canAttack(s, wall, 0), combatDamageOf(s, wall)], [false, 4], "a Wall can't attack; with Assault Formation it would assign combat damage equal to its toughness, 4");
  beginResolution(s, [{effect: "effectUntil", rule: "attacks-despite-defender", targets: [wall], until: "end-of-turn"}], ctx());
  ok(canAttack(s, wall, 0), "this turn it may attack as though it didn't have defender");
  run(s, (x) => x.turn === 3 && x.phase === "MAIN1");
  eq(canAttack(s, wall, 0), false, "and on Rob's next turn it can't again");
}

console.log(`engine-remembered: ${checks} checks passed — what a card became after a zone change, delayed triggers that remember (the end step, the next upkeep, an event this turn), a copy of what was exiled, damage prevented for a while, defender set aside, and a choice that is another player's.`);
