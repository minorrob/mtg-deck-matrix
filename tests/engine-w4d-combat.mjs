/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE CARD LOAD OF 2026-10-23, LANE L3 (COMBAT AND EQUIPMENT): what the lane's card scenarios cannot reach.
 *
 * Every card the lane wrote plays its scenarios here first, so a break in the lane's engine changes is caught in seconds
 * (game/tools/batch/breaks-w4d-l3-combat.py); then the edges: two added combats each with its own "at the beginning of
 * that combat" (Moraug), deathtouch with Ram Through's trample excess, two Bludgeon Brawls (a dependency loop), the kinds of modified (CR
 * 700.15), one kind of counter doubled (Mossborn Hydra), the halving and the doubling of one event in the order that
 * leaves the least (Gisela), and the compiler's and the schema's refusals.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {createCardIndex} from "../game/engine/cards/index.mjs";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {multiplyCounters} from "../game/engine/script/effects/resources.mjs";
import {isModified} from "../game/engine/rules/layers.mjs";
import {amountProblems} from "../game/engine/script/amount.mjs";
import {conditionProblems} from "../game/engine/script/condition.mjs";
import {applyReplacements} from "../game/engine/rules/replacement.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {meetRequirements} from "../game/engine/pilots/house-pilot.mjs";

let count = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); count += 1; };
const ok = (a, m) => { assert.ok(a, m); count += 1; };
const index = loadCardIndex();

/* ---- every card of the lane, through its scenarios ---- */
const LANE = ["Ragavan, Nimble Pilferer", "Shizo, Death's Storehouse", "Mossborn Hydra", "Kalonian Hydra", "Hammer of Nazahn",
  "Trailblazer's Boots", "Colossus Hammer", "Champion's Helm", "Excalibur, Sword of Eden", "Steelshaper's Gift", "Stoneforge Mystic",
  "Fog", "Noxious Gearhulk", "Bear Umbra", "Yawgmoth, Thran Physician", "Ram Through", "Reconnaissance", "Kodama of the West Tree",
  "Ghalta, Stampede Tyrant", "Drakuseth, Maw of Flames", "Gisela, Blade of Goldnight", "Moraug, Fury of Akoum", "Bludgeon Brawl",
  "Xenagos, God of Revels"];
const slug = (name) => name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/'/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
for (const name of LANE) {
  const s = slug(name), file = JSON.parse(readFileSync(new URL(`../game/engine/cards/${s[0]}/${s}.scenarios.json`, import.meta.url), "utf8"));
  ok(index.resolve(name)?.playable, `${name} is playable`);
  for (const scenario of file.scenarios) { runScenario(scenario, index.definition, file.fixtures ?? {}); count += 1; }
}

const play = (scenario, fixtures = {}) => runScenario(scenario, index.definition, fixtures);
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const bear = {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2};

/* ---- Moraug: two landfalls, two added combats, each untapping at its own beginning (CR 500.8, 603.7) ---- */
play({name: "Explosive Vegetation brings two lands in the second main phase: two more combats, the Bear attacking in each (3, 4, 5)",
  library: ["Forest", "Mountain"],
  setup: [at(0, "battlefield", "Moraug, Fury of Akoum", "Bear", "Forest", "Wastes", "Wastes", "Wastes"), at(0, "hand", "Explosive Vegetation")],
  steps: [{attack: ["Bear"]}, {to: {turn: 1, phase: "MAIN2"}}, {tap: "Forest"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"},
    {cast: "Explosive Vegetation"}, {resolve: true}, {choose: ["Forest", "Mountain"]}, {settle: true},
    {to: {turn: 1, phase: "COMBAT_BEGIN"}}, {resolve: true}, {attack: ["Bear"]},
    {to: {turn: 1, phase: "COMBAT_BEGIN"}}, {resolve: true}, {attack: ["Bear"]}, {to: {turn: 1, phase: "END_OF_TURN"}}],
  expect: [{seat: 1, life: 28}]}, {Bear: bear});
count += 1;

/* A delayed trigger of an added combat that never came does not outlive its turn. */
{
  const s = createState({matchId: "w4d", seed: "w4d", players: [{name: "Rob"}, {name: "Maya"}]});
  beginGame(s);
  s.delayedTriggers = [{at: "that combat", tag: "combat:1:0:0", controller: 0, source: null, effects: [], text: null}];
  for (let n = 0; n < 200 && s.turn < 2; n += 1) {
    if (s.awaiting) resolveAwaiting(s, ["declare-attackers", "declare-blockers"].includes(s.awaiting.kind) ? meetRequirements(awaitingChoice(s), []) : []);
    else if (s.priorityPlayer === null) advance(s);
    else if (passPriority(s, null).outcome === "step-ends") advance(s);
  }
  eq(s.turn, 2, "the game reached Maya's turn");
  eq(s.delayedTriggers.filter((d) => d.at === "that combat"), [], "a turn's end takes its added combats' delayed triggers with it");
}

/* ---- Ram Through: deathtouch makes 1 lethal, so the rest tramples over (CR 702.2c, 702.19b) ---- */
play({name: "A 4/4 deathtouch trampler deals 1 to Maya's 5/5 and 3 to Maya",
  setup: [at(0, "battlefield", "Viper", "Forest", "Wastes"), at(0, "hand", "Ram Through"), at(1, "battlefield", "Their Giant")],
  steps: [{tap: "Forest"}, {tap: "Wastes"}, {cast: "Ram Through", targets: [{card: "Viper"}, {card: "Their Giant"}]}, {resolve: true}],
  expect: [{seat: 1, life: 37}, {seat: 1, zone: "graveyard", cards: ["Their Giant"]}]},
{Viper: {...bear, power: 4, toughness: 4, keywords: ["Deathtouch", "Trample"]}, "Their Giant": {...bear, power: 5, toughness: 5}});
count += 1;

/* ---- Bludgeon Brawl: two of them depend on each other (each changes what the other applies to, a loop, CR 613.8b), so they
   apply in timestamp order -- the first makes the Rock an Equipment, and the second no longer finds it a non-Equipment
   artifact: one equip {3} and +3/+0, not two. A printed Equipment gets neither. ---- */
play({name: "Two Brawls: the {3} Rock has one equip {3} and gives the Bear +3/+0; Trailblazer's Boots, an Equipment already, give it nothing",
  setup: [at(0, "battlefield", "Bludgeon Brawl", "Bludgeon Brawl", "Bear", "Big Rock", "Trailblazer's Boots", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes")],
  steps: [{tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {expect: [{offers: {kind: "activate", card: "Big Rock"}, count: 1}]},
    {activate: "Big Rock", targets: [{card: "Bear"}]}, {resolve: true}, {tap: "Wastes"}, {tap: "Wastes"},
    {expect: [{offers: {kind: "activate", card: "Trailblazer's Boots"}, count: 1}]}, {activate: "Trailblazer's Boots", targets: [{card: "Bear"}]}, {resolve: true}],
  expect: [{seat: 0, stats: {card: "Bear", power: 5, toughness: 2}}]},
{Bear: bear, "Big Rock": {types: ["Artifact"], manaCost: "{3}"}});
count += 1;

/* ---- Modified (CR 700.15): a counter, an Equipment, an Aura of its controller's -- not an opponent's Aura ---- */
{
  const s = createState({matchId: "w4d", seed: "w4d", players: [{name: "Rob"}, {name: "Maya"}]});
  const put = (object, seat) => addObject(s, {...object, owner: seat, controller: seat}, "battlefield", null);
  const plain = put({card: "Plain", types: ["Creature"], power: 1, toughness: 1}, 0);
  const countered = put({card: "Countered", types: ["Creature"], power: 1, toughness: 1}, 0);
  s.objects[countered].counters = {"+1/+1": 1};
  const mine = put({card: "Mine", types: ["Creature"], power: 1, toughness: 1}, 0);
  const theirs = put({card: "Theirs", types: ["Creature"], power: 1, toughness: 1}, 0);
  const aura = put({card: "Aura", types: ["Enchantment"], subtypes: ["Aura"]}, 0), cursed = put({card: "Their Aura", types: ["Enchantment"], subtypes: ["Aura"]}, 1);
  s.objects[aura].attachedTo = mine; s.objects[mine].attachments = [aura];
  s.objects[cursed].attachedTo = theirs; s.objects[theirs].attachments = [cursed];
  eq([plain, countered, mine, theirs].map((id) => isModified(s, id, s.objects[id].counters, 0)), [false, true, true, false],
    "modified: a counter on it, or an Aura its controller controls -- never an opponent's Aura");
}

/* ---- Mossborn Hydra: only the +1/+1 counters double ---- */
{
  const s = createState({matchId: "w4d", seed: "w4d", players: [{name: "Rob"}, {name: "Maya"}]});
  const id = addObject(s, {card: "Hydra", types: ["Creature"], power: 0, toughness: 0, owner: 0, controller: 0}, "battlefield", null);
  s.objects[id].counters = {"+1/+1": 2, charge: 3};
  multiplyCounters(s, {targets: [id], counter: "+1/+1"}, {controller: 0, source: id});
  eq([s.objects[id].counters["+1/+1"], s.objects[id].counters.charge], [4, 3], "double the number of +1/+1 counters: the charge counters stay");
}

/* ---- Gisela on both sides: one event halved and doubled, in the order that leaves the least when nobody is asked ---- */
{
  const s = createState({matchId: "w4d", seed: "w4d", players: [{name: "Rob"}, {name: "Maya"}]});
  const gisela = index.definition("Gisela, Blade of Goldnight");
  addObject(s, {...gisela, card: gisela.name ?? "Gisela, Blade of Goldnight", owner: 0, controller: 0}, "battlefield", null);
  addObject(s, {...gisela, card: gisela.name ?? "Gisela, Blade of Goldnight", owner: 1, controller: 1}, "battlefield", null);
  const {proposal} = applyReplacements(s, {event: "damage", toPlayer: 0, amount: 3, sourceId: null, combat: false});
  eq(proposal.amount, 2, "3 to Rob: halved to 1 then doubled to 2 leaves less than doubled to 6 then halved to 3");
}

/* ---- the compiler's and the schema's refusals ---- */
{
  const card = (name, types, abilities) => ({schema: "CrankCardScript@1", identity: {name, oracleId: `00000000-0000-0000-0000-${String(name.length).padStart(12, "0")}`, types, subtypes: [], manaCost: "{R}", colors: ["R"], power: types.includes("Creature") ? 1 : null, toughness: types.includes("Creature") ? 1 : null}, oracleText: "", abilities});
  const problems = (script) => createCardIndex([script]).resolve(script.identity.name).problems.join(" ");
  ok(/dash on a card that is no creature/.test(problems(card("Dashing Bolt", ["Instant"], [{kind: "keyword", text: "Dash {1}{R}", keyword: "dash", cost: [{atom: "mana", cost: "{1}{R}"}]}]))),
    "dash is refused on a card that never becomes a creature");
  ok(/a dash cost of mana/.test(problems(card("Dashing Ape", ["Creature"], [{kind: "keyword", text: "Dash", keyword: "dash", cost: [{atom: "payLife", amount: 2}]}]))),
    "dash is a cost of mana");
  ok(/protection says from what/.test(problems(card("Odd Wall", ["Creature"], [{kind: "keyword", text: "Protection from", keyword: "protection", from: {subtypes: []}}]))),
    "protection from no subtype is refused");
  ok(amountProblems({attacksThisTurn: "them"}).length > 0, "attacksThisTurn counts \"it\" alone");
  ok(conditionProblems({yourMainPhase: false}).length > 0, "yourMainPhase is true or absent");
}

console.log(`engine-w4d-combat: ${count} checks passed -- lane L3's ${LANE.length} cards through their scenarios, two added combats, deathtouch over Ram Through, two Brawls in a loop, modified, one kind doubled, Gisela both ways, and the refusals.`);
