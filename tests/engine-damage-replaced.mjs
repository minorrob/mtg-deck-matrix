/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 47 (THE CATALOG'S ORDER): DAMAGE REPLACED (Forge's DamageDone replacement), IN THE FORMS THAT CHANGE
 * HOW MUCH (CR 614.1a, 615).
 *
 * "It deals double that damage instead", "triple", "that much damage plus 2", "prevent all combat damage that would be
 * dealt to attacking creatures you control" -- watched by what deals it (a source you control, a red one, a creature),
 * to whom (an opponent or their permanent, or anything), combat or not. And each effect once (CR 614.5) even when two
 * cards' share an ability id.
 *
 * WHEN SEVERAL APPLY TO ONE DAMAGE EVENT AND THE ORDER CHANGES HOW IT ENDS, THE PLAYER DEALT IT CHOOSES (CR 616.1): the
 * player hit, or the controller of the permanent hit, before any of it is dealt -- a damage effect in a resolution and the
 * combat damage step both ask first, and deal once every such hit is answered, each option said by where it leads. An
 * order that ends the same either way is no question. Damage run directly, where nothing can stop to ask, keeps the order
 * that leaves the least (the first block below, through `applyReplacements` and `runEffects` as before).
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {applyReplacements} from "../game/engine/rules/replacement.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {awaitingChoice, resolveAwaiting, advance} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const table = () => createState({matchId: "m", seed: "damage-replaced", players: [{name: "Rob"}, {name: "Maya"}]});
const on = (s, o, seat) => addObject(s, {...o, owner: seat, controller: seat}, "battlefield", null);
const BEAR = {card: "Bear", types: ["Creature"], colors: ["G"], power: 2, toughness: 2};
const IMP = {card: "Imp", types: ["Creature"], colors: ["R"], power: 1, toughness: 1};
const ROCK = {card: "Rock", types: ["Artifact"]};
/* What a source would deal: the amount after every replacement, or 0 if prevented. */
const dealt = (s, source, to, amount = 2, combat = false) => {
  const {proposal} = applyReplacements(s, {event: "damage", ...to, amount, sourceId: source, combat});
  return proposal.prevented ? 0 : proposal.amount;
};

{
  /* Twinflame Tyrant: a source Rob controls, to an opponent or their permanent -- doubled. Not to himself or his own, not
     Maya's source. */
  const s = table();
  on(s, card("Twinflame Tyrant"), 0);
  const imp = on(s, IMP, 0), hers = on(s, BEAR, 1), mine = on(s, BEAR, 0), mayas = on(s, IMP, 1);
  eq([dealt(s, imp, {toPlayer: 1}), dealt(s, imp, {toCard: hers}), dealt(s, imp, {toPlayer: 0}), dealt(s, imp, {toCard: mine}), dealt(s, mayas, {toPlayer: 0})],
    [4, 4, 2, 2, 2], "his Imp to Maya or her Bear: 4; to himself or his own Bear: 2; Maya's Imp to Rob: 2");
}
{
  /* Torbran: a red source, plus 2. Gratuitous Violence: a creature, doubled. Fiery Emancipation: his, to anything, tripled. */
  const s = table();
  on(s, card("Torbran, Thane of Red Fell"), 0);
  const imp = on(s, IMP, 0), bear = on(s, BEAR, 0);
  eq([dealt(s, imp, {toPlayer: 1}), dealt(s, bear, {toPlayer: 1})], [4, 2], "Torbran: a red Imp, 2 plus 2; a green Bear, 2");
  const t = table();
  on(t, card("Gratuitous Violence"), 0);
  eq([dealt(t, on(t, BEAR, 0), {toPlayer: 1}), dealt(t, on(t, ROCK, 0), {toPlayer: 1})], [4, 2], "Gratuitous Violence: a creature, doubled; an artifact, not");
  const u = table();
  on(u, card("Fiery Emancipation"), 0);
  const rock = on(u, ROCK, 0);
  eq([dealt(u, rock, {toPlayer: 1}), dealt(u, rock, {toPlayer: 0}), dealt(u, on(u, ROCK, 1), {toPlayer: 0})], [6, 6, 2], "Fiery Emancipation: his, to Maya or to himself, tripled; Maya's, not");
}
{
  /* Dolmen Gate: combat damage to his attacking creatures -- not noncombat, not a creature not attacking. */
  const s = table();
  on(s, card("Dolmen Gate"), 0);
  const attacker = on(s, BEAR, 0), home = on(s, BEAR, 0), blocker = on(s, BEAR, 1);
  s.combat = {attacks: [{attacker, defender: {playerId: 1}}]};
  eq([dealt(s, blocker, {toCard: attacker}, 2, true), dealt(s, blocker, {toCard: attacker}, 2, false), dealt(s, blocker, {toCard: home}, 2, true)], [0, 2, 2],
    "combat damage to his attacking Bear: prevented; noncombat damage to it, or combat damage to one at home: dealt");
}
{
  /* Two at once, the order that leaves the least: Torbran and Fiery Emancipation on Maya's 2 -- tripled, then plus 2, is
     8; plus 2, then tripled, would be 12. A shield of 3 and a doubler on 2: the shield first, 0. */
  const s = table();
  on(s, card("Torbran, Thane of Red Fell"), 0); on(s, card("Fiery Emancipation"), 0);
  const imp = on(s, IMP, 0);
  eq(dealt(s, imp, {toPlayer: 1}), 8, "Torbran and Fiery Emancipation, 2 to Maya: 8, the least of 8 and 12");
  const events = runEffects(s, [{effect: "dealDamage", amount: 2, who: [1]}], {controller: 0, source: imp});
  eq([s.players[1].life, events.find((e) => e.kind === "GameEventPlayerDamaged").data.fields.amount], [32, 8], "dealt by an effect: Maya at 32, the event says 8");
  const t = table();
  on(t, card("Dictate of the Twin Gods"), 0);
  const shield = on(t, {card: "Shield", types: ["Artifact"], abilities: [{id: "a1", kind: "replacement", text: "Prevent the next 3 damage that would be dealt to you.", watches: {event: "damage", toPlayer: "controller"}, prevent: 3}]}, 1);
  eq([dealt(t, on(t, IMP, 0), {toPlayer: 1}), t.objects[shield].abilities[0].prevent], [0, 1], "a shield of 3 and Dictate, 2 to Maya: the shield first -- 0, and 1 of the shield left");
}
{
  /* Each effect once (CR 614.5), even when two cards' effects share an id: Dictate and Twinflame are each "a1". */
  const s = table();
  on(s, card("Dictate of the Twin Gods"), 0); on(s, card("Twinflame Tyrant"), 0);
  eq(dealt(s, on(s, IMP, 0), {toPlayer: 1}), 8, "Dictate and Twinflame Tyrant: 2, doubled by each, 8");
}
{
  /* Batch 71 built the two forms this held back for -- redirecting damage (Pariah) and prevention with a consequence (The
     Mindskinner, Vigor) -- and credits it (tests/engine-damage-redirect.mjs). */
  eq(missingFor({replacements: ["DamageDone"]}), [], "the catalog credits DamageDone: redirecting damage and prevention with a consequence are built");
}

/* ---- CR 616.1: the order asked of the player dealt it, where it changes how the damage ends ---- */
const at = (seat, zone, ...names) => ({seat, zone, cards: names});
const FIX = {Imp: {types: ["Creature"], manaCost: "{R}", colors: ["R"], power: 2, toughness: 2},
  Wall: {types: ["Creature"], manaCost: "{4}", colors: [], power: 0, toughness: 20},
  Ward: {types: ["Artifact"], manaCost: "{1}", colors: [], abilities: [{id: "a1", kind: "replacement", text: "Prevent the next 3 damage that would be dealt to you.", watches: {event: "damage", toPlayer: "controller"}, prevent: 3}]},
  Quake: {types: ["Sorcery"], manaCost: "{R}", colors: ["R"], spell: {id: "s0", text: "Quake deals 2 damage to each creature.", targets: [], effects: [{effect: "damageAll", amount: 2}]}}};
const play = (name, setup, steps) => runScenario({name, setup, steps}, cards.definition, FIX);
const labels = (state) => awaitingChoice(state).options.map((o) => o.label);
const bolt = (target) => [{tap: "Mountain"}, {cast: "Lightning Bolt", targets: [target]}, {resolve: true}];
const TORBRAN_FIERY = ["Torbran, Thane of Red Fell", "Fiery Emancipation", "Mountain"];
{
  const setup = [at(0, "battlefield", ...TORBRAN_FIERY), at(0, "hand", "Lightning Bolt")];
  const {state} = play("a Bolt at Maya", setup, bolt({player: 1}));
  eq([state.awaiting?.kind, state.awaiting?.player, state.players[1].life, awaitingChoice(state).title, labels(state)],
    ["effect-choice", 1, 40, "3 damage from Lightning Bolt to Maya: which applies first?", ["Torbran, Thane of Red Fell first: 15 damage", "Fiery Emancipation first: 11 damage"]],
    "Torbran and Fiery Emancipation on Rob's Bolt at Maya: Maya is asked which applies first, before any of it is dealt, each way by what it leads to");
  eq([0, 1].map((i) => play(`a Bolt at Maya, ${i}`, setup, [...bolt({player: 1}), {answer: [i]}]).state.players[1].life), [25, 29],
    "and it is dealt as she chose: Torbran's first, 15; Fiery Emancipation's first, 11");
  const wall = play("a Bolt at Maya's Wall", [...setup, at(1, "battlefield", "Wall")], bolt({card: "Wall"})).state;
  eq([wall.awaiting?.player, awaitingChoice(wall).title], [1, "3 damage from Lightning Bolt to Wall: which applies first?"], "at her Wall, Maya is asked: the permanent's controller chooses (CR 616.1)");
  const same = play("two doublers", [at(0, "battlefield", "Dictate of the Twin Gods", "Twinflame Tyrant", "Mountain"), at(0, "hand", "Lightning Bolt")], bolt({player: 1})).state;
  eq([same.awaiting, same.players[1].life], [null, 28], "the Dictate and Twinflame Tyrant double it either way: 12, and nobody is asked");
}
{
  /* A prevention that counts what it stopped: The Mindskinner's "each opponent mills that many", with the Dictate. */
  const setup = [at(0, "battlefield", "The Mindskinner", "Dictate of the Twin Gods", "Mountain"), at(0, "hand", "Lightning Bolt")];
  const {state} = play("the Mindskinner and a doubler", setup, bolt({player: 1}));
  eq(labels(state), ["The Mindskinner first: 0 damage, 3 prevented", "Dictate of the Twin Gods first: 0 damage, 6 prevented"],
    "The Mindskinner and the Dictate on a Bolt at Maya: no damage either way, but how much is prevented -- and so milled -- is hers to choose");
  const library = (st) => st.zones.library[1].length;
  eq([0, 1].map((i) => library(state) - library(play(`the Mindskinner, ${i}`, setup, [...bolt({player: 1}), {answer: [i]}]).state)), [3, 6],
    "and she mills as she chose: 3, or 6");
}
{
  /* A shield and a doubler: asking spends nothing; the shield wears out only as the damage is dealt (CR 615.1). */
  const setup = [at(0, "battlefield", "Dictate of the Twin Gods", "Mountain"), at(0, "hand", "Lightning Bolt"), at(1, "battlefield", "Ward")];
  const {state} = play("a shield and a doubler", setup, bolt({player: 1}));
  const shield = (st) => Object.values(st.objects).find((o) => o.card === "Ward").abilities[0].prevent;
  eq([labels(state), shield(state)], [["Dictate of the Twin Gods first: 3 damage", "Ward first: 0 damage"], 3], "Maya's shield of 3 and Rob's Dictate on 3: asked, and the shield untouched by the asking");
  const answered = [0, 1].map((i) => play(`a shield and a doubler, ${i}`, setup, [...bolt({player: 1}), {answer: [i]}]).state);
  eq(answered.map((st) => [st.players[1].life, shield(st)]), [[37, 0], [40, 0]], "the Dictate first, 6 less 3 is dealt; the shield first, nothing -- the shield spent either way");
}
{
  /* One effect, several hits: each hit its own question, every answer in before any of it is dealt. */
  const setup = [at(0, "battlefield", ...TORBRAN_FIERY), at(0, "hand", "Quake"), at(1, "battlefield", "Wall", "Wall")];
  const quake = [{tap: "Mountain"}, {cast: "Quake"}, {resolve: true}];
  const {state} = play("a Quake", setup, [...quake, {answer: [1]}]);
  const walls = Object.values(state.objects).filter((o) => o.card === "Wall" && o.zone === "battlefield");
  eq([state.awaiting?.player, walls.map((w) => w.damage)], [1, [0, 0]], "Quake on Maya's two Walls: the first answered, the second asked, and neither dealt damage yet");
  const done = play("a Quake, answered", setup, [...quake, {answer: [1]}, {answer: [0]}]).state;
  eq(Object.values(done.objects).filter((o) => o.card === "Wall" && o.zone === "battlefield").map((w) => w.damage), [8, 12], "then both at once, each as she chose: 8 and 12");
}
{
  /* In combat: a blocked Imp's 2 to Maya's Wall is hers to order, asked in the damage step before anything is dealt; the
     Wall's 0 back is nothing to ask about. */
  const s = play("an Imp blocked", [at(0, "battlefield", "Torbran, Thane of Red Fell", "Fiery Emancipation", "Imp"), at(1, "battlefield", "Wall")], [{to: {turn: 3, phase: "MAIN1"}}, {attack: ["Imp"]}]).state;
  const step = () => { if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s); };
  for (let n = 0; n < 50 && s.awaiting?.kind !== "declare-blockers"; n += 1) step();
  resolveAwaiting(s, [awaitingChoice(s).options.findIndex((o) => o.label === "Wall blocks Imp")]);
  for (let n = 0; n < 50 && s.awaiting?.kind !== "order-damage"; n += 1) step();
  const wall = () => Object.values(s.objects).find((o) => o.card === "Wall" && o.zone === "battlefield");
  eq([s.phase, s.awaiting?.player, labels(s), wall().damage], ["COMBAT_DAMAGE", 1, ["Torbran, Thane of Red Fell first: 12 damage", "Fiery Emancipation first: 8 damage"], 0],
    "the Imp blocked by Maya's Wall: in the combat damage step Maya, the Wall's controller, is asked first -- and nothing is dealt yet");
  resolveAwaiting(s, [1]);
  eq([s.awaiting, wall().damage], [null, 8], "then dealt as she chose: 8");
}
{
  /* The house pilot, dealt it, takes the order that leaves the least. */
  const {state} = play("the pilot's Bolt", [at(0, "battlefield", ...TORBRAN_FIERY), at(0, "hand", "Lightning Bolt")], bolt({player: 1}));
  const pilot = housePilot({seat: 1, cards: (name) => cards.definition(name)});
  eq(pilot.answer(projectFor(state, 1), awaitingChoice(state)), {indices: [1]}, "the house pilot in Maya's seat picks Fiery Emancipation first: 11, not 15");
}

console.log(`engine-damage-replaced: ${checks} checks passed — doubled, tripled, plus 2, prevented in combat; by whose source, to whom; the order of two asked of the player dealt it where it changes the end, the least where nothing can ask; each effect once by holder.`);
