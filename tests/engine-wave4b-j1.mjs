/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* WAVE 4B, LANE J1: REMEMBERED AND MOVED OBJECTS, AND THE RULES THE LANE'S MOST-PLAYED CARDS NEEDED BESIDE THEM -- what the
 * scenarios of its twenty-six cards cannot reach.
 *
 *   - "ENCHANT CREATURE CARD IN A GRAVEYARD" (Animate Dead; CR 303.4a, 704.5m): an Aura attached to a card in a graveyard
 *     (rules/sba.mjs), chosen as it enters without being cast (CR 303.4f; effects/permanents.mjs, enchantable); "it loses ...
 *     and gains 'enchant creature put onto the battlefield with this Aura'" (attach's `enchants`, the Aura's `enchantOnly`);
 *     and "that creature" kept for its leaves-the-battlefield trigger (effects/zones.mjs, moveZone's `link` for what it put
 *     onto the battlefield).
 *   - A LAND GIVEN A BASIC LAND TYPE HAS ITS MANA ABILITY (Urborg, Tomb of Yawgmoth; CR 305.6; rules/layers.mjs).
 *   - PROTECTION OVER THE PERMANENTS A SPELL NAMED (Akroma's Will; CR 702.16, 611.2c; rules/protection.mjs).
 *   - "IF YOU CAST IT" (The One Ring; script/condition.mjs, `castByYou`).
 *   - "AN ADDITIONAL ONE MANA OF THE CHOSEN COLOR" (Utopia Sprawl; CR 605.1b; cards/index.mjs, rules/trigger.mjs).
 *   - "CREATURES YOUR OPPONENTS CONTROL ATTACK THIS TURN IF ABLE" (Bident of Thassa; CR 508.1d, 611.2c; rules/statics.mjs).
 *   - "ONTO THE BATTLEFIELD UNDER YOUR CONTROL", ALL OF THEM (Rise of the Dark Realms; CR 110.2a; effects/zones.mjs moveZoneAll).
 */
import {play, happen, idOf, index, checks, creature, at, drive} from "./helpers/x11-keywords.mjs";
import {abilitiesOf} from "../game/engine/rules/layers.mjs";
import {protectedFrom} from "../game/engine/rules/protection.mjs";
import {attacksEachCombat} from "../game/engine/rules/statics.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {enchantable} from "../game/engine/script/effects/permanents.mjs";
import {conditionHolds, conditionProblems} from "../game/engine/script/condition.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {addObject} from "../game/engine/state/index.mjs";
import {tableDefinition} from "../game/engine/cards/definitions.mjs";
import {afterResolving} from "../game/engine/rules/priority.mjs";

const {eq, ok, done} = checks("engine-wave4b-j1");
const FIX = {
  Bear: creature(["Bear"], 2, 2), "Their Bear": creature(["Bear"], 2, 2),
  Ogre: creature(["Ogre"], 3, 3, {colors: ["R"], manaCost: "{2}{R}"}),
};
const names = (s, zone, seat) => s.zones[zone][seat].map((id) => s.objects[id].card).sort();
const mana = (s, id) => abilitiesOf(s, id).filter((a) => a.kind === "mana");
/* State-based actions and the triggers they make (CR 117.5), then the stack resolved. */
const settled = (s) => { afterResolving(s, []); drive(s, (st) => st.stack.length === 0 && !st.awaiting && st.priorityPlayer !== null); };

/* ---- Animate Dead: an Aura on a card in a graveyard, then on the creature put onto the battlefield with it ---- */
const AD = ["Swamp", "Wastes"];
const animated = () => play([at(0, "hand", "Animate Dead"), at(0, "battlefield", ...AD, "Bear"), at(1, "graveyard", "Ogre")],
  [{tap: "Swamp"}, {tap: "Wastes"}, {cast: "Animate Dead", targets: [{card: "Ogre"}]}, {resolve: true}], {}, FIX);
{
  const s = animated();
  const aura = idOf(s, "Animate Dead"), ogreCard = s.zones.graveyard[1][0];
  eq([s.objects[aura].attachedTo, s.objects[ogreCard].zone, s.objects[aura].enchantOnly], [ogreCard, "graveyard", undefined],
    "Animate Dead enters attached to the Ogre card in Maya's graveyard, its Enchant still the printed one");
  drive(s, (st) => st.stack.length === 0 && st.priorityPlayer !== null);
  const ogre = idOf(s, "Ogre");
  eq([s.objects[aura].attachedTo, s.objects[aura].enchantOnly, s.objects[ogre].controller], [ogre, ogre, 0],
    "the trigger returned the Ogre under Rob's control, and the Aura enchants that creature alone (enchantOnly)");
  eq((s.links ?? {})[aura], [ogre], "and the creature it put onto the battlefield is kept against the Aura, for \"that creature\"");
}
{
  /* "Enchant creature put onto the battlefield with this Aura": moved onto another creature, it is attached to an illegal
     object (CR 704.5m) and goes -- and its leaving makes Rob sacrifice the Ogre. */
  const s = animated();
  drive(s, (st) => st.stack.length === 0 && st.priorityPlayer !== null);
  happen(s, {effect: "attach", source: idOf(s, "Animate Dead"), targets: [idOf(s, "Bear")]}, {controller: 0, source: null});
  settled(s);
  eq([names(s, "graveyard", 0), names(s, "graveyard", 1)], [["Animate Dead"], ["Ogre"]], "moved onto the Bear it is illegal: to the graveyard, and the Ogre sacrificed");
  ok(idOf(s, "Bear") !== undefined, "the Bear stays");
}
{
  /* "Creature": the Ogre made an artifact, no creature, is no longer what the Aura may enchant. */
  const s = animated();
  drive(s, (st) => st.stack.length === 0 && st.priorityPlayer !== null);
  happen(s, {effect: "effectUntil", targets: [idOf(s, "Ogre")], layer: 4, apply: {setTypes: ["Artifact"]}, until: "end-of-turn"}, {controller: 1, source: null});
  settled(s);
  eq([names(s, "graveyard", 0), names(s, "graveyard", 1)], [["Animate Dead"], ["Ogre"]], "the Ogre no creature: the Aura goes, and the Ogre is sacrificed");
}
{
  /* "Loses 'enchant creature card in a graveyard'" whether or not anything came back: with nothing put onto the battlefield,
     the Aura may enchant nothing (enchantOnly null). */
  const s = animated();
  const aura = idOf(s, "Animate Dead");
  happen(s, {effect: "attach", targets: [], enchants: true}, {controller: 0, source: aura});
  eq(s.objects[aura].enchantOnly, null, "attach with enchants and nothing to attach to: the Aura enchants nothing it may");
  settled(s);
  eq(names(s, "graveyard", 0), ["Animate Dead"], "and goes to the graveyard (CR 704.5m)");
}
{
  /* CR 303.4f: what an Aura entering without being cast may enchant -- a card in the zone its Enchant names. */
  const s = play([at(0, "graveyard", "Bear", "Swamp"), at(1, "graveyard", "Ogre"), at(1, "battlefield", "Their Bear")], [], {}, FIX);
  const cards = enchantable(s, {what: "card", zone: "graveyard", types: ["Creature"]}, 0).map((id) => s.objects[id].card).sort();
  eq(cards, ["Bear", "Ogre"], "creature cards in every graveyard, and not the creature on the battlefield nor the land card");
  eq(enchantable(s, {what: "permanent", types: ["Creature"]}, 0).map((id) => s.objects[id].card), ["Their Bear"], "a permanent's Enchant still finds permanents only");
}
{
  const script = (effect) => ({schema: "CrankCardScript@1", identity: {name: "Odd", oracleId: "odd", types: ["Enchantment"], subtypes: ["Aura"], manaCost: "{1}", colors: ["B"],
    colorIdentity: ["B"], power: null, toughness: null}, oracleText: "x", source: "hand", abilities: [{kind: "triggered", text: "x", trigger: {on: "enters", who: "self"}, effects: [effect]}]});
  const errors = (effect, key) => validateScript(script(effect)).errors.filter((e) => e.path.endsWith(key)).length;
  eq([errors({effect: "attach", targets: "remembered", enchants: true}, "enchants"), errors({effect: "attach", targets: "remembered", enchants: true, source: "that card"}, "enchants"),
    errors({effect: "pump", targets: "remembered", enchants: true}, "enchants"), errors({effect: "attach", targets: "remembered", enchants: "yes"}, "enchants")], [0, 1, 1, 1],
  "enchants is attach's, true, on the Aura attaching itself");
}

/* ---- Urborg, Tomb of Yawgmoth: a land given a basic land type has its mana ability (CR 305.6) ---- */
{
  const s = play([at(0, "battlefield", "Urborg, Tomb of Yawgmoth", "Forest", "Swamp", "Underground Sea")], [], {}, FIX);
  const forest = idOf(s, "Forest"), swamp = idOf(s, "Swamp"), sea = idOf(s, "Underground Sea");
  eq(mana(s, forest).map((a) => a.produces), [{G: 1}, {B: 1}], "the Forest has its own {G} and the Swamp's {B}");
  eq(mana(s, forest)[1].tapSelf, true, "the given ability taps the land");
  eq([mana(s, swamp).length, mana(s, sea).length], [1, 1], "a land that is a Swamp already gets no second ability");
  /* Given in layer 4, so an effect that takes abilities away in layer 6 takes it too (CR 613.1). */
  happen(s, {effect: "effectUntil", targets: [forest], layer: 6, apply: {removeAllAbilities: true}, until: "end-of-turn"}, {controller: 1, source: null});
  eq(mana(s, forest).length, 0, "the Forest losing all abilities loses the {B} too");
}

/* ---- Akroma's Will: protection from each color over the creatures it named, no player's ---- */
{
  const s = play([at(0, "battlefield", "Bear"), at(1, "battlefield", "Ogre", "Sol Ring")], [], {}, FIX);
  const bear = idOf(s, "Bear"), ogre = idOf(s, "Ogre"), ring = idOf(s, "Sol Ring");
  happen(s, {effect: "effectUntil", rule: "protection", from: {colors: ["W", "U", "B", "R", "G"]}, selector: {what: "permanent", types: ["Creature"], controller: "you"}, until: "end-of-turn"},
    {controller: 0, source: null});
  eq([protectedFrom(s, {card: bear}, ogre), protectedFrom(s, {card: bear}, ring)], [true, false], "the Bear has protection from the red Ogre, and none from a colorless Sol Ring");
  eq([protectedFrom(s, {player: 0}, ogre), protectedFrom(s, {card: ogre}, bear)], [false, false], "Rob himself has no protection, nor Maya's Ogre");
  const later = addObject(s, {...FIX.Bear, card: "Bear", owner: 0, controller: 0}, "battlefield");
  eq(protectedFrom(s, {card: later}, ogre), false, "a creature that arrives after it resolved has none (CR 611.2c)");
}

/* ---- The One Ring: "if you cast it" ---- */
{
  const s = play([at(0, "battlefield", "The One Ring")], [], {}, FIX);
  const ring = idOf(s, "The One Ring");
  eq([conditionHolds(s, {castByYou: true}, {controller: 0, source: ring}), conditionHolds(s, {castByYou: false}, {controller: 0, source: ring})], [false, true],
    "not cast: \"if you cast it\" is false");
  s.objects[ring].castFrom = {zone: "graveyard", by: 0};
  eq(conditionHolds(s, {castByYou: true}, {controller: 0, source: ring}), true, "cast by its controller, from anywhere: true");
  s.objects[ring].castFrom = {zone: "hand", by: 1};
  eq(conditionHolds(s, {castByYou: true}, {controller: 0, source: ring}), false, "cast by another player: false");
  eq(conditionProblems({castByYou: "yes"}), ["castByYou is true or false"], "castByYou is true or false");
}

/* ---- Utopia Sprawl: an additional mana of the chosen color, or none with none chosen ---- */
{
  const s = play([at(0, "hand", "Utopia Sprawl"), at(0, "battlefield", "Forest", "Llanowar Elves")],
    [{tap: "Llanowar Elves"}, {cast: "Utopia Sprawl", targets: [{card: "Forest"}]}, {resolve: true}, {choose: ["Green"]}], {}, FIX);
  const sprawl = idOf(s, "Utopia Sprawl");
  eq(index.definition("Utopia Sprawl").abilities.find((a) => a.kind === "triggered").trigger.manaAbility, {chosenColor: true}, "a triggered mana ability of the chosen color");
  delete s.objects[sprawl].chosen;
  const tap = legalActions(s, 0).find((a) => a.kind === "activate-mana" && a.label === "Forest");
  applyAction(s, 0, tap);
  eq(s.players[0].manaPool, {W: 0, U: 0, B: 0, R: 0, G: 1, C: 0}, "with no color chosen it adds nothing: the Forest's {G} alone");
}

/* ---- Bident of Thassa: a requirement for the turn over the creatures Rob's opponents control ---- */
{
  const s = play([at(0, "battlefield", "Bident of Thassa", "Island", "Wastes", "Bear"), at(1, "battlefield", "Their Bear")],
    [{tap: "Island"}, {tap: "Wastes"}, {activate: "Bident of Thassa"}, {resolve: true}], {}, FIX);
  const bident = idOf(s, "Bident of Thassa"), theirs = idOf(s, "Their Bear"), mine = idOf(s, "Bear");
  eq([attacksEachCombat(s, theirs), attacksEachCombat(s, mine)], [[bident], []], "Maya's Bear must attack, as Bident says; Rob's need not");
  const effect = s.effects.find((e) => e.rule === "attacks-each-combat");
  eq([effect.sourceId, effect.sourceName], [bident, "Bident of Thassa"], "named by its source, for the refusal's words");
  const arrived = addObject(s, {...FIX.Bear, card: "Bear", owner: 1, controller: 1}, "battlefield");
  eq(attacksEachCombat(s, arrived), [bident], "a creature Maya controls from now on must attack too (CR 611.2c)");
  /* A requirement for one combat (Legion Warboss's token) is not this turn-long one. */
  s.effects.push({id: "x", rule: "attacks-each-combat", affects: {ids: [mine]}, combat: 1, until: "end-of-turn", sourceId: null, sourceController: 0});
  s.combatsThisTurn = 2;
  eq(attacksEachCombat(s, mine), [], "a requirement for the first combat does not bind the second");
}

/* ---- Rise of the Dark Realms: under its controller's control, each of them ---- */
{
  const script = (effect) => ({schema: "CrankCardScript@1", identity: {name: "Odd", oracleId: "odd", types: ["Sorcery"], subtypes: [], manaCost: "{1}", colors: ["B"],
    colorIdentity: ["B"], power: null, toughness: null}, oracleText: "x", source: "hand", abilities: [{kind: "spell", text: "x", effects: [effect]}]});
  const errors = (effect) => validateScript(script(effect)).errors.filter((e) => e.path.endsWith("controller")).length;
  const all = {effect: "moveZoneAll", selector: {what: "card", zone: "graveyard", types: ["Creature"]}};
  eq([errors({...all, to: "battlefield", controller: "you"}), errors({...all, to: "hand", controller: "you"}), errors({...all, to: "battlefield", controller: "opponent"})], [0, 1, 1],
    "a move of all under its controller's control is controller: \"you\", onto the battlefield");
  const s = play([at(1, "graveyard", "Ogre")], [], {}, FIX);
  happen(s, {effect: "moveZoneAll", selector: {what: "card", zone: "graveyard", types: ["Creature"]}, to: "battlefield", controller: "you"}, {controller: 0, source: null});
  eq(s.objects[idOf(s, "Ogre")].controller, 0, "Maya's Ogre card enters under Rob's control");
}

/* ---- each definition, compiled whole ---- */
for (const name of ["An Offer You Can't Refuse", "Urborg, Tomb of Yawgmoth", "Boseiju, Who Endures", "The One Ring", "Nykthos, Shrine to Nyx", "Akroma's Will",
  "Animate Dead", "Harrow", "Hullbreaker Horror", "Seething Song", "Lotus Cobra", "Seat of the Synod", "Entomb", "Rampaging Baloths", "Dimir Aqueduct",
  "Underground Sea", "Izzet Boilerworks", "Hall of Heliod's Generosity", "Bident of Thassa", "Utopia Sprawl", "Bala Ged Recovery // Bala Ged Sanctuary",
  "Avacyn's Pilgrim", "Geier Reach Sanitarium", "Boros Garrison", "Rise of the Dark Realms", "Nesting Grounds"])
  ok(index.resolve(name)?.playable === true && tableDefinition(name) !== null, `${name}: playable, and the table plays it (cards/definitions.mjs)`);

done("Animate Dead's Aura on a graveyard card, its Enchant changed and its creature kept, a basic land type's mana ability, protection over the creatures a spell named, \"if you cast it\", the chosen color's additional mana, a requirement for the turn, and a move of all under your control");
