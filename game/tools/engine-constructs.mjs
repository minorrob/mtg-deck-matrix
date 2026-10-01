/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* WHERE FORGE'S WORDS MEET THE ENGINE'S: the translation two tools share.
 *
 * `game/docs/engine-inventory.json` measures what every card needs in Forge's vocabulary -- its effect APIs, trigger
 * modes, static and replacement modes, keywords and costs -- because Forge implements nearly every Magic card and is the
 * ruler the pool was measured with. ADR-001 keeps Forge out of `game/engine/`, so the translation lives here, at the
 * boundary: `engine-coverage.mjs` counts the cards the engine has every rule for, and `engine-catalog.mjs` lists every
 * distinct construct with where the engine stands on it. One table, so the two cannot disagree.
 */

import {isPrimitive, isKeyword, isTriggerEvent, normalizeKeyword} from "../engine/vocabulary.mjs";
import {isBuilt} from "../engine/script/effects/index.mjs";
import {KEYWORD_FAMILIES} from "../engine/keywords/combat.mjs";
import {KEYWORD_FAMILIES as TIMING_FAMILIES} from "../engine/keywords/timing.mjs";
import {TRIGGER_KINDS} from "../engine/cards/index.mjs";

/* Forge's API names to the engine's primitives — §12.2's parenthesised pairs, as data. A name that
   is not here is reported as unmapped rather than silently counted as missing, because "the engine
   cannot do this" and "nobody has said what this is" are different problems. */
export const FORGE_API = {
  ChangeZone: "moveZone", ChangeZoneAll: "moveZoneAll", Draw: "draw", Discard: "discard",
  Mill: "mill", Shuffle: "shuffle", Dig: "dig", Surveil: "surveil", Scry: "scry",
  PeekAndReveal: "peekAndReveal", Sacrifice: "sacrifice", SacrificeAll: "sacrificeAll",
  Destroy: "destroy", DestroyAll: "destroyAll", ExileUntil: "exileUntil", ReturnToHand: "returnToHand",
  Play: "play", Discover: "discover",
  Mana: "addMana", ManaReflected: "addManaReflected", Tap: "tap", Untap: "untap", UntapAll: "untapAll",
  ReduceCost: "costReduction", AlternativeCost: "alternativeCost",
  GainLife: "gainLife", LoseLife: "loseLife", DealDamage: "dealDamage", EachDamage: "damageEach",
  DamageAll: "damageAll", ExchangeLifeVariant: "exchangeLife", Fight: "fight",
  PutCounter: "putCounter", PutCounterAll: "putCounterAll", RemoveCounter: "removeCounter",
  Proliferate: "proliferate", MultiplyCounter: "multiplyCounters", MoveCounter: "moveCounters",
  ReplaceCounter: "replaceCounters", Amass: "amass",
  Token: "createToken", CopyPermanent: "copyPermanent", Animate: "animate", AnimateAll: "animateAll",
  Attach: "attach", GainControl: "gainControl", SetState: "setState", Phases: "phaseOut",
  Pump: "pump", PumpAll: "pumpAll", AlterAttribute: "alterAttribute", Effect: "effectUntil",
  Charm: "modal", RepeatEach: "repeatFor", Branch: "branch", DelayedTrigger: "delayedTrigger",
  ImmediateTrigger: "immediateTrigger", Counter: "counterSpell", CopySpellAbility: "copySpell",
  AddTurn: "addTurn", ChooseCard: "chooseCard", ChooseType: "chooseType",
  GenericChoice: "genericChoice", TwoPiles: "twoPiles", Connive: "connive",
  Investigate: "investigate", Cleanup: "cleanup", ReplaceEffect: "effectUntil",
};

/* Forge's trigger names to the engine's trigger events. */
export const FORGE_TRIGGER = {
  ChangesZone: "enters", ChangesZoneAll: "enters", Exiled: "exiled", Sacrificed: "sacrificed",
  Phase: "phase", Attacks: "attacks", AttackersDeclared: "attackers declared",
  AttackersDeclaredOneTarget: "attackers declared", Blocks: "blocks",
  SpellCast: "spell cast", DamageDone: "damage dealt", DamageDoneOnce: "damage dealt once",
  Discarded: "discarded", DiscardedAll: "discarded", Drawn: "drawn", LandPlayed: "land played",
  BecomesTarget: "becomes target", CounterAdded: "counter added", CounterAddedOnce: "counter added once",
  LifeGained: "life gained", TokenCreatedOnce: "token created", BecomeMonstrous: "becomes monstrous",
};

/* Forge static and replacement modes the engine can execute today. `Continuous` is an anthem or a
   lord and goes through `layers.mjs`; `CombatDamageToughness` changes a rule rather than a
   characteristic and goes through `rules/statics.mjs`; `Moved` is a zone-change or entering
   replacement and goes through `replacement.mjs`. Everything else is genuinely absent. */
export const FORGE_STATIC = {Continuous: "layers", CombatDamageToughness: "rules/statics", ReduceCost: "rules/statics"};
export const FORGE_REPLACEMENT = {Moved: "replacement"};

/* Keywords the engine implements BEHAVIORALLY, as opposed to merely declaring the word. Declaring
   `Flying` in the vocabulary is what lets a card script say it; `keywords/combat.mjs` is what makes
   a flier unblockable by the ground. Coverage has to mean the second — the whole reason this file
   exists is that the engine knew the word `Flying` for a week and did nothing with it. */
export const BEHAVIORAL_KEYWORDS = new Set([...Object.values(KEYWORD_FAMILIES), ...Object.values(TIMING_FAMILIES)].flat());

/* Keywords that stand for an ability rather than a behavior, built once the primitive the ability uses is. Equip is
   "[Cost]: Attach this permanent to target creature you control. Activate only as a sorcery" (CR 702.6a): an
   activated ability with the `attach` effect, and what the Equipment grants a static ability on the creature it is
   attached to (`attachedBy`). Cycling is "{cost}, discard this card: draw a card" activated from the hand (CR 702.29a),
   and typecycling the same searching for a card of the type (702.29e): built with activation from the hand (batch 9). */
export const ABILITY_KEYWORDS = {Equip: "attach", Cycling: "draw", TypeCycling: "chooseCard", Enchant: "attach"};


/* What a card needs that the engine has not got. Empty means the engine can play it. */
/* THE OPTIONS AND CONDITIONS (Rob, 2026-10-01: "actions, triggers, effects, actions, options, etc."): what Forge writes
   as an ability's parameters, each with what it means at the table and where the engine stands. A card needing one the
   engine has not built is held back like a card needing a missing effect -- before these were counted, "every rule
   built" took in Rhystic Study, which needs "unless that player pays {1}". `partial` ones are counted as there. */
export const FORGE_OPTIONS = Object.freeze({
  UnlessCost: {name: "Unless a player pays", status: "missing"},
  /* Judged kind by kind (FORGE_COUNTS below), not as one: "for each creature you control" is built, "for each spell
     you've cast this turn" is not. */
  Count: {name: "An amount the game counts (X, for each, devotion, greatest power)", status: "partial", engine: "script/amount.mjs, by kind"},
  ConditionPresent: {name: "An effect's condition: if a permanent is present", status: "missing"},
  ConditionCompare: {name: "An effect's condition: a comparison", status: "missing"},
  ConditionCheckSVar: {name: "An effect's condition: a counted value", status: "missing"},
  ConditionSVarCompare: {name: "An effect's condition: a counted comparison", status: "missing"},
  ConditionDefined: {name: "An effect's condition: about a named object", status: "missing"},
  Condition: {name: "An effect's condition (threshold, metalcraft, kicked, ...)", status: "missing"},
  CheckSVar: {name: "An intervening \"if\" or \"activate only if\": a counted value", status: "missing"},
  IsPresent: {name: "An intervening \"if\" or \"activate only if\": a permanent present", status: "built", engine: "condition {present: selector}"},
  IsPresentStatic: {name: "As long as a permanent is present (a static ability's condition)", status: "missing"},
  PresentZone: {name: "Present in a zone other than the battlefield (\"as long as this card is in your graveyard\")", status: "missing"},
  AtEOT: {name: "Sacrifice or exile it at the beginning of the next end step", status: "built", engine: "a delayed trigger (CR 603.7)"},
  PumpKeywords: {name: "It gains a keyword until end of turn (a token made this way)", status: "built", engine: "gainsUntilEndOfTurn"},
  NonLegendary: {name: "Except it isn't legendary (a copy)", status: "built", engine: "except.nonLegendary"},
  Populate: {name: "Populate (copy a creature token you control)", status: "built", engine: "populate"},
  TokenAttacking: {name: "A token that enters tapped and attacking", status: "missing"},
  AddTriggers: {name: "Grants a triggered ability (\"has 'whenever ...'\")", status: "missing"},
  SVarCompare: {name: "A counted comparison for a condition", status: "missing"},
  PresentCompare: {name: "A comparison of permanents present for a condition", status: "missing"},
  ActivationLimit: {name: "Only once (or N times) each turn", status: "missing"},
  ActivationPhases: {name: "Activate only during a step or phase", status: "missing"},
  TargetMin: {name: "Fewer targets than the most (\"up to\", \"any number of\")", status: "missing"},
  TargetMax: {name: "More than one target of a kind (\"up to N\")", status: "missing"},
  MayPlay: {name: "You may play or cast a card from another zone", status: "missing"},
  Duration: {name: "How long an effect lasts (until end of turn is built; others not)", status: "partial"},
  Optional: {name: "You may (an optional effect, CR 603.5)", status: "built", engine: "modal (Yes / No)"},
  OptionalDecider: {name: "You may, decided by a named player", status: "partial", engine: "modal (Yes / No)"},
  RememberObjects: {name: "Remembering an object (\"the exiled card\", \"that creature\" later)", status: "missing"},
  RememberChanged: {name: "Remembering what an effect moved", status: "missing"},
  Imprint: {name: "Imprint (a card exiled with this)", status: "missing"},
});

/* WHAT AN AMOUNT COUNTS, kind by kind (M4 phase 3, batch 10; game/engine/script/amount.mjs): the name after Forge's
   "Count$", with what it means and where the engine stands. A card needing a kind not built is held back by it. `Valid`
   -- things matching a description -- is partial: the engine counts by type, subtype, supertype, color, controller,
   tapped, counters, power and name, not every description Forge can write. A kind not listed here is missing. */
export const FORGE_COUNTS = Object.freeze({
  Valid: {name: "For each permanent of a kind (\"for each creature you control\")", status: "partial", engine: "{count: selector}"},
  xPaid: {name: "X, chosen as it is cast or activated (CR 107.3)", status: "built", engine: "\"X\", one offer per value"},
  CardCounters: {name: "Counters on this card", status: "built", engine: "{countersOn, counter}"},
  CardPower: {name: "This card's power", status: "built", engine: "{powerOf: \"self\"}"},
  ValidHand: {name: "Cards in a hand", status: "built", engine: "{count: {what: \"card\", zone: \"hand\"}}"},
  ValidGraveyard: {name: "Cards in a graveyard", status: "built", engine: "{count: {what: \"card\", zone: \"graveyard\"}}"},
  ValidLibrary: {name: "Cards in a library", status: "missing"},
  ValidExile: {name: "Cards in exile", status: "missing"},
  Devotion: {name: "Devotion to a color (CR 700.5)", status: "built", engine: "{devotion: [color]}"},
  DevotionDual: {name: "Devotion to two colors (CR 700.5)", status: "built", engine: "{devotion: [color, color]}"},
  Compare: {name: "A comparison (\"if you control ...\")", status: "missing"},
  YourLifeTotal: {name: "Your life total", status: "missing"},
  LifeYouGainedThisTurn: {name: "Life you gained this turn", status: "missing"},
  LifeOppsLostThisTurn: {name: "Life your opponents lost this turn", status: "missing"},
  ThisTurnEntered: {name: "What entered or died this turn", status: "missing"},
  ThisTurnCast: {name: "Spells cast this turn", status: "missing"},
  ThisTurnActivated: {name: "Abilities activated this turn", status: "missing"},
  ResolvedThisTurn: {name: "Times this resolved this turn", status: "missing"},
  YouDrewThisTurn: {name: "Cards you drew this turn", status: "missing"},
  RememberedSize: {name: "How many things an effect remembered", status: "missing"},
  RememberedNumber: {name: "A number an effect remembered", status: "missing"},
  TriggerRememberAmount: {name: "An amount the trigger carries", status: "missing"},
  ChosenNumber: {name: "A number a player chose", status: "missing"},
  CardManaCost: {name: "This card's mana value", status: "missing"},
  ColorsColorIdentity: {name: "Colors in your commanders' identity", status: "missing"},
  CommanderCastFromCommandZone: {name: "Times your commander was cast from the command zone", status: "missing"},
  Converge: {name: "Colors of mana spent (converge)", status: "missing"},
  Threshold: {name: "Threshold (seven cards in your graveyard)", status: "missing"},
  Morbid: {name: "Morbid (a creature died this turn)", status: "missing"},
  UrzaLands: {name: "The Urza lands", status: "missing"},
  Monarch: {name: "The monarch", status: "missing"},
  YourStartingLife: {name: "Your starting life total", status: "missing"},
  DamageAmount: {name: "Damage dealt", status: "missing"},
  AttackersDeclared: {name: "Attackers declared", status: "missing"},
  TimesKicked: {name: "Times kicked", status: "missing"},
  Kicked: {name: "Whether it was kicked", status: "missing"},
  PromisedGift: {name: "A gift promised", status: "missing"},
  YourCountersExperience: {name: "Your experience counters", status: "missing"},
});

/* Forge's trigger modes that stand for many events, some of which the compiler builds. */
export const BROAD_TRIGGERS = Object.freeze(["ChangesZone", "ChangesZoneAll", "Phase"]);

export function missingFor(card) {
  const missing = [];
  for (const api of card.apis ?? []) {
    const primitive = FORGE_API[api];
    if (!primitive) { missing.push({kind: "api", name: api, why: "unmapped"}); continue; }
    if (!isBuilt(primitive) && !isPrimitive(primitive)) missing.push({kind: "api", name: primitive, why: "undeclared"});
    else if (!isBuilt(primitive)) missing.push({kind: "api", name: primitive, why: "declared, not built"});
  }
  /* A TRIGGER COUNTS ONLY WHEN THE CARD COMPILER BUILDS IT (cards/index.mjs, TRIGGER_KINDS). Counting every event the
     vocabulary merely names overstated coverage: "whenever you cast a spell", "whenever this attacks" and "whenever
     this deals damage" were reported as rules the engine had (the catalog showed it, 2026-10-01). Forge's ChangesZone
     and Phase stand for many events, some built ("enters", "dies", "upkeep", "end step"), and the inventory does not
     say which, so those two still count. */
  for (const trigger of card.triggers ?? []) {
    const event = FORGE_TRIGGER[trigger];
    if (!event) { missing.push({kind: "trigger", name: trigger, why: "unmapped"}); continue; }
    if (!isTriggerEvent(event)) { missing.push({kind: "trigger", name: event, why: "undeclared"}); continue; }
    if (!BROAD_TRIGGERS.includes(trigger) && !TRIGGER_KINDS.includes(event)) missing.push({kind: "trigger", name: event, why: "declared, not built"});
  }
  /* WHICH STATICS AND REPLACEMENTS THE ENGINE CAN ACTUALLY EXECUTE. These were marked missing
     unconditionally at first, which was wrong and overstated the gap badly: `Continuous` is an
     anthem, and `layers.mjs` has executed card-script statics since 1.8. Forty-five cards in Rob's
     decks were reported blocked by a rule the engine already had. */
  for (const s of card.statics ?? []) {
    if (FORGE_STATIC[s]) continue;
    missing.push({kind: "static", name: s, why: "no engine support yet"});
  }
  for (const r of card.replacements ?? []) {
    if (FORGE_REPLACEMENT[r]) continue;
    missing.push({kind: "replacement", name: r, why: "no engine support yet"});
  }
  for (const option of card.options ?? []) {
    const known = FORGE_OPTIONS[option];
    if (known && known.status === "missing") missing.push({kind: "option", name: option, why: "not built"});
  }
  /* An amount it counts, kind by kind; a card measured before kinds were (no `counts`) is held back by any count. */
  if (!card.counts && (card.options ?? []).includes("Count")) missing.push({kind: "count", name: "Count", why: "not measured by kind"});
  for (const kind of card.counts ?? []) {
    const known = FORGE_COUNTS[kind];
    if (!known || known.status === "missing") missing.push({kind: "count", name: kind, why: known ? "not built" : "unknown"});
  }
  for (const keyword of card.keywords ?? []) {
    const word = normalizeKeyword(keyword);
    const known = [...BEHAVIORAL_KEYWORDS].some((k) => k.toLowerCase() === word.toLowerCase());
    if (known) continue;
    if (ABILITY_KEYWORDS[word] && isBuilt(ABILITY_KEYWORDS[word])) continue;
    missing.push({kind: "keyword", name: keyword, why: isKeyword(word.toLowerCase()) ? "declared, no behavior" : "not declared"});
  }
  return missing;
}
