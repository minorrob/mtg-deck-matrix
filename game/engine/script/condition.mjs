/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* A CONDITION ON AN ABILITY (M4 phase 3, batch 11: the catalog's next missing option, "a permanent present").
 *
 * Two rules use the same words and differ in when they are asked:
 *
 *   "ACTIVATE ONLY IF you control a Swamp" (CR 602.5b): a restriction on activating -- asked as the ability would be
 *   offered, so an ability whose condition is false is simply not among the things its controller may do.
 *
 *   "When this enters, IF you control a creature with power 4 or greater, draw a card" -- an intervening "if" (CR
 *   603.4): asked as the event happens (false, and the ability does not trigger at all) AND again as it resolves (false
 *   then, and it does nothing). Asking only once is the usual mistake: a Colossal Majesty whose big creature died in
 *   response still drew.
 *
 * A condition is data, one of:
 *   {present: selector, atLeast?: n}   at least n permanents (1 if unsaid) match the selector -- "you control a Swamp",
 *                                      "a creature with power 4 or greater", "this artifact is untapped"
 *                                      ({self: true, tapped: false}); a choice of selectors with `anyOf`
 *   {handEmpty: true|false}            its controller's hand is empty, or is not
 *   {notTheirTurn: true}               "if it isn't that player's turn": the player the trigger is about is not the
 *                                      active player (Tataru Taru)
 *   {escaped: true|false}              its own permanent escaped, or did not (CR 702.138b): "sacrifice it unless it
 *                                      escaped" (Uro)
 *   {evoked: true|false}               its own permanent was cast for its evoke cost, or was not (CR 702.74a): the
 *                                      evoke trigger's "if it was evoked"
 *   {level: {atLeast: n}|{exactly: n}} its own permanent's level (CR 716.2a): N or more, for a level's abilities;
 *                                      exactly N-1, for the level bar that makes it N -- one with no level is
 *                                      level 1 (716.2d)
 *   {spent: {G: 2}}                    at least that much mana of each color was spent to cast its own object (CR
 *                                      601.2h): "if {G}{G} was spent to cast it" (Wistfulness); adamant's "if at least
 *                                      three red mana was spent to cast this spell" is {R: 3}, colorless {C: 3}
 *   {cameFrom: "library"}              the permanent the trigger is about entered from its controller's library or was
 *                                      cast from it (Fblthp, the Lost)
 *   {sinceYourLastUpkeep: true}        its own permanent came under its controller's control since the beginning of
 *                                      their last upkeep (echo, CR 702.30a)
 *   {evolves: true}                    evolve's "if that creature's power is greater than this creature's power and/or that
 *                                      creature's toughness is greater than this creature's toughness" (CR 702.100a): the
 *                                      creature the trigger is about against its own source, power to power and toughness
 *                                      to toughness, as each now is -- the arrival gone, as it last was (rules/trigger.mjs
 *                                      keeps it, CR 608.2h); never greater than a noncreature permanent (702.100c)
 *   {citysBlessing: true|false}        its controller has the city's blessing, or has not (CR 702.131c; ascend,
 *                                      keywords/designations.mjs): "unless you have the city's blessing" (Wayward Swordtooth)
 *   {prowl: true}                      prowl's "if a player was dealt combat damage this turn by a source that, at the time
 *                                      it dealt that damage, was under your control and had any of this spell's creature
 *                                      types" (CR 702.76a): its own object's creature types against what rules/combat.mjs
 *                                      kept of its controller's sources this turn
 *   {prowled: true|false}              its own permanent was cast for its prowl cost, or was not (CR 702.76a; rules/stack.mjs):
 *                                      "if its prowl cost was paid" (Latchkey Faerie)
 *   {opponentPoisonAtLeast: 3}         an opponent of its controller, still in the game, has at least that many poison
 *                                      counters (CR 122.1f): Corrupted's "as long as an opponent has three or more poison
 *                                      counters" (Skrelv's Hive; an ability word, CR 207.2c, with no rules meaning of its own)
 *
 * The keys are closed, like every other grammar here: an unknown one is refused at the schema rather than read as true.
 */

import {cardsIn} from "../state/index.mjs";
import {matchesSelector, compileSelector, matchesLastKnown} from "./filter.mjs";
import {amountOf, amountProblems} from "./amount.mjs";
import {characteristicsOf, subtypesOf, everyCreatureTypeOf} from "../rules/layers.mjs";
import {isCreatureType} from "../keywords/types.mjs";
import {hasCitysBlessing} from "../keywords/designations.mjs";

const CONDITION_KEYS = ["present", "atLeast", "atMost", "handEmpty", "notTheirTurn", "firstCombat", "graveyardTypes", "yourTurn", "notYourTurn", "about", "is", "chosen", "selfCounters", "lifeAtLeast", "cast", "compare", "escaped", "evoked", "spent", "enduringStory", "loyaltyThisTurn", "impending",
  "cameFrom", "sinceYourLastUpkeep", "level", "opponentPoisonAtLeast", "searched",
  /* Evolve's comparison (CR 702.100a); prowl's damage, and its cost paid (CR 702.76a). */
  "evolves", "prowl", "prowled",
  /* Ascend's city's blessing (CR 702.131). */
  "citysBlessing"];
/* Where a permanent may have come from, for `cameFrom`: a library (effects/zones.mjs and rules/stack.mjs record it). */
const CAME_FROM = ["library"];
/* The mana a condition may ask was spent to cast its object: the five colors and colorless (CR 106.1). */
const SPENT_KEYS = ["W", "U", "B", "R", "G", "C"];
/* A counted comparison's keys: what is counted, and against what. */
const COMPARE_KEYS = ["count", "atLeast", "atMost", "moreThan", "fewerThan"];
/* A NAMED OBJECT (Forge's ConditionDefined): "if it was a creature card" (Scavenging Ooze: what was exiled), "if it's
   blue" (Pyroblast: the target), "if it's a planeswalker" (Forge of Heroes): `about` which -- "remembered", "that card"
   (a trigger's subject), "target" (the first) -- and `is` what it must be, read where it now is. None there, and it is
   not.
   "THIS WAY" (batch 70) is "remembered": what the effect before it did, as that effect remembers it (`remember`) -- the
   creature you sacrificed (Rise of the Witch-king), the card you discarded ("If you do", Toph), the creature it dealt
   damage to (Marauding Raptor), the token it made (Yenna) -- so `is: {}` asks only that there is one. "That spell"
   (Toph's "if that spell is a Lesson", Nalfeshnee's "if it's a permanent spell") is read as it last existed on the stack
   once it has left it (CR 608.2h): `about.was`, taken as the trigger was (rules/trigger.mjs). */
/* "IF A PIRATE WAS EXILED THIS WAY" (Siren's Ruse): "moved" -- what the effect before it moved from the battlefield to where
   it sent it, as each last existed there (CR 608.2h; effects/zones.mjs, moveZone's `movedWas`): one of them is enough, and
   none moved is none. Not the card that came back, which is a new object (CR 400.7). */
const NAMED = ["remembered", "that card", "target", "moved"];
function namedObject(about, {remembered, targets, about: subject}) {
  if (about === "remembered") return remembered?.[0] ?? null;
  if (about === "that card") return subject?.card ?? null;
  /* A counted target ("up to one other target nonland permanent", Plan for All Outcomes): its first chosen, or none. */
  if (about === "target") { const t = [].concat(targets?.[0] ?? [])[0]; return t && t.kind === "object" ? t.id : null; }
  return null;
}
function namedIs(state, id, selector, context, was = null) {
  /* "If that creature is a Bird, Frog, Otter, or Rat" (Splash Portal, batch 79): a choice of what it may be (`anyOf`), each
     with what they share -- one of them is enough, where `subtypes` alone would ask for all four. */
  const {anyOf, ...shared} = selector ?? {};
  if (Array.isArray(anyOf)) return anyOf.some((one) => namedIs(state, id, {...shared, ...one}, context, was));
  const object = id === null || id === undefined ? null : state.objects[id];
  /* Gone: as it last was, for what a last-known snapshot can answer (its types, subtypes, controller); anything else it
     cannot say, and the condition does not hold. */
  if (!object) { try { return was ? matchesLastKnown(selector, was, context) : false; } catch { return false; } }
  const what = object.zone === "battlefield" ? "permanent" : object.zone === "stack" ? "spell" : "card";
  return compileSelector({...selector, what, ...(what === "card" ? {zone: object.zone} : {})})(state, id, context);
}

/* EVOLVE (CR 702.100a): the creature that entered -- on the battlefield and still a creature, as it now is; gone, as it last
   was there (`about.lastKnown`, rules/trigger.mjs; CR 608.2h) -- against the creature with evolve, which must still be one: a
   creature can't have a greater power or toughness than a noncreature permanent (702.100c). Power to power, toughness to
   toughness, either greater. */
function evolves(state, source, about) {
  if (source === null || source === undefined || state.objects[source]?.zone !== "battlefield") return false;
  const mine = characteristicsOf(state, source);
  if (!mine.types.includes("Creature")) return false;
  const id = about?.card;
  const there = state.objects[id]?.zone === "battlefield" ? characteristicsOf(state, id) : null;
  const it = there ? (there.types.includes("Creature") ? there : null) : about?.lastKnown ?? null;
  if (!it) return false;
  return (it.power ?? 0) > (mine.power ?? 0) || (it.toughness ?? 0) > (mine.toughness ?? 0);
}

/* PROWL (CR 702.76a): a creature type of this object's -- every one, for a changeling (CR 702.73a) -- among those of a source
   that dealt combat damage to a player this turn under its controller's control, as that source was as it dealt it
   (rules/combat.mjs, `combatDamageSources`). An object with no creature type has nothing to share. */
function prowlable(state, controller, source) {
  if (source === null || source === undefined || !state.objects[source]) return false;
  const every = everyCreatureTypeOf(state, source), types = subtypesOf(state, source).filter(isCreatureType);
  return (state.players[controller]?.combatDamageSources ?? []).some((dealt) => (every ? dealt.every || dealt.types.length > 0
    : dealt.every ? types.length > 0 : dealt.types.some((t) => types.includes(t))));
}

/* HOW A SPELL WAS CAST (batch 70; rules/actions.mjs records it on the stack entry): "if this spell was cast from a
   graveyard" (Sevinne's Reclamation: `from`, the zone), and Addendum's "if you cast this spell during your main phase"
   (Unbreakable Formation: `mainPhase`). A copy was not cast (CR 707.10), and neither was an ability: no record, and
   neither holds. */
const CAST_KEYS = ["from", "mainPhase", "additionalPaid"];
const CAST_ZONES = ["hand", "graveyard", "exile", "library", "command"];
function castHolds(rule, cast) {
  if (!cast) return false;
  if (rule.from !== undefined && cast.from !== rule.from) return false;
  if (rule.mainPhase === true && cast.mainPhase !== true) return false;
  /* "If this spell's additional cost was paid" (CR 601.2f; rules/actions.mjs). */
  if (rule.additionalPaid === true && cast.additionalPaid !== true) return false;
  return true;
}

/** Whether a condition holds now, for an ability controlled by `controller` on object `source`. No condition holds. */
export function conditionHolds(state, condition, {controller, source = null, about = undefined, remembered = undefined, targets = undefined, cast = undefined, x = undefined, spent = undefined, excessDamage = undefined, rememberedControllers = undefined,
  movedWas = undefined, searched = undefined, lastKnown = undefined} = {}) {
  if (!condition) return true;
  /* "If you search your library this way" (Claim Jumper): a search made earlier in this resolution (script/resolution.mjs). */
  if (condition.searched === true && searched !== true) return false;
  if (condition.cast !== undefined && !castHolds(condition.cast, cast)) return false;
  /* "Khans -- ...": what its permanent chose as it entered (the Sieges). */
  if (condition.chosen !== undefined && (source === null || state.objects[source]?.chosen !== condition.chosen)) return false;
  /* "Sacrifice it unless it escaped" (Uro; CR 702.138b): whether its own permanent was cast with escape (rules/stack.mjs). */
  if (condition.escaped !== undefined && ((source !== null && state.objects[source]?.escaped === true) !== condition.escaped)) return false;
  /* "If its evoke cost was paid" (CR 702.74a): whether its own permanent was cast for its evoke cost (rules/stack.mjs). */
  if (condition.evoked !== undefined && ((source !== null && state.objects[source]?.evoked === true) !== condition.evoked)) return false;
  /* "If this permanent's impending cost was paid" (CR 702.176a). */
  if (condition.impending !== undefined && ((source !== null && state.objects[source]?.impending === true) !== condition.impending)) return false;
  /* "If it entered from your library or was cast from your library" (Fblthp, the Lost): the permanent the trigger is about
     (its own, for "when this enters") came onto the battlefield from its controller's library, or was cast from it -- read
     on the permanent, or, gone, as the trigger saw it (rules/trigger.mjs keeps `cameFrom`, CR 608.2h). A card exiled from
     a library and cast from exile was cast from exile (the card's ruling). */
  if (condition.cameFrom !== undefined) {
    const id = about?.card ?? source;
    const came = (id !== null && id !== undefined ? state.objects[id]?.cameFrom : undefined) ?? about?.cameFrom;
    if (!(came?.zone === condition.cameFrom && came.owner === controller)) return false;
  }
  /* Echo's "if this permanent came under your control since the beginning of your last upkeep" (CR 702.30a): the turn it
     came under its controller's control (state/index.mjs, controlledSinceTurn -- entering, or a change of control) is that
     player's previous turn or later (rules/turn.mjs keeps it); before their first, any. Nothing changes control in an
     untap step here, so a turn is fine enough: anything during that turn came after its upkeep began. Gone, it did not. */
  if (condition.sinceYourLastUpkeep === true) {
    const object = source !== null ? state.objects[source] : null;
    if (!object || (object.controlledSinceTurn ?? 0) < (state.players[controller]?.previousTurnBegan ?? 0)) return false;
  }
  /* "If {W}{W} was spent to cast it" (CR 601.2h): the mana spent to cast its own object (rules/actions.mjs) -- or, once that
     object has gone, as it last was: what the trigger remembered as it triggered (`spent`, rules/trigger.mjs; CR 608.2h). */
  if (condition.spent !== undefined) {
    const paid = (source !== null ? state.objects[source]?.spent : undefined) ?? spent ?? {};
    if (!Object.entries(condition.spent).every(([key, n]) => (paid[key] ?? 0) >= n)) return false;
  }
  /* A CLASS'S LEVEL (CR 716.2a): its own permanent's -- none, and it is level 1 (716.2d). */
  if (condition.level !== undefined) {
    const level = source !== null && state.objects[source] ? state.objects[source].level ?? 1 : 1;
    if (condition.level.atLeast !== undefined && level < condition.level.atLeast) return false;
    if (condition.level.exactly !== undefined && level !== condition.level.exactly) return false;
  }
  /* "12+ | Flying" (a station symbol, CR 721.2a): as long as its own object has that many counters of the kind. */
  if (condition.selfCounters !== undefined && (source === null ? 0 : state.objects[source]?.counters?.[condition.selfCounters.counter] ?? 0) < condition.selfCounters.atLeast) return false;
  if (condition.about === "moved") {
    let fits = false;
    try { fits = (movedWas ?? []).some((was) => matchesLastKnown(condition.is ?? {}, was, {controller, source})); } catch { fits = false; }
    if (!fits) return false;
  } else if (condition.about !== undefined && !namedIs(state, namedObject(condition.about, {remembered, targets, about}), condition.is ?? {}, {controller, source},
    condition.about === "that card" ? about?.was ?? null : null)) return false;
  if (condition.notTheirTurn === true && (about?.player === undefined || about.player === state.activePlayer)) return false;
  if (condition.handEmpty === true && cardsIn(state, "hand", controller).length > 0) return false;
  if (condition.handEmpty === false && cardsIn(state, "hand", controller).length === 0) return false;
  /* How many permanents the selector finds now (Forge's PresentCompare): at least `atLeast` ("five or more lands", one
     when it says nothing), at most `atMost` ("if you control no Snakes": none). */
  if (condition.present) {
    const least = condition.atLeast ?? (condition.atMost !== undefined ? 0 : 1);
    /* Counted only as far as the answer needs: "you control a Mountain" stops at the first (Anger, from a graveyard, asks
       it of every derivation); "at most" stops one past. */
    let n = 0;
    for (const id of state.zones.battlefield) {
      if (!matchesSelector(condition.present, state, id, {controller, source})) continue;
      n += 1;
      if (condition.atMost === undefined ? n >= least : n > condition.atMost) break;
    }
    if (n < least) return false;
    if (condition.atMost !== undefined && n > condition.atMost) return false;
  }
  /* A COUNTED COMPARISON (Forge's CheckSVar and SVarCompare): an amount (script/amount.mjs) counted now, against a number
     or another amount counted now -- "if you gained 3 or more life this turn" (Indulging Patrician), "only if you created
     a token this turn" (Idol of Oblivion), "only if an opponent controls more lands than you" (Weathered Wayfarer). */
  if (condition.compare !== undefined) {
    /* "If X is 5 or more" (Martial Coup): the X its spell was cast with, as the resolution knows it (CR 107.3a). */
    /* And "if you do" counted ("you may discard two cards. If you do", Thrilling Discovery): what the effect before it
       remembered (`rememberedCount`). */
    const counted = {controller, source, ...(about ? {about} : {}), ...(x !== undefined ? {x} : {}), ...(remembered ? {remembered} : {}),
      /* The source as it last was, gone since its ability triggered (CR 113.7a): "if there are cards exiled with this
         enchantment" still counts what its other ability exiled (script/filter.mjs, linkSource). */
      ...(lastKnown ? {lastKnown} : {}),
      /* "If excess damage was dealt this way" (Violent Echoes): what the damage before it left (script/resolution.mjs). */
      ...(excessDamage !== undefined ? {excessDamage} : {}),
      /* "For each creature exiled this way, its controller ..." (Winds of Abandon): who controlled what was remembered. */
      ...(rememberedControllers !== undefined ? {rememberedControllers} : {})};
    const n = amountOf(state, condition.compare.count, counted), than = (v) => amountOf(state, v, counted);
    if (condition.compare.atLeast !== undefined && n < than(condition.compare.atLeast)) return false;
    if (condition.compare.atMost !== undefined && n > than(condition.compare.atMost)) return false;
    if (condition.compare.moreThan !== undefined && !(n > than(condition.compare.moreThan))) return false;
    if (condition.compare.fewerThan !== undefined && !(n < than(condition.compare.fewerThan))) return false;
  }
  /* "As long as you have an enduring story" (Storied, CR 702.195b), or "unless you have one": the player's designation
     (keywords/designations.mjs). */
  if (condition.enduringStory !== undefined && (state.players[controller]?.enduringStory === true) !== condition.enduringStory) return false;
  /* "Unless you have the city's blessing" (Wayward Swordtooth; CR 702.131c): its controller's designation, or theirs this
     moment by a permanent's ascend (keywords/designations.mjs). */
  if (condition.citysBlessing !== undefined && hasCitysBlessing(state, controller) !== condition.citysBlessing) return false;
  /* Prowl's cost may be paid (CR 702.76a): asked of the card as its cast is offered (rules/actions.mjs, alternativeCosts). */
  if (condition.prowl === true && !prowlable(state, controller, source)) return false;
  /* "If its prowl cost was paid" (CR 702.76a): whether its own permanent was cast for it (rules/stack.mjs). */
  if (condition.prowled !== undefined && (state.objects[source]?.prowled === true) !== condition.prowled) return false;
  /* Evolve's comparison (CR 702.100a): as it triggers, and again as it resolves (CR 603.4). */
  if (condition.evolves === true && !evolves(state, source, about)) return false;
  /* "If you've activated a loyalty ability this turn" (Kiora of Salt and Sand): its controller has (rules/actions.mjs). */
  if (condition.loyaltyThisTurn === true && !((state.players[controller]?.loyaltyThisTurn ?? 0) > 0)) return false;
  /* "Activate only during your turn" (Humble Defector). */
  if (condition.yourTurn === true && state.activePlayer !== controller) return false;
  /* Corrupted (Skrelv's Hive): "as long as an opponent has three or more poison counters" -- a player who has left the game
     is no opponent (CR 800.4a). */
  if (condition.opponentPoisonAtLeast !== undefined
    && !state.players.some((p) => p.id !== controller && !p.lost && (p.poison ?? 0) >= condition.opponentPoisonAtLeast)) return false;
  /* "If you have 40 or more life" (Felidar Sovereign). */
  if (condition.lifeAtLeast !== undefined && state.players[controller].life < condition.lifeAtLeast) return false;
  /* "If it's not your turn, you may exile a blue card from your hand rather than pay this spell's mana cost". */
  if (condition.notYourTurn === true && state.activePlayer === controller) return false;
  /* "If it's the first combat phase of the turn" (Genji Glove; rules/turn.mjs counts them). */
  if (condition.firstCombat === true && (state.combatsThisTurn ?? 0) > 1) return false;
  /* Delirium: "if there are four or more card types among cards in your graveyard" (CR 205.2a). */
  if (Number.isInteger(condition.graveyardTypes)) {
    const types = new Set(cardsIn(state, "graveyard", controller).flatMap((id) => (state.objects[id].types ?? []).filter((t) => CARD_TYPES.includes(t))));
    if (types.size < condition.graveyardTypes) return false;
  }
  return true;
}
/* The card types (CR 205.2a): what delirium counts. */
const CARD_TYPES = ["Artifact", "Battle", "Creature", "Enchantment", "Instant", "Kindred", "Land", "Planeswalker", "Sorcery"];

/** Every problem with a condition, for the schema (script/schema.mjs). */
export function conditionProblems(condition) {
  if (condition === undefined) return [];
  if (!condition || typeof condition !== "object" || Array.isArray(condition)) return ["A condition is an object: {present: selector} or {handEmpty: true}"];
  const problems = [];
  for (const key of Object.keys(condition)) if (!CONDITION_KEYS.includes(key)) problems.push(`A condition has no key ${JSON.stringify(key)}; it has ${CONDITION_KEYS.join(", ")}`);
  if ("atLeast" in condition && !(Number.isInteger(condition.atLeast) && condition.atLeast >= 1)) problems.push("A condition's atLeast is a whole number, 1 or more");
  if ("atMost" in condition && !(Number.isInteger(condition.atMost) && condition.atMost >= 0)) problems.push("A condition's atMost is a whole number, 0 or more");
  if (("atLeast" in condition || "atMost" in condition) && !("present" in condition)) problems.push("atLeast and atMost count what `present` describes");
  if ("handEmpty" in condition && typeof condition.handEmpty !== "boolean") problems.push("handEmpty is true or false");
  if ("notTheirTurn" in condition && condition.notTheirTurn !== true) problems.push("notTheirTurn is true");
  if ("firstCombat" in condition && condition.firstCombat !== true) problems.push("firstCombat is true");
  if ("yourTurn" in condition && condition.yourTurn !== true) problems.push("yourTurn is true");
  if ("enduringStory" in condition && typeof condition.enduringStory !== "boolean") problems.push("enduringStory is true or false");
  if ("citysBlessing" in condition && typeof condition.citysBlessing !== "boolean") problems.push("citysBlessing is true or false");
  if ("notYourTurn" in condition && condition.notYourTurn !== true) problems.push("notYourTurn is true");
  if ("loyaltyThisTurn" in condition && condition.loyaltyThisTurn !== true) problems.push("loyaltyThisTurn is true");
  if ("evolves" in condition && condition.evolves !== true) problems.push("evolves is true");
  if ("prowl" in condition && condition.prowl !== true) problems.push("prowl is true");
  if ("prowled" in condition && typeof condition.prowled !== "boolean") problems.push("prowled is true or false");
  if ("opponentPoisonAtLeast" in condition && !(Number.isInteger(condition.opponentPoisonAtLeast) && condition.opponentPoisonAtLeast >= 1))
    problems.push("opponentPoisonAtLeast is a whole number of poison counters, 1 or more");
  if ("graveyardTypes" in condition && !(Number.isInteger(condition.graveyardTypes) && condition.graveyardTypes >= 1)) problems.push("graveyardTypes is a whole number of card types, 1 or more");
  if ("chosen" in condition && typeof condition.chosen !== "string") problems.push("chosen names what was chosen");
  if ("escaped" in condition && typeof condition.escaped !== "boolean") problems.push("escaped is true or false");
  if ("evoked" in condition && typeof condition.evoked !== "boolean") problems.push("evoked is true or false");
  if ("impending" in condition && typeof condition.impending !== "boolean") problems.push("impending is true or false");
  if ("cameFrom" in condition && !CAME_FROM.includes(condition.cameFrom)) problems.push(`cameFrom is the zone the permanent came from: ${CAME_FROM.join(", ")}`);
  if ("sinceYourLastUpkeep" in condition && condition.sinceYourLastUpkeep !== true) problems.push("sinceYourLastUpkeep is true");
  if ("searched" in condition && condition.searched !== true) problems.push("searched is true: a library was searched earlier in this resolution");
  if ("spent" in condition) {
    const spent = condition.spent;
    if (!spent || typeof spent !== "object" || Array.isArray(spent) || !Object.keys(spent).length
      || !Object.entries(spent).every(([key, n]) => SPENT_KEYS.includes(key) && Number.isInteger(n) && n >= 1))
      problems.push(`spent is mana by color, ${SPENT_KEYS.join(", ")}, each a whole number 1 or more: {G: 2} is "if {G}{G} was spent to cast it"`);
  }
  if ("compare" in condition) {
    const compare = condition.compare;
    if (!compare || typeof compare !== "object" || Array.isArray(compare)) problems.push("compare is {count, atLeast | atMost | moreThan | fewerThan}");
    else {
      for (const key of Object.keys(compare)) if (!COMPARE_KEYS.includes(key)) problems.push(`compare has no key ${JSON.stringify(key)}; it has ${COMPARE_KEYS.join(", ")}`);
      if (!("count" in compare)) problems.push("compare counts something: {count: an amount}");
      if (!COMPARE_KEYS.slice(1).some((key) => key in compare)) problems.push("compare says against what: atLeast, atMost, moreThan or fewerThan");
      for (const key of COMPARE_KEYS) if (key in compare) problems.push(...amountProblems(compare[key]).map((p) => `compare's ${key}: ${p}`));
    }
  }
  if ("level" in condition) {
    const level = condition.level;
    const whole = (n) => Number.isInteger(n) && n >= 1;
    if (!level || typeof level !== "object" || Array.isArray(level) || Object.keys(level).length !== 1 || !(whole(level.atLeast) || whole(level.exactly)))
      problems.push("level is {atLeast: n}, a Class's level N or more, or {exactly: n}: a whole number 1 or more");
  }
  if ("selfCounters" in condition && !(typeof condition.selfCounters?.counter === "string" && Number.isInteger(condition.selfCounters?.atLeast) && condition.selfCounters.atLeast >= 1))
    problems.push("selfCounters names a counter and how many, at least 1");
  if (("about" in condition) !== ("is" in condition)) problems.push("about names an object and is says what it must be: both, or neither");
  if ("about" in condition && !NAMED.includes(condition.about)) problems.push(`about is ${NAMED.join(", ")}`);
  if ("is" in condition) {
    const {anyOf, ...shared} = condition.is ?? {};
    if (anyOf !== undefined && !(Array.isArray(anyOf) && anyOf.length)) problems.push("What a named object may be is a list: {anyOf: [selector, ...]}");
    try { for (const one of Array.isArray(anyOf) ? anyOf.map((a) => ({...shared, ...a})) : [condition.is]) compileSelector({...one, what: "card"}); }
    catch (error) { problems.push(`What a named object must be: ${error.message}`); }
  }
  if ("cast" in condition) {
    const rule = condition.cast;
    if (!rule || typeof rule !== "object" || Array.isArray(rule) || !Object.keys(rule).length || !Object.keys(rule).every((k) => CAST_KEYS.includes(k)))
      problems.push(`cast says how this spell was cast: ${CAST_KEYS.join(", ")}`);
    else {
      if ("from" in rule && !CAST_ZONES.includes(rule.from)) problems.push(`cast.from is a zone: ${CAST_ZONES.join(", ")}`);
      if ("mainPhase" in rule && rule.mainPhase !== true) problems.push("cast.mainPhase is true");
      if ("additionalPaid" in rule && rule.additionalPaid !== true) problems.push("cast.additionalPaid is true");
    }
  }
  if ("present" in condition) {
    const {anyOf, ...shared} = condition.present ?? {};
    try { for (const one of Array.isArray(anyOf) ? anyOf.map((a) => ({...shared, ...a})) : [condition.present]) compileSelector(one); }
    catch (error) { problems.push(`What a condition looks for: ${error.message}`); }
  }
  return problems;
}
