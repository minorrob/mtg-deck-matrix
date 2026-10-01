/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* ENGINE 2.4c: A TRIGGER'S TARGETS, COUNTERING A SPELL, ANOTHER CREATURE ENTERING, AND "NON-".
 *
 *   1. A triggered ability's targets are chosen as it goes on the stack, by its controller, before anyone receives
 *      priority (CR 603.3d): a `trigger-targets` question offering each legal way to aim it. One with no legal
 *      target is removed from the stack rather than left there to fizzle. Several are asked lowest first.
 *   2. "Counter target spell": a script names the spell by `spells: {target: n}`, bound to the spell's object on the
 *      stack; it leaves the stack for its owner's graveyard, never resolving.
 *   3. "Whenever another creature enters": `who: "another"` skips the permanent's own arrival, and `filter` is the
 *      selector the arrival must match, "you" being the trigger's controller. A token's arrival counts.
 *   4. `nonTypes` and `nonSubtypes`: "nonartifact creature" (an artifact creature is an artifact, CR 205.2b), "non-Elf".
 *   5. The house pilot aims a trigger as it aims a spell.
 */
import assert from "node:assert/strict";
import {createState, addObject, cardsIn} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {selectMatching} from "../game/engine/script/filter.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const throws = (f, re, m) => { assert.throws(f, re, m); checks += 1; };

const WASTES = {card: "Wastes", types: ["Land"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const BEARS = {card: "Bears", types: ["Creature"], manaCost: "{C}", power: 2, toughness: 2};
const SORC = {card: "Sorc", types: ["Sorcery"], manaCost: "{C}", spell: {id: "s", text: "Draw a card.", targets: [], effects: [{effect: "draw"}]}};
const COUNTER = {card: "Counter", types: ["Instant"], manaCost: "{C}",
  spell: {id: "s", text: "Counter target spell.", targets: [{what: "spell"}], effects: [{effect: "counterSpell", spells: {target: 0}}]}};
/* "When this creature enters, destroy target creature an opponent controls." */
const ASSASSIN = (name = "Assassin") => ({card: name, types: ["Creature"], manaCost: "{C}", power: 1, toughness: 1,
  abilities: [{id: "t0", kind: "triggered", text: "When this creature enters, destroy target creature an opponent controls.",
    trigger: {on: "GameEventCardChangeZone", to: "Battlefield", who: "self"}, targets: [{what: "permanent", types: ["Creature"], controller: "opponent"}],
    effects: [{effect: "destroy", targets: {target: 0}}]}]});
const WARDEN = {card: "Warden", types: ["Creature"], manaCost: "{C}", power: 1, toughness: 1,
  abilities: [{id: "t0", kind: "triggered", text: "Whenever another creature you control enters, you gain 1 life.",
    trigger: {on: "GameEventCardChangeZone", to: "Battlefield", who: "another", filter: {what: "permanent", types: ["Creature"], controller: "you"}},
    effects: [{effect: "gainLife", amount: 1}]}]};
const TOKENS = {card: "Tokens", types: ["Sorcery"], manaCost: "{C}",
  spell: {id: "s", text: "Create two 1/1 tokens.", targets: [], effects: [{effect: "createToken", count: 2, token: {name: "Goblin", types: ["Creature"], power: 1, toughness: 1}}]}};

const pod = {matchId: "m", seed: "s", players: [{name: "Rob"}, {name: "Maya"}]};
function table() {
  const s = createState(pod);
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 20; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
const on = (s, object, seat, zone = "battlefield") => addObject(s, {...object, owner: seat, controller: seat}, zone, ["battlefield", "exile"].includes(zone) ? null : seat);
function main(s) { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; }
const offers = (s, kind, card, seat = 0) => legalActions(s, seat).filter((a) => a.kind === kind && (!card || a.label === card));
const tap = (s, seat = 0, n = 1) => { for (let i = 0; i < n; i += 1) applyAction(s, seat, offers(s, "activate-mana", "Wastes", seat)[0]); };
const passRound = (s) => { const out = []; for (let n = 0; n < 2 && s.priorityPlayer !== null; n += 1) out.push(passPriority(s)); return out; };
const names = (s, zone, seat) => cardsIn(s, zone, seat).map((id) => s.objects[id].card).sort();

/* ---- 1. a trigger's targets ---- */
{
  const s = table();
  on(s, WASTES, 0);
  on(s, ASSASSIN(), 0, "hand");
  const theirs = on(s, BEARS, 1), other = on(s, {...BEARS, card: "Other Bears"}, 1);
  on(s, {...BEARS, card: "My Bears"}, 0);
  main(s);
  tap(s);
  applyAction(s, 0, offers(s, "cast", "Assassin")[0]);
  passRound(s);
  eq([s.stack.length, s.stack[0].stage, s.awaiting?.kind, s.awaiting?.player, s.priorityPlayer], [1, "targeting", "trigger-targets", 0, null],
    "the creature enters and its trigger goes on the stack waiting for targets; its controller is asked, and nobody holds priority (CR 603.3d)");
  const choice = awaitingChoice(s);
  eq([choice.mode, choice.options.map((o) => o.label).sort()], ["one", ["Bears", "Other Bears"]],
    "the choice offers each legal aim -- the opponent's creatures, not its controller's own");
  ok(choice.options.every((o) => o.hostile === true && o.targets.length === 1), "each option carries its targets, marked hostile for a pilot");
  throws(() => resolveAwaiting(s, [7]), /Invalid selection/, "an answer outside the choice is refused");
  resolveAwaiting(s, [choice.options.findIndex((o) => o.label === "Other Bears")]);
  eq([s.stack[0].stage, s.stack[0].targets, s.priorityPlayer], ["waiting", [{kind: "object", id: other}], 0],
    "answered, the trigger holds its target and the active player receives priority");
  passRound(s);
  eq([names(s, "graveyard", 1), s.objects[theirs] !== undefined], [["Other Bears"], true], "and it destroys the one chosen");
}
{
  const s = table();
  on(s, WASTES, 0);
  on(s, ASSASSIN(), 0, "hand");
  main(s);
  tap(s);
  applyAction(s, 0, offers(s, "cast", "Assassin")[0]);
  passRound(s);
  eq([s.stack.length, s.awaiting, s.priorityPlayer], [0, null, 0], "with no creature to aim at, the trigger is removed from the stack: nothing is asked, and priority returns (CR 603.3d)");
}
{
  /* Two at once, from two creatures entering together: each is asked for, lowest on the stack first. */
  const s = table();
  const bears = on(s, BEARS, 1);
  main(s);
  const a = on(s, ASSASSIN("First"), 0, "hand"), b = on(s, ASSASSIN("Second"), 0, "hand");
  const {runEffect} = await import("../game/engine/script/effects/index.mjs");
  const {collectTriggers, openTriggers} = await import("../game/engine/rules/trigger.mjs");
  const events = runEffect(s, {effect: "moveZone", targets: [a, b], to: "battlefield"}, {controller: 0});
  collectTriggers(s, events);
  openTriggers(s);
  eq(s.awaiting?.kind, "order-triggers", "two of Rob's triggers at once: he orders them first");
  resolveAwaiting(s, [0, 1]);
  eq([s.awaiting?.kind, s.awaiting?.stackId], ["trigger-targets", s.stack[0].stackId], "then the lowest on the stack is aimed first");
  resolveAwaiting(s, [0]);
  eq([s.awaiting?.kind, s.awaiting?.stackId], ["trigger-targets", s.stack[1].stackId], "then the next");
  resolveAwaiting(s, [0]);
  eq([s.awaiting, s.stack.map((e) => e.targets[0].id)], [null, [bears, bears]], "and both hold their target");
}

/* ---- 2. countering a target spell ---- */
{
  const s = table();
  on(s, WASTES, 0);
  on(s, WASTES, 1);
  on(s, SORC, 0, "hand");
  on(s, COUNTER, 1, "hand");
  main(s);
  tap(s);
  applyAction(s, 0, offers(s, "cast", "Sorc")[0]);
  passPriority(s);
  tap(s, 1);
  const counters = offers(s, "cast", "Counter", 1);
  eq(counters.map((a) => a.targetNames), [["Sorc"]], "Maya's Counter is offered at the one spell on the stack");
  applyAction(s, 1, counters[0]);
  const events = passRound(s).flatMap((r) => r.events);
  ok(events.some((e) => e.kind === "GameEventSpellResolved" && e.data.fields.countered === true), "the Counter resolves and counters the sorcery");
  eq([names(s, "graveyard", 0), names(s, "graveyard", 1), names(s, "hand", 0), s.stack.length], [["Sorc"], ["Counter"], [], 0],
    "the sorcery went to its owner's graveyard without resolving -- no card drawn -- and the Counter to Maya's");
}

/* ---- 3. another creature entering ---- */
{
  const s = table();
  on(s, WARDEN, 0);
  on(s, WASTES, 0);
  on(s, WASTES, 0);
  on(s, BEARS, 0, "hand");
  on(s, TOKENS, 0, "hand");
  main(s);
  tap(s);
  applyAction(s, 0, offers(s, "cast", "Bears")[0]);
  passRound(s);
  eq(s.stack.length, 1, "another creature of Rob's enters: the Warden triggers");
  passRound(s);
  eq(s.players[0].life, 41, "and he gains the life");
  tap(s);
  applyAction(s, 0, offers(s, "cast", "Tokens")[0]);
  passRound(s);
  eq(s.awaiting?.kind, "order-triggers", "two tokens entering are two creatures entering: it triggers for each, and two of Rob's at once are his to order (CR 603.3b)");
  resolveAwaiting(s, [0, 1]);
  eq(s.stack.length, 2, "ordered, both are on the stack");
  passRound(s);
  passRound(s);
  eq(s.players[0].life, 43, "two more life");
}
{
  const s = table();
  on(s, WARDEN, 0, "hand");
  on(s, WASTES, 0);
  on(s, WARDEN, 1);
  main(s);
  tap(s);
  applyAction(s, 0, offers(s, "cast", "Warden")[0]);
  passRound(s);
  eq([s.stack.length, s.players[0].life, s.players[1].life], [0, 40, 40],
    "a Warden entering triggers neither itself (\"another\") nor Maya's (\"a creature you control\": not hers)");
}

/* ---- 4. non- ---- */
{
  const s = table();
  const bears = on(s, BEARS, 1), myr = on(s, {card: "Myr", types: ["Artifact", "Creature"], power: 1, toughness: 1}, 1);
  const elf = on(s, {card: "Elf", types: ["Creature"], subtypes: ["Elf", "Druid"], power: 1, toughness: 1}, 1);
  const land = on(s, WASTES, 1);
  main(s);
  eq(selectMatching(s, {types: ["Creature"], nonTypes: ["Artifact"]}).sort(), [bears, elf].sort(), "a nonartifact creature is not an artifact creature (CR 205.2b)");
  eq(selectMatching(s, {types: ["Creature"], nonSubtypes: ["Elf"]}).sort(), [bears, myr].sort(), "a non-Elf creature");
  ok(selectMatching(s, {what: "permanent", nonTypes: ["Land"]}).every((id) => id !== land), "a nonland permanent is never a land");
  throws(() => selectMatching(s, {nonTypes: "Land"}), /nonTypes are a list/, "and the lists are lists");
}

/* ---- 5. the house pilot aims a trigger ---- */
{
  const s = table();
  on(s, WASTES, 0);
  const any = ASSASSIN();
  any.abilities[0].targets = [{what: "permanent", types: ["Creature"]}];
  on(s, any, 0, "hand");
  on(s, BEARS, 1);
  on(s, {...BEARS, card: "My Bears"}, 0);
  main(s);
  tap(s);
  applyAction(s, 0, offers(s, "cast", "Assassin")[0]);
  passRound(s);
  const answer = housePilot({seat: 0}).answer(projectFor(s, 0), awaitingChoice(s));
  eq(awaitingChoice(s).options.map((o) => o.label).sort(), ["Assassin", "Bears", "My Bears"], "a trigger that may destroy any creature is offered every one, its own included");
  eq(awaitingChoice(s).options[answer.indices[0]].label, "Bears", "and the house pilot aims it at the opponent's");
}

/* ---- the card script says it so ---- */
{
  const {definition, problems} = compileScript({schema: "CrankCardScript@1", identity: {name: "Snake", oracleId: "x", types: ["Creature"], manaCost: "{U}", power: 2, toughness: 2},
    abilities: [{kind: "triggered", text: "When this creature enters, counter target spell.", trigger: {on: "enters", who: "self"},
      targets: [{what: "spell"}], effects: [{effect: "counterSpell", spells: {target: 0}}]}]});
  eq([problems, definition.abilities[0].targets], [[], [{what: "spell"}]], "a script's trigger with a target compiles, its target carried to the stack");
  const warden = compileScript({schema: "CrankCardScript@1", identity: {name: "W", oracleId: "w", types: ["Creature"], manaCost: "{W}", power: 1, toughness: 1},
    abilities: [{kind: "triggered", text: "Whenever another creature enters, you gain 1 life.", trigger: {on: "enters", who: "another", filter: {types: ["Creature"]}},
      effects: [{effect: "gainLife", amount: 1}]}]});
  eq(warden.definition.abilities[0].trigger, {on: "GameEventCardChangeZone", to: "Battlefield", who: "another", filter: {types: ["Creature"]}},
    "and \"whenever another creature enters\" compiles to the arrival, its filter kept");
}

console.log(`engine-trigger-targets: ${checks} checks passed — a trigger aimed as it goes on the stack or removed when it cannot be, a spell countered by its object, another creature entering, and "non-".`);
