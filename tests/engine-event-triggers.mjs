/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 8 (THE CATALOG'S ORDER): "WHENEVER YOU CAST", "WHENEVER ... ATTACKS", "DEALS COMBAT DAMAGE TO A
 * PLAYER", "WHENEVER ... DRAWS", AND PROLIFERATE ASKED.
 *
 * The engine catalog (docs/engine/catalog.md) put four trigger events at the head of what to build: between them they
 * hold back over four hundred of the most-played cards. Each trigger now says what it is ABOUT -- the spell cast and
 * who cast it, the attacking creature and the player it attacks, the creature that dealt damage and the player dealt
 * it, the player who drew -- and "that player" and "that card" in what it does are that. "Whenever a creature you
 * control attacks" triggers once for each attacker (CR 603.2c). A draw says it is one, so a search into a hand is not
 * (CR 121.1). Proliferate asks which permanents and players (CR 701.34a).
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {characteristicsOf} from "../game/engine/rules/layers.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {collectTriggers} from "../game/engine/rules/trigger.mjs";
import {compileSelector, matchesSelector} from "../game/engine/script/filter.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {smokeScenario} from "../game/engine/cards/compile.mjs";
import {loadCardScripts} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const spell = (name, types, extra = {}) => ({card: name, types, manaCost: "{C}", ...(types.includes("Creature") ? {power: 1, toughness: 1} : {}),
  ...(types.some((t) => t === "Instant" || t === "Sorcery") ? {spell: {id: "s", text: name, targets: [], effects: [{effect: "gainLife", amount: 0}]}} : {}), ...extra});
const watcher = (name, trigger, effects) => ({card: name, types: ["Enchantment"], abilities: [{id: "t0", kind: "triggered", text: name, trigger, effects}]});

const pod = {matchId: "m", seed: "events", players: [{name: "Rob"}, {name: "Maya"}]};
function table() {
  const s = createState(pod);
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 10; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
const on = (s, o, seat, zone = "battlefield") => addObject(s, {...o, owner: seat, controller: seat}, zone, ["battlefield", "exile"].includes(zone) ? null : seat);
function main(s) { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; }
const tapAll = (s, seat = 0) => { for (let a; (a = legalActions(s, seat).find((x) => x.kind === "activate-mana" && x.label === "Wastes"));) applyAction(s, seat, a); };
const castNamed = (s, name, seat = 0) => applyAction(s, seat, legalActions(s, seat).find((a) => a.kind === "cast" && a.label === name));
const resolve = (s) => { passPriority(s); return passPriority(s); };
const triggersOn = (s) => s.stack.filter((e) => e.kind === "trigger");

/* ---- "whenever you cast" ---- */
{
  const s = table();
  on(s, card("Guttersnipe"), 0);
  on(s, spell("Quick", ["Instant"]), 0, "hand"); on(s, spell("Bear", ["Creature"]), 0, "hand");
  on(s, WASTES, 0); on(s, WASTES, 0);
  main(s);
  tapAll(s);
  castNamed(s, "Bear");
  eq(triggersOn(s).length, 0, "a creature spell is not an instant or sorcery: Guttersnipe does not trigger");
  castNamed(s, "Quick");
  eq(triggersOn(s).length, 1, "an instant is: the spell, now a new object on the stack (CR 400.7), is what the filter reads");
  const quick = s.stack.find((e) => e.kind === "spell" && e.name === "Quick").objectId;
  /* And the spell as it was, for a condition about it once it has left the stack (batch 70, CR 608.2h). */
  eq(s.stack.at(-1).about, {card: quick, player: 0, was: {cardId: quick, types: ["Instant"], subtypes: [], supertypes: [], controller: 0, token: false}},
    "the trigger is about that spell, and its caster");
  resolve(s);
  eq(s.players[1].life, 38, "2 damage to each opponent");
}
{
  /* caster: "opponent", and "that player" -- the one who cast it. */
  const s = table();
  on(s, watcher("Tax Watcher", {on: "GameEventSpellAbilityCast", caster: "opponent"}, [{effect: "loseLife", amount: 1, who: "that player"}]), 0);
  on(s, spell("Their Quick", ["Instant"]), 1, "hand"); on(s, WASTES, 1);
  on(s, spell("Mine", ["Instant"]), 0, "hand"); on(s, WASTES, 0);
  main(s);
  tapAll(s);
  castNamed(s, "Mine");
  eq(triggersOn(s).length, 0, "its controller's own spell: nothing");
  resolve(s);
  passPriority(s);
  tapAll(s, 1);
  castNamed(s, "Their Quick", 1);
  eq(triggersOn(s).length, 1, "an opponent's spell, in answer: it triggers");
  resolve(s);
  eq([s.players[1].life, s.players[0].life], [39, 40], "and \"that player\" is the one who cast it");
}
{
  const s = table();
  on(s, {card: "Red Bolt", types: ["Instant"], manaCost: "{C}", colors: ["R"], spell: {id: "s", text: "x", targets: [], effects: []}}, 0, "stack");
  const red = s.zones.stack[0];
  eq([compileSelector({what: "spell", colors: ["R"]})(s, red), compileSelector({what: "spell", colors: ["U"]})(s, red), compileSelector({what: "spell", colors: ["R", "G"]})(s, red)],
    [true, false, false], "colors (CR 105.2): a red spell is red, not blue; naming two asks for both");
  eq([matchesSelector({what: "spell", anyOf: [{types: ["Sorcery"]}, {types: ["Instant"]}]}, s, red), matchesSelector({what: "spell", anyOf: [{types: ["Sorcery"]}, {colors: ["U"]}]}, s, red)],
    [true, false], "a choice in a filter: an instant or sorcery, but not a sorcery or a blue spell");
}

/* ---- "whenever ... attacks": once per attacker ---- */
{
  const s = table();
  on(s, watcher("War Horn", {on: "GameEventAttackersDeclared", who: "any", filter: {types: ["Creature"], controller: "you"}},
    [{effect: "loseLife", amount: 1, who: "that player"}]), 0);
  for (const n of ["A", "B", "C"]) on(s, spell(`Bear ${n}`, ["Creature"]), 0);
  main(s);
  for (let n = 0; n < 20 && s.awaiting?.kind !== "declare-attackers"; n += 1) { if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s); }
  const choice = awaitingChoice(s);
  resolveAwaiting(s, choice.options.filter((o) => o.label.startsWith("Bear A") || o.label.startsWith("Bear B")).map((o) => o.index));
  eq([s.awaiting?.kind, (awaitingChoice(s)?.options ?? []).length], ["order-triggers", 2], "two creatures attack: two triggers, one each, its controller asked their order (CR 603.3b)");
  resolveAwaiting(s, [0, 1]);
  eq(triggersOn(s).map((e) => e.about.player), [1, 1], "each is about the player it attacks");
  resolve(s); resolve(s);
  eq(s.players[1].life, 38, "\"that player\" -- the defending player -- loses 1 for each");
}

/* ---- "deals combat damage to a player" ---- */
{
  const s = table();
  on(s, card("Coastal Piracy"), 0);
  on(s, spell("Bear", ["Creature"], {power: 2, toughness: 2}), 0);
  on(s, {card: "Ping", types: ["Instant"], manaCost: "{C}", spell: {id: "s", text: "x", targets: [], effects: [{effect: "dealDamage", amount: 1, who: "opponent"}]}}, 0, "hand");
  on(s, WASTES, 0);
  main(s);
  tapAll(s);
  castNamed(s, "Ping");
  resolve(s);
  eq([s.players[1].life, triggersOn(s).length], [39, 0], "noncombat damage to an opponent: no trigger for a combat-damage ability");
  for (let n = 0; n < 20 && s.awaiting?.kind !== "declare-attackers"; n += 1) { if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s); }
  resolveAwaiting(s, [awaitingChoice(s).options.find((o) => o.label.startsWith("Bear")).index]);
  for (let n = 0; n < 30 && !triggersOn(s).length; n += 1) { if (s.awaiting) resolveAwaiting(s, []); else if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s); }
  eq([s.phase, s.players[1].life, triggersOn(s)[0]?.about], ["COMBAT_DAMAGE", 37, {card: s.zones.battlefield.find((id) => s.objects[id].card === "Bear"), player: 1, amount: 2}],
    "the Bear's combat damage to the opponent triggers it, about the Bear, the player, and how much (batch 26: \"that many\")");
}

{
  /* "To an opponent": damage to its own controller is not. */
  const s = table();
  const source = on(s, watcher("Spite", {on: "GameEventPlayerDamaged", who: "self", to: "opponent"}, [{effect: "gainLife", amount: 1}]), 0);
  main(s);
  collectTriggers(s, runEffects(s, [{effect: "dealDamage", amount: 1, who: "you"}], {controller: 0, source}));
  eq(s.pendingTriggers.length, 0, "its own controller dealt damage: no trigger for \"to an opponent\"");
  collectTriggers(s, runEffects(s, [{effect: "dealDamage", amount: 1, who: "opponent"}], {controller: 0, source}));
  eq(s.pendingTriggers.map((t) => t.about), [{card: source, player: 1, amount: 1}], "an opponent dealt damage: one, about the source, that opponent, and how much");
}
{
  /* Combat damage only: a creature's ability dealing damage to a player is not combat damage (CR 120.2). */
  const s = table();
  on(s, watcher("Raid Watch", {on: "GameEventPlayerDamaged", who: "any", combat: true, to: "player", filter: {types: ["Creature"], controller: "you"}}, [{effect: "gainLife", amount: 1}]), 0);
  const pinger = on(s, spell("Pinger", ["Creature"]), 0);
  main(s);
  collectTriggers(s, runEffects(s, [{effect: "dealDamage", amount: 1, who: "opponent"}], {controller: 0, source: pinger}));
  eq([s.players[1].life, s.pendingTriggers.length], [39, 0], "a creature's noncombat damage to an opponent does not trigger a combat-damage ability");
}

/* ---- "whenever ... draws": a draw, not a search ---- */
{
  const s = table();
  on(s, card("Sheoldred, the Apocalypse"), 0);
  main(s);
  const life = s.players[0].life;
  collectTriggers(s, runEffects(s, [{effect: "draw", count: 1}], {controller: 0, source: null}));
  eq(s.pendingTriggers.length, 1, "an effect's draw is a draw (CR 121.1): Sheoldred triggers");
  s.pendingTriggers.length = 0;
  const library = s.zones.library[0][0];
  collectTriggers(s, runEffects(s, [{effect: "moveZone", targets: [library], to: "hand"}], {controller: 0, source: null}));
  ok(s.zones.hand[0].length === 2 && s.pendingTriggers.length === 0, "a card put from the library into the hand some other way is not a draw: no trigger");
  eq(s.players[0].life, life, "and nothing yet resolved");
}
{
  /* An opponent's draw step: "they lose 2 life". */
  const s = table();
  on(s, card("Sheoldred, the Apocalypse"), 0);
  main(s);
  for (let n = 0; n < 60 && !(s.turn === 2 && s.phase === "DRAW" && s.priorityPlayer !== null); n += 1) { if (s.awaiting) resolveAwaiting(s, []); else if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s); }
  eq([triggersOn(s).length, triggersOn(s)[0]?.about], [1, {player: 1}], "Maya's draw step draw triggers it, about Maya");
  resolve(s);
  eq(s.players[1].life, 38, "\"that player\" loses 2");
}

/* ---- tokens keep their colors ---- */
{
  const s = table();
  main(s);
  runEffects(s, [{effect: "createToken", count: 1, token: {name: "Elemental", types: ["Creature"], colors: ["R"], power: 1, toughness: 1}}], {controller: 0, source: null});
  const elemental = s.zones.battlefield.find((id) => s.objects[id].card === "Elemental");
  eq([characteristicsOf(s, elemental).colors, compileSelector({what: "permanent", colors: ["R"]})(s, elemental)], [["R"], true], "a red Elemental token is red (CR 111.4), and \"red creatures\" finds it");
  const moved = on(s, {card: "Blue Card", types: ["Instant"], manaCost: "{U}", colors: ["U"]}, 0, "hand");
  const {moveObject} = await import("../game/engine/state/index.mjs");
  eq(characteristicsOf(s, moveObject(s, moved, "graveyard", 0)).colors, ["U"], "and a card keeps its printed colors as it changes zones");
}

/* ---- proliferate, asked ---- */
{
  const s = table();
  const grown = on(s, spell("Grown", ["Creature"]), 0);
  const plain = on(s, spell("Plain", ["Creature"]), 0);
  const theirs = on(s, spell("Theirs", ["Creature"], {power: 3, toughness: 3}), 1);
  s.objects[grown].counters = {"+1/+1": 2}; s.objects[theirs].counters = {"-1/-1": 1};
  s.players[1].counters = {...(s.players[1].counters ?? {}), poison: 3};
  main(s);
  runEffects(s, [], {controller: 0, source: null});
  const {beginResolution} = await import("../game/engine/script/resolution.mjs");
  beginResolution(s, [{effect: "proliferate"}], {controller: 0, source: null});
  const choice = awaitingChoice(s);
  eq([choice.mode, choice.min, choice.options.map((o) => o.label)], ["many", 0, ["Grown (2 +1/+1)", "Theirs (1 -1/-1)", "Maya (3 poison)"]],
    "proliferate asks: any number of the permanents and players that have a counter -- not one without (CR 701.34a)");
  resolveAwaiting(s, [0, 2]);
  eq([s.objects[grown].counters["+1/+1"], s.objects[theirs].counters["-1/-1"], s.players[1].counters.poison, Object.keys(s.objects[plain].counters ?? {}).length], [3, 1, 4, 0],
    "the chosen get another of each kind already there; the rest nothing");
  const empty = table(); main(empty);
  beginResolution(empty, [{effect: "proliferate"}], {controller: 0, source: null});
  eq(empty.awaiting, null, "with nothing anywhere carrying a counter, nothing is asked");
}

/* ---- the smoke game answers what it is asked as turns pass ---- */
{
  const sphinx = loadCardScripts().find((e) => e.script.identity.name === "Consecrated Sphinx").script;
  const to = smokeScenario(sphinx).scenario.steps.find((st) => st.to);
  eq(to.to.settle, true, "the smoke game moves through turns answering what comes up -- an opponent's draw asking Consecrated Sphinx's \"you may\"");
}

console.log(`engine-event-triggers: ${checks} checks passed — spells cast, attackers, combat damage and draws each trigger once per thing they are about, "that player" is that player, and proliferate asks.`);
