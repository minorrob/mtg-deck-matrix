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

import {ADDED_PHASES, PREDEFINED_TOKENS} from "../script/effects/permanents.mjs";
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
    else if (atom?.atom === "sacrifice" && atom.selector && typeof atom.selector === "object") {
      unless.sacrifice = structuredClone(atom.selector);
      /* "Ward--Sacrifice three permanents" (Emrakul, the Exigent Doom): that many, chosen together. */
      if (Number.isInteger(atom.count) && atom.count > 1) unless.sacrificeCount = atom.count;
    }
    else return null;
  }
  return unless;
}

/* The rule statics that read their own condition: an alternative cost's "if you control a commander" (rules/actions.mjs);
   an attack tax and "doesn't untap" "as long as" or "unless you have an enduring story" (rules/statics.mjs); and Tithe
   Taker's "during your turn", on spells and on abilities that cost more. */
const RULES_READING_A_CONDITION = ["alternative-cost", "spells-cost-less", "triggers-again", "cant-cast", "attack-tax", "doesnt-untap", "cast-without-paying",
  "spells-cost-more", "abilities-cost-more",
  /* "Twice that many ... instead" at a Class level (Innkeeper's Talent, CR 716.2a; rules/statics.mjs, countersPlaced). */
  "more-counters",
  /* "Can't ... block unless you control seven or more lands" (Topiary Stomper, CR 509.1b): read as each blocker is checked
     (rules/combat.mjs canBlock, through rules/statics.mjs ruleChanged, which asks every rule's condition). */
  "cant-block",
  /* "As long as The Wandering Emperor entered this turn, you may activate her loyalty abilities any time you could cast an
     instant" (CR 606.3's timing; rules/actions.mjs, through rules/statics.mjs ruleChanged, which asks every rule's condition). */
  "loyalty-at-instant-speed",
  /* An activation forbidden (CR 602.5; rules/statics.mjs, activationForbidden), as a cast forbidden is. */
  "cant-activate",
  /* "As long as there is a Lesson card in your graveyard, this creature can attack as though it didn't have defender"
     (Platypus-Bear; CR 702.3b): rules/statics.mjs defenderLifted asks it as attackers are offered. */
  "attacks-despite-defender",
  /* "Coven -- As long as you control three or more creatures with different powers, you may cast creature spells from the
     top of your library" (Augur of Autumn), "you may cast this card from your graveyard as long as you control a Zombie"
     (Gravecrawler): asked whenever a card would be played through it (rules/actions.mjs, permissionOpen and
     playableElsewhere). */
  "play-from", "cast-self-from",
  /* "3+ | You may play an additional land on each of your turns" (Exploration Broodship's station; CR 305.2): asked as the
     land drops are counted (rules/actions.mjs, landDropsLeft). */
  "extra-land-drop",
  /* "Solved -- You may look at the top card of your library any time" (Case of the Locked Hothouse; CR 719.3c): asked as the
     library is shown (projection.mjs, topSeenBy). */
  "look-at-top"];

/* A target picked after the offer is taken ("up to two target creatures", script/bind.mjs): not chosen with it. */
const countedTarget = (spec) => Boolean(spec) && typeof spec === "object" && spec.count !== undefined;
/* What a flashback cost may be made of (CR 702.34a): mana, life ("Flashback--{1}{U}, Pay 3 life"), creatures to tap
   ("Flashback--Tap three untapped white creatures you control", Battle Screech: `tapCreature`, its `count` and `selector`),
   and cards to discard ("Flashback--{1}{U/R}{U/R}, Discard a card", Twinned Vision: `discard`, its `count`), each card its
   own offer as an additional cost's discard is (rules/actions.mjs, additionalChoices). */
/* And permanents to sacrifice ("Flashback--Sacrifice three creatures", Dread Return; wave 4c, k2: `sacrifice`, its `count` and
   `selector`), which ones asked once the cast is taken, as the creatures it taps are. */
const FLASHBACK_ATOMS = ["mana", "payLife", "tapCreature", "discard", "behold", "sacrifice"];
/* BEHOLD (CR 701.4a): "behold an Elf", "behold three Elementals" -- what may be beheld, a selector, and how many (1 or more),
   in an additional cost or a flashback cost (rules/actions.mjs, beholdChoices). Never optional, and one to a card: its cast
   asks one question of it. */
/* "BEHOLD A GOBLIN AND EXILE IT" (Champion of the Weird; CR 701.4a, 601.2h): `exile: true`, what is beheld exiled as the cost is
   paid -- in a plain additional cost alone (`exiles`), linked to the permanent the spell becomes (CR 607.2q; rules/actions.mjs,
   rules/stack.mjs). */
function beholdProblems(atom, {exiles = false} = {}) {
  if (atom?.atom !== "behold") return [];
  let fits = Boolean(atom.selector) && typeof atom.selector === "object" && (atom.count === undefined || (Number.isInteger(atom.count) && atom.count >= 1)) && atom.optional === undefined;
  try { if (fits) compileSelector({...atom.selector, what: "card"}); } catch { fits = false; }
  const exile = atom.exile === undefined || (exiles && atom.exile === true);
  return [...(fits ? [] : ["behold: what may be beheld (a selector) and how many, 1 or more, never optional"]),
    ...(exile ? [] : ["behold: exile is true (behold and exile it), in a spell's own additional cost and nowhere else"])];
}
/* Life paid as a number (CR 119.4): only an activated ability's cost counts it as it is paid (rules/actions.mjs, costPayment;
   War Room) -- an alternative cost's life and a mana ability's are read before anything is counted. */
const fixedLife = (atom) => atom?.atom !== "payLife" || (Number.isInteger(atom.amount) && atom.amount >= 0);
/* A flashback cost's discard: any card, a number of them -- never a card of a kind, nor "discard this card". */
const plainDiscard = (atom) => atom?.atom !== "discard" || (atom.self === undefined && atom.selector === undefined && (atom.count === undefined || (Number.isInteger(atom.count) && atom.count >= 1)));
/* How long "you may play that card" lasts (script/effects/zones.mjs, mayPlay): this turn, until the end of your next turn,
   until your next end step (Shadow Urchin; CR 513.1, rules/turn.mjs), or for as long as it remains there ("ever": a card
   that moves is a new object, CR 400.7, Emrakul, the Exigent Doom). */
const MAY_PLAY_UNTIL = ["end-of-turn", "your-next-end", "your-next-end-step", "ever"];
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

/* A TOKEN A REPLACEMENT MAKES, NAMED AS A PREDEFINED ONE (CR 111.10): "plus an additional Food token" (Peregrin Took), "plus an
   additional Treasure token" (Xorn), "one of each" Clue, Food and Treasure (Academy Manufactor) -- given the definition
   createToken makes it from (PREDEFINED_TOKENS), so rules/statics.mjs reads what the token is. One it does not know is a
   problem, by name. */
const TOKEN_REPLACEMENTS = ["tokens-instead", "tokens-plus", "tokens-each"];
function predefinedIn(ability, problems) {
  if (ability.kind !== "static" || !TOKEN_REPLACEMENTS.includes(ability.rule)) return ability;
  const spec = (token) => {
    if (!token?.predefined) return token;
    if (!Object.hasOwn(PREDEFINED_TOKENS, token.predefined)) { problems.push(`${ability.text}: no predefined token named ${token.predefined}`); return token; }
    return structuredClone(PREDEFINED_TOKENS[token.predefined]);
  };
  return {...ability, ...(ability.token ? {token: spec(ability.token)} : {}), ...(Array.isArray(ability.each) ? {each: ability.each.map(spec)} : {})};
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
   and a named one ("Partner--Character select"), and Choose a Background. "Partner with [name]" (702.124j) is also a trigger
   as the card enters, compiled below (`partner with`); not yet Doctor's companion. */
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
    /* "Whenever a creature deals combat damage to you" (Strixhaven Stadium): `to: "you"`, this ability's controller. */
    : ARRIVALS.includes(t.who ?? "self") && ["player", "opponent", "you"].includes(t.to ?? "player")
    ? {on: "GameEventPlayerDamaged", who: t.who ?? "self", to: t.to ?? "player", ...(t.combat ? {combat: true} : {}), ...(t.noncombat ? {noncombat: true} : {}), ...(t.sourceYours ? {sourceYours: true} : {}), ...(t.filter ? {filter: t.filter} : {}),
      /* "Deals combat damage to a player or planeswalker" (Grateful Apparition): damage dealt to a planeswalker counts
         too, about its controller (rules/trigger.mjs). */
      ...(t.planeswalkers === true ? {planeswalkers: true} : {}),
      /* "Whenever one or more creatures deal combat damage to you while you're the monarch" (Tamiyo, Upriser Crowned; CR
         725): `monarch: "you"`, read as the damage is dealt (rules/trigger.mjs) -- on damage to you alone. */
      ...(t.monarch === "you" && t.to === "you" ? {monarch: "you"} : {})} : null);

/* "WHENEVER ONE OR MORE CARDS ARE PUT INTO EXILE FROM YOUR LIBRARY AND/OR YOUR GRAVEYARD" (Laelia, the Blade Reforged):
   `from` a list of those zones, `owner` whose they are -- a card is only ever in its owner's library or graveyard (CR
   400.3) -- any card put into exile from one of them, face down too, by an effect or a cost. "One or more" is `batch`: once
   for everything one action exiled, from either zone (rules/trigger.mjs). No `who` and no `filter` yet. */
const EXILED_FROM = Object.freeze({library: "Library", graveyard: "Graveyard"});
const exiledFrom = (t) => (t.from.length > 0 && t.from.every((zone) => EXILED_FROM[zone]) && ["you", "opponent", "any"].includes(t.owner ?? "you") && !t.filter && t.who === undefined
  ? {on: "GameEventCardChangeZone", to: "Exile", fromZones: t.from.map((zone) => EXILED_FROM[zone]), owner: t.owner ?? "you"} : null);

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
  /* "When this permanent is put into a graveyard from the battlefield" (Serra Paragon's grant): `to: "graveyard"`, a
     permanent of any type -- "dies" is a creature's word for it (CR 700.4). */
  leaves: (t) => (ARRIVALS.includes(t.who ?? "self") && [undefined, "graveyard"].includes(t.to)
    ? {on: "GameEventCardChangeZone", from: "Battlefield", who: t.who ?? "self", ...(t.to === "graveyard" ? {to: "Graveyard"} : {}), ...(t.filter ? {filter: t.filter} : {})} : null),
  /* "Whenever a creature is exiled from the battlefield" (Soulherder): a permanent put into exile from the battlefield, `who`
     and `filter` read as it last existed -- a leaves-the-battlefield ability, so it looks back (CR 603.10a): a creature
     exiled with this one is seen, and so is this one. One whose owner then puts it in the command zone was exiled first
     (CR 903.9a; the card's ruling). From the battlefield only, yet. */
  exiled: (t) => (Array.isArray(t.from) ? exiledFrom(t)
    : ARRIVALS.includes(t.who ?? "self") && (t.from ?? "battlefield") === "battlefield"
    ? {on: "GameEventCardChangeZone", from: "Battlefield", to: "Exile", who: t.who ?? "self", ...(t.filter ? {filter: t.filter} : {})} : null),
  /* "Whenever one or more permanent cards are put into your graveyard from anywhere" (Moonshadow): a card arriving in a
     graveyard, from any zone, read as the card it became there -- a token is no card (CR 108.2b) -- `owner` whose
     graveyard (a card goes to its owner's, CR 400.3), `filter` what the card must be. "One or more" is `batch`. */
  /* "A creature card is put into a graveyard from anywhere other than the battlefield" (Syr Konrad, the Grim, wave 4b):
     `notFrom: "battlefield"`. */
  /* "Put into your graveyard FROM YOUR LIBRARY" (Hedge Shredder): `from: "library"`, the zone it came from (rules/trigger.mjs). */
  "put into graveyard": (t) => (["you", "opponent", "any"].includes(t.owner ?? "you") && [undefined, "battlefield"].includes(t.notFrom) && [undefined, "library"].includes(t.from)
    ? {on: "GameEventCardChangeZone", to: "Graveyard", intoGraveyard: true, owner: t.owner ?? "you", ...(t.filter ? {filter: t.filter} : {}),
      ...(t.from === "library" ? {from: "Library"} : {}),
      ...(t.notFrom === "battlefield" ? {notFrom: "Battlefield"} : {})} : null),
  /* "Whenever one or more cards leave your graveyard" (Garrison Excavator): to any zone, a card cast from it included. "A
     creature card leaves your graveyard" (Syr Konrad, the Grim, wave 4b): `filter`, the card as it was there (rules/trigger.mjs). */
  "left graveyard": (t) => (["you", "opponent", "any"].includes(t.owner ?? "you")
    ? {on: "GameEventCardChangeZone", from: "Graveyard", leftGraveyard: true, owner: t.owner ?? "you", ...(t.filter ? {filter: t.filter} : {})} : null),
  upkeep: (t) => ({on: "GameEventTurnPhase", phase: "UPKEEP", ...(t.yours === false ? {} : {yourTurn: true})}),
  /* "Whenever you cast a noncreature spell", "whenever an opponent casts a spell": `caster` you, opponent or any;
     `filter` the spell (CR 601.2i). */
  "mutates": (t) => ({on: "GameEventMutates", who: t.who ?? "self"}),
  "spell cast": (t) => ({on: "GameEventSpellAbilityCast", caster: t.caster ?? "you", ...(t.filter ? {filter: t.filter} : {}), ...(t.firstThisTurn ? {firstThisTurn: true} : {}),
    /* "Their second spell each turn" (Monologue Tax): the caster's Nth this turn the filter fits. */
    ...(Number.isInteger(t.nthThisTurn) && t.nthThisTurn >= 2 ? {nthThisTurn: t.nthThisTurn} : {}),
    /* "From your hand" (Jodah): where it was cast from (rules/actions.mjs). */
    ...(t.from ? {castFrom: t.from} : {}),
    /* "When you cast this spell" (Emrakul, the Exigent Doom): its own cast, from the stack (rules/trigger.mjs). */
    ...(t.who === "self" ? {who: "self"} : {}),
    /* "When you cast this spell while you control a creature" (Social Snub): `while`, a condition of script/condition.mjs's
       asked as the spell is cast (CR 601.2i) and never again -- a trigger condition, not an intervening "if" (CR 603.4), so
       a creature gone by the time the trigger resolves takes nothing from it (rules/trigger.mjs). */
    ...(t.while ? {while: t.while} : {}),
    /* "For each other instant and sorcery spell you've cast before it this turn": counted as it triggers. */
    ...(t.countBefore ? {countBefore: true} : {}),
    /* MAGECRAFT, "whenever you cast OR COPY an instant or sorcery spell" (Archmage Emeritus, Storm-Kiln Artist; CR 207.2c,
       707.10): `orCopy`, a copy put on the stack by an effect of `caster`'s too -- once for each copy, the copy what it is
       about (rules/trigger.mjs). A copy cast is a spell cast (CR 707.12), so it is seen as one already. */
    ...(t.orCopy === true ? {orCopy: true} : {}),
    /* "An instant or sorcery spell that targets a creature" (Rehearsed Debater): what one of its targets is (rules/trigger.mjs). */
    ...(t.targets ? {targets: t.targets} : {}),
    /* "An Equipment spell or a spell that targets a creature you control" (Danitha, Sword of Hope): either, each its own
       `filter` and `targets`. */
    ...(Array.isArray(t.anyOf) ? {anyOf: t.anyOf.map((one) => ({...(one.filter ? {filter: one.filter} : {}), ...(one.targets ? {targets: one.targets} : {})}))} : {})}),
  /* "Whenever one or more +1/+1 counters are put on Berta" (CR 122.1): counters of `counter` put on this permanent, once
     for each time they are put on, however many. */
  /* "Whenever YOU put one or more +1/+1 counters on this creature" (Exemplar of Light), "whenever you put one or more -1/-1
     counters on a creature" (Nest of Scarabs): `putBy: "you"`, put by this ability's controller -- an effect's controller,
     or as a permanent enters its controller (CR 122.6a; rules/trigger.mjs). */
  "counter added": (t) => (typeof t.counter !== "string" || ![undefined, "you"].includes(t.putBy) ? null : (t.who ?? "self") === "self" ? {on: "GameEventCardCounters", counterAdded: true, counter: t.counter,
    /* "Whenever a +1/+1 counter is put on this creature" (Fathom Mage): once for each counter (`each`), not for each time. */
    ...(t.each === true ? {each: true} : {}), ...(t.putBy ? {putBy: t.putBy} : {})}
    /* "Whenever one or more +1/+1 counters are put on a creature you control, put that many growth counters on this
       enchantment" (Simic Ascendancy; CR 122.6): on any permanent `filter` describes, once for each permanent each time
       they are put on it -- about that permanent and how many (rules/trigger.mjs; "that many", script/amount.mjs
       `countersPut`). Once for each time, never for each counter. */
    : t.who === "any" && t.each === undefined ? {on: "GameEventCardCounters", counterAdded: true, counter: t.counter, who: "any", ...(t.filter ? {filter: t.filter} : {}),
      ...(t.putBy ? {putBy: t.putBy} : {})} : null),
  /* "Whenever you scry or surveil" (Proft, Consulting Detective; CR 701.22a, 701.25a): once each is done, by `scrier`. */
  scried: (t) => ({on: "GameEventScried", scrier: t.scrier ?? "you"}),
  /* "Whenever you proliferate" (Ezuri, Stalker of Spheres; CR 701.34a): once each proliferate is done, by `proliferator`
     you, opponent or any. */
  proliferated: (t) => ({on: "GameEventProliferate", proliferator: t.proliferator ?? "you"}),
  /* "Whenever you commit a crime" (Bandit's Haul; CR 700.13): a spell, an activated ability or a triggered ability of
     `criminal`'s -- you, opponent or any -- aimed at an opponent of theirs or what is that opponent's (rules/stack.mjs). */
  "crime committed": (t) => ({on: "GameEventCrimeCommitted", criminal: t.criminal ?? "you"}),
  /* A STATE TRIGGER (CR 603.8): "when this artifact has twenty or more charge counters on it" (Darksteel Reactor) -- `state`, a
     condition of script/condition.mjs's grammar (script/schema.mjs holds it to it), triggering while it holds (rules/trigger.mjs). */
  state: (t) => ({on: "state", state: t.state}),
  /* "Whenever this creature transforms into Ashling, Rekindled" (CR 701.27e): this permanent transforming, `into` the face
     it then has, by name -- not entering transformed (CR 712.14a), which is no transforming. This one's own alone. */
  transformed: (t) => ((t.who ?? "self") === "self" && typeof t.into === "string" ? {on: "GameEventCardTransformed", who: "self", into: t.into} : null),
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
  attacks: (t) => (ARRIVALS.includes(t.who ?? "self") && [undefined, "opponent", "you", "player"].includes(t.defender) && [undefined, true].includes(t.alone)
    ? {on: "GameEventAttackersDeclared", who: t.who ?? "self", ...(t.filter ? {filter: t.filter} : {}),
    /* "Attack one of your opponents" -- "or a planeswalker they control" (`planeswalkers`, CR 506.3); "attacks with three or
       more creatures" (rules/trigger.mjs). "Attacks a player" (`defender: "player"`, Jiang Yanggu, Alone): a player, never a
       planeswalker (CR 506.3). */
    ...(t.defender ? {defender: t.defender} : {}), ...(t.planeswalkers === true ? {planeswalkers: true} : {}), ...(t.atLeast ? {atLeast: t.atLeast} : {}),
    /* "Whenever Aurelia attacks for the first time each turn" (rules/trigger.mjs). */
    ...(t.firstTime ? {firstTime: true} : {}),
    /* "Whenever this creature attacks while saddled" (Bounding Felidar; CR 702.171b): `while`, a condition asked as it
       attacks and never again -- a trigger condition, not an intervening "if" (CR 603.4; rules/trigger.mjs). */
    ...(t.while !== undefined ? {while: t.while} : {}),
    /* "Whenever a creature you control attacks alone" (Thoughtweft Imbuer; CR 506.5): the only creature declared. */
    ...(t.alone === true ? {alone: true} : {})} : null),
  /* "Whenever this Vehicle attacks or blocks" (Smuggler's Copter; CR 509.3a): "whenever [a creature] blocks" -- once each
     combat for each creature declared as a blocker, however many it blocks; "whenever [a creature] blocks a creature"
     (`each: "attacker"`, 509.3b) once for each attacking creature it blocks. `who` and `filter` the blocker, read as blockers
     are declared (509.3f). About the blocker, and -- for a creature -- the attacker blocked and its controller. A creature
     put onto the battlefield blocking never blocked (509.4); nothing here puts one there. */
  /* "Whenever this creature blocks a creature with flying" (Skystinger; CR 509.3b): `blocked`, a selector of the attacking
     creature it blocks, read as blockers are declared -- once for each attacker it blocks that fits. Only with `each:
     "attacker"`, the creature blocked being what it describes. */
  blocks: (t) => (ARRIVALS.includes(t.who ?? "self") && [undefined, "attacker"].includes(t.each) && (t.blocked === undefined || t.each === "attacker")
    ? {on: "GameEventBlockersDeclared", who: t.who ?? "self", ...(t.filter ? {filter: t.filter} : {}), ...(t.each === "attacker" ? {eachBlocked: true} : {}),
      ...(t.blocked ? {blocked: t.blocked} : {})} : null),
  /* "When this creature becomes monstrous" (Protector of the Wastes; CR 701.37b): this permanent given the designation
     (effects/attributes.mjs) -- once, since it stays monstrous until it leaves the battlefield. */
  "becomes monstrous": (t) => ((t.who ?? "self") === "self" ? {on: "GameEventCardAttribute", attribute: "monstrous", who: "self"} : null),
  /* "When this Class becomes level 2" (Caretaker's Talent, Wizard Class; wave 4c): this permanent's level set to `level` from
     below it, by its level ability (CR 716.2a; effects/permanents.mjs, setState) -- an ability of that level itself, had
     once the Class is that level (`level` on the ability, classLevel below), so it sees its own level arrive (CR 603.2). */
  "becomes level": (t) => ((t.who ?? "self") === "self" && Number.isInteger(t.level) && t.level >= 2 ? {on: "GameEventCardLevel", who: "self", level: t.level} : null),
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
  /* "Except the first one they draw in each of their draw steps" (Orcish Bowmasters, wave 4b): `exceptFirstInDrawStep`. */
  drawn: (t) => (t.nthThisTurn === undefined || (Number.isInteger(t.nthThisTurn) && t.nthThisTurn >= 1)) && [undefined, true].includes(t.exceptFirstInDrawStep)
    ? {on: "GameEventCardChangeZone", from: "Library", to: "Hand", drawn: true, drawer: t.drawer ?? "you",
      ...(t.nthThisTurn !== undefined ? {nthThisTurn: t.nthThisTurn} : {}), ...(t.exceptFirstInDrawStep ? {exceptFirstInDrawStep: true} : {})} : null,
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
  /* "Whenever a permanent becomes untapped" (Mesmeric Orb; CR 701.26b): the same, untapped (rules/trigger.mjs). */
  "becomes untapped": (t) => (ARRIVALS.includes(t.who ?? "self") ? {on: "GameEventCardTapped", untapped: true, who: t.who ?? "self", ...(t.filter ? {filter: t.filter} : {})} : null),
  /* "Whenever you discard a card", "whenever an opponent discards a land card" (CR 701.9): `discarder` you, opponent or
     any; `filter` the card discarded. "When you discard this card" (Titanbones, Towering Heart; `who: "self"`): this card,
     from where it went (rules/trigger.mjs). "Whenever a player discards one or more cards" (`batch`): once for each player. */
  discarded: (t) => ([undefined, "self"].includes(t.who) ? {on: "GameEventCardChangeZone", to: "Graveyard", discarded: true, discarder: t.discarder ?? "you",
    ...(t.filter ? {filter: t.filter} : {}), ...(t.who === "self" ? {who: "self"} : {})} : null),
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
    /* What follows paying an "unless" cost (Divert Disaster's Lander). */
    effectsIn(effect.whenPaid, out);
    /* What follows a sacrifice declined (Braids, Arisen Nightmare). */
    effectsIn(effect.ifNot, out);
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
  if ((ability.targets ?? []).length || !cost.every((a) => (["{T}", "mana", "payLife"].includes(a?.atom) && fixedLife(a)) || (a?.atom === "sacrifice" && (a.self === true || a.selector))
    || (["addCounters", "removeCounters"].includes(a?.atom) && a.self === true && typeof a.counter === "string")
    /* "{T}, Mill a card: Add {C}" (Millikin): its controller's top N cards, milled as the cost is paid (CR 701.17). */
    || (a?.atom === "mill" && Number.isInteger(a.count ?? 1) && (a.count ?? 1) >= 1)
    /* "{T}, Tap an untapped creature you control: Add one mana of any color" (Jaspera Sentinel): one creature the selector
       describes, beside the source's own {T} (rules/actions.mjs, manaTappers) -- or alone: "Tap an untapped artifact you
       control: Add {U}" (Urza, Lord High Artificer), "Tap an untapped legendary creature you control: Add one mana of any
       color" (Relic of Legends; wave 4c), the source among what it may tap if it is one. */
    || (a?.atom === "tapCreature" && (a.count ?? 1) === 1 && Boolean(a.selector) && typeof a.selector === "object")
    /* "{T}, Exile a card from your graveyard: Add {R}" (Rubble Rouser): one card of its controller's graveyard the selector
       describes (rules/actions.mjs, graveyardChoices). */
    || (a?.atom === "exileFromGraveyard" && a.self !== true && (a.count ?? 1) === 1 && Boolean(a.selector) && typeof a.selector === "object")
    /* "{R}, {T}, Exert this land: Add {R}{R}" (Arena of Glory; CR 701.43a): it won't untap during its exerting player's next
       untap step (rules/turn.mjs). */
    || (a?.atom === "exert" && a.self === true)
    /* "Exile this card from your hand: Add {R}" (Simian Spirit Guide; CR 605.1a, 602.2): the card itself, from its owner's hand,
       the ability's own zone. */
    || (a?.atom === "exile" && a.self === true && ability.zone === "hand"))) return "unbuilt";
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
    /* "For each color among permanents you control, add one mana of that color" (Faeburrow Elder, CR 106.1): `each`, all of
       those colors at once, one offer -- not one of them. */
    : first.among && typeof first.among === "object" ? {among: first.among, ...(first.count ? {count: first.count} : {}), ...(first.each === true ? {each: true} : {})}
    /* "Two mana in any combination of colors" (Great Hall of the Citadel). */
    /* "In any combination of {U} and/or {R}" (Vivi Ornitier): the colors it may be. */
    : first.anyCombination === true || (Array.isArray(first.anyCombination) && first.anyCombination.length > 0 && first.anyCombination.every((c) => ["W", "U", "B", "R", "G"].includes(c)))
      ? {anyCombination: first.anyCombination, ...(first.count ? {count: first.count} : {}),
        /* "Two mana of different colors" (Interplanar Beacon): no color twice (`distinct`; rules/actions.mjs, manaAlternatives). */
        ...(first.distinct === true ? {distinct: true} : {})}
    : null;
  if (!adds) return "unbuilt";
  /* "{T}: Add {C}. If Gemstone Caverns has a luck counter on it, instead add one mana of any color" (wave 4b): `instead`, what
     it adds while its permanent has a counter of that kind -- one mana of any color, or a fixed mana -- read as it is
     activated (rules/mana.mjs, manaAbilityNow). Beside a fixed mana only. */
  const instead = first.instead === undefined ? null
    : adds.produces && !Array.isArray(adds.produces) && typeof first.instead?.counter === "string" && Object.keys(first.instead).length === 2
      && (first.instead.anyColor === true || MANA(first.instead.mana))
      ? {counter: first.instead.counter, ...(first.instead.anyColor === true ? {anyColor: true} : {produces: {...first.instead.mana}})} : undefined;
  if (instead === undefined) return "unbuilt";
  /* "Spend this mana only to cast a creature spell of the chosen type" (CR 106.6; rules/restricted-mana.mjs): a spell or
     an ability's source it may pay for, each a selector, and "that spell can't be countered" -- read as every addMana's
     is, where the compiler walks an ability's effects. */
  const mana = cost.find((a) => a.atom === "mana");
  const life = cost.filter((a) => a.atom === "payLife").reduce((n, a) => n + (a.amount ?? 0), 0);
  return {id, kind: "mana", tapSelf: cost.some((a) => a.atom === "{T}"), ...adds, ...(instead ? {instead} : {}), text: ability.text,
    ...(mana ? {cost: mana.cost} : {}), ...(life ? {payLife: life} : {}), ...(then.length ? {then} : {}),
    ...(cost.some((a) => a.atom === "sacrifice" && a.self === true) ? {sacrificeSelf: true} : {}),
    /* Exert this permanent (Arena of Glory; CR 701.43a), exile this card from the hand (Simian Spirit Guide). */
    ...(cost.some((a) => a.atom === "exert" && a.self === true) ? {exertSelf: true} : {}),
    ...(cost.some((a) => a.atom === "exile" && a.self === true) ? {zone: "hand", exileSelf: true} : {}),
    /* "Mill a card" as part of the cost (Millikin): how many. */
    ...(cost.some((a) => a.atom === "mill") ? {millCost: cost.filter((a) => a.atom === "mill").reduce((n, a) => n + (a.count ?? 1), 0)} : {}),
    /* "Tap an untapped creature you control" (Jaspera Sentinel): which creature is the player's choice, one offer each. */
    ...(cost.find((a) => a.atom === "tapCreature") ? {tapCreature: cost.find((a) => a.atom === "tapCreature").selector} : {}),
    /* "Exile a card from your graveyard" (Rubble Rouser): which card is the player's choice, one offer each. */
    ...(cost.find((a) => a.atom === "exileFromGraveyard") ? {exileFromGraveyard: cost.find((a) => a.atom === "exileFromGraveyard").selector} : {}),
    /* "Sacrifice a creature: Add {C}{C}" (Ashnod's Altar): which creature is the player's choice, one offer each. */
    ...(cost.find((a) => a.atom === "sacrifice" && a.selector) ? {sacrifice: cost.find((a) => a.atom === "sacrifice" && a.selector).selector} : {}),
    /* "Activate only if you control a Swamp" (CR 602.5b; script/condition.mjs). */
    ...(ability.condition ? {condition: ability.condition} : {}),
    ...(counterCost.length ? {counterCost} : {}), ...(ability.limit ? {limit: ability.limit} : {}),
    ...(first.spendOnly ? {spendOnly: first.spendOnly} : {}),
    /* "This mana can't be spent to cast spells from your hand" (Heartwood Crafter; CR 106.6, rules/restricted-mana.mjs). */
    ...(first.cantSpend ? {cantSpend: first.cantSpend} : {}),
    /* "When that mana is spent to cast a creature spell that shares a creature type with your commander, scry 1" (Path of
       Ancestry; CR 106.6): what the mana does when it is spent (rules/restricted-mana.mjs). */
    ...(first.whenSpent ? {whenSpent: first.whenSpent} : {})};
}
/* What mana that does something when it is spent says (CR 106.6): the spells it triggers for, a selector, and what it then
   does -- effects held to the primitives, as a triggered ability's are. Not with a spending restriction as well, yet. */
function whenSpentProblems(effect) {
  const when = effect.whenSpent;
  if (when === undefined) return [];
  /* Or what the spell gains, not a trigger: "If any of that mana is spent on a creature spell, it gains haste until end of
     turn" (Arena of Glory) -- keywords the permanent it becomes has until end of turn (`gains`, rules/actions.mjs). */
  const gains = Array.isArray(when?.gains) && when.gains.length > 0 && when.gains.every((k) => typeof k === "string" && KEYWORDS_WITH_BEHAVIOR.has(k)) && when.effects === undefined;
  if (!when || typeof when !== "object" || !when.spell || (!gains && (!Array.isArray(when.effects) || !when.effects.length)) || typeof when.text !== "string")
    return ["addMana: what its mana does when spent is {spell, effects, text}, or {spell, gains, text}"];
  const problems = [];
  try { compileSelector({...when.spell, what: "card"}); } catch (error) { problems.push(`addMana: the spells its mana triggers for: ${error.message}`); }
  for (const inner of effectsIn(when.effects ?? [])) if (!isBuilt(inner.effect)) problems.push(`${inner.effect}: declared, not built`);
  if (effect.spendOnly !== undefined) problems.push("addMana: mana that is restricted and does something when spent is not built");
  return problems;
}
function spendOnlyValid(only) {
  if (!only || typeof only !== "object" || Array.isArray(only) || !Object.keys(only).every((k) => SPEND_ONLY_KEYS.includes(k))) return false;
  if (!only.spell && !only.ability && !only.abilitySource) return false;
  if ("uncounterable" in only && only.uncounterable !== true) return false;
  try {
    if (only.spell) compileSelector({...only.spell, what: "card"});
    if (only.ability) compileSelector({...only.ability, what: "permanent"});
    if (only.abilitySource) compileSelector({...only.abilitySource, what: "card"});
  } catch { return false; }
  return true;
}

/* "WHEN THAT CREATURE DIES THIS TURN" (CR 603.7): a delayed trigger that waits for an event says so in a triggered
   ability's words (`when`, compiled by TRIGGERS), with `who` the object it waits on when that is a target, "that card"
   or "self" -- remembered as the trigger is made (`watch`, effects/permanents.mjs) -- and `thisTurn` for one that lasts
   the turn (CR 603.7b). One that waits for a moment says `at`: "end step" or "upkeep" -- or "your upkeep", the next upkeep
   of its controller's own turn ("exile those creatures at the beginning of your next upkeep", Rally the Ancestors). */
/* "At end of combat" (Wall of Junk; CR 511.2) and "at the beginning of the declare attackers step on your next turn"
   (Meandering Towershell) too: the next end of combat step, and that step of a turn of its controller's after this one. */
/* "At the beginning of your next main phase" (Mana Drain; CR 505.1): "your next main", the next main phase of a turn of its
   controller's, precombat or postcombat -- this turn's postcombat one, made in its precombat one (rules/trigger.mjs). */
const DELAYED_MOMENTS = ["end step", "upkeep", "your upkeep", "end of combat", "your next declare attackers", "your next main"];
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
        /* A DELAYED TRIGGERED MANA ABILITY (CR 605.1b): one that waits on a mana ability and adds a fixed mana, with no target
           -- "until end of turn, whenever you tap a Mountain for mana, add an additional {R}" (Molten Tide). Not put on the
           stack: what it adds is added with the mana ability that triggered it (rules/trigger.mjs, manaTriggered). */
        const [adds] = rest.effects ?? [];
        if (on?.on === "GameEventManaPool" && (rest.effects ?? []).length === 1 && MANA(adds?.mana)
          && Object.values(adds.mana).every((n) => Number.isInteger(n))) {
          /* Its mana is added to the pool as plain mana: mana that can't be spent on some things (Heartwood Crafter's,
             rules/restricted-mana.mjs) is not carried there yet. */
          if (adds.cantSpend !== undefined) problems.push(`${when.on}: a delayed triggered mana ability whose mana can't be spent on some things is not built`);
          on.manaAbility = {mana: {...adds.mana}, ...(adds.who === "that player" ? {toTapper: true} : {})};
        }
        out = {...rest, on: on ?? {on: null}, ...(named ? {watch: when.who} : {})};
      } else if (!DELAYED_MOMENTS.includes(out.at ?? "end step")) problems.push(`${out.at}: a moment no delayed trigger waits for yet`);
    }
    for (const key of ["effects", "then", "otherwise"]) if (Array.isArray(out[key])) out[key] = out[key].map(walk);
    if (Array.isArray(out.modes)) out.modes = out.modes.map((mode) => ({...mode, effects: (mode.effects ?? []).map(walk)}));
    return out;
  };
  return abilities.map((ability) => (Array.isArray(ability.effects) ? {...ability, effects: ability.effects.map(walk)} : ability));
}

/* A CLASS LEVEL'S ABILITIES (CR 716.2a): a level bar stands for two abilities. The first is an activated ability the
   script writes out -- it sets the Class's level to N (`setState` with `level`), from level N-1 only, at sorcery speed
   (`condition: {level: {exactly: N-1}}`, `timing: "sorcery"`). The second grants the level's abilities while the Class's
   level is N or more: each of those abilities says `level: N`. A static or an
   activated ability has it on that condition (script/condition.mjs, `level`); a triggered one triggers only while its
   permanent has it (rules/trigger.mjs) -- a gate as the event happens, never an intervening "if" asked again as it
   resolves (CR 603.4 is about an "if" in the ability's own words). Any other kind at a level is refused until something
   reads it there. */
function classLevel(ability, problems) {
  if (!ability || typeof ability !== "object" || ability.level === undefined) return ability;
  const {level, ...rest} = ability;
  if (!(Number.isInteger(level) && level >= 2)) { problems.push(`${ability.text}: a Class level is a whole number, 2 or more (level 1 is the Class's own text, CR 716.3)`); return rest; }
  if (ability.kind === "triggered") return ability;
  if (ability.kind !== "static" && ability.kind !== "activated") { problems.push(`${ability.text}: a ${ability.kind} ability gained at a Class level is not built; a static, activated or triggered one is`); return rest; }
  if (ability.condition?.level !== undefined) problems.push(`${ability.text}: its Class level is \`level\`, not a condition of its own`);
  return {...rest, condition: {...(ability.condition ?? {}), level: {atLeast: level}}};
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
/* What an emblem's abilities are compiled under (CR 114.3: it has no types, no mana cost and no color) -- the abilities
   alone are kept. */
const EMBLEM_IDENTITY = Object.freeze({name: "An emblem", oracleId: "emblem", types: ["Enchantment"]});
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
    /* "A token that's a copy of that creature, except ... it has 'When this token leaves the battlefield, ...'" (Hofri
       Ghostforge; CR 707.9a): what a copy has besides the original's, compiled the same way, in place. */
    if (effect.effect === "copyPermanent" && effect.except?.addAbilities !== undefined) {
      const given = compileGrant(effect.except.addAbilities, text, problems);
      if (given) effect.except = {...effect.except, addAbilities: given.abilities, ...(given.keywords.length ? {addKeywords: [...(effect.except.addKeywords ?? []), ...given.keywords]} : {})};
    }
    /* "You get an emblem with '...'" (CR 114.2; effects/permanents.mjs, emblem): its abilities compiled as a card's are, in
       place. What works from the command zone is built (114.4): a triggered ability, a replacement effect, a rule
       changed for players (rules/statics.mjs, playerRuleChanged), and a static ability in a layer (rules/layers.mjs,
       gatherEffects: Liliana of the Dark Realms' "Swamps you control have ..."). */
    if (effect.effect === "emblem") {
      const list = effect.abilities;
      if (!Array.isArray(list) || !list.length) { problems.push(`${text}: an emblem's abilities are a list, with at least one`); continue; }
      for (const ability of list) if (!(["triggered", "replacement"].includes(ability?.kind) || (ability?.kind === "static" && typeof ability.rule === "string" && ability.affects?.what === "player")
        || (ability?.kind === "static" && ability.rule === undefined && Number.isInteger(ability.layer))))
        problems.push(`${text}: an emblem's ${ability?.kind ?? "nameless"} ability -- only triggered and replacement abilities, a rule changed for players and a static in a layer work from the command zone yet`);
      const {definition, problems: inner} = compileScript({schema: SCRIPT_SCHEMA, identity: EMBLEM_IDENTITY, oracleText: "", abilities: list});
      problems.push(...inner.map((problem) => `${text}: ${problem}`));
      if (definition) effect.abilities = definition.abilities;
      continue;
    }
    if (effect.abilities === undefined) continue;
    if (effect.effect !== "pump") problems.push(`${text}: ${effect.effect} gives no abilities; a pump does`);
    const given = compileGrant(effect.abilities, text, problems);
    if (given) { effect.abilities = given.abilities; if (given.keywords.length) effect.keywords = [...(effect.keywords ?? []), ...given.keywords]; }
  }
}

/* WHAT A GIFT GIVES (CR 702.174d-i): the chosen player's -- the opponent promised it (script/bind.mjs, "the chosen player"). */
const GIFTS = Object.freeze({
  "a card": [{effect: "draw", who: "the chosen player", count: 1}],
  "a Food": [{effect: "createToken", controller: "the chosen player", count: 1, token: {predefined: "Food"}}],
  "a tapped Fish": [{effect: "createToken", controller: "the chosen player", count: 1, tapped: true,
    token: {name: "Fish", types: ["Creature"], subtypes: ["Fish"], colors: ["U"], power: 1, toughness: 1}}],
  "an extra turn": [{effect: "addTurn", who: "the chosen player"}],
  "a Treasure": [{effect: "createToken", controller: "the chosen player", count: 1, token: {predefined: "Treasure"}}],
  "an Octopus": [{effect: "createToken", controller: "the chosen player", count: 1, token: {name: "Octopus", types: ["Creature"], subtypes: ["Octopus"], colors: ["U"], power: 8, toughness: 8}}],
});

export function compileScript(script) {
  const {valid, errors} = validateScript(script);
  if (!valid) return {definition: null, problems: errors.map((e) => `${e.path}: ${e.message}`)};

  const problems = [];
  const identity = script.identity;
  const abilities = [];
  const keywords = [];
  let spell = null;
  let multikicker = null, kicker = null;
  /* Offspring (CR 702.175a): its cost, and its trigger, put on the spell once it is known (below). */
  let offspring = null;
  /* Replicate's cost (CR 702.56a), put on the spell once it is known (below). */
  let replicate = null;
  /* Escalate's cost (CR 702.120a), put on the spell once its modes are known (below). */
  let escalate = null;
  /* Tiered (CR 702.183a): each mode's own cost, put on the spell once its modes are known (below). */
  let tiered = false;
  /* Spree (CR 702.172a): the same, each mode chosen its cost paid (below). */
  let spree = false;
  /* Gift (CR 702.174a): its additional cost and what the chosen player gets, put on the spell once it is known (below). */
  let gift = null;

  /* "ENCHANT CREATURE" (CR 702.5, 303.4): an Aura spell targets what it will enchant, and the permanent may be attached
     only to what the same words describe. One keyword ability, `target` its selector; `hostile` when the Aura is a
     curse (Pacifism), so a pilot aims it at an opponent's creature. */
  let enchant = null;
  withDelayedTriggers(script.abilities, problems).map((ability) => classLevel(ability, problems)).forEach((ability, index) => {
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
    /* SADDLE N (CR 702.171a; Bounding Felidar, library load L4): "Tap any number of other untapped creatures you control with
       total power N or greater: This permanent becomes saddled until end of turn. Saddle only as a sorcery" -- crew's cost
       (rules/actions.mjs, crewChoices: other creatures, a summoning-sick one among them; `saddle`, never "crews Vehicles as
       though"), and the designation an effect on this object until end of turn (keywords/designations.mjs, isSaddled). */
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "saddle") {
      if (!(Number.isInteger(ability.amount) && ability.amount >= 0)) problems.push(`${ability.text}: saddle needs its number`);
      if (!(identity.subtypes ?? []).includes("Mount")) problems.push(`${ability.text}: saddle on a card that is not a Mount`);
      abilities.push({id, kind: "activated", text: ability.text, cost: [{atom: "crew", power: ability.amount ?? 0, saddle: true}], timing: "sorcery",
        effects: [{effect: "effectUntil", rule: "saddled", targets: "self", until: "end-of-turn"}]});
      keywords.push("Saddle");
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
      abilities.push({id, kind: "activated", text: ability.text, timing: "sorcery", cost: [{atom: "tapCreature", selector: {types: ["Creature"], another: true}}],
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
    /* HIDEAWAY N (CR 702.75a; Watcher for Tomorrow): the keyword IS a triggered ability -- "When this permanent enters,
       look at the top N cards of your library. Exile one of them face down and put the rest on the bottom of your library
       in a random order" -- the card exiled face down, seen by the player who controls this permanent (406.3; projection.mjs),
       and linked to the ability that names "the exiled card" (CR 607.2a; effects/asking.mjs, dig's `link`). Not the old
       "Hideaway" with no number (702.75b): its Oracle text says "Hideaway 4" now, and "enters tapped" on a line of its own. */
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "hideaway") {
      if (!(Number.isInteger(ability.amount) && ability.amount >= 1)) problems.push(`${ability.text}: hideaway needs its number, 1 or more`);
      abilities.push({id, kind: "triggered", text: ability.text, trigger: TRIGGERS.enters({who: "self"}),
        effects: [{effect: "dig", count: ability.amount ?? 1, take: 1, to: "exile", faceDown: true, link: true, rest: "bottom", random: true}]});
      keywords.push("Hideaway");
      return;
    }
    /* FABRICATE N (CR 702.123a; Marionette Apprentice, wave 4c k2): the keyword IS a triggered ability -- "When this permanent
       enters, you may put N +1/+1 counters on it. If you don't, create N 1/1 colorless Servo artifact creature tokens" -- which
       of the two, its controller's choice as it resolves (a modal then, not as it goes on the stack: its one effect is the
       branch), and the Servos alone when it is no longer on the battlefield to put counters on (the card's ruling). Each
       instance triggers separately (702.123b). */
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "fabricate") {
      if (!(Number.isInteger(ability.amount) && ability.amount >= 1)) problems.push(`${ability.text}: fabricate needs its number, 1 or more`);
      const n = ability.amount ?? 1, many = n === 1 ? "" : "s";
      const servos = {effect: "createToken", count: n, token: {name: "Servo", types: ["Artifact", "Creature"], subtypes: ["Servo"], colors: [], power: 1, toughness: 1}};
      abilities.push({id, kind: "triggered", text: ability.text, trigger: TRIGGERS.enters({who: "self"}),
        effects: [{effect: "branch", if: {present: {self: true}}, otherwise: [servos],
          then: [{effect: "modal", title: `Fabricate ${n}`, modes: [
            {text: `Put ${n === 1 ? "a" : n} +1/+1 counter${many} on it`, effects: [{effect: "putCounter", targets: "self", counter: "+1/+1", count: n}]},
            {text: `Create ${n === 1 ? "a" : n} 1/1 Servo token${many}`, effects: [servos]}]}]}]});
      keywords.push("Fabricate");
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
    /* AFFINITY FOR [TEXT] (CR 702.41a; Thought Monitor, wave 4c): "This spell costs {1} less to cast for each [text] you
       control" -- the keyword IS that static ability of the spell's own (`this-costs-less`, rules/statics.mjs costReduction),
       `of` the permanents it counts, a selector, "you control" added. Each instance applies (702.41b). */
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "affinity") {
      const of = ability.of;
      const counted = {...(of ?? {}), what: "permanent", controller: "you"};
      if (!(of && typeof of === "object" && !Array.isArray(of) && of.controller === undefined && of.what === undefined))
        problems.push(`${ability.text}: affinity says what it counts, \`of\` a selector of permanents with no controller or what of its own`);
      else try { compileSelector(counted); } catch (error) { problems.push(`${ability.text}: ${error.message}`); }
      abilities.push({id, kind: "static", rule: "this-costs-less", text: ability.text, affects: {self: true}, amount: {count: counted}});
      keywords.push("Affinity");
      return;
    }
    /* EXALTED (CR 702.83a; Ignoble Hierarch, wave 4b): "Whenever a creature you control attacks alone, that creature gets +1/+1
       until end of turn" -- the keyword IS that triggered ability, "alone" the only creature declared as an attacker (702.83b,
       506.5; rules/trigger.mjs). Each instance triggers, on any permanent that has it. */
    /* CASCADE (CR 702.85a; Apex Devastator): "When you cast this spell, exile cards from the top of your library until you
       exile a nonland card that costs less. You may cast it without paying its mana cost. Put the exiled cards on the bottom
       in a random order" -- the keyword IS that triggered ability, of the spell on the stack; "costs less", a lesser mana
       value than the spell's (702.85a), so only the card found may be cast; each instance triggers (702.85c). */
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "cascade") {
      abilities.push({id, kind: "triggered", text: ability.text, trigger: TRIGGERS["spell cast"]({who: "self"}),
        effects: [{effect: "digUntil", exile: true, selector: {nonTypes: ["Land"]}, manaValueBelow: {manaValueOf: "that card"}, count: 1, remember: "all"},
          {effect: "play", from: "targets", targets: "remembered", free: true, manaValueAtMost: {manaValueOf: "that card", plus: -1}},
          {effect: "moveZone", targets: "remembered", to: "library", random: true}]});
      keywords.push("Cascade");
      return;
    }
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "exalted") {
      abilities.push({id, kind: "triggered", text: ability.text, trigger: TRIGGERS.attacks({who: "any", alone: true, filter: {types: ["Creature"], controller: "you"}}),
        effects: [{effect: "pump", targets: "that card", power: 1, toughness: 1}]});
      keywords.push("Exalted");
      return;
    }
    /* EXTORT (CR 702.101a; Crypt Ghast, wave 4b): "Whenever you cast a spell, you may pay {W/B}. If you do, each opponent loses 1
       life and you gain life equal to the total life lost this way" -- the keyword IS that triggered ability: the payment asked
       as it resolves, at most once (its ruling), from the pool or the payer's mana sources (effects/asking.mjs, unlessPays's
       `mana`), and the life gained what the opponents lost (script/amount.mjs, lifeLostThisWay). Instances trigger separately
       (702.101b). */
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "extort") {
      abilities.push({id, kind: "triggered", text: ability.text, trigger: TRIGGERS["spell cast"]({caster: "you"}),
        effects: [{effect: "unlessPays", who: "you", mana: "{W/B}", ifPaid: true,
          effects: [{effect: "loseLife", who: "opponent", amount: 1}, {effect: "gainLife", amount: {lifeLostThisWay: true}}]}]});
      keywords.push("Extort");
      return;
    }
    /* FIREBENDING N (CR 702.189a; Fire Nation Cadets, Train C phase 2): the keyword IS a triggered ability -- "Whenever this
       creature attacks, add N {R}" -- mana its controller does not lose as combat's steps end, until the combat phase does
       (addMana's `untilEndOfCombat`, script/effects/resources.mjs; rules/turn.mjs). Each instance triggers. */
    /* MOBILIZE N (CR 702.181a; Voice of Victory, card load w4d L1): the keyword IS a triggered ability -- "Whenever this
       creature attacks, create N tapped and attacking 1/1 red Warrior creature tokens. Sacrifice them at the beginning of
       the next end step." Whom each attacks is its controller's choice (CR 508.4; effects/permanents.mjs, enterAttacking).
       Each instance triggers. */
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "mobilize") {
      if (!(Number.isInteger(ability.amount) && ability.amount >= 1)) problems.push(`${ability.text}: mobilize needs its number, 1 or more`);
      abilities.push({id, kind: "triggered", text: ability.text, trigger: TRIGGERS.attacks({who: "self"}),
        effects: [{effect: "createToken", count: ability.amount ?? 1, tapped: true, attacking: true, atEndStep: "sacrifice",
          token: {name: "Warrior", types: ["Creature"], subtypes: ["Warrior"], colors: ["R"], power: 1, toughness: 1}}]});
      keywords.push("Mobilize");
      return;
    }
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "firebending") {
      if (!(Number.isInteger(ability.amount) && ability.amount >= 1)) problems.push(`${ability.text}: firebending needs its number, 1 or more`);
      abilities.push({id, kind: "triggered", text: ability.text, trigger: TRIGGERS.attacks({who: "self"}),
        effects: [{effect: "addMana", mana: {R: ability.amount ?? 1}, untilEndOfCombat: true}]});
      keywords.push("Firebending");
      return;
    }
    /* MENTOR (CR 702.134a; Legion Warboss): "Whenever this creature attacks, put a +1/+1 counter on target attacking creature
       with lesser power" -- the keyword IS that triggered ability; "lesser power" is less than this creature's power as it
       resolves, or as it last was if it has left (script/filter.mjs, `power.lessThan: "self"`; CR 608.2b). Instances
       trigger separately (702.134b). */
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "mentor") {
      abilities.push({id, kind: "triggered", text: ability.text, trigger: TRIGGERS.attacks({who: "self"}),
        targets: [{what: "permanent", types: ["Creature"], attacking: true, power: {lessThan: "self"}}],
        effects: [{effect: "putCounter", targets: {target: 0}, counter: "+1/+1", count: 1}]});
      keywords.push("Mentor");
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
    /* DREDGE N (CR 702.52a; Life from the Loam, wave 4c k2): kept on the card as a static ability with its N, read in its owner's
       graveyard wherever they would draw a card (script/effects/zones.mjs, dredgers). */
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "dredge") {
      if (!(Number.isInteger(ability.amount) && ability.amount >= 1)) problems.push(`${ability.text}: dredge needs its number, 1 or more`);
      abilities.push({id, kind: "static", rule: "dredge", text: ability.text, amount: ability.amount ?? 0, affects: {what: "card", self: true}});
      keywords.push("Dredge");
      return;
    }
    /* REBOUND (CR 702.88a): kept on the card as a static ability, read as the spell leaves the stack (rules/stack.mjs): cast
       from its owner's hand and resolved, it is exiled, and its caster may cast it free at their next upkeep. Only on an
       instant or sorcery (702.88a). */
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "rebound") {
      if (!(identity.types ?? []).some((t) => t === "Instant" || t === "Sorcery")) problems.push(`${ability.text}: rebound on a card that is not an instant or sorcery`);
      abilities.push({id, kind: "static", rule: "rebound", text: ability.text, affects: {what: "card", self: true}});
      keywords.push("Rebound");
      return;
    }
    /* ECHO (CR 702.30a): "At the beginning of your upkeep, if this permanent came under your control since the beginning of
       your last upkeep, sacrifice it unless you pay [cost]" -- the keyword IS that triggered ability: an intervening "if"
       (`sinceYourLastUpkeep`, script/condition.mjs; asked again as it resolves, CR 603.4), and "unless you pay" asked of its
       controller (effects/asking.mjs, unlessPays: a mana cost, colored symbols and all). A mana cost only, yet. */
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "echo") {
      const cost = Array.isArray(ability.cost) ? ability.cost : [];
      let parsed = null;
      try { parsed = cost.length === 1 && cost[0]?.atom === "mana" ? parseManaCost(cost[0].cost ?? "") : null; } catch { /* refused below */ }
      if (!parsed || !parsed.symbols.length || parsed.variable > 0) problems.push(`${ability.text}: an echo cost of mana, once`);
      abilities.push({id, kind: "triggered", text: ability.text, trigger: TRIGGERS.upkeep({}), condition: {sinceYourLastUpkeep: true},
        effects: [{effect: "unlessPays", mana: String(cost[0]?.cost ?? ""), effects: [{effect: "moveZone", targets: "self", sacrifice: true}]}]});
      keywords.push("Echo");
      return;
    }
    /* PROTECTION FROM [QUALITY] (CR 702.16a), printed: "protection from black" (Karmic Guide) -- the keyword with its quality
       in `from` ({colors}, {types}, {multicolored: true} -- "protection from multicolored", Argentum Masticore -- or
       "everything", or {subtypes} -- "protection from Humans", Yawgmoth, Thran Physician), compiled to the static `protection`
       on this permanent; what protection does (DEBT, CR 702.16b-f) is
       read where each thing happens (rules/protection.mjs). */
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "protection") {
      const from = ability.from;
      const valid = from === "everything" || (from && typeof from === "object" && !Array.isArray(from) && Object.keys(from).length > 0
        && Object.keys(from).every((k) => ["colors", "types", "subtypes", "multicolored"].includes(k)) && [undefined, true].includes(from.multicolored)
        && (from.colors ?? []).every((c) => ["W", "U", "B", "R", "G"].includes(c)) && [...(from.types ?? []), ...(from.subtypes ?? [])].every((t) => typeof t === "string" && t.length > 0)
        && ([...(from.colors ?? []), ...(from.types ?? []), ...(from.subtypes ?? [])].length > 0 || from.multicolored === true));
      if (!valid) problems.push(`${ability.text}: protection says from what: \`from\`, {colors: [...]}, {types: [...]}, {subtypes: [...]}, {multicolored: true} or "everything"`);
      abilities.push({id, kind: "static", rule: "protection", text: ability.text, affects: {self: true}, from: valid ? structuredClone(from) : {}});
      keywords.push("Protection");
      return;
    }
    /* PARADIGM (CR 702.192a; Germination Practicum): two spell abilities, done as the spell resolves -- when no spell of
       that name its controller controlled has resolved before in the game, a delayed trigger lasting the game, at each of
       their precombat main phases, that makes a copy of the spell in exile they may cast free; and the spell is exiled.
       Kept on the card as a static ability, read as the spell leaves
       the stack (rules/stack.mjs). Only an instant or sorcery is a spell that resolves and is then exiled. */
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "paradigm") {
      if (!(identity.types ?? []).some((t) => t === "Instant" || t === "Sorcery")) problems.push(`${ability.text}: paradigm on a card that is not an instant or sorcery`);
      abilities.push({id, kind: "static", rule: "paradigm", text: ability.text, affects: {what: "card", self: true}});
      keywords.push("Paradigm");
      return;
    }
    /* ---- KEYWORD ABILITIES OF CR 702 THAT ARE A TRIGGER, A STATIC OR A COST, EACH COMPILED ONCE, HERE (Train B, X11) ---- */
    const word = ability.kind === "keyword" ? String(ability.keyword).toLowerCase() : null;
    /* FLANKING (CR 702.25a): "Whenever this creature becomes blocked by a creature without flanking, the blocking creature
       gets -1/-1 until end of turn" -- once for each such blocker (CR 509.3d), each instance separately (702.25b); the
       blocker read as blockers are declared (509.3f; rules/trigger.mjs, `blockedBy`). */
    if (word === "flanking") {
      abilities.push({id, kind: "triggered", text: ability.text, trigger: {on: "GameEventBlockersDeclared", blockedBy: true, who: "self", filter: {types: ["Creature"], nonKeywords: ["Flanking"]}},
        effects: [{effect: "pump", targets: "that card", power: -1, toughness: -1}]});
      keywords.push("Flanking");
      return;
    }
    /* BUSHIDO N (CR 702.45a; Hand of Honor, library load L4): "Whenever this creature blocks or becomes blocked, it gets +N/+N
       until end of turn" -- the keyword IS that triggered ability, once as it is declared a blocker (CR 509.3a) or once as it
       becomes blocked, however many block it (509.3c; rules/trigger.mjs, `blocksOrBlocked`). Each instance triggers
       separately (702.45b). */
    if (word === "bushido") {
      if (!(Number.isInteger(ability.amount) && ability.amount >= 1)) problems.push(`${ability.text}: bushido needs its number, 1 or more`);
      abilities.push({id, kind: "triggered", text: ability.text, trigger: {on: "GameEventBlockersDeclared", blocksOrBlocked: true, who: "self"},
        effects: [{effect: "pump", targets: "self", power: ability.amount ?? 0, toughness: ability.amount ?? 0}]});
      keywords.push("Bushido");
      return;
    }
    /* RIOT (CR 702.136a; Ghor-Clan Wrecker): "You may have this permanent enter with an additional +1/+1 counter on it. If you
       don't, it gains haste" -- a replacement on its own entering, its controller asked once it is there (rules/replacement.mjs,
       rules/entering.mjs). Each instance works separately (702.136b). Only on a card that enters as a permanent. */
    if (word === "riot") {
      if ((identity.types ?? []).some((t) => t === "Instant" || t === "Sorcery")) problems.push(`${ability.text}: riot on a card that never enters the battlefield`);
      abilities.push({id, kind: "replacement", text: ability.text, watches: {event: "enters", who: "self"}, change: {riot: true}});
      keywords.push("Riot");
      return;
    }
    /* DISGUISE [COST] (CR 702.168a; Arno Dorian, Bayek of Siwa, Train C phase 2): kept as the static `disguise` with its
       cost, read where the card could be cast -- cast face down for {3} as a 2/2 creature with ward {2} (rules/actions.mjs,
       withFaceDown; state/index.mjs) -- and on the face-down permanent: turned face up for that cost, a special action
       (702.168d). A mana cost, without X; never on a land, which is not cast. */
    /* MORPH [COST] (CR 702.37a; Akroma, Angel of Fury, Train E): the same, kept as the static `morph` -- cast face down for
       {3} as a 2/2 creature with no text (702.37c, no ward), and turned face up for its morph cost (702.37e). */
    if (word === "disguise" || word === "morph") {
      const cost = Array.isArray(ability.cost) ? ability.cost : [];
      let parsed = null;
      try { parsed = cost.length === 1 && cost[0]?.atom === "mana" ? parseManaCost(cost[0].cost ?? "") : null; } catch { /* refused below */ }
      if (!parsed || !parsed.symbols.length || parsed.variable > 0) problems.push(`${ability.text}: a ${word} cost of mana, without X`);
      if ((identity.types ?? []).includes("Land")) problems.push(`${ability.text}: ${word} on a land, which is never cast`);
      abilities.push({id, kind: "static", rule: word, text: ability.text, cost: structuredClone(cost), affects: {what: "card", self: true}});
      keywords.push(word === "morph" ? "Morph" : "Disguise");
      return;
    }
    /* COMPLEATED (CR 702.150a; Vraska, Betrayal's Sting, Train C phase 2): a planeswalker whose caster paid life for Phyrexian
       mana symbols of its cost enters with two fewer loyalty counters for each (rules/replacement.mjs, enteringModifications;
       rules/actions.mjs remembers the symbols paid with life). Only on a planeswalker card with a Phyrexian symbol in its cost. */
    if (word === "compleated") {
      if (!(identity.types ?? []).includes("Planeswalker") || !/\/P\}/.test(identity.manaCost ?? "")) problems.push(`${ability.text}: compleated is a planeswalker's, with a Phyrexian mana symbol in its cost`);
      keywords.push("Compleated");
      return;
    }
    /* UMBRA ARMOR (CR 702.89a): "If enchanted permanent would be destroyed, instead remove all damage marked on it and destroy
       this Aura" -- the static `umbra-armor` on the Aura, read wherever a permanent would be destroyed (effects/zones.mjs,
       destructionReplaced). Only on an Aura. */
    if (word === "umbra armor") {
      if (!(identity.subtypes ?? []).includes("Aura")) problems.push(`${ability.text}: umbra armor on a card that is not an Aura`);
      abilities.push({id, kind: "static", rule: "umbra-armor", text: ability.text, affects: {what: "permanent", self: true}});
      keywords.push("Umbra armor");
      return;
    }
    /* LIVING WEAPON (CR 702.92a): "When this Equipment enters, create a 0/0 black Phyrexian Germ creature token, then attach
       this Equipment to it" -- the keyword IS that triggered ability; the token remembered, and the Equipment, still on the
       battlefield as it resolves, attached to it (effects/permanents.mjs, attach). Gone by then, nothing is attached, and the
       0/0 Germ is put into its owner's graveyard (CR 704.5f). */
    if (word === "living weapon") {
      if (!(identity.subtypes ?? []).includes("Equipment")) problems.push(`${ability.text}: living weapon on a card that is not an Equipment`);
      abilities.push({id, kind: "triggered", text: ability.text, trigger: TRIGGERS.enters({who: "self"}),
        effects: [{effect: "createToken", count: 1, remember: true, token: {name: "Phyrexian Germ", types: ["Creature"], subtypes: ["Phyrexian", "Germ"], colors: ["B"], power: 0, toughness: 0}},
          {effect: "attach", targets: "remembered"}]});
      keywords.push("Living Weapon");
      return;
    }
    /* EVOLVE (CR 702.100a): "Whenever a creature you control enters, if that creature's power is greater than this creature's
       power and/or that creature's toughness is greater than this creature's toughness, put a +1/+1 counter on this creature"
       -- an intervening "if" (CR 603.4; script/condition.mjs, `evolves`), asked as it triggers and as it resolves. Each
       instance triggers separately (702.100d). */
    if (word === "evolve") {
      abilities.push({id, kind: "triggered", text: ability.text, trigger: TRIGGERS.enters({who: "any", filter: {types: ["Creature"], controller: "you"}}),
        condition: {evolves: true}, effects: [{effect: "putCounter", targets: "self", counter: "+1/+1", count: 1}]});
      keywords.push("Evolve");
      return;
    }
    /* BACKUP N (CR 702.165a): "When this creature enters, put N +1/+1 counters on target creature. If that's another creature,
       it also gains the non-backup abilities of this creature printed below this one until end of turn" -- those printed
       after it on the card, its own and no others (702.165c), fixed here as the card is compiled (702.165d), and given as a
       pump's abilities are (compileGivenIn, below): its keywords and its triggered and activated abilities. "That's another
       creature" is the effect's condition on its target ({about: "target", is: {another: true}}, script/condition.mjs). */
    if (word === "backup") {
      if (!(Number.isInteger(ability.amount) && ability.amount >= 1)) problems.push(`${ability.text}: backup needs its number, 1 or more`);
      const below = (script.abilities ?? []).slice(index + 1).filter((a) => !(a?.kind === "keyword" && String(a.keyword).toLowerCase() === "backup"));
      if (!below.length) problems.push(`${ability.text}: backup gives the abilities printed below it, and none are`);
      abilities.push({id, kind: "triggered", text: ability.text, trigger: TRIGGERS.enters({who: "self"}), targets: [{what: "permanent", types: ["Creature"]}],
        effects: [{effect: "putCounter", targets: {target: 0}, counter: "+1/+1", count: ability.amount ?? 1},
          {effect: "pump", targets: {target: 0}, power: 0, toughness: 0, condition: {about: "target", is: {another: true}}, abilities: structuredClone(below)}]});
      keywords.push("Backup");
      return;
    }
    /* CUMULATIVE UPKEEP [COST] (CR 702.24a): "At the beginning of your upkeep, if this permanent is on the battlefield, put an
       age counter on this permanent. Then you may pay [cost] for each age counter on it. If you don't, sacrifice it." -- the
       keyword IS that triggered ability: its intervening "if" (CR 603.4), an age counter, and "unless you pay" asked of its
       controller (effects/asking.mjs, unlessPays) with the cost counted as it is asked, every age counter on it then
       (702.24b), all of it or none. Generic mana is paid as any generic amount is; a cost with colored symbols, that cost once
       for each counter. A mana cost, or "an opponent gains 1 life" (Wall of Shards, library load L5): `opponentGainsLife`, that
       much life once for each counter, an opponent of the payer's chosen each time (effects/asking.mjs, unlessPays). */
    if (word === "cumulative upkeep") {
      const cost = Array.isArray(ability.cost) ? ability.cost : [];
      const ages = {countersOn: "self", counter: "age"};
      const gains = cost.length === 1 && cost[0]?.atom === "opponentGainsLife" ? cost[0] : null;
      if (gains) {
        if (!(Number.isInteger(gains.amount) && gains.amount >= 1)) problems.push(`${ability.text}: the life an opponent gains is a whole number, 1 or more`);
        abilities.push({id, kind: "triggered", text: ability.text, trigger: TRIGGERS.upkeep({}), condition: {present: {self: true}},
          effects: [{effect: "putCounter", targets: "self", counter: "age", count: 1},
            {effect: "unlessPays", opponentGainsLife: {amount: gains.amount, times: ages}, effects: [{effect: "moveZone", targets: "self", sacrifice: true}]}]});
        keywords.push("Cumulative upkeep");
        return;
      }
      let parsed = null;
      try { parsed = cost.length === 1 && cost[0]?.atom === "mana" ? parseManaCost(cost[0].cost ?? "") : null; } catch { /* refused below */ }
      if (!parsed || !parsed.symbols.length || parsed.variable > 0) problems.push(`${ability.text}: a cumulative upkeep cost of mana, once`);
      const generic = Boolean(parsed) && parsed.symbols.every((s) => s.kind === "generic");
      abilities.push({id, kind: "triggered", text: ability.text, trigger: TRIGGERS.upkeep({}), condition: {present: {self: true}},
        effects: [{effect: "putCounter", targets: "self", counter: "age", count: 1},
          {effect: "unlessPays", ...(generic ? {amount: {...ages, times: parsed.generic}} : {mana: String(cost[0]?.cost ?? ""), manaTimes: ages}),
            effects: [{effect: "moveZone", targets: "self", sacrifice: true}]}]});
      keywords.push("Cumulative upkeep");
      return;
    }
    /* PROWL [COST] (CR 702.76a): "You may pay [cost] rather than pay this spell's mana cost if a player was dealt combat damage
       this turn by a source that, at the time it dealt that damage, was under your control and had any of this spell's
       creature types" -- an alternative cost (CR 118.9; rules/actions.mjs offers it), its condition `prowl` (script/
       condition.mjs), the permanent it becomes marked as cast for it, for "if its prowl cost was paid" (`prowled`). */
    if (word === "prowl") {
      const cost = Array.isArray(ability.cost) ? ability.cost : [];
      if (!cost.length || !cost.every((atom) => atom?.atom === "mana")) problems.push(`${ability.text}: a prowl cost of mana`);
      abilities.push({id, kind: "static", rule: "alternative-cost", prowl: true, condition: {prowl: true}, text: ability.text, cost: structuredClone(cost), affects: {what: "card", self: true}});
      keywords.push("Prowl");
      return;
    }
    /* SPECTACLE [COST] (CR 702.137a; Light Up the Stage): "You may pay [cost] rather than pay this spell's mana cost if an
       opponent lost life this turn" -- an alternative cost (CR 118.9; rules/actions.mjs offers it), its condition the life
       its caster's opponents lost this turn, 1 or more (script/amount.mjs, lifeLostThisTurn "opponents"). A mana cost. */
    if (word === "spectacle") {
      const cost = Array.isArray(ability.cost) ? ability.cost : [];
      if (!cost.length || !cost.every((atom) => atom?.atom === "mana")) problems.push(`${ability.text}: a spectacle cost of mana`);
      abilities.push({id, kind: "static", rule: "alternative-cost", condition: {compare: {count: {lifeLostThisTurn: "opponents"}, atLeast: 1}}, text: ability.text,
        cost: structuredClone(cost), affects: {what: "card", self: true}});
      keywords.push("Spectacle");
      return;
    }
    /* SURGE [COST] (CR 702.117a; Reckless Bushwhacker): "You may pay [cost] rather than pay this spell's mana cost as you cast
       this spell if you or one of your teammates has cast another spell this turn" -- an alternative cost (CR 118.9; rules/
       actions.mjs offers it), its condition `surge` (script/condition.mjs). FREERUNNING [COST] (CR 702.173a; Monastery Raid):
       the same, "if a player was dealt combat damage this turn by a creature that, at the time it dealt that damage, was an
       Assassin creature or a commander under your control" -- its condition `freerunning`. Each marks what it casts as cast
       for it (`paidFor`; rules/actions.mjs, rules/stack.mjs), for "if its surge cost was paid", "if this spell's freerunning
       cost was paid" (script/condition.mjs, `paidFor`). A mana cost, which may have {X} ("Freerunning {X}{R}"). */
    if (word === "surge" || word === "freerunning") {
      const cost = Array.isArray(ability.cost) ? ability.cost : [];
      let parsed = null;
      try { parsed = cost.length === 1 && cost[0]?.atom === "mana" ? parseManaCost(cost[0].cost ?? "") : null; } catch { /* refused below */ }
      if (!parsed || !parsed.symbols.length) problems.push(`${ability.text}: a ${word} cost of mana, once`);
      abilities.push({id, kind: "static", rule: "alternative-cost", paidFor: word, condition: {[word]: true}, text: ability.text, cost: structuredClone(cost), affects: {what: "card", self: true}});
      keywords.push(word === "surge" ? "Surge" : "Freerunning");
      return;
    }
    /* DASH [COST] (CR 702.109a; Ragavan, Nimble Pilferer, wave 4d L3): "You may cast this card by paying [cost] rather than its
       mana cost" -- an alternative cost (CR 118.9) from wherever the card may be cast, marked as cast for it (`paidFor`) --
       and, if it was, the permanent it becomes has haste and returns to its owner's hand at the beginning of the next end step
       (rules/stack.mjs). A mana cost. */
    if (word === "dash") {
      const cost = Array.isArray(ability.cost) ? ability.cost : [];
      let parsed = null;
      try { parsed = cost.length === 1 && cost[0]?.atom === "mana" ? parseManaCost(cost[0].cost ?? "") : null; } catch { /* refused below */ }
      if (!parsed || !parsed.symbols.length || parsed.variable > 0) problems.push(`${ability.text}: a dash cost of mana, once, without X`);
      if (!(identity.types ?? []).includes("Creature")) problems.push(`${ability.text}: dash on a card that is no creature`);
      abilities.push({id, kind: "static", rule: "alternative-cost", paidFor: "dash", text: ability.text, cost: structuredClone(cost), affects: {what: "card", self: true}});
      keywords.push("Dash");
      return;
    }
    /* WARP [COST] (CR 702.185a; All-Fates Stalker, Pinnacle Emissary): "You may cast this card from your hand by paying [cost]
       rather than its mana cost" -- an alternative cost offered from the hand alone (`fromHand`; rules/actions.mjs), what it
       casts marked as cast for it (`paidFor`) and counted as warped this turn (702.185c, the condition `void`) -- and "if
       this spell's warp cost was paid, exile the permanent this spell becomes at the beginning of the next end step; its owner
       may cast this card after the current turn has ended for as long as it remains exiled" (rules/stack.mjs makes the delayed
       trigger; effects/zones.mjs, moveZone's `warped`, the permission). A mana cost; on a permanent card, which becomes a
       permanent (an instant or sorcery has nothing to exile). */
    if (word === "warp") {
      const cost = Array.isArray(ability.cost) ? ability.cost : [];
      let parsed = null;
      try { parsed = cost.length === 1 && cost[0]?.atom === "mana" ? parseManaCost(cost[0].cost ?? "") : null; } catch { /* refused below */ }
      if (!parsed || !parsed.symbols.length || parsed.variable > 0) problems.push(`${ability.text}: a warp cost of mana, once, without X`);
      if ((identity.types ?? []).some((t) => ["Instant", "Sorcery", "Land"].includes(t))) problems.push(`${ability.text}: warp on a card that never becomes a permanent from the stack`);
      abilities.push({id, kind: "static", rule: "alternative-cost", paidFor: "warp", fromHand: true, text: ability.text, cost: structuredClone(cost), affects: {what: "card", self: true}});
      keywords.push("Warp");
      return;
    }
    /* SNEAK [COST] (CR 702.190a; Leonardo, Leader in Blue, Splinter, Hamato Yoshi): "any time you could cast an instant during
       your declare blockers step, you may cast this spell by paying [cost] and returning an unblocked creature you control to
       its owner's hand rather than paying this spell's mana cost" -- an alternative cost (CR 118.9), its condition `sneak`
       (script/condition.mjs), offered at an instant's timing then (`sneak`, rules/actions.mjs), the creature returned picked
       with the cast as any cost's permanent is; and a permanent spell cast for it enters tapped and attacking whom that
       creature attacked (702.190b; rules/stack.mjs). Marked as cast for it (`paidFor`): "if his sneak cost was paid". */
    if (word === "sneak") {
      const cost = Array.isArray(ability.cost) ? ability.cost : [];
      let parsed = null;
      try { parsed = cost.length === 1 && cost[0]?.atom === "mana" ? parseManaCost(cost[0].cost ?? "") : null; } catch { /* refused below */ }
      if (!parsed || !parsed.symbols.length || parsed.variable > 0) problems.push(`${ability.text}: a sneak cost of mana, once, without X`);
      abilities.push({id, kind: "static", rule: "alternative-cost", paidFor: "sneak", sneak: true, condition: {sneak: true}, text: ability.text,
        cost: [...structuredClone(cost), {atom: "returnToHand", selector: {what: "permanent", types: ["Creature"], controller: "you", attacking: true, unblocked: true}}],
        affects: {what: "card", self: true}});
      keywords.push("Sneak");
      return;
    }
    /* TIERED (CR 702.183a; Cloud's Limit Break): "Choose one. As an additional cost to cast this spell, pay the cost associated
       with that mode" -- each mode's cost written on the mode (`cost`, its mana), kept for the spell among its additional
       costs (below; rules/actions.mjs, additionalVariants): each mode its own cast, its cost added. */
    if (word === "tiered") {
      tiered = true;
      keywords.push("Tiered");
      return;
    }
    /* SPREE (CR 702.172a; Explosive Derailment, library load L2): "choose one or more additional costs" -- each mode's cost written
       on the mode (`cost`, its mana), kept for the spell among its additional costs (below; rules/actions.mjs,
       additionalVariants): each choice of one or more modes its own cast, their costs added. */
    if (word === "spree") {
      spree = true;
      keywords.push("Spree");
      return;
    }
    /* ESCALATE (CR 702.120a): "for each mode you choose beyond the first as you cast this spell, you pay an additional [cost]"
       -- mana, "tap an untapped creature you control" (Collective Effort), or both: kept for the spell, among its additional
       costs (below; rules/actions.mjs, additionalVariants). */
    if (word === "escalate") {
      const cost = Array.isArray(ability.cost) ? ability.cost : [];
      const mana = cost.filter((a) => a?.atom === "mana"), taps = cost.filter((a) => a?.atom === "tapCreature");
      let parsed = null;
      try { parsed = mana.length === 1 ? parseManaCost(mana[0].cost ?? "") : null; } catch { /* refused below */ }
      if (!cost.length || mana.length + taps.length !== cost.length || mana.length > 1 || taps.length > 1 || (mana.length === 1 && (!parsed || !parsed.symbols.length || parsed.variable > 0))
        || taps.some((t) => !t.selector || typeof t.selector !== "object" || !(Number.isInteger(t.count ?? 1) && (t.count ?? 1) >= 1)))
        problems.push(`${ability.text}: an escalate cost of mana, untapped creatures to tap, or both, once each`);
      escalate = {mana: mana[0]?.cost ?? "", ...(taps.length ? {tap: {count: taps[0].count ?? 1, selector: structuredClone(taps[0].selector ?? {})}} : {})};
      keywords.push("Escalate");
      return;
    }
    /* UNEARTH (CR 702.84a): "[Cost]: Return this card from your graveyard to the battlefield. It gains haste. Exile it at the
       beginning of the next end step. If it would leave the battlefield, exile it instead of putting it anywhere else.
       Activate only as a sorcery." -- an activated ability of the card in its owner's graveyard (rules/actions.mjs offers it
       there), its cost mana, or energy ("Unearth--Pay eight {E}", Salvation Colossus; CR 107.14). "This card" is the card in
       the graveyard: gone from there before it resolves, it is a new object and nothing returns (CR 400.7). What it gains and
       what exiles it are the effect's, not the permanent's (effects/permanents.mjs, afterwards; rules/replacement.mjs). */
    if (word === "unearth") {
      const cost = Array.isArray(ability.cost) ? ability.cost : [];
      const manaOk = (atom) => { try { const parsed = parseManaCost(atom.cost ?? ""); return parsed.symbols.length > 0 && parsed.variable === 0; } catch { return false; } };
      if (!cost.length || !cost.every((atom) => (atom?.atom === "mana" && manaOk(atom)) || (atom?.atom === "payEnergy" && Number.isInteger(atom.count) && atom.count >= 1)))
        problems.push(`${ability.text}: an unearth cost of mana or energy ({E}), and at least one`);
      if (!(identity.types ?? []).some((t) => ["Artifact", "Battle", "Creature", "Enchantment", "Land", "Planeswalker"].includes(t))) problems.push(`${ability.text}: unearth returns a permanent card to the battlefield`);
      abilities.push({id, kind: "activated", zone: "graveyard", timing: "sorcery", text: ability.text, cost: structuredClone(cost), targets: [],
        effects: [{effect: "moveZone", targets: "self", to: "battlefield", gains: ["Haste"], atEndStep: "exile", exileIfLeaves: true}]});
      keywords.push("Unearth");
      return;
    }
    /* ASCEND (CR 702.131): on a permanent a static ability, on an instant or sorcery a spell ability -- each read from the
       keyword (keywords/designations.mjs; rules/stack.mjs as such a spell resolves). */
    if (word === "ascend") {
      keywords.push("Ascend");
      return;
    }
    /* FLASHBACK (CR 702.34a): the keyword with its cost, a list of atoms -- a mana cost, and "pay 3 life" -- kept as a
       static ability so the card carries it into its graveyard (rules/actions.mjs offers the cast there). Only on an
       instant or sorcery: "if the resulting spell is an instant or sorcery spell". */
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "flashback") {
      const cost = Array.isArray(ability.cost) ? ability.cost : [];
      if (!cost.length || !cost.every((atom) => FLASHBACK_ATOMS.includes(atom?.atom) && fixedLife(atom) && plainDiscard(atom) && !beholdProblems(atom).length))
        problems.push(`${ability.text}: a flashback cost of ${FLASHBACK_ATOMS.join(" and ")} only, and at least one`);
      const taps = cost.filter((atom) => atom?.atom === "tapCreature");
      if (taps.length > 1 || taps.some((atom) => !(Number.isInteger(atom.count) && atom.count >= 1) || !atom.selector || typeof atom.selector !== "object"))
        problems.push(`${ability.text}: a flashback cost taps a number of creatures, 1 or more, fitting a selector, once`);
      const sacrifices = cost.filter((atom) => atom?.atom === "sacrifice");
      if (sacrifices.length > 1 || sacrifices.some((atom) => !(Number.isInteger(atom.count) && atom.count >= 1) || !atom.selector || typeof atom.selector !== "object" || atom.self !== undefined))
        problems.push(`${ability.text}: a flashback cost sacrifices a number of permanents, 1 or more, fitting a selector, once`);
      if (!(identity.types ?? []).some((t) => t === "Instant" || t === "Sorcery")) problems.push(`${ability.text}: flashback on a card that is not an instant or sorcery`);
      abilities.push({id, kind: "static", rule: "flashback", text: ability.text, cost: structuredClone(cost), affects: {what: "card", self: true}});
      keywords.push("Flashback");
      return;
    }
    /* EMBALM [COST] (CR 702.128a; Anointer Priest): "[Cost], Exile this card from your graveyard: Create a token that's a copy
       of this card, except it's white, it has no mana cost, and it's a Zombie in addition to its other types. Activate only as
       a sorcery" -- an activated ability of the card in its owner's graveyard (rules/actions.mjs offers it there), "this card"
       the card in exile its cost put there (the stack entry is about it, as encore's is), copied with those exceptions
       (effects/permanents.mjs, copiable's `setColors`, `addSubtypes`, `noManaCost`). A mana cost; a permanent card. */
    if (word === "embalm") {
      const cost = Array.isArray(ability.cost) ? ability.cost : [];
      if (cost.length !== 1 || cost[0]?.atom !== "mana") problems.push(`${ability.text}: an embalm cost is mana, once`);
      if (!(identity.types ?? []).some((t) => ["Artifact", "Creature", "Enchantment", "Land", "Planeswalker", "Battle"].includes(t))) problems.push(`${ability.text}: embalm makes a token copy of a permanent card`);
      abilities.push({id, kind: "activated", text: ability.text, zone: "graveyard", timing: "sorcery", cost: [...structuredClone(cost), {atom: "exileFromGraveyard", self: true}],
        effects: [{effect: "copyPermanent", targets: "that card", except: {setColors: ["W"], addSubtypes: ["Zombie"], noManaCost: true}}]});
      keywords.push("Embalm");
      return;
    }
    /* ETERNALIZE [COST] (CR 702.129a; Fanatic of Rhonas, wave 4b): embalm's ability with other exceptions -- "Create a token
       that's a copy of this card, except it's black, it's 4/4, it has no mana cost, and it's a Zombie in addition to its other
       types. Activate only as a sorcery": black its only color, 4/4 its base power and toughness, copiable values of the
       token (CR 707.9b; effects/permanents.mjs, copiable's `setColors`, `setPower`, `setToughness`). A mana cost; a creature
       card, the only kind that has a power and toughness to set. */
    if (word === "eternalize") {
      const cost = Array.isArray(ability.cost) ? ability.cost : [];
      if (cost.length !== 1 || cost[0]?.atom !== "mana") problems.push(`${ability.text}: an eternalize cost is mana, once`);
      if (!(identity.types ?? []).includes("Creature")) problems.push(`${ability.text}: eternalize makes a 4/4 token copy of a creature card`);
      abilities.push({id, kind: "activated", text: ability.text, zone: "graveyard", timing: "sorcery", cost: [...structuredClone(cost), {atom: "exileFromGraveyard", self: true}],
        effects: [{effect: "copyPermanent", targets: "that card", except: {setColors: ["B"], addSubtypes: ["Zombie"], setPower: 4, setToughness: 4, noManaCost: true}}]});
      keywords.push("Eternalize");
      return;
    }
    /* SUSPEND N--[COST] (CR 702.62a; Knight of Old Benalia): its first ability, "if you could begin to cast this card by putting
       it onto the stack from your hand, you may pay [cost] and exile it with N time counters on it", kept as a static the card
       carries in its owner's hand (rules/actions.mjs offers the special action there). Its other two -- a time counter removed
       at its owner's upkeep, and the free cast when the last is (a creature so cast with haste) -- are those of every suspended
       card in exile (rules/trigger.mjs, rules/stack.mjs). A number, 1 or more, and a mana cost. */
    if (word === "suspend") {
      const cost = Array.isArray(ability.cost) ? ability.cost : [];
      let parsed = null;
      try { parsed = cost.length === 1 && cost[0]?.atom === "mana" ? parseManaCost(cost[0].cost ?? "") : null; } catch { /* refused below */ }
      if (!(Number.isInteger(ability.amount) && ability.amount >= 1) || !parsed || !parsed.symbols.length || parsed.variable > 0)
        problems.push(`${ability.text}: suspend is a number of time counters, 1 or more, and a mana cost`);
      if ((identity.types ?? []).includes("Land")) problems.push(`${ability.text}: suspend on a land, which is never cast`);
      abilities.push({id, kind: "static", rule: "suspend", text: ability.text, count: ability.amount ?? 0, cost: structuredClone(cost), affects: {what: "card", self: true}});
      keywords.push("Suspend");
      return;
    }
    /* PLOT [COST] (CR 702.170a; Blacksnag Buzzard, library load L5): "any time you have priority during your main phase while
       the stack is empty, you may exile this card from your hand and pay [cost]. It becomes a plotted card" -- a special action
       (CR 116.2k), kept as a static the card carries in its owner's hand (rules/actions.mjs offers it there); and the cast it
       allows, "on a later turn without paying its mana cost", as a sorcery (702.170d), its owner's permission for as long as it
       stays exiled. A mana cost. */
    if (word === "plot") {
      const cost = Array.isArray(ability.cost) ? ability.cost : [];
      let parsed = null;
      try { parsed = cost.length === 1 && cost[0]?.atom === "mana" ? parseManaCost(cost[0].cost ?? "") : null; } catch { /* refused below */ }
      if (!parsed || !parsed.symbols.length || parsed.variable > 0) problems.push(`${ability.text}: plot is a mana cost`);
      abilities.push({id, kind: "static", rule: "plot", text: ability.text, cost: structuredClone(cost), affects: {what: "card", self: true}});
      keywords.push("Plot");
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
    /* GIFT A [SOMETHING] (CR 702.174a; Dawn's Truce, wave 4b): "as an additional cost to cast this spell, you may choose an
       opponent" -- the opponent promised the gift (rules/actions.mjs, one offer each) -- and what that player then gets: on an
       instant or sorcery, "if this spell's gift cost was paid, [effect]", before its other effects (702.174j); on a permanent,
       "when this permanent enters, if its gift cost was paid, [effect]" (702.174b). `gift` names it, as the card does: "a
       card", "a Food", "a tapped Fish", "an extra turn", "a Treasure", "an Octopus" (702.174d-i). Once, at most (its ruling). */
    if (word === "gift") {
      const given = GIFTS[ability.gift];
      if (!given) problems.push(`${ability.text}: a gift is one of ${Object.keys(GIFTS).join(", ")} (CR 702.174d-i)`);
      if (gift !== null) problems.push(`${ability.text}: one gift to a card`);
      gift = {id, text: ability.text, effects: structuredClone(given ?? [])};
      keywords.push("Gift");
      return;
    }
    /* MULTIKICKER (CR 702.33c): "you may pay an additional {2} any number of times as you cast this spell" -- an additional
       cost of the spell's (rules/actions.mjs, additionalVariants), each number of times its own cast; the spell, and the
       permanent it becomes, kicked that many times (`kicked`, an amount). */
    /* KICKER (CR 702.33a): "you may pay an additional [cost] as you cast this spell" -- once at most, so two casts, without it
       and with it (rules/actions.mjs, additionalVariants); the spell kicked (`kicked`, 1), and what it does then, when the
       card says it differs, its spell ability's `kicked` script (Tear Asunder; rules/stack.mjs, scriptOf). */
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "kicker") {
      let parsed = null;
      try { parsed = parseManaCost(ability.cost ?? ""); } catch { /* refused below */ }
      if (!parsed || !parsed.symbols.length || parsed.variable > 0) problems.push(`${ability.text}: kicker is a mana cost`);
      kicker = String(ability.cost ?? "");
      keywords.push("Kicker");
      return;
    }
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "multikicker") {
      let parsed = null;
      try { parsed = parseManaCost(ability.cost ?? ""); } catch { /* refused below */ }
      if (!parsed || !parsed.symbols.length || parsed.variable > 0) problems.push(`${ability.text}: multikicker is a mana cost`);
      multikicker = String(ability.cost ?? "");
      keywords.push("Multikicker");
      return;
    }
    /* OFFSPRING [cost] (CR 702.175a; Coruscation Mage, wave 4c): two abilities. "You may pay an additional [cost] as you cast
       this spell" -- an additional cost of the spell's, paid once at most (rules/actions.mjs, additionalVariants) -- and "when
       this permanent enters, if its offspring cost was paid, create a token that's a copy of it, except it's 1/1", a triggered
       ability of the permanent's (below). Only a creature card has it here; one instance of it. */
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "offspring") {
      let parsed = null;
      try { parsed = parseManaCost(ability.cost ?? ""); } catch { /* refused below */ }
      if (!parsed || !parsed.symbols.length || parsed.variable > 0) problems.push(`${ability.text}: offspring is a mana cost`);
      if (!(identity.types ?? []).includes("Creature")) problems.push(`${ability.text}: offspring on a card that is not a creature`);
      if (offspring !== null) problems.push(`${ability.text}: a second offspring is not built`);
      offspring = {id, text: ability.text, cost: String(ability.cost ?? "")};
      keywords.push("Offspring");
      return;
    }
    /* REPLICATE [cost] (CR 702.56a; Lose Focus, Train E): two abilities. "As an additional cost to cast this spell, you may
       pay [cost] any number of times" -- an additional cost of the spell's, each number of times its own cast, as multikicker's
       (rules/actions.mjs, additionalVariants) -- and "when you cast this spell, if a replicate cost was paid for it, copy it for
       each time", a triggered ability of the spell made as it is cast (rules/actions.mjs). Only on an instant or sorcery here,
       as storm: a permanent spell's copies would become tokens (CR 707.10f). One instance of it (702.56b is two, unbuilt). */
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "replicate") {
      let parsed = null;
      try { parsed = parseManaCost(ability.cost ?? ""); } catch { /* refused below */ }
      if (!parsed || !parsed.symbols.length || parsed.variable > 0) problems.push(`${ability.text}: replicate is a mana cost`);
      if (!(identity.types ?? []).some((t) => t === "Instant" || t === "Sorcery")) problems.push(`${ability.text}: replicate on a card that is not an instant or sorcery`);
      if (replicate !== null) problems.push(`${ability.text}: a second replicate is not built (CR 702.56b)`);
      replicate = String(ability.cost ?? "");
      keywords.push("Replicate");
      return;
    }
    /* OVERLOAD (CR 702.96a-b): an alternative cost; cast for it, the spell's text has "each" where it had "target" -- written
       out as the effects it then has (`effects`, no targets), which the spell carries onto the stack in place of its own
       (rules/actions.mjs, rules/stack.mjs). */
    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "mutate") {
      const cost = ability.cost ?? [];
      if (!cost.length || !cost.every((atom) => atom?.atom === "mana")) problems.push(`${ability.text}: mutate is a mana cost`);
      keywords.push("Mutate");
      abilities.push({id, kind: "static", rule: "alternative-cost", mutate: true, text: ability.text,
        cost: structuredClone(cost), affects: {what: "card", self: true}});
      return;
    }
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
      if (!cost.length || !cost.every((atom) => EVOKE_ATOMS.includes(atom?.atom) && fixedLife(atom) && (atom.atom !== "exileFromHand" || (atom.selector && typeof atom.selector === "object"))))
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
      /* A total divided among targets (The Earth Crystal; CR 601.2d, script/amount.mjs dividedAmong): only where the division
         is no choice -- every number of targets that may be chosen is one, or the total -- since dividing it otherwise is
         its controller's choice as it is put on the stack, which is not built. */
      const divided = effect.count?.dividedAmong;
      if (divided) {
        const spec = (ability.targets ?? [])[divided.target], min = spec?.count?.min ?? 1, max = spec?.count?.max ?? 1;
        if (!spec || Array.from({length: max - min + 1}, (_, i) => min + i).some((k) => k !== 1 && k !== divided.total))
          problems.push(`${ability.text}: a total divided among targets where the division would be a choice`);
      }
      /* counterSpell's `targets` are stack ids, which no script can know; a script names the spell it counters by
         `spells: {target: n}` (script/bind.mjs). */
      if (effect.effect === "counterSpell" && effect.targets !== undefined) problems.push("counterSpell: a script names the spell by `spells: {target: n}`, not by stack id");
      /* What repeats for each (effects/index.mjs) ranges over players, opponents or creatures, and does not stop to ask. */
      if (effect.effect === "repeatFor") {
        /* Or "repeat this process" (Grist, the Hunger Tide): `again`, a condition asked after each pass, in place of `each`. */
        if (effect.again !== undefined ? effect.each !== undefined || !effect.again || typeof effect.again !== "object" : !REPEAT_EACH.includes(effect.each))
          problems.push(`repeatFor: each of ${REPEAT_EACH.join(", ")}, or a process repeated while a condition holds (\`again\`)`);
        /* What repeats may ask (a search for each player, Winds of Abandon): in a resolution it is spliced in for each
           (script/resolution.mjs). */
        for (const inner of effect.effects ?? []) if (!EFFECTS[inner?.effect] && !NEEDS_A_DECISION.includes(inner?.effect)) problems.push(`repeatFor: ${inner?.effect} is not something that repeats`);
        /* "Repeat the following process X times" (Torment of Hailfire): `times`, a round repeated, is counted where a round is
           spliced in -- one whose effects ask (script/resolution.mjs) -- and nowhere else. */
        if (effect.times !== undefined && (effect.again !== undefined || !(effect.effects ?? []).some((inner) => NEEDS_A_DECISION.includes(inner?.effect) || inner?.effect === "connive")))
          problems.push("repeatFor: `times` repeats a round of effects that ask, for each of what it ranges over");
      }
      /* A permanent's state (effects/permanents.mjs, setState): a Class's level, or transforming -- one of them. Flipping, and
         turning a permanent face up or face down as an effect, are not built. */
      if (effect.effect === "setState" && (Number.isInteger(effect.level) && effect.level >= 1) === (effect.transform === true))
        problems.push("setState: a Class's level (`level`, 1 or more) or `transform: true`, one of them -- flipping and turning face up or down are not built");
      /* "Each player may put a land card ..., then each opponent who didn't" (Kynaios and Tiro of Meletis): a chooseCard's
         `did` is reported beside what it remembers (effects/asking.mjs), so it says `remember` too. */
      if (effect.effect === "chooseCard" && effect.did !== undefined && !(effect.did === true && effect.remember))
        problems.push("chooseCard: `did` is true, beside `remember` -- who chose a card is reported with what was chosen");
      /* An added phase is a combat, a main or a beginning phase (effects/permanents.mjs). */
      if (effect.effect === "addPhase" && !(effect.phases ?? ["combat"]).every((kind) => ADDED_PHASES.includes(kind))) problems.push(`addPhase: a phase of ${ADDED_PHASES.join(", ")}`);
      /* What follows a prevention shield's prevention is done at once, inside the damage event (CR 615.5): nothing in it may
         stop to ask -- and only a shield has it. */
      if (effect.effect === "effectUntil" && effect.then !== undefined) {
        if (effect.rule !== "prevent-damage" || !Array.isArray(effect.then)) problems.push("effectUntil: `then` is what follows a prevention shield's prevention, a list");
        for (const inner of Array.isArray(effect.then) ? effect.then : []) if (!EFFECTS[inner?.effect]) problems.push(`effectUntil: ${inner?.effect} follows a prevention, and it asks a question or is not built`);
      }
      /* "For as long as this Saga remains on the battlefield" (CR 611.2b): a duration effectUntil keeps with its source and
         ends as that leaves (effects/permanents.mjs, endWhileSourceRemains), as gainControl and exileUntil keep theirs -- no
         other effect's, and not a rule changed for players' casting, which keeps no source. */
      if (effect.until === "this leaves" && !(["gainControl", "exileUntil"].includes(effect.effect) || (effect.effect === "effectUntil" && effect.rule !== "cant-cast")))
        problems.push(`${effect.effect}: "for as long as this remains on the battlefield" (until "this leaves") is effectUntil's, gainControl's and exileUntil's`);
      /* "Choose one that hasn't been chosen" (Gollum, Riddle Master): a triggered ability's one effect, choosing one, its
         modes chosen as it is put on the stack (rules/trigger.mjs) -- not a spell's, an activated ability's, nor a choice
         made as something resolves, which are not built. */
      /* Or "choose one that hasn't been chosen this turn" (Monument to Endurance): `unchosen: "turn"`. */
      if (effect.effect === "modal" && effect.unchosen !== undefined && !((effect.unchosen === true || effect.unchosen === "turn") && ability.kind === "triggered" && (ability.effects ?? []).length === 1
        && ability.effects[0] === effect && effect.chooser === undefined && (effect.choose ?? 1) === 1 && effect.mayChooseNone === undefined))
        problems.push("modal: \"choose one that hasn't been chosen\" (unchosen: true) is a triggered ability's one effect, choosing one");
      /* "You may play that card" until a time (effects/zones.mjs): this turn, or the end of its controller's next turn. */
      if (effect.effect === "mayPlay") {
        if (!MAY_PLAY_UNTIL.includes(effect.until ?? "end-of-turn")) problems.push(`mayPlay: until ${MAY_PLAY_UNTIL.join(" or ")}`);
        for (const key of ["free", "graveyardToLibraryBottom", "anyMana"]) if (effect[key] !== undefined && effect[key] !== true) problems.push(`mayPlay: ${key} is true`);
        /* "You may play them if you control a Wizard" (Flameshape): a condition asked as each card would be played, on a
           permission that names cards (`targets`) -- the effect's own `condition` is asked once, as it resolves. */
        if (effect.onlyIf !== undefined && effect.targets === undefined) problems.push("mayPlay: onlyIf is a condition on the cards it names (`targets`)");
      }
      /* "Exile them face down" (Flameshape; CR 406.3a): into exile alone -- face down onto the battlefield is manifest's
         (CR 701.40a) -- and "look at ... and exile them face down" (`look`) only beside it. */
      if (effect.effect === "moveZone" && effect.faceDown !== undefined && !(effect.faceDown === true && effect.to === "exile"))
        problems.push("moveZone: faceDown is true, into exile (to: \"exile\"); face down onto the battlefield is manifest");
      if (effect.effect === "moveZone" && effect.look !== undefined && !(effect.look === true && effect.faceDown === true))
        problems.push("moveZone: look is true, beside faceDown: the cards looked at, then exiled face down");
      /* "Return ... to the battlefield with a finality counter on it" (Excava, the Risen Past): onto the battlefield only, each
         kind of counter a whole number, 1 or more (effects/zones.mjs, moveOne's `counters`). */
      /* Or that it is exiled with ("exile it ... with a stash counter on it", Tinybones, Bauble Burglar; effects/zones.mjs). */
      if (effect.effect === "moveZone" && effect.withCounters !== undefined && !(["battlefield", "exile"].includes(effect.to) && effect.withCounters && typeof effect.withCounters === "object"
        && Object.keys(effect.withCounters).length && Object.values(effect.withCounters).every((n) => Number.isInteger(n) && n >= 1)))
        problems.push("moveZone: withCounters is the counters it enters the battlefield with, or is exiled with: {kind: 1 or more}");
      /* "Put this creature's counters on that token" (Ambitious Augmenter): `countersOf: "self"`, every kind its source had as
         it last existed, as many -- with no kind or count of its own (effects/resources.mjs, putCounter). */
      /* Or "that card", those the creature a trigger is about had as it last existed (The Ozolith, wave 4b). */
      if (effect.effect === "putCounter" && effect.countersOf !== undefined && !(["self", "that card"].includes(effect.countersOf) && effect.counter === undefined && effect.count === undefined))
        problems.push("putCounter: countersOf is \"self\" or \"that card\", the counters it had as it last existed, with no counter or count of its own");
      /* "That player ... puts a +1/+1 counter on it" (Alexios): who puts them, the player a trigger is about. */
      if (effect.effect === "putCounter" && effect.puts !== undefined && effect.puts !== "that player")
        problems.push("putCounter: puts is \"that player\", the player the trigger is about putting them");
      /* "You get an experience counter" (Ezuri, Claw of Progress; CR 122.1): counters on players (`who`) are of a kind named --
         never chosen, never +1/+1 (no player has power), never poison, which is the `poison` effect's (CR 122.1f;
         effects/resources.mjs, putCounter). */
      if (effect.effect === "putCounter" && effect.who !== undefined && !(typeof effect.counter === "string" && !["chosen", "+1/+1", "poison"].includes(effect.counter)))
        problems.push("putCounter: counters on players (who) are of a kind named -- not chosen, +1/+1 or poison (the poison effect)");
      /* "Remove up to three counters from another target creature or planeswalker" (Mabel, Bitter Recluse): of any kinds, a
         number of them in all, "up to" (`upTo`) or exactly -- which ones asked as it resolves (effects/asking.mjs,
         countersToRemove), so never where nothing can ask, and never with its answer (`removing`) written in. */
      if (effect.effect === "removeCounter" && effect.counter !== "any" && (effect.upTo !== undefined || effect.removing !== undefined))
        problems.push("removeCounter: upTo goes with counters of any kinds (`counter: \"any\"`)");
      if (effect.effect === "removeCounter" && effect.counter === "any" && !(Number.isInteger(effect.count) && effect.count >= 1 && [undefined, true].includes(effect.upTo) && effect.removing === undefined))
        problems.push("removeCounter: counters of any kinds are a number of them, 1 or more, `upTo: true` or exactly -- which ones asked as it resolves");
      /* "Create a Royal Role token attached to that creature" (Royal Treatment; CR 303.4i): an Aura token, one, created attached
         to one object -- a target, or what the effect is about (effects/permanents.mjs, createToken). */
      if (effect.effect === "createToken" && effect.attachedTo !== undefined && !(PREDEFINED_TOKENS[effect.token?.predefined]?.enchant && (effect.count ?? 1) === 1
        && (Number.isInteger(effect.attachedTo?.target) || ["that card", "remembered"].includes(effect.attachedTo))))
        problems.push("createToken: a token created attached is one Aura token (a Role), attached to a target or what the effect is about");
      /* A token's abilities are made as they are written (effects/permanents.mjs, makeToken) -- nothing compiles them -- so its
         mana ability is written as the engine runs one, `kind: "mana"` (the Treasure's in PREDEFINED_TOKENS): written as a
         card's, "{T}: Add {G}" would be offered on the stack, which a mana ability never uses (CR 605.1a; Freyalise's Elf Druid). */
      if (effect.effect === "createToken") for (const made of effect.token?.abilities ?? [])
        if (made?.mana === true || (made?.kind === "activated" && manaAbility(made, made.id) !== null))
          problems.push(`createToken: ${made.text ?? "a token's ability"}: a token's mana ability is written as the engine runs it, kind "mana" (as the Treasure's is)`);
      /* "For as long as that land has a blight counter on it" (Ultima, Origin of Oblivion), "for as long as it has a vow counter
         on it" (Promise of Loyalty): a kind of counter, on what the effect names (`targets`), and no other end -- `until:
         "ever"` (effects/permanents.mjs, endCounterDurations; rules/statics.mjs). */
      if (effect.whileCounter !== undefined && !(effect.effect === "effectUntil" && typeof effect.whileCounter === "string" && effect.whileCounter
        && effect.targets !== undefined && effect.until === "ever"))
        problems.push("effectUntil: \"for as long as it has a counter\" is whileCounter, a kind, on its targets with until \"ever\"");
      /* "It loses all land types" (CR 205.3i): a type change, layer 4. */
      if (effect.effect === "effectUntil" && effect.apply?.removeLandTypes !== undefined && !(effect.apply.removeLandTypes === true && effect.layer === 4))
        problems.push("effectUntil: removeLandTypes is true, in layer 4 (CR 613.1d)");
      /* A dig's cards to zones by card type (Zimone's Experiment; effects/asking.mjs, dig): each destination card types and a
         zone, onto the battlefield tapped or not. */
      if (effect.effect === "dig" && effect.toByType !== undefined && !(Array.isArray(effect.toByType) && effect.toByType.length
        && effect.toByType.every((w) => Array.isArray(w?.types) && w.types.length && ["hand", "battlefield", "graveyard", "exile"].includes(w.to)
          && Object.keys(w).every((k) => ["types", "to", "tapped"].includes(k)) && (w.tapped === undefined || (w.tapped === true && w.to === "battlefield")))))
        problems.push("dig: toByType is a list of {types, to, tapped?} -- card types, a zone, and tapped only onto the battlefield");
      /* A search a card at a time (Krosan Verge, Myriad Landscape; effects/asking.mjs, chooseCard): of a library, `searches` a
         description for each card, or `sharing: "land type"` with two or more of the selector's. */
      if (effect.effect === "chooseCard" && (effect.searches !== undefined || effect.sharing !== undefined)) {
        if ((effect.zone ?? "library") !== "library") problems.push("chooseCard: a search a card at a time is of a library");
        if (effect.searches !== undefined && !(Array.isArray(effect.searches) && effect.searches.length >= 2 && effect.sharing === undefined && effect.selector === undefined && effect.count === undefined))
          problems.push("chooseCard: searches is two or more descriptions, one for each card, with no selector, count or sharing of its own");
        if (effect.sharing !== undefined && !(effect.sharing === "land type" && effect.selector !== undefined && effect.count === 2))
          problems.push("chooseCard: sharing is \"land type\", among two of a selector's");
        for (const one of effect.searches ?? []) try { compileSelector({...one, what: "card", zone: "library"}); } catch (e) { problems.push(`chooseCard: ${e.message}`); }
      }
      /* "You may exile this spell and four cards named Sphinx's Approach from your graveyard. If you do" (effects/asking.mjs,
         unlessPays): a number of the graveyard's cards a selector describes, and the spell itself -- a spell's alone. */
      if (effect.effect === "unlessPays" && (effect.exileFromGraveyard !== undefined || effect.exileSelf !== undefined)) {
        const g = effect.exileFromGraveyard;
        if (!(g && Number.isInteger(g.count) && g.count >= 1 && g.count <= 10 && typeof g.selector?.named === "string" && Object.keys(g).every((k) => ["count", "selector"].includes(k))))
          problems.push("unlessPays: exileFromGraveyard is {count, selector}, one to ten of the graveyard's cards of a name (`named`)");
        else try { compileSelector({...g.selector, what: "card", zone: "graveyard"}); } catch (e) { problems.push(`unlessPays: ${e.message}`); }
        if (effect.exileSelf !== undefined && !(effect.exileSelf === true && ability.kind === "spell")) problems.push("unlessPays: exileSelf is true, on a spell (\"exile this spell\")");
      }
      /* "From among those cards" wherever each went (Spirit of Resilience): a choice among cards an earlier part named
         (effects/asking.mjs, chooseCard) -- never a search of every zone. */
      if (effect.effect === "chooseCard" && effect.zone === "any" && effect.among === undefined)
        problems.push("chooseCard: any zone is among cards named before it (`among`), never a search");
      /* Among what: the cards an earlier part remembered, those a "one or more" trigger is about, or -- on the battlefield --
         what was attached to the ability's source as it last existed (Zack Fair; effects/asking.mjs). */
      if (effect.effect === "chooseCard" && effect.among !== undefined && !(["remembered", "those cards"].includes(effect.among)
        || (effect.among === "was attached to this" && effect.zone === "battlefield")))
        problems.push("chooseCard: among \"remembered\", \"those cards\", or \"was attached to this\" on the battlefield");
      if (effect.effect === "repeatFor" && (effect.effects ?? []).some((inner) => inner?.effect === "removeCounter" && inner.counter === "any"))
        problems.push("repeatFor: which counters of any kinds to remove is asked, and what repeats here does not ask it");
      /* "Spend this mana only to cast instant and sorcery spells" (effects/resources.mjs), "only to cast a creature spell of
         the chosen type" (a mana ability's, cards/index.mjs manaAbility): what the mana may pay for, read here for both. */
      if (effect.effect === "addMana" && effect.spendOnly !== undefined && !spendOnlyValid(effect.spendOnly))
        problems.push(`addMana: a spending restriction says what it pays for -- a spell, an ability of a permanent or of a source anywhere, or more than one, each a selector (${SPEND_ONLY_KEYS.join(", ")})`);
      if (effect.effect === "addMana") problems.push(...whenSpentProblems(effect));
      /* "This mana can't be spent to cast spells from your hand" (Heartwood Crafter; rules/restricted-mana.mjs): in the pool,
         the one thing it can't pay for said -- spells cast from its controller's hand -- and with no restriction or rider
         besides, nor kept until end of combat, nor of one color chosen as it resolves (neither carries it yet). */
      if (effect.effect === "addMana" && effect.cantSpend !== undefined && !(JSON.stringify(effect.cantSpend) === '{"castFrom":"hand"}' && effect.spendOnly === undefined && effect.whenSpent === undefined
        && effect.untilEndOfCombat === undefined && effect.oneColor === undefined))
        problems.push('addMana: mana that can\'t be spent on some things says cantSpend {castFrom: "hand"}, spells cast from its controller\'s hand, with no spending restriction, rider, untilEndOfCombat or oneColor besides');
      /* Mana kept until end of combat (firebending): plain mana; restricted mana kept so is not built. */
      if (effect.effect === "addMana" && effect.untilEndOfCombat !== undefined && (effect.untilEndOfCombat !== true || effect.spendOnly !== undefined))
        problems.push("addMana: untilEndOfCombat is true, on mana that is not restricted");
      /* "Add two mana of any one color" as an ability resolves (Ashling, Rimebound; script/resolution.mjs): of any color,
         more than one of it, one color for all. */
      if (effect.effect === "addMana" && effect.oneColor !== undefined && !(effect.oneColor === true && effect.anyColor === true && effect.mana === undefined && effect.count >= 2))
        problems.push("addMana: oneColor is true, beside anyColor and a count of 2 or more -- that many mana, all of one color");
      /* "Add {B} or {G} for each permanent destroyed this way" as a spell resolves (Culling Ritual; script/resolution.mjs): two
         or more of the five colors, each mana one of them as its controller chooses -- plain mana, nothing else said of it. */
      if (effect.effect === "addMana" && effect.colors !== undefined && !(Array.isArray(effect.colors) && effect.colors.length >= 2
        && new Set(effect.colors).size === effect.colors.length && effect.colors.every((c) => ["W", "U", "B", "R", "G"].includes(c))
        && ["mana", "anyColor", "oneColor", "spendOnly", "cantSpend", "whenSpent", "untilEndOfCombat"].every((k) => effect[k] === undefined)))
        problems.push("addMana: colors is two or more of W, U, B, R and G, each once -- one of them for each mana, with no mana, anyColor, restriction or rider besides");
      /* "Look at target player's hand" (Gitaxian Probe; effects/asking.mjs, handLook): a look at the whole hand, by this effect's
         controller -- no count, nothing revealed to everyone and nothing remembered from it (none of those is built for a hand). */
      if (effect.effect === "peekAndReveal" && effect.zone !== undefined && !(effect.zone === "hand" && ["count", "reveal", "remember"].every((k) => effect[k] === undefined)))
        problems.push("peekAndReveal: zone is \"hand\", a look at the whole of each hand `who` names, with no count, reveal or remember");
      /* "Target opponent reveals their hand. You choose a nonland card from it. That player discards that card" (Render
         Speechless; effects/asking.mjs): a discard chosen by this effect's controller (`chooser: "you"`, CR 701.9b) is from a
         hand revealed (`reveal: true`, CR 701.20a) -- the two together, and one card or more of it; "any number" is the
         discarder's own choice. */
      if (effect.effect === "discard" && (effect.chooser !== undefined || effect.reveal !== undefined)
        && !(effect.chooser === "you" && effect.reveal === true && effect.anyNumber === undefined && effect.upTo === undefined && effect.random === undefined && effect.all === undefined))
        problems.push("discard: a card chosen by this effect's controller (`chooser: \"you\"`) from a hand revealed (`reveal: true`), the two together -- never up to, any number, at random or all");
      if (effect.effect === "discard" && effect.anyNumber !== undefined && !(effect.anyNumber === true && effect.count === undefined && effect.upTo === undefined))
        problems.push("discard: anyNumber is true, from none to every card in that hand -- with no count of its own");
    }

    if (ability.kind === "spell") {
      if (spell) problems.push("a second spell ability: one card, one spell");
      /* A PERMANENT CARD'S ADDITIONAL COST (CR 601.2b): "as an additional cost to cast this spell, behold an Elf or pay {2}" (Lys
         Alana Dignitary) -- its spell ability says that and nothing else: the permanent spell's effect is entering (CR 608.3). */
      if (!(identity.types ?? []).some((t) => t === "Instant" || t === "Sorcery") && ((ability.effects ?? []).length || (ability.targets ?? []).length || !(ability.additionalCost ?? []).length))
        problems.push("a permanent card's spell ability says only its additional cost: no targets and no effects");
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
            /* "Pay 5 life or pay {2}" (Redirect Lightning; rules/actions.mjs, additionalVariants): a fixed amount of life, 1 or more. */
            } else if (one?.atom === "payLife") {
              if (!(Number.isInteger(one.amount) && one.amount >= 1)) problems.push("oneOf: a choice's life to pay is a whole number, 1 or more");
            } else if (!["discard", "sacrifice", "blight", "behold"].includes(one?.atom)) problems.push(`${one?.atom ?? "an additional cost"}: an additional cost nothing pays yet`);
            problems.push(...beholdProblems(one));
            if (one?.atom === "blight" && !(Number.isInteger(one.count ?? 1) && (one.count ?? 1) >= 1)) problems.push("blight: an additional cost of 1 or more -1/-1 counters");
            if (one?.optional !== undefined) problems.push("oneOf: one of a choice is never optional");
          }
          continue;
        }
        /* "As an additional cost to cast this spell, pay X life" (Toxic Deluge, wave 4b): X announced as it is cast, one offer for
           each value (rules/actions.mjs, lifeXAtom) -- on a spell with no {X} in its mana cost, for one X to name. */
        if (atom?.atom === "payLife") {
          let manaX = true;
          try { manaX = parseManaCost(identity.manaCost ?? "").variable > 0; } catch { /* refused below */ }
          if (atom.amount !== "X" || manaX) problems.push("payLife: an additional cost of X life, on a spell with no {X} in its mana cost");
          continue;
        }
        if (!["discard", "sacrifice", "blight", "tapCreature", "behold"].includes(atom?.atom)) problems.push(`${atom?.atom ?? "an additional cost"}: an additional cost nothing pays yet`);
        problems.push(...beholdProblems(atom, {exiles: true}));
        /* "Discard two cards" (Cathartic Reunion): a whole number of cards, 1 or more (rules/actions.mjs, additionalChoices). */
        if (atom?.atom === "discard" && atom.count !== undefined && !(Number.isInteger(atom.count) && atom.count >= 1)) problems.push("discard: an additional cost of 1 or more cards");
        /* "Tap any number of untapped creatures you control" (Burn at the Stake): `count: "any"` and the creatures it may tap, a
           selector -- which ones, asked once the cast is taken (rules/actions.mjs, tapAnyAtom). A fixed number is not built. */
        if (atom?.atom === "tapCreature") {
          let fits = atom.count === "any" && Boolean(atom.selector) && typeof atom.selector === "object";
          try { if (fits) compileSelector({...atom.selector, what: "permanent"}); } catch { fits = false; }
          if (!fits) problems.push("tapCreature: an additional cost taps any number of creatures (`count: \"any\"`), a selector saying which");
        }
        /* "As an additional cost to cast this spell, you may sacrifice one or more creatures" (Plumb the Forbidden): `count: "any"`
           and a selector saying what it may sacrifice (rules/actions.mjs, sacrificeAnyAtom); `whenYouDo`, the reflexive trigger of
           that payment (CR 603.12), its text and its effects, with no targets. A fixed number is one permanent, yet. */
        if (atom?.atom === "sacrifice" && (atom.count !== undefined || atom.whenYouDo !== undefined)) {
          let fits = atom.count === "any" && Boolean(atom.selector) && typeof atom.selector === "object";
          try { if (fits) compileSelector({...atom.selector, what: "permanent"}); } catch { fits = false; }
          if (!fits) problems.push("sacrifice: an additional cost sacrifices any number of permanents (`count: \"any\"`), a selector saying which");
          const when = atom.whenYouDo;
          if (when !== undefined && (!when || typeof when.text !== "string" || !Array.isArray(when.effects) || !when.effects.length || when.targets !== undefined))
            problems.push("sacrifice: its whenYouDo is {text, effects}, a reflexive trigger with no targets");
          else if (when !== undefined) for (const inner of effectsIn(when.effects)) if (!isBuilt(inner.effect)) problems.push(`${inner.effect}: declared, not built`);
        }
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
        /* "You may choose the same mode more than once" (`sameMode`, Moment of Reckoning; CR 700.2d), and "choose up to four"
           (`choose: 0`): rules/actions.mjs offers each such choice of modes, script/bind.mjs their targets. */
        ? {choose: only.choose ?? 1, ...(only.chooseMore ? {more: structuredClone(only.chooseMore)} : {}), ...(only.chooseUpTo ? {upTo: only.chooseUpTo} : {}),
          ...(only.sameMode === true ? {sameMode: true} : {}),
          modes: (only.modes ?? []).map((m) => ({text: m.text ?? "", targets: m.targets ?? [], effects: m.effects ?? [], ...(m.cost !== undefined ? {cost: m.cost} : {})}))} : null;
      if (modal && (ability.targets ?? []).length) problems.push("a modal spell chosen as it is cast names its targets in its modes, not beside them");
      spell = {id, text: ability.text, targets: ability.targets ?? [], effects: ability.effects, ...(modal ? {modal} : {}), ...(ability.additionalCost ? {additionalCost: ability.additionalCost} : {}),
        /* "If this spell was kicked, exile target nonland permanent instead" (Tear Asunder): its targets and effects then. */
        ...(ability.kicked ? {kicked: {targets: ability.kicked.targets ?? [], effects: ability.kicked.effects ?? []}} : {})};
      if (ability.kicked && (modal || !(ability.kicked.effects ?? []).length)) problems.push("a kicked spell's script says its effects, on a spell that is not modal");
      return;
    }
    /* PARTNER WITH [NAME] (CR 702.124j; Pir, Imaginative Rascal): two abilities. A deck rule -- two legendary cards may be one's
       commanders if each says "Partner with" the other (room/table.mjs, from `partners` above) -- and a triggered ability:
       "When this permanent enters, target player may search their library for a card named [name], reveal it, put it into
       their hand, then shuffle" -- the target player's "may" theirs to answer (a modal they choose, CR 603.5), the search
       theirs too, and their library shuffled whether or not a card is found (CR 701.23). The name is the keyword's `name`, and
       the card's words must say it. */
    if (word === "partner with") {
      const name = typeof ability.name === "string" ? ability.name.trim() : "";
      if (!name || !partnersIn(script.oracleText).some((p) => p.kind === "with" && p.name.toLowerCase() === name.toLowerCase()))
        problems.push(`${ability.text}: Partner with names the card, \`name\`, as the card's words do (CR 702.124j)`);
      abilities.push({id, kind: "triggered", text: ability.text, trigger: TRIGGERS.enters({who: "self"}), targets: [{what: "player"}],
        effects: [{effect: "modal", chooser: {target: 0}, title: `Search your library for a card named ${name}?`, modes: [
          {text: "Search", effects: [{effect: "chooseCard", zone: "library", who: {target: 0}, selector: {named: name}, to: "hand", reveal: true, shuffle: true}]},
          {text: "Don't search", effects: []}]}]});
      keywords.push("Partner with");
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
      /* "−X:" (Kasmina, Enigma Sage): `"-X"`, X chosen as it is activated, from none to its loyalty (rules/actions.mjs). */
      if (loyalties.length > 1 || loyalties.some((atom) => !Number.isInteger(atom.amount) && atom.amount !== "-X")) problems.push(`${ability.text}: a loyalty cost is one number of loyalty counters, or -X`);
      const loyalty = loyalties.length === 1 && (Number.isInteger(loyalties[0].amount) || loyalties[0].amount === "-X") ? loyalties[0].amount : undefined;
      const cost = ability.cost.flatMap((atom) => (atom?.atom !== "loyalty" ? [atom] : atom.amount === "-X" ? [{atom: "removeCounters", self: true, counter: "loyalty", count: "X"}]
        : atom.amount > 0 ? [{atom: "addCounters", self: true, counter: "loyalty", count: atom.amount}]
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
      /* "This ability costs {1} less to activate for each +1/+1 counter on the creature it targets" (Warrior's Blades; CR 601.2c,
         then 601.2f): a reduction read from a target, costed for each way to choose its targets (rules/actions.mjs, abilityAims)
         -- a permanent's ability, its targets chosen with the offer: never counted ones, picked after, nor its modes' (whose
         targets are not the ability's, below). */
      if (/"target":/.test(JSON.stringify(ability.costLess ?? null)) && (ability.zone !== undefined || !(ability.targets ?? []).length || ability.targets.some(countedTarget)))
        problems.push(`${ability.text}: a cost read from its target is a permanent's ability's, with its targets chosen as it is offered`);
      /* WATERBEND (CR 701.67a-b): a permanent's ability's whole mana cost, once -- beside no other mana, which tapping could not
         pay, nor {T}, the source tapped for both -- offered where a permanent's abilities are (rules/actions.mjs). */
      const bend = cost.filter((atom) => atom?.atom === "waterbend");
      if (bend.length > 1 || (bend.length && (ability.zone !== undefined || cost.some((atom) => atom?.atom === "mana" || atom?.atom === "{T}"))))
        problems.push(`${ability.text}: a waterbend cost is a permanent's ability's only mana, once, without {T}`);
      /* EQUIP (CR 702.6a): "Equip [cost]" is "[Cost]: Attach this permanent to target creature you control. Activate only as a
         sorcery" -- an activated ability the card writes out, known by its words, for what reads equip abilities ("equip
         abilities you activate that target this creature cost {2} less", Dwarven Mauler; rules/statics.mjs). */
      const equip = /^Equip\b/.test(ability.text ?? "");
      abilities.push({id, kind: "activated", text: ability.text, cost, targets: ability.targets ?? [], ...(chosenModes ? {modal: chosenModes} : {}), ...(equip ? {equip: true} : {}),
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
        ...(ability.limit ? {limit: ability.limit} : {}),
        /* BOAST (CR 702.142a; card load w4d L1): "activate only if this creature attacked this turn and only once each turn"
           -- twice during its controller's turns where a rule says so (Birgi, God of Storytelling; rules/actions.mjs,
           withinLimit). */
        ...(ability.boast === true ? {boast: true, limit: 1, condition: ability.condition
          ? {allOf: [ability.condition, {present: {what: "permanent", self: true, attackedThisTurn: true}}]}
          : {present: {what: "permanent", self: true, attackedThisTurn: true}}} : {})});
      return;
    }
    if (ability.kind === "triggered") {
      const compile = TRIGGERS[ability.trigger.on];
      const compiled = compile ? compile(ability.trigger) : null;
      /* "Whenever ONE OR MORE ...": once for everything that happened at once (rules/trigger.mjs). */
      const trigger = compiled && ability.trigger.batch ? {...compiled, batch: true} : compiled;
      if (!trigger) problems.push(`${ability.trigger.on}${ability.trigger.who ? ` (${ability.trigger.who})` : ""}: a trigger the engine does not watch for yet`);
      /* "While you're the monarch" (CR 725): read by damage dealt to you alone -- any other trigger would drop it, and trigger
         whoever is the monarch. */
      if (ability.trigger.monarch !== undefined && trigger?.monarch !== "you")
        problems.push(`${ability.text}: "while you're the monarch" is monarch: "you", on damage dealt to you`);
      if (ability.trigger.filter) {
        /* A filter may be a choice ("an instant or sorcery spell", "another creature or planeswalker you control dies"):
           each alternative, with what they share, is a selector of its own (script/filter.mjs, matchesSelector). */
        const {anyOf, ...shared} = ability.trigger.filter;
        const each = Array.isArray(anyOf) ? anyOf.map((one) => ({...shared, ...one, ...(ability.trigger.on === "spell cast" ? {what: "spell"} : {})}))
          : [{...ability.trigger.filter, ...(ability.trigger.on === "spell cast" ? {what: "spell"} : {})}];
        try { for (const one of each) compileSelector(one); } catch (error) { problems.push(`${ability.text}: ${error.message}`); }
      }
      /* The attacking creature a blocker blocks (a blocks trigger's `blocked`, Skystinger's "a creature with flying"): a
         selector of a permanent. */
      if (ability.trigger.blocked !== undefined) {
        const blocked = ability.trigger.blocked;
        if (ability.trigger.on !== "blocks") problems.push(`${ability.text}: the creature blocked is read by a blocks trigger, and by no other`);
        else if (!blocked || typeof blocked !== "object" || Array.isArray(blocked)) problems.push(`${ability.text}: the creature blocked is a selector`);
        else try { compileSelector({...blocked, what: "permanent"}); } catch (error) { problems.push(`${ability.text}: ${error.message}`); }
      }
      /* What a spell cast targets ("that targets a creature"): a selector of its own, read only as a spell is cast -- another
         trigger would drop it, and trigger on everything. */
      if (ability.trigger.targets !== undefined) {
        if (ability.trigger.on !== "spell cast") problems.push(`${ability.text}: what a spell targets is read as it is cast, and by no other trigger`);
        else try { compileSelector(ability.trigger.targets); } catch (error) { problems.push(`${ability.text}: ${error.message}`); }
      }
      /* A choice of spells cast (`anyOf`): each a filter of the spell, of what it targets, or both -- and only that, on a spell
         cast trigger with neither of its own and no count of the caster's spells this turn, which reads its filter. */
      if (ability.trigger.anyOf !== undefined) {
        const alternatives = ability.trigger.anyOf;
        if (ability.trigger.on !== "spell cast" || !Array.isArray(alternatives) || alternatives.length < 2 || ["filter", "targets", "firstThisTurn", "nthThisTurn", "countBefore"].some((key) => ability.trigger[key] !== undefined)
          || !alternatives.every((one) => one && typeof one === "object" && Object.keys(one).length && Object.keys(one).every((key) => key === "filter" || key === "targets")))
          problems.push(`${ability.text}: a choice of spells cast is anyOf, two or more of {filter, targets}, on a spell cast trigger with no filter, targets or count of its own`);
        else for (const one of alternatives) try { if (one.filter) compileSelector({...one.filter, what: "spell"}); if (one.targets) compileSelector(one.targets); } catch (error) { problems.push(`${ability.text}: ${error.message}`); }
      }

      /* "YOU MAY" (CR 603.5): an optional triggered ability goes on the stack like any other, and as it resolves its
         controller chooses whether to do it -- the card's sentence, Yes or No. Declining does nothing at all, a search
         and its shuffle included. */
      /* "DO THIS ONLY ONCE EACH TURN" (Tidus, Yuna's Guardian's Cheer; `onceEachTurn`): the "you may" taken once a turn -- the
         ability still triggers and resolves each time, and once its "Yes" has been taken this turn only "No" is left
         (effects/asking.mjs, modal's `onceEachTurn`). A limit on doing it, never on triggering (that is `limit`, "this
         ability triggers only once each turn"); so it says so only of a "you may". */
      if (ability.onceEachTurn !== undefined && !(ability.onceEachTurn === true && ability.optional === true))
        problems.push(`${ability.text}: "do this only once each turn" is onceEachTurn: true, on a "you may" (optional) triggered ability`);
      const once = ability.onceEachTurn === true && ability.optional === true;
      const effects = ability.optional ? [{effect: "modal", title: ability.text, ...(once ? {onceEachTurn: id} : {}),
        modes: [{text: "Yes", effects: ability.effects, ...(once ? {once: true} : {})}, {text: "No", effects: []}]}] : ability.effects;
      /* A TRIGGERED MANA ABILITY (CR 605.1b): one that triggers on a mana ability and adds mana -- a fixed amount, or "one
         mana of any type that land produced" -- with no target. It is not put on the stack (rules/trigger.mjs, manaTriggered). */
      const [adds] = effects ?? [];
      /* Or "an additional one mana of the chosen color" (Utopia Sprawl): the color its permanent chose as it entered
         (`chosenColor`, rules/trigger.mjs). */
      if (trigger?.on === "GameEventManaPool" && effects.length === 1 && adds?.effect === "addMana" && !(ability.targets ?? []).length && !ability.optional
        && (MANA(adds.mana) || adds.produced === true || adds.chosenColor === true)) {
        /* What a triggered mana ability adds goes straight to the pool: one that says what its mana may pay for is refused
           until it is carried there. */
        if (adds.spendOnly !== undefined || adds.cantSpend !== undefined) problems.push(`${ability.text}: a triggered mana ability whose mana may pay for only some things is not built`);
        trigger.manaAbility = adds.produced === true ? {produced: true} : adds.chosenColor === true ? {chosenColor: true} : {mana: {...adds.mana}};
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
          /* "Choose one or more" (Black Market Connections, wave 4b): as many as `upTo`, each number of them a way of its own. */
          ...(lone.chooseUpTo ? {upTo: lone.chooseUpTo} : {}),
          /* "Choose one that hasn't been chosen" (Gollum, Riddle Master): each mode once, for as long as its permanent is
             the object it is (rules/trigger.mjs, modesTaken). */
          ...(lone.unchosen === true || lone.unchosen === "turn" ? {unchosen: lone.unchosen} : {}),
          modes: (lone.modes ?? []).map((m) => ({text: m.text ?? "", targets: m.targets ?? [], effects: m.effects ?? []}))} : null;
      if (modal && (ability.optional || (ability.targets ?? []).length)) problems.push(`${ability.text}: a modal triggered ability names its targets in its modes, and "you may" as mayChooseNone`);
      if (modal && modal.modes.some((m) => m.targets.some((t) => t && typeof t === "object" && t.count !== undefined)))
        problems.push(`${ability.text}: a counted target in a triggered ability's mode is not built`);
      abilities.push({id, kind: "triggered", text: ability.text, trigger: trigger ?? {on: null}, effects: modal ? [] : effects, ...(modal ? {modal} : {}),
        ...((ability.targets ?? []).length ? {targets: ability.targets} : {}),
        ...(ability.condition ? {condition: ability.condition} : {}), ...(ability.optional ? {optional: true} : {}),
        /* "This ability triggers only once each turn". */
        ...(ability.limit ? {limit: ability.limit} : {}),
        /* "This ability triggers only once" (Acrobatic Cheerleader's survival, library load L5): ever, for its object
           (rules/trigger.mjs). */
        ...(ability.onlyOnce === true ? {onlyOnce: true} : {}),
        /* Had only at that Class level or greater (CR 716.2a; classLevel, above). */
        ...(Number.isInteger(ability.level) ? {level: ability.level} : {}),
        /* "At the beginning of your upkeep, you may return this card from your graveyard to your hand" (Squee, Goblin Nabob):
           an ability that works from its card's graveyard, and only there (CR 113.6m; rules/trigger.mjs). */
        ...(ability.zone === "graveyard" ? {zone: "graveyard"} : {})});
      if (ability.zone !== undefined && ability.zone !== "graveyard") problems.push(`${ability.text}: a triggered ability works from the battlefield, or from a graveyard (\`zone: "graveyard"\`)`);
      return;
    }
    /* A condition on a static (Forge's IsPresentStatic) is read by the layers (rules/layers.mjs), and a static that works
       from a graveyard is a layer's too; a rule static (rules/statics.mjs) reads neither yet, and is refused rather than
       always on. */
    if (ability.kind === "static" && ability.rule && ((ability.condition && !RULES_READING_A_CONDITION.includes(ability.rule)) || ability.worksFrom))
      problems.push(`${ability.text}: a condition or a graveyard on a rule static, which nothing reads yet`);
    /* Or everywhere but the battlefield, about itself (CR 113.6c; rules/layers.mjs, awayEffects): "As long as Grist isn't on
       the battlefield, it's a 1/1 Insect creature in addition to its other types" (Grist, the Hunger Tide). */
    if (ability.kind === "static" && ability.worksFrom === "elsewhere" && !(ability.affects?.self === true && Object.keys(ability.affects).length === 1 && !ability.rule && !ability.condition))
      problems.push(`${ability.text}: a static that works everywhere but the battlefield is about itself (\`affects: {self: true}\`), with no rule or condition`);
    if (ability.kind === "static" && ability.worksFrom !== undefined && !["graveyard", "elsewhere"].includes(ability.worksFrom)) problems.push(`${ability.text}: a static works from the battlefield, or from a graveyard`);
    /* An opening hand's action (rules/mulligan.mjs): revealing the card, and the delayed trigger that makes (CR 103.6b, 603.7g)
       -- or beginning the game with it on the battlefield (103.6a; Gemstone Caverns, wave 4b): `begin: "battlefield"`, its
       counters (`withCounters`, each kind a number, 1 or more), "you're not the starting player" (`notStarting`), and "if you
       do, exile a card from your hand" (`exileFromHand: 1`) -- and nothing else. */
    const beginning = ability.kind === "static" && ability.rule === "opening-hand" && ability.begin !== undefined;
    if (beginning && !(ability.begin === "battlefield" && ability.effects === undefined && (identity.types ?? []).some((t) => ["Artifact", "Battle", "Creature", "Enchantment", "Land", "Planeswalker"].includes(t))
      && (ability.withCounters === undefined || (ability.withCounters && typeof ability.withCounters === "object" && Object.values(ability.withCounters).length > 0
        && Object.values(ability.withCounters).every((n) => Number.isInteger(n) && n >= 1)))
      && [undefined, true].includes(ability.notStarting) && [undefined, 1].includes(ability.exileFromHand)))
      problems.push(`${ability.text}: an opening hand's beginning on the battlefield is begin: "battlefield", a permanent card, its counters, notStarting, exileFromHand: 1, and no effects (CR 103.6a)`);
    if (ability.kind === "static" && ability.rule === "opening-hand" && !beginning && !((ability.effects ?? []).length && ability.effects.every((e) => e?.effect === "delayedTrigger")))
      problems.push(`${ability.text}: an opening hand's action reveals the card and makes a delayed trigger (CR 103.6b), or begins the game with it on the battlefield (103.6a)`);
    /* A layer static's `affects` is read by the layers' own matcher: a key it does not read is refused, not ignored. */
    if (ability.kind === "static" && ability.layer !== undefined)
      for (const key of Object.keys(ability.affects ?? {})) if (!LAYER_AFFECTS_KEYS.includes(key)) problems.push(`${ability.text}: a layer static's affects has no key ${JSON.stringify(key)}`);
    /* "Attacking creatures you control" (rules/layers.mjs): attacking, never "not attacking", which the layers do not read. */
    if (ability.kind === "static" && ability.layer !== undefined && ability.affects?.attacking !== undefined && ability.affects.attacking !== true)
      problems.push(`${ability.text}: a layer static's affects says attacking: true, or nothing of attacking`);
    /* Escape given ("each nonland card in your graveyard has escape. The escape cost is equal to the card's mana cost plus
       exile three other cards from your graveyard", Underworld Breach): to the cards `affects` describes (the schema asks
       for it), its cost the cards to exile. */
    if (ability.kind === "static" && ability.rule === "escape")
      problems.push(...escapeCostProblems(ability.cost, {given: true}).map((problem) => `${ability.text}: ${problem}`));
    /* What an alternative cost (CR 118.9) may be made of, on any card: mana or none, life, a card exiled from the hand, a
       sacrifice -- and, cast from the graveyard (`zone: "graveyard"`: "you may cast this card from your graveyard by paying
       {3}{R} and exiling four other cards from your graveyard", Squee, Dubious Monarch), other cards of it to exile, a number
       (rules/actions.mjs, alternativeCosts). */
    if (ability.kind === "static" && ability.rule === "alternative-cost") {
      for (const atom of ability.cost ?? []) if (!["mana", "payLife", "exileFromHand", "sacrifice"].includes(atom?.atom) || (atom.atom === "sacrifice" && !atom.selector) || !fixedLife(atom))
        if (!(ability.zone === "graveyard" && atom?.atom === "exileFromGraveyard" && atom.self !== true && Number.isInteger(atom.count) && atom.count >= 1))
          problems.push(`${ability.text}: an alternative cost of ${atom?.atom ?? "something"} nothing pays yet`);
      if (ability.zone !== undefined && ability.zone !== "graveyard") problems.push(`${ability.text}: an alternative cost is cast from where it is, or from the graveyard (\`zone: "graveyard"\`)`);
    }
    /* "Has protection from each color that's not in your commander's color identity" (Commander's Plate; wave 4c, k2): a
       protection static's quality, `outsideCommanderIdentity: true`, alone in `from` -- the colors rules/protection.mjs counts
       for the static's controller as each question is asked. */
    if (ability.kind === "static" && ability.rule === "protection" && ability.from?.outsideCommanderIdentity !== undefined
      && !(ability.from.outsideCommanderIdentity === true && Object.keys(ability.from).length === 1))
      problems.push(`${ability.text}: protection from the colors outside your commander's identity is from: {outsideCommanderIdentity: true}, and nothing beside it`);
    /* "It loses all other ... card types" (Darksteel Mutation; wave 4c, k2): the subtypes of the types it no longer has go
       with them (CR 205.3d; rules/layers.mjs), read after its types are set -- `correspondingSubtypes: true`, in layer 4,
       beside `setTypes`. */
    if (ability.kind === "static" && ability.apply?.correspondingSubtypes !== undefined
      && !(ability.apply.correspondingSubtypes === true && ability.layer === 4 && Array.isArray(ability.apply.setTypes)))
      problems.push(`${ability.text}: correspondingSubtypes is true, in layer 4, beside setTypes (CR 205.3d)`);
    /* "A deck can have any number of cards named <this card>" (CR 100.2a): said of the card's own name, or no card says it. */
    if (ability.kind === "static" && ability.rule === "any-number-in-deck" && ability.text !== `A deck can have any number of cards named ${identity.name}.`)
      problems.push(`${ability.text}: any number of a card in a deck is the card's own words, of its own name`);
    /* What follows a prevention is done at once, inside the damage event (CR 615.5): nothing in it may stop to ask. */
    if (ability.kind === "replacement") for (const effect of ability.change?.then ?? [])
      if (!EFFECTS[effect?.effect]) problems.push(`${ability.text}: ${effect?.effect} follows a prevention, and it asks a question or is not built`);
    /* static and replacement: their schema is the rules modules' own shape -- a token a replacement makes, named as a
       predefined one, given its definition (predefinedIn). */
    abilities.push({...predefinedIn(ability, problems), id});
  });

  /* What a static or an effect gives (compileGrant): compiled here, in place of the script's words. */
  for (const [index, ability] of abilities.entries()) {
    /* "This creature has all activated abilities of that card" (Conspicuous Snoop): the top card's, in layer 6 (CR 613.1f),
       what that card must be a list of subtypes (rules/layers.mjs, topCardGrant). */
    if (ability.kind === "static" && ability.apply?.topCardAbilities !== undefined) {
      if (ability.layer !== 6) problems.push(`${ability.text}: abilities are given in layer 6 (CR 613.1f)`);
      const wanted = ability.apply.topCardAbilities;
      if (!wanted || typeof wanted !== "object" || Object.keys(wanted).some((k) => k !== "subtypes") || !Array.isArray(wanted.subtypes))
        problems.push(`${ability.text}: what the top card must be is {subtypes: [...]}`);
    }
    /* "Thranduil has all activated abilities of all Elf cards in your graveyard": those cards' (rules/layers.mjs,
       graveyardGrant), in layer 6, what they must be a list of subtypes. */
    if (ability.kind === "static" && ability.apply?.graveyardAbilities !== undefined) {
      if (ability.layer !== 6) problems.push(`${ability.text}: abilities are given in layer 6 (CR 613.1f)`);
      const wanted = ability.apply.graveyardAbilities;
      if (!wanted || typeof wanted !== "object" || Object.keys(wanted).some((k) => k !== "subtypes") || !Array.isArray(wanted.subtypes) || !wanted.subtypes.length)
        problems.push(`${ability.text}: what the graveyard's cards must be is {subtypes: [...]}`);
    }
    if (ability.kind === "static" && ability.apply?.addAbilities !== undefined) {
      if (ability.layer !== 6) problems.push(`${ability.text}: abilities are given in layer 6 (CR 613.1f)`);
      const given = compileGrant(ability.apply.addAbilities, ability.text, problems);
      if (given) abilities[index] = {...ability, apply: {...ability.apply, addAbilities: given.abilities,
        ...(given.keywords.length ? {addKeywords: [...(ability.apply.addKeywords ?? []), ...given.keywords]} : {})}};
    }
    if (["activated", "triggered"].includes(ability.kind)) compileGivenIn(ability.effects, ability.text, problems);
    /* "If you do, it gains '...'" (Serra Paragon): what a permission to play gives what is played through it (rules/actions.mjs). */
    if (ability.kind === "static" && ability.rule === "play-from" && ability.grants !== undefined) {
      const given = compileGrant(ability.grants, ability.text, problems);
      if (given) abilities[index] = {...ability, grants: given.abilities};
    }
  }
  if (spell) compileGivenIn(spell.effects, spell.text, problems);

  const types = identity.types;
  if (!spell && types.some((t) => t === "Instant" || t === "Sorcery")) problems.push("an instant or sorcery with no spell ability does nothing");
  if (enchant && !(identity.subtypes ?? []).includes("Aura")) problems.push("Enchant on a card that is not an Aura");
  if (enchant && spell) problems.push("an Aura's spell is its Enchant target, and it has no other");
  /* The Aura as a spell: its one target, nothing done as it resolves -- it enters attached (stack.mjs). */
  if (enchant) spell = {id: "enchant", text: enchant.text, targets: [enchant.target], effects: [], ...(enchant.hostile ? {hostile: true} : {})};
  /* One behold to a card (rules/actions.mjs asks one question of it): among its additional costs and its flashback cost. */
  const beholds = [...(spell?.additionalCost ?? []).flatMap((a) => (a?.atom === "oneOf" ? (a.options ?? []).flat() : [a])),
    ...abilities.filter((a) => a.kind === "static" && a.rule === "flashback").flatMap((a) => a.cost ?? [])].filter((a) => a?.atom === "behold");
  if (beholds.length > 1) problems.push("one behold to a card, among its additional costs and its flashback cost");
  /* "This spell costs {1} less to cast if it targets a creature with flying" (Swampsnare Trap; CR 601.2c, then 601.2f): costed
     for each way to choose its targets (rules/actions.mjs, aimsFor) -- a spell with targets chosen as it is offered, never
     counted ones picked after, nor its modes' (a modal spell's targets are its modes', none of its own). */
  if (abilities.some((a) => a.kind === "static" && a.rule === "this-costs-less" && a.targeting !== undefined)
    && (!spell || !(spell.targets ?? []).length || spell.targets.some(countedTarget)))
    problems.push("a spell that costs less for what it targets has targets chosen as it is offered: none counted, and no modes");
  /* "As though it had flash if it targets a commander" (Timely Ward; rules/actions.mjs, flashAims): the same -- its targets chosen
     as it is offered, so none counted, and no modes. */
  if (abilities.some((a) => a.kind === "static" && a.rule === "flash-if-targets") && (!spell || spell.modal || !(spell.targets ?? []).length || spell.targets.some(countedTarget)))
    problems.push("a spell with flash for what it targets has targets chosen as it is offered: none counted, and no modes");
  /* Escalate's (CR 702.120a), on a spell whose modes are chosen as it is cast, "choose one or more": its cost once for each mode
     beyond the first, as many as the spell allows (rules/actions.mjs, additionalVariants and withModes). */
  const oneOrMore = Boolean(spell?.modal) && (spell.modal.choose ?? 1) === 1 && (spell.modal.upTo ?? 1) > 1;
  if (escalate !== null && !oneOrMore) problems.push("Escalate is on a spell whose modes are chosen as it is cast, one or more of them");
  if (escalate !== null && oneOrMore) spell = {...spell, additionalCost: [...(spell.additionalCost ?? []), {atom: "escalate", ...escalate, most: Math.min(spell.modal.upTo, spell.modal.modes.length) - 1}]};
  /* Tiered's (CR 702.183a), on a spell whose one mode is chosen as it is cast: each mode's cost, mana, in the modes' order --
     and a mode's cost is tiered's alone. */
  const modeCosts = spell?.modal ? spell.modal.modes.map((m) => m.cost) : [];
  const manaOnly = (cost) => { try { return typeof cost === "string" && parseManaCost(cost).variable === 0 && /^(\{[^}]+\})+$/.test(cost); } catch { return false; } };
  if (tiered && !(spell?.modal && (spell.modal.choose ?? 1) === 1 && spell.modal.upTo === undefined && spell.modal.more === undefined))
    problems.push("Tiered is on a spell whose one mode is chosen as it is cast");
  else if (tiered && !modeCosts.every(manaOnly)) problems.push("Tiered: each mode says its cost, mana (`cost`, \"{0}\" for none)");
  else if (tiered) spell = {...spell, additionalCost: [...(spell.additionalCost ?? []), {atom: "tiered", costs: modeCosts}]};
  /* Spree's (CR 702.172a), on a spell whose modes are chosen as it is cast, one or more of them and as many as it has: each
     mode's cost, mana, in the modes' order. */
  if (spree && !(oneOrMore && spell.modal.upTo === spell.modal.modes.length && spell.modal.more === undefined && !spell.modal.sameMode))
    problems.push("Spree is on a spell whose modes are chosen as it is cast, one or more of them, any of its modes");
  else if (spree && !modeCosts.every(manaOnly)) problems.push("Spree: each mode says its cost, mana (`cost`)");
  else if (spree) spell = {...spell, additionalCost: [...(spell.additionalCost ?? []), {atom: "spree", costs: modeCosts}]};
  if (!tiered && !spree && modeCosts.some((cost) => cost !== undefined)) problems.push("a mode's own cost is tiered's or spree's: the spell says which (CR 702.183a, 702.172a)");
  /* Multikicker's additional cost, on the spell -- a permanent's too, whose spell does nothing else (CR 608.3). */
  if (multikicker !== null) spell = {...(spell ?? {id: "multikicker", text: "Multikicker", targets: [], effects: []}), additionalCost: [...(spell?.additionalCost ?? []), {atom: "multikicker", cost: multikicker}]};
  /* Kicker's, the same way. */
  if (kicker !== null) spell = {...(spell ?? {id: "kicker", text: "Kicker", targets: [], effects: []}), additionalCost: [...(spell?.additionalCost ?? []), {atom: "kicker", cost: kicker}]};
  if (spell?.kicked && kicker === null) problems.push("a kicked spell's script is a card with kicker's");
  /* Offspring's additional cost, on the spell -- a creature's, whose spell does nothing else (CR 608.3) -- and its trigger as
     the permanent enters, its "if" an intervening one (CR 603.4; script/condition.mjs, `offspringPaid`): a token copy of it,
     its copiable values with a base power and toughness of 1/1 (CR 707.9b), and of it as it last existed should it be gone
     by then (CR 608.2h; the card's rulings; effects/permanents.mjs, copyPermanent's `lastKnown`). */
  if (offspring !== null) {
    spell = {...(spell ?? {id: "offspring", text: offspring.text, targets: [], effects: []}), additionalCost: [...(spell?.additionalCost ?? []), {atom: "offspring", cost: offspring.cost}]};
    abilities.push({id: offspring.id, kind: "triggered", text: offspring.text, trigger: TRIGGERS.enters({who: "self"}), condition: {offspringPaid: true},
      effects: [{effect: "copyPermanent", targets: "self", lastKnown: true, except: {setPower: 1, setToughness: 1}}]});
  }
  /* Replicate's additional cost, on the spell (an instant or sorcery's, which has one). */
  if (replicate !== null && !spell) problems.push("Replicate is on a spell with something to copy: its spell ability");
  else if (replicate !== null) spell = {...spell, additionalCost: [...(spell.additionalCost ?? []), {atom: "replicate", cost: replicate}]};
  /* Gift's additional cost, on the spell (CR 702.174a) -- a permanent's too, whose spell does nothing else (CR 608.3) -- and
     what the chosen player gets: an instant's or a sorcery's first, before its other effects (702.174j), or a permanent's
     trigger as it enters, its "if" an intervening one (702.174b, CR 603.4). Not on a spell whose modes are chosen as it is
     cast: its effects are its modes'. */
  if (gift !== null) {
    const fleeting = types.some((t) => t === "Instant" || t === "Sorcery");
    const given = gift.effects.map((effect) => ({...effect, condition: {giftPromised: true}}));
    if (fleeting && (!spell || spell.modal)) problems.push(`${gift.text}: a gift on an instant or sorcery is given by its spell ability, one without modes chosen as it is cast`);
    else if (fleeting) spell = {...spell, additionalCost: [...(spell.additionalCost ?? []), {atom: "gift"}], effects: [...given, ...(spell.effects ?? [])]};
    else {
      spell = {...(spell ?? {id: "gift", text: gift.text, targets: [], effects: []}), additionalCost: [...(spell?.additionalCost ?? []), {atom: "gift"}]};
      abilities.push({id: gift.id, kind: "triggered", text: gift.text, trigger: TRIGGERS.enters({who: "self"}), condition: {giftPromised: true}, effects: gift.effects});
    }
  }

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
      /* A NONMODAL DOUBLE-FACED CARD (CR 712.2; `layout: "transform"`): the same two faces, the back one reached only by
         transforming (state/index.mjs, transformObject) -- never cast or played with its back face up (CR 712.11), and its
         back face's mana value its front's (202.3b). */
      definition.mdfc = {front: faceOfDefinition(definition, names[0]), back: faceOfDefinition(back.definition, names[1]), ...(script.layout === "transform" ? {transforming: true} : {})};
    }
  }
  /* AN ADVENTURER CARD (CR 715): "Card // Adventure", the Adventure -- an instant or sorcery with the subtype Adventure --
     compiled as a card of its own, the card's oracle id and color identity both halves' (CR 903.4). Its own characteristics
     and the Adventure's go with the card (`adventurer`); which it has is the object's (state/index.mjs): the Adventure's only
     cast as one and on the stack (715.3b), its own everywhere else (715.4). Cast as an Adventure, it is exiled as it
     resolves and may be cast as itself from there (715.3d; rules/actions.mjs, rules/stack.mjs). */
  if (script.adventure !== undefined) {
    const names = String(identity.name).split(" // ");
    const adventure = compileScript({schema: script.schema, identity: {...script.adventure.identity, oracleId: identity.oracleId, colorIdentity: identity.colorIdentity ?? []},
      oracleText: script.adventure.oracleText, source: script.source, abilities: script.adventure.abilities});
    if (names.length !== 2 || script.adventure.identity?.name !== names[1]) problems.push(`an adventurer card is named "Card // Adventure", and its Adventure is the second name`);
    for (const problem of adventure.problems) problems.push(`Adventure: ${problem}`);
    /* What is cast from exile after it is a permanent spell (715.3d): an adventurer card is a permanent card. */
    if (types.some((t) => t === "Instant" || t === "Sorcery")) problems.push("an adventurer card is a permanent card; its Adventure is the instant or sorcery");
    if (adventure.definition) definition.adventurer = {main: faceOfDefinition(definition, names[0]), adventure: faceOfDefinition(adventure.definition, names[1])};
  }
  /* A PREPARATION CARD (CR 722): "Card // Prepare spell", the prepare spell -- the inset frame's alternative characteristics
     (722.2) -- compiled as a card of its own, the card's oracle id and color identity both halves' (CR 903.4), and kept with
     the card (`preparation`): never cast as itself (722.3), the card having only its own characteristics in every zone
     (722.4). They are what the copy it makes in exile as it becomes prepared is (722.3c; script/effects/attributes.mjs).
     Built for a permanent card whose prepare spell is an instant or a sorcery. */
  if (script.prepare !== undefined) {
    const names = String(identity.name).split(" // ");
    const prepared = compileScript({schema: script.schema, identity: {...script.prepare.identity, oracleId: identity.oracleId, colorIdentity: identity.colorIdentity ?? []},
      oracleText: script.prepare.oracleText, source: script.source, abilities: script.prepare.abilities});
    if (names.length !== 2 || script.prepare.identity?.name !== names[1]) problems.push("a preparation card is named \"Card // Prepare spell\", and its prepare spell is the second name");
    for (const problem of prepared.problems) problems.push(`prepare spell: ${problem}`);
    if (!(script.prepare.identity?.types ?? []).some((t) => t === "Instant" || t === "Sorcery")) problems.push("a prepare spell that is a permanent spell is not built");
    if (types.some((t) => t === "Instant" || t === "Sorcery")) problems.push("a preparation card is a permanent card: only a permanent becomes prepared (CR 722.3a)");
    /* `of`: the card's own name, the only one it has in every zone (CR 722.4) -- what its object is called (state/index.mjs). */
    if (prepared.definition) definition.preparation = {...faceOfDefinition(prepared.definition, names[1]), of: names[0]};
  }
  return {definition: problems.length ? null : definition, problems: [...new Set(problems)]};
}

/* One face's characteristics, from its compiled definition, under its own name: a double-faced card's front or back
   (CR 712.8), an adventurer card's own or its Adventure's (CR 715.2). */
const faceOfDefinition = (d, name) => ({card: name, types: [...d.types], subtypes: [...d.subtypes], ...(d.supertypes ? {supertypes: [...d.supertypes]} : {}), manaCost: d.manaCost,
  colors: [...d.colors], power: d.power, toughness: d.toughness, ...(Number.isInteger(d.loyalty) ? {loyalty: d.loyalty} : {}), keywords: [...d.keywords], abilities: structuredClone(d.abilities),
  ...(d.spell ? {spell: structuredClone(d.spell)} : {}), ...(d.enchant ? {enchant: structuredClone(d.enchant)} : {})});

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
