/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN E, WAVE 2 (f1): what the scenarios of sixteen of Rob's v43 library cards cannot reach.
 *
 *   - MORPH (CR 702.37; Akroma, Angel of Fury): cast face down for {3} as disguise is (rules/actions.mjs), a 2/2 with no text --
 *     no ward (702.37a, 702.37c; state/index.mjs) -- and turned face up for its morph cost alone (702.37e); a manifested card
 *     with morph either way (701.40c). The table says which.
 *   - "BEHOLD A GOBLIN AND EXILE IT" (Champion of the Weird; CR 701.4a, 601.2h): the beheld card exiled as the cost is paid,
 *     and linked to the permanent the spell becomes (CR 607.2q; rules/actions.mjs, rules/stack.mjs) -- only in a spell's own
 *     additional cost.
 *   - "IF YOU'VE CAST ANOTHER INSTANT OR SORCERY SPELL THIS TURN" (Burrog Barrage): spellsCastThisTurn's `another`, the spell's
 *     own cast left out -- a copy was not cast (CR 707.10), so nothing is (script/amount.mjs).
 *   - "WHERE X IS THAT CREATURE'S POWER" (Arni, Renowned Champion): the arrival gone before the trigger resolves, as it last
 *     existed (CR 608.2h; rules/trigger.mjs keeps it once, script/amount.mjs reads it).
 *   - A TARGET'S POWER READ AS IT NOW IS (CR 608.2h; Assert Perfection): still on the battlefield, its current power -- the
 *     pump before it counted -- and gone, the fact read as the resolution began (script/bind.mjs).
 *   - "CAN'T BE BLOCKED BY CREATURES WITH POWER 3 OR GREATER" (April O'Neil, Kunoichi Trainee), which a scenario cannot ask.
 */
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {characteristicsOf} from "../game/engine/rules/layers.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {offerDetails} from "../game/room/room.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {shownFaceDown} from "../game/engine/state/index.mjs";
import {amountOf, amountProblems} from "../game/engine/script/amount.mjs";
import {canBlockAttacker} from "../game/engine/keywords/combat.mjs";
import {STATIC_RULES} from "../game/engine/rules/statics.mjs";
import {bindEffect, factsOf} from "../game/engine/script/bind.mjs";
import {play, drive, happen, at, idOf, compiled, choose, labels, keywordBuilt, index, checks, creature} from "./helpers/x11-keywords.mjs";

const {eq, ok, done} = checks("engine-train-e-f1");
const AKROMA = "Akroma, Angel of Fury", ARNO = "Arno Dorian", CHAMPION = "Champion of the Weird", BARRAGE = "Burrog Barrage", APRIL = "April O'Neil, Kunoichi Trainee";
const FIX = {
  Goblin: creature(["Goblin"], 1, 1, {manaCost: "{R}", colors: ["R"]}), Ogre: creature(["Ogre"], 3, 3, {colors: ["R"]}),
  Counter: {types: ["Instant"], manaCost: "{U}{U}", colors: ["U"], spell: {id: "s", text: "Counter target spell.", targets: [{what: "spell"}], effects: [{effect: "counterSpell", spells: {target: 0}}]}},
  Smite: {types: ["Instant"], manaCost: "{W}", colors: ["W"], spell: {id: "s", text: "Destroy target creature.", targets: [{what: "permanent", types: ["Creature"]}], effects: [{effect: "destroy", targets: {target: 0}}]}},
};
const mentions = (value, name) => JSON.stringify(value).includes(name);
const casts = (s, name, seat = 0) => legalActions(s, seat).filter((a) => a.kind === "cast" && s.objects[a.objectId]?.card === name);
const faceUps = (s, seat = 0) => legalActions(s, seat).filter((a) => a.kind === "turn-face-up");
const downs = (s) => s.zones.battlefield.filter((id) => s.objects[id].faceDown === true);
const THREE = [at(0, "hand", AKROMA), at(0, "battlefield", "Wastes", "Wastes", "Wastes")];
const TAP3 = [{tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}];

/* ---- morph ---- */
{
  const akroma = index.definition(AKROMA);
  eq([akroma.keywords.includes("Morph"), akroma.abilities.find((a) => a.rule === "morph")?.cost], [true, [{atom: "mana", cost: "{3}{R}{R}{R}"}]], "Akroma's morph, kept as its static with its cost");
  const odd = (cost, more = {}) => compiled([{kind: "keyword", text: "Morph", keyword: "morph", cost}], more).problems;
  ok(odd([{atom: "mana", cost: "{X}{R}"}]).some((p) => p.includes("a morph cost of mana, without X")), "a morph cost with X is refused");
  ok(odd([{atom: "payLife", amount: 2}]).some((p) => p.includes("a morph cost of mana")), "and one that is not mana");
  ok(odd([{atom: "mana", cost: "{1}"}], {types: ["Land"], manaCost: null}).some((p) => p.includes("morph on a land")), "and morph on a land");
  eq(odd([{atom: "mana", cost: "{1}{G}"}]), [], "a morph cost of mana compiles");
  /* The closed list of rules a static changes (rules/statics.mjs): morph is one, read by rules/actions.mjs. */
  eq([STATIC_RULES.morph, akroma.abilities.filter((a) => a.kind === "static").every((a) => Object.hasOwn(STATIC_RULES, a.rule))], ["rules/actions.mjs", true],
    "morph is in the closed list of static rules, and every static Akroma compiles to is");
  ok(keywordBuilt("Morph"), "Morph is built (engine-constructs: a keyword with behavior)");
}
{
  /* Offered face down for {3}, and so said; on the stack a 2/2 with no text -- no ward -- named to nobody else. */
  const s = play(THREE, TAP3);
  const offers = casts(s, AKROMA);
  eq(offers.map((a) => [a.disguise, a.payment.mana.C]), [[true, 3]], "{3} in the pool: Akroma face down for {3}, not as herself");
  ok(offerDetails(s, 0, offers)[0].includes("face down for {3}, a 2/2 with no text"), `the table says how: ${offerDetails(s, 0, offers)[0]}`);
  const shown = shownFaceDown(s.objects[s.zones.hand[0][0]]);
  eq([shown.card, shown.keywords, shown.abilities, shown.power, shown.faceDownCard.card], [null, [], [], 2, AKROMA], "shown face down: a nameless 2/2 with no abilities, no ward");
  const arno = play([at(0, "hand", ARNO)]);
  eq(shownFaceDown(arno.objects[arno.zones.hand[0][0]]).keywords, ["Ward"], "a disguise card still shows ward {2}");
  applyAction(s, 0, offers[0]);
  const spell = s.objects[s.stack[0].objectId];
  eq([s.stack[0].faceDown, spell.card, spell.disguised, spell.keywords, spell.abilities, spell.faceDownCard.card], [true, null, true, [], [], AKROMA],
    "on the stack: a face-down spell, no ward, no can't-be-countered");
  ok(!mentions(projectFor(s, 1), AKROMA), "nowhere in Maya's view is it named");
  drive(s, (st) => st.stack.length === 0 && st.priorityPlayer !== null);
  const [id] = downs(s);
  const c = characteristicsOf(s, id);
  eq([s.objects[id].card, c.types, c.subtypes, c.colors, c.power, c.toughness, c.keywords, s.objects[id].manaCost], [null, ["Creature"], [], [], 2, 2, [], null],
    "it resolves face down: a nameless, colorless 2/2 with no abilities and no mana cost");
}
{
  /* Turned face up for {3}{R}{R}{R} alone, and so said; a manifested Akroma either way (CR 701.40c). */
  const s = play([...THREE, at(0, "battlefield", "Mountain", "Mountain", "Mountain", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes")], [...TAP3, {cast: AKROMA, disguise: true}, {resolve: true},
    ...["Mountain", "Mountain", "Mountain", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes"].map((l) => ({tap: l}))]);
  const [id] = downs(s);
  eq(faceUps(s).map((a) => [a.label, a.disguise === true, a.payment.mana.R, a.payment.mana.C]), [[AKROMA, true, 3, 3]], "eight mana: for its morph cost alone, never its mana cost");
  ok(offerDetails(s, 0, faceUps(s))[0].includes("turn face up for its morph cost, {3}{R}{R}{R}"), `the table says so: ${offerDetails(s, 0, faceUps(s))[0]}`);
  applyAction(s, 0, faceUps(s)[0]);
  const c = characteristicsOf(s, id);
  eq([s.objects[id].card, s.objects[id].faceDown, s.objects[id].disguised, c.power, c.toughness, s.stack.length, s.players[0].manaPool.C], [AKROMA, undefined, undefined, 6, 6, 0, 2],
    "Akroma, the same object, nothing on the stack, {C}{C} left");
  ok(["Flying", "Trample", "Protection", "Morph"].every((k) => c.keywords.includes(k)), `her abilities hers again: ${c.keywords.join(", ")}`);
  const m = play([at(0, "battlefield", "Mountain", "Mountain", "Mountain", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes")],
    ["Mountain", "Mountain", "Mountain", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes"].map((l) => ({tap: l})), {library: [AKROMA]});
  runEffect(m, {effect: "manifest", who: [0]}, {controller: 0, source: null});
  eq(faceUps(m).map((a) => a.disguise === true).sort(), [false, true], "manifested: for her mana cost, or for her morph cost");
}

/* ---- behold a Goblin and exile it ---- */
{
  const additional = (atom) => compiled([{kind: "spell", text: "x", targets: [], effects: [], additionalCost: [atom]}]).problems;
  eq(additional({atom: "behold", selector: {subtypes: ["Goblin"]}, exile: true}), [], "behold and exile it: a spell's own additional cost");
  ok(additional({atom: "behold", selector: {subtypes: ["Goblin"]}, exile: false}).some((p) => p.includes("exile is true")), "exile is true or absent");
  ok(compiled([{kind: "spell", text: "x", targets: [], effects: [], additionalCost: [{atom: "oneOf", options: [[{atom: "behold", selector: {subtypes: ["Goblin"]}, exile: true}], [{atom: "mana", cost: "{2}"}]]}]}]).problems
    .some((p) => p.includes("exile is true")), "not one of a choice of additional costs");
  ok(compiled([{kind: "keyword", text: "Flashback", keyword: "flashback", cost: [{atom: "mana", cost: "{1}"}, {atom: "behold", selector: {subtypes: ["Goblin"]}, exile: true}]}], {types: ["Sorcery"]}).problems.length > 0,
    "nor a flashback cost's");
  eq(additional({atom: "behold", selector: {subtypes: ["Goblin"]}}), [], "a plain behold as before");
}
{
  /* Cast, the exiled Goblin is kept against the spell, then against the permanent; that permanent gone, it comes back. */
  const s = play([at(0, "battlefield", "Swamp", "Wastes", "Wastes", "Wastes", "Goblin"), at(0, "hand", CHAMPION)], [{tap: "Swamp"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: CHAMPION}], {}, FIX);
  eq(labels(s), ["Goblin"], "the Goblin Rob controls, to behold");
  choose(s, "Goblin");
  const spellId = s.stack[0].objectId;
  const [goblin] = s.zones.exile.filter((id) => s.objects[id].card === "Goblin");
  eq([s.links?.[spellId], s.objects[goblin].exiledTurn], [[goblin], 1], "exiled as the cost is paid, kept against the spell on the stack");
  drive(s, (st) => st.stack.length === 0 && st.priorityPlayer !== null);
  const champion = idOf(s, CHAMPION);
  eq([s.links[champion], s.links[spellId]], [[goblin], undefined], "the permanent it became has it (CR 607.2q); the spell's is gone");
  happen(s, {effect: "destroy", targets: [champion]}, {controller: 1, source: null});
  drive(s, (st) => st.stack.length > 0);
  eq([s.stack.map((e) => e.kind), s.turn], [["trigger"], 1], "its leaves trigger waits");
  drive(s, (st) => st.stack.length === 0 && st.priorityPlayer !== null);
  eq([s.zones.hand[0].map((id) => s.objects[id].card), s.links[champion]], [["Goblin"], undefined], "destroyed: the Goblin back in Rob's hand, the link spent");
}
{
  /* Countered: no permanent, no link -- the Goblin exiled, nobody's. */
  const s = play([at(0, "battlefield", "Swamp", "Wastes", "Wastes", "Wastes"), at(0, "hand", CHAMPION, "Goblin"), at(1, "battlefield", "Island", "Island"), at(1, "hand", "Counter")],
    [{tap: "Swamp"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: CHAMPION}, {choose: ["Goblin (reveal it from your hand)"]}, {pass: 1}, {tap: "Island", seat: 1}, {tap: "Island", seat: 1},
      {cast: "Counter", seat: 1, targets: "any"}, {resolve: true}], {}, FIX);
  eq([s.stack.length, s.zones.exile.map((id) => s.objects[id].card), Object.keys(s.links ?? {}).filter((key) => s.objects[key]).length], [0, ["Goblin"], 0],
    "countered: the Goblin stays exiled, linked to no object there is (the spell's id is spent, CR 400.7)");
}
/* ---- another instant or sorcery spell ---- */
{
  const another = {spellsCastThisTurn: "you", filter: {anyOf: [{types: ["Instant"]}, {types: ["Sorcery"]}]}, another: true};
  eq(amountProblems(another), [], "spellsCastThisTurn's another, for \"you\"");
  ok(amountProblems({...another, spellsCastThisTurn: "an opponent"}).some((p) => p.includes("another is true")), "only of \"you\"");
  ok(amountProblems({...another, another: false}).some((p) => p.includes("another is true")), "and only true");
  ok(amountProblems({count: {what: "permanent"}, another: true}).some((p) => p.includes("another is true")), "and only beside spellsCastThisTurn");
  /* A Barrage cast, and one copied: its own cast left out of the first, nothing out of the second. */
  const s = play([at(0, "battlefield", "Forest", "Wastes", "Bear"), at(0, "hand", BARRAGE)], [{tap: "Forest"}, {tap: "Wastes"}, {cast: BARRAGE, targets: [{card: "Bear"}, []]}]);
  const spell = s.stack[0].objectId;
  eq([amountOf(s, another, {controller: 0, source: spell, cast: s.stack[0].cast}), amountOf(s, another, {controller: 0, source: spell}),
    amountOf(s, {...another, another: undefined}, {controller: 0, source: spell, cast: s.stack[0].cast})], [0, 1, 1], "cast: 0 others; a copy (not cast): 1; without another: 1");
  s.players[0].castThisTurn.push({types: ["Instant"], colors: ["U"]});
  eq(amountOf(s, another, {controller: 0, source: spell, cast: s.stack[0].cast}), 1, "and an instant cast before it: 1 other");
  /* Only its own cast of what the filter counts is left out: an instant is no creature spell. */
  s.players[0].castThisTurn.push({types: ["Creature"], colors: ["G"]});
  eq(amountOf(s, {...another, filter: {types: ["Creature"]}}, {controller: 0, source: spell, cast: s.stack[0].cast}), 1, "another creature spell: the Barrage is none, the one creature counted");
}

/* ---- that creature's power, the creature gone ---- */
{
  const s = play([at(0, "battlefield", "Arni, Renowned Champion", "Forest", "Wastes"), at(0, "hand", "Bear"), at(1, "battlefield", "Ogre")], [{tap: "Forest"}, {tap: "Wastes"}, {cast: "Bear"}, {resolve: true}], {}, FIX);
  const entry = s.stack.find((e) => e.kind === "trigger");
  const bear = entry.about.card;
  eq([entry.about.lastKnown, characteristicsOf(s, bear).power], [undefined, 2], "the trigger waits about the Bear, on the battlefield: nothing kept");
  happen(s, {effect: "destroy", targets: [idOf(s, "Ogre")]}, {controller: 1, source: null});
  eq(entry.about.lastKnown, undefined, "Maya's Ogre destroyed: no other creature is kept for it");
  happen(s, {effect: "destroy", targets: [bear]}, {controller: 1, source: null});
  eq([entry.about.lastKnown?.cardId, entry.about.lastKnown?.power], [bear, 2], "the Bear destroyed: kept as it last existed (CR 608.2h)");
  eq(amountOf(s, {powerOf: "that card"}, {controller: 0, source: idOf(s, "Arni, Renowned Champion"), about: entry.about}), 2, "and its power read so");
  eq(amountOf(s, {powerOf: "that card"}, {controller: 0, source: null, about: {card: 9999}, lastKnown: {power: 7}}), 7, "no kept creature: the source as it last was, as before");
  eq(amountOf(s, {toughnessOf: "that card"}, {controller: 0, source: null, about: {card: 9999, lastKnown: {power: 2, toughness: 5}}}), 5, "its toughness read the same way");
  eq(amountOf(s, {powerOf: "self"}, {controller: 0, source: null, about: {card: 9999, lastKnown: {power: 9}}, lastKnown: {power: 4}}), 4,
    "self is the source as it last was, never the creature the trigger is about");
}

/* ---- a target's power, read as it now is ---- */
{
  /* Swords to Plowshares: exiled first, its controller gains life equal to its power -- the fact read as the resolution began. */
  const s = play([at(0, "battlefield", "Plains"), at(0, "hand", "Swords to Plowshares"), at(1, "battlefield", "Ogre")], [{tap: "Plains"}, {cast: "Swords to Plowshares", targets: [{card: "Ogre"}]}, {resolve: true}], {}, FIX);
  eq(s.players[1].life, 43, "the exiled Ogre's power, 3, as it was: Maya at 43");
  /* Bound with the state, a target still there is read as it now is -- power and toughness; bound without it, or for any other
     fact, as the resolution began. */
  const t = play([at(0, "battlefield", "Bear"), at(1, "battlefield", "Ogre")], [], {}, FIX);
  const bear = idOf(t, "Bear"), targets = [{kind: "object", id: bear}];
  const context = {controller: 1, source: null, targets, facts: factsOf(t, targets)};
  runEffect(t, {effect: "pump", targets: [bear], power: 1, toughness: 3}, {controller: 0, source: null});
  eq([bindEffect({effect: "gainLife", amount: {powerOf: {target: 0}}}, context, t).amount, bindEffect({effect: "gainLife", amount: {toughnessOf: {target: 0}}}, context, t).amount,
    bindEffect({effect: "gainLife", amount: {powerOf: {target: 0}}}, context).amount], [3, 5, 2], "pumped +1/+3: a 3/5 now; without the state, the 2 it was");
  eq(bindEffect({effect: "draw", count: 1, who: {controllerOf: {target: 0}}}, context, t).who, [0], "its controller: the fact, Rob");
  runEffect(t, {effect: "moveZone", targets: [bear], to: "graveyard"}, {controller: 1, source: null});
  eq(bindEffect({effect: "gainLife", amount: {powerOf: {target: 0}}}, context, t).amount, 2, "gone to the graveyard, a new object: the 2 it was as the resolution began");
}

/* ---- April O'Neil: can't be blocked by creatures with power 3 or greater ---- */
{
  const s = play([at(0, "battlefield", APRIL), at(1, "battlefield", "Bear", "Ogre")], [], {}, FIX);
  const april = idOf(s, APRIL);
  eq([canBlockAttacker(s, idOf(s, "Bear"), april), canBlockAttacker(s, idOf(s, "Ogre"), april)], [true, false], "Maya's 2-power Bear may block her, her 3-power Ogre may not");
  s.objects[idOf(s, "Bear")].counters["+1/+1"] = 1;
  eq(canBlockAttacker(s, idOf(s, "Bear"), april), false, "a 3/3 Bear may not either: its power as it now is");
}

done("morph cast face down for {3} as a 2/2 with no text and turned face up for its morph cost alone; behold and exile it, linked to the permanent the spell becomes; another instant or sorcery spell cast this turn; that creature's power as it last existed; a target's power as it now is; and April O'Neil's blockers.");
