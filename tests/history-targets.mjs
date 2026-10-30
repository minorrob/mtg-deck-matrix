/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* ROB-327: A SPELL'S OR ABILITY'S TARGETS ARE SEEN ON THE STACK, AS IT RESOLVES, AND IN THE HISTORY (the engine and room half).
 *
 * Rob, 2026-10-29/30: "The target of an instant or spell is not seen during resolution (e.g. I might counter it if it's
 * targeting me, but I can't tell) or in the history. It should be."
 *
 * Real cards, played by the engine's own scenario runner (cards/scenario.mjs: the actions the rules offered, by their names), and
 * what the table is told read off the two places it is told it:
 *   - the stack as a seat's view carries it (projection.mjs): each entry's `aimed` (and `aimedModes`), named, or `gone`;
 *   - the history's line for the cast (history.mjs): "Rob cast Lightning Bolt targeting Maya", structured and in order.
 * The five cases of the issue: a one-target spell, a two-target spell, an ability, a spell with no target (says nothing extra), a
 * target that has since left (says so; no stale name) -- and a modal spell, each mode's targets.
 *
 * Each case also names what it must NOT carry: a gone target has no name anywhere, a no-target line has no `targets`.
 */
import assert from "node:assert/strict";
import {loadCardIndex, loadCardScenarios} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {historyLines} from "../game/room/history.mjs";

let checks = 0;
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const ok = (c, m) => {assert.ok(c, m); checks += 1;};

const NAMES = ["Rob", "Maya"];
const index = loadCardIndex();
const files = loadCardScenarios();
const fileOf = (card) => files.find((f) => f.scenarios.card === card).scenarios;
const scenarioOf = (card, name) => fileOf(card).scenarios.find((s) => s.name.startsWith(name));

/* Play a card's scenario, with its steps cut or changed by `edit`. The state is as the last step left it; `lines` are the history's
   lines for every event on the way, in order. */
function play(card, name, edit = (steps) => steps) {
  const file = fileOf(card), scenario = {...structuredClone(scenarioOf(card, name))};
  const cut = edit(scenario.steps);
  if (cut !== scenario.steps) delete scenario.expect;   /* the scenario's closing expectations are about its own ending */
  scenario.steps = cut;
  const {state, events} = runScenario(scenario, index.definition, file.fixtures ?? {});
  return {state, events, lines: events.flatMap((e) => historyLines(e, NAMES))};
}
const withoutEnd = (steps, count = 1) => steps.slice(0, steps.length - count);
const stackOf = (state, seat = 0) => projectFor(state, seat).state ?? projectFor(state, seat);
const cast = (lines, text) => lines.find((l) => l.text === text);
const names = (cards) => (cards ?? []).map((c) => c.name);

/* 1. A ONE-TARGET SPELL: Lightning Bolt at a creature, and at a player. */
{
  const {state, lines} = play("Lightning Bolt", "Three damage kills a 2/2", (steps) => steps.filter((s) => !s.expect).slice(0, -1));
  const entry = projectFor(state, 1).stack[0];
  eq(entry.aimed.map(({id, ...rest}) => rest), [{kind: "object", name: "Grizzly Bears", zone: "battlefield"}], "the stack entry says what the Bolt is aimed at, named, and where it is");
  ok(Number.isInteger(entry.aimed[0].id) && entry.targets[0].id === entry.aimed[0].id, "and the aim is the same object as the engine's own target, a card of the view");
  eq(projectFor(state, 0).stack[0].aimed, entry.aimed, "the same for the other seat: an aim is public");
  const line = cast(lines, "Rob cast Lightning Bolt targeting Grizzly Bears");
  ok(line, "the History's cast line names the target");
  eq([line.actor, line.source.name, names(line.cards), line.targets.map((t) => t.name)], [0, "Lightning Bolt", ["Lightning Bolt", "Grizzly Bears"], ["Grizzly Bears"]], "as data: who, with what, to whom, and the cards named in order");
  eq(line.cards.map((c) => c.ref).every(Number.isInteger), true, "each card named carries its object id");
}
{
  const {state, lines} = play("Lightning Bolt", "Any target: a player", (steps) => steps.filter((s) => !s.expect).slice(0, -1));
  eq(projectFor(state, 0).stack[0].aimed, [{kind: "player", id: 1, name: "Maya"}], "a player is aimed at by name");
  const line = cast(lines, "Rob cast Lightning Bolt targeting Maya");
  ok(line, "the cast line names a player");
  eq([names(line.cards), line.targets], [["Lightning Bolt"], [{kind: "player", id: 1, name: "Maya"}]], "a player is a target, not a card: only the Bolt is hoverable");
}

/* 2. A TWO-TARGET SPELL: Chelonian Tackle pumps one creature, which then fights another. */
{
  const {state, lines} = play("Chelonian Tackle", "Rob's Bear, 2/12", (steps) => withoutEnd(steps));
  eq(projectFor(state, 1).stack[0].aimed.map((a) => a.name), ["Bear", "Big Bear"], "both targets are on the stack entry, in the order chosen");
  const line = cast(lines, "Rob cast Chelonian Tackle targeting Bear and Big Bear");
  ok(line, "the cast line names both, joined");
  eq(names(line.cards), ["Chelonian Tackle", "Bear", "Big Bear"], "and both names are cards to hover");
}

/* 3. AN ABILITY: Prodigal Pyromancer's {T}. */
{
  const bear = {types: ["Creature"], manaCost: "{1}{G}", power: 2, toughness: 2};
  const scenario = {name: "ping", setup: [{seat: 0, zone: "battlefield", cards: ["Prodigal Pyromancer"]}, {seat: 1, zone: "battlefield", cards: ["Bear"]}],
    steps: [{activate: "Prodigal Pyromancer", targets: [{card: "Bear"}]}]};
  const {state, events} = runScenario(scenario, index.definition, {Bear: bear});
  const lines = events.flatMap((e) => historyLines(e, NAMES));
  eq(projectFor(state, 1).stack[0].aimed.map((a) => a.name), ["Bear"], "an ability on the stack says what it is aimed at");
  const line = cast(lines, "Rob activated Prodigal Pyromancer's ability targeting Bear");
  ok(line, "the History has a line for an activated ability, and names its target");
  eq([line.actor, line.source.name, names(line.cards)], [0, "Prodigal Pyromancer", ["Prodigal Pyromancer", "Bear"]], "who, with what, and the two cards to hover");
}

/* 4. A SPELL WITH NO TARGET says nothing extra. */
{
  const {state, lines} = play("Krenko's Command", "Two 1/1 Goblin tokens", (steps) => withoutEnd(steps));
  eq(projectFor(state, 1).stack[0].aimed, [], "an entry with no target is aimed at nothing");
  ok(!("aimedModes" in projectFor(state, 1).stack[0]), "and has no modes of aims");
  const line = cast(lines, "Rob cast Krenko's Command");
  ok(line, "the cast line is as it was: no 'targeting'");
  eq(Object.keys(line).sort(), ["actor", "cards", "source", "text", "turn"], "and carries no targets or modes");
}

/* 5. A MODAL SPELL: each mode's targets. */
{
  const { state, lines } = play("Abrade", "Maya's Rock destroyed", (steps) => withoutEnd(steps));
  const entry = projectFor(state, 1).stack[0];
  eq(entry.aimedModes.map((m) => [m.text, m.aimed.map((a) => a.name)]), [["Destroy target artifact.", ["Rock"]]], "a modal entry says each chosen mode's own words and targets");
  const line = lines.find((l) => l.text.startsWith("Rob cast Abrade"));
  eq(line.text, "Rob cast Abrade: Destroy target artifact. → Rock", "the cast line says the mode and its target");
  eq([line.modes, names(line.cards)], [[{text: "Destroy target artifact.", targets: line.targets}], ["Abrade", "Rock"]], "the structured line has the mode and its cards");
}

/* 6. A TARGET THAT HAS SINCE LEFT: two Bolts at the same Bear; the first kills it, and the second is aimed at nothing that is there. */
{
  const afterFirst = play("Lightning Bolt", "Its target gone", (steps) => withoutEnd(steps));
  const entry = projectFor(afterFirst.state, 1).stack[0];
  eq(entry.aimed.length, 1, "the second Bolt is still aimed at one target");
  eq(entry.aimed[0].gone, true, "...which is said to have gone");
  ok(!("name" in entry.aimed[0]), "with no name to go stale: the Bear's is nowhere in the aim");
  ok(!JSON.stringify(entry.aimed).includes("Grizzly"), "not under any other key either");
  const whole = play("Lightning Bolt", "Its target gone");
  const fizzled = whole.lines.find((l) => /fizzled/.test(l.text));
  eq(fizzled && fizzled.text, "Lightning Bolt fizzled: its target is gone", "the History says the spell did nothing, and not at what");
  ok(!whole.lines.some((l) => /fizzled/.test(l.text) && l.text.includes("Grizzly")), "no stale name on the fizzle line");
  eq(whole.lines.filter((l) => l.text === "Lightning Bolt resolved").length, 1, "the first Bolt resolved; only the second fizzled");
  /* Both casts are still true: they were aimed at the Bear then. */
  eq(whole.lines.filter((l) => l.text === "Rob cast Lightning Bolt targeting Grizzly Bears").length, 2, "the cast lines keep saying what they were aimed at when they were cast");
}

/* 7. A FACE-DOWN OR HIDDEN TARGET IS NEVER NAMED: the aim says it is hidden, the line says "a face-down card". */
{
  const lines = historyLines({kind: "GameEventSpellAbilityCast", data: {turn: 2, phase: "MAIN1", fields: {
    card: {cardId: 9, name: "Doom Blade"}, sa: {isSpell: true}, si: {actor: {playerId: 0}},
    aimed: [{kind: "object", id: 12, name: null, hidden: true}]}}}, NAMES);
  eq(lines[0].text, "Rob cast Doom Blade targeting a face-down card", "a target that cannot be named is not");
  eq(names(lines[0].cards), ["Doom Blade"], "and is not a card to hover");
}

/* 8. A cast event from before this (no `aimed`) reads as it did. */
eq(historyLines({kind: "GameEventSpellAbilityCast", data: {turn: 2, fields: {card: {cardId: 9, name: "Opt"}, sa: {isSpell: true}, si: {actor: {playerId: 1}}}}}, NAMES)[0].text, "Maya cast Opt", "an old cast event reads as it did");

console.log(`history-targets: ${checks} checks passed — a spell's or ability's targets on the stack, named or gone, and on the History's cast line.`);
void stackOf;
