/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 21 (THE CATALOG'S ORDER): "ENTERS WITH X +1/+1 COUNTERS ON IT".
 *
 * A replacement effect on how the permanent enters (CR 614.1c, 614.12): the counters are there as it arrives, so its own
 * "when this enters" already sees them. The number is counted then -- the X paid to cast it (CR 107.3m; 0 when it was put
 * onto the battlefield without being cast), "for each Zombie card in your graveyard", "the greatest power among other
 * creatures you control". And a permanent's own "when this dies" reads it as it last existed (CR 603.10a): "a number of
 * Treasures equal to its power", "a Thopter for each +1/+1 counter on this creature".
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {characteristicsOf} from "../game/engine/rules/layers.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const land = (name, color, subtypes = []) => ({card: name, types: ["Land"], supertypes: ["Basic"], subtypes, abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {[color]: 1}}]});
const WASTES = land("Wastes", "C"), FOREST = land("Forest", "G", ["Forest"]);
const creature = (name, power = 2, extra = {}) => ({card: name, types: ["Creature"], manaCost: "{1}", power, toughness: power, ...extra});
const pod = {matchId: "m", seed: "enters-with", players: [{name: "Rob"}, {name: "Maya"}]};
function table() {
  const s = createState(pod);
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
const on = (s, o, seat, zone = "battlefield") => addObject(s, {...o, owner: seat, controller: seat}, zone, ["battlefield", "exile"].includes(zone) ? null : seat);
function main(s) { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; }
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
const named = (s, name, zone = "battlefield") => Object.keys(s.objects).map(Number).filter((id) => s.objects[id].card === name && s.objects[id].zone === zone);
const tapAll = (s) => { for (const a of legalActions(s, 0).filter((x) => x.kind === "activate-mana" && !x.produce)) applyAction(s, 0, a); };
function castFor(s, name, x) {
  tapAll(s);
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "cast" && a.label === name && (x === undefined || a.x === x)));
  run(s, settled);
}

/* ---- X paid ---- */
{
  const s = table();
  on(s, card("Walking Ballista"), 0, "hand"); for (let i = 0; i < 6; i += 1) on(s, WASTES, 0);
  main(s);
  castFor(s, "Walking Ballista", 3);
  const [ballista] = named(s, "Walking Ballista");
  eq([s.objects[ballista].counters["+1/+1"], characteristicsOf(s, ballista).power], [3, 3], "Walking Ballista cast for X = 3 enters with three +1/+1 counters, a 3/3");
}
{
  const s = table();
  on(s, card("Walking Ballista"), 0, "hand");
  main(s);
  castFor(s, "Walking Ballista", 0);
  eq([named(s, "Walking Ballista").length, named(s, "Walking Ballista", "graveyard").length], [0, 1], "cast for X = 0: no counters, a 0/0, and it dies at once");
}
{
  /* Put onto the battlefield without being cast: X is 0 (CR 107.3m). */
  const s = table();
  const hydra = on(s, card("Goldvein Hydra"), 0, "graveyard");
  main(s);
  beginResolution(s, [{effect: "moveZone", targets: [hydra], to: "battlefield"}], {controller: 0, source: null});
  eq(named(s, "Goldvein Hydra").map((id) => s.objects[id].counters["+1/+1"] ?? 0), [0], "Goldvein Hydra returned from the graveyard by an effect: not cast, so X is 0 and no counters");
}

/* ---- a count, as it enters ---- */
{
  const s = table();
  on(s, card("Diregraf Colossus"), 0, "hand"); for (let i = 0; i < 3; i += 1) on(s, {...land("Swamp", "B", ["Swamp"])}, 0);
  for (let i = 0; i < 2; i += 1) on(s, creature("Ghoul", 2, {subtypes: ["Zombie"]}), 0, "graveyard");
  on(s, creature("Ghoul", 2, {subtypes: ["Zombie"]}), 1, "graveyard");
  on(s, creature("Bear"), 0, "graveyard");
  main(s);
  castFor(s, "Diregraf Colossus");
  const [colossus] = named(s, "Diregraf Colossus");
  eq(s.objects[colossus].counters["+1/+1"], 2, "Diregraf Colossus: a counter for each Zombie card in Rob's graveyard -- two; Maya's Zombie and Rob's Bear don't count");
}
{
  const s = table();
  on(s, card("Prime Speaker Zegana"), 0, "hand");
  for (const [n, c, sub] of [[2, "G", "Forest"], [2, "U", "Island"]]) for (let i = 0; i < n; i += 1) on(s, land(sub, c, [sub]), 0);
  on(s, WASTES, 0); on(s, WASTES, 0);
  on(s, creature("Ogre", 3), 0); on(s, creature("Bear"), 0); on(s, creature("Giant", 7), 1);
  main(s);
  castFor(s, "Prime Speaker Zegana");
  const [zegana] = named(s, "Prime Speaker Zegana");
  eq([s.objects[zegana].counters["+1/+1"], characteristicsOf(s, zegana).power, s.zones.hand[0].length], [3, 4, 4],
    "Zegana: X is the greatest power among other creatures Rob controls -- the Ogre's 3, not Maya's 7/7 Giant -- so a 4/4, and it draws four");
}
{
  const s = table();
  on(s, card("Threefold Thunderhulk"), 0, "hand"); for (let i = 0; i < 7; i += 1) on(s, WASTES, 0);
  main(s);
  castFor(s, "Threefold Thunderhulk");
  eq(named(s, "Gnome").length, 3, "Threefold Thunderhulk enters with three counters, and its own 'when this enters' already sees a 3/3: three Gnomes");
}

/* ---- its own death, read as it last existed ---- */
{
  /* A 0/0 with no counters would die at once (CR 704.5f): put down after the game begins, its counters on as it arrives. */
  const s = table();
  main(s);
  const hydra = on(s, card("Goldvein Hydra"), 0);
  s.objects[hydra].counters["+1/+1"] = 2;
  on(s, {card: "Doom", types: ["Sorcery"], manaCost: "{0}", spell: {id: "s", text: "x", targets: [], effects: [{effect: "destroy", targets: [hydra]}]}}, 0, "hand");
  beginResolution(s, [{effect: "pump", targets: [hydra], power: 2, toughness: 0}], {controller: 0, source: null});
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "cast" && a.label === "Doom"));
  run(s, settled);
  eq([named(s, "Treasure").length, named(s, "Treasure").every((id) => s.objects[id].tapped)], [4, true],
    "Goldvein Hydra dies as a 4/2 (two counters and +2/+0): four tapped Treasures -- its power as it last existed (CR 603.10a)");
}
{
  const s = table();
  main(s);
  const walker = on(s, card("Hangarback Walker"), 0);
  s.objects[walker].counters["+1/+1"] = 3;
  on(s, {card: "Doom", types: ["Sorcery"], manaCost: "{0}", spell: {id: "s", text: "x", targets: [], effects: [{effect: "destroy", targets: [walker]}]}}, 0, "hand");
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "cast" && a.label === "Doom"));
  run(s, settled);
  eq(named(s, "Thopter").length, 3, "Hangarback Walker dies with three +1/+1 counters: three Thopters");
}

/* ---- charge counters, and mana for each ---- */
{
  const s = table();
  on(s, card("Astral Cornucopia"), 0, "hand"); for (let i = 0; i < 6; i += 1) on(s, WASTES, 0);
  main(s);
  castFor(s, "Astral Cornucopia", 2);
  const [horn] = named(s, "Astral Cornucopia");
  const offer = legalActions(s, 0).find((a) => a.kind === "activate-mana" && a.label === "Astral Cornucopia" && a.mana?.G);
  eq([s.objects[horn].counters.charge, offer?.mana], [2, {G: 2}], "Astral Cornucopia cast for X = 2: two charge counters, and {T} adds two mana of one chosen color");
}
{
  const s = table();
  const bear = on(s, creature("Bear"), 0), theirs = on(s, creature("Theirs"), 1);
  main(s);
  const mikaeus = on(s, card("Mikaeus, the Lunarch"), 0);
  s.objects[mikaeus].counters["+1/+1"] = 2;
  run(s, (x) => x.turn === 3 && x.phase === "MAIN1");
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate" && a.label === "Mikaeus, the Lunarch" && a.abilityId === "a2"));
  run(s, settled);
  eq([s.objects[mikaeus].counters["+1/+1"], s.objects[bear].counters["+1/+1"], s.objects[theirs].counters["+1/+1"] ?? 0], [1, 1, 0],
    "Mikaeus removes its counter to put one on each OTHER creature Rob controls: the Bear, not itself, not Maya's");
}

void ok;
console.log(`engine-enters-with: ${checks} checks passed — enters with X counters (X paid, 0 when not cast), a count or the greatest power as it enters, seen by its own ETB; its own death read as it last existed; charge counters, and mana for each.`);
