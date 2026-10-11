/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, PHASE 2 (p1-bugs): "SPEND THIS MANA ONLY TO ... ACTIVATE ABILITIES OF ELF SOURCES" (CR 106.6, 109.2, 113.7).
 *
 * Mana restricted to abilities of some sources (Woodland Weavemaster, Gwenna, Jasmine Dragon Tea Shop, Secluded Courtyard,
 * Eclipsed Realms) was admitted only for a permanent: Weavemaster's {G} could not pay an Elf card's "Cycling {1}" in its
 * owner's hand, where a Forest's could. The source of an ability is the object it is of, wherever that object is
 * (CR 113.7), and a description that says "source" is not narrowed to a permanent (CR 109.2) -- so `abilitySource` reads
 * the object where it is. "Abilities of creatures" (Castle Garenbrig) and "of colorless Eldrazi" (Eldrazi Temple) name no
 * card, spell or source, and mean permanents (CR 109.2): `ability`, as before (rules/restricted-mana.mjs).
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {addRestricted, poolFor, spendFor, SPEND_ONLY_KEYS} from "../game/engine/rules/restricted-mana.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const FOREST = {card: "Forest", types: ["Land"], supertypes: ["Basic"], subtypes: ["Forest"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {G: 1}}]};
const CYCLING = {id: "c", kind: "activated", zone: "hand", cycling: true, text: "Cycling {1}", cost: [{atom: "mana", cost: "{1}"}, {atom: "discard", self: true}], targets: [], effects: [{effect: "draw", count: 1}]};
const RECALL = {id: "g", kind: "activated", zone: "graveyard", text: "{1}: Return this card from your graveyard to your hand.", cost: [{atom: "mana", cost: "{1}"}], effects: [{effect: "moveZone", targets: "self", to: "hand"}]};
const PUMP = {id: "p", kind: "activated", text: "{1}: This creature gets +1/+1 until end of turn.", cost: [{atom: "mana", cost: "{1}"}], effects: [{effect: "pump", targets: "self", power: 1, toughness: 1}]};
const being = (name, subtypes, more = {}) => ({card: name, types: ["Creature"], subtypes, manaCost: "{G}", colors: ["G"], power: 1, toughness: 1, ...more});
function table(seats = 2) {
  const s = createState({matchId: "m", seed: "source", players: ["Rob", "Maya", "Trey", "Sam"].slice(0, seats).map((name) => ({name}))});
  for (let seat = 0; seat < seats; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
const main = (s) => { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; };
const put = (s, o, zone = "battlefield", seat = 0) => addObject(s, {...o, owner: seat, controller: seat}, zone, zone === "battlefield" ? null : seat);
const activations = (s, id, seat = 0) => legalActions(s, seat).filter((a) => a.kind === "activate" && a.objectId === id).length;

{
  /* The entry: what `abilitySource` admits is the object where it is -- a card in a hand, in a graveyard, a permanent;
     `ability`, the permanent alone. */
  const s = table();
  const elfInHand = put(s, being("Elf Seer", ["Elf"]), "hand"), bearInHand = put(s, being("Bear Seer", ["Bear"]), "hand");
  const elfInGraveyard = put(s, being("Elf Ghost", ["Elf"]), "graveyard"), elf = put(s, being("Elf", ["Elf"]));
  addRestricted(s, 0, {G: 1}, {abilitySource: {subtypes: ["Elf"]}}, null);
  const green = (id) => poolFor(s, 0, {ability: id}).G ?? 0;
  eq([green(elfInHand), green(elfInGraveyard), green(elf), green(bearInHand)], [1, 1, 1, 0], "an Elf source anywhere: in a hand, a graveyard, on the battlefield; a Bear card not");
  eq(poolFor(s, 0, {spell: elfInHand}).G ?? 0, 0, "an ability's source only: casting the Elf card is not activating an ability");
  const t = table();
  const creatureInHand = put(t, being("Bear Seer", ["Bear"]), "hand"), bear = put(t, being("Bear", ["Bear"]));
  addRestricted(t, 0, {G: 1}, {ability: {types: ["Creature"]}}, null);
  eq([poolFor(t, 0, {ability: creatureInHand}).G ?? 0, poolFor(t, 0, {ability: bear}).G ?? 0], [0, 1], "\"abilities of creatures\": a creature permanent, not a creature card in a hand (CR 109.2)");
  /* Spent on it first: the restricted green, not the pool's. */
  s.players[0].manaPool.G = 1;
  spendFor(s, 0, {ability: elfInHand}, {G: 1});
  eq([s.players[0].restrictedMana.length, s.players[0].manaPool.G], [0, 1], "the Elf card's ability spends the restricted green first, the pool's kept");
}
{
  /* Woodland Weavemaster's {G}: an Elf card's cycling in his hand and an Elf card's ability in his graveyard, each offered;
     a Bear card's not. Castle Garenbrig's six {G}: a creature card's cycling in his hand is no creature's ability. */
  const s = table();
  const weave = put(s, card("Woodland Weavemaster"));
  const seer = put(s, being("Elf Seer", ["Elf"], {abilities: [CYCLING]}), "hand"), bear = put(s, being("Bear Seer", ["Bear"], {abilities: [CYCLING]}), "hand");
  const ghost = put(s, being("Elf Ghost", ["Elf"], {abilities: [RECALL]}), "graveyard");
  main(s);
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana" && a.objectId === weave && a.mana.G === 1));
  eq([activations(s, seer), activations(s, ghost), activations(s, bear)], [1, 1, 0], "Weavemaster's {G}: the Elf card's cycling and the Elf card's graveyard ability; not the Bear card's");
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate" && a.objectId === ghost));
  eq([s.players[0].restrictedMana.length, s.stack.length], [0, 1], "spent on the Elf card in his graveyard: its ability on the stack");
  const t = table();
  const castle = put(t, card("Castle Garenbrig"));
  for (const land of [WASTES, WASTES, FOREST, FOREST]) put(t, land);
  const cub = put(t, being("Bear Seer", ["Bear"], {abilities: [CYCLING]}), "hand"), bearOut = put(t, being("Bear", ["Bear"], {abilities: [PUMP]}));
  main(t);
  for (const id of t.zones.battlefield.filter((id) => ["Wastes", "Forest"].includes(t.objects[id].card))) applyAction(t, 0, legalActions(t, 0).find((a) => a.kind === "activate-mana" && a.objectId === id));
  applyAction(t, 0, legalActions(t, 0).find((a) => a.kind === "activate-mana" && a.objectId === castle && a.mana?.G === 6));
  eq([t.players[0].restrictedMana.length, activations(t, cub), activations(t, bearOut)], [6, 0, 1], "Castle Garenbrig's six: a Bear permanent's ability, not a Bear card's cycling in his hand");
}
{
  /* "Of a creature source of the chosen type" (Secluded Courtyard on Elf), read as the mana is made: an Elf card's cycling
     in his hand, not a Goblin card's -- and on Maya's turn too, an instant's speed, three at the table. */
  const s = table(3);
  const courtyard = put(s, card("Secluded Courtyard"));
  s.objects[courtyard].chosen = "Elf";
  const seer = put(s, being("Elf Seer", ["Elf"], {abilities: [CYCLING]}), "hand"), goblin = put(s, being("Goblin Seer", ["Goblin"], {abilities: [CYCLING]}), "hand");
  main(s);
  for (let n = 0; n < 200 && !(s.turn === 2 && s.phase === "MAIN1" && s.priorityPlayer === 1); n += 1) advance(s);
  passPriority(s); passPriority(s);
  eq(s.priorityPlayer, 0, "Maya and Trey pass: Rob holds priority on her turn");
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana" && a.objectId === courtyard && a.mana?.G === 1));
  eq([activations(s, seer), activations(s, goblin)], [1, 0], "on Maya's turn: the Elf card's cycling with it, the Goblin card's not");
}
{
  /* Words the engine reads, and refuses: `abilitySource` alone, or beside the others; a selector it cannot read refused. */
  const land = (spendOnly) => compileScript({schema: "CrankCardScript@1", identity: {name: "Odd Land", oracleId: "x", types: ["Land"], subtypes: [], manaCost: "", colors: [], colorIdentity: []},
    oracleText: "{T}: Add {G}. Spend this mana only to activate abilities of Elf sources.", source: "hand",
    abilities: [{kind: "activated", text: "{T}: Add {G}. Spend this mana only to activate abilities of Elf sources.", mana: true, cost: [{atom: "{T}"}], effects: [{effect: "addMana", mana: {G: 1}, spendOnly}]}]});
  eq([land({abilitySource: {subtypes: ["Elf"]}}).problems.length, land({spell: {subtypes: ["Elf"]}, abilitySource: {subtypes: ["Elf"]}}).problems.length, land({abilitySource: {bogus: 1}}).problems.length],
    [0, 0, 1], "read: an Elf source, alone or with Elf spells; refused: a selector it cannot read");
  eq(SPEND_ONLY_KEYS.includes("abilitySource"), true, "a spending restriction's keys name it");
}
{
  /* The card's own scenario, in a four-player game: Weavemaster's {G} cycles the Elf card in Rob's hand (his first draw, and the cycling's). */
  const at = (seat, zone, ...names) => ({seat, zone, cards: names});
  const seer = {types: ["Creature"], subtypes: ["Elf"], manaCost: "{G}", colors: ["G"], power: 1, toughness: 1, abilities: [CYCLING]};
  const {state} = runScenario({name: "four", seats: 4, setup: [at(0, "battlefield", "Woodland Weavemaster"), at(0, "hand", "Elf Seer")],
    steps: [{tap: "Woodland Weavemaster", mana: {G: 1}}, {activate: "Elf Seer"}, {resolve: true}],
    expect: [{seat: 0, zone: "graveyard", cards: ["Elf Seer"]}, {seat: 0, zone: "hand", count: 2}]}, cards.definition, {"Elf Seer": seer});
  eq(state.players[0].restrictedMana.length, 0, "four players: the Elf card cycled with Weavemaster's green");
}

console.log(`engine-restricted-source: ${checks} checks passed -- mana for abilities of a kind of source pays for that object wherever it is (a card in a hand or a graveyard, a permanent); for abilities of creatures, a permanent only.`);
