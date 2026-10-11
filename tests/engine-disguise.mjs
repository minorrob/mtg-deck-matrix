/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* DISGUISE (CR 702.168; Arno Dorian, Bayek of Siwa, Train C phase 2).
 *
 * "You may cast this card as a 2/2 face-down creature with ward {2}, no name, no subtypes, and no mana cost by paying {3}
 * rather than paying its mana cost" (702.168a): an alternative cost, from any zone the card could be cast from -- the card
 * weighed as that face-down spell as it is offered and cast (rules/actions.mjs, withFaceDown; state/index.mjs,
 * showFaceDown), so its timing, its cost and every rule that reads a spell read a colorless 2/2 creature spell (702.168b).
 * On the stack it is a face-down spell (rules/stack.mjs) and resolves into a face-down permanent with the same
 * characteristics; countered, it is revealed as it moves (CR 708.9). Its controller may turn it face up any time they have
 * priority for its disguise cost, a special action (702.168d) -- for that cost alone: not its mana cost, which only a
 * manifested card is turned face up for (CR 701.40b) -- and then it is the card it is, the same object, nothing about
 * entering happening again. The card is never named to another seat while it is face down (CR 708.5).
 */
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {characteristicsOf} from "../game/engine/rules/layers.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {offerDetails} from "../game/room/room.mjs";
import {historyLines} from "../game/room/history.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {shownFaceDown} from "../game/engine/state/index.mjs";
import {hashState} from "../game/engine/journal.mjs";
import {play, drive, at, later, compiled, choose, labels, keywordBuilt, index, checks} from "./helpers/x11-keywords.mjs";

const {eq, ok, done} = checks("engine-disguise");
const ARNO = "Arno Dorian";
const big = compiled([{kind: "keyword", text: "Disguise {G}", keyword: "disguise", cost: [{atom: "mana", cost: "{G}"}]}], {name: "Big Disguiser", manaCost: "{4}{G}", power: 5, toughness: 5});
const escaper = compiled([{kind: "keyword", text: "Disguise {G}", keyword: "disguise", cost: [{atom: "mana", cost: "{G}"}]},
  {kind: "keyword", text: "Escape--{G}, Exile two other cards from your graveyard.", keyword: "escape", cost: [{atom: "mana", cost: "{G}"}, {atom: "exileFromGraveyard", count: 2}]}],
  {name: "Escaper", manaCost: "{1}{G}"});
const FIX = {
  "Big Disguiser": {...big.definition, card: "Big Disguiser"}, Escaper: {...escaper.definition, card: "Escaper"},
  "Free Top": {types: ["Enchantment"], manaCost: "{1}", colors: [], abilities: [{id: "a0", kind: "static", text: "You may cast creature spells from the top of your library without paying their mana costs.",
    rule: "play-from", affects: {what: "player", who: "you"}, zone: "library-top", spells: {types: ["Creature"]}, free: true}]},
  Counter: {types: ["Instant"], manaCost: "{U}{U}", colors: ["U"], spell: {id: "s", text: "Counter target spell.", targets: [{what: "spell"}], effects: [{effect: "counterSpell", spells: {target: 0}}]}},
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
};
const disguised = (s) => s.zones.battlefield.filter((id) => s.objects[id].faceDown === true);
/* Every cast of an Arno, by the object -- an offer with no label among them. */
const casts = (s, seat = 0) => legalActions(s, seat).filter((a) => a.kind === "cast" && s.objects[a.objectId]?.card === ARNO);
const faceUps = (s, seat = 0) => legalActions(s, seat).filter((a) => a.kind === "turn-face-up");
function everyString(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) everyString(item, out);
  else if (value && typeof value === "object") for (const item of Object.values(value)) everyString(item, out);
  return out;
}
const mentions = (value, name) => everyString(value).some((text) => text.includes(name));
const THREE = [at(0, "hand", ARNO), at(0, "battlefield", "Wastes", "Wastes", "Wastes")];
const TAP3 = [{tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}];

{
  const arno = index.definition(ARNO);
  eq([arno.keywords.includes("Disguise"), arno.abilities.find((a) => a.rule === "disguise").cost], [true, [{atom: "mana", cost: "{B}{R}"}]], "the keyword, kept as its static with its cost");
  const odd = (cost, more = {}) => compiled([{kind: "keyword", text: "Disguise", keyword: "disguise", cost}], more).problems;
  ok(odd([{atom: "mana", cost: "{X}{R}"}]).some((p) => p.includes("a disguise cost of mana, without X")), "a disguise cost with X is refused");
  ok(odd([{atom: "payLife", amount: 2}]).some((p) => p.includes("a disguise cost of mana")), "and one that is not mana");
  ok(odd([{atom: "mana", cost: "{1}"}], {types: ["Land"], manaCost: null}).some((p) => p.includes("disguise on a land")), "and disguise on a land");
}
{
  /* Offered as a 2/2 creature spell would be: for {3}, at sorcery speed, its label the card for its caster. */
  const s = play(THREE, TAP3);
  const before = structuredClone(s.objects[s.zones.hand[0][0]]);
  const offers = casts(s);
  eq(offers.map((a) => [a.disguise, a.payment.mana.C]), [[true, 3]], "{3} in the pool: Arno face down, for {3} -- and not as itself, for {2}{B}{R}");
  eq(JSON.stringify(s.objects[s.zones.hand[0][0]]), JSON.stringify(before), "weighed face down for the offer, and as it was after, key for key: asking changes nothing");
  ok(offerDetails(s, 0, offers)[0].includes("face down for {3}"), `the table says how: ${offerDetails(s, 0, offers)[0]}`);
  eq(casts(play(THREE, TAP3.slice(0, 2))).length, 0, "two mana: not offered");
  eq(casts(play(THREE, [{to: {turn: 1, phase: "COMBAT_BEGIN"}}, ...TAP3])).length, 0, "nor in combat: a creature spell, at sorcery speed");
  eq(casts(play([at(0, "hand", ARNO), later(0, "battlefield", "Wastes", "Wastes", "Wastes"), at(1, "hand", "Counter")], [{to: {turn: 2, phase: "MAIN1"}}, {pass: 1}, ...TAP3], {}, FIX), 0).length, 0,
    "nor on Maya's turn");
}
{
  /* Cast: a face-down spell, named to nobody else; the cast event and the history say a face-down card. */
  const s = play(THREE, TAP3);
  const events = applyAction(s, 0, casts(s)[0]);
  const entry = s.stack[0], spell = s.objects[entry.objectId];
  eq([entry.faceDown, entry.name, spell.card, spell.faceDown, spell.disguised, spell.faceDownCard.card, spell.types, spell.power, spell.keywords],
    [true, null, null, true, true, ARNO, ["Creature"], 2, ["Ward"]], "on the stack: a face-down 2/2 creature spell with ward, the card kept beside it");
  eq([s.players[0].castThisTurn, s.players[0].manaPool.C], [[{types: ["Creature"], colors: []}], 0], "a colorless creature spell cast this turn, its {3} paid");
  ok(!mentions(projectFor(s, 1), ARNO) && !mentions(events, ARNO), "nowhere in Maya's view nor in the cast's events is it named");
  ok(events.flatMap((e) => historyLines(e, ["Rob", "Maya"]).map((l) => l.text)).some((t) => t.includes("a face-down card")), "the history says a face-down card was cast");
  drive(s, (st) => st.stack.length === 0 && st.priorityPlayer !== null);
  const [id] = disguised(s);
  const c = characteristicsOf(s, id);
  eq([s.objects[id].card, s.objects[id].disguised, c.types, c.subtypes, c.colors, c.power, c.toughness, c.keywords, s.objects[id].manaCost, s.objects[id].supertypes],
    [null, true, ["Creature"], [], [], 2, 2, ["Ward"], null, undefined], "it resolves face down: a nameless, colorless 2/2 with ward, no subtypes, no mana cost, not legendary");
  eq(projectFor(s, 0).players[0].zones.Battlefield.cards.find((x) => x.cardId === id).faceDownName, ARNO, "Rob may look at it");
  ok(!mentions(projectFor(s, 1), ARNO), "Maya may not");
}
{
  /* Countered: revealed as it goes to the graveyard (CR 708.9). */
  const s = play([...THREE, at(1, "hand", "Counter"), at(1, "battlefield", "Island", "Island")], [...TAP3, {cast: ARNO, disguise: true}, {pass: 1}, {tap: "Island", seat: 1}, {tap: "Island", seat: 1},
    {cast: "Counter", seat: 1, targets: "any"}, {resolve: true}], {}, FIX);
  const gone = s.zones.graveyard[0].map((g) => s.objects[g]);
  eq(gone.map((o) => [o.card, o.faceDown === true]), [[ARNO, false]], "countered: Arno in Rob's graveyard, face up");
}
{
  /* Turned face up for {B}{R}: a special action, any time he has priority -- here with Maya's spell on the stack. */
  const s = play([...THREE, at(0, "battlefield", "Swamp", "Mountain"), at(1, "hand", "Counter"), at(1, "battlefield", "Island", "Island")],
    [...TAP3, {cast: ARNO, disguise: true}, {resolve: true}], {}, FIX);
  const [id] = disguised(s);
  eq(faceUps(s).length, 0, "no {B}{R}: not offered");
  for (const tap of ["Swamp", "Mountain"]) applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana" && a.label === tap));
  eq(faceUps(s).map((a) => [a.objectId, a.label, a.disguise, a.payment.mana.B, a.payment.mana.R]), [[id, ARNO, true, 1, 1]], "{B}{R}: turned face up for its disguise cost, and only so");
  ok(offerDetails(s, 0, faceUps(s))[0].includes("disguise cost, {B}{R}"), `the table says so: ${offerDetails(s, 0, faceUps(s))[0]}`);
  eq(faceUps(s, 1).length, 0, "never Maya's to turn face up");
  s.objects[id].counters["+1/+1"] = 1;
  const stamp = s.objects[id].timestamp;
  applyAction(s, 0, faceUps(s)[0]);
  const c = characteristicsOf(s, id);
  eq([s.objects[id].card, s.objects[id].faceDown, s.objects[id].disguised, c.power, c.toughness, c.keywords, s.objects[id].counters["+1/+1"], s.stack.length],
    [ARNO, undefined, undefined, 4, 4, ["Deathtouch", "Disguise"], 1, 0], "Arno, the same object: its counter kept, ward gone, deathtouch his, nothing on the stack");
  ok(s.objects[id].timestamp > stamp, "with a new timestamp (CR 613.7f)");
}
{
  /* Never for its mana cost: {2}{B}{R} in the pool turns the disguised Arno face up only for {B}{R}. A manifested Arno either
     way: his mana cost (a creature card, CR 701.40b) or his disguise cost. */
  const s = play([...THREE, at(0, "battlefield", "Swamp", "Mountain", "Wastes", "Wastes")], [...TAP3, {cast: ARNO, disguise: true}, {resolve: true},
    {tap: "Swamp"}, {tap: "Mountain"}, {tap: "Wastes"}, {tap: "Wastes"}], {}, FIX);
  eq(faceUps(s).map((a) => a.disguise === true), [true], "cast with disguise: its disguise cost alone");
  const m = play([at(0, "battlefield", "Swamp", "Mountain", "Wastes", "Wastes")], [{tap: "Swamp"}, {tap: "Mountain"}, {tap: "Wastes"}, {tap: "Wastes"}], {library: [ARNO]}, FIX);
  runEffect(m, {effect: "manifest", who: [0]}, {controller: 0, source: null});
  eq(faceUps(m).map((a) => a.disguise === true).sort(), [false, true], "manifested: for its mana cost, or for its disguise cost");
  const turned = structuredClone(m);
  applyAction(turned, 0, faceUps(turned).find((a) => a.disguise === true));
  eq([turned.players[0].manaPool.B, turned.players[0].manaPool.R, turned.players[0].manaPool.C], [0, 0, 2], "for its disguise cost: {B}{R} paid, the {C}{C} left");
  ok(characteristicsOf(m, disguised(m)[0]).keywords.length === 0, "a manifested card has no ward: only disguise's face-down spell and permanent have it");
}
{
  /* From the command zone too, his tax added (CR 903.8). */
  const s = runScenario({name: "commander", setup: [at(0, "command", ARNO), at(0, "battlefield", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes")], steps: [...TAP3]}, index.definition, FIX).state;
  eq(casts(s).map((a) => [a.from, a.disguise, a.tax]), [["command", true, 0]], "his commander, face down from the command zone for {3}");
  applyAction(s, 0, casts(s)[0]);
  eq([s.stack[0].faceDown, s.objects[s.stack[0].objectId].commander], [true, true], "cast: a face-down spell, still his commander");
}
{
  /* More than one way to pay its {3}: asked first, the card in hand as it was meanwhile, then cast face down. */
  /* Jet Medallion's "black spells cost {1} less" is Arno's, never the colorless face-down spell's: {3}, asked as it is weighed. */
  const s = play([at(0, "hand", ARNO), at(0, "battlefield", "Jet Medallion", "Swamp", "Mountain", "Wastes", "Wastes")], [{tap: "Swamp"}, {tap: "Mountain"}, {tap: "Wastes"}, {tap: "Wastes"}], {}, FIX);
  eq(casts(s).filter((a) => !a.disguise).length, 1, "with Jet Medallion, Arno as himself for {1}{B}{R}");
  const offer = casts(s).find((a) => a.disguise);
  ok(offer.payWays === true, "{B}{R}{C}{C}: more than one way to pay {3}");
  applyAction(s, 0, offer);
  const card = s.objects[s.zones.hand[0][0]];
  eq([s.awaiting?.kind, card.card, card.faceDown], ["choose-cost", ARNO, undefined], "asked which mana, Arno still face up in his hand");
  ok(labels(s).length > 1 && labels(s).every((l) => (l.match(/\{/g) ?? []).length === 3), `each way three mana: ${labels(s).join(", ")}`);
  choose(s, labels(s)[0]);
  eq([s.stack.length, s.stack[0]?.faceDown], [1, true], "and then cast face down");
}
{
  /* Shown face down for a cast, and back: ward {2}, and the card as it was. */
  const s = play(THREE, TAP3, {}, FIX);
  const id = s.zones.hand[0][0], card = s.objects[id], before = structuredClone(card);
  const shown = shownFaceDown(card);
  eq([shown.id, shown.zone, shown.card, shown.keywords, shown.abilities.map((a) => a.text), shown.faceDownCard.card, shown.faceDownCard.abilities.some((a) => a.rule === "disguise")],
    [id, "hand", null, ["Ward"], ["Ward {2}"], ARNO, true], "shown face down: the same card where it is, nameless, with ward {2}, the card beside it");
  eq(card, before, "the card itself untouched");
  const other = shownFaceDown({id: 7, zone: "hand", card: "Odd", loyalty: 3, spell: {id: "s"}, counters: {time: 1}, types: ["Planeswalker"]});
  eq([other.loyalty, other.spell, other.counters, other.faceDownCard.loyalty, other.faceDownCard.spell], [undefined, undefined, {time: 1}, 3, {id: "s"}],
    "none of the card's own characteristics left on it -- a loyalty, a spell -- only beside it; the rest, its counters, its own");
  const hash = hashState(s);
  legalActions(s, 0);
  eq([hashState(s), s.objects[id] === card], [hash, true], "asking what may be done changes nothing: the card itself back in its place");
}
{
  /* From where a permission opens to it, weighed face down: Mystic Forge's colorless spells take a face-down Arno in, its
     black-red self not; Thundermane Dragon's power 4 or greater takes a 5/5 in, its face-down 2/2 not; Bolas's Citadel's
     life and a free cast are alternative costs too, never with disguise (CR 118.9a). */
  const top = (permission, card, lands = ["Wastes", "Wastes", "Wastes"]) => play([at(0, "battlefield", permission, ...lands)], lands.map((l) => ({tap: l})), {library: [card]}, FIX);
  const forge = top("Mystic Forge", ARNO);
  eq(casts(forge).map((a) => [a.from, a.disguise === true]), [["library", true]], "Mystic Forge: Arno face down from the top of his library, for {3}");
  const dragon = top("Thundermane Dragon", "Big Disguiser", ["Forest", "Wastes", "Wastes", "Wastes", "Wastes"]);
  eq(legalActions(dragon, 0).filter((a) => a.kind === "cast").map((a) => a.disguise === true), [false], "Thundermane Dragon: the 5/5 as itself, never face down as a 2/2");
  eq(casts(top("Bolas's Citadel", ARNO)).map((a) => [a.disguise === true, a.lifeInstead]), [[false, 4]], "Bolas's Citadel: Arno for 4 life, not face down");
  eq(casts(top("Free Top", ARNO)).map((a) => [a.disguise === true, a.free === true]), [[false, true]], "a free cast: Arno for nothing, not face down");
  const grave = play([at(0, "graveyard", "Escaper", "Wastes", "Wastes"), at(0, "battlefield", "Forest", "Wastes", "Wastes", "Wastes")],
    [{tap: "Forest"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}], {}, FIX);
  eq(legalActions(grave, 0).filter((a) => a.kind === "cast").map((a) => [a.from, a.escape !== undefined, a.disguise === true]), [["graveyard", true, false]],
    "escape from the graveyard, never disguise: no permission casts it from there");
}
{
  /* A scenario's cast says which: `disguise: true` face down, without it as itself -- with {2}{B}{R}, both are offered. */
  const both = [at(0, "hand", ARNO), at(0, "battlefield", "Swamp", "Mountain", "Wastes", "Wastes")];
  const pay = [{tap: "Swamp"}, {tap: "Mountain"}, {tap: "Wastes"}, {tap: "Wastes"}];
  const down = runScenario({name: "down", setup: both, steps: [...pay, {cast: ARNO, disguise: true}]}, index.definition, FIX).state;
  choose(down, labels(down)[0]);
  const up = runScenario({name: "up", setup: both, steps: [...pay, {cast: ARNO}]}, index.definition, FIX).state;
  eq([down.stack[0].faceDown, up.stack[0].faceDown], [true, false], "face down when the step says disguise, as itself when it does not");
}
ok(keywordBuilt("Disguise"), "Disguise is built (engine-constructs: a keyword with behavior)");

done("disguise: a card cast face down for {3}, a nameless 2/2 with ward {2} on the stack and the battlefield, never named to another seat; turned face up for its disguise cost alone, a special action.");
