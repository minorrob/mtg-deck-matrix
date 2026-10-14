/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* WAVE 4B, LANE J3: KEYWORDS NOT YET BUILT, AND THE SMALL RULES THE LANE'S MOST-PLAYED CARDS NEEDED -- what the scenarios of
 * its thirty cards cannot reach.
 *
 *   - BEGINNING THE GAME WITH IT ON THE BATTLEFIELD (CR 103.6a; Gemstone Caverns): an opening hand's action, once the mulligans
 *     are done -- never the starting player's, when the card says so -- the card put there with its luck counter, and then a
 *     card of the player's hand exiled, theirs to choose (rules/mulligan.mjs). Scenarios begin after the opening.
 *   - GIFT (CR 702.174): an offer for each opponent beside the cast that promises nothing (rules/actions.mjs), what the chosen
 *     player gets -- an instant's first, a permanent's as it enters -- a copy's gift (CR 707.10), the six kinds, the words a
 *     player is offered (game/room/room.mjs), and what the compiler refuses.
 *   - ETERNALIZE (CR 702.129a): the token copy's black, its 4/4, its Zombie besides, and no mana cost.
 *   - EXTORT (CR 702.101a): each instance its own trigger, and {W/B} paid by tapping a source as an "unless" cost is.
 *   - A BASIC LAND TYPE GIVEN (CR 305.7, Yavimaya): its mana ability, beside another land type given and under Song of the Dryads.
 *   - BASE POWER (CR 208.4b), "the most any one player" of what was remembered (Windfall), a power doubled below zero (CR
 *     701.10c), two more land drops (Azusa), a player's hexproof for a turn (Dawn's Truce), and a search of two zones at once
 *     (Finale of Devastation): the grammar of each, and its refusals.
 */
import {play, happen, idOf, compiled, index, checks, creature, at, labels, choose, drive, pilotsAnswer} from "./helpers/x11-keywords.mjs";
import {createState, addObject, cardsIn} from "../game/engine/state/index.mjs";
import {beginGame, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {beginMulligans} from "../game/engine/rules/mulligan.mjs";
import {legalActions, applyAction, manaAlternatives} from "../game/engine/rules/actions.mjs";
import {characteristicsOf, abilitiesOf, deriveMemo} from "../game/engine/rules/layers.mjs";
import {unlessPlans} from "../game/engine/rules/mana.mjs";
import {pushCopy} from "../game/engine/rules/stack.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {targetCandidates, bindEffect} from "../game/engine/script/bind.mjs";
import {conditionHolds, conditionProblems} from "../game/engine/script/condition.mjs";
import {amountProblems} from "../game/engine/script/amount.mjs";
import {compileSelector} from "../game/engine/script/filter.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {offerDetails} from "../game/room/room.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {isKeyword} from "../game/engine/vocabulary.mjs";
import {keywordBuilt, FORGE_COUNTS} from "../game/tools/engine-constructs.mjs";
import {tableDefinition} from "../game/engine/cards/definitions.mjs";

const {eq, ok, throws, done} = checks("engine-wave4b-j3");
const BEAR = creature(["Bear"], 2, 2);
const FIX = {Bear: BEAR, "Their Bear": BEAR};
const CAVERNS = "Gemstone Caverns";
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};

/* ---- Gemstone Caverns: begun on the battlefield from the opening hand (CR 103.6a) ---- */
/* Each library seven cards, so each opening hand is all of them: Caverns first in each list that has one. */
function opening(hands, seats = 2) {
  const s = createState({matchId: "m", seed: "caverns", players: ["Rob", "Maya", "Trey"].slice(0, seats).map((name) => ({name}))});
  hands.forEach((cards, seat) => { for (const name of cards) addObject(s, {...(name === "Wastes" ? WASTES : {...index.definition(name), card: name}), owner: seat, controller: seat}, "library", seat); });
  const rng = createRng("caverns");
  beginMulligans(s, rng);
  while (s.awaiting?.kind === "mulligan-decision") resolveAwaiting(s, [0], null, rng);
  return {s, rng};
}
const SEVEN = (first) => [first, "Wastes", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes"];
const onField = (s, name, owner) => s.zones.battlefield.filter((id) => s.objects[id].card === name && s.objects[id].owner === owner);
{
  const {s, rng} = opening([SEVEN(CAVERNS), SEVEN(CAVERNS)]);
  /* Rob is the starting player: his Caverns is no action of his, so nobody asks him; Maya is asked. */
  eq([s.awaiting?.kind, s.awaiting?.player, labels(s)], ["opening-hand", 1, [`Begin the game with ${CAVERNS} on the battlefield`, "Begin the game"]],
    "the starting player is not offered it; Maya is");
  choose(s, `Begin the game with ${CAVERNS} on the battlefield`);
  const [caverns] = onField(s, CAVERNS, 1);
  eq([caverns !== undefined, s.objects[caverns]?.counters?.luck, s.objects[caverns]?.controller], [true, 1, 1], "on the battlefield, Maya's, with a luck counter");
  /* "If you do, exile a card from your hand": hers to choose, asked next. */
  eq([s.awaiting?.kind, s.awaiting?.player, awaitingChoice(s).title, labels(s).length], ["opening-hand", 1, `${CAVERNS}: exile a card from your hand`, 6], "then: which card to exile, of her six");
  throws(() => resolveAwaiting(structuredClone(s), [9], null, rng), /Choose a card from your hand to exile/, "an answer it does not offer is refused");
  resolveAwaiting(s, [0], null, rng);
  eq([cardsIn(s, "exile").length, cardsIn(s, "hand", 1).length, s.awaiting ?? null, s.mulligan.done], [1, 5, null, true], "one exiled, five kept, and the game may begin");
  eq(onField(s, CAVERNS, 0).length, 0, "Rob's Caverns stays in his hand");
  /* Its mana: any color, with the luck counter -- for Maya once the first turn begins. */
  beginGame(s);
  eq(manaAlternatives(s, 1, abilitiesOf(s, caverns).find((a) => a.kind === "mana"), caverns).length, 5, "with its luck counter: one mana of any color");
}
{
  /* Not taken: in her hand, no counter, nothing exiled. */
  const {s, rng} = opening([SEVEN("Wastes"), SEVEN(CAVERNS)]);
  choose(s, "Begin the game");
  eq([onField(s, CAVERNS, 1).length, cardsIn(s, "hand", 1).length, cardsIn(s, "exile").length, s.mulligan.done], [0, 7, 0, true], "declined: all seven kept");
  void rng;
}
{
  /* A hand of the Caverns alone: begun with it, and nothing left to exile -- nobody is asked. */
  const {s} = opening([SEVEN("Wastes"), [CAVERNS]]);
  choose(s, `Begin the game with ${CAVERNS} on the battlefield`);
  eq([onField(s, CAVERNS, 1).length, s.awaiting ?? null, s.mulligan.done], [1, null, true], "nothing to exile: no question");
}
{
  /* Three players: Maya, then Trey, each in turn order after the starting player (CR 103.6). */
  const {s, rng} = opening([SEVEN("Wastes"), SEVEN(CAVERNS), SEVEN(CAVERNS)], 3);
  eq(s.awaiting?.player, 1, "Maya first");
  choose(s, "Begin the game");
  eq([s.awaiting?.player, labels(s)[0]], [2, `Begin the game with ${CAVERNS} on the battlefield`], "then Trey");
  /* The house pilot answers both questions it is asked. */
  const pilot = housePilot({seat: 2});
  for (let n = 0; n < 4 && s.awaiting; n += 1) resolveAwaiting(s, pilot.answer(projectFor(s, 2), awaitingChoice(s)).indices, null, rng);
  eq(s.mulligan.done, true, "the house pilot: the opening done");
}
{
  /* What the compiler refuses: a beginning that is not a permanent card's, counters not a number, effects beside it, two cards. */
  const begin = (extra, identity = {types: ["Land"], manaCost: null, power: null, toughness: null}) => compiled([{kind: "static", text: "x", rule: "opening-hand", affects: {what: "card", self: true},
    begin: "battlefield", ...extra}], identity).problems.filter((p) => p.includes("opening hand")).length;
  eq([begin({}), begin({withCounters: {luck: 1}, notStarting: true, exileFromHand: 1}), begin({withCounters: {luck: 0}}), begin({exileFromHand: 2}),
    begin({effects: [{effect: "gainLife", amount: 1}]}), begin({notStarting: false}), begin({}, {types: ["Instant"], manaCost: "{U}", power: null, toughness: null}), begin({begin: "hand"})],
  [0, 0, 1, 1, 1, 1, 1, 1], "begin: battlefield, a permanent card, its counters, notStarting, one card exiled, and no effects");
  /* Its mana "instead": a counter's, beside a fixed mana -- one of any color, or a fixed mana. */
  const mana = (first) => compiled([{kind: "activated", text: "x", mana: true, cost: [{atom: "{T}"}], effects: [{effect: "addMana", ...first}]}], {types: ["Land"], manaCost: null, power: null, toughness: null});
  eq([mana({mana: {C: 1}, instead: {counter: "luck", anyColor: true}}).definition?.abilities[0].instead, mana({mana: {C: 1}, instead: {counter: "luck", mana: {G: 2}}}).definition?.abilities[0].instead],
    [{counter: "luck", anyColor: true}, {counter: "luck", produces: {G: 2}}], "instead: any color, or a fixed mana");
  eq([mana({mana: {C: 1}, instead: {anyColor: true}}).problems.length > 0, mana({anyColor: true, instead: {counter: "luck", mana: {G: 1}}}).problems.length > 0,
    mana({mana: {C: 1}, instead: {counter: "luck", anyColor: true, count: 2}}).problems.length > 0], [true, true, true], "no counter, no fixed mana beside it, or more: refused");
}
{
  /* {W/B} for extort paid by tapping the lucky Caverns, a plain source of any color now (rules/mana.mjs, manaAbilityNow). */
  const s = play([at(0, "battlefield", CAVERNS)], [], {}, FIX);
  const caverns = idOf(s, CAVERNS);
  eq(unlessPlans(s, 0, "{W/B}").plans.length, 0, "no luck counter: {C} pays no {W/B}");
  s.objects[caverns].counters.luck = 1;
  eq(unlessPlans(s, 0, "{W/B}").plans.length, 1, "a luck counter: it pays {W/B}");
}

/* ---- Gift (CR 702.174) ---- */
{
  /* Dawn's Truce, three players: an offer for no gift and one for each opponent, said to the player with whom. */
  const s = play([at(0, "battlefield", "Plains", "Wastes"), at(0, "hand", "Dawn's Truce")], [{tap: "Plains"}, {tap: "Wastes"}], {seats: 3}, FIX);
  const casts = legalActions(s, 0).filter((a) => a.kind === "cast");
  eq(casts.map((a) => a.gift ?? null).sort(), [1, 2, null], "no gift, or promised to Maya or Trey");
  eq(offerDetails(s, 0, casts).filter((d) => d.includes("gift")).sort(), ["promising Maya a gift", "promising Trey a gift"], "said with whom");
  /* A gift to the caster or a player not there is no offer: refused. */
  throws(() => applyAction(structuredClone(s), 0, {...casts.find((a) => a.gift === 1), gift: 0}), /not a legal action/, "a gift to oneself is refused");
  /* A copy of the spell has the gift promised to the same player (CR 707.10). */
  applyAction(s, 0, casts.find((a) => a.gift === 2));
  const entry = s.stack.at(-1);
  eq(entry.gift, 2, "the stack entry holds whom");
  const copy = pushCopy(s, entry, {controller: 0});
  eq(copy.gift, 2, "and its copy the same");
  /* "The chosen player": the one promised it, none once they have left the game (CR 800.4a). */
  eq(bindEffect({effect: "draw", who: "the chosen player"}, {controller: 0, gift: 2}, s).who, [2], "the chosen player, bound");
  s.players[2].lost = true;
  eq(bindEffect({effect: "draw", who: "the chosen player"}, {controller: 0, gift: 2}, s).who, [], "gone: nobody");
  eq(bindEffect({effect: "draw", who: "the chosen player"}, {controller: 0}, s).who, [], "none promised: nobody");
  eq([conditionHolds(s, {giftPromised: true}, {controller: 0, gift: 2}), conditionHolds(s, {giftPromised: true}, {controller: 0}),
    conditionHolds(s, {giftPromised: false}, {controller: 0})], [true, false, true], "promised, whoever has left since; and not");
  eq(conditionProblems({giftPromised: "yes"}), ["giftPromised is true or false: whether the gift was promised"], "giftPromised is true or false");
}
{
  /* An opponent who has left the game is promised nothing (CR 800.4a): no offer for them. */
  const s = play([at(0, "battlefield", "Plains", "Wastes"), at(0, "hand", "Dawn's Truce")], [{tap: "Plains"}, {tap: "Wastes"}], {seats: 3}, FIX);
  s.players[2].lost = true;
  eq(legalActions(s, 0).filter((a) => a.kind === "cast").map((a) => a.gift ?? null).sort(), [1, null], "Trey gone: no gift to him");
  /* "If the gift was promised", asked as each effect and each branch reaches the head of the resolution (script/resolution.mjs). */
  const life = (effects, gift) => {
    const t = play([at(0, "battlefield", "Wastes")], [], {}, FIX);
    beginResolution(t, effects, {controller: 0, ...(gift !== undefined ? {gift} : {})});
    return t.players[0].life;
  };
  const gain = [{effect: "gainLife", amount: 1, condition: {giftPromised: true}}];
  const branch = [{effect: "branch", if: {giftPromised: true}, then: [{effect: "gainLife", amount: 2}], otherwise: [{effect: "gainLife", amount: 1}]}];
  eq([life(gain, 1), life(gain), life(branch, 1), life(branch)], [41, 40, 42, 41], "promised: the effect, the branch's then; not: neither");
  /* A Treasure gift not promised: nobody's Treasure (the condition the compiler puts on what a gift gives). */
  const giver = compiled([{kind: "keyword", text: "Gift a Treasure", keyword: "gift", gift: "a Treasure"}, {kind: "spell", text: "Draw a card.", effects: [{effect: "draw", count: 1}]}],
    {types: ["Instant"], manaCost: "{1}", power: null, toughness: null}).definition;
  const u = play([at(0, "battlefield", "Wastes"), at(0, "hand", "Generous")], [{tap: "Wastes"}, {cast: "Generous"}, {resolve: true}], {}, {...FIX, Generous: giver});
  eq([u.zones.battlefield.filter((id) => u.objects[id].card === "Treasure").length, cardsIn(u, "hand", 0).length], [0, 1], "no gift: no Treasure for anyone, and the card drawn");
}
{
  /* A permanent's gift: "when this permanent enters, if its gift cost was paid" (CR 702.174b) -- a Food for Maya. */
  const gifted = (gift) => ({types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}", colors: ["G"], power: 2, toughness: 2,
    ...compiled([{kind: "keyword", text: `Gift ${gift}`, keyword: "gift", gift}], {power: 2, toughness: 2}).definition});
  const s = play([at(0, "battlefield", "Wastes"), at(0, "hand", "Giver")], [{tap: "Wastes"}], {}, {...FIX, Giver: gifted("a Food")});
  const casts = legalActions(s, 0).filter((a) => a.kind === "cast");
  eq(casts.map((a) => a.gift ?? null).sort(), [1, null], "a permanent spell: no gift, or to Maya");
  applyAction(s, 0, casts.find((a) => a.gift === 1));
  drive(s, (st) => st.stack.length === 0 && !(st.pendingTriggers ?? []).length && st.zones.battlefield.some((id) => st.objects[id].card === "Giver"));
  const giver = idOf(s, "Giver");
  eq(s.objects[giver].gift, 1, "the permanent knows whom");
  drive(s, (st) => st.stack.length === 0 && !(st.pendingTriggers ?? []).length && st.zones.battlefield.some((id) => st.objects[id].card === "Food"));
  eq(s.zones.battlefield.filter((id) => s.objects[id].card === "Food").map((id) => s.objects[id].controller), [1], "Maya's Food");
  /* Without the gift: no trigger, no Food. */
  const t = play([at(0, "battlefield", "Wastes"), at(0, "hand", "Giver")], [{tap: "Wastes"}, {cast: "Giver"}, {resolve: true}], {}, {...FIX, Giver: gifted("a Food")});
  eq([t.stack.length, (t.pendingTriggers ?? []).length, t.zones.battlefield.some((id) => t.objects[id].card === "Food")], [0, 0, false], "no gift: nothing");
}
{
  /* The six kinds (CR 702.174d-i), each what the chosen player gets, before an instant's other effects. */
  const spellOf = (gift) => compiled([{kind: "keyword", text: `Gift ${gift}`, keyword: "gift", gift}, {kind: "spell", text: "Draw a card.", effects: [{effect: "draw", count: 1}]}],
    {types: ["Instant"], power: null, toughness: null}).definition.spell;
  const first = (gift) => { const {condition, ...rest} = spellOf(gift).effects[0]; return [rest.effect, rest.who ?? rest.controller, rest.token?.predefined ?? rest.token?.name ?? null, condition]; };
  eq(["a card", "a Food", "a tapped Fish", "an extra turn", "a Treasure", "an Octopus"].map(first), [
    ["draw", "the chosen player", null, {giftPromised: true}], ["createToken", "the chosen player", "Food", {giftPromised: true}],
    ["createToken", "the chosen player", "Fish", {giftPromised: true}], ["addTurn", "the chosen player", null, {giftPromised: true}],
    ["createToken", "the chosen player", "Treasure", {giftPromised: true}], ["createToken", "the chosen player", "Octopus", {giftPromised: true}]], "each kind, first");
  eq([spellOf("a tapped Fish").effects[0].tapped, spellOf("an Octopus").effects[0].token.power, spellOf("a card").effects.at(-1).effect, spellOf("a card").additionalCost],
    [true, 8, "draw", [{atom: "gift"}]], "the Fish tapped, the Octopus 8/8, the spell's own effect after, and the additional cost");
  const refused = (abilities, identity = {types: ["Instant"], power: null, toughness: null}) => compiled(abilities, identity).problems.length > 0;
  eq([refused([{kind: "keyword", text: "Gift a hug", keyword: "gift", gift: "a hug"}, {kind: "spell", text: "x", effects: [{effect: "draw", count: 1}]}]),
    refused([{kind: "keyword", text: "Gift a card", keyword: "gift", gift: "a card"}, {kind: "keyword", text: "Gift a Food", keyword: "gift", gift: "a Food"}, {kind: "spell", text: "x", effects: [{effect: "draw", count: 1}]}]),
    refused([{kind: "keyword", text: "Gift a card", keyword: "gift", gift: "a card"}, {kind: "spell", text: "x", effects: [{effect: "modal", modes: [{text: "a", effects: [{effect: "draw", count: 1}]}, {text: "b", effects: [{effect: "gainLife", amount: 1}]}]}]}]),
    refused([{kind: "keyword", text: "Gift a card", keyword: "gift", gift: "a card"}, {kind: "spell", text: "x", effects: [{effect: "draw", count: 1}]}])],
  [true, true, true, false], "a kind there is not, two gifts, a gift on a spell of modes chosen as it is cast: refused");
  /* Each kind given, three players, promised to Trey: his alone (CR 702.174d-i). */
  const given = (gift) => {
    const s = play([at(0, "battlefield", "Wastes")], [], {seats: 3}, FIX);
    for (const effect of spellOf(gift).effects.slice(0, -1)) happen(s, bindEffect(effect, {controller: 0, gift: 2}, s), {controller: 0, source: null});
    const trey = s.zones.battlefield.filter((id) => s.objects[id].controller === 2).map((id) => [s.objects[id].card, s.objects[id].tapped === true, characteristicsOf(s, id).power]);
    return [cardsIn(s, "hand", 2).length, trey, (s.extraTurns ?? []).map((t) => t.player), s.zones.battlefield.filter((id) => s.objects[id].controller !== 2 && s.objects[id].card !== "Wastes").length];
  };
  eq(["a card", "a Food", "a tapped Fish", "an extra turn", "a Treasure", "an Octopus"].map(given), [
    [1, [], [], 0], [0, [["Food", false, null]], [], 0], [0, [["Fish", true, 1]], [], 0], [0, [], [2], 0], [0, [["Treasure", false, null]], [], 0], [0, [["Octopus", false, 8]], [], 0]],
    "Trey draws, or gets a Food, a tapped 1/1 Fish, an extra turn, a Treasure, an 8/8 Octopus -- nobody else anything");
}

/* ---- Eternalize (CR 702.129a): the token's copiable values ---- */
{
  const s = play([at(0, "graveyard", "Fanatic of Rhonas"), at(0, "battlefield", "Forest", "Forest", "Wastes", "Wastes")],
    [{tap: "Forest"}, {tap: "Forest"}, {tap: "Wastes"}, {tap: "Wastes"}, {activate: "Fanatic of Rhonas"}, {resolve: true}], {}, FIX);
  const token = idOf(s, "Fanatic of Rhonas"), c = characteristicsOf(s, token);
  eq([s.objects[token].token, c.colors, [...c.subtypes].sort(), s.objects[token].manaCost, c.power, c.toughness], [true, ["B"], ["Druid", "Snake", "Zombie"], null, 4, 4],
    "a black 4/4 Zombie Snake Druid token with no mana cost");
  const eternal = (cost, identity) => compiled([{kind: "keyword", text: "Eternalize", keyword: "eternalize", cost}], identity).problems.filter((p) => p.includes("eternalize")).length;
  eq([eternal([{atom: "mana", cost: "{2}"}], {}), eternal([{atom: "payLife", amount: 2}], {}), eternal([{atom: "mana", cost: "{2}"}], {types: ["Artifact"], power: null, toughness: null})], [0, 1, 1],
    "a mana cost, on a creature card");
}

/* ---- Extort (CR 702.101a-b): two instances, two triggers ---- */
{
  const s = play([at(0, "battlefield", "Crypt Ghast", "Crypt Ghast", "Wastes"), at(0, "hand", "Trinket")],
    [{tap: "Wastes"}, {cast: "Trinket"}], {}, {...FIX, Trinket: {types: ["Instant"], manaCost: "{1}", colors: [], spell: {id: "s", text: "Draw a card.", targets: [], effects: [{effect: "draw", count: 1}]}}});
  drive(s, (st) => st.stack.length === 3 && !st.awaiting);
  eq(s.stack.map((e) => e.name), ["Trinket", "Crypt Ghast", "Crypt Ghast"], "the spell, and above it each Ghast's extort");
  eq([isKeyword("extort"), isKeyword("exalted"), isKeyword("eternalize"), isKeyword("gift")], [true, true, true, true], "the four words a script may say");
  eq([keywordBuilt("Extort"), keywordBuilt("Exalted"), keywordBuilt("Eternalize"), keywordBuilt("Gift"), keywordBuilt("MayEffectFromOpeningHand"), FORGE_COUNTS.PromisedGift.status],
    [true, true, true, true, true, "built"], "and the coverage tool credits them");
}

/* ---- A basic land type given (CR 305.7) ---- */
{
  const URBORGISH = {types: ["Land"], supertypes: ["Legendary"], manaCost: null, colors: [], abilities: [{id: "u", kind: "static", text: "Each land is a Swamp in addition to its other land types.",
    layer: 4, affects: {what: "permanent", types: ["Land"]}, apply: {addSubtypes: ["Swamp"]}}]};
  deriveMemo.checkPrune(true);
  try {
    const s = play([at(0, "battlefield", "Yavimaya, Cradle of Growth", "Swampy", "Island")], [], {}, {...FIX, Swampy: URBORGISH});
    const island = idOf(s, "Island");
    eq(legalActions(s, 0).filter((a) => a.kind === "activate-mana" && a.objectId === island).map((a) => Object.keys(a.mana)[0]).sort(), ["B", "G", "U"], "two land types given: {U}, {G} and {B}");
    const yav = idOf(s, "Yavimaya, Cradle of Growth");
    eq(legalActions(s, 0).filter((a) => a.kind === "activate-mana" && a.objectId === yav).map((a) => Object.keys(a.mana)[0]).sort(), ["B", "G"], "Yavimaya itself a Swamp too");
    /* Under Song of the Dryads: a Forest land with no other ability than its {G} -- one, not two. */
    const t = play([at(0, "battlefield", "Yavimaya, Cradle of Growth", "Swamp", "Forest", "Wastes", "Wastes"), at(0, "hand", "Song of the Dryads")],
      [{tap: "Forest"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Song of the Dryads", targets: [{card: "Swamp"}]}, {resolve: true}], {}, FIX);
    const swamp = idOf(t, "Swamp");
    eq(abilitiesOf(t, swamp).filter((a) => a.kind === "mana").map((a) => JSON.stringify(a.produces)), ['{"G":1}'], "Song of the Dryads: one {G}");
    /* A creature given a basic land type is not a land: no mana ability (CR 305.7 is a land's). */
    const u = play([at(0, "battlefield", "Bear")], [], {}, FIX);
    happen(u, {effect: "effectUntil", targets: [idOf(u, "Bear")], layer: 4, apply: {addSubtypes: ["Forest"]}, until: "end-of-turn"}, {controller: 0, source: null});
    eq(abilitiesOf(u, idOf(u, "Bear")).filter((a) => a.kind === "mana").length, 0, "a Forest Bear that is no land taps for nothing");
  } finally { deriveMemo.checkPrune(false); }
}

/* ---- Base power (CR 208.4b), and the selector that reads it ---- */
{
  const s = play([at(0, "battlefield", "Bear"), at(0, "graveyard", "Bear")], [], {}, FIX);
  const bear = idOf(s, "Bear"), card = cardsIn(s, "graveyard", 0)[0];
  const above = compileSelector({powerAboveBase: true});
  const aboveThere = compileSelector({what: "card", zone: "graveyard", powerAboveBase: true}), cardThere = compileSelector({what: "card", zone: "graveyard"});
  eq([characteristicsOf(s, bear).basePower, above(s, bear, {controller: 0}), cardThere(s, card, {controller: 0}), aboveThere(s, card, {controller: 0})], [2, false, true, false],
    "a 2/2 at its base; a card's printed power is its base");
  happen(s, {effect: "pump", targets: [bear], power: 1, toughness: 0}, {controller: 0, source: null});
  eq([characteristicsOf(s, bear).basePower, characteristicsOf(s, bear).power, above(s, bear, {controller: 0})], [2, 3, true], "+1/+0: power 3 above its base 2");
  happen(s, {effect: "putCounter", targets: [bear], counter: "-1/-1", count: 1}, {controller: 0, source: null});
  eq(above(s, bear, {controller: 0}), false, "a -1/-1 counter back to 2: not above");
  throws(() => compileSelector({powerAboveBase: 1}), /powerAboveBase is true/, "powerAboveBase is true");
}

/* ---- Amounts: "the most any one player" of what was remembered, and a power as it is ---- */
{
  eq([amountProblems({rememberedCount: true, controlledBy: "most"}), amountProblems({count: {what: "permanent"}, controlledBy: "most"}).length,
    amountProblems({powerOf: "that card", signed: true}), amountProblems({count: {what: "permanent"}, signed: true}).length, amountProblems({powerOf: "self", signed: 1}).length],
  [[], 1, [], 1, 1], "controlledBy \"most\" of a rememberedCount; signed beside powerOf or toughnessOf");
}

/* ---- Azusa's count, a player's hexproof for a turn, and a search of two zones ---- */
{
  const azusa = (count) => validateScript({schema: "CrankCardScript@1", identity: {name: "Odd", oracleId: "x", types: ["Creature"], subtypes: [], manaCost: "{1}", colors: [], colorIdentity: [], power: 1, toughness: 1},
    oracleText: "x", source: "hand", abilities: [{kind: "static", text: "x", rule: "extra-land-drop", affects: {what: "player", who: "you"}, count}]}).errors.filter((e) => e.path.endsWith(".count")).length;
  eq([azusa(2), azusa(1), azusa(0), azusa("two")], [0, 0, 1, 1], "an additional land drop's count: a whole number, 1 or more");
  const s = play([at(0, "battlefield", "Bear")], [], {}, FIX);
  const player = {what: "player"};
  eq(targetCandidates(s, player, {controller: 1}).filter((t) => t.kind === "player").map((t) => t.id).sort(), [0, 1], "Rob a target before");
  happen(s, {effect: "effectUntil", rule: "player-hexproof", who: [0], until: "end-of-turn"}, {controller: 0, source: null});
  eq([targetCandidates(s, player, {controller: 1}).filter((t) => t.kind === "player").map((t) => t.id), targetCandidates(s, player, {controller: 0}).filter((t) => t.kind === "player").map((t) => t.id).sort()],
    [[1], [0, 1]], "hexproof for the turn: no target of Maya's, still his own");
  /* Two zones searched as one: both named in the question, the X of its spell read (script/filter.mjs). */
  const t = play([at(0, "battlefield", "Forest", "Forest", "Wastes", "Wastes"), at(0, "hand", "Finale of Devastation"), at(0, "graveyard", "Bear")],
    [{tap: "Forest"}, {tap: "Forest"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Finale of Devastation", x: 2}, {resolve: true}, {choose: ["Search your library and your graveyard"]}], {library: ["Bear"]}, FIX);
  eq([awaitingChoice(t).title, labels(t).sort(), awaitingChoice(t).min], ["Search your library and graveyard", ["Bear, in your graveyard", "Bear, in your library"], 0],
    "both zones named, each card's said, and nothing need be found");
  const both = pilotsAnswer(t);
  eq(both.every((st) => st.awaiting === null || st.awaiting === undefined || st.awaiting.kind !== "effect-choice" || st.awaiting.effect !== "chooseCard"), true, "the pilots answer it");
}

/* ---- every one of the lane's cards, at the table ---- */
for (const name of ["Cyclonic Rift", "Yavimaya, Cradle of Growth", "Victimize", "Windfall", "Sink into Stupor // Soporific Springs", "The Great Henge",
  "Simic Growth Chamber", "Ornithopter of Paradise", "Cascade Bluffs", "Snap", "Azusa, Lost but Seeking", "Buried Alive", "Kutzil, Malamet Exemplar",
  "Witch Enchanter // Witch-Blessed Meadow", "Finale of Devastation", "Unnatural Growth", "Fanatic of Rhonas", "Warren Soultrader", "Mox Opal", "Crypt Ghast",
  "Ancient Den", "Ignoble Hierarch", "Gemstone Caverns", "Felidar Retreat", "Lotho, Corrupt Shirriff", "Ohran Frostfang", "Bayou", "Dawn's Truce", "Fabricate",
  "Elemental Bond"])
  ok(index.resolve(name)?.playable === true && tableDefinition(name) !== null, `${name}: playable, and the table plays it (cards/definitions.mjs)`);

done("Gemstone Caverns begun on the battlefield from the opening hand, gift's offers and what each kind gives, eternalize's token, extort's instances and payment, a basic land type's mana ability, base power, the most any one player discarded, two more land drops, a player's hexproof for a turn, a search of two zones, and the table playing all thirty of the lane's cards");
