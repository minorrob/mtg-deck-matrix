/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 13 (THE CATALOG'S ORDER): A TOKEN THAT'S A COPY (CR 707), POPULATE (CR 701.30), AND DELAYED
 * TRIGGERS THAT FIRE (CR 603.7).
 *
 * A copy copies the copiable values -- name, cost, colors, types, rules text, printed power and toughness -- and never
 * counters, damage, tapped state or the effects on the original (CR 707.2); a copy of a copy copies the copy (707.3);
 * "except ..." changes the copy itself (707.9). Populate copies a creature token its controller chooses. "Sacrifice it
 * at the beginning of the next end step" is a delayed trigger: it fires once, at the next end step after it was made --
 * one made during an end step waits for the following turn's (CR 603.7c).
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {characteristicsOf, keywordsOf} from "../game/engine/rules/layers.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const creature = (name, extra = {}) => ({card: name, types: ["Creature"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2, ...extra});

const pod = {matchId: "m", seed: "copies", players: [{name: "Rob"}, {name: "Maya"}]};
function table() {
  const s = createState(pod);
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
const on = (s, o, seat, zone = "battlefield") => addObject(s, {...o, owner: seat, controller: seat}, zone, ["battlefield", "exile"].includes(zone) ? null : seat);
function main(s) { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; }
function run(s, until) {
  for (let n = 0; n < 400 && !until(s); n += 1) {
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
const named = (s, name) => s.zones.battlefield.filter((id) => s.objects[id].card === name);
const resolveCtx = (controller = 0, source = null) => ({controller, source});

/* ---- what a copy copies (CR 707.2) ---- */
{
  const s = table();
  const bear = on(s, creature("Bear", {keywords: ["Reach"], supertypes: ["Legendary"]}), 0);
  main(s);
  s.objects[bear].counters["+1/+1"] = 2; s.objects[bear].damage = 1; s.objects[bear].tapped = true;
  beginResolution(s, [{effect: "pumpAll", selector: {types: ["Creature"]}, power: 5, toughness: 5}], resolveCtx());
  beginResolution(s, [{effect: "copyPermanent", targets: [bear]}], resolveCtx());
  const [, copy] = named(s, "Bear");
  const c = characteristicsOf(s, copy);
  eq([c.power, c.toughness, s.objects[copy].damage, s.objects[copy].tapped, s.objects[copy].token], [2, 2, 0, false, true],
    "a copy is the printed 2/2: not the counters, the damage, the tapped state or the +5/+5 on the original -- and it is a token");
  eq([c.colors, keywordsOf(s, copy), s.objects[copy].supertypes, s.objects[copy].manaCost], [["G"], ["Reach"], ["Legendary"], "{1}{G}"], "its colors, keywords, supertypes and mana cost are the original's");
  beginResolution(s, [{effect: "copyPermanent", targets: [copy], except: {nonLegendary: true, addTypes: ["Artifact"], addKeywords: ["Flying"], setPower: 4}}], resolveCtx());
  const third = named(s, "Bear").find((id) => id !== bear && id !== copy);
  const t = characteristicsOf(s, third);
  eq([t.power, t.toughness, t.types.sort(), keywordsOf(s, third).sort(), s.objects[third].supertypes ?? []], [4, 2, ["Artifact", "Creature"], ["Flying", "Reach"], []],
    "a copy of the copy copies the copy (CR 707.3), and \"except\" changes it: not legendary, an artifact too, flying, base power 4 (CR 707.9)");
}
{
  /* "For each token you control": one copy of each, and a copy of a Treasure keeps its ability. */
  const s = table();
  main(s);
  beginResolution(s, [{effect: "createToken", count: 1, token: {predefined: "Treasure"}}, {effect: "createToken", count: 1, token: {name: "Spirit", types: ["Creature"], power: 1, toughness: 1}}], resolveCtx());
  beginResolution(s, [{effect: "copyPermanent", selector: {token: true, controller: "you"}}], resolveCtx());
  eq([named(s, "Treasure").length, named(s, "Spirit").length], [2, 2], "Second Harvest's shape: a copy of each token");
  eq(legalActions(s, 0).filter((a) => a.kind === "activate-mana" && a.label === "Treasure").length, 10, "and both Treasures tap for any color (five offers each)");
}

/* ---- delayed triggers (CR 603.7) ---- */
{
  const s = table();
  const bear = on(s, creature("Bear"), 0);
  main(s);
  beginResolution(s, [{effect: "copyPermanent", targets: [bear], gainsUntilEndOfTurn: ["Haste"], atEndStep: "sacrifice"}], resolveCtx());
  const [, copy] = named(s, "Bear");
  ok(keywordsOf(s, copy).includes("Haste"), "the copy gains haste this turn");
  eq((s.delayedTriggers ?? []).length, 1, "and a delayed trigger waits");
  run(s, (x) => x.phase === "END_OF_TURN" && x.priorityPlayer !== null);
  eq(s.stack.map((e) => e.abilityId), ["delayed"], "at the beginning of the end step the delayed trigger is on the stack, where it can be answered");
  run(s, (x) => x.turn === 2);
  eq([named(s, "Bear").length, (s.delayedTriggers ?? []).length], [1, 0], "at the next end step the copy is sacrificed, once, and the delayed trigger is gone");
  run(s, (x) => x.turn === 3);
  eq(named(s, "Bear"), [bear], "and nothing more happens at the end step after (it triggered once)");
}
{
  /* Made during an end step: "the next end step" is the following turn's (CR 603.7c). */
  const s = table();
  const bear = on(s, creature("Bear"), 0);
  main(s);
  run(s, (x) => x.phase === "END_OF_TURN" && x.priorityPlayer !== null);
  beginResolution(s, [{effect: "copyPermanent", targets: [bear], atEndStep: "sacrifice"}], resolveCtx());
  run(s, (x) => x.turn === 2 && x.phase === "MAIN1");
  eq(named(s, "Bear").length, 2, "a copy made in turn 1's end step survives into turn 2");
  run(s, (x) => x.turn === 3);
  eq(named(s, "Bear").length, 1, "and is sacrificed at turn 2's end step");
}

/* ---- populate (CR 701.30) ---- */
{
  const s = table();
  main(s);
  beginResolution(s, [{effect: "populate"}], resolveCtx());
  eq([s.awaiting, s.resolving], [null, null], "with no creature token, populate asks nothing and does nothing");
  beginResolution(s, [{effect: "createToken", count: 1, token: {name: "Spirit", types: ["Creature"], power: 1, toughness: 1}},
    {effect: "createToken", count: 1, token: {name: "Saproling", types: ["Creature"], power: 1, toughness: 1}}, {effect: "createToken", count: 1, token: {predefined: "Treasure"}}], resolveCtx());
  beginResolution(s, [{effect: "populate", gains: ["Haste"]}], resolveCtx());
  const choice = awaitingChoice(s);
  eq(choice.options.map((o) => o.label).sort(), ["Saproling", "Spirit"], "with creature tokens, Rob chooses which -- a Treasure is no creature");
  resolveAwaiting(s, [choice.options.findIndex((o) => o.label === "Saproling")]);
  eq([named(s, "Saproling").length, named(s, "Spirit").length], [2, 1], "and the one chosen is copied");
  ok(keywordsOf(s, named(s, "Saproling")[1]).includes("Haste"), "with what the card says it gains");
}

/* ---- the cards' own parts ---- */
{
  const s = table();
  on(s, card("Kiki-Jiki, Mirror Breaker"), 0);
  on(s, creature("Bear"), 0); on(s, creature("Hero", {supertypes: ["Legendary"]}), 0);
  main(s);
  eq(legalActions(s, 0).filter((a) => a.kind === "activate" && a.label === "Kiki-Jiki, Mirror Breaker").map((a) => a.targetNames[0]), ["Bear"],
    "Kiki-Jiki aims only at a nonlegendary creature (the selector's nonSupertypes) -- not Hero, not itself");
}
{
  /* Helm of the Host: "a copy of equipped creature" -- what it is attached to as the trigger resolves. */
  const s = table();
  const helm = on(s, card("Helm of the Host"), 0);
  const hero = on(s, creature("Hero", {supertypes: ["Legendary"]}), 0);
  s.objects[helm].attachedTo = hero; s.objects[hero].attachments = [helm];
  main(s);
  run(s, (x) => x.phase === "COMBAT_BEGIN" && x.stack.length > 0);
  run(s, (x) => x.phase !== "COMBAT_BEGIN" || x.stack.length === 0);
  const copies = named(s, "Hero").filter((id) => id !== hero);
  eq([copies.length, s.objects[copies[0]]?.supertypes ?? [], keywordsOf(s, copies[0]).includes("Haste")], [1, [], true], "at the beginning of combat: a copy of the equipped creature, not legendary, with haste");
}

/* ---- the measurement ---- */
{
  eq([missingFor({apis: ["CopyPermanent"], options: ["AtEOT", "NonLegendary", "PumpKeywords"]}), missingFor({apis: ["CopyPermanent"], options: ["TokenAttacking"]}), missingFor({apis: ["Animate"], options: ["AddTriggers"]})],
    [[], [], [{kind: "option", name: "AddTriggers", why: "not built"}]],
    "a copy sacrificed at end step, not legendary, hasty this turn: built; a copy entering attacking: built (batch 67); an ability granting a trigger: not");
}

console.log(`engine-copies: ${checks} checks passed — a copy copies the copiable values and the card's exceptions, populate copies the token chosen, and "at the beginning of the next end step" fires once.`);
