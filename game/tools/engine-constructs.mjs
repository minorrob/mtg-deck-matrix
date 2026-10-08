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
import {KEYWORD_FAMILIES as TYPE_FAMILIES} from "../engine/keywords/types.mjs";
import {KEYWORD_FAMILIES as DESIGNATION_FAMILIES} from "../engine/keywords/designations.mjs";
import {TRIGGER_KINDS} from "../engine/cards/index.mjs";

/* Forge's API names to the engine's primitives — §12.2's parenthesised pairs, as data. A name that
   is not here is reported as unmapped rather than silently counted as missing, because "the engine
   cannot do this" and "nobody has said what this is" are different problems. */
export const FORGE_API = {
  ChangeZone: "moveZone", ChangeZoneAll: "moveZoneAll", Draw: "draw", Discard: "discard",
  Mill: "mill", Shuffle: "shuffle", Dig: "dig", Surveil: "surveil", Scry: "scry",
  PeekAndReveal: "peekAndReveal", Sacrifice: "sacrifice", SacrificeAll: "sacrificeAll",
  Destroy: "destroy", DestroyAll: "destroyAll", Regenerate: "regenerate", ExileUntil: "exileUntil", ReturnToHand: "returnToHand",
  Play: "play", Discover: "discover",
  /* DigUntil ("reveal cards until you reveal a land card", batch 62). */
  DigUntil: "digUntil",
  /* Manifest ("its controller manifests the top card of their library", Reality Shift; claude/cards-faces-class): the top
     card onto the battlefield face down, a 2/2 its controller alone may look at, turned face up for its mana cost (CR 701.40). */
  Manifest: "manifest",
  /* ManaReflected ("any color that a land an opponent controls could produce", batch 50): addMana's reflect and among. */
  Mana: "addMana", ManaReflected: "addMana", Tap: "tap", Untap: "untap", UntapAll: "untapAll",
  ReduceCost: "costReduction", AlternativeCost: "alternativeCost",
  GainLife: "gainLife", LoseLife: "loseLife", DealDamage: "dealDamage", EachDamage: "damageEach",
  DamageAll: "damageAll", ExchangeLifeVariant: "exchangeLife", Fight: "fight",
  PutCounter: "putCounter", PutCounterAll: "putCounterAll", RemoveCounter: "removeCounter",
  Proliferate: "proliferate", MultiplyCounter: "multiplyCounters", MoveCounter: "moveCounters",
  ReplaceCounter: "replaceCounters", Amass: "amass",
  /* Poison ("each opponent gets a poison counter", batch 64). */
  Poison: "poison",
  /* "You win the game" (batch 68). */
  WinsGame: "winGame",
  /* Goad (batch 69): attacks each combat, not its goader if it can. */
  Goad: "goad",
  /* Earthbend (batch 65): the land a creature with haste, its counters, its return. */
  Earthbend: "earthbend",
  /* Clone ("becomes a copy of target land", batch 58): a permanent becoming a copy, for a turn or for good. */
  Clone: "becomeCopy",
  Token: "createToken", CopyPermanent: "copyPermanent", Animate: "animate", AnimateAll: "animateAll",
  Attach: "attach", GainControl: "gainControl", SetState: "setState", Phases: "phaseOut",
  Pump: "pump", PumpAll: "pumpAll", AlterAttribute: "alterAttribute", Effect: "effectUntil",
  Charm: "modal", RepeatEach: "repeatFor", Branch: "branch", DelayedTrigger: "delayedTrigger",
  ImmediateTrigger: "immediateTrigger", Counter: "counterSpell", CopySpellAbility: "copySpell",
  AddTurn: "addTurn", AddPhase: "addPhase", ChooseCard: "chooseCard", ChooseType: "chooseType",
  /* GenericChoice ("create a Food token or a Treasure token", "target opponent may have you draw three cards"): the modal
     question at resolution, its chooser any player (batch 52). */
  GenericChoice: "modal", TwoPiles: "twoPiles", Connive: "connive",
  Investigate: "investigate", Cleanup: "cleanup", ReplaceEffect: "effectUntil",
};

/* Forge's trigger names to the engine's trigger events. */
export const FORGE_TRIGGER = {
  ChangesZone: "enters", ChangesZoneAll: "enters", Exiled: "exiled", Sacrificed: "sacrificed",
  Phase: "phase", Attacks: "attacks", AttackersDeclared: "attackers declared",
  AttackersDeclaredOneTarget: "attackers declared", Blocks: "blocks",
  SpellCast: "spell cast", DamageDone: "damage dealt", DamageDoneOnce: "damage dealt once", TapsForMana: "tapped for mana",
  Discarded: "discarded", DiscardedAll: "discarded", Drawn: "drawn", LandPlayed: "land played",
  BecomesTarget: "becomes target", Taps: "becomes tapped", Cycled: "cycled", CounterAdded: "counter added", CounterAddedOnce: "counter added once",
  LifeGained: "life gained", LifeLost: "life lost", TokenCreatedOnce: "token created", BecomeMonstrous: "becomes monstrous",
};

/* Forge static and replacement modes the engine can execute today. `Continuous` is an anthem or a
   lord and goes through `layers.mjs`; `CombatDamageToughness` changes a rule rather than a
   characteristic and goes through `rules/statics.mjs`; `Moved` is a zone-change or entering
   replacement and goes through `replacement.mjs`. Everything else is genuinely absent. */
export const FORGE_STATIC = {Continuous: "layers", CombatDamageToughness: "rules/statics", ReduceCost: "rules/statics",
  /* "That ability triggers an additional time" (batch 34): the static `triggers-again`, read by rules/trigger.mjs. */
  Panharmonicon: "rules/trigger",
  /* "Rather than pay this spell's mana cost" (batch 39): the card's own `alternative-cost` static, rules/actions.mjs. */
  AlternativeCost: "rules/actions",
  /* "You may cast spells as though they had flash" (batch 49): `cast-as-though-flash`, rules/actions.mjs. */
  CastWithFlash: "rules/actions",
  /* "Untap all permanents you control during each other player's untap step" (batch 53): rules/turn.mjs. */
  UntapOtherPlayer: "rules/turn",
  /* "Your opponents can't cast spells from anywhere other than their hands", "during your turn", "more than one spell each
     turn" (batch 63): the static `cant-cast`, read where a cast is offered (rules/statics.mjs castForbidden). */
  CantBeCast: "rules/actions",
  /* "Your opponents can't gain life" (CR 119.7; Rob's Priority Batch 10.3, its twenty-sixth slice): `cant-gain-life`. */
  CantGainLife: "rules/statics",
  /* "Creatures can't attack you unless their controller pays {2} for each" (batch 66): `attack-tax`, rules/combat.mjs. */
  CantAttackUnless: "rules/combat",
  /* "Can't be blocked by creatures with power 3 or greater", "your opponents can't block with creatures with even mana
     values" (batch 69 credits it): the static `cant-be-blocked-by`, its attackers `affects` and its blockers `by`. */
  CantBlockBy: "keywords/combat",
  /* "Inklings can't attack you", "can't attack its owner", "a player it has already attacked this turn", "unless you control
     seven or more lands" (X5g): the static `cant-attack`, rules/combat.mjs, before any requirement (CR 508.1c-d). */
  CantAttack: "rules/combat",
  /* Train B B4, CR 702.3b: defender lifted for selected creatures, either toward anyone or toward players who attacked
     their controller during their last turn; the latter never includes a planeswalker (rules/statics.mjs). */
  CanAttackDefender: "rules/statics",
  /* Train B B4, CR 702.10c: activate as though a creature had haste, for ordinary and mana abilities and payment sources;
     the permission leaves the restriction on attacking intact (keywords/timing.mjs, sickForAbilities). */
  ActivateAbilityAsIfHaste: "keywords/timing",
  /* Train B B4, CR 508.1d: attacks each combat if able, respecting restrictions, optional attack costs and planeswalker
     caps; required attackers are in the choice record and both pilots meet the requirement. */
  MustAttack: "rules/combat",
  /* "This token can't block" (White Sun's Twilight's Mites), "this creature can't block" (Bloodghast, Gravecrawler), on a
     selector of creatures (priority batch 1): the static `cant-block`, rules/combat.mjs canBlock (CR 509.1b). */
  CantBlock: "rules/combat"};
export const FORGE_REPLACEMENT = {Moved: "replacement",
  /* "This artifact doesn't untap during your untap step" (batch 66): the static `doesnt-untap`, rules/turn.mjs. */
  Untap: "rules/turn",
  /* "This spell can't be countered", "creature spells you control can't be countered" (batch 64): the static
     `cant-be-countered`, read where a counter would apply (rules/statics.mjs, cantBeCountered). */
  Counter: "rules/statics",
  /* Damage replaced (batch 71): doubled, plus N, prevented -- for a while, a shield, or with what follows "that many"
     (CR 615.5) -- and redirected to what the holder enchants (CR 614.9); by its source, to whom, combat or not. */
  DamageDone: "rules/replacement",
  /* "If you would proliferate, proliferate twice instead" (Tekuthal, Inquiry Dominus): the static `proliferate-twice`, each
     one doubling its controller's proliferates as one reaches the head of a resolution (script/resolution.mjs). */
  Proliferate: "script/resolution"};

/* Keywords the engine implements BEHAVIORALLY, as opposed to merely declaring the word. Declaring
   `Flying` in the vocabulary is what lets a card script say it; `keywords/combat.mjs` is what makes
   a flier unblockable by the ground. Coverage has to mean the second — the whole reason this file
   exists is that the engine knew the word `Flying` for a week and did nothing with it. */
export const BEHAVIORAL_KEYWORDS = new Set([...Object.values(KEYWORD_FAMILIES), ...Object.values(TIMING_FAMILIES), ...Object.values(TYPE_FAMILIES), ...Object.values(DESIGNATION_FAMILIES)].flat());

/* Keywords that stand for an ability rather than a behavior, built once the primitive the ability uses is. Equip is
   "[Cost]: Attach this permanent to target creature you control. Activate only as a sorcery" (CR 702.6a): an
   activated ability with the `attach` effect, and what the Equipment grants a static ability on the creature it is
   attached to (`attachedBy`). Cycling is "{cost}, discard this card: draw a card" activated from the hand (CR 702.29a),
   and typecycling the same searching for a card of the type (702.29e): built with activation from the hand (batch 9). */
/* Keywords that are a deck rule, held at the table and never in the game: the partner abilities (CR 702.124), read from
   the card's own words (cards/index.mjs, partnersIn) and held by room/table.mjs when a deck names two commanders. Not
   "Partner with", which is also a trigger as the card enters (702.124j). */
export const DECK_RULE_KEYWORDS = {Partner: "room/table.mjs", "Choose a Background": "room/table.mjs"};

/* Keywords that are a way of casting or entering, held by the rules module named (Train B, X11):
   AlternateAdditionalCost -- "as an additional cost to cast this spell, sacrifice an artifact or discard a card" (Demand
     Answers), "sacrifice an artifact or creature or pay {4}" (Stir Up Trouble): one additional cost of a choice of them
     (CR 601.2b, 601.2h), each choice its own offer -- a sacrifice, a discard, a blight or mana (rules/actions.mjs,
     additionalVariants, `{atom: "oneOf"}`). Built before it was credited (Bogslither's Embrace, Silence the Echo); no new
     code. Named, not built: an exile or a life payment as one of the choices.
   ETBReplacement -- "[this permanent] enters ..." and "as [this permanent] enters ..." (CR 614.1c, 614.12): tapped, with
     counters, as a copy, with a choice made, unless a cost is paid or a card revealed, and -- new here -- prepared
     (Goblin Glasswright, CR 722.3a; rules/replacement.mjs, script/effects/attributes.mjs). Named, not built: one that
     enters attached to something chosen as it enters, other than an Aura's own Enchant.
   Overload -- "you may cast this spell for its overload cost. If you do, change 'target' in its text to 'each'" (CR 702.96a):
     an alternative cost offered beside the mana cost (rules/actions.mjs), the spell then with no targets (702.96b) and the
     effects its card writes for "each" (702.96c; cards/index.mjs compiles the keyword). Built for Winds of Abandon and
     credited with Mizzix's Mastery (Train B, X11), whose overloaded copies are cast one by one; no new code for the keyword. */
export const CAST_RULE_KEYWORDS = {AlternateAdditionalCost: "rules/actions.mjs", ETBReplacement: "rules/replacement.mjs", Overload: "rules/actions.mjs"};

export const ABILITY_KEYWORDS = {Equip: "attach", Cycling: "draw", TypeCycling: "chooseCard", Enchant: "attach",
  /* Hideaway (Train B, CR 702.75a): dig links a face-down exile, shuffles the rest to the bottom,
     and preserves each entitled controller's permission to look (CR 406.3). */
  Hideaway: "dig",
  /* Ninjutsu (batch 54): an ability of the card in hand, returning an unblocked attacker, the Ninja put onto the battlefield
     tapped and attacking (cards/index.mjs). */
  Ninjutsu: "moveZone",
  /* Crew (batch 55): the `crew` cost and the Vehicle animated until end of turn (cards/index.mjs). */
  Crew: "animate",
  /* Station (batch 58): tap another creature, charge counters equal to its power; what it has at N+ on that condition. */
  Station: "putCounter",
  /* Chapter (batch 60): a Saga's lore counters -- entering, after the draw step -- its chapters, and its sacrifice. */
  Chapter: "putCounter",
  /* Prowess (batch 77): the triggered ability, +1/+1 until end of turn on a noncreature spell cast (cards/index.mjs).
     Toxic (batch 77): poison counters with combat damage to a player, its number (rules/combat.mjs). */
  Prowess: "pump", Toxic: "poison",
  /* Annihilator (batch 78): the triggered ability, the defending player sacrificing N permanents (cards/index.mjs). */
  Annihilator: "sacrifice",
  /* Mentor (CR 702.134a; Legion Warboss, Train B X11): the attack trigger, a +1/+1 counter on target attacking creature
     with power less than this creature's -- as it resolves, or as it last was if it has left (cards/index.mjs). */
  Mentor: "putCounter",
  /* Afterlife (X5c): the dies trigger, N 1/1 white and black Spirit tokens with flying (cards/index.mjs). */
  Afterlife: "createToken",
  /* Forge's etbCounter, "this creature enters with two +1/+1 counters on it" (X5e): the replacement `entersWithCounters` on
     the permanent's own entering (CR 614.1c, rules/replacement.mjs) -- a number, X paid (CR 107.3m), an amount counted as it
     enters, and "escapes with" (CR 702.138c). Walking Ballista and Hangarback Walker were defined with it before it was
     credited. A kicker count is Multikicker's, and converge is Converge's: each is measured, and held back, on its own.
     Named, not built: "if you cast it" (Nine-Lives Familiar, held back by RememberObjects too) and shield counters' rule
     (CR 122.1c; Sanctuary Warden enters with two and they would do nothing). */
  etbCounter: "putCounter",
  /* Encore (X5f): the card's activated ability in its owner's graveyard, a hasty token copy for each opponent, each required
     to attack that opponent this turn (cards/index.mjs, rules/combat.mjs). */
  Encore: "copyPermanent",
  /* Echo (CR 702.30a; Karmic Guide, AI 1's deck): the upkeep trigger, its intervening "if" (came under your control since
     your last upkeep, script/condition.mjs), and "sacrifice it unless you pay" a mana cost with its colors (cards/index.mjs,
     effects/asking.mjs). */
  Echo: "unlessPays",
  /* Class (CR 716; Innkeeper's Talent, claude/cards-faces-class): each level bar an activated ability, "this Class's level
     becomes N", at sorcery speed from level N-1 (setState's `level`), and the level's abilities had from that level -- a
     static or activated one on that condition, a triggered one gated as it triggers (cards/index.mjs, classLevel). Named,
     not built: a replacement or a keyword ability gained at a level (refused by name). */
  Class: "setState",
  /* Paradigm (CR 702.192a; Germination Practicum): the spell exiled as it resolves, and the first time one of its name
     resolves for a player, a copy cast free at each of their precombat main phases (rules/stack.mjs, play's copyOf). */
  Paradigm: "play",
  /* Monstrosity (CR 701.37a; Protector of the Wastes, Train B): "{cost}: Monstrosity N" -- if it isn't monstrous, N +1/+1
     counters and it becomes monstrous (alterAttribute's `counters`, script/effects/attributes.mjs), "when this becomes
     monstrous" its trigger (cards/index.mjs). */
  Monstrosity: "alterAttribute"};

/* "PROTECTION FROM [QUALITY]" printed as a keyword (CR 702.16a; Karmic Guide's "protection from black"): built for the
   qualities rules/protection.mjs reads -- a color, a card type, everything -- compiled from the keyword (cards/index.mjs).
   Not a player, a name, "multicolored", "each color" or "the color of your choice". */
const PROTECTION_QUALITIES = /^protection from (white|blue|black|red|green|everything|artifacts|creatures|enchantments|instants|lands|planeswalkers|sorceries)$/i;

/** Whether a keyword is built: one a rules module acts on, an ability keyword whose primitive is built, or a deck rule the
    table holds. The one rule `missingFor` and the catalog (engine-catalog.mjs) both read. */
export const keywordBuilt = (word) => [...BEHAVIORAL_KEYWORDS].some((k) => k.toLowerCase() === word.toLowerCase())
  || Boolean(ABILITY_KEYWORDS[word] && isBuilt(ABILITY_KEYWORDS[word])) || Boolean(DECK_RULE_KEYWORDS[word]) || Boolean(CAST_RULE_KEYWORDS[word]) || PROTECTION_QUALITIES.test(word);


/* What a card needs that the engine has not got. Empty means the engine can play it. */
/* THE OPTIONS AND CONDITIONS (Rob, 2026-10-01: "actions, triggers, effects, actions, options, etc."): what Forge writes
   as an ability's parameters, each with what it means at the table and where the engine stands. A card needing one the
   engine has not built is held back like a card needing a missing effect -- before these were counted, "every rule
   built" took in Rhystic Study, which needs "unless that player pays {1}". `partial` ones are counted as there. */
export const FORGE_OPTIONS = Object.freeze({
  /* Judged by what it asks (UnlessCost* below), not as one: mana, life and a reveal are built; a discard or a sacrifice
     is not. */
  UnlessCost: {name: "Unless a player pays", status: "partial", engine: "unlessPays, by kind"},
  UnlessCostMana: {name: "Unless a player pays mana (\"unless that player pays {1}\")", status: "built", engine: "unlessPays (generic mana)"},
  UnlessCostPayLife: {name: "Unless a player pays life (a shock land's 2 life)", status: "built", engine: "unlessPay life, as it enters"},
  UnlessCostReveal: {name: "Unless a player reveals a card (\"reveal an Island or Swamp card\")", status: "built", engine: "unlessReveal, as it enters"},
  UnlessCostDiscard: {name: "Unless a player discards a card", status: "missing"},
  UnlessCostSac: {name: "Unless a player sacrifices a permanent", status: "missing"},
  UnlessCostOther: {name: "Unless a player pays some other cost (taps, exiles, ...)", status: "missing"},
  /* Judged kind by kind (FORGE_COUNTS below), not as one: "for each creature you control" is built, "for each spell
     you've cast this turn" is not. */
  Count: {name: "An amount the game counts (X, for each, devotion, greatest power)", status: "partial", engine: "script/amount.mjs, by kind"},
  ConditionPresent: {name: "An effect's condition: if a permanent is present", status: "built", engine: "an effect's condition {present ...}"},
  ConditionCompare: {name: "An effect's condition: a comparison", status: "built", engine: "a count compared: an arrival's unless {min, max}; a condition's {atLeast, atMost}"},
  /* X5d: a condition that counts and compares (`compare`, script/condition.mjs), over the amount grammar (script/amount.mjs);
     an ability's condition and an effect's alike. */
  ConditionCheckSVar: {name: "An effect's condition: a counted value", status: "built", engine: "condition {compare: {count, atLeast | atMost | moreThan | fewerThan}}"},
  ConditionSVarCompare: {name: "An effect's condition: a counted comparison", status: "built", engine: "condition {compare}"},
  /* Batch 70: its seven forms -- how the spell was cast (from a graveyard, Addendum's main phase), what the effect before
     did "this way" (sacrificed, discarded, dealt damage to, made), and the spell a trigger is about, as it last was. */
  ConditionDefined: {name: "An effect's condition: about a named object", status: "built",
    engine: "{cast: {from | mainPhase}}; {about: \"remembered\" | \"that card\" | \"target\", is} -- `remember` on sacrifice, discard, dealDamage, copyPermanent"},
  Condition: {name: "An effect's condition (threshold, metalcraft, kicked, ...)", status: "built", engine: "an effect's or a static's condition: present, turn, graveyard types"},
  CheckSVar: {name: "An intervening \"if\" or \"activate only if\": a counted value", status: "built", engine: "condition {compare}"},
  IsPresent: {name: "An intervening \"if\" or \"activate only if\": a permanent present", status: "built", engine: "condition {present: selector}"},
  IsPresentStatic: {name: "As long as a permanent is present (a static ability's condition)", status: "built", engine: "a static's condition {present, atLeast | atMost}; worksFrom: graveyard"},
  PresentZone: {name: "Present in a zone other than the battlefield (\"as long as this card is in your graveyard\")", status: "missing"},
  AtEOT: {name: "Sacrifice or exile it at the beginning of the next end step", status: "built", engine: "a delayed trigger (CR 603.7)"},
  PumpKeywords: {name: "It gains a keyword until end of turn (a token made this way)", status: "built", engine: "gainsUntilEndOfTurn"},
  NonLegendary: {name: "Except it isn't legendary (a copy)", status: "built", engine: "except.nonLegendary"},
  Populate: {name: "Populate (copy a creature token you control)", status: "built", engine: "populate"},
  TokenAttacking: {name: "A token that enters tapped and attacking", status: "built", engine: "`attacking` on createToken and copyPermanent: that player, or the one its controller chooses (batch 67)"},
  /* Batch 76: granted abilities -- a layer-6 static's `addAbilities` ("equipped creature has 'whenever this creature
     attacks ...'", "all Slivers have 'when this permanent enters ...'") and a pump's `abilities` until end of turn
     ("target creature gains 'when this creature dies ...'"); activated, mana and keyword abilities given the same way. */
  AddTriggers: {name: "Grants a triggered ability (\"has 'whenever ...'\")", status: "built", engine: "a static's apply.addAbilities; a pump's abilities (rules/layers.mjs, abilitiesOf)"},
  SVarCompare: {name: "A counted comparison for a condition", status: "built", engine: "condition {compare}: at least, at most, more than, fewer than a number or another amount"},
  PresentCompare: {name: "A comparison of permanents present for a condition", status: "built", engine: "condition {present, atLeast | atMost}"},
  ActivationLimit: {name: "Only once (or N times) each turn", status: "built", engine: "an activated or triggered ability's `limit`, times each turn (rules/actions.mjs, rules/trigger.mjs)"},
  ActivationPhases: {name: "Activate only during a step or phase", status: "missing"},
  /* X5a: a target spec's count, `{min, max}` (script/bind.mjs), picked as a pick-several once the offer is taken
     ("choose-targets"). A count that is X ("up to X target creatures") is not built: TargetMax stays partial. */
  TargetMin: {name: "Fewer targets than the most (\"up to\", \"any number of\")", status: "built", engine: "a target's count {min, max} (script/bind.mjs), picked as a pick-several"},
  TargetMax: {name: "More than one target of a kind (\"up to N\")", status: "partial", engine: "a target's count {min, max} (script/bind.mjs); a count that is X is not built"},
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
  LifeAmount: {name: "That much life (\"loses that much life\", the life gained)", status: "built", engine: "{lifeGained: true}: the life the trigger is about (batch 68)"},
  Devotion: {name: "Devotion to a color (CR 700.5)", status: "built", engine: "{devotion: [color]}"},
  DevotionDual: {name: "Devotion to two colors (CR 700.5)", status: "built", engine: "{devotion: [color, color]}"},
  Compare: {name: "A comparison (\"if you control ...\")", status: "built", engine: "{if: condition, then, else}; a modal's chooseMore, as it is cast"},
  YourLifeTotal: {name: "Your life total", status: "missing"},
  LifeYouGainedThisTurn: {name: "Life you gained this turn", status: "built", engine: "amount {lifeGainedThisTurn} (effects/resources.mjs and rules/combat.mjs keep it)"},
  /* Train B (X11; Betor, Ancestor's Voice): "the amount of life you lost this turn" -- the amount Wound Reflection's "that
     player" was built with, for "you"; and a mana value at most it (script/filter.mjs). */
  LifeYouLostThisTurn: {name: "Life you lost this turn", status: "built", engine: "amount {lifeLostThisTurn: \"you\"} (effects/resources.mjs keeps it, rules/turn.mjs clears it); a selector's manaValue.max may be it"},
  /* Train B, X11 (Primary Research, Relic Retriever): every card that left a player's graveyard this turn, to anywhere --
     cards only, never a token (CR 108.2b). Its one form, built. */
  LeftGraveyardThisTurn: {name: "Cards that left your graveyard this turn", status: "built", engine: "amount {cardsLeftGraveyardThisTurn: \"you\" | \"that player\"} (state/index.mjs keeps it, rules/turn.mjs clears it)"},
  /* Train B (X11; Return to Dust): "if you cast this spell during your main phase" -- the cast's own record (rules/actions.mjs,
     Addendum's condition) -- for a target the spell has only then (CR 601.2c; script/bind.mjs, `onlyIf`). */
  IfCastInOwnMainPhase: {name: "If it was cast during its caster's main phase (\"if you cast this spell during your main phase\")", status: "built",
    engine: "condition {cast: {mainPhase: true}}; a target spec's onlyIf (script/bind.mjs)"},
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
  /* Rob's Priority Batch 10.3, its twenty-first slice: the mana spent to cast an object, by color (rules/actions.mjs). */
  Adamant: {name: "Mana of a color spent to cast it (adamant; \"if {G}{G} was spent to cast it\")", status: "built", engine: "condition {spent: {color: n}} (script/condition.mjs)"},
  /* Fblthp, the Lost (AI 1's deck): "if it entered from your library or was cast from your library". */
  wasCastFromYourLibrary: {name: "It entered from, or was cast from, your library", status: "built", engine: "condition {cameFrom: \"library\"} (script/condition.mjs)"},
  Threshold: {name: "Threshold (seven cards in your graveyard)", status: "missing"},
  Morbid: {name: "Morbid (a creature died this turn)", status: "missing"},
  UrzaLands: {name: "The Urza lands", status: "missing"},
  Monarch: {name: "The monarch", status: "missing"},
  YourStartingLife: {name: "Your starting life total", status: "missing"},
  DamageAmount: {name: "Damage dealt", status: "built", engine: "{damageDealt: true}: the damage a damage trigger is about, all of an action's together"},
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
    if (keywordBuilt(word)) continue;
    missing.push({kind: "keyword", name: keyword, why: isKeyword(word.toLowerCase()) ? "declared, no behavior" : "not declared"});
  }
  return missing;
}
