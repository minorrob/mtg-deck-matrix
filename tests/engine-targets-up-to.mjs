/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "UP TO N TARGET ...", "ANY NUMBER OF TARGET ...", "ONE OR TWO TARGET ..." (the plan's X5, its first axis; Forge's
 * TargetMin and TargetMax, counted, never read).
 *
 * One instance of the word "target" with a count (CR 115.1, 601.2c): `count: {min, max}` on the target spec
 * (script/bind.mjs). It is not enumerated as offers -- a board of twenty creatures has 1,351 ways to choose up to three --
 * so the offer holds a placeholder, and once it is taken its controller picks them as a pick-several, nothing moved or
 * paid before the answer ("choose-targets", rules/actions.mjs and rules/trigger.mjs). The same object is not chosen twice
 * for one instance (CR 115.3); as many as the count allows, at least as many as it needs; none chosen is no target at all,
 * so "up to one" with none chosen still resolves (CR 608.2b), and with some chosen it does not resolve only when every
 * one of them is illegal. The house pilot aims a pick-several as it aims a cast; the scenario runner picks a step's list.
 * Named, not built: a count that is X ("up to X target creatures"); a spell with a counted target cast as an effect
 * resolves (castChoicesNow leaves it out); a copy's new list for a counted target (it keeps the original's).
 */
import assert from "node:assert/strict";
import {cardsIn} from "../game/engine/state/index.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction, castChoicesNow} from "../game/engine/rules/actions.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {countWords} from "../game/engine/script/bind.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const throws = (f, re, m) => { assert.throws(f, re, m); checks += 1; };

const index = loadCardIndex();
const CREATURE = {what: "permanent", types: ["Creature"]};
const FIX = {
  "Split Shot": {types: ["Instant"], manaCost: "{R}", colors: ["R"], spell: {id: "s0", text: "Destroy up to two target creatures.",
    targets: [{...CREATURE, count: {max: 2}}], effects: [{effect: "destroy", targets: {target: 0}}]}},
  "Pair Shot": {types: ["Sorcery"], manaCost: "{R}", colors: ["R"], spell: {id: "s0", text: "Destroy one or two target creatures.",
    targets: [{...CREATURE, count: {min: 1, max: 2}}], effects: [{effect: "destroy", targets: {target: 0}}]}},
  "Doom Toll": {types: ["Sorcery"], manaCost: "{B}", colors: ["B"], spell: {id: "s0", text: "Any number of target players each lose 2 life.",
    targets: [{what: "player", count: {}}], effects: [{effect: "loseLife", who: {target: 0}, amount: 2}]}},
  Bear: {types: ["Creature"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Wolf: {types: ["Creature"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Elf: {types: ["Creature"], manaCost: "{G}", colors: ["G"], power: 1, toughness: 1},
  Scout: {types: ["Creature"], manaCost: "{G}", colors: ["G"], power: 1, toughness: 1, keywords: ["Hexproof"]},
  Brute: {types: ["Creature"], manaCost: "{3}{R}", colors: ["R"], power: 4, toughness: 4, keywords: ["Trample", "Haste"]},
};
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const play = (name, setup, steps) => runScenario({name, setup, steps}, index.definition, FIX).state;
const playEvents = (name, setup, steps) => runScenario({name, setup, steps}, index.definition, FIX);
const named = (s, name, zone = "battlefield") => Object.values(s.objects).filter((o) => o.card === name && o.zone === zone);
const ON_BOARD = [at(0, "battlefield", "Mountain", "Elf"), at(1, "battlefield", "Bear", "Wolf", "Scout")];

/* ---- the offer, and the question ---- */
{
  const s = play("the offer", [...ON_BOARD, at(0, "hand", "Split Shot")], [{tap: "Mountain"}]);
  const offers = legalActions(s, 0).filter((a) => a.kind === "cast");
  eq([offers.length, offers[0].targets, offers[0].targetNames], [1, [{kind: "choose", min: 0, max: 2}], ["up to two targets"]],
    "Split Shot is offered once, its counted target a placeholder -- not once per way to choose up to two of four creatures");
  applyAction(s, 0, offers[0]);
  const choice = awaitingChoice(s);
  eq([s.awaiting.kind, choice.mode, choice.min, choice.max, choice.title, choice.options.map((o) => o.label)],
    ["choose-targets", "many", 0, 2, "Split Shot: choose up to two targets", ["Elf", "Bear (Maya's)", "Wolf (Maya's)"]],
    "taken, it asks Rob to pick: a pick-several of every legal target -- Maya's hexproof Scout not among them -- none to two");
  eq([named(s, "Split Shot", "hand").length, s.stack.length, s.players[0].manaPool.R ?? 0, s.priorityPlayer], [1, 0, 1, null],
    "and nothing has moved or been paid before the answer: the card is in his hand, his red mana in his pool, priority with nobody");
  throws(() => resolveAwaiting(s, [1, 1]), /Invalid selection/, "CR 115.3: the same creature is not chosen twice for one target");
  throws(() => resolveAwaiting(s, [0, 1, 2]), /Invalid selection/, "and not three for up to two");
  const cast = resolveAwaiting(s, [1, 2]);
  eq(cast.filter((e) => e.kind === "GameEventBecomesTarget").map((e) => e.data.fields.card.name), ["Bear", "Wolf"],
    "each it picked becomes a target of the spell, one event each (ward watches for it, CR 702.21a)");
  eq([s.stack.length, s.stack[0]?.targets.length, s.stack[0]?.targets[0].map((t) => s.objects[t.id]?.card), s.priorityPlayer], [1, 1, ["Bear", "Wolf"], 0],
    "Bear and Wolf picked: Split Shot is cast at both, one target holding two, and Rob holds priority after it (CR 117.3c)");
}
{
  const s = play("both destroyed", [...ON_BOARD, at(0, "hand", "Split Shot")],
    [{tap: "Mountain"}, {cast: "Split Shot", targets: [[{card: "Bear"}, {card: "Wolf"}]]}, {resolve: true}]);
  eq([named(s, "Bear", "graveyard").length, named(s, "Wolf", "graveyard").length, named(s, "Elf").length], [1, 1, 1], "it resolves: both destroyed, Rob's Elf untouched");
}

/* ---- nothing there to pick ---- */
{
  const s = play("nothing to pick", [at(0, "battlefield", "Mountain"), at(0, "hand", "Split Shot")], [{tap: "Mountain"}]);
  const [offer] = legalActions(s, 0).filter((a) => a.kind === "cast");
  applyAction(s, 0, offer);
  eq([s.awaiting, s.stack.length, s.stack[0]?.targets], [null, 1, [[]]], "with no creature at all, up to two is none: Split Shot is cast at once with no target, nobody asked an empty question");
}

/* ---- none chosen, and the check as it resolves (CR 608.2b) ---- */
{
  const s = play("none", [...ON_BOARD, at(0, "hand", "Split Shot")], [{tap: "Mountain"}, {cast: "Split Shot", targets: [[]]}]);
  eq([s.stack.length, s.stack[0].targets], [1, [[]]], "none picked is an answer: Split Shot is cast with no target");
  const {state: after, events} = playEvents("none, resolved", [...ON_BOARD, at(0, "hand", "Split Shot")], [{tap: "Mountain"}, {cast: "Split Shot", targets: [[]]}, {resolve: true}]);
  eq([named(after, "Split Shot", "graveyard").length, named(after, "Bear").length + named(after, "Wolf").length, events.some((e) => e.data?.fields?.hasFizzled === true)], [1, 2, false],
    "CR 608.2b: with no target it is not a spell whose targets all became illegal -- it resolves, doing nothing, and goes to the graveyard");
}
{
  const s = play("one leaves", [...ON_BOARD, at(0, "hand", "Split Shot")], [{tap: "Mountain"}, {cast: "Split Shot", targets: [[{card: "Bear"}, {card: "Wolf"}]]}]);
  const wolf = named(s, "Wolf")[0].id;
  s.objects[wolf].keywords = ["Hexproof"];
  let events = [];
  for (let n = 0; n < 20 && s.stack.length; n += 1) events.push(...passPriority(s).events);
  eq([named(s, "Bear", "graveyard").length, named(s, "Wolf").length], [1, 1], "CR 608.2b: the Wolf gained hexproof before it resolved -- the Bear is destroyed and the Wolf is not");
  const t = play("both leave", [...ON_BOARD, at(0, "hand", "Split Shot")], [{tap: "Mountain"}, {cast: "Split Shot", targets: [[{card: "Bear"}, {card: "Wolf"}]]}]);
  for (const name of ["Bear", "Wolf"]) t.objects[named(t, name)[0].id].keywords = ["Hexproof"];
  events = [];
  for (let n = 0; n < 20 && t.stack.length; n += 1) events.push(...passPriority(t).events);
  ok(events.some((e) => e.data?.fields?.hasFizzled === true) && named(t, "Bear").length === 1 && named(t, "Wolf").length === 1,
    "and when every one it chose is illegal, it does not resolve");
}

/* ---- the count's bounds ---- */
{
  const s = play("one or two", [...ON_BOARD, at(0, "hand", "Pair Shot")], [{tap: "Mountain"}]);
  const [offer] = legalActions(s, 0).filter((a) => a.kind === "cast");
  applyAction(s, 0, offer);
  eq([awaitingChoice(s).min, awaitingChoice(s).max, awaitingChoice(s).title], [1, 2, "Pair Shot: choose one or two targets"], "\"one or two target creatures\": one at least");
  throws(() => resolveAwaiting(s, []), /Invalid selection/, "so none is refused");
  const lone = play("one or two, none there", [at(0, "battlefield", "Mountain"), at(0, "hand", "Pair Shot")], [{tap: "Mountain"}]);
  eq(legalActions(lone, 0).filter((a) => a.kind === "cast").length, 0, "CR 601.2c: with no creature at all it cannot be cast, and is not offered");
}
{
  const s = play("crafted", [...ON_BOARD, at(0, "hand", "Split Shot")], [{tap: "Mountain"}]);
  const [offer] = legalActions(s, 0).filter((a) => a.kind === "cast");
  const bear = {kind: "object", id: named(s, "Bear")[0].id}, scout = {kind: "object", id: named(s, "Scout")[0].id};
  throws(() => applyAction(s, 0, {...offer, targets: [[bear, bear]]}), /up to two targets/, "an offer sent with its list made up is checked: the same creature twice is refused");
  throws(() => applyAction(s, 0, {...offer, targets: [[scout]]}), /up to two targets/, "and so is a creature it could not target (hexproof)");
  eq(named(s, "Split Shot", "hand").length, 1, "before anything moved");
}
{
  const s = play("any number of players", [at(0, "battlefield", "Swamp"), at(0, "hand", "Doom Toll")], [{tap: "Swamp"}]);
  const [offer] = legalActions(s, 0).filter((a) => a.kind === "cast");
  applyAction(s, 0, offer);
  eq([awaitingChoice(s).min, awaitingChoice(s).max, awaitingChoice(s).options.map((o) => o.label), awaitingChoice(s).title],
    [0, 2, ["Rob", "Maya"], "Doom Toll: choose any number of targets"], "\"any number of target players\": none to every player there is");
  resolveAwaiting(s, [0, 1]);
  for (let n = 0; n < 20 && s.stack.length; n += 1) passPriority(s);
  eq([s.players[0].life, s.players[1].life], [38, 38], "both chosen, each loses 2");
}

/* ---- a trigger's counted target ---- */
{
  const s = play("Abigale, nothing else there", [at(0, "battlefield", "Plains", "Plains"), at(0, "hand", "Abigale, Eloquent First-Year")],
    [{tap: "Plains"}, {tap: "Plains"}, {cast: "Abigale, Eloquent First-Year"}, {resolve: true}]);
  eq([s.awaiting, s.stack.length], [null, 1], "Abigale's \"up to one other target creature\" with no other creature: not asked -- chosen as nothing -- and the trigger waits on the stack");
  const t = play("Abigale, a Bear there", [at(0, "battlefield", "Plains", "Plains"), at(0, "hand", "Abigale, Eloquent First-Year"), at(1, "battlefield", "Bear")],
    [{tap: "Plains"}, {tap: "Plains"}, {cast: "Abigale, Eloquent First-Year"}, {resolve: true}]);
  eq([t.awaiting?.kind, t.awaiting?.stackId !== undefined, awaitingChoice(t).options.map((o) => o.label)], ["choose-targets", true, ["Bear (Maya's)"]],
    "with Maya's Bear there, the trigger asks for it as a pick-several once it is on the stack -- never Abigale herself (\"other\")");
}

/* ---- a copy, a new target, a lasting change ---- */
Object.assign(FIX, {
  "Echo Spell": {types: ["Instant"], manaCost: "{U}", colors: ["U"], spell: {id: "s0", text: "Copy target instant or sorcery spell. You may choose new targets for the copy.",
    targets: [{anyOf: [{what: "spell", types: ["Instant"]}, {what: "spell", types: ["Sorcery"]}]}], effects: [{effect: "copySpell", spells: {target: 0}, newTargets: true}]}},
});
{
  const s = play("a copy", [at(0, "battlefield", "Mountain", "Island"), at(0, "hand", "Split Shot", "Echo Spell"), at(1, "battlefield", "Bear", "Wolf")],
    [{tap: "Mountain"}, {cast: "Split Shot", targets: [[{card: "Bear"}, {card: "Wolf"}]]}, {tap: "Island"}, {cast: "Echo Spell", targets: [{card: "Split Shot"}]}, {resolve: true}]);
  const copy = s.stack.find((e) => e.copy === true || (e.objectId !== null && s.objects[e.objectId]?.copy === true)) ?? s.stack[s.stack.length - 1];
  eq([s.awaiting, s.stack.length, copy.targets[0].map((t) => s.objects[t.id].card)], [null, 2, ["Bear", "Wolf"]],
    "named: a copy of Split Shot keeps its list -- a new list for a counted target is not asked yet -- and nothing else is asked");
}
{
  const misdirect = [at(0, "battlefield", "Mountain", "Island", "Island", "Wastes", "Wastes", "Wastes"), at(0, "hand", "Split Shot", "Misdirection"), at(1, "battlefield", "Bear", "Wolf")];
  const lands = ["Island", "Island", "Wastes", "Wastes", "Wastes"].map((land) => ({tap: land}));
  const moved = play("Misdirection, one chosen, moved", misdirect, [{tap: "Mountain"}, {cast: "Split Shot", targets: [[{card: "Bear"}]]}, ...lands,
    {cast: "Misdirection", targets: [{card: "Split Shot"}]}, {resolve: true}, {choose: ["Wolf"]}]);
  eq(moved.stack[0].targets.map((t) => (Array.isArray(t) ? t.map((x) => moved.objects[x.id].card) : "not a list")), [["Wolf"]], "the new target is still its counted target's list, holding the Wolf");
  const one = play("Misdirection, one chosen", misdirect, [{tap: "Mountain"}, {cast: "Split Shot", targets: [[{card: "Bear"}]]}, ...lands,
    {cast: "Misdirection", targets: [{card: "Split Shot"}]}, {resolve: true}, {choose: ["Wolf"]}, {resolve: true}]);
  eq([named(one, "Wolf", "graveyard").length, named(one, "Bear").length], [1, 1], "Split Shot with one chosen is a spell with a single target: Misdirection moves it to the Wolf, which is destroyed instead");
  const two = play("Misdirection, two chosen", misdirect, [{tap: "Mountain"}, {cast: "Split Shot", targets: [[{card: "Bear"}, {card: "Wolf"}]]}, ...lands]);
  eq(legalActions(two, 0).filter((a) => a.kind === "cast" && a.label === "Misdirection").length, 0, "with two chosen it has two targets, not a single one: Misdirection has nothing to aim at");
}
{
  const s = play("Abigale, the next turn", [at(0, "battlefield", "Plains", "Plains"), at(0, "hand", "Abigale, Eloquent First-Year"), at(1, "battlefield", "Brute")],
    [{tap: "Plains"}, {tap: "Plains"}, {cast: "Abigale, Eloquent First-Year"}, {resolve: true}, {choose: ["Brute (Maya's)"]}, {resolve: true}, {to: {turn: 3, phase: "MAIN1"}},
      {expect: [{seat: 1, keywords: {card: "Brute", has: ["Flying", "First Strike", "Lifelink"], lacks: ["Trample", "Haste"]}}]}]);
  eq(s.turn, 3, "Abigale's \"loses all abilities\" has no duration: on the next turns the Brute still has only its counters' keywords (CR 611.2a)");
}

/* ---- the house pilot ---- */
{
  const s = play("the pilot", [...ON_BOARD, at(0, "hand", "Split Shot")], [{tap: "Mountain"}]);
  const pilot = housePilot({seat: 0, cards: (name) => FIX[name] ?? index.definition(name)});
  const pick = pilot.choose(projectFor(s, 0), legalActions(s, 0));
  eq(pick.kind, "cast", "the house pilot takes Split Shot's offer: its targets are picked next");
  applyAction(s, 0, pick);
  const answer = pilot.answer(projectFor(s, 0), awaitingChoice(s));
  eq(answer.indices.map((i) => awaitingChoice(s).options[i].label), ["Bear (Maya's)", "Wolf (Maya's)"], "and aims the removal at Maya's two creatures, never its own Elf");
}

/* ---- the words, the schema, what is named ---- */
eq([countWords({min: 0, max: 1}), countWords({min: 0, max: 3}), countWords({min: 0, max: null}), countWords({min: 1, max: 2}), countWords({min: 2, max: 2})],
  ["up to one target", "up to three targets", "any number of targets", "one or two targets", "two targets"], "the count said as a card says it");
{
  const script = (count) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "00000000-0000-4000-8000-000000000000", types: ["Instant"], manaCost: "{R}"}, oracleText: "Destroy up to two target creatures.", source: "hand",
    abilities: [{kind: "spell", text: "Destroy up to two target creatures.", targets: [{...CREATURE, count}], effects: [{effect: "destroy", targets: {target: 0}}]}]});
  ok(validateScript(script({max: 2})).valid && validateScript(script({min: 1, max: 2})).valid && validateScript(script({})).valid, "the schema takes a count: {max}, {min, max}, {} for any number");
  for (const bad of [{max: 0}, {min: 3, max: 2}, {min: -1}, {max: 1.5}, {most: 2}])
    ok(!validateScript(script(bad)).valid, `and refuses ${JSON.stringify(bad)}`);
}
{
  const s = play("cast by an effect", [...ON_BOARD, at(0, "hand", "Split Shot")], []);
  eq(castChoicesNow(s, 0, named(s, "Split Shot", "hand")[0].id), [], "named: a spell with a counted target is not cast as an effect resolves yet -- castChoicesNow leaves it out");
}
eq(missingFor({options: ["TargetMin", "TargetMax"]}), [], "the catalog credits TargetMin and TargetMax");
for (const name of ["Nightmare Sower", "Abigale, Eloquent First-Year", "Force of Vigor", "Displace"])
  ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-targets-up-to: ${checks} checks passed -- a counted target is offered once and picked as a pick-several before anything moves, none twice, within its count; none chosen still resolves, all illegal does not; triggers ask it on the stack; the pilot aims it.`);
