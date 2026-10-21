/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE LIBRARY CARD LOAD OF 2026-10-21, LANE L6: SPELLS, DRAWS AND DISCARDS.
 *
 * The lane's twenty-two cards play through their scenarios (here first, so a break is found fast, and again in
 * tests/engine-cards.mjs); the twenty-third, Ichor Elixir, is stopped on (planar dice, CR 901.9) and plays at no table.
 * Beside them, what the scenarios cannot reach, each against the rule it follows:
 *   - a player's hexproof from a color (Veil of Summer; CR 702.11d): only targets are stopped -- a player chosen without
 *     targeting is not -- and only an opponent's, from a source of the color;
 *   - an effect's hexproof from over players only when it names no permanents: Skrelv's targets and a selector's
 *     permanents give no player hexproof;
 *   - "each opponent who didn't" (Kynaios and Tiro of Meletis): the controller's opponents who did not do what the
 *     resolution offered them, and nobody when there is no game to read -- and a chooseCard's `did` said beside `remember`.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex, loadCardScenarios} from "../game/tools/engine-cards.mjs";
import {tableCards} from "../cloud/game-room.mjs";
import {compileSelector} from "../game/engine/script/filter.mjs";
import {bindEffect} from "../game/engine/script/bind.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {cardsIn} from "../game/engine/state/index.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const LANE = ["Queza, Augur of Agonies", "Liliana's Standard Bearer", "Veil of Summer", "Eerie Interlude", "Flickering Hound", "Kynaios and Tiro of Meletis",
  "Aquitect's Defenses", "Clash of Elements", "Duelist of the Mind", "Eclipsed Boggart", "Eclipsed Flamekin", "Eriette's Lullaby", "Festering Gulch",
  "Flourishing Grapple", "Kulrath Mystic", "Shepherding Spirits", "Splitskin Doll", "Tanufel Rimespeaker", "Thoughtweft Charge", "Tributary Vaulter",
  "Unexpected Results", "Vicious Clown"];

/* ---- the lane's cards: playable at a table, and every scenario of theirs ---- */
for (const name of LANE) ok(tableCards(name) !== null, `${name} plays at a table`);
ok(tableCards("Ichor Elixir") === null, "Ichor Elixir, stopped on (planar dice), plays at no table");
{
  let runs = 0;
  for (const {scenarios: file} of loadCardScenarios()) {
    if (!LANE.includes(file.card)) continue;
    for (const scenario of file.scenarios) { runScenario(scenario, index.definition, file.fixtures ?? {}); runs += 1; }
  }
  ok(runs >= 54, `the lane's ${runs} scenarios each pass`);
}

/* A spell of each color in Maya's hand, the sources asked about. */
const spell = (colors) => ({types: ["Instant"], manaCost: "{C}", colors, spell: {id: "s", text: "Draw a card.", effects: [{effect: "draw", count: 1}]}});
const FIX = {Blue: spell(["U"]), Black: spell(["B"]), Red: spell(["R"]), Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2}};
const table = (setup, seats = 2) => runScenario({name: "libload-l6", setup, seats}, index.definition, FIX).state;
const inHand = (s, seat, name) => cardsIn(s, "hand", seat).find((id) => s.objects[id].card === name);

/* ---- a player's hexproof from blue and from black (Veil of Summer; CR 702.11d) ---- */
{
  const s = table([{seat: 0, zone: "battlefield", cards: ["Bear"]}, {seat: 0, zone: "hand", cards: ["Black"]}, {seat: 1, zone: "hand", cards: ["Blue", "Black", "Red"]}]);
  runEffects(s, [{effect: "effectUntil", rule: "hexproof-from", colors: ["U", "B"], who: "you", until: "end-of-turn"}], {controller: 0, source: null});
  const targeted = compileSelector({what: "player", target: true}), chosen = compileSelector({what: "player"});
  const [blue, black, red] = ["Blue", "Black", "Red"].map((name) => inHand(s, 1, name));
  ok(!targeted(s, 0, {controller: 1, source: blue}) && !targeted(s, 0, {controller: 1, source: black}), "Rob can't be the target of Maya's blue or black spell");
  ok(targeted(s, 0, {controller: 1, source: red}), "a red one of hers may target him");
  ok(targeted(s, 0, {controller: 0, source: inHand(s, 0, "Black")}), "and so may a black one of his own: hexproof stops opponents only (CR 702.11b)");
  ok(chosen(s, 0, {controller: 1, source: blue}), "a player chosen without targeting is not stopped: hexproof is about targets (CR 702.11d)");
  ok(targeted(s, 1, {controller: 0, source: inHand(s, 0, "Black")}), "Maya, who has no such effect, may be targeted by Rob's black spell");
  ok(targeted(s, 0, {controller: 1, source: null}), "with no source there is no color, and nothing is stopped");
}

/* ---- the effect's players: only when it names no permanents ---- */
{
  const s = table([{seat: 0, zone: "battlefield", cards: ["Bear"]}]);
  const bear = s.zones.battlefield.find((id) => s.objects[id].card === "Bear");
  runEffects(s, [{effect: "effectUntil", rule: "hexproof-from", colors: ["U"], targets: [bear], until: "end-of-turn"}], {controller: 0, source: null});
  runEffects(s, [{effect: "effectUntil", rule: "hexproof-from", colors: ["B"], selector: {what: "permanent", controller: "you"}, until: "end-of-turn"}], {controller: 0, source: null});
  runEffects(s, [{effect: "effectUntil", rule: "hexproof-from", colors: ["G"], who: "you", until: "end-of-turn"}], {controller: 0, source: null});
  const made = s.effects.filter((e) => e.rule === "hexproof-from").map((e) => [e.colors[0], e.players ?? null, e.affects?.ids ?? null]);
  eq(made, [["U", null, [bear]], ["B", null, [bear]], ["G", [0], null]],
    "Skrelv's targets and a selector's permanents give no player hexproof; with neither, its controller has it");
}

/* ---- "each opponent who didn't" (Kynaios and Tiro of Meletis) ---- */
{
  const s = table([], 4);
  const who = (whoDid, state = s) => bindEffect({effect: "draw", who: "each opponent who didn't", count: 1}, {controller: 0, whoDid}, state).who;
  eq(who([0, 2]), [1, 3], "Rob did and Trey did: Maya and Sam, the opponents who didn't, draw");
  eq(who([]), [1, 2, 3], "nobody did: every opponent draws, never the controller");
  eq(who([1, 2, 3]), [], "every opponent did: nobody draws");
  eq(who([], null), [], "with no game to read, nobody");
  /* chooseCard reports who chose a card beside what it remembers (effects/asking.mjs): a `did` without `remember` is refused. */
  const problems = (effect) => compileScript({schema: "CrankCardScript@1", identity: {name: "Probe", oracleId: "probe", types: ["Sorcery"], subtypes: [], manaCost: "{1}", colors: [],
    power: null, toughness: null}, oracleText: "Probe.", source: "hand", abilities: [{kind: "spell", text: "Probe.", effects: [effect]}]}).problems.join("; ");
  const land = {effect: "chooseCard", zone: "hand", selector: {types: ["Land"]}, upTo: true, to: "stay"};
  ok(/`did` is true, beside `remember`/.test(problems({...land, did: true})), "a chooseCard's did without remember is refused");
  ok(/`did` is true, beside `remember`/.test(problems({...land, did: false, remember: "add"})), "and a did that is not true");
  eq(problems({...land, did: true, remember: "add"}), "", "with remember, it compiles");
}

console.log(`engine-libload-l6: ${checks} checks passed -- the lane's twenty-two cards, a player's hexproof from a color, its players, and "each opponent who didn't".`);
