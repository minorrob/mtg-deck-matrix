/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE ENGINE'S VOCABULARY, AND WHERE IT MEETS THE APP'S.
 *
 * `docs/engine/PLAN.md` §3.4 names "the primitive catalog" as one of the four things the compiler
 * is handed — the schema as a tool definition, the oracle text, the parser's pre-pass, and this.
 * Until now it has been a prose list in §12.2: something a person reads, not something a program
 * can check. This is that list as data, and `engine-vocabulary` holds the two against each other.
 *
 * WHY IT COMES BEFORE THE SCHEMA. `CrankCardScript@1`'s `effects[]` names a primitive. If the legal
 * names are not declared, the schema either repeats them — and drifts from §12.2 the first time
 * either moves — or accepts any string, and then an unsupported construct arrives silently. That is
 * the exact failure principle 6 exists to prevent: unsupported is loud, never a no-op.
 *
 * ---------------------------------------------------------------------------------------------
 * THE SEAM, AND WHAT MEASURING IT CHANGED.
 *
 * `card-classify.js` derives fifteen lists from oracle text by regex, and six files read them. The
 * engine describes the same cards in a different vocabulary. Before this file, nothing mapped
 * between the two and nothing could tell you they disagreed.
 *
 * The expectation going in was that ROLES were the seam. Running the classifier over all 2,367
 * cards said otherwise, and this is the useful part:
 *
 *   ROLES ARE NOT THE SEAM. `finisher`, `ramp`, `wipe` are strategic judgments. No sequence of
 *   primitives derives them — two cards with identical effects are a finisher and a nothing
 *   depending on the deck around them. They belong to the app in the way the glossary does, and
 *   bridging them would be tidiness pretending to be architecture.
 *
 *   TRIGGERS AND KEYWORDS ARE. Both are small, concrete, describe the same events, and already
 *   disagree in three ways that would each fail silently:
 *
 *     - the app hyphenates `double-strike` where the engine spaces `double strike`;
 *     - the app knows `shroud` and `ward`, which §12.2's tier 0 list does not carry;
 *     - the app says `unblockable`, which has not been a keyword since 2012.
 *
 *   And one gap the comparison found in the ENGINE, now closed: the app recognizes `life-loss`, and
 *   §12.2's trigger list carried "life gained" with no counterpart, although "whenever you lose
 *   life" is an ordinary Magic trigger. The plan gained "life lost".
 *
 * Every one of those is the kind of mismatch that matches nothing and errors nowhere.
 * ---------------------------------------------------------------------------------------------
 *
 * WHAT THIS IS NOT. It is not an ontology in the OWL sense and does not want a reasoner. The
 * vocabulary is finite, closed and enumerated, and every question asked of it — is this declared,
 * which cards use it, what does this term mean over there — is a membership test, a count or a
 * lookup. Description logic is open-world, where "not stated" means "unknown"; here it has to mean
 * "unsupported, loudly", which is the opposite. And the hard parts of this domain — layers with
 * dependency, replacement effects rewriting an event before it happens — are procedural, which no
 * subsumption hierarchy expresses at all.
 */

/* ---- the engine's own terms ---- */

/**
 * The effect primitives of §12.2, by family. Tier 0, measured on Rob's seven decks.
 *
 * Grouped the way the plan groups them, because the families are how the compiler is prompted and
 * how coverage is reported — a flat list of seventy-one names is not something anybody can read.
 */
export const PRIMITIVES = Object.freeze({
  zones: Object.freeze([
    "moveZone", "moveZoneAll", "draw", "discard", "mill", "shuffle", "dig", "surveil", "scry",
    "peekAndReveal", "sacrifice", "sacrificeAll", "destroy", "destroyAll", "exileUntil",
    "returnToHand", "play", "mayPlay", "discover", "digUntil", "manifest", "explore",
    /* Wave 4b: the top of a library looked at and put back in any order (Forge's RearrangeTopOfLibrary; Ponder). */
    "rearrangeTop",
  ]),
  mana: Object.freeze([
    "addMana", "addManaReflected", "tap", "untap", "untapAll", "costReduction", "alternativeCost",
  ]),
  life: Object.freeze([
    "gainLife", "loseLife", "dealDamage", "damageEach", "damageAll", "exchangeLife", "fight",
  ]),
  counters: Object.freeze([
    "putCounter", "putCounterAll", "removeCounter", "proliferate", "multiplyCounters",
    "moveCounters", "replaceCounters", "amass", "poison", "winGame", "loseGame", "goad", "empowerJace", "becomeMonarch",
    /* Wave 4c: "roll a d20" (CR 706; Forge's RollDice; Ancient Copper Dragon), its result counted by what follows. */
    "rollDie",
  ]),
  permanents: Object.freeze([
    "createToken", "copyPermanent", "becomeCopy", "earthbend", "populate", "unlessPays", "animate", "animateAll", "attach", "gainControl", "setState",
    "phaseOut", "exchangeControl", "incubate",
    /* The library load's L1: "you get an emblem with ..." (CR 114), an object in the command zone, not a permanent (114.5). */
    "emblem", "mergePermanent", "ringTempts",
  ]),
  modifiers: Object.freeze([
    "pump", "pumpAll", "alterAttribute", "effectUntil", "grantKeyword", "regenerate",
    /* Wave 4d L3: removed from combat (CR 506.4; Reconnaissance). */
    "removeFromCombat",
  ]),
  flow: Object.freeze([
    "modal", "sequence", "repeatFor", "branch", "delayedTrigger", "immediateTrigger", "counterSpell",
    "copySpell", "addTurn", "chooseCard", "chooseType", "chooseColor", "genericChoice", "twoPiles", "connive",
    "investigate", "cleanup", "addPhase", "changeTargets", "chooseSource", "vote",
  ]),
});

/** Every primitive, flat. */
export const ALL_PRIMITIVES = Object.freeze(Object.values(PRIMITIVES).flat());

/**
 * The events a triggered ability can watch (§12.2, Triggers).
 *
 * Written as the engine's own short names rather than the plan's prose, because a trigger condition
 * has to carry one of these as a value. `trigger.mjs` matches over the journal's event kinds today;
 * phase 2 compiles a card's "whenever…" clause to one of these and the two meet there.
 */
export const TRIGGER_EVENTS = Object.freeze([
  "enters", "dies", "leaves", "exiled",
  "phase", "step", "upkeep", "end step",
  "attacks", "attackers declared", "blocks",
  "mutates", "spell cast", "damage dealt", "damage dealt once",
  "discarded", "drawn", "land played", "becomes target", "sacrificed", "tapped for mana", "becomes tapped", "cycled",
  "put into graveyard", "left graveyard",
  "counter added", "counter added once", "life gained", "life lost", "token created",
  "becomes monstrous", "chapter",
  /* "Whenever you activate a loyalty ability" (CR 606; the live-game plan of 2026-10-04, P4). */
  "loyalty activated",
  /* "Whenever you scry or surveil" (CR 701.22a, 701.25a). */
  "scried",
  /* "Whenever you proliferate" (CR 701.34a; Train C, w2c-hands-triggers). */
  "proliferated",
  /* "Whenever you commit a crime" (CR 700.13; Train C, w2c-hands-triggers). */
  "crime committed",
  /* A state trigger, "when this artifact has twenty or more charge counters on it" (CR 603.8; Train C, w2c-hands-triggers). */
  "state",
  /* "Whenever this creature transforms into Ashling, Rimebound" (CR 701.27e; Train C, w2c-hands-triggers). */
  "transformed",
  /* "When this Class becomes level 2" (CR 716.2a; Caretaker's Talent, Wizard Class; wave 4c). */
  "becomes level",
  /* "Whenever a permanent becomes untapped" (CR 701.26b; Mesmeric Orb; card load w4d, L2). */
  "becomes untapped",
]);

/** The cost atoms of §12.2. The two symbolic ones are named; the rest are structural. */
export const COST_ATOMS = Object.freeze([
  "{T}", "{Q}",
  "mana", "generic", "sacrifice", "removeCounters", "addCounters", "discard", "exileFromGraveyard",
  "tapUntapped", "reveal", "payLife", "removeAnyCounter", "mill", "draw", "returnToHand",
]);

/* §12.2 lists fifty-three named things, including mutate. Not all of them are keywords — see TIER0_CONSTRUCTS. */
const TIER0_ALL = [
  "flying", "defender", "flash", "vigilance", "lifelink", "equip", "haste", "flashback",
  "mutate", "first strike", "trample", "enters with counters", "overload", "reach", "enchant", "deathtouch",
  "indestructible", "enters-the-battlefield replacements", "alternate additional cost", "menace",
  "changeling", "class", "cycling", "echo", "crew", "hexproof", "partner", "double strike",
  "escape", "protection", "unearth", "rebound", "evoke", "hideaway", "landwalk", "living weapon",
  "escalate", "multikicker", "evolve", "backup", "convoke", "cumulative upkeep", "infect",
  "flanking", "umbra armor", "encore", "afterlife", "storm", "saga chapters", "mentor", "prowl",
  "ascend", "increment",
];

/**
 * The things in §12.2's keyword list that are NOT keywords.
 *
 * The distinction is operational, not pedantic: a keyword is something `grantKeyword` can hand to a
 * permanent. "Saga chapters" cannot be granted to anything — it is a construct family that got
 * grouped with the keywords because it was measured the same way. Separating them is what stops
 * `isKeyword` from saying yes to something no rule could then read.
 */
export const TIER0_CONSTRUCTS = Object.freeze([
  "enters with counters", "enters-the-battlefield replacements", "alternate additional cost",
  "class", "saga chapters", "increment",
]);

/** The keyword abilities of tier 0 — the ones `grantKeyword` can actually grant. */
export const TIER0_KEYWORDS = Object.freeze(TIER0_ALL.filter((word) => !TIER0_CONSTRUCTS.includes(word)));

/* Keyword abilities the app already recognizes that tier 0 did not carry. Tier 0 was measured on
   seven decks, so this is growth rather than a correction. */
const BEYOND_TIER0 = ["shroud", "ward", "forestwalk",
  /* Train C phase 2, p6-combat: islandwalk (CR 702.14; Meandering Towershell), forestwalk's rule for Islands. */
  "islandwalk",
  /* Wave 4d L3: nonbasic landwalk (CR 702.14; Trailblazer's Boots), a land without the supertype basic. */
  "nonbasic landwalk",
  /* M4 phase 3, batch 54: an ability of the card in hand (cards/index.mjs). Batch 58: station (CR 702.184). */
  "ninjutsu", "station",
  /* Batch 60: a Saga's reminder line, the lore counter it enters with (CR 714.3a). */
  "saga",
  /* Batch 77: toxic (CR 702.164), prowess (CR 702.108), devoid (CR 702.114). */
  "toxic", "prowess", "devoid",
  /* Batch 78: annihilator (CR 702.86). */
  "annihilator",
  /* The live-game plan of 2026-10-04: increment (Berta, Wise Extrapolator; cards/index.mjs, a triggered ability). */
  "increment",
  /* And impending (CR 702.176; Overlord of the Mistmoors): an alternative cost, time counters, not a creature meanwhile. */
  "impending",
  /* Batch 79: commander ninjutsu (CR 702.49d), ninjutsu that also works from the command zone. */
  "commander ninjutsu",
  /* Rob's Priority Batch 10.3, its seventeenth slice: storied (CR 702.195), an enduring story (keywords/designations.mjs). */
  "storied",
  /* Its twentieth: fear (CR 702.36), printed (Shriekmaw). The blocking rule has been keywords/combat.mjs's since batch 59,
     reached only by a static granting it ("has fear"); a card printed with it could not say so. */
  "fear",
  /* Its twenty-eighth: Choose a Background (CR 702.124k), a partner ability -- a deck rule, as Partner is (cards/index.mjs). */
  "choose a background",
  /* Paradigm (CR 702.192; Germination Practicum): a spell exiled as it resolves, cast again as a copy each precombat main
     phase after the first time one of its name resolves (rules/stack.mjs). */
  "paradigm",
  /* Train C: spectacle (CR 702.137; Light Up the Stage), an alternative cost once an opponent lost life this turn. */
  "spectacle",
  /* Train C, phase 2 (p5-keywords): split second (CR 702.61; keywords/timing.mjs), riot (CR 702.136). */
  "split second", "riot",
  /* Surge (CR 702.117) and freerunning (CR 702.173): alternative costs (keywords/timing.mjs). */
  "surge", "freerunning",
  /* Dash (CR 702.109; Ragavan, Nimble Pilferer, wave 4d L3): an alternative cost, haste and a return to the hand (rules/stack.mjs). */
  "dash",
  /* Embalm (CR 702.128): a token copy from the graveyard (cards/index.mjs). */
  "embalm",
  /* Tiered (CR 702.183): each mode its own additional cost (keywords/timing.mjs). */
  "tiered",
  /* Library load L2: spree (CR 702.172), each mode chosen its own additional cost (keywords/timing.mjs). */
  "spree",
  /* Suspend (CR 702.62), from the hand (keywords/timing.mjs). */
  "suspend",
  /* Plot (CR 702.170), from the hand, and the cast on a later turn it allows (library load L5; rules/actions.mjs). */
  "plot",
  /* Partner with [name] (CR 702.124j): a deck rule and a trigger as it enters (cards/index.mjs). */
  "partner with",
  /* Firebending N (CR 702.189): an attack trigger, its mana kept until end of combat (cards/index.mjs, rules/turn.mjs). */
  "firebending",
  /* Compleated (CR 702.150): fewer loyalty counters for Phyrexian mana paid with life (rules/replacement.mjs). */
  "compleated",
  /* Disguise (CR 702.168): cast face down for {3}, turned face up for its cost (rules/actions.mjs). */
  "disguise",
  /* Morph (CR 702.37): the same without ward (rules/actions.mjs, state/index.mjs). */
  "morph",
  /* Train E: warp (CR 702.185), an alternative cost from the hand, exiled at the next end step and cast again later; and sneak
     (CR 702.190), one in its caster's declare blockers step, entering tapped and attacking (cards/index.mjs, rules/actions.mjs,
     rules/stack.mjs). */
  "warp", "sneak",
  /* Train E, wave 2: replicate (CR 702.56a; Lose Focus), an additional cost paid any number of times and a cast trigger
     copying the spell for each (cards/index.mjs, rules/actions.mjs). */
  "replicate",
  /* Wave 4a: shadow (CR 702.28), a keyword counter's (Minas Morgul, Dark Fortress; CR 122.1b; keywords/combat.mjs). */
  "shadow",
  /* Wave 4c: affinity (CR 702.41), the spell's own cost reduction for each of a kind of permanent its caster controls
     (cards/index.mjs). */
  "affinity",
  /* Wave 4b: exalted (CR 702.83) and extort (CR 702.101), triggered abilities; eternalize (CR 702.129), embalm's 4/4 black
     copy; gift (CR 702.174), an optional additional cost choosing an opponent (cards/index.mjs, rules/actions.mjs). */
  "exalted", "extort", "eternalize", "gift",
  /* Wave 4c: offspring (CR 702.175), an optional additional cost and a 1/1 token copy as it enters (cards/index.mjs,
     rules/actions.mjs). */
  "offspring",
  /* Wave 4c, k2: fabricate (CR 702.123a; Marionette Apprentice), a triggered ability -- +1/+1 counters or Servo tokens, its
     controller's choice as it resolves (cards/index.mjs). */
  "fabricate",
  /* Wave 4c, k2: delve (CR 702.66a; Treasure Cruise, Dig Through Time), cards of the graveyard exiled to pay generic mana as a
     spell is cast (rules/actions.mjs). */
  "delve",
  /* Library load L4: bushido (CR 702.45; Hand of Honor), a triggered ability as it blocks or becomes blocked (cards/index.mjs); and
     saddle (CR 702.171; Bounding Felidar), crew's cost making a Mount saddled until end of turn (cards/index.mjs). */
  "bushido",
  "saddle",
  /* And dredge (CR 702.52a; Life from the Loam), a draw replaced from the graveyard, its player's choice (script/effects/zones.mjs). */
  "dredge",
  /* Card load w4d L1: mobilize (CR 702.181; Voice of Victory), a triggered ability as it attacks (cards/index.mjs). */
  "mobilize",
  /* Wave 4d, L6: kicker (CR 702.33a; Tear Asunder), an optional additional cost paid once at most, and what the spell does then
     (cards/index.mjs, rules/actions.mjs, rules/stack.mjs). */
  "kicker",
  /* And improvise (CR 702.126a; Organic Extinction), artifacts tapped to pay a spell's generic mana, as convoke's creatures
     are (rules/actions.mjs). */
  "improvise",
  /* Rob's lists, P1: myriad (CR 702.116a; Battle Angels of Tyr), an attack trigger making token copies attacking the other
     opponents (cards/index.mjs). */
  "myriad",
  /* And cascade (CR 702.85a; Apex Devastator), a cast trigger: cards exiled until a nonland one that costs less, cast free
     (cards/index.mjs). */
  "cascade",
  /* Rob's lists P2: devour (CR 702.82; Feasting Hobbit's "Devour Food 3"), permanents sacrificed as it enters for +1/+1
     counters (cards/index.mjs, rules/entering.mjs); skulk (CR 702.118; Gollum, Obsessed Stalker), evasion (keywords/combat.mjs). */
  "devour", "skulk"];

/** Every keyword the engine will accept in a card script. */
export const KEYWORDS = Object.freeze([...TIER0_KEYWORDS, ...BEYOND_TIER0]);

const PRIMITIVE_SET = new Set(ALL_PRIMITIVES);
const KEYWORD_SET = new Set(KEYWORDS);
const TRIGGER_SET = new Set(TRIGGER_EVENTS);

/** Whether a card script may name this effect. */
export const isPrimitive = (name) => PRIMITIVE_SET.has(name);
/** Whether `grantKeyword` may grant this. */
export const isKeyword = (name) => KEYWORD_SET.has(name);
/** Whether a triggered ability may watch for this. */
export const isTriggerEvent = (name) => TRIGGER_SET.has(name);

/* ---- the app's terms, declared ---- */

/**
 * What `card-classify.js` actually emits over the whole corpus, dimension by dimension.
 *
 * Declared here and checked against the classifier's real output in `engine-vocabulary`, which is
 * worth having on its own account and not only for the bridge: six files read these terms, and a
 * typo in one of the classifier's regexes emits a term nothing matches. Every screen still renders;
 * the card simply stops appearing in a category it belongs to, and nobody is told.
 */
export const APP_TERMS = Object.freeze({
  roles: Object.freeze([
    "artifacts", "blink", "copy", "cost-reduction", "counter-removal", "counters", "creatures",
    "draw", "extra-turn", "finisher", "graveyard", "instants", "lands", "protection", "ramp",
    "recursion", "removal", "sac-outlet", "tutor", "untap", "wipe",
  ]),
  causes: Object.freeze([
    "attack", "cast-artifact", "cast-creature", "cast-enchantment", "cast-instant-sorcery",
    "cast-legendary", "combat-begin", "counter-placed", "creature-dies", "creature-etb",
    "draw-card", "graveyard-entry", "land-drop", "life-gain", "life-loss", "sacrifice",
  ]),
  triggers: Object.freeze([
    "attack", "cast-artifact", "cast-creature", "cast-enchantment", "cast-instant-sorcery",
    "cast-legendary", "cast-spell", "combat-begin", "counter-placed", "creature-dies",
    "creature-etb", "draw-card", "end-step", "graveyard-entry", "land-drop", "life-gain",
    "life-loss", "sacrifice", "upkeep",
  ]),
  produces: Object.freeze(["card", "counter", "life", "mana", "token", "treasure"]),
  consumes: Object.freeze(["card", "counter", "life", "treasure"]),
  grants: Object.freeze([
    "deathtouch", "double-strike", "first-strike", "flying", "haste", "hexproof", "indestructible",
    "lifelink", "menace", "protection", "reach", "shroud", "trample", "unblockable", "vigilance",
    "ward",
  ]),
  extends: Object.freeze([
    "deathtouch", "double-strike", "first-strike", "flying", "haste", "hexproof", "indestructible",
    "keywords", "lifelink", "menace", "protection", "reach", "shroud", "trample", "vigilance",
    "ward",
  ]),
  /* Said in words rather than left as an empty map, because an empty map reads as unfinished work
     and this is a decision. */
  rolesAreNotBridged:
    "A role is a strategic judgment, not an effect. Two cards with identical primitives are a "
    + "finisher and a nothing depending on the deck around them, so no derivation from the engine's "
    + "vocabulary produces one. Roles stay the app's own, as the glossary and Primary Purpose do.",
});

/* ---- the bridge ---- */

/** The app hyphenates two keywords the engine spaces. Normalizing one way, here, once. */
export function normalizeKeyword(term) {
  return String(term ?? "").replace(/-/g, " ");
}

/**
 * The app's trigger terms in the engine's vocabulary.
 *
 * `filter` is what the five `cast-*` terms need: they are ONE engine event with a card-type filter,
 * not five events, and flattening them into five would put four names in the engine's vocabulary
 * that no rule ever produces.
 *
 * `event: null` means the engine has no counterpart yet. Recorded rather than mapped to something
 * near it, because a wrong mapping compiles and is then silently incorrect, which is worse than a
 * gap that is written down.
 */
export const TRIGGER_BRIDGE = Object.freeze({
  "attack": {event: "attacks", filter: null},
  "cast-spell": {event: "spell cast", filter: null},
  "cast-artifact": {event: "spell cast", filter: "Artifact"},
  "cast-creature": {event: "spell cast", filter: "Creature"},
  "cast-enchantment": {event: "spell cast", filter: "Enchantment"},
  "cast-instant-sorcery": {event: "spell cast", filter: "Instant|Sorcery"},
  "cast-legendary": {event: "spell cast", filter: "Legendary"},
  "combat-begin": {event: "phase", filter: "COMBAT_BEGIN"},
  "counter-placed": {event: "counter added", filter: null},
  "creature-dies": {event: "dies", filter: "Creature"},
  "creature-etb": {event: "enters", filter: "Creature"},
  "draw-card": {event: "drawn", filter: null},
  "end-step": {event: "step", filter: "END_OF_TURN"},
  "graveyard-entry": {event: "dies", filter: null},
  "land-drop": {event: "land played", filter: null},
  "life-gain": {event: "life gained", filter: null},
  /* FOUND BY COMPARING THE TWO VOCABULARIES, AND CLOSED. §12.2's trigger list carried "life gained"
     and no counterpart, although "whenever you lose life" is an ordinary Magic trigger. The plan
     gained "life lost" rather than this being mapped to something near it: a wrong mapping compiles
     and is then silently incorrect, which is worse than a gap somebody can see. */
  "life-loss": {event: "life lost", filter: null},
  "sacrifice": {event: "sacrificed", filter: null},
  "upkeep": {event: "phase", filter: "UPKEEP"},
});

/**
 * The app's keyword terms in the engine's vocabulary.
 *
 * `keyword: null` with a `kind` is the honest answer for a term that is not a keyword at all.
 * "Unblockable" stopped being one in 2012 — the cards read "can't be blocked", which is a static
 * ability. Mapping it to a keyword would put a word on a permanent that no rule reads.
 */
export const KEYWORD_BRIDGE = Object.freeze(Object.fromEntries([
  ...new Set([...APP_TERMS.grants, ...APP_TERMS.extends]),
].map((term) => {
  if (term === "unblockable") {
    return [term, {keyword: null, kind: "static", note: "Not a keyword since 2012; the cards say \"can't be blocked\"."}];
  }
  if (term === "keywords") {
    return [term, {keyword: null, kind: "any", note: "The classifier's term for a card that grants keywords generally."}];
  }
  const word = normalizeKeyword(term);
  return [term, {keyword: isKeyword(word) ? word : null, kind: "keyword"}];
})));
