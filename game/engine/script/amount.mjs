/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* AN AMOUNT THE GAME COUNTS (M4 phase 3, batch 10: the catalog's first missing option, 586 of the most-played cards).
 *
 * "Draw a card for each creature you control", "add {B} for each Swamp you control", "each opponent loses X life, where
 * X is your devotion to black", "+X/+X where X is the greatest power among creatures you control", "create X 1/1
 * Warriors". A card script says the count, not a number, wherever an effect takes a number (`amount`, `count`, `power`,
 * `toughness`, a mana amount) or a static ability's power and toughness do:
 *
 *   "X", or {x: true}                    the value chosen for X as the spell was cast or the ability activated (CR 107.3a);
 *                                        on a permanent's own abilities, the X paid to cast it (CR 107.3m)
 *   {count: selector}                    how many things the selector matches now -- "for each creature you control",
 *                                        "the number of cards in your hand" ({what: "card", zone: "hand", controller: "you"})
 *   {countersOn: ref, counter: kind}     counters of a kind on an object ("for each burden counter on The One Ring"), or
 *                                        of every kind, `counter: "any"` ("for each counter on this creature"); on a target
 *                                        player, theirs ("target player's poison counters", Vraska, Betrayal's Sting); "you",
 *                                        its controller's own ("the number of experience counters you have", Ezuri)
 *   {countersPut: true}                  "that many" counters: how many a "counter added" trigger is about (Simic Ascendancy)
 *   {powerOf: ref}                       an object's power ("Krenko's power"): "self", or "that card"
 *   {toughnessOf: ref}                   its toughness ("its controller gains life equal to its toughness", Condemn)
 *   {greatestPower: selector}            the greatest power among what the selector matches, 0 if nothing (CR 208.1)
 *   {totalPower: selector}               their powers added together
 *   {greatestManaValue: selector}        the greatest mana value among what the selector matches, 0 if nothing (CR 202.3):
 *                                        "among cards in your graveyard" (Hapatra, the Desert Fang)
 *   {differentPowers: selector}          how many different powers there are among them (Loot, the Nexus): a 2/1 and two
 *                                        3/3s are two
 *   {differentNames: selector}           how many different names there are among them ("the number of differently named
 *                                        lands you control", Fungal Colossus): three Forests and a Wastes are two
 *   {devotion: [colors]}                 CR 700.5: the mana symbols of those colors among the mana costs of permanents you
 *                                        control -- a hybrid symbol of two of them once, a Phyrexian one of its color
 *   {lifeLostThisWay: true}              the life the effects before it in this resolution took ("You gain life equal to
 *                                        the life lost this way")
 *   {cardTypesAmong: "remembered"}       how many card types there are among what the effect before it remembered -- "a
 *                                        Spirit for each card type among cards discarded this way" (Occult Epiphany); or
 *                                        among what a selector matches now, a choice of zones too -- "six or more card types
 *                                        among permanents you control and/or cards in your graveyard" (Happily Ever After)
 *   {startingLife: "you"}                the game's starting life total (CR 103.4, 119.1; 40 in Commander, CR 903.7, or the
 *                                        table's house rule; state/index.mjs, startingLifeOf)
 *   {rememberedCount: true}              how many things the effect before it remembered -- "each player shuffles the cards
 *                                        from their hand into their library, then draws that many cards" (batch 80); with
 *                                        `controlledBy: "most"`, the most any one player had among them -- "the greatest
 *                                        number of cards a player discarded this way" (Windfall)
 *   {movedCount: filter}                 how many of what the effect before it moved from the battlefield were, as each
 *                                        last existed there, what the filter says -- "for each nontoken creature you
 *                                        controlled that was destroyed this way" (Ceaseless Conflict)
 *   {excessDamage: true}                 the excess damage the damage before it in this resolution dealt (CR 120.4a)
 *   {countersRemovedThisWay: true}       how many counters the removeCounter before it in this resolution removed ("add one
 *                                        mana of any color for each charge counter removed this way", Coalition Relic)
 *   {dieRolled: true}                    the result of the die the rollDie before it in this resolution rolled -- "a number
 *                                        of Treasure tokens equal to the result" (Ancient Copper Dragon; CR 706.2)
 *   {lesserOf: [amount, amount]}         the least of them: "greater than this creature's power or toughness" (increment)
 *   {tappedThisWay: true}                how many creatures this spell's additional cost tapped as it was cast -- "three times
 *                                        the number of creatures tapped this way" (Burn at the Stake; rules/actions.mjs)
 *   {sacrificedThisWay: true}            how many permanents a spell's additional cost sacrificed, for the reflexive trigger of
 *                                        that payment -- "copy this spell for each creature sacrificed this way" (Plumb the
 *                                        Forbidden; rules/actions.mjs, sacrificeAnyAtom)
 *   {creaturesDiedThisTurn: who}         the creatures that died this turn under that player's control, or anyone's ("any")
 *   {cardsDrawnThisTurn: who}            the cards that player drew this turn
 *   {scriedOrSurveilledThisTurn: who}    the times that player scried or surveilled this turn
 *   {spellsCastThisTurn: who, filter?}   that player's spells cast this turn, as each was cast; "an opponent", the most
 *                                        any one opponent cast; `another: true` ("you" only), this spell's own cast left out
 *   {spellsCastThisGame: who, named}     that player's spells of a name cast this game
 *   {playersDealtNoncombatDamage: "opponent"|"any"}  the players noncombat damage reached this turn
 *   {lifeLostThisTurn: "opponents"}      the life every opponent lost this turn, together
 *   {creaturesAttackedWithThisTurn: "you"}  the creatures that player declared as attackers this turn, each once (Minas Tirith)
 *   {cardsDiscardedThisTurn: "you"}      how many cards that player ("you", "that player") has discarded this turn -- "for each
 *                                        card you've discarded this turn" (Jiang Yanggu, Alone; state/index.mjs keeps it)
 *   {commanderColors: "you"}             the number of colors in your commanders' color identity (CR 903.4; War Room) --
 *                                        undefined for a player with no commander (903.4f), so a cost of it is unpayable
 *                                        (commanderless, below)
 *   {fewestAmongPlayers: selector}       the fewest the selector counts as any player still in the game sees it ("you" that
 *                                        player): "if a player has one or fewer cards in hand" (Naktamun Lorespinner)
 *   {graveyardsWithAtLeast: n}           how many graveyards hold n or more cards: "for each graveyard with seven or more
 *                                        cards in it" (Master's Councillors)
 *   {playersWhoDid: true}                how many players did what this resolution offered them ("each opponent may ...
 *                                        for each opponent who does", Tempt with Vengeance; effects/asking.mjs, modal's `did`)
 *   {votes: choice}                      the votes cast for that choice in this resolution's vote ("a card for each past
 *                                        vote", Fateful Tempest; CR 701.38; effects/asking.mjs, vote)
 *   {totalManaValue: "remembered"}       the mana values of what the effect before it remembered, added together ("the total
 *                                        mana value of cards milled this way"); or of what a selector matches ("the total
 *                                        mana value of historic permanents you control", Excalibur, Sword of Eden)
 *   {attacksThisTurn: "it"}             the times the object a layer-7 amount is counted for attacked this turn (Moraug)
 *   {colorsSpent: "self"}                converge: the colors of mana spent to cast its own object (Sundering Archaic)
 *   {planeswalkerTypesAmong: selector}   the different planeswalker types among what the selector matches (Tam, the
 *                                        Possibility; CR 205.3j)
 *   {commanderCasts: "you"}              every time you've cast your commanders from the command zone this game (Vanguard of
 *                                        the Restless; CR 903.8)
 *
 * and any of them may say `atMost` ("{1} less IF you control a creature with flying": the count, at most 1), `times` and
 * `plus`: "twice X", "1 plus the number of ...", `times: "X"` for "X ... for each" (X tokens for each opponent who does),
 * and `times: -1` for "-X/-X" and
 * "-1/-1 for each Swamp you control" -- one way an amount comes out below nothing; `signed: true` beside powerOf or
 * toughnessOf, the number as it is ("double its power" of a creature with power -2, CR 701.10c), the other; every other is
 * at least 0.
 * Before them, `half` ("half the cards in their hand", Pox Plague) and `per` ("+2/+0 for every seven cards in your
 * graveyard", Dark Matter Manipulator: per 7, times 2) divide the count, rounded down as those cards print it (CR 107.1a).
 * A counted selector's `controller` may be a target player, `{target: n}` ("the number of cards in target opponent's hand",
 * Borrowed Knowledge, Jeska's Will): that player, bound as it is counted.
 * A selector counted may be a choice, `{anyOf: [...]}` with what the alternatives share: "Squirrels, Bats, Lizards,
 * and Rats you control", each counted once.
 *
 * READ WHEN THE EFFECT HAPPENS (CR 608.2h): an effect's amount is counted once, as that effect is applied in the
 * resolution, and not again -- Craterhoof's +X/+X is the creature count as its trigger resolves, however many creatures
 * there are a moment later. A static ability's is counted continuously, every time its layer is applied
 * (rules/layers.mjs), because a characteristic-defining ability IS the count (CR 604.3).
 *
 * THE GRAMMAR IS CLOSED, like the selector's: a key this does not know is refused at the schema, not read as zero.
 */

import {conditionHolds, conditionProblems} from "./condition.mjs";
import {selectMatching, compileSelector, matchesLastKnown, matchesSelector} from "./filter.mjs";
import {powerOf, toughnessOf, characteristicsOf, controllerOf, subtypesOf} from "../rules/layers.mjs";
import {isPlaneswalkerType} from "../keywords/types.mjs";
import {parseManaCost, manaValue} from "../rules/mana.mjs";
import {valueCostOf, commanderKeyOf, xOnStack, startingLifeOf, usesThisTurn} from "../state/index.mjs";
import {commanderIdentity, hasCommander} from "../rules/commander.mjs";

/** The keys an amount may carry; one of the first, with `times` and `plus` beside it. */
export const AMOUNT_KINDS = Object.freeze(["x", "attacksThisTurn", "count", "countersOn", "powerOf", "toughnessOf", "greatestPower", "totalPower", "devotion", "lifeLostThisWay", "colorsOf", "thoseCards", "damageDealt", "castBefore", "manaValueOf", "if", "lifeTotal", "lifeLostThisTurn", "colorsAmong", "greatestToughness", "countersAmong", "lifeGained", "damagePrevented", "lifeLost", "rememberedCount",
  "lifeGainedThisTurn", "tokensCreatedThisTurn", "mostAmongOpponents", "permanentsLeftThisTurn", "playersDealtCombatDamage", "cardTypesAmong", "manaSpent",
  "permanentsEnteredThisTurn", "excessDamage", "lesserOf", "kicked", "differentPowers", "commanderCasts", "cardsLeftGraveyardThisTurn",
  "countersRemovedThisWay", "movedCount", "tappedThisWay", "sacrificedThisWay", "cardsDiscardedThisTurn",
  /* What happened this turn, and this game (Train C): the records state/index.mjs, rules/combat.mjs and the effects keep. */
  "creaturesDiedThisTurn", "cardsDrawnThisTurn", "playersDealtNoncombatDamage", "scriedOrSurveilledThisTurn", "spellsCastThisTurn", "spellsCastThisGame",
  "commanderColors", "playersWhoDid", "votes", "totalManaValue",
  /* Train C, phase 2 (w2b-amounts): converge, and the planeswalker types among a set. */
  "colorsSpent", "planeswalkerTypesAmong",
  /* Every player's, compared (Train C phase 2, w2a-selectors): the fewest among them, and the graveyards holding so many. */
  "fewestAmongPlayers", "graveyardsWithAtLeast",
  /* Train D: "put that many growth counters" (Simic Ascendancy), the counters a "counter added" trigger is about. */
  "countersPut",
  /* Train E: "for each unspent mana you have" (Omnath, Locus of the Void). */
  "manaInPool",
  /* Train E: "the number of differently named lands you control" (Fungal Colossus). */
  "differentNames",
  /* Train E, wave 2: "the greatest mana value among cards in your graveyard" (Hapatra, the Desert Fang). */
  "greatestManaValue",
  /* Wave 4b: "if you attacked with two or more creatures this turn" (Minas Tirith). */
  "creaturesAttackedWithThisTurn",
  /* The library load of 2026-10-21: "your starting life total" (Happily Ever After). */
  "startingLife",
  /* Wave 4c: "equal to the result" of a die rolled (CR 706.2; Ancient Copper Dragon). */
  "dieRolled"]);
const AMOUNT_EXTRAS = ["counter", "times", "plus", "atMost", "then", "else", "half", "per", "filter", "controlledBy", "named", "another", "signed"];
const COLORS = ["W", "U", "B", "R", "G"];

/** Whether an amount is undefined for its player (CR 903.4f): one of the colors in their commanders' color identity, for a
    player with no commander. A cost that refers to it can't be paid (rules/actions.mjs). */
export const commanderless = (state, value, context) => isCounted(value) && "commanderColors" in value && !hasCommander(state, context.controller);

/** Whether a value is a counted amount rather than a plain number. */
export const isCounted = (value) => value === "X" || (value !== null && typeof value === "object" && !Array.isArray(value) && AMOUNT_KINDS.some((k) => k in value));

/** Every problem with an amount, for the schema (script/schema.mjs). A number is always fine. */
export function amountProblems(value) {
  if (typeof value === "number" || value === "X") return [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [`An amount is a number, "X", or one of {${AMOUNT_KINDS.join(", ")}}`];
  const kinds = AMOUNT_KINDS.filter((k) => k in value);
  if (kinds.length !== 1) return [`An amount counts one thing, by one of ${AMOUNT_KINDS.join(", ")}`];
  const problems = [];
  for (const key of Object.keys(value)) if (!AMOUNT_KINDS.includes(key) && !AMOUNT_EXTRAS.includes(key)) problems.push(`An amount has no key ${JSON.stringify(key)}`);
  if ("countersOn" in value && typeof value.counter !== "string") problems.push("Counting counters says which kind: {countersOn, counter}");
  for (const key of ["lifeGainedThisTurn", "tokensCreatedThisTurn", "permanentsLeftThisTurn", "permanentsEnteredThisTurn", "cardsLeftGraveyardThisTurn",
    "cardsDrawnThisTurn", "scriedOrSurveilledThisTurn", "spellsCastThisGame", "cardsDiscardedThisTurn", "creaturesAttackedWithThisTurn"]) if (key in value && !["you", "that player"].includes(value[key])) problems.push(`${key} is "you" or "that player"`);
  /* The spells cast this turn: a player's, or the most of any one opponent's ("if an opponent cast a blue spell this turn"). */
  if ("spellsCastThisTurn" in value && !["you", "that player", "an opponent"].includes(value.spellsCastThisTurn)) problems.push('spellsCastThisTurn is "you", "that player" or "an opponent"');
  /* "If you've cast ANOTHER instant or sorcery spell this turn" (Burrog Barrage): this spell's own cast left out. */
  if ("another" in value && !(value.another === true && value.spellsCastThisTurn === "you")) problems.push('another is true, beside spellsCastThisTurn: "you"');
  /* The life lost this turn: a player's, or every opponent's together ("if an opponent lost life this turn", spectacle). */
  if ("lifeLostThisTurn" in value && !["you", "that player", "opponents"].includes(value.lifeLostThisTurn)) problems.push('lifeLostThisTurn is "you", "that player" or "opponents"');
  if ("creaturesDiedThisTurn" in value && !["you", "that player", "any"].includes(value.creaturesDiedThisTurn)) problems.push('creaturesDiedThisTurn is "you", "that player" or "any"');
  if ("playersDealtNoncombatDamage" in value && !["opponent", "any"].includes(value.playersDealtNoncombatDamage)) problems.push('playersDealtNoncombatDamage is "opponent" or "any"');
  /* Spells cast this game are kept by name, and counted by it ("another spell named Approach of the Second Sun"). */
  if ("spellsCastThisGame" in value && !(typeof value.named === "string" && value.named.length)) problems.push("spellsCastThisGame counts the spells of a name: {spellsCastThisGame, named}");
  if ("named" in value && !("spellsCastThisGame" in value)) problems.push("Only spellsCastThisGame takes a name");
  /* What entered, as it was (rules/trigger.mjs keeps it), and the spells cast this turn, as each was cast (rules/actions.mjs):
     a filter of what a last known snapshot answers, and only there. */
  if ("filter" in value) {
    const of = ["permanentsEnteredThisTurn", "spellsCastThisTurn"].find((key) => key in value);
    /* "For each creature card exiled this way" (Release to Memory): of what the effect before it remembered, those the
       filter -- a selector -- describes where each now is. */
    if ("rememberedCount" in value) try { compileSelector({...(value.filter ?? {}), what: "card"}); } catch (error) { problems.push(`What rememberedCount counts: ${error.message}`); }
    else if (!of) problems.push("Only permanentsEnteredThisTurn and spellsCastThisTurn take a filter of what was, and rememberedCount one of what is");
    else try { matchesLastKnown(value.filter, {}, {}); } catch (error) { problems.push(`What ${of} counts: ${error.message}`); }
  }
  /* What was moved, as it last was: a filter of what a last known snapshot answers (script/filter.mjs, matchesLastKnown). */
  if ("movedCount" in value) try { matchesLastKnown(value.movedCount ?? {}, {}, {}); } catch (error) { problems.push(`What movedCount counts: ${error.message}`); }
  if ("playersDealtCombatDamage" in value && !["opponent", "any"].includes(value.playersDealtCombatDamage)) problems.push('playersDealtCombatDamage is "opponent" or "any"');
  if ("cardTypesAmong" in value && value.cardTypesAmong !== "remembered" && !(value.cardTypesAmong && typeof value.cardTypesAmong === "object" && !Array.isArray(value.cardTypesAmong)))
    problems.push('cardTypesAmong is "remembered", or a selector of what it counts');
  if ("startingLife" in value && value.startingLife !== "you") problems.push('startingLife is "you": the starting life total of the game');
  if ("manaSpent" in value && !["that card", "self"].includes(value.manaSpent)) problems.push('manaSpent is "that card" or "self"');
  if ("commanderCasts" in value && !["that card", "you"].includes(value.commanderCasts)) problems.push('commanderCasts is "that card" or "you"');
  if ("colorsSpent" in value && value.colorsSpent !== "self") problems.push('colorsSpent is "self": the colors of mana spent to cast its own object');
  if ("half" in value && value.half !== true) problems.push("An amount's half is true: halved, rounded down");
  if ("per" in value && !(Number.isInteger(value.per) && value.per > 1)) problems.push("An amount's per is a whole number above 1: \"for every seven\" is per 7");
  if ("countersRemovedThisWay" in value && value.countersRemovedThisWay !== true) problems.push("countersRemovedThisWay is true");
  if ("dieRolled" in value && value.dieRolled !== true) problems.push("dieRolled is true: the result of the die rolled before it");
  if ("countersPut" in value && value.countersPut !== true) problems.push("countersPut is true");
  if ("manaInPool" in value && value.manaInPool !== "you") problems.push('manaInPool is "you": the mana in your pool');
  /* A player's own counters are "you" ("the number of experience counters you have", Ezuri, Claw of Progress) or a target
     player; an object's, the objects an amount names. */
  if ("countersOn" in value && typeof value.countersOn === "string" && !["self", "that card", "remembered", "you"].includes(value.countersOn))
    problems.push('countersOn is "self", "that card", "remembered", "you" or a target');
  if ("tappedThisWay" in value && value.tappedThisWay !== true) problems.push("tappedThisWay is true");
  if ("sacrificedThisWay" in value && value.sacrificedThisWay !== true) problems.push("sacrificedThisWay is true");
  if ("commanderColors" in value && value.commanderColors !== "you") problems.push('commanderColors is "you"');
  if ("graveyardsWithAtLeast" in value && !(Number.isInteger(value.graveyardsWithAtLeast) && value.graveyardsWithAtLeast >= 1)) problems.push("graveyardsWithAtLeast is a whole number of cards, 1 or more");
  if ("controlledBy" in value && !("rememberedCount" in value && ["that player", "most"].includes(value.controlledBy))) problems.push('controlledBy is "that player" or "most", of a rememberedCount');
  /* A power or toughness as it is, below zero too (CR 701.10c). */
  if ("signed" in value && !(value.signed === true && ("powerOf" in value || "toughnessOf" in value))) problems.push("signed is true, beside powerOf or toughnessOf: the number as it is, below zero too");
  if ("lesserOf" in value && !(Array.isArray(value.lesserOf) && value.lesserOf.length >= 2)) problems.push("lesserOf is two or more amounts");
  else if ("lesserOf" in value) for (const one of value.lesserOf) problems.push(...amountProblems(one).map((p) => `lesserOf: ${p}`));
  if ("devotion" in value && !(Array.isArray(value.devotion) && value.devotion.length && value.devotion.every((c) => COLORS.includes(c)))) problems.push("Devotion is to one or more colors: {devotion: [\"B\"]}");
  for (const key of ["times", "plus", "atMost"]) if (key in value && !Number.isInteger(value[key]) && !(key === "times" && value[key] === "X")) problems.push(`An amount's ${key} is a whole number${key === "times" ? ', or "X"' : ""}`);
  if ("playersWhoDid" in value && value.playersWhoDid !== true) problems.push("playersWhoDid is true");
  if ("attacksThisTurn" in value && value.attacksThisTurn !== "it") problems.push('attacksThisTurn is "it"');
  if ("votes" in value && !(typeof value.votes === "string" && value.votes.length)) problems.push("votes names the choice voted for");
  if ("totalManaValue" in value && value.totalManaValue !== "remembered" && !(value.totalManaValue && typeof value.totalManaValue === "object")) problems.push('totalManaValue is "remembered", or a selector');
  if ("if" in value) {
    problems.push(...conditionProblems(value.if).map((p) => `An amount's condition: ${p}`));
    for (const key of ["then", "else"]) if (key in value) problems.push(...amountProblems(value[key]));
  }
  /* What it counts is a selector, held to the selector grammar (script/filter.mjs), a choice of them included. */
  for (const key of ["cardTypesAmong", "count", "greatestPower", "totalPower", "mostAmongOpponents", "differentPowers", "differentNames", "planeswalkerTypesAmong", "fewestAmongPlayers", "greatestManaValue", "totalManaValue"]) {
    if (!(key in value) || value[key] === "remembered") continue;
    const {anyOf, ...shared} = value[key] ?? {};
    try { for (const one of Array.isArray(anyOf) ? anyOf.map((a) => ({...shared, ...a})) : [value[key]]) compileSelector(one); }
    catch (error) { problems.push(`What ${key} counts: ${error.message}`); }
  }
  return problems;
}

/* "The number of cards in target opponent's hand" (Borrowed Knowledge, Jeska's Will): a counted selector's `controller` a
   target player ({target: n}, script/bind.mjs), bound to that player as it is counted (CR 608.2h) -- or to nobody, a target
   no longer legal (CR 608.2b), so nothing is counted. */
function toTarget(selector, targets) {
  const ref = selector?.controller;
  if (!Number.isInteger(ref?.target)) return selector;
  const chosen = (targets ?? [])[ref.target];
  return {...selector, controller: chosen?.kind === "player" ? chosen.id : -1};
}

/* What a counted selector matches: one selector, or a choice of them, each thing once -- its target players those of the
   spell or ability counting it (`who.targets`). */
function matching(state, selector, who) {
  const {anyOf, ...shared} = toTarget(selector ?? {}, who.targets);
  if (!Array.isArray(anyOf)) return selectMatching(state, shared, who);
  return [...new Set(anyOf.flatMap((one) => selectMatching(state, toTarget({...shared, ...one}, who.targets), who)))];
}

/* A remembered object the filter describes where it now is -- a permanent on the battlefield, a card anywhere else (CR
   400.7: one that has moved since is a new object, and no longer among them). */
function fitsNow(state, filter, id, who) {
  const object = state.objects[id];
  return Boolean(object) && matchesSelector({...filter, what: object.zone === "battlefield" ? "permanent" : "card", zone: object.zone}, state, id, who);
}

/* The player an amount refers to: you, or the player a trigger or repetition is about. */
const playerOf = (ref, context) => (ref === "that player" ? context.about?.player ?? null : ref === "you" ? context.controller ?? null : null);

/* A target player an amount refers to ({target: n}), while they are one. */
function targetPlayer(ref, context) {
  const chosen = ref && typeof ref === "object" && Number.isInteger(ref.target) ? (context.targets ?? [])[ref.target] : null;
  return chosen?.kind === "player" ? chosen.id : null;
}

/* The object an amount refers to: the source, or what the trigger is about. */
function objectOf(ref, context) {
  if (ref === "self") return context.source ?? null;
  if (ref === "that card") return context.about?.card ?? null;
  /* "You lose life equal to its mana value" (Dark Confidant): what an earlier effect moved. */
  if (ref === "remembered") return context.remembered?.[0] ?? null;
  /* "Target creature you control deals damage equal to its power" (Infectious Bite): a target, while it is one. */
  if (ref && typeof ref === "object" && Number.isInteger(ref.target)) { const chosen = (context.targets ?? [])[ref.target]; return chosen?.kind === "object" ? chosen.id : null; }
  return null;
}

/* "Where X is that creature's power" (Arni, Renowned Champion), the creature the trigger is about gone from the battlefield
   since: as it last existed there (CR 608.2h; rules/trigger.mjs keeps it, `about.lastKnown`) -- null for anything else. */
const aboutWas = (ref, context) => (ref === "that card" ? context.about?.lastKnown ?? null : null);

/* "You gain life equal to that card's toughness, lose life equal to its power" (Sapling of Colfenor): a card an effect
   before it remembered -- revealed, in a library or elsewhere off the battlefield -- has its printed power and toughness
   there (CR 208.1, 109.3). Null for anything else, which is read as before. */
const cardFigure = (state, ref, id, key) => (ref === "remembered" && id !== null && state.objects[id] && state.objects[id].zone !== "battlefield" ? state.objects[id][key] ?? 0 : null);
/* "You may sacrifice another creature. If you do, you gain X life and draw X cards, where X is that creature's power" (Disciple
   of Freyalise): what the effect before it remembered having moved it off the battlefield -- a sacrifice's `remember`, its
   `movedWas` kept one for each (effects/asking.mjs) -- as it last existed there (CR 608.2h), a token's too, which no longer
   exists anywhere (CR 704.5d). Null for anything else, which is read as before. */
const movedFigure = (ref, context, key) => {
  const was = context.movedWas ?? [];
  return ref === "remembered" && was.length > 0 && was.length === (context.remembered ?? []).length ? was[0]?.[key] ?? 0 : null;
};

/* CR 700.5: each mana symbol among the mana costs of permanents the player controls that is one of these colors. */
function devotion(state, player, colors) {
  let total = 0;
  for (const id of state.zones.battlefield) {
    const object = state.objects[id];
    if (!object?.manaCost || controllerOf(state, id) !== player) continue;
    for (const symbol of parseManaCost(object.manaCost).symbols) {
      if (symbol.kind === "colored" && colors.includes(symbol.color)) total += 1;
      else if (symbol.kind === "hybrid" && symbol.either.some((c) => colors.includes(c))) total += 1;
      else if ((symbol.kind === "phyrexian" || symbol.kind === "monohybrid") && colors.includes(symbol.color)) total += 1;
    }
  }
  return total;
}

/**
 * What an amount comes to now.
 *
 * @param {object} context  `{controller, source, x, about, lifeLost}`: whose ability it is, its object, X, what a trigger
 *   is about, and the life the resolution's effects have taken so far
 */
export function amountOf(state, value, context = {}) {
  if (typeof value === "number") return value;
  if (value === "X") return Math.max(0, context.x ?? 0);
  if (!isCounted(value)) return 0;
  /* What a trigger or a repetition is about, too: "the number of nonbasic lands that player controls" (repeatFor). */
  const who = {controller: context.controller, source: context.source, ...(context.about ? {about: context.about} : {}),
    /* The source as it last was (CR 113.7a), for "cards exiled with this enchantment" once it has gone (script/filter.mjs). */
    ...(context.lastKnown ? {lastKnown: context.lastKnown} : {}),
    /* Its targets, for a selector counted on a target player's zone (toTarget, above). */
    ...(context.targets ? {targets: context.targets} : {}),
    /* What a layer-7 amount is counted for (rules/layers.mjs, counted): "attached to it" (script/filter.mjs). */
    ...(context.affected !== undefined && context.affected !== null ? {affected: context.affected} : {})};
  let n = 0;
  if ("x" in value) n = Math.max(0, context.x ?? 0);
  /* "For each opponent who does" (Tempt with Vengeance): the players who did what this resolution offered (CR 207.2c). */
  else if ("playersWhoDid" in value) n = (context.whoDid ?? []).length;
  /* "For each past vote" (Fateful Tempest; CR 701.38): this resolution's votes for that choice. */
  else if ("votes" in value) n = context.votes?.[value.votes] ?? 0;
  /* "The total mana value of cards milled this way" (CR 202.3): what the effect before it remembered, as the cards are now. */
  /* "Where X is the total mana value of historic permanents you control" (Excalibur, Sword of Eden; CR 202.3, 700.6): what
     the selector matches now, a token's mana value its mana cost's or 0 (CR 111.4). */
  else if ("totalManaValue" in value && value.totalManaValue !== "remembered")
    n = matching(state, value.totalManaValue, who).reduce((sum, id) => sum + manaValue(parseManaCost(valueCostOf(state.objects[id]) ?? "")), 0);
  else if ("totalManaValue" in value) n = (context.remembered ?? []).reduce((sum, id) => {
    const cost = state.objects[id] ? valueCostOf(state.objects[id]) : null;
    return sum + (cost ? manaValue(parseManaCost(cost)) : 0);
  }, 0);
  /* "A charge counter on it for each time it was kicked" (Everflowing Chalice; multikicker, CR 702.33c). */
  else if ("kicked" in value) n = context.kicked ?? 0;
  /* "For each time it has attacked this turn" (Moraug, Fury of Akoum; wave 4d L3): the times the object a layer-7 amount is
     counted for (rules/layers.mjs, counted's `affected`) was declared an attacker this turn, each combat (rules/combat.mjs). */
  else if ("attacksThisTurn" in value) n = context.affected !== undefined && context.affected !== null ? usesThisTurn(state, context.affected, "attacked") : 0;
  /* The creatures its additional cost tapped, as the spell was cast (CR 601.2h): what the cast recorded; a copy was not cast
     (CR 707.10) and tapped none. */
  else if ("tappedThisWay" in value) n = context.cast?.tapped ?? 0;
  /* The permanents a spell's additional cost sacrificed (CR 601.2h), as the reflexive trigger of that payment is about them
     (rules/actions.mjs, `about.sacrificed`; CR 603.12). */
  else if ("sacrificedThisWay" in value) n = context.about?.sacrificed ?? 0;
  /* "The number of colors in your commanders' color identity" (War Room; CR 903.4): the union of their identities. */
  else if ("commanderColors" in value) n = commanderIdentity(state, context.controller).length;
  /* CONVERGE (Sundering Archaic): "the number of colors of mana spent to cast this creature" -- the colors among the mana
     spent to cast its own object (CR 601.2h; rules/actions.mjs keeps it by kind, and the permanent it becomes keeps it,
     rules/stack.mjs), or, that object gone, as its trigger remembered it (`spent`, rules/trigger.mjs; CR 608.2h). Colorless
     mana is no color (CR 105.1); an object never cast spent none. */
  else if ("colorsSpent" in value) {
    const spent = state.objects[context.source]?.spent ?? context.spent ?? {};
    n = COLORS.filter((color) => spent[color] > 0).length;
  }
  /* "The number of planeswalker types among planeswalkers you control" (Tam, the Possibility; CR 205.3j): the different
     planeswalker types among what the selector matches, through the layers -- The Aetherspark's Equipment is an artifact
     type, none (keywords/types.mjs). */
  else if ("planeswalkerTypesAmong" in value) n = new Set(matching(state, value.planeswalkerTypesAmong, who)
    .flatMap((id) => (state.objects[id].zone === "battlefield" ? subtypesOf(state, id) : state.objects[id].subtypes ?? [])).filter(isPlaneswalkerType)).size;
  /* "Greater than this creature's power or toughness" (increment, Berta): the lesser of them. */
  else if ("lesserOf" in value) n = Math.min(...value.lesserOf.map((one) => amountOf(state, one, context)));
  else if ("count" in value) n = matching(state, value.count, who).length;
  /* "The number of experience counters you have" (Ezuri, Claw of Progress; CR 122.1): `countersOn: "you"`, this ability's
     controller's own counters, as a target player's are counted. */
  else if ("countersOn" in value && (value.countersOn === "you" || targetPlayer(value.countersOn, context) !== null)) {
    const player = state.players[value.countersOn === "you" ? context.controller : targetPlayer(value.countersOn, context)];
    const counters = {...(player?.counters ?? {}), poison: player?.poison ?? 0};
    n = value.counter === "any" ? Object.values(counters).reduce((a, b) => a + b, 0) : counters[value.counter] ?? 0;
  } else if ("countersOn" in value) {
    const id = objectOf(value.countersOn, context);
    /* A source sacrificed as the cost ("for each counter on this creature") is read as it last was (CR 608.2h). And "the
       number of counters it had on it" (Felisa, Fang of Silverquill): what a trigger is about, gone from the battlefield, as
       it last existed there (rules/trigger.mjs, `about.lastKnown`) -- the card it became has none (CR 400.7). */
    const left = value.countersOn === "that card" ? context.about?.lastKnown?.counters : undefined;
    const counters = left ?? (id !== null && state.objects[id] ? state.objects[id].counters : context.lastKnown?.counters);
    n = value.counter === "any" ? Object.values(counters ?? {}).reduce((a, b) => a + b, 0) : counters?.[value.counter] ?? 0;
  }
  /* "Draw cards equal to the sacrificed creature's toughness, then discard cards equal to its power" (Felothar the
     Steadfast): what the ability's cost sacrificed, as it last existed (CR 608.2h; rules/actions.mjs keeps it). */
  else if (value.powerOf === "sacrificed" || value.toughnessOf === "sacrificed") {
    const was = (context.sacrificed ?? [])[0];
    n = (value.powerOf === "sacrificed" ? was?.power : was?.toughness) ?? 0;
  } else if ("powerOf" in value) {
    const id = objectOf(value.powerOf, context);
    n = id !== null && state.objects[id]?.zone === "battlefield" ? powerOf(state, id) : movedFigure(value.powerOf, context, "power")
      ?? cardFigure(state, value.powerOf, id, "power") ?? (aboutWas(value.powerOf, context)?.power ?? context.lastKnown?.power ?? 0);
  } else if ("toughnessOf" in value) {
    const id = objectOf(value.toughnessOf, context);
    n = id !== null && state.objects[id]?.zone === "battlefield" ? toughnessOf(state, id) : cardFigure(state, value.toughnessOf, id, "toughness") ?? (aboutWas(value.toughnessOf, context)?.toughness ?? context.lastKnown?.toughness ?? 0);
  } else if ("countersAmong" in value) {
    /* "The number of +1/+1 counters on lands you control" (Toph, the Blind Bandit): all of them, of the kind. */
    n = matching(state, value.countersAmong, who).reduce((sum, id) => sum + (state.objects[id].counters?.[value.counter ?? "+1/+1"] ?? 0), 0);
  } else if ("greatestToughness" in value) {
    /* "Draw cards equal to the greatest toughness among creatures you control" (Last March of the Ents). */
    n = Math.max(0, ...matching(state, value.greatestToughness, who).map((id) => characteristicsOf(state, id).toughness ?? 0));
  } else if ("greatestManaValue" in value) {
    /* "Where X is the greatest mana value among cards in your graveyard" (Hapatra, the Desert Fang; Train E): each one's mana
       value (CR 202.3; a double-faced card there its front face's, 712.8a), 0 when there is none. */
    n = Math.max(0, ...matching(state, value.greatestManaValue, who).map((id) => manaValue(parseManaCost(valueCostOf(state.objects[id])))));
  } else if ("greatestPower" in value || "totalPower" in value) {
    const powers = matching(state, value.greatestPower ?? value.totalPower, who).map((id) => characteristicsOf(state, id).power ?? 0);
    n = "greatestPower" in value ? Math.max(0, ...powers) : powers.reduce((a, b) => a + b, 0);
  }
  /* "One mana of that color for each different power among creatures you control" (Loot, the Nexus): the distinct values
     among their powers now, through the layers (CR 208.1) -- 0 and less among them, each a power like any other. */
  else if ("differentPowers" in value) n = new Set(matching(state, value.differentPowers, who).map((id) => characteristicsOf(state, id).power ?? 0)).size;
  /* "This spell costs {X} less to cast, where X is the number of differently named lands you control" (Fungal Colossus;
     CR 201.2): the distinct names among what the selector matches now -- a copy's the name it copied (CR 707.2), and a
     face-down permanent, which has no name (CR 708.2a), none to count. */
  else if ("differentNames" in value) n = new Set(matching(state, value.differentNames, who).map((id) => state.objects[id].card).filter((name) => typeof name === "string" && name)).size;
  else if ("devotion" in value) n = devotion(state, context.controller, value.devotion);
  else if ("lifeLostThisWay" in value) n = context.lifeLost ?? 0;
  /* "Then draws that many cards" (Winds of Change): what the effect before it moved, and remembered, counted. */
  /* "For each creature exiled this way, its controller searches" (Winds of Abandon): `controlledBy` "that player", those of
     them that player controlled as they left the battlefield (script/effects/zones.mjs). */
  /* "For each creature card exiled this way" (Release to Memory), "when one or more nonland cards are exiled this way" (Augusta,
     Order Returned): `filter`, those the selector describes where each now is (fitsNow). */
  else if ("rememberedCount" in value) {
    const remembered = (context.remembered ?? []).filter((id) => value.filter === undefined || fitsNow(state, value.filter, id, who));
    const whose = (id) => (context.rememberedControllers ?? {})[id];
    /* "The greatest number of cards a player discarded this way" (Windfall): `controlledBy` "most", the most of them any one
       player had -- the discarder, as discard's `remember` keeps it (effects/asking.mjs). */
    n = value.controlledBy === "that player" ? remembered.filter((id) => whose(id) === context.about?.player).length
      : value.controlledBy === "most" ? Math.max(0, ...state.players.map((p) => remembered.filter((id) => whose(id) === p.id).length))
      : remembered.length;
  }
  /* "For each nontoken creature you controlled that was destroyed this way" (Ceaseless Conflict): of what the effect before
     it moved from the battlefield (`movedWas`: effects/zones.mjs, destroyAll's and moveZone's `remember`), those that were,
     as each last existed there (CR 608.2h), what the filter says -- "you" the player who controlled it then, `token` whether
     it was one. */
  else if ("movedCount" in value) n = (context.movedWas ?? []).filter((was) => matchesLastKnown(value.movedCount, was, {controller: context.controller, source: context.source})).length;
  /* "Empower Jace X, where X is that excess damage" (Violent Echoes): the excess the damage before it dealt (effects/resources.mjs). */
  else if ("excessDamage" in value) n = context.excessDamage ?? 0;
  /* "For each charge counter removed this way" (Coalition Relic): what the removeCounter before it removed
     (effects/resources.mjs) -- none removed, or none removed yet, is 0. */
  else if ("countersRemovedThisWay" in value) n = context.countersRemoved ?? 0;
  /* "Equal to the result" (Ancient Copper Dragon): what the rollDie before it rolled (effects/resources.mjs) -- none rolled, 0. */
  else if ("dieRolled" in value) n = context.rolled ?? 0;
  /* "For each card type among cards discarded this way" (Occult Epiphany): the card types (CR 205.2a) the remembered
     cards have between them, as they are now -- an artifact creature is two. */
  else if ("cardTypesAmong" in value && value.cardTypesAmong === "remembered") n = new Set((context.remembered ?? []).flatMap((id) => state.objects[id]?.types ?? [])).size;
  /* "Six or more card types among permanents you control and/or cards in your graveyard" (Happily Ever After; CR 205.2a): what
     the selector matches now, each once -- a permanent's types through the layers, a card's as it is printed. */
  else if ("cardTypesAmong" in value)
    n = new Set(matching(state, value.cardTypesAmong, who).flatMap((id) => (state.objects[id].zone === "battlefield" ? characteristicsOf(state, id).types : state.objects[id].types) ?? [])).size;
  /* "Your starting life total" (Happily Ever After): the game's (state/index.mjs). */
  else if ("startingLife" in value) n = startingLifeOf(state);
  /* "Draw that many cards", "search for up to that many": how many a "one or more" trigger is about (rules/trigger.mjs). */
  else if ("thoseCards" in value) n = (context.about?.cards ?? []).length;
  /* "That many", after damage: how much the trigger's damage was (rules/trigger.mjs). */
  else if ("damageDealt" in value) n = context.about?.amount ?? 0;
  /* "Target opponent loses that much life" (Sanguine Bond; Forge's LifeAmount): the life the trigger is about gaining. */
  else if ("lifeGained" in value) n = context.about?.amount ?? 0;
  /* "That player mills that many cards", "you gain that much life" (batch 78): the life lost the trigger is about. */
  else if ("lifeLost" in value) n = context.about?.amount ?? 0;
  /* "Each opponent mills that many cards" (The Mindskinner), "a +1/+1 counter for each 1 damage prevented this way" (Vigor):
     the damage a prevention stopped, its follow-up about it (rules/replacement.mjs). */
  else if ("damagePrevented" in value) n = context.about?.amount ?? 0;
  /* "Put that many growth counters on this enchantment" (Simic Ascendancy): how many counters the "counter added" trigger is
     about were put on at once (rules/trigger.mjs). */
  else if ("countersPut" in value) n = context.about?.amount ?? 0;
  /* "If you control a creature with power 4 or greater, instead search for three" (Forge's Count$Compare): one amount
     or the other, by a condition asked now (script/condition.mjs). */
  else if ("if" in value) n = amountOf(state, conditionHolds(state, value.if, {controller: context.controller, source: context.source}) ? value.then ?? 0 : value.else ?? 0, context);
  /* "Half that player's life total, rounded down" (Heartless Hidetsugu): a player's life now; `half` halves it, down. */
  else if ("lifeTotal" in value) {
    /* And a target player's: "Target player's life total becomes 1" (Vraska, Relic Seeker; CR 119.5, they lose the rest). */
    const player = playerOf(value.lifeTotal, context) ?? targetPlayer(value.lifeTotal, context);
    n = player !== null ? state.players[player]?.life ?? 0 : 0;
  }
  /* "Equal to the life they lost this turn" (Wound Reflection; resources.mjs keeps it, turn.mjs clears it). */
  else if ("lifeLostThisTurn" in value) {
    /* And every opponent's together, those still in the game (CR 800.4a): spectacle's "if an opponent lost life this turn"
       (CR 702.137a; cards/index.mjs) is this, 1 or more. */
    if (value.lifeLostThisTurn === "opponents") n = state.players.filter((p) => p.id !== context.controller && !p.lost).reduce((sum, p) => sum + (p.lostThisTurn ?? 0), 0);
    else {
      const player = playerOf(value.lifeLostThisTurn, context);
      n = player !== null ? state.players[player]?.lostThisTurn ?? 0 : 0;
    }
  }
  /* MORBID (Dreaded Bat-Cloud, Essenceknit Scholar): the creatures that died this turn (CR 700.4) under that player's
     control -- or anyone's, "any" (state/index.mjs, recordDeath; rules/turn.mjs clears it). */
  else if ("creaturesDiedThisTurn" in value) {
    const player = playerOf(value.creaturesDiedThisTurn, context);
    n = value.creaturesDiedThisTurn === "any" ? state.players.reduce((sum, p) => sum + (p.diedThisTurn ?? 0), 0)
      : player !== null ? state.players[player]?.diedThisTurn ?? 0 : 0;
  }
  /* "The number of cards you've drawn this turn" (Fractal Anomaly), "if you've drawn two or more cards this turn" (Lake-town
     Toymaker): each card drawn its own (CR 121.2; state/index.mjs, recordDraw). */
  else if ("cardsDrawnThisTurn" in value) {
    const player = playerOf(value.cardsDrawnThisTurn, context);
    n = player !== null ? state.players[player]?.drawnThisTurn ?? 0 : 0;
  }
  /* "If you've scried or surveilled this turn" (Desperate Futurescribe): the times that player did (CR 701.22a, 701.25a;
     effects/asking.mjs). */
  else if ("scriedOrSurveilledThisTurn" in value) {
    const player = playerOf(value.scriedOrSurveilledThisTurn, context);
    n = player !== null ? state.players[player]?.scriedThisTurn ?? 0 : 0;
  }
  /* "For each spell you've cast this turn" (Aetherflux Reservoir), "if you've cast a noncreature spell this turn" (Traxos,
     Academy Guardian): that player's spells this turn, as each was cast (rules/actions.mjs keeps them), `filter` fitting --
     counted when the amount is read, so one cast after a trigger triggered and before it resolves is among them (CR 608.2h). */
  else if ("spellsCastThisTurn" in value) {
    const castBy = (player) => (state.players[player]?.castThisTurn ?? []).filter((cast) => matchesLastKnown(value.filter ?? {}, {...cast, controller: player}, {controller: context.controller})).length;
    /* "ANOTHER instant or sorcery spell" (Burrog Barrage): the spells cast this turn but this one -- which is among them only if
       it was cast (CR 601.2i; rules/actions.mjs keeps its cast). A copy was not cast (CR 707.10): for it the spell it copies is
       another, and nothing is left out. */
    const own = value.another === true && context.cast && state.objects[context.source]
      && matchesLastKnown(value.filter ?? {}, {types: state.objects[context.source].types ?? [], colors: state.objects[context.source].colors ?? [], controller: context.controller}, {controller: context.controller}) ? 1 : 0;
    /* "If an opponent cast a blue spell this turn" (Ricochet Trap): the most any one opponent of its controller still in the
       game cast (CR 102.2, 800.4a) -- one opponent's spells, never several added together. */
    if (value.spellsCastThisTurn === "an opponent")
      n = Math.max(0, ...state.players.filter((p) => p.id !== context.controller && !p.lost).map((p) => castBy(p.id)));
    else {
      const player = playerOf(value.spellsCastThisTurn, context);
      n = player !== null ? castBy(player) - own : 0;
    }
  }
  /* "You've cast another spell named Approach of the Second Sun this game": that player's spells of the name this game, this
     one included once it is cast (rules/actions.mjs). */
  else if ("spellsCastThisGame" in value) {
    const player = playerOf(value.spellsCastThisGame, context);
    n = player !== null ? state.players[player]?.castNames?.[value.named] ?? 0 : 0;
  }
  /* "If an opponent was dealt noncombat damage this turn" (Grim Repriser, Whiplash Wordsmith): the players still in the game
     noncombat damage reached this turn (effects/resources.mjs) -- the controller's opponents, or anyone -- as the combat
     count below. */
  else if ("playersDealtNoncombatDamage" in value) n = state.players.filter((p) => !p.lost && p.noncombatDamagedThisTurn === true
    && (value.playersDealtNoncombatDamage === "any" || p.id !== context.controller)).length;
  /* "If you gained 3 or more life this turn" (Indulging Patrician), "only if you created a token this turn" (Idol of
     Oblivion): what that player has gained, and made, this turn (resources.mjs and permanents.mjs keep them, turn.mjs
     clears them). */
  else if ("lifeGainedThisTurn" in value) {
    const player = playerOf(value.lifeGainedThisTurn, context);
    n = player !== null ? state.players[player]?.gainedThisTurn ?? 0 : 0;
  } else if ("tokensCreatedThisTurn" in value) {
    const player = playerOf(value.tokensCreatedThisTurn, context);
    n = player !== null ? state.players[player]?.tokensThisTurn ?? 0 : 0;
  }
  /* Revolt, "if a permanent left the battlefield under your control this turn" (Hidden Stockpile): how many did, under that
     player's control (state/index.mjs keeps it). */
  else if ("permanentsLeftThisTurn" in value) {
    const player = playerOf(value.permanentsLeftThisTurn, context);
    n = player !== null ? state.players[player]?.leftThisTurn ?? 0 : 0;
  }
  /* "For each unspent mana you have" (Omnath, Locus of the Void; CR 106.4): the mana in that player's pool now, every kind, and
     the mana that may be spent only on some things beside it (rules/restricted-mana.mjs keeps it apart, one entry a mana). */
  else if ("manaInPool" in value) {
    const player = state.players[playerOf(value.manaInPool, context)];
    n = player ? Object.values(player.manaPool ?? {}).reduce((a, b) => a + b, 0) + (player.restrictedMana ?? []).length : 0;
  }
  /* "If a card left your graveyard this turn" (Primary Research, Relic Retriever): how many cards did, from that player's
     graveyard to anywhere (state/index.mjs counts each as it leaves, rules/turn.mjs clears it as a turn begins). */
  else if ("cardsLeftGraveyardThisTurn" in value) {
    const player = playerOf(value.cardsLeftGraveyardThisTurn, context);
    n = player !== null ? state.players[player]?.leftGraveyardThisTurn ?? 0 : 0;
  }
  /* "For each card you've discarded this turn" (Jiang Yanggu, Alone; CR 701.9a): how many cards that player has discarded,
     the one discarded earlier in this resolution among them (state/index.mjs counts each as it is discarded, rules/turn.mjs
     clears it as a turn begins). */
  else if ("cardsDiscardedThisTurn" in value) {
    const player = playerOf(value.cardsDiscardedThisTurn, context);
    n = player !== null ? state.players[player]?.discardedThisTurn ?? 0 : 0;
  }
  /* "Activate only if you attacked with two or more creatures this turn" (Minas Tirith, wave 4b; CR 508.1): the creatures that
     player declared as attackers this turn, each once whatever combat it attacked in -- one put onto the battlefield attacking
     was never declared, and never attacked (CR 508.4). Kept as they are declared (rules/combat.mjs), for that turn alone. */
  else if ("creaturesAttackedWithThisTurn" in value) {
    const player = playerOf(value.creaturesAttackedWithThisTurn, context);
    const attacked = player !== null ? state.players[player]?.attackedWith : undefined;
    n = attacked?.turn === state.turn ? attacked.ids.length : 0;
  }
  /* "The number of creatures that entered the battlefield under your control this turn" (Kinbinding), and "another
     creature" (Wary Farmer, `another`: not this one): what entered under that player's control, as it entered (rules/
     trigger.mjs, recordArrivals), that `filter` fits -- one that has left since included. */
  else if ("permanentsEnteredThisTurn" in value) {
    const player = playerOf(value.permanentsEnteredThisTurn, context);
    const fits = (was) => matchesLastKnown(value.filter ?? {}, was, {controller: context.controller, source: context.source});
    n = player !== null ? (state.players[player]?.enteredThisTurn ?? []).filter(fits).length : 0;
  }
  /* "The number of opponents that were dealt combat damage this turn" (Tymna the Weaver): the players still in the game
     whom combat damage reached this turn (rules/combat.mjs keeps it, turn.mjs clears it) -- the controller's opponents,
     or anyone. */
  else if ("playersDealtCombatDamage" in value) n = state.players.filter((p) => !p.lost && p.combatDamagedThisTurn === true
    && (value.playersDealtCombatDamage === "any" || p.id !== context.controller)).length;
  /* "If an opponent controls more lands than you" (Weathered Wayfarer): the most of them any one opponent has -- the
     selector counted as each opponent still in the game sees it ("you" being that opponent). */
  else if ("mostAmongOpponents" in value) {
    const opponents = state.players.filter((p) => p.id !== context.controller && !p.lost).map((p) => p.id);
    n = Math.max(0, ...opponents.map((opponent) => matching(state, value.mostAmongOpponents, {...who, controller: opponent}).length));
  }
  /* "If a player has one or fewer cards in hand" (Naktamun Lorespinner): the fewest the selector counts as each player still in
     the game sees it ("you" being that player, CR 800.4a) -- a hand of none among them is none. */
  else if ("fewestAmongPlayers" in value) {
    const players = state.players.filter((p) => !p.lost).map((p) => p.id);
    n = players.length ? Math.min(...players.map((player) => matching(state, value.fewestAmongPlayers, {...who, controller: player}).length)) : 0;
  }
  /* "+2/+0 for each graveyard with seven or more cards in it" (Master's Councillors; CR 404.1): each player's graveyard -- of
     the players still in the game, whose cards are still in it (CR 800.4a) -- holding that many or more. */
  else if ("graveyardsWithAtLeast" in value) n = state.players.filter((p) => !p.lost && state.zones.graveyard[p.id].length >= value.graveyardsWithAtLeast).length;
  /* "Where X is the mana value of that spell" (Ovika): its printed cost, X counted as 0 (CR 202.3). */
  /* "Where X is the sacrificed enchantment's mana value" (Demon of Fate's Design): what the ability's cost sacrificed, as it last
     existed (CR 608.2h; rules/actions.mjs keeps it). */
  else if (value.manaValueOf === "sacrificed") n = (context.sacrificed ?? [])[0]?.manaValue ?? 0;
  else if ("manaValueOf" in value) {
    const id = objectOf(value.manaValueOf, context);
    /* A transformed permanent's is its front face's (CR 202.3b); a spell's on the stack, with X its chosen value (CR 202.3e). */
    n = id !== null && valueCostOf(state.objects[id]) ? manaValue(parseManaCost(valueCostOf(state.objects[id])), {x: xOnStack(state, id)}) : 0;
  }
  /* "Scry X, where X is the number of times it's been cast from the command zone this game" (Study Hall; CR 903.8): the
     commander a trigger is about, by the key its casts are kept under (rules/commander.mjs) -- taken as it triggered, so
     a commander that has since left the stack is still counted -- this cast included. */
  /* "For each time you've cast your commander from the command zone this game" (Vanguard of the Restless; CR 903.8): every
     cast of each of your commanders from there, as rules/commander.mjs keeps them for its tax. */
  else if (value.commanderCasts === "you") n = Object.values(state.players[context.controller]?.commanderCasts ?? {}).reduce((a, b) => a + b, 0);
  else if ("commanderCasts" in value) {
    const id = objectOf(value.commanderCasts, context);
    const object = id !== null ? state.objects[id] : null;
    const key = context.about?.commanderKey ?? (object?.commander === true ? commanderKeyOf(object) : null);
    const owner = object?.owner ?? context.about?.player ?? context.controller;
    n = key === null ? 0 : state.players[owner]?.commanderCasts?.[key] ?? 0;
  }
  /* "If five or more mana was spent to cast that spell" (Expressive Firedancer; CR 601.2h): every mana spent on it, of
     whatever kind, as rules/actions.mjs recorded it on the spell. */
  else if ("manaSpent" in value) {
    const id = objectOf(value.manaSpent, context);
    n = id !== null ? Object.values(state.objects[id]?.spent ?? {}).reduce((a, b) => a + b, 0) : 0;
  }
  /* "For each other instant and sorcery spell you've cast before it this turn": counted as the trigger triggered. */
  else if ("castBefore" in value) n = context.about?.castBefore ?? 0;
  /* "For each of that spell's colors" (Ramos, CR 105.2): how many colors it has, through the layers on the battlefield. */
  /* "For each color among permanents you control" (Conqueror's Flail): the colors they have between them, as they are. */
  else if ("colorsAmong" in value) n = new Set(matching(state, value.colorsAmong, who).flatMap((id) => characteristicsOf(state, id).colors ?? [])).size;
  else if ("colorsOf" in value) {
    const id = objectOf(value.colorsOf, context);
    n = id !== null && state.objects[id] ? (state.objects[id].zone === "battlefield" ? characteristicsOf(state, id).colors : state.objects[id].colors ?? []).length : 0;
  }
  /* "Half that player's life total, rounded down" (Heartless Hidetsugu), "half the cards in their hand ... round down"
     (Pox Plague), "for every seven cards in your graveyard" (Dark Matter Manipulator): the count divided, rounded down as
     each prints it (CR 107.1a), before anything below. */
  if (value.half === true) n = Math.floor(n / 2);
  if (Number.isInteger(value.per)) n = Math.floor(n / value.per);
  /* `atMost`: "{1} less if you control a creature with flying" is the count of them, at most 1. */
  /* `times: "X"`: X for each ("X ... tokens for each opponent who does"), X chosen as it was cast (CR 107.3a). */
  const times = value.times === "X" ? Math.max(0, context.x ?? 0) : value.times ?? 1;
  const total = Math.min(value.atMost ?? Infinity, n) * times + (value.plus ?? 0);
  /* `signed`: a power or toughness as it is, below zero too -- "double the power" of a creature with power -2 gives it -2/-0
     (CR 701.10c; Unnatural Growth). */
  return times < 0 || value.signed === true ? total : Math.max(0, total);
}

/** The parameters of an effect that take a number, and so may take a count -- "the top X cards" (`fromTop`, Villainous
 *  Wealth, batch 79) among them. */
export const AMOUNT_PARAMS = Object.freeze(["amount", "count", "power", "toughness", "fromTop",
  /* "You may pay X life" (Tymna the Weaver; effects/asking.mjs, unlessPays). */
  "life"]);

/** An effect with its counted amounts read now (bind.mjs calls this as the effect reaches the head of the queue). */
export function countEffect(state, effect, context) {
  let bound = effect;
  for (const key of AMOUNT_PARAMS) {
    if (!isCounted(effect[key])) continue;
    /* "Each player ... discards half the cards in their hand" (Pox Plague, `perPlayer`): counted for each player in turn, as
       that player is asked (effects/asking.mjs), not once here. */
    if (key === "count" && effect.perPlayer === true) continue;
    bound = bound === effect ? {...effect} : bound;
    bound[key] = amountOf(state, effect[key], context);
  }
  /* "Add {B} for each Swamp you control": a mana amount. */
  if (effect.mana && typeof effect.mana === "object" && Object.values(effect.mana).some(isCounted)) {
    bound = bound === effect ? {...effect} : bound;
    bound.mana = Object.fromEntries(Object.entries(effect.mana).map(([k, v]) => [k, amountOf(state, v, context)]));
  }
  return bound;
}

/** A mana ability's mana, counted now: "{T}: Add {G} for each creature you control". */
export function countMana(state, mana, context) {
  if (!mana || !Object.values(mana).some(isCounted)) return mana;
  return Object.fromEntries(Object.entries(mana).map(([k, v]) => [k, amountOf(state, v, context)]));
}
