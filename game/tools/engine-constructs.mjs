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
export const ABILITY_KEYWORDS = {Equip: "attach", Cycling: "draw", TypeCycling: "chooseCard"};


/* What a card needs that the engine has not got. Empty means the engine can play it. */
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
  for (const keyword of card.keywords ?? []) {
    const word = normalizeKeyword(keyword);
    const known = [...BEHAVIORAL_KEYWORDS].some((k) => k.toLowerCase() === word.toLowerCase());
    if (known) continue;
    if (ABILITY_KEYWORDS[word] && isBuilt(ABILITY_KEYWORDS[word])) continue;
    missing.push({kind: "keyword", name: keyword, why: isKeyword(word.toLowerCase()) ? "declared, no behavior" : "not declared"});
  }
  return missing;
}
