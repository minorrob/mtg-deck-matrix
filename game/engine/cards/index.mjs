/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE CARD DIRECTORY: WHAT THE ENGINE KNOWS ABOUT A CARD BY NAME.
 *
 * `docs/engine/PLAN.md` §3.1 and §6's phase 2.4 -- "`cards/index.mjs` with `resolve` and `suggest`", the same shape
 * as `forge-card-index.mjs`, reading CrankMagic's own definitions instead of Forge's scripts. Definitions live beside
 * it as `game/engine/cards/<letter>/<slug>.json` (`CrankCardScript@1`), each with its `<slug>.scenarios.json`;
 * `game/tools/engine-cards.mjs` reads them from disk, and this file, which touches no file system, is what a Worker
 * can import.
 *
 * A SCRIPT IS NOT YET AN OBJECT. The script says what the card says, in the vocabulary a model can be held to
 * ("enters", "upkeep", `{atom: "{T}"}`); the rules modules act on objects in their own terms (a trigger watching
 * `GameEventCardChangeZone`, a mana ability that `produces`). `compileScript` is the translation, and the only one:
 *   - a spell ability becomes the object's `spell`, which stack.mjs resolves;
 *   - "{T}: Add {G}" -- an activated ability with `{T}` as its whole cost, one fixed `addMana` and no target -- becomes
 *     a mana ability (CR 605.1a), which never uses the stack;
 *   - every other activated ability stays activated, and actions.mjs offers it;
 *   - a triggered ability's event is compiled to the engine event trigger.mjs watches;
 *   - keyword abilities become the object's keywords, in the rules modules' spelling;
 *   - statics and replacements pass through: their schema was written against layers.mjs and replacement.mjs.
 *
 * WHAT IT CANNOT PLAY, IT SAYS, BY NAME, BEFORE THE GAME (decision M4, 2026-09-25: "refused by name"). A script can
 * be perfectly valid and still use something the engine has not built -- a primitive declared and not implemented,
 * a keyword with no behavior, a cost atom nothing pays, a trigger whose targets nothing chooses yet. Each is a
 * PROBLEM, and a card with any problem has no definition: `definition(name)` is null and `problems(name)` says why.
 * A table refuses it at prepare, never on the turn it is drawn.
 */

import {ADDED_PHASES} from "../script/effects/permanents.mjs";
import {isCounted} from "../script/amount.mjs";
import {validateScript, SCRIPT_SCHEMA} from "../script/schema.mjs";
import {isBuilt, NEEDS_A_DECISION, EFFECTS, REPEAT_EACH} from "../script/effects/index.mjs";
import {KEYWORD_FAMILIES} from "../keywords/combat.mjs";
import {KEYWORD_FAMILIES as TIMING_FAMILIES} from "../keywords/timing.mjs";
import {KEYWORD_FAMILIES as TYPE_FAMILIES} from "../keywords/types.mjs";
import {KEYWORD_FAMILIES as DESIGNATION_FAMILIES} from "../keywords/designations.mjs";
import {costAtomBuilt} from "../rules/actions.mjs";
import {compileSelector} from "../script/filter.mjs";
import {LAYER_AFFECTS_KEYS} from "../rules/layers.mjs";
import {SPEND_ONLY_KEYS} from "../rules/restricted-mana.mjs";
import {parseManaCost} from "../rules/mana.mjs";

/** The keywords some rules module acts on, in its own spelling. A keyword not here is a word with no behavior. */
const KEYWORDS_WITH_BEHAVIOR = new Set([...Object.values(KEYWORD_FAMILIES), ...Object.values(TIMING_FAMILIES), ...Object.values(TYPE_FAMILIES), ...Object.values(DESIGNATION_FAMILIES)].flat());

/* A ward cost as "unless that player pays" asks it (effects/asking.mjs): `amount` generic mana, `life`, `discard` a
   card, `sacrifice` a permanent the selector describes. Null for a cost it cannot ask. */
function wardCost(cost) {
  if (!Array.isArray(cost) || !cost.length) return null;
  const unless = {};
  for (const atom of cost) {
    if (atom?.atom === "mana" && /^\{\d+\}$/.test(atom.cost ?? "")) unless.amount = Number(atom.cost.slice(1, -1));
    else if (atom?.atom === "payLife" && Number.isInteger(atom.amount)) unless.life = atom.amount;
    else if (atom?.atom === "discard" && atom.self !== true) unless.discard = 1;
    else if (atom?.atom === "sacrifice" && atom.selector && typeof atom.selector === "object") unless.sacrifice = structuredClone(atom.selector);
    else return null;
  }
  return unless;
}

/* The rule statics that read their own condition: an alternative cost's "if you control a commander" (rules/actions.mjs);
   an attack tax and "doesn't untap" "as long as" or "unless you have an enduring story" (rules/statics.mjs). */
const RULES_READING_A_CONDITION = ["alternative-cost", "spells-cost-less", "triggers-again", "cant-cast", "attack-tax", "doesnt-untap", "cast-without-paying"];

/* What a flashback cost may be made of (CR 702.34a): mana, life ("Flashback--{1}{U}, Pay 3 life"), and creatures to tap
   ("Flashback--Tap three untapped white creatures you control", Battle Screech: `tapCreature`, its `count` and `selector`). */
const FLASHBACK_ATOMS = ["mana", "payLife", "tapCreature"];
/* How long "you may play that card" lasts (script/effects/zones.mjs, mayPlay): this turn, or until the end of your next turn. */
const MAY_PLAY_UNTIL = ["end-of-turn", "your-next-end"];
/* What an evoke cost may be made of (CR 702.74a): what an alternative cost is paid with (rules/actions.mjs) -- mana
   ("Evoke {2}{U}", Mulldrifter), and a card exiled from the hand ("Evoke--Exile a red card from your hand", Fury). */
const EVOKE_ATOMS = ["mana", "payLife", "exileFromHand"];
/* What an escape cost is made of (CR 702.138a): mana, and "exile N other cards from your graveyard" (`exileFromGraveyard`,
   its `count`) -- every escape cost printed has both. */
export function escapeCostProblems(cost, {given = false} = {}) {
  const atoms = Array.isArray(cost) ? cost : [];
  const exile = atoms.filter((atom) => atom?.atom === "exileFromGraveyard");
  const problems = [];
  if (atoms.some((atom) => !["mana", "exileFromGraveyard"].includes(atom?.atom))) problems.push("an escape cost is mana and \"exile N other cards from your graveyard\" only");
  /* Given ("each nonland card in your graveyard has escape"), the mana is each card's own mana cost: only the cards to exile are said. */
  if (given ? atoms.some((atom) => atom?.atom === "mana") : atoms.filter((atom) => atom?.atom === "mana").length !== 1)
    problems.push(given ? "an escape given costs each card's own mana cost: its cost says only the cards to exile" : "an escape cost has its mana, once");
  if (exile.length !== 1 || !(Number.isInteger(exile[0].count) && exile[0].count >= 1)) problems.push("an escape cost exiles a number of other cards from the graveyard, 1 or more, once");
  return problems;
}

/* THE PARTNER ABILITIES (CR 702.124a), read from the card's own words: a deck rule a table holds a deck to
   (room/table.mjs), which the game itself never reads. Reminder text first goes, and "Partner with" is read whole --
   the name it gives may have a comma in it -- before a keyword line is split at its commas.
     {kind: "partner"}                 Partner (702.124h)
     {kind: "text", text}              Partner--Friends forever, --Survivors, --Father & son, --Character select (702.124i);
                                       the older "Friends forever" alone is the same ability
     {kind: "with", name}              Partner with [name] (702.124j)
     {kind: "background"}              Choose a Background (702.124k)
     {kind: "doctor"}                  Doctor's companion (702.124m) */
export function partnersIn(text) {
  const found = [];
  for (const line of String(text ?? "").replace(/\([^)]*\)/g, "").split("\n").map((l) => l.trim()).filter(Boolean)) {
    const withName = /^partner with (.+)$/i.exec(line);
    if (withName) { found.push({kind: "with", name: withName[1].trim()}); continue; }
    for (const part of line.split(",").map((p) => p.trim())) {
      const dashed = /^partner\s*[\u2014\u2013-]+\s*(.+)$/i.exec(part);
      if (dashed) found.push({kind: "text", text: dashed[1].trim().toLowerCase()});
      else if (/^friends forever$/i.test(part)) found.push({kind: "text", text: "friends forever"});
      else if (/^partner$/i.test(part)) found.push({kind: "partner"});
      else if (/^choose a background$/i.test(part)) found.push({kind: "background"});
      else if (/^doctor['\u2019]s companion$/i.test(part)) found.push({kind: "doctor"});
    }
  }
  return found;
}

/* The partner abilities a card script may name as keywords, each with what partnersIn reads from the card's words: Partner
   and a named one ("Partner--Character select"), and Choose a Background. Not yet "Partner with [name]", which is also a
   trigger as the card enters (702.124j), nor Doctor's companion. */
const DECK_RULES = {
  partner: {name: "Partner", kinds: ["partner", "text"]},
  "choose a background": {name: "Choose a Background", kinds: ["background"]},
};

/* "first strike" in the script's vocabulary is "First Strike" to the rules modules. */
const titleCase = (word) => String(word).split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

/* A script's trigger, in the engine's events. The script names the event in the vocabulary's words; `who: "self"` is
   "when THIS enters", `yours: true` is "at the beginning of YOUR upkeep". */
const ARRIVALS = ["self", "another", "any"];
/* The steps whose beginning a card may name (rules/turn.mjs announces each as it arrives). */
const STEPS = ["UPKEEP", "DRAW", "MAIN1", "COMBAT_BEGIN", "MAIN2", "END_OF_TURN"];
/* "Whenever this deals combat damage to a player": `who` the source, `combat`, `to` player or opponent (CR 510.2); `to:
   "self"`, damage dealt to this permanent. */
const damageDealt = (t) => (t.to === "self" ? {on: "GameEventCardDamaged", to: "self", ...(t.combat ? {combat: true} : {})}
    /* "Whenever a Dragon you control is dealt damage", "whenever a creature is dealt damage", "whenever enchanted creature
       is dealt damage": `to` "creature" (`filter` what was dealt it) or "enchanted"; about the creature dealt it. */
    : t.to === "creature" || t.to === "enchanted" ? {on: "GameEventCardDamaged", to: t.to, ...(t.filter ? {filter: t.filter} : {}), ...(t.combat ? {combat: true} : {})}
    : ARRIVALS.includes(t.who ?? "self") && ["player", "opponent"].includes(t.to ?? "player")
    ? {on: "GameEventPlayerDamaged", who: t.who ?? "self", to: t.to ?? "player", ...(t.combat ? {combat: true} : {}), ...(t.noncombat ? {noncombat: true} : {}), ...(t.sourceYours ? {sourceYours: true} : {}), ...(t.filter ? {filter: t.filter} : {}),
      /* "Deals combat damage to a player or planeswalker" (Grateful Apparition): damage dealt to a planeswalker counts
         too, about its controller (rules/trigger.mjs). */
      ...(t.planeswalkers === true ? {planeswalkers: true} : {})} : null);

const TRIGGERS = {
  /* "When this enters", "whenever another creature enters", "whenever a creature you control enters": `filter` is the
     selector the arrival must match. */
  enters: (t) => (ARRIVALS.includes(t.who ?? "self")
    ? {on: "GameEventCardChangeZone", to: "Battlefield", who: t.who ?? "self", ...(t.filter ? {filter: t.filter} : {}),
      /* "When this land enters untapped" (Mystic Sanctuary): not when it entered tapped (rules/trigger.mjs). */
      ...(t.untapped ? {untapped: true} : {}),
      /* "When this creature enters from your hand" (Thousand-Faced Shadow): the zone it came from (rules/trigger.mjs). */
      ...(t.from ? {from: t.from[0].toUpperCase() + t.from.slice(1)} : {})} : null),
  /* "Whenever you create one or more creature tokens" (Staff of the Storyteller): a token is put onto the battlefield only
     by being created, under its creator's control unless the effect says otherwise (CR 111.1, 111.2), and one that leaves
     never returns (111.8) -- so it is a token's arrival under your control, of the kind `filter` says; "one or more" is
     `batch`, once for all made at once. */
  "token created": (t) => ({on: "GameEventCardChangeZone", to: "Battlefield", who: "any",
    filter: {...(t.filter ?? {}), token: true, controller: "you"}}),
  /* "When this dies", "whenever another creature you control dies", "whenever this or another creature dies": `filter`
     read as the thing last existed (CR 603.10a). */
  dies: (t) => (ARRIVALS.includes(t.who ?? "self")
    ? {on: "GameEventCardChangeZone", from: "Battlefield", to: "Graveyard", who: t.who ?? "self", ...(t.filter ? {filter: t.filter} : {})} : null),
  /* "Whenever a token you control leaves the battlefield" (Nadier's Nightblade): to anywhere, `filter` read as it last
     existed (CR 603.10a). */
  leaves: (t) => (ARRIVALS.includes(t.who ?? "self")
    ? {on: "GameEventCardChangeZone", from: "Battlefield", who: t.who ?? "self", ...(t.filter ? {filter: t.filter} : {})} : null),
  /* "Whenever one or more permanent cards are put into your graveyard from anywhere" (Moonshadow): a card arriving in a
     graveyard, from any zone, read as the card it became there -- a token is no card (CR 108.2b) -- `owner` whose
     graveyard (a card goes to its owner's, CR 400.3), `filter` what the card must be. "One or more" is `batch`. */
  "put into graveyard": (t) => (["you", "opponent", "any"].includes(t.owner ?? "you")
    ? {on: "GameEventCardChangeZone", to: "Graveyard", intoGraveyard: true, owner: t.owner ?? "you", ...(t.filter ? {filter: t.filter} : {})} : null),
  /* "Whenever one or more cards leave your graveyard" (Garrison Excavator): to any zone, a card cast from it included. */
  "left graveyard": (t) => (["you", "opponent", "any"].includes(t.owner ?? "you") && !t.filter
    ? {on: "GameEventCardChangeZone", from: "Graveyard", leftGraveyard: true, owner: t.owner ?? "you"} : null),
  upkeep: (t) => ({on: "GameEventTurnPhase", phase: "UPKEEP", ...(t.yours === false ? {} : {yourTurn: true})}),
  /* "Whenever you cast a noncreature spell", "whenever an opponent casts a spell": `caster` you, opponent or any;
     `filter` the spell (CR 601.2i). */
  "spell cast": (t) => ({on: "GameEventSpellAbilityCast", caster: t.caster ?? "you", ...(t.filter ? {filter: t.filter} : {}), ...(t.firstThisTurn ? {firstThisTurn: true} : {}),
    /* "Their second spell each turn" (Monologue Tax): the caster's Nth this turn the filter fits. */
    ...(Number.isInteger(t.nthThisTurn) && t.nthThisTurn >= 2 ? {nthThisTurn: t.nthThisTurn} : {}),
    /* "From your hand" (Jodah): where it was cast from (rules/actions.mjs). */
    ...(t.from ? {castFrom: t.from} : {}),
    /* "For each other instant and sorcery spell you've cast before it this turn": counted as it triggers. */
    ...(t.countBefore ? {countBefore: true} : {}),
    /* "An instant or sorcery spell that targets a creature" (Rehearsed Debater): what one of its targets is (rules/trigger.mjs). */
    ...(t.targets ? {targets: t.targets} : {})}),
  /* "Whenever one or more +1/+1 counters are put on Berta" (CR 122.1): counters of `counter` put on this permanent, once
     for each time they are put on, however many. */
  "counter added": (t) => ((t.who ?? "self") === "self" && typeof t.counter === "string" ? {on: "GameEventCardCounters", counterAdded: true, counter: t.counter} : null),
  /* "Whenever you scry or surveil" (Proft, Consulting Detective; CR 701.22a, 701.25a): once each is done, by `scrier`. */
  scried: (t) => ({on: "GameEventScried", scrier: t.scrier ?? "you"}),
  /* "Whenever you activate a loyalty ability" (Ajani Unrelenting; CR 606, 602.2): a loyalty ability put on the stack by
     you (`activator`), any permanent's; "if you removed two or more loyalty counters to activate it" (`removedAtLeast`,
     its cost, CR 606.4). About the permanent and the player. */
  "loyalty activated": (t) => ({on: "GameEventSpellAbilityCast", loyaltyActivated: true, activator: t.activator ?? "you",
    ...(Number.isInteger(t.removedAtLeast) && t.removedAtLeast >= 1 ? {removedAtLeast: t.removedAtLeast} : {})}),
  /* "Whenever you attack" (CR 508.1): the attack as a whole, once, about the attacking player; "whenever you attack a player"
     (`each: "defender"`): once for each player attacked; "with two or more creatures" (`atLeast`); "if none of those
     creatures attacked you" (`notAttacking: "you"`); "with one or more non-Gnome creatures", "whenever one or more Goblins
     you control attack" (`filter`: an attacker it fits, one at least). `attacker`: you, opponent ("another player") or any. */
  "attackers declared": (t) => ({on: "GameEventAttackersDeclared", declared: true, attacker: t.attacker ?? "you", ...(t.atLeast ? {atLeast: t.atLeast} : {}),
    ...(t.each === "defender" ? {eachDefender: true} : {}), ...(t.notAttacking ? {notAttacking: t.notAttacking} : {}), ...(t.filter ? {filter: t.filter} : {}),
    /* "Whenever a player attacks one of your opponents" (Combat Calligrapher; CR 508.3e): once for each opponent of this
       ability's controller attacked (`each: "defender"`, `defender: "opponent"`), about that player and the attacking one. */
    ...(t.each === "defender" && t.defender === "opponent" ? {defender: "opponent"} : {})}),
  /* "Whenever this creature attacks", "whenever a creature you control attacks": once per attacker (CR 508.1m). */
  attacks: (t) => (ARRIVALS.includes(t.who ?? "self") ? {on: "GameEventAttackersDeclared", who: t.who ?? "self", ...(t.filter ? {filter: t.filter} : {}),
    /* "Attack one of your opponents" -- "or a planeswalker they control" (`planeswalkers`, CR 506.3); "attacks with three or
       more creatures" (rules/trigger.mjs). */
    ...(t.defender ? {defender: t.defender} : {}), ...(t.planeswalkers === true ? {planeswalkers: true} : {}), ...(t.atLeast ? {atLeast: t.atLeast} : {}),
    /* "Whenever Aurelia attacks for the first time each turn" (rules/trigger.mjs). */
    ...(t.firstTime ? {firstTime: true} : {})} : null),
  /* "Whenever this creature becomes the target of a spell" (Goldspan Dragon), "whenever a Dragon you control becomes the
     target of a spell or ability an opponent controls" (Thunderbreak Regent): `who` and `filter` what was targeted, `by`
     whose spell or ability (any, or opponent), `spell` a spell's only (CR 115.1, batch 76). About what was targeted and
     the player who targeted it -- "that player" -- and its stack entry ("counter that spell or ability"). */
  "becomes target": (t) => (ARRIVALS.includes(t.who ?? "self") && ["any", "opponent"].includes(t.by ?? "any")
    ? {on: "GameEventBecomesTarget", who: t.who ?? "self", ...(t.filter ? {filter: t.filter} : {}), ...(t.by === "opponent" ? {by: "opponent"} : {}), ...(t.spell ? {spell: true} : {})} : null),
  /* "Whenever this deals combat damage to a player": `who` the source, `combat`, `to` player or opponent (CR 510.2). */
  "damage dealt": (t) => damageDealt(t),
  /* "Whenever one or more creatures you control deal combat damage to a player", Enrage's "whenever this creature is dealt
     damage" (Forge's DamageDoneOnce): the same, once for everything one action did -- per player dealt it (trigger.mjs). */
  "damage dealt once": (t) => { const once = damageDealt(t); return once ? {...once, batch: true} : null; },
  /* "Whenever you draw a card", "whenever an opponent draws a card" (CR 121.1): `drawer`. */
  drawn: (t) => ({on: "GameEventCardChangeZone", from: "Library", to: "Hand", drawn: true, drawer: t.drawer ?? "you"}),
  /* "Whenever you gain life" (CR 119.9): `gainer` you, opponent or any. */
  "life gained": (t) => ({on: "GameEventPlayerLivesChanged", gainer: t.gainer ?? "you"}),
  /* "Whenever an opponent loses life", "whenever you lose life" (CR 119.3, batch 78): `loser` you, opponent or any; about
     the player and how much -- once for each player for everything one action took (combat damage from three creatures
     at once is one loss), "that much" all of it. */
  "life lost": (t) => ({on: "GameEventPlayerLivesChanged", loser: t.loser ?? "you", batch: true}),
  /* "Whenever you tap a land for mana", "whenever enchanted land is tapped for mana", "whenever you tap this land for mana",
     "whenever you tap a permanent for {C}" (CR 605.1b): `tapper` you, opponent or any; `filter` what was tapped, `self`,
     `enchanted`; `produced` a kind of mana it made (rules/trigger.mjs). */
  "tapped for mana": (t) => ({on: "GameEventManaPool", tapper: t.tapper ?? "you", ...(t.filter ? {filter: t.filter} : {}), ...(t.who === "self" ? {self: true} : {}),
    ...(t.enchanted ? {enchanted: true} : {}), ...(t.produced ? {produced: t.produced} : {})}),
  /* "Whenever this creature becomes tapped" (Silvergill Peddler; CR 701.26a): `who` and `filter` what was tapped -- by
     attacking, a cost or an effect; one that enters tapped never became tapped. */
  "becomes tapped": (t) => (ARRIVALS.includes(t.who ?? "self") ? {on: "GameEventCardTapped", who: t.who ?? "self", ...(t.filter ? {filter: t.filter} : {})} : null),
  /* "Whenever you discard a card", "whenever an opponent discards a land card" (CR 701.9): `discarder` you, opponent or
     any; `filter` the card discarded. */
  discarded: (t) => ({on: "GameEventCardChangeZone", to: "Graveyard", discarded: true, discarder: t.discarder ?? "you", ...(t.filter ? {filter: t.filter} : {})}),
  /* "When you cycle this card" (`who: "self"`, CR 702.29c) and "whenever you cycle a card" (`who: "any"`, `cycler`): a card
     discarded to pay a cycling cost (rules/actions.mjs). Not yet "whenever you cycle a creature card" (a filter). */
  cycled: (t) => (["self", "any"].includes(t.who ?? "self") && !t.filter
    ? {on: "GameEventCardChangeZone", to: "Graveyard", cycled: true, who: t.who ?? "self", cycler: t.cycler ?? "you"} : null),
  "end step": (t) => ({on: "GameEventTurnPhase", phase: "END_OF_TURN", ...(t.yours === false ? {} : {yourTurn: true})}),
  /* "Whenever you sacrifice a permanent", "whenever a player sacrifices another permanent" (CR 701.21): `sacrificer` you,
     opponent or any; `filter` what it was; `another`, not this one. */
  /* A Saga's chapter (CR 714.2c): "I" as the Saga enters with its first lore counter (CR 714.3a); "II" and on as a lore
     counter brings it from below that number to it (rules/trigger.mjs). `chapter` names it for the sacrifice (rules/sba.mjs). */
  chapter: (t) => (!(Number.isInteger(t.chapter) && t.chapter >= 1) ? null : t.chapter === 1 ? {on: "GameEventCardChangeZone", to: "Battlefield", who: "self", chapter: 1}
    : {on: "GameEventCardCounters", counter: "lore", reaches: t.chapter, chapter: t.chapter}),
  sacrificed: (t) => ({on: "GameEventCardChangeZone", from: "Battlefield", sacrificed: true, sacrificer: t.sacrificer ?? "you", ...(t.filter ? {filter: t.filter} : {}), ...(t.another ? {another: true} : {})}),
  /* "At the beginning of each player's draw step", "of your first main phase", "of combat on your turn": the beginning of
     a step (CR 503-513), yours unless `yours: false`. */
  step: (t) => (STEPS.includes(t.step) ? {on: "GameEventTurnPhase", phase: t.step, ...(t.yours === false ? {} : {yourTurn: true})} : null),
};

/** The trigger kinds a card script may name, each compiled to the event trigger.mjs watches (the catalog reads it). */
export const TRIGGER_KINDS = Object.freeze(Object.keys(TRIGGERS));

/** Fold a name for matching: case, accents, punctuation and spacing do not make a different card. */
export function foldName(name) {
  return String(name ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9/ ]+/g, "").replace(/\s+/g, " ").trim();
}

/* Every effect, nested ones included, for checking what a script asks of the engine. */
function effectsIn(list, out = []) {
  for (const effect of list ?? []) {
    if (!effect || typeof effect !== "object") continue;
    out.push(effect);
    effectsIn(effect.effects, out);
    for (const mode of effect.modes ?? []) effectsIn(mode.effects, out);
    effectsIn(effect.then, out);
    effectsIn(effect.otherwise, out);
  }
  return out;
}

/* "{T}: Add {G}." -- CR 605.1a: an activated ability without a target that could add mana is a mana ability, and the
   engine runs it off the stack. What it adds is the script's `addMana`, the first effect: a fixed `mana`, a `choice`
   ("{W} or {U}"), or `anyColor` (true, or "identity" for your commander's color identity), `count` of it. Its cost
   may be {T}, mana and life; anything after the mana (a pain land's damage to you) happens with it, at once. Anything
   else that adds mana -- a sacrifice, a target, a question -- is a problem until it is built. */
const MANA = (m) => m && typeof m === "object" && !Array.isArray(m) && Object.keys(m).length > 0
  && Object.entries(m).every(([color, n]) => /^[WUBRGC]$/.test(color) && ((Number.isInteger(n) && n > 0) || isCounted(n)));
function manaAbility(ability, id) {
  if (ability.kind !== "activated") return null;
  /* CR 605.1a: an ability that targets is not a mana ability, whatever it adds -- it goes on the stack like any other, and
     the mana is added as it resolves ("Any number of target players each lose 2 life ... You add {B}{B}", Priest of
     Forgotten Gods). */
  if ((ability.targets ?? []).length) return null;
  /* Nor is a loyalty ability (CR 605.1a): "[+1]: Add {R}" (Way of the Pyromancer) goes on the stack, at sorcery speed. */
  if ((ability.cost ?? []).some((a) => a?.atom === "loyalty")) return null;
  const [first, ...then] = ability.effects ?? [];
  if (first?.effect !== "addMana") return (ability.effects ?? []).some((e) => e?.effect === "addMana") ? "unbuilt" : null;
  const cost = ability.cost ?? [];
  if ((ability.targets ?? []).length || !cost.every((a) => ["{T}", "mana", "payLife"].includes(a?.atom) || (a?.atom === "sacrifice" && (a.self === true || a.selector))
    || (["addCounters", "removeCounters"].includes(a?.atom) && a.self === true && typeof a.counter === "string"))) return "unbuilt";
  /* "Put a -0/-1 counter on this creature: Add {G}" (Wall of Roots), "Remove five +1/+1 counters from Ramos: Add ...". */
  const counterCost = cost.filter((a) => ["addCounters", "removeCounters"].includes(a.atom)).map((a) => ({counter: a.counter, count: a.count ?? 1, put: a.atom === "addCounters"}));
  if (then.some((e) => !isBuilt(e?.effect) || NEEDS_A_DECISION.includes(e?.effect))) return "unbuilt";
  const adds = MANA(first.mana) ? {produces: {...first.mana}}
    : Array.isArray(first.choice) && first.choice.length > 1 && first.choice.every(MANA) ? {produces: first.choice.map((m) => ({...m}))}
    : first.anyColor === true || first.anyColor === "identity" ? {anyColor: first.anyColor, ...(first.count ? {count: first.count} : {})}
    /* "Add one mana of the chosen color" (Night Market): the color its permanent chose as it entered (rules/actions.mjs). */
    : first.chosenColor === true ? {chosenColor: true, ...(first.count ? {count: first.count} : {})}
    /* "Any color that a land an opponent controls could produce", "any color among legendary creatures you control"
       (rules/actions.mjs, manaAlternatives): read as it is activated. */
    : first.reflect && typeof first.reflect === "object" ? {reflect: first.reflect, ...(first.anyType ? {anyType: true} : {}), ...(first.count ? {count: first.count} : {})}
    : first.among && typeof first.among === "object" ? {among: first.among, ...(first.count ? {count: first.count} : {})}
    /* "Two mana in any combination of colors" (Great Hall of the Citadel). */
    /* "In any combination of {U} and/or {R}" (Vivi Ornitier): the colors it may be. */
    : first.anyCombination === true || (Array.isArray(first.anyCombination) && first.anyCombination.length > 0 && first.anyCombination.every((c) => ["W", "U", "B", "R", "G"].includes(c)))
      ? {anyCombination: first.anyCombination, ...(first.count ? {count: first.count} : {})}
    : null;
  if (!adds) return "unbuilt";
  /* "Spend this mana only to cast a creature spell of the chosen type" (CR 106.6; rules/restricted-mana.mjs): a spell or
     an ability's source it may pay for, each a selector, and "that spell can't be countered" -- read as every addMana's
     is, where the compiler walks an ability's effects. */
  const mana = cost.find((a) => a.atom === "mana");
  const life = cost.filter((a) => a.atom === "payLife").reduce((n, a) => n + (a.amount ?? 0), 0);
  return {id, kind: "mana", tapSelf: cost.some((a) => a.atom === "{T}"), ...adds, text: ability.text,
    ...(mana ? {cost: mana.cost} : {}), ...(life ? {payLife: life} : {}), ...(then.length ? {then} : {}),
    ...(cost.some((a) => a.atom === "sacrifice" && a.self === true) ? {sacrificeSelf: true} : {}),
    /* "Sacrifice a creature: Add {C}{C}" (Ashnod's Altar): which creature is the player's choice, one offer each. */
    ...(cost.find((a) => a.atom === "sacrifice" && a.selector) ? {sacrifice: cost.find((a) => a.atom === "sacrifice" && a.selector).selector} : {}),
    /* "Activate only if you control a Swamp" (CR 602.5b; script/condition.mjs). */
    ...(ability.condition ? {condition: ability.condition} : {}),
    ...(counterCost.length ? {counterCost} : {}), ...(ability.limit ? {limit: ability.limit} : {}),
    ...(first.spendOnly ? {spendOnly: first.spendOnly} : {})};
}
function spendOnlyValid(only) {
  if (!only || typeof only !== "object" || Array.isArray(only) || !Object.keys(only).every((k) => SPEND_ONLY_KEYS.includes(k))) return false;
  if (!only.spell && !only.ability) return false;
  if ("uncounterable" in only && only.uncounterable !== true) return false;
  try { if (only.spell) compileSelector({...only.spell, what: "card"}); if (only.ability) compileSelector({...only.ability, what: "permanent"}); } catch { return false; }
  return true;
}

/* "WHEN THAT CREATURE DIES THIS TURN" (CR 603.7): a delayed trigger that waits for an event says so in a triggered
   ability's words (`when`, compiled by TRIGGERS), with `who` the object it waits on when that is a target, "that card"
   or "self" -- remembered as the trigger is made (`watch`, effects/permanents.mjs) -- and `thisTurn` for one that lasts
   the turn (CR 603.7b). One that waits for a moment says `at`: "end step" or "upkeep". */
const DELAYED_MOMENTS = ["end step", "upkeep"];
function withDelayedTriggers(abilities, problems) {
  const walk = (effect) => {
    if (!effect || typeof effect !== "object") return effect;
    let out = {...effect};
    if (out.effect === "delayedTrigger") {
      if (out.when) {
        const {when, ...rest} = out;
        const named = when.who !== undefined && !ARRIVALS.includes(when.who);
        const compile = TRIGGERS[when.on];
        const on = compile ? compile({...when, who: named ? "any" : when.who}) : null;
        if (!on) problems.push(`${when.on}: a delayed trigger the engine does not watch for yet`);
        out = {...rest, on: on ?? {on: null}, ...(named ? {watch: when.who} : {})};
      } else if (!DELAYED_MOMENTS.includes(out.at ?? "end step")) problems.push(`${out.at}: a moment no delayed trigger waits for yet`);
    }
    for (const key of ["effects", "then", "otherwise"]) if (Array.isArray(out[key])) out[key] = out[key].map(walk);
    if (Array.isArray(out.modes)) out.modes = out.modes.map((mode) => ({...mode, effects: (mode.effects ?? []).map(walk)}));
    return out;
  };
  return abilities.map((ability) => (Array.isArray(ability.effects) ? {...ability, effects: ability.effects.map(walk)} : ability));
}

/**
 * A script as the object the engine holds, or the reasons it cannot be one yet.
 *
 * @returns {{definition: ?object, problems: string[]}}
 */
/* GRANTED ABILITIES (Forge's AddAbility, batch 76): what a layer-6 static gives ("lands you control have '{T}: Add one
   mana of any color'", "other creatures you control have 'Ward--Pay 2 life'") or a pump gives until end of turn ("target
   creature gains 'When this creature dies, return it to the battlefield ...'"), compiled as a card's own abilities are:
   activated (a mana ability among them), triggered, and keyword abilities -- a keyword that is an ability (ward) given
   as both. A static or replacement ability given is refused: nothing gathers one from a grant yet. */
const GRANT_IDENTITY = Object.freeze({name: "A granted ability", oracleId: "granted", types: ["Creature"]});
const GRANTABLE = ["activated", "triggered", "keyword"];
function compileGrant(list, text, problems) {
  if (!Array.isArray(list) || !list.length) { problems.push(`${text}: the abilities given are a list, with at least one`); return null; }
  for (const ability of list) if (!GRANTABLE.includes(ability?.kind)) problems.push(`${text}: a ${ability?.kind ?? "nameless"} ability given -- only ${GRANTABLE.join(", ")} abilities are given yet`);
  const {definition, problems: inner} = compileScript({schema: SCRIPT_SCHEMA, identity: GRANT_IDENTITY, oracleText: "", abilities: list});
  problems.push(...inner.map((problem) => `${text}: ${problem}`));
  return definition ? {abilities: definition.abilities, keywords: definition.keywords} : null;
}
/* A pump's `abilities`, compiled wherever an ability's effects hold one, nested or in a mode -- in place, on the
   compiler's own copies of the effects (withDelayedTriggers copies each), never the script's. */
function compileGivenIn(effects, text, problems) {
  for (const effect of effectsIn(effects)) {
    if (effect.abilities === undefined) continue;
    if (effect.effect !== "pump") problems.push(`${text}: ${effect.effect} gives no abilities; a pump does`);
    const given = compileGrant(effect.abilities, text, problems);
    if (given) { effect.abilities = given.abilities; if (given.keywords.length) effect.keywords = [...(effect.keywords ?? []), ...given.keywords]; }
  }
}

export function compileScript(script) {
  const {valid, errors} = validateScript(script);
  if (!valid) return {definition: null, problems: errors.map((e) => `${e.path}: ${e.message}`)};

  const problems = [];
  const identity = script.identity;
  const abilities = [];
  const keywords = [];
  let spell = null;

  /* "ENCHANT CREATURE" (CR 702.5, 303.4): an Aura spell targets what it will enchant, and the permanent may be attached
     only to what the same words describe. One keyword ability, `target` its selector; `hostile` when the Aura is a
     curse (Pacifism), so a pilot aims it at an opponent's creature. */
  let enchant = null;
  withDelayedTriggers(script.abilities, problems).forEach((ability, index) => {
    const id = ability.id ?? `a${index}`;
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "enchant") {
      if (!ability.target || typeof ability.target !== "object") { problems.push(`${ability.text}: Enchant says what it may enchant, as a selector in \`target\``); return; }
      try { compileSelector(ability.target.anyOf ? ability.target.anyOf[0] : ability.target); } catch (error) { problems.push(`${ability.text}: ${error.message}`); return; }
      enchant = {target: ability.target, text: ability.text, hostile: ability.hostile === true};
      return;
    }
    /* WARD (CR 702.21a): "Whenever this permanent becomes the target of a spell or ability an opponent controls, counter
       it unless that player pays [cost]." The keyword IS that triggered ability: its cost a list of atoms -- generic
       mana, life, a card to discard, a permanent to sacrifice -- asked of that player as "unless" is (unlessPays), and
       "counter it" the stack entry it is about, spell or ability. */
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "ward") {
      const unless = wardCost(ability.cost);
      if (!unless) problems.push(`${ability.text}: a ward cost of generic mana, life, a discard or a sacrifice, and at least one`);
      abilities.push({id, kind: "triggered", text: ability.text, trigger: {on: "GameEventBecomesTarget", who: "self", by: "opponent"},
        effects: [{effect: "unlessPays", who: "that player", ...(unless ?? {}), effects: [{effect: "counterSpell", stack: "that"}]}]});
      keywords.push("Ward");
      return;
    }
    /* CREW (CR 702.122a): "Crew N: Tap any number of other untapped creatures you control with total power N or more: This
       Vehicle becomes an artifact creature until end of turn" -- an activated ability with the `crew` cost atom; the
       Vehicle keeps its printed power and toughness (CR 301.7b). */
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "crew") {
      if (!(Number.isInteger(ability.amount) && ability.amount >= 0)) problems.push(`${ability.text}: crew needs its number`);
      if (!(identity.subtypes ?? []).includes("Vehicle")) problems.push(`${ability.text}: crew on a card that is not a Vehicle`);
      abilities.push({id, kind: "activated", text: ability.text, cost: [{atom: "crew", power: ability.amount ?? 0}],
        effects: [{effect: "animate", targets: "self", addTypes: ["Creature"], until: "end-of-turn"}]});
      keywords.push("Crew");
      return;
    }
    /* A SAGA'S REMINDER LINE (CR 714.3a): "As this Saga enters and after your draw step, add a lore counter" -- the lore
       counter it enters with; the one after the draw step is rules/turn.mjs's, and "sacrifice after III" rules/sba.mjs's. */
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "saga") {
      if (!(identity.subtypes ?? []).includes("Saga")) problems.push(`${ability.text}: a Saga's lore counter on a card that is not a Saga`);
      abilities.push({id, kind: "replacement", text: ability.text, watches: {event: "enters", who: "self"}, change: {entersWithCounters: {counter: "lore", count: 1}}});
      return;
    }
    /* STATION (CR 702.184a): "Tap another untapped creature you control: Put a number of charge counters on this permanent
       equal to the tapped creature's power. Activate only as a sorcery" -- the `tapCreature` cost atom, the creature tapped
       being what the ability is about (rules/actions.mjs). What it has at "N+" (CR 721.2) is the card's own abilities, each
       on the condition `selfCounters` (script/condition.mjs). */
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "station") {
      if (!["Spacecraft", "Planet"].some((t) => (identity.subtypes ?? []).includes(t))) problems.push(`${ability.text}: station on a card that is not a Spacecraft or a Planet`);
      abilities.push({id, kind: "activated", text: ability.text, timing: "sorcery", cost: [{atom: "tapCreature", selector: {types: ["Creature"]}}],
        effects: [{effect: "putCounter", targets: "self", counter: "charge", count: {powerOf: "that card"}}]});
      keywords.push("Station");
      return;
    }
    /* NINJUTSU (CR 702.49a): "{cost}, Return an unblocked attacking creature you control to its owner's hand: Put this card
       onto the battlefield from your hand tapped and attacking" -- an ability of the card in its owner's hand, attacking
       whom the returned creature attacked (rules/actions.mjs remembers it as the ability goes on the stack). */
    /* COMMANDER NINJUTSU (CR 702.49d; Yuriko, batch 79): the same ability, which also works while the card is in the
       command zone (`alsoCommand`, rules/actions.mjs). */
    if (ability.kind === "keyword" && ["ninjutsu", "commander ninjutsu"].includes(String(ability.keyword).toLowerCase())) {
      const cost = Array.isArray(ability.cost) ? ability.cost : [];
      if (!cost.length || !cost.every((atom) => atom?.atom === "mana")) problems.push(`${ability.text}: a ninjutsu cost of mana`);
      abilities.push({id, kind: "activated", zone: "hand", text: ability.text, ...(String(ability.keyword).toLowerCase() === "commander ninjutsu" ? {alsoCommand: true} : {}),
        cost: [...structuredClone(cost), {atom: "returnToHand", selector: {what: "permanent", types: ["Creature"], controller: "you", attacking: true, unblocked: true}}],
        effects: [{effect: "moveZone", targets: "self", to: "battlefield", tapped: true, attacking: "that player"}]});
      keywords.push("Ninjutsu");
      return;
    }
    /* TOXIC N (CR 702.164a, batch 77): "players dealt combat damage by this creature also get N poison counters" -- a
       static ability kept with its number, read as combat damage is dealt (rules/combat.mjs); instances add (702.164b). */
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "toxic") {
      if (!(Number.isInteger(ability.amount) && ability.amount >= 1)) problems.push(`${ability.text}: toxic needs its number, 1 or more`);
      abilities.push({id, kind: "static", rule: "toxic", text: ability.text, amount: ability.amount ?? 0, affects: {what: "permanent", self: true}});
      keywords.push("Toxic");
      return;
    }
    /* AFTERLIFE N (CR 702.135a): the keyword IS a triggered ability -- as the creature dies, N 1/1 white and black Spirit
       tokens with flying (Ministrant of Obligation). */
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "afterlife") {
      if (!(Number.isInteger(ability.amount) && ability.amount >= 1)) problems.push(`${ability.text}: afterlife needs its number, 1 or more`);
      abilities.push({id, kind: "triggered", text: ability.text, trigger: TRIGGERS.dies({who: "self"}),
        effects: [{effect: "createToken", count: ability.amount ?? 1, token: {name: "Spirit", types: ["Creature"], subtypes: ["Spirit"], colors: ["W", "B"], power: 1, toughness: 1, keywords: ["Flying"]}}]});
      keywords.push("Afterlife");
      return;
    }
    /* PROWESS (CR 702.108a, batch 77): "Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn"
       -- the keyword IS that triggered ability. */
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "prowess") {
      abilities.push({id, kind: "triggered", text: ability.text, trigger: TRIGGERS["spell cast"]({caster: "you", filter: {nonTypes: ["Creature"]}}),
        effects: [{effect: "pump", targets: "self", power: 1, toughness: 1}]});
      keywords.push("Prowess");
      return;
    }
    /* INCREMENT (the live-game plan of 2026-10-04; Berta, Wise Extrapolator): "Whenever you cast a spell, if the amount of
       mana you spent is greater than this creature's power or toughness, put a +1/+1 counter on this creature" -- the
       keyword IS that triggered ability, its "if" an intervening one (CR 603.4): the mana spent on that spell (CR 601.2h),
       greater than the lesser of the two. */
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "increment") {
      abilities.push({id, kind: "triggered", text: ability.text, trigger: TRIGGERS["spell cast"]({caster: "you"}),
        condition: {compare: {count: {manaSpent: "that card"}, moreThan: {lesserOf: [{powerOf: "self"}, {toughnessOf: "self"}]}}},
        effects: [{effect: "putCounter", targets: "self", counter: "+1/+1", count: 1}]});
      keywords.push("Increment");
      return;
    }
    /* DEVOID (CR 702.114a, batch 77): "this object is colorless" in every zone -- the card's colors none, as its identity
       must say (keywords/types.mjs). */
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "devoid") {
      if ((identity.colors ?? []).length) problems.push(`${ability.text}: devoid on a card whose identity has a color`);
      keywords.push("Devoid");
      return;
    }
    /* ANNIHILATOR N (CR 702.86a, batch 78): "Whenever this creature attacks, defending player sacrifices N permanents of
       their choice" -- the keyword IS that triggered ability; the defending player is the one it attacks ("that player"). */
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "annihilator") {
      if (!(Number.isInteger(ability.amount) && ability.amount >= 1)) problems.push(`${ability.text}: annihilator needs its number, 1 or more`);
      abilities.push({id, kind: "triggered", text: ability.text, trigger: TRIGGERS.attacks({who: "self"}),
        effects: [{effect: "sacrifice", who: "that player", count: ability.amount ?? 0, selector: {what: "permanent"}}]});
      keywords.push("Annihilator");
      return;
    }
    /* STORM (CR 702.40a): kept on the card as a static ability, read as the spell is cast (rules/actions.mjs). Only on an
       instant or sorcery here -- an Aura's storm copies become tokens, and that card has more the engine lacks. */
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "storm") {
      if (!(identity.types ?? []).some((t) => t === "Instant" || t === "Sorcery")) problems.push(`${ability.text}: storm on a card that is not an instant or sorcery`);
      abilities.push({id, kind: "static", rule: "storm", text: ability.text, affects: {what: "card", self: true}});
      keywords.push("Storm");
      return;
    }
    /* FLASHBACK (CR 702.34a): the keyword with its cost, a list of atoms -- a mana cost, and "pay 3 life" -- kept as a
       static ability so the card carries it into its graveyard (rules/actions.mjs offers the cast there). Only on an
       instant or sorcery: "if the resulting spell is an instant or sorcery spell". */
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "flashback") {
      const cost = Array.isArray(ability.cost) ? ability.cost : [];
      if (!cost.length || !cost.every((atom) => FLASHBACK_ATOMS.includes(atom?.atom)))
        problems.push(`${ability.text}: a flashback cost of ${FLASHBACK_ATOMS.join(" and ")} only, and at least one`);
      const taps = cost.filter((atom) => atom?.atom === "tapCreature");
      if (taps.length > 1 || taps.some((atom) => !(Number.isInteger(atom.count) && atom.count >= 1) || !atom.selector || typeof atom.selector !== "object"))
        problems.push(`${ability.text}: a flashback cost taps a number of creatures, 1 or more, fitting a selector, once`);
      if (!(identity.types ?? []).some((t) => t === "Instant" || t === "Sorcery")) problems.push(`${ability.text}: flashback on a card that is not an instant or sorcery`);
      abilities.push({id, kind: "static", rule: "flashback", text: ability.text, cost: structuredClone(cost), affects: {what: "card", self: true}});
      keywords.push("Flashback");
      return;
    }
    /* ENCORE (CR 702.141a): an activated ability of the card in its owner's graveyard, at sorcery speed (rules/actions.mjs
       offers it there), its cost the mana and the card exiled: for each opponent, a token copy of the card with haste that
       attacks that opponent this turn if able, sacrificed at the beginning of the next end step. "This card" is that card in
       exile (the stack entry is about it), and "attacks that opponent if able" a requirement for this turn
       (rules/combat.mjs). */
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "encore") {
      const cost = Array.isArray(ability.cost) ? ability.cost : [];
      if (cost.length !== 1 || cost[0]?.atom !== "mana") problems.push(`${ability.text}: an encore cost is mana, once`);
      abilities.push({id, kind: "activated", text: ability.text, zone: "graveyard", timing: "sorcery", cost: [...structuredClone(cost), {atom: "exileFromGraveyard", self: true}],
        effects: [{effect: "repeatFor", each: "opponent", effects: [{effect: "copyPermanent", targets: "that card", gains: ["Haste"], atEndStep: "sacrifice", mustAttack: "that player"}]}]});
      keywords.push("Encore");
      return;
    }
    /* ESCAPE (CR 702.138a): "Escape--{3}{B}{B}, Exile four other cards from your graveyard" -- the keyword with its cost, kept
       as a static ability the card carries into its graveyard (rules/actions.mjs offers the cast there). Never on a land,
       which is played and never cast. */
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "escape") {
      problems.push(...escapeCostProblems(ability.cost).map((problem) => `${ability.text}: ${problem}`));
      if ((identity.types ?? []).includes("Land")) problems.push(`${ability.text}: escape on a land, which is never cast`);
      abilities.push({id, kind: "static", rule: "escape", text: ability.text, cost: structuredClone(Array.isArray(ability.cost) ? ability.cost : []), affects: {what: "card", self: true}});
      keywords.push("Escape");
      return;
    }
    /* EVOKE (CR 702.74a): two abilities. An alternative cost (CR 118.9) -- the card cast for its evoke cost instead of its
       mana cost, offered beside the mana cost wherever the card may be cast (rules/actions.mjs), its cost mana or "exile a
       red card from your hand" (Fury) -- and a trigger as the permanent enters, its controller sacrificing it if it was
       evoked: a cast for it marks the spell, and the permanent it becomes, evoked (rules/stack.mjs), which the trigger's
       condition reads as it triggers and again as it resolves (CR 603.4; script/condition.mjs). A new object after it
       moves (CR 400.7) was never evoked, so one flickered in response stays. */
    /* OVERLOAD (CR 702.96a-b): an alternative cost; cast for it, the spell's text has "each" where it had "target" -- written
       out as the effects it then has (`effects`, no targets), which the spell carries onto the stack in place of its own
       (rules/actions.mjs, rules/stack.mjs). */
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "overload") {
      const cost = Array.isArray(ability.cost) ? ability.cost : [];
      if (!cost.length || !cost.every((atom) => atom?.atom === "mana")) problems.push(`${ability.text}: overload is a mana cost`);
      if (!Array.isArray(ability.effects) || !ability.effects.length) problems.push(`${ability.text}: overload says what the spell does then, as its effects`);
      for (const effect of effectsIn(ability.effects ?? [])) if (!isBuilt(effect.effect)) problems.push(`${effect.effect}: declared, not built`);
      abilities.push({id, kind: "static", rule: "alternative-cost", overload: {targets: [], effects: structuredClone(ability.effects ?? [])}, text: ability.text, cost: structuredClone(cost), affects: {what: "card", self: true}});
      keywords.push("Overload");
      return;
    }
    /* IMPENDING (CR 702.176a): four abilities. An alternative cost -- "Impending 4--{2}{W}{W}" -- that marks the spell, and the
       permanent it becomes, as cast for it (rules/actions.mjs, rules/stack.mjs), the permanent entering with N time counters;
       while it was and it has a time counter, it is not a creature (layer 4); and at the beginning of its controller's end
       step, while it was and it has one, a time counter removed. */
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "impending") {
      const cost = Array.isArray(ability.cost) ? ability.cost : [];
      if (!Number.isInteger(ability.count) || ability.count < 1 || !cost.length || !cost.every((atom) => atom?.atom === "mana"))
        problems.push(`${ability.text}: impending is a number of time counters and a mana cost`);
      const waiting = {impending: true, selfCounters: {counter: "time", atLeast: 1}};
      abilities.push({id, kind: "static", rule: "alternative-cost", impending: ability.count, text: ability.text, cost: structuredClone(cost), affects: {what: "card", self: true}});
      abilities.push({id: `${id}-not-a-creature`, kind: "static", text: ability.text, layer: 4, affects: {self: true}, condition: waiting, apply: {removeTypes: ["Creature"]}});
      abilities.push({id: `${id}-time`, kind: "triggered", text: ability.text, trigger: TRIGGERS.step({step: "END_OF_TURN"}), condition: waiting,
        effects: [{effect: "removeCounter", targets: "self", counter: "time", count: 1}]});
      keywords.push("Impending");
      return;
    }
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "evoke") {
      const cost = Array.isArray(ability.cost) ? ability.cost : [];
      if (!cost.length || !cost.every((atom) => EVOKE_ATOMS.includes(atom?.atom) && (atom.atom !== "exileFromHand" || (atom.selector && typeof atom.selector === "object"))))
        problems.push(`${ability.text}: an evoke cost of ${EVOKE_ATOMS.join(", ")} (a card exiled from the hand by a selector), and at least one`);
      if ((identity.types ?? []).some((t) => ["Instant", "Sorcery", "Land"].includes(t))) problems.push(`${ability.text}: evoke on a card that never enters from the stack`);
      abilities.push({id, kind: "static", rule: "alternative-cost", evoke: true, text: ability.text, cost: structuredClone(cost), affects: {what: "card", self: true}});
      abilities.push({id: `${id}-evoked`, kind: "triggered", text: "When this permanent enters, if it was evoked, its controller sacrifices it.",
        trigger: TRIGGERS.enters({who: "self"}), condition: {evoked: true}, effects: [{effect: "moveZone", targets: "self", sacrifice: true}]});
      keywords.push("Evoke");
      return;
    }
    for (const effect of effectsIn(ability.effects)) {
      if (!isBuilt(effect.effect)) problems.push(`${effect.effect}: declared, not built`);
      /* counterSpell's `targets` are stack ids, which no script can know; a script names the spell it counters by
         `spells: {target: n}` (script/bind.mjs). */
      if (effect.effect === "counterSpell" && effect.targets !== undefined) problems.push("counterSpell: a script names the spell by `spells: {target: n}`, not by stack id");
      /* What repeats for each (effects/index.mjs) ranges over players, opponents or creatures, and does not stop to ask. */
      if (effect.effect === "repeatFor") {
        if (!REPEAT_EACH.includes(effect.each)) problems.push(`repeatFor: each of ${REPEAT_EACH.join(", ")}`);
        /* What repeats may ask (a search for each player, Winds of Abandon): in a resolution it is spliced in for each
           (script/resolution.mjs). */
        for (const inner of effect.effects ?? []) if (!EFFECTS[inner?.effect] && !NEEDS_A_DECISION.includes(inner?.effect)) problems.push(`repeatFor: ${inner?.effect} is not something that repeats`);
      }
      /* An added phase is a combat, a main or a beginning phase (effects/permanents.mjs). */
      if (effect.effect === "addPhase" && !(effect.phases ?? ["combat"]).every((kind) => ADDED_PHASES.includes(kind))) problems.push(`addPhase: a phase of ${ADDED_PHASES.join(", ")}`);
      /* "You may play that card" until a time (effects/zones.mjs): this turn, or the end of its controller's next turn. */
      if (effect.effect === "mayPlay" && !MAY_PLAY_UNTIL.includes(effect.until ?? "end-of-turn")) problems.push(`mayPlay: until ${MAY_PLAY_UNTIL.join(" or ")}`);
      /* "Spend this mana only to cast instant and sorcery spells" (effects/resources.mjs), "only to cast a creature spell of
         the chosen type" (a mana ability's, cards/index.mjs manaAbility): what the mana may pay for, read here for both. */
      if (effect.effect === "addMana" && effect.spendOnly !== undefined && !spendOnlyValid(effect.spendOnly))
        problems.push(`addMana: a spending restriction says what it pays for -- a spell, an ability's source, or both, each a selector (${SPEND_ONLY_KEYS.join(", ")})`);
    }

    if (ability.kind === "spell") {
      if (spell) problems.push("a second spell ability: one card, one spell");
      /* What an alternative cost (CR 118.9) may be made of: mana or none, life, a card exiled from the hand, a sacrifice. */
      for (const alt of (script.abilities ?? []).filter((a) => a?.kind === "static" && a.rule === "alternative-cost"))
        for (const atom of alt.cost ?? []) if (!["mana", "payLife", "exileFromHand", "sacrifice"].includes(atom?.atom) || (atom.atom === "sacrifice" && !atom.selector))
          problems.push(`${alt.text}: an alternative cost of ${atom?.atom ?? "something"} nothing pays yet`);
      for (const atom of ability.additionalCost ?? []) {
        /* "Blight 1 or pay {3}" (Bogslither's Embrace): a choice between two or more additional costs, each a list of the atoms
           below or mana, each choice its own offer (rules/actions.mjs, additionalVariants). */
        if (atom?.atom === "oneOf") {
          const options = Array.isArray(atom.options) ? atom.options : [];
          if (options.length < 2 || !options.every((o) => Array.isArray(o) && o.length > 0)) problems.push("oneOf: a choice of two or more additional costs, each a list of atoms");
          for (const one of options.filter(Array.isArray).flat()) {
            if (one?.atom === "mana") {
              let parsed = null;
              try { parsed = parseManaCost(one.cost ?? ""); } catch { /* refused below */ }
              if (!parsed || !parsed.symbols.length || parsed.variable > 0) problems.push(`oneOf: ${JSON.stringify(one.cost ?? "")} is no mana to pay`);
            } else if (!["discard", "sacrifice", "blight"].includes(one?.atom)) problems.push(`${one?.atom ?? "an additional cost"}: an additional cost nothing pays yet`);
            if (one?.atom === "blight" && !(Number.isInteger(one.count ?? 1) && (one.count ?? 1) >= 1)) problems.push("blight: an additional cost of 1 or more -1/-1 counters");
            if (one?.optional !== undefined) problems.push("oneOf: one of a choice is never optional");
          }
          continue;
        }
        if (!["discard", "sacrifice", "blight"].includes(atom?.atom)) problems.push(`${atom?.atom ?? "an additional cost"}: an additional cost nothing pays yet`);
        /* "As an additional cost to cast this spell, blight 1" (CR 701.68a): a whole number of -1/-1 counters, 1 or more. */
        if (atom?.atom === "blight" && !(Number.isInteger(atom.count ?? 1) && (atom.count ?? 1) >= 1)) problems.push("blight: an additional cost of 1 or more -1/-1 counters");
        /* "You may blight 1" (Cinder Strike): an optional additional cost, read by "if this spell's additional cost was paid"
           (script/condition.mjs, `cast.additionalPaid`). A blight's alone, yet. */
        if (atom?.optional !== undefined && !(atom.optional === true && atom.atom === "blight")) problems.push(`${atom?.atom ?? "an additional cost"}: only a blight may be an optional additional cost yet`);
      }
      /* MODES CHOSEN AS IT IS CAST (CR 700.2, 601.2b): a spell whose one effect is a modal -- its modes, and their targets,
         are chosen as it is cast (rules/actions.mjs), never as it resolves, whether its modes name targets or not (Austere
         Command); the spell's own targets are then its modes'. "You may choose two instead" (`chooseMore`) and "choose one
         or both" (`chooseUpTo`, Perfect Intimidation) say how many. A choice another player makes as it resolves ("the owner
         of target nonland permanent puts it ... second from the top or on the bottom", Temporal Cleansing: `chooser`) is
         no mode of the spell's, and waits for it to resolve. */
      const only = (ability.effects ?? []).length === 1 ? ability.effects[0] : null;
      const modal = only?.effect === "modal" && only.chooser === undefined
        ? {choose: only.choose ?? 1, ...(only.chooseMore ? {more: structuredClone(only.chooseMore)} : {}), ...(only.chooseUpTo ? {upTo: only.chooseUpTo} : {}),
          modes: (only.modes ?? []).map((m) => ({text: m.text ?? "", targets: m.targets ?? [], effects: m.effects ?? []}))} : null;
      if (modal && (ability.targets ?? []).length) problems.push("a modal spell chosen as it is cast names its targets in its modes, not beside them");
      spell = {id, text: ability.text, targets: ability.targets ?? [], effects: ability.effects, ...(modal ? {modal} : {}), ...(ability.additionalCost ? {additionalCost: ability.additionalCost} : {})};
      return;
    }
    /* A PARTNER ABILITY (CR 702.124): a deck rule the table holds (room/table.mjs, from `partners` above), nothing for the
       game to do. The keyword says which; the card's own words must say it too. */
    const deckRule = ability.kind === "keyword" ? DECK_RULES[String(ability.keyword).toLowerCase()] : undefined;
    if (deckRule) {
      if (!partnersIn(script.oracleText).some((p) => deckRule.kinds.includes(p.kind))) problems.push(`${ability.text}: ${deckRule.name}, and the card's words do not say so (CR 702.124)`);
      keywords.push(deckRule.name);
      return;
    }
    if (ability.kind === "keyword") {
      const word = titleCase(ability.keyword);
      if (!KEYWORDS_WITH_BEHAVIOR.has(word)) problems.push(`${word}: declared, no behavior`);
      keywords.push(word);
      return;
    }
    if (ability.kind === "activated") {
      const mana = manaAbility(ability, id);
      if (mana === "unbuilt") { problems.push(`${ability.text}: a mana ability the engine cannot run yet (a sacrifice, a target, or a question in it)`); return; }
      if (mana) { abilities.push(mana); return; }
      /* A LOYALTY ABILITY (CR 606): "+1:", "−2:", "0:" -- `{atom: "loyalty", amount}`, paid by putting on or removing that
         many loyalty counters (606.4), activated at sorcery speed and only if no loyalty ability of the permanent has been
         this turn (606.3; rules/actions.mjs). A negative one needs that many counters (606.6). */
      const loyalties = ability.cost.filter((atom) => atom?.atom === "loyalty");
      if (loyalties.length > 1 || loyalties.some((atom) => !Number.isInteger(atom.amount))) problems.push(`${ability.text}: a loyalty cost is one number of loyalty counters`);
      const loyalty = loyalties.length === 1 && Number.isInteger(loyalties[0].amount) ? loyalties[0].amount : undefined;
      const cost = ability.cost.flatMap((atom) => (atom?.atom !== "loyalty" ? [atom] : atom.amount > 0 ? [{atom: "addCounters", self: true, counter: "loyalty", count: atom.amount}]
        : atom.amount < 0 ? [{atom: "removeCounters", self: true, counter: "loyalty", count: -atom.amount}] : []));
      for (const atom of cost) if (!costAtomBuilt(atom)) problems.push(`${atom?.atom ?? "a cost"}: a cost atom nothing pays yet`);
      if (ability.cycling === true && !(ability.zone === "hand" && cost.some((atom) => atom?.atom === "discard" && atom.self === true)))
        problems.push(`${ability.text}: cycling is an ability of the card in hand, its cost discarding it (CR 702.29a)`);
      /* Cycling and typecycling ("Basic landcycling {1}") say so, or "whenever you cycle a card" would miss them (CR 702.29f). */
      if (/^[A-Za-z ]*cycling\b/i.test(ability.text ?? "") !== (ability.cycling === true))
        problems.push(`${ability.text}: a cycling ability, and only one, says \`cycling: true\` (CR 702.29a, 702.29f)`);
      /* MODES CHOSEN AS IT IS ACTIVATED (CR 700.2, 602.2b): an activated ability whose one effect is a modal whose modes
         name targets ("Choose one -- Double the number of each kind of counter on target permanent; or ... you have",
         Aetheric Amplifier) -- its modes and their targets chosen with the offer (rules/actions.mjs), as a modal spell's
         are. One whose modes name none is asked as it resolves, as it was. */
      const sole = (ability.effects ?? []).length === 1 ? ability.effects[0] : null;
      const chosenModes = sole?.effect === "modal" && sole.chooser === undefined && (sole.modes ?? []).some((m) => (m.targets ?? []).length)
        ? {choose: sole.choose ?? 1, modes: sole.modes.map((m) => ({text: m.text ?? "", targets: m.targets ?? [], effects: m.effects ?? []}))} : null;
      if (chosenModes && (ability.targets ?? []).length) problems.push(`${ability.text}: a modal activated ability names its targets in its modes, not beside them`);
      abilities.push({id, kind: "activated", text: ability.text, cost, targets: ability.targets ?? [], ...(chosenModes ? {modal: chosenModes} : {}),
        effects: ability.effects, ...(loyalty !== undefined ? {loyalty, timing: "sorcery"} : ability.timing ? {timing: ability.timing} : {}), ...(ability.zone === "hand" ? {zone: "hand"} : {}),
        /* "{W}, Exile this card from your graveyard: ..." (Goldmeadow Nomad): an ability of the card in its owner's graveyard,
           offered there as encore's is (rules/actions.mjs). */
        ...(ability.zone === "graveyard" ? {zone: "graveyard"} : {}),
        /* Exhaust (CR 702.177a): "Activate only once" -- this object's, never again; a new object may (CR 400.7). */
        ...(ability.exhaust === true ? {exhaust: true} : {}),
        /* Cycling (CR 702.29a): its discard is the card being cycled, for "when you cycle this card" (rules/actions.mjs). */
        ...(ability.cycling === true ? {cycling: true} : {}),
        /* "This ability costs {1} less to activate for each legendary creature you control" (CR 602.2b, 601.2f). */
        ...(ability.costLess !== undefined ? {costLess: ability.costLess} : {}), ...(ability.condition ? {condition: ability.condition} : {}),
        /* "Activate only once each turn" (CR 602.5b): how many times each turn. */
        ...(ability.limit ? {limit: ability.limit} : {})});
      return;
    }
    if (ability.kind === "triggered") {
      const compile = TRIGGERS[ability.trigger.on];
      const compiled = compile ? compile(ability.trigger) : null;
      /* "Whenever ONE OR MORE ...": once for everything that happened at once (rules/trigger.mjs). */
      const trigger = compiled && ability.trigger.batch ? {...compiled, batch: true} : compiled;
      if (!trigger) problems.push(`${ability.trigger.on}${ability.trigger.who ? ` (${ability.trigger.who})` : ""}: a trigger the engine does not watch for yet`);
      if (ability.trigger.filter) {
        /* A filter may be a choice ("an instant or sorcery spell", "another creature or planeswalker you control dies"):
           each alternative, with what they share, is a selector of its own (script/filter.mjs, matchesSelector). */
        const {anyOf, ...shared} = ability.trigger.filter;
        const each = Array.isArray(anyOf) ? anyOf.map((one) => ({...shared, ...one, ...(ability.trigger.on === "spell cast" ? {what: "spell"} : {})}))
          : [{...ability.trigger.filter, ...(ability.trigger.on === "spell cast" ? {what: "spell"} : {})}];
        try { for (const one of each) compileSelector(one); } catch (error) { problems.push(`${ability.text}: ${error.message}`); }
      }
      /* What a spell cast targets ("that targets a creature"): a selector of its own, read only as a spell is cast -- another
         trigger would drop it, and trigger on everything. */
      if (ability.trigger.targets !== undefined) {
        if (ability.trigger.on !== "spell cast") problems.push(`${ability.text}: what a spell targets is read as it is cast, and by no other trigger`);
        else try { compileSelector(ability.trigger.targets); } catch (error) { problems.push(`${ability.text}: ${error.message}`); }
      }

      /* "YOU MAY" (CR 603.5): an optional triggered ability goes on the stack like any other, and as it resolves its
         controller chooses whether to do it -- the card's sentence, Yes or No. Declining does nothing at all, a search
         and its shuffle included. */
      const effects = ability.optional ? [{effect: "modal", title: ability.text, modes: [{text: "Yes", effects: ability.effects}, {text: "No", effects: []}]}] : ability.effects;
      /* A TRIGGERED MANA ABILITY (CR 605.1b): one that triggers on a mana ability and adds mana -- a fixed amount, or "one
         mana of any type that land produced" -- with no target. It is not put on the stack (rules/trigger.mjs, manaTriggered). */
      const [adds] = effects ?? [];
      if (trigger?.on === "GameEventManaPool" && effects.length === 1 && adds?.effect === "addMana" && !(ability.targets ?? []).length && !ability.optional
        && (MANA(adds.mana) || adds.produced === true)) {
        /* What a triggered mana ability adds goes straight to the pool: one that says what its mana may pay for is refused
           until it is carried there. */
        if (adds.spendOnly !== undefined) problems.push(`${ability.text}: a triggered mana ability whose mana may pay for only some things is not built`);
        trigger.manaAbility = adds.produced === true ? {produced: true} : {mana: {...adds.mana}};
      }
      /* MODES CHOSEN AS IT IS PUT ON THE STACK (CR 603.3c, 700.2b): a triggered ability whose one effect is a modal -- its
         modes and their targets are chosen then (rules/trigger.mjs), never as it resolves, whether its modes name targets or
         not (Tireless Provisioner). "You may choose two" (`mayChooseNone`): that many, or none, and it is removed from the
         stack. "Each mode must target a different player" (`differentPlayers`, Shadrix Silverquill). A choice another player
         makes as it resolves ("the owner of up to one other target nonland permanent puts it on their choice of the top or
         bottom of their library", Plan for All Outcomes: `chooser`) is no mode of the ability's, and waits for it to resolve. */
      const lone = (ability.effects ?? []).length === 1 ? ability.effects[0] : null;
      const modal = lone?.effect === "modal" && lone.chooser === undefined
        ? {choose: lone.choose ?? 1, ...(lone.mayChooseNone ? {mayChooseNone: true} : {}), ...(lone.differentPlayers ? {differentPlayers: true} : {}),
          modes: (lone.modes ?? []).map((m) => ({text: m.text ?? "", targets: m.targets ?? [], effects: m.effects ?? []}))} : null;
      if (modal && (ability.optional || (ability.targets ?? []).length)) problems.push(`${ability.text}: a modal triggered ability names its targets in its modes, and "you may" as mayChooseNone`);
      if (modal && modal.modes.some((m) => m.targets.some((t) => t && typeof t === "object" && t.count !== undefined)))
        problems.push(`${ability.text}: a counted target in a triggered ability's mode is not built`);
      abilities.push({id, kind: "triggered", text: ability.text, trigger: trigger ?? {on: null}, effects: modal ? [] : effects, ...(modal ? {modal} : {}),
        ...((ability.targets ?? []).length ? {targets: ability.targets} : {}),
        ...(ability.condition ? {condition: ability.condition} : {}), ...(ability.optional ? {optional: true} : {}),
        /* "This ability triggers only once each turn". */
        ...(ability.limit ? {limit: ability.limit} : {})});
      return;
    }
    /* A condition on a static (Forge's IsPresentStatic) is read by the layers (rules/layers.mjs), and a static that works
       from a graveyard is a layer's too; a rule static (rules/statics.mjs) reads neither yet, and is refused rather than
       always on. */
    if (ability.kind === "static" && ability.rule && ((ability.condition && !RULES_READING_A_CONDITION.includes(ability.rule)) || ability.worksFrom))
      problems.push(`${ability.text}: a condition or a graveyard on a rule static, which nothing reads yet`);
    if (ability.kind === "static" && ability.worksFrom !== undefined && ability.worksFrom !== "graveyard") problems.push(`${ability.text}: a static works from the battlefield, or from a graveyard`);
    /* A layer static's `affects` is read by the layers' own matcher: a key it does not read is refused, not ignored. */
    if (ability.kind === "static" && ability.layer !== undefined)
      for (const key of Object.keys(ability.affects ?? {})) if (!LAYER_AFFECTS_KEYS.includes(key)) problems.push(`${ability.text}: a layer static's affects has no key ${JSON.stringify(key)}`);
    /* Escape given ("each nonland card in your graveyard has escape. The escape cost is equal to the card's mana cost plus
       exile three other cards from your graveyard", Underworld Breach): to the cards `affects` describes (the schema asks
       for it), its cost the cards to exile. */
    if (ability.kind === "static" && ability.rule === "escape")
      problems.push(...escapeCostProblems(ability.cost, {given: true}).map((problem) => `${ability.text}: ${problem}`));
    /* What follows a prevention is done at once, inside the damage event (CR 615.5): nothing in it may stop to ask. */
    if (ability.kind === "replacement") for (const effect of ability.change?.then ?? [])
      if (!EFFECTS[effect?.effect]) problems.push(`${ability.text}: ${effect?.effect} follows a prevention, and it asks a question or is not built`);
    /* static and replacement: their schema is the rules modules' own shape. */
    abilities.push({...ability, id});
  });

  /* What a static or an effect gives (compileGrant): compiled here, in place of the script's words. */
  for (const [index, ability] of abilities.entries()) {
    if (ability.kind === "static" && ability.apply?.addAbilities !== undefined) {
      if (ability.layer !== 6) problems.push(`${ability.text}: abilities are given in layer 6 (CR 613.1f)`);
      const given = compileGrant(ability.apply.addAbilities, ability.text, problems);
      if (given) abilities[index] = {...ability, apply: {...ability.apply, addAbilities: given.abilities,
        ...(given.keywords.length ? {addKeywords: [...(ability.apply.addKeywords ?? []), ...given.keywords]} : {})}};
    }
    if (["activated", "triggered"].includes(ability.kind)) compileGivenIn(ability.effects, ability.text, problems);
  }
  if (spell) compileGivenIn(spell.effects, spell.text, problems);

  const types = identity.types;
  if (!spell && types.some((t) => t === "Instant" || t === "Sorcery")) problems.push("an instant or sorcery with no spell ability does nothing");
  if (enchant && !(identity.subtypes ?? []).includes("Aura")) problems.push("Enchant on a card that is not an Aura");
  if (enchant && spell) problems.push("an Aura's spell is its Enchant target, and it has no other");
  /* The Aura as a spell: its one target, nothing done as it resolves -- it enters attached (stack.mjs). */
  if (enchant) spell = {id: "enchant", text: enchant.text, targets: [enchant.target], effects: [], ...(enchant.hostile ? {hostile: true} : {})};

  const partners = partnersIn(script.oracleText);
  const definition = {
    oracleId: identity.oracleId,
    types: [...types],
    subtypes: [...(identity.subtypes ?? [])],
    ...((identity.supertypes ?? []).length ? {supertypes: [...identity.supertypes]} : {}),
    /* "<Name> can be your commander" (CR 903.3a): the card's own word, its static `can-be-commander`, for a table holding
       a deck to the rule. */
    ...((script.abilities ?? []).some((a) => a?.kind === "static" && a.rule === "can-be-commander") ? {canBeCommander: true} : {}),
    /* And whether it may share the command zone, and with what (CR 702.124; partnersIn above). */
    ...(partners.length ? {partners} : {}),
    manaCost: identity.manaCost ?? null,
    colors: [...(identity.colors ?? [])],
    colorIdentity: [...(identity.colorIdentity ?? [])],
    power: identity.power ?? null,
    toughness: identity.toughness ?? null,
    /* A planeswalker's printed loyalty (CR 306.5a): the loyalty counters it enters with (306.5b; rules/replacement.mjs). */
    ...(Number.isInteger(identity.loyalty) ? {loyalty: identity.loyalty} : {}),
    keywords,
    abilities,
    ...(spell ? {spell} : {}),
    ...(enchant ? {enchant: enchant.target} : {}),
  };
  /* A MODAL DOUBLE-FACED CARD (CR 712.3): "Front // Back", each face compiled as a card of its own, the card's oracle id
     and color identity both faces' (CR 903.4). Each face's characteristics go with the card (`mdfc`); which is up is the
     object's (state/index.mjs): the front, but for a back face played as a land (CR 712.12, 712.8a, 712.8f). */
  if (script.back !== undefined) {
    const names = String(identity.name).split(" // ");
    const back = compileScript({schema: script.schema, identity: {...script.back.identity, oracleId: identity.oracleId, colorIdentity: identity.colorIdentity ?? []},
      oracleText: script.back.oracleText, source: script.source, abilities: script.back.abilities});
    if (names.length !== 2 || script.back.identity?.name !== names[1]) problems.push(`a double-faced card is named "Front // Back", and its back face is the second name`);
    for (const problem of back.problems) problems.push(`back face: ${problem}`);
    if (back.definition) {
      const face = (d, name) => ({card: name, types: [...d.types], subtypes: [...d.subtypes], ...(d.supertypes ? {supertypes: [...d.supertypes]} : {}), manaCost: d.manaCost,
        colors: [...d.colors], power: d.power, toughness: d.toughness, ...(Number.isInteger(d.loyalty) ? {loyalty: d.loyalty} : {}), keywords: [...d.keywords], abilities: structuredClone(d.abilities),
        ...(d.spell ? {spell: structuredClone(d.spell)} : {}), ...(d.enchant ? {enchant: structuredClone(d.enchant)} : {})});
      definition.mdfc = {front: face(definition, names[0]), back: face(back.definition, names[1])};
    }
  }
  return {definition: problems.length ? null : definition, problems: [...new Set(problems)]};
}

/* Edit distance, bounded: suggestions are for a misspelling, not for every card in the pool. */
function distance(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, row[j]);
    }
    if (best > limit) return limit + 1;
    previous = row;
  }
  return previous[b.length];
}

/**
 * The directory over a list of scripts.
 *
 * @param {Array<{script: object, path?: string}>|Array<object>} entries  scripts, or `{script, path}` as game/tools/engine-cards.mjs reads them
 * @returns {{size: number, names: string[], resolve: Function, suggest: Function, definition: Function, problems: Function}}
 */
export function createCardIndex(entries) {
  const byName = new Map();
  for (const entry of entries ?? []) {
    const script = entry && entry.script ? entry.script : entry;
    const file = entry && entry.script ? entry.path ?? null : null;
    const name = script?.identity?.name;
    if (!name) throw new Error(`A card definition${file ? ` (${file})` : ""} has no name`);
    const key = foldName(name);
    if (byName.has(key)) throw new Error(`Two definitions of ${name}${file ? ` (${file} and ${byName.get(key).path})` : ""}`);
    const {definition, problems} = compileScript(script);
    /* Where it came from: written by hand, or by the card loader and still `provisional` until confirmed. */
    const source = entry?.source ?? script.source ?? "hand", status = entry?.status ?? (source === "hand" ? "verified" : "provisional");
    byName.set(key, {name, oracleId: script.identity.oracleId ?? null, path: file, script, definition, problems, source, status});
  }
  const names = [...byName.values()].map((e) => e.name).sort();

  /** A card's entry by name, however it is spelled -- or null. The same shape as forge-card-index's `resolve`. */
  const resolve = (name) => {
    const hit = byName.get(foldName(name));
    return hit ? {name: hit.name, oracleId: hit.oracleId, path: hit.path, playable: hit.problems.length === 0, problems: [...hit.problems],
      source: hit.source, status: hit.status} : null;
  };
  /** The nearest names, for a name that does not resolve. */
  const suggest = (name, limit = 5) => {
    const want = foldName(name);
    if (!want) return [];
    return names
      .map((n) => {const f = foldName(n); return {n, d: f.startsWith(want) || want.startsWith(f) ? 0 : distance(want, f, 3)};})
      .filter((x) => x.d <= 3)
      .sort((a, b) => a.d - b.d || a.n.localeCompare(b.n))
      .slice(0, limit)
      .map((x) => x.n);
  };
  /** The object fields for `addObject`, fresh each call -- or null when the engine cannot play the card. */
  const definition = (name) => {
    const hit = byName.get(foldName(name));
    return hit && hit.definition ? structuredClone(hit.definition) : null;
  };
  /** Why a card cannot be played, or [] when it can (and null for a card there is no definition of at all). */
  const problems = (name) => {
    const hit = byName.get(foldName(name));
    return hit ? [...hit.problems] : null;
  };

  return {size: byName.size, names, resolve, suggest, definition, problems};
}
