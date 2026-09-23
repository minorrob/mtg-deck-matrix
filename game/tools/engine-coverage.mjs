/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* HOW MUCH OF ROB'S COLLECTION THE ENGINE CAN ACTUALLY PLAY, TODAY.
 *
 * `docs/engine/PLAN.md` §3.1 (`engine-coverage.mjs`: "which cards have definitions and tests, per
 * deck and for the library") and §6's phase 2.4.
 *
 * THE QUESTION IT ANSWERS IS NOT "how many cards have definitions" — the answer to that is zero
 * until phase 3, which is true and useless. It is: **for how many cards does the engine already
 * have every rule the card needs?** A card is within the engine's vocabulary when every effect,
 * trigger, static, replacement and keyword it uses is one the engine implements. That number can be
 * computed now, it moves every time a family lands, and it is the number that says how close a real
 * game is.
 *
 * It also produces the list that decides what to build next, the same way the measured top 25 did:
 * the constructs blocking the most cards, in order. Nobody has to guess which family matters.
 *
 * THE FORGE NAMES LIVE HERE, NOT IN THE ENGINE. `game/docs/engine-inventory.json` records what each
 * card needs in Forge's vocabulary, because Forge is the ruler the pool was measured with. ADR-001
 * keeps Forge out of `game/engine/` entirely, so the translation sits in this tool — the engine's
 * own vocabulary never learns Forge's words, and the measurement is done at the boundary. §12.2
 * already prints the same pairs, "with the Forge ruler in parentheses only to show the measurement".
 *
 *   node game/tools/engine-coverage.mjs           report
 *   node game/tools/engine-coverage.mjs --write   report, and write docs/engine/coverage.md
 */

import {readFileSync, writeFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {isPrimitive, isKeyword, isTriggerEvent, normalizeKeyword} from "../engine/vocabulary.mjs";
import {isBuilt} from "../engine/script/effects/index.mjs";
import {KEYWORD_FAMILIES} from "../engine/keywords/combat.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");

/* Forge's API names to the engine's primitives — §12.2's parenthesised pairs, as data. A name that
   is not here is reported as unmapped rather than silently counted as missing, because "the engine
   cannot do this" and "nobody has said what this is" are different problems. */
const FORGE_API = {
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
const FORGE_TRIGGER = {
  ChangesZone: "enters", ChangesZoneAll: "enters", Exiled: "exiled", Sacrificed: "sacrificed",
  Phase: "phase", Attacks: "attacks", AttackersDeclared: "attackers declared",
  AttackersDeclaredOneTarget: "attackers declared", Blocks: "blocks",
  SpellCast: "spell cast", DamageDone: "damage dealt", DamageDoneOnce: "damage dealt once",
  Discarded: "discarded", DiscardedAll: "discarded", Drawn: "drawn", LandPlayed: "land played",
  BecomesTarget: "becomes target", CounterAdded: "counter added", CounterAddedOnce: "counter added once",
  LifeGained: "life gained", TokenCreatedOnce: "token created", BecomeMonstrous: "becomes monstrous",
};

/* Keywords the engine implements BEHAVIORALLY, as opposed to merely declaring the word. Declaring
   `Flying` in the vocabulary is what lets a card script say it; `keywords/combat.mjs` is what makes
   a flier unblockable by the ground. Coverage has to mean the second — the whole reason this file
   exists is that the engine knew the word `Flying` for a week and did nothing with it. */
const BEHAVIORAL_KEYWORDS = new Set(Object.values(KEYWORD_FAMILIES).flat());


/* What a card needs that the engine has not got. Empty means the engine can play it. */
function missingFor(card) {
  const missing = [];
  for (const api of card.apis ?? []) {
    const primitive = FORGE_API[api];
    if (!primitive) { missing.push({kind: "api", name: api, why: "unmapped"}); continue; }
    if (!isBuilt(primitive) && !isPrimitive(primitive)) missing.push({kind: "api", name: primitive, why: "undeclared"});
    else if (!isBuilt(primitive)) missing.push({kind: "api", name: primitive, why: "declared, not built"});
  }
  for (const trigger of card.triggers ?? []) {
    const event = FORGE_TRIGGER[trigger];
    if (!event) { missing.push({kind: "trigger", name: trigger, why: "unmapped"}); continue; }
    if (!isTriggerEvent(event)) missing.push({kind: "trigger", name: event, why: "undeclared"});
  }
  /* Statics and replacements are counted but not yet resolvable to named constructs: the card
     script has to express them before "does the engine have this one" is a question with an answer.
     They are listed so the gap is visible rather than counted as covered. */
  for (const s of card.statics ?? []) missing.push({kind: "static", name: s, why: "statics arrive with the card script"});
  for (const r of card.replacements ?? []) missing.push({kind: "replacement", name: r, why: "replacements arrive with the card script"});
  for (const keyword of card.keywords ?? []) {
    const word = normalizeKeyword(keyword);
    const known = [...BEHAVIORAL_KEYWORDS].some((k) => k.toLowerCase() === word.toLowerCase());
    if (known) continue;
    missing.push({kind: "keyword", name: keyword, why: isKeyword(word.toLowerCase()) ? "declared, no behavior" : "not declared"});
  }
  return missing;
}

function report(label, perCard) {
  const entries = Object.entries(perCard ?? {});
  const covered = [];
  const blocked = new Map();
  for (const [name, card] of entries) {
    const missing = missingFor(card);
    if (missing.length === 0) { covered.push(name); continue; }
    for (const gap of missing) {
      const key = `${gap.kind}:${gap.name}`;
      if (!blocked.has(key)) blocked.set(key, {...gap, cards: 0});
      blocked.get(key).cards += 1;
    }
  }
  return {
    label,
    total: entries.length,
    covered: covered.length,
    share: entries.length === 0 ? 0 : (100 * covered.length) / entries.length,
    blockers: [...blocked.values()].sort((a, b) => b.cards - a.cards),
  };
}

const inventory = JSON.parse(readFileSync(path.join(REPO, "game", "docs", "engine-inventory.json"), "utf8"));
const scopes = [
  report("Rob's seven decks", inventory.deck?.perCard),
  report("the card library", inventory.library?.perCard),
];

const lines = [];
lines.push("# Engine coverage");
lines.push("");
lines.push("Generated by `node game/tools/engine-coverage.mjs --write`.");
lines.push("");
lines.push("**What this counts.** Not how many cards have definitions — that is zero until phase 3, which is");
lines.push("true and useless. It counts how many cards the engine already has *every rule for*: every");
lines.push("effect, trigger, static, replacement and keyword the card uses is one the engine implements.");
lines.push("A keyword counts only when it does something — declaring `Flying` is what lets a card script");
lines.push("say it, and `keywords/combat.mjs` is what makes a flier unblockable by the ground.");
lines.push("");
lines.push("| Scope | Cards | Playable now | Share |");
lines.push("| --- | ---: | ---: | ---: |");
for (const scope of scopes)
  lines.push(`| ${scope.label} | ${scope.total} | ${scope.covered} | ${scope.share.toFixed(1)}% |`);
lines.push("");

for (const scope of scopes) {
  lines.push(`## What blocks the rest — ${scope.label}`);
  lines.push("");
  lines.push("| Construct | Kind | Cards blocked | Why |");
  lines.push("| --- | --- | ---: | --- |");
  for (const gap of scope.blockers.slice(0, 20))
    lines.push(`| \`${gap.name}\` | ${gap.kind} | ${gap.cards} | ${gap.why} |`);
  lines.push("");
}

const text = lines.join("\n") + "\n";
console.log(text);
if (process.argv.includes("--write")) {
  writeFileSync(path.join(REPO, "docs", "engine", "coverage.md"), text);
  console.log("Wrote docs/engine/coverage.md");
}
