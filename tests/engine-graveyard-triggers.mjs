/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "PUT INTO YOUR GRAVEYARD FROM ANYWHERE" AND "LEAVE YOUR GRAVEYARD" (Rob's Priority Batch 10.3, its thirty-fifth slice:
 * Moonshadow, the 162nd card of Rob's list, Garrison Excavator, the 286th, Quintorius, History Chaser, the 597th, and
 * Quintorius, Field Historian, the 872nd).
 *
 * Two trigger kinds (cards/index.mjs, rules/trigger.mjs). `put into graveyard`: a card arriving in a graveyard from any
 * zone, read as the card it became there -- a token is no card (CR 108.2b) -- `owner` whose graveyard (a card goes to
 * its owner's, CR 400.3), `filter` what the card must be. `left graveyard`: a card leaving a graveyard, to any zone, cast
 * from it included, the graveyard its owner's. "One or more" is `batch`, once for all one action moved (CR 603.2c).
 *
 * The card scenarios play the cards. This suite holds whose graveyard, a token, a filter, the batch, a card cast from a
 * graveyard, and the compiler.
 */
import assert from "node:assert/strict";
import {compileScript, TRIGGER_KINDS} from "../game/engine/cards/index.mjs";
import {isTriggerEvent} from "../game/engine/vocabulary.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const script = (name, identity, abilities) => compileScript({schema: "CrankCardScript@1", identity: {name, oracleId: "00000000-0000-4000-8000-000000000000", ...identity},
  oracleText: abilities.map((a) => a.text).join("\n"), source: "hand", abilities});
const compiled = (name, identity, abilities) => {
  const {definition, problems} = script(name, identity, abilities);
  assert.deepEqual(problems, [], `${name} compiles`);
  return definition;
};
/* A watcher gains its controller 1 life each time it triggers. */
const watcher = (name, trigger) => compiled(name, {types: ["Enchantment"], manaCost: "{1}", colors: []},
  [{kind: "triggered", text: `${name}: you gain 1 life.`, trigger, effects: [{effect: "gainLife", amount: 1}]}]);
const spell = (name, text, effects, targets = []) => ({types: ["Sorcery"], manaCost: "{B}", colors: ["B"], spell: {id: "s", text, targets, effects}});
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  /* "Whenever one or more cards are put into your graveyard", "whenever a land card is", "into an opponent's". */
  Keeper: watcher("Keeper", {on: "put into graveyard", batch: true}),
  "Land Keeper": watcher("Land Keeper", {on: "put into graveyard", filter: {types: ["Land"]}}),
  "Creature Keeper": watcher("Creature Keeper", {on: "put into graveyard", filter: {types: ["Creature"]}}),
  "Rival Keeper": watcher("Rival Keeper", {on: "put into graveyard", owner: "opponent", filter: {types: ["Creature"]}}),
  /* "Whenever one or more cards leave your graveyard", "an opponent's". */
  Digger: watcher("Digger", {on: "left graveyard", batch: true}),
  "Rival Digger": watcher("Rival Digger", {on: "left graveyard", owner: "opponent", batch: true}),
  Snuff: {...spell("Snuff", "Destroy target creature.", [{effect: "destroy", targets: {target: 0}}], [{what: "permanent", types: ["Creature"]}]), types: ["Instant"]},
  Grind: spell("Grind", "Mill two cards.", [{effect: "mill", count: 2}]),
  Spawn: spell("Spawn", "Create a 1/1 black Rat creature token.", [{effect: "createToken", count: 1, token: {name: "Rat", types: ["Creature"], subtypes: ["Rat"], colors: ["B"], power: 1, toughness: 1}}]),
  Raise: spell("Raise", "Return target creature card from your graveyard to your hand.", [{effect: "moveZone", targets: {target: 0}, to: "hand"}],
    [{what: "card", zone: "graveyard", controller: "you", types: ["Creature"]}]),
  Cleanse: spell("Cleanse", "Exile all cards from all graveyards.", [{effect: "moveZoneAll", selector: {what: "card", zone: "graveyard"}, to: "exile"}]),
  /* A card cast from a graveyard leaves it (CR 702.34a). */
  Echo: compiled("Echo", {types: ["Sorcery"], manaCost: "{B}", colors: ["B"]}, [{kind: "spell", text: "You gain 2 life.", targets: [], effects: [{effect: "gainLife", amount: 2}]},
    {kind: "keyword", keyword: "flashback", text: "Flashback {B}", cost: [{atom: "mana", cost: "{B}"}]}]),
};
const play = (setup, steps, more = {}) => runScenario({name: "graveyards", setup, steps, ...more}, index.definition, FIX).state;
const life = (s) => s.players.map((p) => p.life);

/* ---- put into a graveyard ---- */
{
  /* Snuff resolves: the Bear and then Snuff itself into Rob's graveyard -- one action, so "one or more" once; a creature
     card each time; no land. */
  const s = play([at(0, "battlefield", "Keeper", "Creature Keeper", "Land Keeper", "Swamp", "Bear"), at(0, "hand", "Snuff")],
    [{tap: "Swamp"}, {cast: "Snuff", targets: [{card: "Bear"}]}, {resolve: true}, {settle: true}]);
  eq(life(s), [42, 40], "the Bear and Snuff, one action: \"one or more\" once, the creature card once, no land card");
}
{
  const s = play([at(0, "battlefield", "Keeper", "Land Keeper", "Swamp"), at(0, "hand", "Grind")], [{tap: "Swamp"}, {cast: "Grind"}, {resolve: true}, {settle: true}],
    {library: ["Forest", "Island", "Plains"]});
  eq(life(s), [43, 40], "two lands milled from the library and Grind after them: \"one or more\" once, \"a land card\" once each");
}
{
  /* A token is no card: the Rat dies, and "a creature card" does not trigger. */
  const s = play([at(0, "battlefield", "Creature Keeper", "Swamp", "Swamp"), at(0, "hand", "Spawn", "Snuff")],
    [{tap: "Swamp"}, {cast: "Spawn"}, {resolve: true}, {tap: "Swamp"}, {cast: "Snuff", targets: [{card: "Rat"}]}, {resolve: true}, {settle: true}]);
  eq([life(s), s.stack.length], [[40, 40], 0], "the Rat token destroyed: no creature card put into the graveyard");
}
{
  /* Whose graveyard: Maya's Bear goes to Maya's. */
  const s = play([at(0, "battlefield", "Creature Keeper", "Rival Keeper", "Swamp"), at(0, "hand", "Snuff"), at(1, "battlefield", "Bear")],
    [{tap: "Swamp"}, {cast: "Snuff", targets: [{card: "Bear", seat: 1}]}, {resolve: true}, {settle: true}]);
  eq(life(s), [41, 40], "Maya's Bear into Maya's graveyard: \"an opponent's\" triggers, \"your\" does not");
}
/* ---- leaving a graveyard ---- */
{
  const s = play([at(0, "battlefield", "Digger", "Rival Digger", "Swamp"), at(0, "hand", "Raise"), at(0, "graveyard", "Bear")],
    [{tap: "Swamp"}, {cast: "Raise", targets: [{card: "Bear"}]}, {resolve: true}, {settle: true}]);
  eq(life(s), [41, 40], "the Bear card returned from Rob's graveyard: \"your graveyard\" triggers, \"an opponent's\" does not");
}
{
  const s = play([at(0, "battlefield", "Digger", "Rival Digger", "Swamp"), at(0, "hand", "Cleanse"), at(0, "graveyard", "Bear", "Forest", "Island"), at(1, "graveyard", "Plains", "Island")],
    [{tap: "Swamp"}, {cast: "Cleanse"}, {resolve: true}, {settle: true}]);
  eq(life(s), [42, 40], "every graveyard exiled at once: Rob's three cards once, Maya's two once");
}
{
  const s = play([at(0, "battlefield", "Digger", "Swamp"), at(0, "graveyard", "Echo")], [{tap: "Swamp"}, {cast: "Echo"}, {settle: true}]);
  eq(life(s)[0], 43, "Echo cast from Rob's graveyard with flashback: it left the graveyard (1), and resolved (2)");
}

/* ---- the compiler ---- */
const trigger = (t) => script("Odd Watcher", {types: ["Enchantment"], manaCost: "{1}", colors: []}, [{kind: "triggered", text: "Odd: you gain 1 life.", trigger: t, effects: [{effect: "gainLife", amount: 1}]}]).problems.length;
eq([trigger({on: "put into graveyard"}), trigger({on: "put into graveyard", owner: "any", filter: {types: ["Land"]}}), trigger({on: "left graveyard", owner: "opponent"})], [0, 0, 0],
  "read: into your graveyard, into any with a filter, out of an opponent's");
eq([trigger({on: "put into graveyard", owner: "Maya"}), trigger({on: "left graveyard", filter: {types: ["Land"]}}), trigger({on: "put into graveyard", filter: {bogus: 1}})], [1, 1, 1],
  "refused: an owner it cannot read, a filter on cards leaving (not built), a filter it cannot read");
ok(["put into graveyard", "left graveyard"].every((kind) => TRIGGER_KINDS.includes(kind) && isTriggerEvent(kind)), "both kinds a card may name, and the vocabulary's");

for (const name of ["Moonshadow", "Garrison Excavator", "Quintorius, History Chaser", "Quintorius, Field Historian"]) ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-graveyard-triggers: ${checks} checks passed -- into a graveyard from anywhere, a card and not a token, its owner's; out of one, cast from it included; "one or more" once an action; the compiler.`);
