/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* ENGINE 2.4: TARGETS, A CARD'S SCRIPT AT RESOLUTION, AND ACTIVATED ABILITIES.
 *
 * `docs/engine/PLAN.md` §6, phase 2.4 -- the glue that lets the primitives play in a game:
 *   1. TARGETS are chosen as a spell is cast (CR 601.2c): a cast is offered once per legal way to choose them,
 *      `targets` is part of what identifies it, and a spell with no legal target is not offered (script/bind.mjs).
 *   2. They are CHECKED AGAIN as it resolves (CR 608.2b): an illegal one binds to nothing, and when all are illegal
 *      the spell does nothing and leaves the stack `hasFizzled`.
 *   3. A spell's SCRIPT runs at resolution, through the resolution queue, and an effect that asks a question stops
 *      it there: the spell stays on the stack, nobody holds priority, and the answer finishes it.
 *   4. After anything resolves, STATE-BASED ACTIONS and waiting TRIGGERS come before priority (CR 117.5).
 *   5. NON-MANA ACTIVATED ABILITIES (CR 602) are offered when every cost can be paid, go on the stack before their
 *      costs are paid, and carry their effects with them, so one that sacrificed its source still resolves.
 *   6. A scripted TRIGGER carries its effects to the stack the same way.
 *   7. The schema knows "any target" (`anyOf`) and refuses an effect naming a target its ability never declared.
 *   8. The house pilot aims: removal at an opponent's things, never a removal spell at its own.
 */
import assert from "node:assert/strict";
import {createState, addObject, cardsIn} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {resolveTop, stackProjection} from "../game/engine/rules/stack.mjs";
import {collectTriggers, openTriggers} from "../game/engine/rules/trigger.mjs";
import {resolutionPending} from "../game/engine/script/resolution.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {validateScript, SCRIPT_SCHEMA} from "../game/engine/script/schema.mjs";
import {
  targetChoices, targetCandidates, stillLegal, recheckTargets, bindEffect, targetRefs, isHostile, TARGET_CHOICES_MAX,
} from "../game/engine/script/bind.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const throws = (f, re, m) => { assert.throws(f, re, m); checks += 1; };

const MOUNTAIN = {card: "Mountain", types: ["Land"], abilities: [{id: "t-r", kind: "mana", tapSelf: true, produces: {R: 1}}]};
const SWAMP = {card: "Swamp", types: ["Land"], abilities: [{id: "t-b", kind: "mana", tapSelf: true, produces: {B: 1}}]};
const BEARS = {card: "Grizzly Bears", types: ["Creature"], manaCost: "{1}{G}", power: 2, toughness: 2};
const SCOUT = {card: "Gladecover Scout", types: ["Creature"], manaCost: "{G}", power: 1, toughness: 1, keywords: ["Hexproof"]};
const RAM = {card: "Nyx-Fleece Ram", types: ["Enchantment", "Creature"], manaCost: "{1}{W}", power: 0, toughness: 5};
const ANY = {anyOf: [{what: "permanent", types: ["Creature"]}, {what: "player"}]};
const BOLT = {card: "Lightning Bolt", types: ["Instant"], manaCost: "{R}",
  spell: {id: "a0", text: "Lightning Bolt deals 3 damage to any target.", targets: [ANY],
    effects: [{effect: "dealDamage", amount: 3, targets: {target: 0}, who: {target: 0}}]}};
const SHOCK_TWO = {card: "Twin Shock", types: ["Sorcery"], manaCost: "{R}",
  spell: {id: "a0", text: "Twin Shock deals 1 damage to each of two targets.", targets: [ANY, ANY],
    effects: [{effect: "dealDamage", amount: 1, targets: {target: 0}, who: {target: 0}}, {effect: "dealDamage", amount: 1, targets: {target: 1}, who: {target: 1}}]}};
const PEEK = {card: "Peek Ahead", types: ["Sorcery"], manaCost: "{B}",
  spell: {id: "a0", text: "Scry 1, then draw a card.", targets: [], effects: [{effect: "scry", count: 1}, {effect: "draw", count: 1}]}};

const pod = {matchId: "m", seed: "s", players: [{name: "Rob"}, {name: "Maya"}]};
function table() {
  const s = createState(pod);
  for (let seat = 0; seat < 2; seat += 1)
    for (let i = 0; i < 20; i += 1) addObject(s, {card: `L${seat}-${i}`, types: ["Land"], owner: seat, controller: seat}, "library", seat);
  return s;
}
const on = (s, object, seat, zone = "battlefield") => addObject(s, {...object, owner: seat, controller: seat}, zone, zone === "battlefield" ? null : seat);
/* Into the first main phase of turn 1, seat 0 holding priority. */
function main(s) {
  beginGame(s);
  for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s);
  return s;
}
const offers = (s, kind, card, seat = 0) => legalActions(s, seat).filter((a) => a.kind === kind && (!card || a.label === card));
const tapAll = (s, seat = 0) => { for (const a of offers(s, "activate-mana", null, seat)) applyAction(s, seat, a); };
const passRound = (s) => { const out = []; for (let n = 0; n < 2 && s.priorityPlayer !== null; n += 1) out.push(passPriority(s)); return out; };
const names = (s, zone, seat) => cardsIn(s, zone, seat).map((id) => s.objects[id].card).sort();

/* ---- 1. targets: the choices, the recheck, the binding ---- */
{
  const s = table();
  const bears = on(s, BEARS, 1), ram = on(s, RAM, 1), mine = on(s, SCOUT, 0), theirs = on(s, SCOUT, 1);
  main(s);
  const ctx = {controller: 0, source: null};
  eq(targetChoices(s, [], ctx), [[]], "an ability with no targets has exactly one way to choose them: nothing");
  const creature = {what: "permanent", types: ["Creature"]};
  const one = targetChoices(s, [creature], ctx).map((c) => c[0].id);
  ok(one.includes(bears) && one.includes(ram) && one.includes(mine) && !one.includes(theirs),
    "every creature is a choice but an opponent's hexproof one: each alternative targets, so hexproof applies without the script saying so (CR 702.11b)");
  const both = targetCandidates(s, {anyOf: [creature, {what: "permanent", types: ["Enchantment"]}]}, ctx);
  eq(both.filter((c) => c.id === ram).length, 1, "a permanent that is both a creature and an enchantment is one choice, not two");
  eq(targetChoices(s, [ANY, ANY], ctx).length, (one.length + 2) ** 2,
    "two targets are the product of their choices: CR 601.2c lets one object be chosen for each instance of the word");
  eq(targetChoices(s, [{what: "permanent", types: ["Planeswalker"]}], ctx), [], "a target with no legal choice leaves no way to choose");
  ok(TARGET_CHOICES_MAX >= 1000, "and the product is bounded, so a pathological card is refused at prepare rather than enumerated forever");

  ok(stillLegal(s, creature, {kind: "object", id: bears}, ctx), "a creature still on the battlefield is still a legal target");
  s.objects[bears].keywords.push("Shroud");
  ok(!stillLegal(s, creature, {kind: "object", id: bears}, ctx), "one that gained shroud is not (CR 608.2b)");
  s.objects[bears].keywords.pop();
  s.players[1].lost = true;
  ok(!stillLegal(s, ANY, {kind: "player", id: 1}, ctx), "a player who has left the game is not a legal target (CR 800.4a)");
  s.players[1].lost = false;
  eq(recheckTargets(s, [creature, creature], [{kind: "object", id: bears}, {kind: "object", id: 999}], ctx),
    {targets: [{kind: "object", id: bears}, null], fizzles: false}, "one target gone of two: that one is null, and the spell still resolves");
  eq(recheckTargets(s, [creature], [{kind: "object", id: 999}], ctx).fizzles, true, "its only target gone: it does nothing (CR 608.2b)");
  eq(recheckTargets(s, [], [], ctx).fizzles, false, "and a spell with no targets never fizzles for want of them");

  const bctx = {controller: 0, source: 7, targets: [{kind: "object", id: bears}, {kind: "player", id: 1}, null]};
  eq(bindEffect({effect: "destroy", targets: {target: 0}}, bctx).targets, [bears], "{target: n} in `targets` binds to the chosen object");
  eq(bindEffect({effect: "destroy", targets: {target: 1}}, bctx).targets, [], "a player chosen for it binds no object");
  eq(bindEffect({effect: "draw", who: {target: 1}}, bctx).who, [1], "{target: n} in `who` binds to the chosen player");
  eq(bindEffect({effect: "draw", who: {target: 0}}, bctx).who, [], "and an object chosen for it binds no player");
  eq(bindEffect({effect: "dealDamage", toPlayer: {target: 1}}, bctx).toPlayer, 1, "`toPlayer` binds to the one player");
  ok(!("toPlayer" in bindEffect({effect: "dealDamage", toPlayer: {target: 2}}, bctx)), "and to nothing when the target became illegal");
  eq(bindEffect({effect: "putCounter", targets: "self"}, bctx).targets, [7], "\"self\" is the card the ability is on");
  eq(bindEffect({effect: "draw", count: 2, who: "opponent"}, bctx), {effect: "draw", count: 2, who: "opponent"}, "anything else passes through untouched");
  const bound = bindEffect({effect: "destroy", targets: {target: 0}}, bctx);
  eq(bindEffect(bound, bctx), bound, "binding twice is binding once: an effect bound before a question is not bound again into nothing");
  eq(targetRefs([{effect: "modal", modes: [{effects: [{effect: "destroy", targets: {target: 1}}]}]}]), [1], "a reference inside a mode is found");
  ok(isHostile(BOLT.spell.effects) && !isHostile([{effect: "pump", targets: {target: 0}, power: 2}]), "damage is hostile; a pump is not");
}

/* ---- 2. the schema: any target, and no reference to a target nobody declared ---- */
{
  const card = (abilities) => ({schema: SCRIPT_SCHEMA, identity: {name: "X", oracleId: "x", types: ["Instant"], manaCost: "{R}"}, abilities});
  eq(validateScript(card([{kind: "spell", text: "X deals 3 damage to any target.", targets: [ANY], effects: BOLT.spell.effects}])).errors, [],
    "\"any target\" is a choice of selectors, and validates");
  ok(!validateScript(card([{kind: "spell", text: "x", targets: [{anyOf: [], what: "player"}], effects: [{effect: "draw"}]}])).valid,
    "a choice with no alternatives, or with anything beside them, does not");
  const wrong = validateScript(card([{kind: "spell", text: "x", targets: [ANY], effects: [{effect: "destroy", targets: {target: 1}}]}]));
  ok(!wrong.valid && /names target 1/.test(wrong.errors[0].message), "an effect naming target 1 of an ability declaring one is refused: it would bind to nothing, silently");
}

/* ---- 3. a cast is offered once per way to aim it, and the aim is part of the offer ---- */
{
  const s = table();
  const bears = on(s, BEARS, 1);
  on(s, SCOUT, 1);
  on(s, MOUNTAIN, 0);
  on(s, BOLT, 0, "hand");
  main(s);
  eq(offers(s, "cast", "Lightning Bolt").length, 0, "no mana, no cast");
  tapAll(s);
  const bolts = offers(s, "cast", "Lightning Bolt");
  eq(bolts.map((a) => a.targetNames.join()).sort(), ["Grizzly Bears", "Maya", "Rob"],
    "the Bolt is offered at the Bears and at each player, and not at the opponent's hexproof Scout");
  ok(bolts.every((a) => a.label === "Lightning Bolt" && a.hostile === true), "each offer is labeled with the card, and marked hostile for a pilot to aim");
  throws(() => applyAction(s, 0, {...bolts[0], targets: [{kind: "object", id: 12345}]}), /not a legal action/,
    "naming a target the engine did not offer is refused: the aim is part of what was offered");
  const at = bolts.find((a) => a.targetNames[0] === "Grizzly Bears");
  const events = applyAction(s, 0, JSON.parse(JSON.stringify(at)));
  ok(events.some((e) => e.kind === "GameEventSpellAbilityCast" && e.data.fields.targetDescription === "Grizzly Bears"),
    "a copy of the offer from across a network is accepted, and the cast says what it is aimed at");
  eq(s.stack[0].targets, [{kind: "object", id: bears}], "the stack entry holds the chosen target as plain data");
  eq(projectFor(s, 1).stack[0].targets, [{kind: "object", id: bears}], "and every seat sees it: a target is public (CR 601.2c)");
  ok(!("script" in stackProjection(s)[0]), "what a stack entry carries for the rules is not in what a caller sees");

  /* 4. Everyone passes: the Bolt resolves, and the Bears are in the graveyard before anyone may act. */
  const [first, second] = passRound(s);
  eq([first.outcome, second.outcome], ["passed", "resolved"], "a round of passes resolves the top of the stack");
  eq(names(s, "graveyard", 1), ["Grizzly Bears"],
    "the Bears died as a state-based action before priority came back (CR 117.5, 704.5g): nobody can act with a dead creature on the board");
  eq(names(s, "graveyard", 0), ["Lightning Bolt"], "and the Bolt went to its owner's graveyard");
  eq(s.priorityPlayer, 0, "then the active player receives priority (CR 117.3b)");
}

/* ---- 3b. two targets: one gone, the other still hit ---- */
{
  const s = table();
  const bears = on(s, BEARS, 1);
  on(s, MOUNTAIN, 0);
  on(s, SHOCK_TWO, 0, "hand");
  main(s);
  tapAll(s);
  const shock = offers(s, "cast", "Twin Shock").find((a) => a.targets[0].id === bears && a.targets[1].kind === "player" && a.targets[1].id === 1);
  applyAction(s, 0, shock);
  s.objects[bears].keywords.push("Shroud");
  passRound(s);
  eq([s.objects[bears]?.damage ?? null, s.players[1].life], [0, 39], "its first target became illegal and took nothing; the second still took its damage");
}

/* ---- 3c. the only target gone: the spell does nothing, says so, and goes to the graveyard ---- */
{
  const s = table();
  const bears = on(s, BEARS, 1);
  on(s, MOUNTAIN, 0);
  on(s, BOLT, 0, "hand");
  main(s);
  tapAll(s);
  applyAction(s, 0, offers(s, "cast", "Lightning Bolt").find((a) => a.targets[0].id === bears));
  s.objects[bears].keywords.push("Shroud");
  const resolved = passRound(s).flatMap((r) => r.events).find((e) => e.kind === "GameEventSpellResolved");
  eq(resolved.data.fields.hasFizzled, true, "its only target illegal, the Bolt does not resolve (CR 608.2b), and the event says so");
  eq([s.players[1].life, names(s, "graveyard", 0)], [40, ["Lightning Bolt"]], "nobody took the damage, and it is in the graveyard all the same");
}

/* ---- 3d. a spell with a target and no legal choice is never offered ---- */
{
  const s = table();
  on(s, SCOUT, 1);
  on(s, MOUNTAIN, 0);
  on(s, {...BOLT, card: "Zap Creature", spell: {...BOLT.spell, targets: [{what: "permanent", types: ["Creature"]}]}}, 0, "hand");
  main(s);
  tapAll(s);
  eq(offers(s, "cast", "Zap Creature").length, 0, "a creature-only removal spell with only a hexproof opponent's creature to aim at is not offered (CR 601.2c)");
}

/* ---- 5. a resolution that asks: the spell waits on the stack, nobody holds priority, the answer finishes it ---- */
{
  const s = table();
  on(s, SWAMP, 0);
  on(s, PEEK, 0, "hand");
  main(s);
  tapAll(s);
  const top = s.objects[cardsIn(s, "library", 0)[0]].card;
  applyAction(s, 0, offers(s, "cast", "Peek Ahead")[0]);
  const [, last] = passRound(s);
  eq(last.outcome, "resolving", "the round of passes began the resolution, and the scry stopped it");
  eq([s.stack.length, s.stack[0].stage, s.objects[s.stack[0].objectId].zone], [1, "resolving", "stack"],
    "the spell is still on the stack, marked resolving (CR 608.2: it is mid-resolution, not resolved)");
  eq([s.priorityPlayer, s.awaiting.kind, s.awaiting.player], [null, "effect-choice", 0], "nobody holds priority; its controller is asked");
  eq(names(s, "hand", 0), [], "and the draw behind the scry has not happened");
  throws(() => resolveTop(s), /already resolving/, "nothing can resolve it a second time while it waits");
  eq(awaitingChoice(s).title, "Scry 1: choose any to put on the bottom", "the question is the scry's");
  const events = resolveAwaiting(s, []);
  eq([s.stack.length, names(s, "graveyard", 0), names(s, "hand", 0)], [0, ["Peek Ahead"], [top]],
    "the answer finishes it: the draw happens, then the spell leaves the stack for the graveyard");
  ok(events.some((e) => e.kind === "GameEventSpellResolved"), "and its resolution is reported once it is over");
  eq([resolutionPending(s), s.priorityPlayer], [false, 0], "and the active player receives priority");
}

/* ---- 4b. a permanent's "when this enters" goes on the stack before anyone receives priority ---- */
{
  const s = table();
  on(s, {card: "Forest", types: ["Land"], abilities: [{id: "t-g", kind: "mana", tapSelf: true, produces: {G: 1}}]}, 0);
  on(s, {card: "Seer", types: ["Creature"], manaCost: "{G}", power: 1, toughness: 1,
    abilities: [{id: "a0", kind: "triggered", text: "When this creature enters, draw a card.", trigger: {on: "GameEventCardChangeZone", to: "Battlefield", who: "self"},
      effects: [{effect: "draw", count: 1}]}]}, 0, "hand");
  main(s);
  tapAll(s);
  applyAction(s, 0, offers(s, "cast", "Seer")[0]);
  passRound(s);
  eq([s.stack.length, s.stack[0].kind, s.priorityPlayer], [1, "trigger", 0],
    "the creature's own enters trigger found it (the new object, CR 400.7) and is on the stack as priority returns");
  passRound(s);
  eq(names(s, "hand", 0).length, 1, "and resolving it ran the script it carried: a card drawn");
}

/* ---- 6. a scripted trigger whose source has gone still resolves (CR 113.7a) ---- */
{
  const s = table();
  const dier = on(s, {card: "Doomed Seer", types: ["Creature"], power: 1, toughness: 1,
    abilities: [{id: "a0", kind: "triggered", text: "When this creature dies, draw a card.",
      trigger: {on: "GameEventCardChangeZone", from: "Battlefield", to: "Graveyard", who: "self"}, effects: [{effect: "draw", count: 1}]}]}, 0);
  main(s);
  const events = [];
  s.objects[dier].damage = 5;
  const {checkStateBasedActions} = await import("../game/engine/rules/sba.mjs");
  events.push(...checkStateBasedActions(s));
  collectTriggers(s, events);
  openTriggers(s);
  eq([s.stack.length, s.stack[0].cardId], [1, null], "the dies trigger is on the stack with no source left on the battlefield");
  passRound(s);
  eq(names(s, "hand", 0).length, 1, "and it resolves from the script it carried");
}

/* ---- 5. activated abilities: offered when every cost can be paid, and paid after going on the stack ---- */
{
  const kami = {card: "Kami", types: ["Creature"], manaCost: "{1}{W}", power: 2, toughness: 2,
    abilities: [{id: "a0", kind: "activated", text: "Sacrifice this creature: Destroy target enchantment.", cost: [{atom: "sacrifice", self: true}],
      targets: [{what: "permanent", types: ["Enchantment"]}], effects: [{effect: "destroy", targets: {target: 0}}]}]};
  const s = table();
  const k = on(s, kami, 0);
  const ram = on(s, RAM, 1);
  main(s);
  const act = offers(s, "activate", "Kami");
  eq(act.map((a) => [a.abilityId, a.targets[0].id, a.text]), [["a0", ram, "Sacrifice this creature: Destroy target enchantment."]],
    "the ability is offered at the one enchantment, with its words");
  applyAction(s, 0, act[0]);
  eq([s.objects[k], names(s, "graveyard", 0), s.stack.length, s.stack[0].kind], [undefined, ["Kami"], 1, "ability"],
    "the Kami is sacrificed as the cost, and its ability is on the stack");
  passRound(s);
  eq(names(s, "graveyard", 1), ["Nyx-Fleece Ram"], "the ability resolves with its source gone, from the effects it carried (CR 113.7a)");
}
{
  const ability = (cost, extra = {}) => ({card: "Engine", types: ["Artifact"], manaCost: "{2}",
    abilities: [{id: "a0", kind: "activated", text: "Engine ability.", cost, effects: [{effect: "gainLife", amount: 1}], ...extra}]});
  const s = table();
  on(s, ability([{atom: "{T}"}]), 0);
  const tapped = on(s, ability([{atom: "{T}"}]), 0);
  on(s, ability([{atom: "mana", cost: "{2}"}]), 0);
  on(s, ability([{atom: "payLife", amount: 50}]), 0);
  on(s, ability([{atom: "discard"}]), 0);
  on(s, ability([{atom: "{T}"}], {timing: "sorcery"}), 0);
  const sick = {...ability([{atom: "{T}"}]), card: "Sick Engine", types: ["Creature"], power: 1, toughness: 1};
  main(s);
  on(s, sick, 0);
  s.objects[tapped].tapped = true;
  eq(offers(s, "activate", "Engine").length, 2,
    "of six abilities, two are offered: {T} untapped, and sorcery-speed {T} in a main phase; not {T} when tapped, {2} with no mana, 50 life from 40, or a cost atom nothing pays");
  eq(offers(s, "activate", "Sick Engine").length, 0, "a creature's {T} ability waits out summoning sickness (CR 302.6)");
  const before = s.players[0].life;
  applyAction(s, 0, offers(s, "activate", "Engine")[0]);
  passRound(s);
  eq(s.players[0].life, before + 1, "an activated ability resolves its effects");
  advance(s);
  eq(offers(s, "activate", "Engine").filter((a) => a.abilityId === "a0").length, 0, "in combat, the tapped one and the sorcery-speed one are both gone");
}

{
  /* CR 119.4: a player may pay life equal to their whole life total, and not a point more. */
  const s = table();
  on(s, {card: "Pact", types: ["Artifact"], abilities: [{id: "a0", kind: "activated", text: "Pay 40 life: Draw a card.", cost: [{atom: "payLife", amount: 40}], effects: [{effect: "draw"}]}]}, 0);
  main(s);
  eq(offers(s, "activate", "Pact").length, 1, "paying 40 life at 40 is offered: a player can pay their whole life total (CR 119.4)");
  applyAction(s, 0, offers(s, "activate", "Pact")[0]);
  eq(s.players[0].life, 0, "and it is paid as the ability goes on the stack");
}

/* ---- 8. the house pilot aims ---- */
{
  const s = table();
  const mine = on(s, BEARS, 0), theirs = on(s, BEARS, 1);
  on(s, MOUNTAIN, 0);
  on(s, BOLT, 0, "hand");
  main(s);
  tapAll(s);
  const pilot = housePilot({seat: 0, cards: (name) => (name === "Lightning Bolt" ? {manaValue: 1, types: ["Instant"]} : null)});
  const chosen = pilot.choose(projectFor(s, 0), legalActions(s, 0));
  ok(chosen.kind === "cast" && chosen.targets[0].kind === "player" ? chosen.targets[0].id === 1 : chosen.targets[0].id === theirs,
    "with a removal spell, the house pilot aims at the opponent or the opponent's creature");
  ok(!(chosen.targets[0].kind === "object" && chosen.targets[0].id === mine), "never at its own Bears");
}
{
  const s = table();
  on(s, BEARS, 0);
  on(s, MOUNTAIN, 0);
  on(s, {...BOLT, card: "Zap Creature", spell: {...BOLT.spell, targets: [{what: "permanent", types: ["Creature"]}]}}, 0, "hand");
  main(s);
  tapAll(s);
  const pilot = housePilot({seat: 0, cards: () => ({manaValue: 1, types: ["Instant"]})});
  eq(pilot.choose(projectFor(s, 0), legalActions(s, 0)).kind, "pass", "and with only its own creature to aim at, it does not cast it");
}

console.log(`engine-targets: ${checks} checks passed — a cast offered once per aim and checked again as it resolves, a script that stops to ask and finishes, the dead gone before priority, and an ability that outlives its source.`);
