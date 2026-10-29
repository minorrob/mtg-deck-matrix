/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* WAVE 4C, LANE K2: THE GRAVEYARD AND COMBAT -- what the scenarios of its nineteen cards cannot reach.
 *
 *   - DELVE (CR 702.66a; Treasure Cruise): the cards picked refused when too few or not the caster's graveyard's, never the
 *     spell itself, with flashback given (702.66b), the offer's words, and a pilot answering the question.
 *   - DREDGE (CR 702.52a; Life from the Loam): each player of "each player draws a card" asked in turn, Alms Collector's draws
 *     each its own, never under Narset, never the beat's one button, and both pilots answering it.
 *   - THE REST ON THE BOTTOM IN ANY ORDER (CR 401.4): the order asked, and put there as answered.
 *   - PROTECTION FROM THE COLORS OUTSIDE YOUR COMMANDER'S IDENTITY (Commander's Plate): damage prevented, a blocker refused.
 *   - A FLASHBACK COST THAT SACRIFICES (Dread Return), FABRICATE (Marionette Apprentice), A CREATURE TAPPED FOR MANA WITHOUT {T}
 *     (Relic of Legends), CR 205.3d (Darksteel Mutation), a dig's card put on top (Thassa's Oracle): the grammar of each, and
 *     its refusals.
 */
import {play, idOf, compiled, index, checks, creature, at, later, labels, choose, pilotsAnswer, drive} from "./helpers/x11-keywords.mjs";
import {cardsIn, commanderKeyOf} from "../game/engine/state/index.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {characteristicsOf} from "../game/engine/rules/layers.mjs";
import {protectedFrom} from "../game/engine/rules/protection.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {dredgers, singleDraws, dredgeInstead} from "../game/engine/script/effects/zones.mjs";
import {offerDetails} from "../game/room/room.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {isKeyword} from "../game/engine/vocabulary.mjs";
import {STATIC_RULES} from "../game/engine/rules/statics.mjs";
import {keywordBuilt, FORGE_COUNTS, FORGE_API} from "../game/tools/engine-constructs.mjs";
import {tableDefinition} from "../game/engine/cards/definitions.mjs";
import {loadCardScenarios} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {resolveTop} from "../game/engine/rules/stack.mjs";

const {eq, ok, throws, done} = checks("engine-wave4c-k2");
const BEAR = creature(["Bear"], 2, 2);
const spellOf = (types, cost, colors, effects, targets = []) => ({types, manaCost: cost, colors, spell: {id: "s", text: "x", targets, effects}});
const OGRE = creature(["Ogre"], 3, 3, {colors: ["R"], manaCost: "{2}{R}"});
const KNIGHT = creature(["Human", "Knight"], 2, 2, {colors: ["W"], manaCost: "{1}{W}", supertypes: ["Legendary"]});
const FIX = {Bear: BEAR, Ogre: OGRE, Knight: KNIGHT,
  Cantrip: spellOf(["Instant"], "{U}", ["U"], [{effect: "draw", count: 1}]),
  Howl: spellOf(["Sorcery"], "{U}", ["U"], [{effect: "draw", who: "each", count: 1}]),
  "Two Draws": spellOf(["Sorcery"], "{U}", ["U"], [{effect: "draw", count: 2}]),
  "Burn Wave": spellOf(["Sorcery"], "{R}", ["R"], [{effect: "damageAll", amount: 2, selector: {what: "permanent", types: ["Creature"]}}]),
  /* A delve spell with no generic mana, one with {X}, and a spell of {3}{U} without delve. */
  "Blue Delve": {...spellOf(["Instant"], "{U}", ["U"], [{effect: "draw", count: 1}]), keywords: ["Delve"]},
  "X Delve": {...spellOf(["Sorcery"], "{X}{1}{U}", ["U"], [{effect: "draw", count: "X"}]), keywords: ["Delve"]},
  /* A creature with delve, to be a commander cast again: its tax is generic the graveyard may pay (the card's ruling). */
  "Delve Golem": {...creature(["Golem"], 5, 5, {colors: ["U"], manaCost: "{4}{U}"}), keywords: ["Delve"]},
  "Plain Draw": spellOf(["Sorcery"], "{3}{U}", ["U"], [{effect: "draw", count: 3}]),
  /* Digs: one taking a card it remembers, then exiling it; one taking every land; Sleight of Hand's one card left. */
  "Look Keep": spellOf(["Sorcery"], "{U}", ["U"], [{effect: "dig", count: 3, take: 1, to: "hand", rest: "bottom", remember: true},
    {effect: "moveZone", targets: "remembered", to: "exile"}]),
  "Land Grab": spellOf(["Sorcery"], "{G}", ["G"], [{effect: "dig", count: 3, all: true, selector: {types: ["Land"]}, to: "battlefield", rest: "bottom"}])};
const rng = createRng("wave4c-k2");
const castOffers = (s, name, seat = 0) => legalActions(s, seat).filter((a) => a.kind === "cast" && a.label === name);
/* The cast being asked about, taken again with an answer the question never offered -- as a forged message would: the rules
   refuse it as they pay (resolveCastCost hands the cast back to its player with priority, as here). */
const forged = (s, change) => {
  const copy = structuredClone(s), action = {...structuredClone(copy.awaiting.action), ...change}, player = copy.awaiting.player;
  copy.awaiting = null;
  copy.priorityPlayer = player;
  return () => applyAction(copy, player, action);
};

/* ---- Delve (CR 702.66a) ---- */
{
  /* {U} in the pool and seven cards: the cast offered with delve, the question its cards, at least seven. */
  const s = play([at(0, "battlefield", "Island"), at(0, "hand", "Treasure Cruise"), at(0, "graveyard", ...Array(7).fill("Wastes"))], [{tap: "Island"}], {}, FIX);
  const [offer] = castOffers(s, "Treasure Cruise");
  eq([castOffers(s, "Treasure Cruise").length, offer?.delve], [1, true], "one offer, delved");
  eq(offerDetails(s, 0, [offer]).some((d) => d.includes("delving, exiling cards you choose from your graveyard")), true, "said to the player");
  applyAction(s, 0, offer);
  const choice = awaitingChoice(s);
  eq([s.awaiting?.kind, choice.min, choice.max, choice.options.length], ["choose-cost", 7, 7, 7], "seven of seven: the fewest the pool needs, the most its generic");
  throws(() => resolveAwaiting(structuredClone(s), [0, 1, 2, 3, 4, 5], null, rng), /Invalid selection/, "six are too few: refused");
  /* A pick that is not a card of the graveyard (a forged action) is refused before anything is paid. */
  throws(forged(s, {delveExile: [idOf(s, "Island")]}), /cannot delve/, "a card not in the graveyard is refused");
  throws(forged(s, {delveExile: [...cardsIn(s, "graveyard", 0)].slice(0, 5)}), /cannot pay for Treasure Cruise/, "five, and the pool cannot pay the rest: refused");
  throws(forged(s, {delveExile: [...cardsIn(s, "graveyard", 0)].slice(0, 6).concat([cardsIn(s, "graveyard", 0)[0]])}), /cannot delve/, "a card twice is refused");
  /* The house pilot answers it: seven cards exiled, the spell on the stack. */
  const [house] = pilotsAnswer(s);
  eq([house.stack.length, cardsIn(house, "exile").length, cardsIn(house, "graveyard", 0).length], [1, 7, 0], "the house pilot delves it");
}
{
  /* Given flashback (Past in Flames' kind of effect, its mana cost the cost): from the graveyard with delve, the card itself
     never among the cards to exile (CR 601.2a), and exiled after as flashback says. */
  const s = play([at(0, "battlefield", "Island"), at(0, "graveyard", "Treasure Cruise", ...Array(7).fill("Wastes"))], [{tap: "Island"}], {}, FIX);
  const cruise = cardsIn(s, "graveyard", 0).find((id) => s.objects[id].card === "Treasure Cruise");
  (s.effects ??= []).push({id: "given", rule: "flashback", affects: {ids: [cruise]}, until: "end-of-turn", sourceController: 0});
  const offers = castOffers(s, "Treasure Cruise");
  eq(offers.map((a) => [a.flashback === true, a.delve === true]), [[true, true]], "flashback with delve, one offer");
  applyAction(s, 0, offers[0]);
  eq([awaitingChoice(s).options.length, awaitingChoice(s).options.some((o) => o.cardId === cruise)], [7, false], "the seven others, never itself");
  resolveAwaiting(s, [0, 1, 2, 3, 4, 5, 6], null, rng);
  eq(s.stack.length, 1, "cast");
}
{
  /* Its mana value is its mana cost's, whatever was exiled (the card's ruling). */
  const def = index.definition("Treasure Cruise");
  eq([def.manaCost, def.keywords.includes("Delve")], ["{7}{U}", true], "{7}{U}: mana value 8");
  eq([keywordBuilt("Delve"), keywordBuilt("Dredge"), keywordBuilt("Fabricate"), isKeyword("delve"), isKeyword("dredge"), isKeyword("fabricate")],
    [true, true, true, true, true, true], "delve, dredge and fabricate: declared and built");
}

{
  /* Eight cards and {U}: no more than its seven generic (the card's ruling). */
  const s = play([at(0, "battlefield", "Island"), at(0, "hand", "Treasure Cruise"), at(0, "graveyard", ...Array(8).fill("Wastes"))], [{tap: "Island"}], {}, FIX);
  applyAction(s, 0, castOffers(s, "Treasure Cruise")[0]);
  eq([awaitingChoice(s).min, awaitingChoice(s).max, awaitingChoice(s).options.length], [7, 7, 8], "seven of the eight, no more");
  throws(forged(s, {delveExile: [...cardsIn(s, "graveyard", 0)]}), /cannot delve/, "eight are refused");
  /* Eight mana: the pool pays it alone, and a delve of none is no delve -- refused. */
  const t = play([at(0, "battlefield", "Island", ...Array(7).fill("Wastes")), at(0, "hand", "Treasure Cruise"), at(0, "graveyard", "Bear")],
    [{tap: "Island"}, ...Array(7).fill({tap: "Wastes"})], {}, FIX);
  applyAction(t, 0, castOffers(t, "Treasure Cruise").find((a) => a.delve));
  throws(forged(t, {delveExile: []}), /cannot delve/, "none picked is refused");
}
{
  /* No generic mana: no delve. An announced X is part of the generic total (CR 601.2b, 702.66). No delve keyword: refused. */
  const s = play([at(0, "battlefield", "Island", "Island", "Wastes", "Wastes", "Wastes"), at(0, "hand", "Blue Delve", "X Delve", "Plain Draw"), at(0, "graveyard", "Bear", "Bear", "Bear")],
    [{tap: "Island"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}], {}, FIX);
  eq([castOffers(s, "Blue Delve").map((a) => a.delve ?? false), castOffers(s, "X Delve").some((a) => a.delve), castOffers(s, "Plain Draw").map((a) => a.delve ?? false)],
    [[false], true, [false]], "{U}: the pool's cast alone; announced X may be delved; no delve: the pool's alone");
  const plain = castOffers(s, "Plain Draw")[0];
  throws(() => applyAction(structuredClone(s), 0, {...plain, payment: null, delve: true, delveExile: [...cardsIn(s, "graveyard", 0)]}), /not a legal action/, "delve forged on a card without it is refused");
  const delvedX = castOffers(s, "X Delve").filter(a => a.delve);
  eq(delvedX.map(a => a.x), [0, 1, 2, 3, 4, 5], "three floating generic mana and three graveyard cards offer X through five for {X}{1}{U}");
  applyAction(s, 0, delvedX.find(a => a.x === 5));
  resolveAwaiting(s, [0, 1, 2]);
  eq([s.players[0].manaPool.U, s.players[0].manaPool.C, cardsIn(s, "graveyard", 0).length, s.zones.exile.length, s.stack.at(-1)?.x], [0, 0, 0, 3, 5], "X=5 really spends U+CCC and exiles the three Bears");
  const beforeDraw = cardsIn(s, "hand", 0).length;
  resolveTop(s);
  eq(cardsIn(s, "hand", 0).length - beforeDraw, 5, "the paid X spell resolves and draws five cards");
}

{
  /* A commander with delve cast a second time: its tax of {2} is generic mana of the total cost, which the graveyard pays
     too (CR 601.2f; the card's ruling) -- {4}{U} and {2}: six cards and {U}. */
  const s = play([at(0, "battlefield", "Island"), at(0, "command", "Delve Golem"), at(0, "graveyard", ...Array(6).fill("Wastes"))], [{tap: "Island"}], {}, FIX);
  const golem = cardsIn(s, "command", 0).find((id) => s.objects[id].card === "Delve Golem");
  s.players[0].commanderCasts = {[commanderKeyOf(s.objects[golem])]: 1};
  const [offer] = castOffers(s, "Delve Golem");
  eq([offer?.delve, offer?.tax], [true, 2], "delved, with its tax");
  applyAction(s, 0, offer);
  eq([awaitingChoice(s).min, awaitingChoice(s).max], [6, 6], "six cards: four of its cost and two of the tax");
  resolveAwaiting(s, [0, 1, 2, 3, 4, 5], null, rng);
  eq([s.stack.length, cardsIn(s, "exile").length], [1, 6], "cast");
}

/* ---- Dredge (CR 702.52a) ---- */
const DREDGE = "Dredge 3: mill three cards and return Life from the Loam to your hand";
{
  /* "Each player draws a card" (three players): each in turn, each with a dredge card asked -- Rob, then Trey; Maya, with none,
     simply draws. */
  /* Put there once the game is under way: in a game of three, Rob draws in his first draw step too (CR 103.8a is two players'). */
  const s = play([at(0, "battlefield", "Island"), at(0, "hand", "Howl"), later(0, "graveyard", "Life from the Loam"), later(2, "graveyard", "Life from the Loam")],
    [{tap: "Island"}, {cast: "Howl"}, {resolve: true}], {seats: 3}, FIX);
  eq([s.awaiting?.player, labels(s)], [0, ["Draw a card", DREDGE]], "Rob is asked first");
  throws(() => resolveAwaiting(structuredClone(s), [2], null, rng), /Invalid selection/, "an answer it does not offer is refused");
  choose(s, DREDGE);
  eq([s.awaiting?.player, labels(s), cardsIn(s, "hand", 1).length], [2, ["Draw a card", DREDGE], 1], "Maya has drawn; Trey is asked");
  choose(s, "Draw a card");
  /* A card that can't dredge for that player -- Trey's, for Rob -- dredges nothing, and nothing moves. */
  const trey = cardsIn(s, "graveyard", 2).find((id) => s.objects[id].card === "Life from the Loam");
  const was = cardsIn(s, "library", 0).length, moved = [];
  eq([dredgeInstead(s, 0, trey, moved), moved.length, cardsIn(s, "library", 0).length], [false, 0, was], "another player's dredge card: no dredge");
  eq([s.awaiting ?? null, cardsIn(s, "hand", 0).map((id) => s.objects[id].card).sort(), cardsIn(s, "hand", 2).length, cardsIn(s, "graveyard", 2).length],
    [null, ["Life from the Loam", "Wastes"], 1, 1], "Rob dredged (his Wastes from his first draw step), Trey drew");
}
{
  /* Alms Collector (Maya's): Rob would draw two, so instead he and Maya each draw one -- and his one may be dredged. */
  const s = play([at(0, "battlefield", "Island"), at(0, "hand", "Two Draws"), at(0, "graveyard", "Life from the Loam"), at(1, "battlefield", "Alms Collector")],
    [{tap: "Island"}, {cast: "Two Draws"}], {}, FIX);
  eq(singleDraws(s, {effect: "draw", count: 2}, {controller: 0}), [0, 1], "the draw of two, as its single draws: Rob's one, then Maya's");
  eq(singleDraws(s, {effect: "draw", count: 1}, {controller: 0}), [0], "a draw of one is no draw of two: Rob's alone");
  const r = play([at(0, "battlefield", "Island"), at(0, "hand", "Two Draws"), at(0, "graveyard", "Life from the Loam"), at(1, "battlefield", "Alms Collector")],
    [{tap: "Island"}, {cast: "Two Draws"}, {resolve: true}], {}, FIX);
  eq([r.awaiting?.player, labels(r)], [0, ["Draw a card", DREDGE]], "Rob's one draw: asked");
  choose(r, DREDGE);
  eq([cardsIn(r, "hand", 0).map((id) => r.objects[id].card), cardsIn(r, "hand", 1).length, r.awaiting ?? null], [["Life from the Loam"], 1, null], "dredged; Maya drew hers");
}
{
  /* Narset, Parter of Veils: a draw Rob can't make is no draw to replace -- his second draw this turn, nothing asked. */
  const s = play([at(0, "battlefield", "Island", "Island"), at(0, "hand", "Cantrip", "Two Draws"), at(0, "graveyard", "Life from the Loam"), at(1, "battlefield", "Narset, Parter of Veils")],
    [{tap: "Island"}, {cast: "Cantrip"}, {resolve: true}, {choose: ["Draw a card"]}], {}, FIX);
  eq([cardsIn(s, "hand", 0).length, dredgers(s, 0).length], [2, 0], "one card drawn this turn: no dredge now");
}
{
  /* The draw step: a question like any other -- never the beat's one "Draw a card" button -- and both pilots answer it. */
  const s = play([at(0, "graveyard", "Life from the Loam")], [{to: {turn: 3, phase: "DRAW"}}], {}, FIX);
  const choice = awaitingChoice(s);
  eq([s.awaiting?.kind, choice.kind ?? null, choice.options.map((o) => o.label)], ["dredge-draw", null, ["Draw a card", DREDGE]], "asked, as a question");
  throws(() => resolveAwaiting(structuredClone(s), [2], null, rng), /Invalid selection/, "an answer it does not offer is refused");
  const [house, random] = pilotsAnswer(s);
  eq([house.awaiting ?? null, random.awaiting ?? null, house.priorityPlayer, cardsIn(house, "hand", 0).length + cardsIn(house, "graveyard", 0).length > 0],
    [null, null, 0, true], "each pilot answers; Rob has priority in his draw step");
  /* With the beat held too (a table that asks for it), the dredge question is the one asked; without a dredge card, the beat. */
  for (const [yard, kind] of [[["Life from the Loam"], "dredge-draw"], [[], "draw-card"]]) {
    const held = play([at(0, "graveyard", ...yard)], [], {}, FIX);
    held.drawBeat = true;
    drive(held, (x) => x.turn === 3 && x.phase === "DRAW" && x.awaiting !== null && x.awaiting !== undefined, {answer: (x) => (x.awaiting?.kind === "dredge-draw" || x.awaiting?.kind === "draw-card" ? [0] : null)});
    eq(held.awaiting?.kind, kind, `the draw step held: ${kind}`);
  }
}

{
  /* The keyword, compiled: a static with its number, a rule of the closed list, read where cards are drawn. */
  eq([compiled([{kind: "keyword", text: "Dredge", keyword: "dredge"}]).problems.length > 0, compiled([{kind: "keyword", text: "Dredge 2", keyword: "dredge", amount: 2}]).definition.abilities[0]],
    [true, {id: "a0", kind: "static", rule: "dredge", text: "Dredge 2", amount: 2, affects: {what: "card", self: true}}], "dredge needs its number");
  eq(STATIC_RULES.dredge, "script/effects/zones.mjs", "a rule of the closed list");
}

/* ---- The rest on the bottom in any order (CR 401.4) ---- */
{
  /* Dig Through Time paid in full: two kept, the five others asked in order -- put on the bottom as answered. */
  const top = ["Forest", "Island", "Mountain", "Plains", "Swamp", "Bear", "Ogre"];
  const s = play([at(0, "battlefield", "Island", "Island", ...Array(6).fill("Wastes")), at(0, "hand", "Dig Through Time")],
    [{tap: "Island"}, {tap: "Island"}, ...Array(6).fill({tap: "Wastes"}), {cast: "Dig Through Time"}, {resolve: true}, {choose: ["Bear", "Ogre"]}], {library: top}, FIX);
  eq(labels(s), ["Forest", "Island", "Mountain", "Plains", "Swamp"], "the order of the five asked");
  eq(awaitingChoice(s).mode, "order", "an order");
  throws(() => resolveAwaiting(structuredClone(s), [9], null, rng), /Invalid selection/, "an answer naming no card is refused");
  resolveAwaiting(s, [4, 2, 0, 1, 3], null, rng);
  const lib = cardsIn(s, "library", 0).map((id) => s.objects[id].card);
  eq(lib.slice(-5), ["Swamp", "Mountain", "Forest", "Island", "Plains"], "on the bottom in that order, the first chosen highest");
  /* Goblin Ringleader's "the rest on the bottom of your library in any order" is asked too. */
  const g = play([at(0, "battlefield", "Mountain", "Wastes", "Wastes", "Wastes"), at(0, "hand", "Goblin Ringleader")],
    [{tap: "Mountain"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Goblin Ringleader"}, {resolve: true}, {resolve: true}], {library: ["Forest", "Island", "Mountain", "Plains"]}, FIX);
  eq([g.awaiting?.kind, labels(g)], ["effect-choice", ["Forest", "Island", "Mountain", "Plains"]], "no Goblin among four: their order asked");
  /* One card left is no order: Sleight of Hand asks nothing after the card is taken. */
  const h = play([at(0, "battlefield", "Island"), at(0, "hand", "Sleight of Hand")], [{tap: "Island"}, {cast: "Sleight of Hand"}, {resolve: true}, {choose: ["Forest"]}],
    {library: ["Forest", "Island"]}, FIX);
  eq([h.awaiting ?? null, cardsIn(h, "hand", 0).map((id) => h.objects[id].card)], [null, ["Forest"]], "Sleight of Hand: nothing more asked");
  /* What a dig took, remembered once the order is answered: "Look Keep" exiles the card it kept. */
  const k = play([at(0, "battlefield", "Island"), at(0, "hand", "Look Keep")], [{tap: "Island"}, {cast: "Look Keep"}, {resolve: true}, {choose: ["Island"]}],
    {library: ["Forest", "Island", "Mountain"]}, FIX);
  eq(labels(k), ["Forest", "Mountain"], "the two others' order asked");
  resolveAwaiting(k, [1, 0], null, rng);
  eq([k.awaiting ?? null, cardsIn(k, "exile").map((id) => k.objects[id].card), cardsIn(k, "hand", 0).length], [null, ["Island"], 0], "then the kept card exiled, as remembered");
  /* Every land taken with nobody asked (`all`), and the others' order still asked. */
  const l = play([at(0, "battlefield", "Forest"), at(0, "hand", "Land Grab")], [{tap: "Forest"}, {cast: "Land Grab"}, {resolve: true}], {library: ["Plains", "Bear", "Ogre"]}, FIX);
  eq([labels(l), l.zones.battlefield.some((id) => l.objects[id].card === "Plains")], [["Bear", "Ogre"], true], "the Plains onto the battlefield; Bear and Ogre's order asked");
}

/* ---- Commander's Plate: protection from the colors outside the commander's identity ---- */
{
  const s = play([at(0, "battlefield", "Commander's Plate", "Plains", "Wastes", "Wastes", "Wastes", "Wastes"), at(0, "command", "Knight"),
    at(1, "battlefield", "Mountain", "Ogre"), at(1, "hand", "Burn Wave")],
  [{tap: "Plains"}, {tap: "Wastes"}, {cast: "Knight"}, {resolve: true}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"},
    {activate: "Commander's Plate", targets: [{card: "Knight"}]}, {resolve: true}], {}, FIX);
  const knight = idOf(s, "Knight"), ogre = idOf(s, "Ogre");
  eq([protectedFrom(s, {card: knight}, ogre), protectedFrom(s, {card: ogre}, knight)], [true, false], "the red Ogre is a source it has protection from; the Ogre has none");
  /* Its controller changes: whose commander it is is read as each question is asked. */
  const plate = idOf(s, "Commander's Plate");
  s.objects[plate].controller = 1;
  eq(protectedFrom(s, {card: knight}, ogre), false, "the Plate Maya's, who has no commander: no protection");
  s.objects[plate].controller = 0;
  /* Maya's Flare: 2 damage to each creature -- prevented on the Knight (CR 702.16e), dealt to her Ogre. */
  const t = play([at(0, "battlefield", "Commander's Plate", "Plains", "Wastes", "Wastes", "Wastes", "Wastes"), at(0, "command", "Knight"),
    at(1, "battlefield", "Mountain", "Ogre"), at(1, "hand", "Burn Wave")],
  [{tap: "Plains"}, {tap: "Wastes"}, {cast: "Knight"}, {resolve: true}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"},
    {activate: "Commander's Plate", targets: [{card: "Knight"}]}, {resolve: true}, {to: {turn: 2, phase: "MAIN1"}}, {tap: "Mountain", seat: 1}, {cast: "Burn Wave", seat: 1}, {resolve: true}], {}, FIX);
  const k = idOf(t, "Knight");
  eq([t.objects[k].damage ?? 0, t.objects[idOf(t, "Ogre")].damage ?? 0], [0, 2], "the Knight takes none, the Ogre 2");
}
{
  /* The compiler: the quality alone in `from`. */
  const prot = (from) => compiled([{kind: "static", text: "x", rule: "protection", affects: {what: "permanent", attachedBy: "self"}, from}],
    {types: ["Artifact"], subtypes: ["Equipment"], power: null, toughness: null}).problems.filter((p) => p.includes("outside your commander")).length;
  eq([prot({outsideCommanderIdentity: true}), prot({outsideCommanderIdentity: true, colors: ["R"]}), prot({outsideCommanderIdentity: false})], [0, 1, 1],
    "outsideCommanderIdentity: true, and nothing beside it");
}

/* ---- Dread Return: a flashback cost that sacrifices ---- */
{
  const s = play([at(0, "battlefield", "Bear", "Bear", "Bear"), at(0, "graveyard", "Dread Return", "Ogre")], [], {}, FIX);
  const [offer] = castOffers(s, "Dread Return");
  eq(offerDetails(s, 0, [offer]).some((d) => d.includes("flashback, sacrificing three you choose")), true, "said to the player");
  applyAction(s, 0, offer);
  const choice = awaitingChoice(s);
  eq(choice.title, "Dread Return's flashback: sacrifice three creatures", "asked in the card's words");
  eq([choice.min, choice.max, choice.cost, choice.options.length], [3, 3, "flashbackSacrifice", 3], "exactly three");
  throws(() => resolveAwaiting(structuredClone(s), [0, 1], null, rng), /Invalid selection/, "two are refused");
  throws(forged(s, {flashbackSacrifice: [idOf(s, "Bear"), idOf(s, "Bear"), idOf(s, "Bear")]}), /sacrifice for its flashback/, "the same Bear three times is refused");
  const [house] = pilotsAnswer(s);
  eq([house.stack.length, cardsIn(house, "graveyard", 0).filter((id) => house.objects[id].card === "Bear").length], [1, 3], "the house pilot pays it");
  /* The compiler: a number of permanents, a selector, once, never "sacrifice this". */
  const back = (atom) => compiled([{kind: "spell", text: "x", effects: [{effect: "gainLife", amount: 1}]}, {kind: "keyword", text: "Flashback", keyword: "flashback", cost: [atom]}],
    {types: ["Sorcery"], power: null, toughness: null}).problems.filter((p) => p.includes("flashback")).length;
  eq([back({atom: "sacrifice", count: 3, selector: {types: ["Creature"]}}), back({atom: "sacrifice", count: 0, selector: {types: ["Creature"]}}),
    back({atom: "sacrifice", count: 1}), back({atom: "sacrifice", count: 1, self: true, selector: {}})], [0, 1, 1, 1], "a count, a selector, never itself");
}

/* ---- Fabricate, Relic of Legends, Darksteel Mutation, Thassa's Oracle: their grammar ---- */
{
  eq([compiled([{kind: "keyword", text: "Fabricate 2", keyword: "fabricate", amount: 2}]).problems, compiled([{kind: "keyword", text: "Fabricate", keyword: "fabricate"}]).problems.length > 0],
    [[], true], "fabricate needs its number");
  const two = compiled([{kind: "keyword", text: "Fabricate 2", keyword: "fabricate", amount: 2}]).definition.abilities[0];
  eq(two.effects[0].then[0].modes.map((m) => m.text), ["Put 2 +1/+1 counters on it", "Create 2 1/1 Servo tokens"], "fabricate 2's two modes");
  eq([two.effects[0].otherwise[0].count, two.effects[0].otherwise[0].token.types, two.effects[0].then[0].modes[0].effects[0].count], [2, ["Artifact", "Creature"], 2],
    "gone, two Servos; there, two counters if chosen");
  /* A creature whose "tap an untapped creature you control" has no {T} of its own may tap itself (CR 302.6 is about {T}). */
  const tapper = {...creature(["Elf"], 1, 1), supertypes: ["Legendary"], abilities: [{id: "m", kind: "mana", text: "x", anyColor: true, tapCreature: {types: ["Creature"], supertypes: ["Legendary"]}, tapSelf: false}]};
  const s = play([at(0, "battlefield", "Tapper")], [], {}, {Tapper: tapper});
  eq(legalActions(s, 0).filter((a) => a.kind === "activate-mana").map((a) => a.costNames).flat().filter((n) => n === "Tapper").length, 5, "it taps itself, five colors");
  /* Darksteel Mutation's subtypes (CR 205.3d): what the compiler holds it to. */
  const subtypes = (apply, layer = 4) => compiled([{kind: "static", text: "x", layer, affects: {what: "permanent", self: true}, apply}]).problems.filter((p) => p.includes("correspondingSubtypes")).length;
  eq([subtypes({setTypes: ["Artifact", "Creature"], correspondingSubtypes: true}), subtypes({correspondingSubtypes: true}), subtypes({setTypes: ["Artifact"], correspondingSubtypes: true}, 6)],
    [0, 1, 1], "beside setTypes, in layer 4");
  /* An enchantment creature Saga's type, gone with the enchantment type; its creature types replaced by Insect. */
  const saga = {types: ["Enchantment", "Creature"], subtypes: ["Saga", "Goblin"], manaCost: "{2}{R}", colors: ["R"], power: 2, toughness: 2};
  const m = play([at(0, "battlefield", "Plains", "Wastes"), at(0, "hand", "Darksteel Mutation"), at(1, "battlefield", "Chapter")],
    [{tap: "Plains"}, {tap: "Wastes"}, {cast: "Darksteel Mutation", targets: [{card: "Chapter"}]}, {resolve: true}], {}, {Chapter: saga});
  const c = characteristicsOf(m, idOf(m, "Chapter"));
  eq([c.types.sort(), c.subtypes.sort()], [["Artifact", "Creature"], ["Insect"]], "an Insect artifact creature and nothing else");
  /* No creature any more: its creature types go too (CR 205.3d). */
  const rock = {...creature(["Bear"], 2, 2), abilities: [{id: "r", kind: "static", text: "x", layer: 4, affects: {what: "permanent", self: true},
    apply: {setTypes: ["Artifact"], correspondingSubtypes: true}}]};
  const r = play([at(0, "battlefield", "Rock Bear")], [], {}, {"Rock Bear": rock});
  eq([characteristicsOf(r, idOf(r, "Rock Bear")).types, characteristicsOf(r, idOf(r, "Rock Bear")).subtypes], [["Artifact"], []], "an artifact, no Bear");
  /* Nor is a changeling every creature type once it is no creature. */
  const shifter = {...rock, keywords: ["Changeling"], subtypes: ["Shapeshifter"]};
  const sh = play([at(0, "battlefield", "Rock Shifter")], [], {}, {"Rock Shifter": shifter});
  eq([characteristicsOf(sh, idOf(sh, "Rock Shifter")).everyCreatureType, characteristicsOf(sh, idOf(sh, "Rock Shifter")).subtypes], [false, []], "a changeling made an artifact: no creature type");
  /* Thassa's Oracle's dig: one card on top, never more. */
  const dig = (effect) => validateScript({schema: "CrankCardScript@1", identity: {name: "Odd", oracleId: "odd", types: ["Sorcery"], subtypes: [], manaCost: "{1}", colors: ["U"], power: null, toughness: null},
    oracleText: "x", source: "hand", abilities: [{kind: "spell", text: "x", effects: [effect]}]}).errors.filter((e) => /on top of the library/.test(e.message)).length;
  eq([dig({effect: "dig", count: 3, take: 1, to: "top"}), dig({effect: "dig", count: 3, take: 2, to: "top"}), dig({effect: "dig", count: 3, to: "top", toByType: [{types: ["Land"], to: "hand"}]})],
    [0, 1, 1], "to top: one card");
}

/* ---- The credits, and the table ---- */
{
  eq([FORGE_COUNTS.Threshold.status, FORGE_COUNTS.ValidLibrary.status, FORGE_API.Protection], ["built", "built", "effectUntil"], "threshold, a library's count, protection: credited");
  const lane = ["Commander's Plate", "Marionette Apprentice", "Stitcher's Supplier", "Pinnacle Monk // Mystic Peak", "Aftermath Analyst", "Dread Return",
    "Life from the Loam", "Mother of Runes", "Cabal Ritual", "Darksteel Mutation", "Reckless Fireweaver", "Changeling Outcast", "Relic of Legends", "Treasure Cruise",
    "Dragon Tempest", "Deathrite Shaman", "Thassa's Oracle", "Growing Rites of Itlimoc // Itlimoc, Cradle of the Sun", "Dig Through Time"];
  eq(lane.filter((name) => !tableDefinition(name)), [], "each of the lane's nineteen cards plays at the table");
  /* Mox Diamond plays since the card load of 2026-10-23 (wave 4d, L2): its replacement asked with its arrival held, as a
     copy's is (rules/entering.mjs). */
  ok(tableDefinition("Mox Diamond") !== null, "Mox Diamond plays: its replacement is asked before its arrival is seen");
  /* Every scenario of the lane's cards, and of the cards whose rules moved under them (the rest in any order, protection,
     draws replaced), played through the rules here as tests/engine-cards.mjs plays them all. */
  const also = ["Flow State", "Goblin Ringleader", "Sleight of Hand", "Mulch", "Sword of Hearth and Home", "Akroma's Will", "Alms Collector", "Narset, Parter of Veils"];
  let n = 0;
  for (const {scenarios: file} of loadCardScenarios()) {
    if (![...lane, ...also].includes(file.card)) continue;
    for (const scenario of file.scenarios) { runScenario(scenario, index.definition, file.fixtures ?? {}); n += 1; }
  }
  ok(n >= 100, `${n} scenarios played through the rules`);
}

done("delve, dredge, the rest in any order, protection outside the commander's identity, and the lane's grammar");
