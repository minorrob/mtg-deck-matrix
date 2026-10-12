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
  /* RearrangeTopOfLibrary ("look at the top three cards of your library, then put them back in any order": Ponder, Sensei's
     Divining Top, Halimar Depths; wave 4b): rearrangeTop, the looker's order of them. */
  RearrangeTopOfLibrary: "rearrangeTop",
  /* ChangeTargets (CR 115.7; wave 4b): changeTargets in the pool's three forms -- "change the target of target spell or ability
     with a single target" (Bolt Bend, Untimely Malfunction; batch 65), "you may choose new targets for target spell or
     ability" (Deflecting Swat, Wild Ricochet; `may`), and "change a target of target spell or ability to this creature"
     (Spellskite, Hydroelectric Specimen; `to: "self"`). Named, not built: a new target chosen at random (Grip of Chaos). */
  ChangeTargets: "changeTargets",
  PeekAndReveal: "peekAndReveal", Sacrifice: "sacrifice", SacrificeAll: "sacrificeAll",
  /* RevealHand ("look at target player's hand", Gitaxian Probe; wave 4c): peekAndReveal's `zone: "hand"`, the hand shown to its
     looker alone while they look (CR 701.20e; effects/asking.mjs, handLook). The pool's two cards are both looks. Named, not
     built: a hand revealed to every player on its own, with no card chosen from it (CR 701.20a). */
  RevealHand: "peekAndReveal",
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
  /* ExchangeControl ("exchange control of target artifact or creature you control and target creature an opponent controls",
     Oko, Thief of Crowns; "of two target creatures", Switcheroo; Train D): CR 701.12b. */
  ExchangeControl: "exchangeControl",
  PutCounter: "putCounter", PutCounterAll: "putCounterAll", RemoveCounter: "removeCounter",
  Proliferate: "proliferate", MultiplyCounter: "multiplyCounters", MoveCounter: "moveCounters",
  Amass: "amass",
  /* Poison ("each opponent gets a poison counter", batch 64). */
  Poison: "poison",
  /* "You win the game" (batch 68). */
  WinsGame: "winGame",
  /* "That player loses the game", "each player with exactly 13 life loses the game" (Train C phase 2, p6-combat; CR
     104.3e): the players named, at once and together, each leaving the game as it happens (CR 104.5, 800.4a). */
  LosesGame: "loseGame",
  /* Goad (batch 69): attacks each combat, not its goader if it can. */
  Goad: "goad",
  /* BecomeMonarch ("you become the monarch", Ginger, Queen of Sweets; Train E): the game's designation, one player's at a time
     (CR 725.3), its two triggers the game's own (725.2; rules/trigger.mjs), passed on as its player leaves (725.4; rules/sba.mjs). */
  BecomeMonarch: "becomeMonarch",
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
  /* ChooseColor ("choose a color", as it resolves; Skrelv, Defector Mite, Train C phase 2): CR 105.1. */
  ChooseColor: "chooseColor",
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
  BecomesTarget: "becomes target", Taps: "becomes tapped", Cycled: "cycled", CounterAdded: "counter added",
  /* "Whenever one or more +1/+1 counters are put on this creature" (Evolution Witness), "on a creature you control" (Shalai and
     Hallar), "whenever YOU put one or more ... counters on" (Exemplar of Light, Nest of Scarabs; wave 4a): the engine's "counter
     added", once for each time counters are put on a permanent however many (rules/trigger.mjs) -- `who: "any"` and its
     filter, `putBy: "you"` the player who put them, "that many" `countersPut` (script/amount.mjs). */
  CounterAddedOnce: "counter added",
  LifeGained: "life gained", LifeLost: "life lost", TokenCreatedOnce: "token created", BecomeMonstrous: "becomes monstrous",
  /* "Whenever you proliferate" (Train C, w2c-hands-triggers; CR 701.34a). */
  Proliferate: "proliferated",
  /* "Whenever you commit a crime" (Train C, w2c-hands-triggers; CR 700.13). */
  CommitCrime: "crime committed",
  /* A state trigger (Train C, w2c-hands-triggers; CR 603.8): "when this artifact has twenty or more charge counters on it". */
  Always: "state",
  /* "Whenever this creature transforms into ..." (Train C, w2c-hands-triggers; CR 701.27e). */
  Transformed: "transformed",
  /* Magecraft, "whenever you cast or copy an instant or sorcery spell" (Archmage Emeritus, Storm-Kiln Artist; wave 4b): the
     engine's "spell cast" with `orCopy` -- a copy an effect of yours puts on the stack too, once for each (CR 707.10;
     rules/trigger.mjs). Every one of the pool's cards says it this way. */
  SpellCastOrCopy: "spell cast",
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
  Proliferate: "script/resolution",
  /* Counters put on a permanent or a player, replaced (Train C, p4-replacements): "twice that many" (Branching Evolution,
     credited here with no new code for it), "that many plus one" (Hardened Scales), "half that many, rounded down"
     (Vorinclex) -- for whom they are put on and by whom -- the order of two the affected player's (CR 614.1a, 616.1): the
     static `more-counters`, rules/statics.mjs, placeCounters; asked in a resolution (effects/asking.mjs, orderCounters).
     Wave 4a: on its controller alone among players ("or on yourself", Lae'zel; "if you would get", Winding Constrictor), an
     effect's counters and not a cost's ("if an effect would put", Doubling Season), and not as its own permanent enters
     (CR 614.12; the Kami of Whispered Hopes, Ozolith and Winding Constrictor rulings). */
  AddCounter: "rules/statics"};

/* FORGE'S EFFECTS THAT ARE ONLY EVER A REPLACEMENT'S "INSTEAD" (its ReplaceWith): the event a replacement puts in the place of
   the one it replaces. The engine writes the whole replacement as one static (rules/statics.mjs), so such an effect is
   built exactly where the replacement mode it belongs to is -- never an effect primitive of its own. One is listed only
   once that mode is credited in FORGE_REPLACEMENT (tests/engine-tokens-counters-4a.mjs holds the two together). */
export const FORGE_REPLACING_API = Object.freeze({
  /* "That many plus one", "twice that many", "half that many" counters instead (wave 4a: the 18 cards of the pool that
     use it, all of them the forms `more-counters` reads). */
  ReplaceCounter: "AddCounter"});

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
/* Keywords that are a deck rule, held at the table: the partner abilities (CR 702.124), read from the card's own words
   (cards/index.mjs, partnersIn) and held by room/table.mjs when a deck names two commanders. "Partner with" (702.124j) is
   also a trigger as the card enters, its target player searching for the partner it names (cards/index.mjs; Train C
   phase 2). */
export const DECK_RULE_KEYWORDS = {Partner: "room/table.mjs", "Choose a Background": "room/table.mjs", "Partner with": "room/table.mjs"};

/* Keywords that are a way of casting or entering, held by the rules module named (Train B, X11):
   AlternateAdditionalCost -- "as an additional cost to cast this spell, sacrifice an artifact or discard a card" (Demand
     Answers), "sacrifice an artifact or creature or pay {4}" (Stir Up Trouble): one additional cost of a choice of them
     (CR 601.2b, 601.2h), each choice its own offer -- a sacrifice, a discard, a blight or mana (rules/actions.mjs,
     additionalVariants, `{atom: "oneOf"}`). Built before it was credited (Bogslither's Embrace, Silence the Echo); no new
     code. Wave 4c: a fixed life payment as one of the choices ("pay 5 life or pay {2}", Redirect Lightning; CR 119.4), paid
     with the rest of the cost. Named, not built: an exile as one of the choices.
   ETBReplacement -- "[this permanent] enters ..." and "as [this permanent] enters ..." (CR 614.1c, 614.12): tapped, with
     counters, as a copy, with a choice made, unless a cost is paid or a card revealed, and -- new here -- prepared
     (Goblin Glasswright, CR 722.3a; rules/replacement.mjs, script/effects/attributes.mjs). Named, not built: one that
     enters attached to something chosen as it enters, other than an Aura's own Enchant.
   Overload -- "you may cast this spell for its overload cost. If you do, change 'target' in its text to 'each'" (CR 702.96a):
     an alternative cost offered beside the mana cost (rules/actions.mjs), the spell then with no targets (702.96b) and the
     effects its card writes for "each" (702.96c; cards/index.mjs compiles the keyword). Built for Winds of Abandon and
     credited with Mizzix's Mastery (Train B, X11), whose overloaded copies are cast one by one; no new code for the keyword. */
/* Gift (CR 702.174; Dawn's Truce, wave 4b) -- "as an additional cost to cast this spell, you may choose an opponent": an offer for
     each opponent beside the cast that promises nothing (rules/actions.mjs), and what the chosen player gets -- a card, a Food,
     a tapped Fish, an extra turn, a Treasure or an Octopus -- an instant's or sorcery's first, a permanent's as it enters
     (cards/index.mjs, GIFTS).
   MayEffectFromOpeningHand (CR 103.6; Gemstone Caverns, wave 4b) -- an opening hand's actions once the mulligans are done:
     revealing a card for a delayed trigger (103.6b, Chancellor of the Forge), or beginning the game with it on the battlefield,
     its counters on it (103.6a), not the starting player's to take when it says so, and then a card exiled from the hand
     (rules/mulligan.mjs). */
/* Affinity (CR 702.41a; Thought Monitor, wave 4c) -- "this spell costs {1} less to cast for each [text] you control": the
     spell's own `this-costs-less` (cards/index.mjs), read as it is cast (rules/statics.mjs, costReduction) -- for artifacts,
     tokens, or anything a selector says. */
export const CAST_RULE_KEYWORDS = {AlternateAdditionalCost: "rules/actions.mjs", ETBReplacement: "rules/replacement.mjs", Overload: "rules/actions.mjs",
  Affinity: "rules/statics.mjs",
  Gift: "rules/actions.mjs", MayEffectFromOpeningHand: "rules/mulligan.mjs"};

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
  /* Firebending (CR 702.189a; Fire Nation Cadets, Train C phase 2): the attack trigger, N {R} kept until end of combat
     (cards/index.mjs, rules/turn.mjs). */
  Firebending: "addMana",
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
  /* Embalm (CR 702.128a; Anointer Priest, Train C phase 2): the card's activated ability in its owner's graveyard at sorcery
     speed, a token copy of it that is white, a Zombie besides its other types, and has no mana cost (cards/index.mjs;
     effects/permanents.mjs, copiable's `noManaCost`). */
  Embalm: "copyPermanent",
  /* Eternalize (CR 702.129a; Fanatic of Rhonas, wave 4b): embalm's graveyard ability, the token copy black, 4/4, a Zombie
     besides its other types, with no mana cost (cards/index.mjs). */
  Eternalize: "copyPermanent",
  /* Exalted (CR 702.83a; Ignoble Hierarch, wave 4b): the trigger as a creature its controller controls attacks alone, +1/+1
     until end of turn (cards/index.mjs; rules/trigger.mjs's `alone`). */
  Exalted: "pump",
  /* Extort (CR 702.101a; Crypt Ghast, wave 4b): the cast trigger, "you may pay {W/B}" as it resolves, each opponent's life lost
     and that much gained (cards/index.mjs; effects/asking.mjs, unlessPays's `mana`). */
  Extort: "unlessPays",
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
  Monstrosity: "alterAttribute",
  /* Living weapon (CR 702.92a; Bitterthorn, Nissa's Animus, Train B X11): the Equipment's enters trigger, a 0/0 black
     Phyrexian Germ token and the Equipment attached to it (cards/index.mjs). */
  "Living Weapon": "createToken",
  /* Evolve (CR 702.100a; Fathom Mage, Train B X11): the trigger as a creature you control enters, its intervening "if" the
     comparison of power and toughness, and a +1/+1 counter (cards/index.mjs, script/condition.mjs). */
  Evolve: "putCounter",
  /* Backup N (CR 702.165a; Guardian Scalelord, Train B X11): the enters trigger, N +1/+1 counters on target creature, and
     another creature given the abilities printed below until end of turn (cards/index.mjs). */
  Backup: "putCounter",
  /* Cumulative upkeep (CR 702.24a; Mystic Remora, Train B X11): the upkeep trigger, its intervening "if", an age counter,
     and "sacrifice it unless you pay" its mana cost once for each age counter, generic or colored (cards/index.mjs,
     effects/asking.mjs). Named, not built: a cost that is not mana (life, a sacrifice, a discard). */
  "Cumulative upkeep": "unlessPays"};

/* "PROTECTION FROM [QUALITY]" printed as a keyword (CR 702.16a; Karmic Guide's "protection from black"): built for the
   qualities rules/protection.mjs reads -- a color, a card type, multicolored (Argentum Masticore, Train C phase 2),
   everything -- compiled from the keyword (cards/index.mjs). Not a player, a name, "each color" or "the color of your
   choice". */
const PROTECTION_QUALITIES = /^protection from (white|blue|black|red|green|multicolored|everything|artifacts|creatures|enchantments|instants|lands|planeswalkers|sorceries)$/i;

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
  /* Ward's discard (CR 702.21a), and "sacrifice this creature unless you discard a card. When you discard a card this way"
     (Argentum Masticore, Train C phase 2): each card in the payer's hand its own option, the card discarded remembered. */
  UnlessCostDiscard: {name: "Unless a player discards a card", status: "built", engine: "unlessPays's discard: each card in the payer's hand an option; the discarded card remembered (\"this way\")"},
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
  /* Train C (Light Up the Stage's spectacle, CR 702.137a): every opponent's life lost this turn, together, those still in
     the game (CR 800.4a) -- the record each player's own count was kept in (effects/resources.mjs). Its one form, built. */
  LifeOppsLostThisTurn: {name: "Life your opponents lost this turn", status: "built", engine: "amount {lifeLostThisTurn: \"opponents\"} (effects/resources.mjs keeps each player's, rules/turn.mjs clears it)"},
  ThisTurnEntered: {name: "What entered or died this turn", status: "missing"},
  /* Train C (Aetherflux Reservoir, Traxos, Academy Guardian): a player's spells this turn, as each was cast -- read by its
     card types and controller (rules/actions.mjs keeps them; script/filter.mjs, matchesLastKnown) -- counted when the
     amount is read (CR 608.2h). Partial: a spell's color, subtypes, mana value or name this turn are not read. */
  ThisTurnCast: {name: "Spells cast this turn", status: "partial", engine: "amount {spellsCastThisTurn: \"you\" | \"that player\", filter?} -- by card type and controller"},
  ThisTurnActivated: {name: "Abilities activated this turn", status: "missing"},
  ResolvedThisTurn: {name: "Times this resolved this turn", status: "missing"},
  /* Train C (Fractal Anomaly, Lake-town Toymaker): each card a player drew this turn its own (CR 121.2; state/index.mjs,
     recordDraw, at every draw). Its one form, built. */
  YouDrewThisTurn: {name: "Cards you drew this turn", status: "built", engine: "amount {cardsDrawnThisTurn: \"you\" | \"that player\"} (state/index.mjs recordDraw, rules/turn.mjs clears it)"},
  RememberedSize: {name: "How many things an effect remembered", status: "missing"},
  RememberedNumber: {name: "A number an effect remembered", status: "missing"},
  TriggerRememberAmount: {name: "An amount the trigger carries", status: "missing"},
  ChosenNumber: {name: "A number a player chose", status: "missing"},
  CardManaCost: {name: "This card's mana value", status: "missing"},
  /* Train C (p3-costs; War Room): "pay life equal to the number of colors in your commanders' color identity" -- the union of
     their identities (CR 903.4), undefined and a cost of it unpayable without a commander (903.4f). */
  ColorsColorIdentity: {name: "Colors in your commanders' identity", status: "built", engine: "amount {commanderColors: \"you\"} (script/amount.mjs); a cost of it unpayable without a commander"},
  CommanderCastFromCommandZone: {name: "Times your commander was cast from the command zone", status: "missing"},
  /* Train C, phase 2 (w2b-amounts; Vanguard of the Restless): "for each time you've cast your commander from the command zone
     this game" -- every cast of each of your commanders from there (CR 903.8), as their tax is kept. Its one form, built. */
  TotalCommanderCastFromCommandZone: {name: "Times you've cast your commanders from the command zone", status: "built", engine: "amount {commanderCasts: \"you\"} (rules/commander.mjs keeps the casts)"},
  /* Train C, phase 2 (w2b-amounts; Sundering Archaic): the colors among the mana spent to cast its own object (CR 601.2h) --
     a spell's, a permanent's trigger's (remembered as it triggers, CR 608.2h), and as it enters with counters. */
  Converge: {name: "Colors of mana spent (converge)", status: "built", engine: "amount {colorsSpent: \"self\"} (rules/actions.mjs records the mana by kind)"},
  /* Rob's Priority Batch 10.3, its twenty-first slice: the mana spent to cast an object, by color (rules/actions.mjs). */
  Adamant: {name: "Mana of a color spent to cast it (adamant; \"if {G}{G} was spent to cast it\")", status: "built", engine: "condition {spent: {color: n}} (script/condition.mjs)"},
  /* Fblthp, the Lost (AI 1's deck): "if it entered from your library or was cast from your library". */
  wasCastFromYourLibrary: {name: "It entered from, or was cast from, your library", status: "built", engine: "condition {cameFrom: \"library\"} (script/condition.mjs)"},
  Threshold: {name: "Threshold (seven cards in your graveyard)", status: "missing"},
  /* Train B (X11; Wayward Swordtooth): "unless you have the city's blessing" -- ascend's designation (CR 702.131;
     keywords/designations.mjs). */
  Blessing: {name: "The city's blessing (ascend)", status: "built", engine: "condition {citysBlessing} (script/condition.mjs)"},
  /* Train C (Dreaded Bat-Cloud, Essenceknit Scholar): a creature put into a graveyard from the battlefield (CR 700.4),
     counted as it lands there for whoever controlled it as it last existed (state/index.mjs, recordDeath; every way it can
     go there: effects/zones.mjs, rules/sba.mjs) -- "a creature died this turn" and "died under your control". Built. */
  Morbid: {name: "Morbid (a creature died this turn)", status: "built", engine: "amount {creaturesDiedThisTurn: \"you\" | \"that player\" | \"any\"} (state/index.mjs recordDeath, rules/turn.mjs clears it)"},
  UrzaLands: {name: "The Urza lands", status: "missing"},
  /* Train E (Ginger, Queen of Sweets): "if you're the monarch" (CR 725). */
  Monarch: {name: "The monarch", status: "built", engine: "condition {monarch: \"you\"} (script/condition.mjs); \"while you're the monarch\", a damage trigger's monarch: \"you\""},
  YourStartingLife: {name: "Your starting life total", status: "missing"},
  DamageAmount: {name: "Damage dealt", status: "built", engine: "{damageDealt: true}: the damage a damage trigger is about, all of an action's together"},
  /* Train C, p4-replacements: the number a counter replacement changes ("that many plus one", "twice that many"). */
  CounterNum: {name: "That many counters (the number of counters a replacement changes)", status: "built", engine: "more-counters' times, plus and half (rules/statics.mjs, placeCounters)"},
  /* Wave 4b (Minas Tirith): "if you attacked with two or more creatures this turn" -- each creature a player declared as an
     attacker this turn, once, kept as they are declared (rules/combat.mjs). Its one form, built. */
  AttackersDeclared: {name: "Attackers declared", status: "built", engine: "amount {creaturesAttackedWithThisTurn: \"you\" | \"that player\"} (rules/combat.mjs keeps them)"},
  TimesKicked: {name: "Times kicked", status: "missing"},
  Kicked: {name: "Whether it was kicked", status: "missing"},
  /* Wave 4b (Dawn's Truce): "if the gift was promised" (CR 702.174b, 702.174k). */
  PromisedGift: {name: "A gift promised", status: "built", engine: "condition {giftPromised} (script/condition.mjs): the spell's gift, a copy's, or the permanent's it became (rules/stack.mjs)"},
  /* Train D (Ezuri, Claw of Progress): "the number of experience counters you have" -- a player's own counters, counted (CR
     122.1); "you get an experience counter" is putCounter's `who` (effects/resources.mjs). */
  YourCountersExperience: {name: "Your experience counters", status: "built", engine: "amount {countersOn: \"you\", counter: \"experience\"} (script/amount.mjs); putCounter's who gives them"},
});

/* Forge's trigger modes that stand for many events, some of which the compiler builds. */
export const BROAD_TRIGGERS = Object.freeze(["ChangesZone", "ChangesZoneAll", "Phase"]);

export function missingFor(card) {
  const missing = [];
  for (const api of card.apis ?? []) {
    /* The "instead" of a replacement: built where that replacement is (FORGE_REPLACING_API). */
    if (FORGE_REPLACING_API[api]) continue;
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
