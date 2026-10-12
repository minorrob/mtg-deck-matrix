/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* CONTINUOUS EFFECTS AND LAYERS: CR 611 TO 613.
 *
 * `docs/engine/PLAN.md` §3.3, ninth row — "the layer system with timestamps and dependency
 * (613.8)".
 *
 * THE STATE HOLDS PRINTED VALUES; THIS DERIVES CURRENT ONES. Every other design is worse in the
 * same way. An engine that applies an anthem by adding one to a creature's power in the state
 * cannot take it back when the anthem leaves, cannot order it against a later effect, and cannot
 * answer "what is this creature without the anthem" — which is the question every subsequent effect
 * has to ask. Here, an effect leaving costs nothing: the next derivation simply does not include
 * it.
 *
 * LAYERS ARE CATEGORIES, NOT PRIORITIES (CR 613.1). Everything in layer 4 happens before anything
 * in layer 6, whatever the timestamps, because a type change decides what an ability-granting
 * effect even applies to. Within a layer it is timestamp order (CR 613.7).
 *
 * THE SUBLAYERS OF LAYER 7 ARE COUNTERINTUITIVE AND THE ORDER IS THE RULE (CR 613.4):
 *
 *   7a  characteristic-defining abilities   (a printed power or toughness that reads off the game)
 *   7b  effects that SET power and toughness
 *   7c  effects that MODIFY them (+2/+2)
 *   7d  counters
 *   7e  effects that switch them
 *
 * So "becomes 1/1" followed by "+2/+2" is a 3/3 whichever was played first, and a +1/+1 counter on
 * a creature set to 1/1 makes it 2/2. Getting this backwards produces boards that are wrong in a
 * way players notice at once and cannot explain.
 *
 * DEPENDENCY BEATS TIMESTAMP (CR 613.8). If applying one effect would change what another applies
 * to, the dependent one waits however old it is. Timestamp order alone is wrong exactly when two
 * effects in one layer interact, which is when anybody is looking.
 *
 * WHAT IS DEFERRED AND NAMED: layer 1 (copy effects, CR 706), layer 3 (text-changing) and layer 7a
 * (characteristic-defining abilities) all need the card script to express them, and each has its
 * slot in the table below rather than being absent. CR 613.8b's dependency LOOP — where two effects
 * depend on each other — falls back to timestamp order here, which is what the rule says to do.
 */

import {conditionHolds} from "../script/condition.mjs";
import {isCounted, amountOf} from "../script/amount.mjs";
import {chosenFor} from "../script/chosen.mjs";
import {hasSubtype, everyCreatureType, isLandType, isCreatureType, isPlaneswalkerType, isEnchantmentType, BASIC_LAND_MANA} from "../keywords/types.mjs";

/** The seven layers of CR 613.1, in order. */
export const LAYERS = Object.freeze([1, 2, 3, 4, 5, 6, 7]);

/** The sublayers of layer 7, in the order CR 613.4 gives. */
const SUBLAYERS = Object.freeze(["a", "b", "c", "d", "e"]);

/* KEYWORD COUNTERS (CR 122.1b): a counter that is a keyword gives the object that keyword -- in layer 6 (CR 613.1f), read
   here with its printed keywords; an effect that removes abilities takes away only the ones whose counter was put on
   before it, in timestamp order (CR 613.7): Abigale's "loses all abilities. Put a flying counter ... on that creature"
   leaves it flying. A counter's timestamp is its placing (effects/resources.mjs addCounters); one it entered with is as
   old as the permanent. The ones the engine plays. */
const KEYWORD_COUNTERS = Object.freeze({"flying": "Flying", "first strike": "First Strike", "double strike": "Double Strike", "deathtouch": "Deathtouch",
  "haste": "Haste", "hexproof": "Hexproof", "indestructible": "Indestructible", "lifelink": "Lifelink", "menace": "Menace", "reach": "Reach",
  "trample": "Trample", "vigilance": "Vigilance",
  /* A shadow counter (Minas Morgul, Dark Fortress; CR 122.1b, 702.28): shadow, keywords/combat.mjs. */
  "shadow": "Shadow"});
const counterKeywords = (counters) => Object.entries(counters ?? {}).filter(([kind, n]) => n > 0 && KEYWORD_COUNTERS[kind]).map(([kind]) => KEYWORD_COUNTERS[kind]);
export const isKeywordCounter = (kind) => Boolean(KEYWORD_COUNTERS[kind]);
/* The keywords an object's counters give it, each with its counter's timestamp. */
const stampedCounterKeywords = (object) => Object.entries(object.counters ?? {}).filter(([kind, n]) => n > 0 && KEYWORD_COUNTERS[kind])
  .map(([kind]) => [KEYWORD_COUNTERS[kind], object.counterStamps?.[kind] ?? object.timestamp ?? 0]);

/* An object's printed characteristics: where a derivation starts. */
function printed(state, id) {
  const object = state.objects[id];
  return {
    id,
    card: object.card,
    types: [...(object.types ?? [])],
    /* Subtypes, which layer 4 may set ("is a colorless Forest land", Song of the Dryads). */
    subtypes: [...(object.subtypes ?? [])],
    colors: [...(object.colors ?? [])],
    keywords: [...new Set([...(object.keywords ?? []), ...counterKeywords(object.counters)])],
    counterKeywords: stampedCounterKeywords(object),
    /* Changeling (CR 702.73a), every creature type; an effect may make it so in layer 4 (applyEffect). */
    everyCreatureType: everyCreatureType(object.keywords),
    power: object.power,
    toughness: object.toughness,
    controller: object.controller,
    counters: {...object.counters},
    /* Abilities other effects give it (batch 76), in the order they were given. */
    granted: [],
  };
}

/* Does this effect apply to this object, given what it currently looks like? The question is asked
   against the PARTIALLY DERIVED object, which is what makes layer 2 able to change who an anthem
   sees and layer 4 able to bring a land into a creature effect's reach.
 *
 * IT READS THE SELECTOR GRAMMAR'S KEYS, NOT A DIALECT OF ITS OWN. `script/filter.mjs` says
 * `controller: "you"`, so this does too. It cannot CALL `compileSelector` — that matcher reads
 * fully derived characteristics through `typesOf`, and deriving is what this is in the middle of
 * doing, so it would recurse. Two matchers over one shape is fine; two spellings of the same idea
 * is what produced a `pumpAll` that pumped the opponent's creatures as well, silently, because
 * "you" was not a word this understood. */
/* THE KEYS A LAYER STATIC'S `affects` MAY CARRY -- this matcher's, narrower than the selector grammar because the layers
   cannot ask what they are still deriving. Anything else would be ignored, and a static would affect more than it says:
   the card compiler refuses it (cards/index.mjs). */
export const LAYER_AFFECTS_KEYS = Object.freeze(["anyOf", "what", "ids", "types", "subtypes", "supertypes", "controller", "token", "another", "self", "attachedBy", "colors", "colorless", "countersAtLeast", "tapped", "counters",
  "keywords", "hasDealtDamage", "hasDealtCombatDamage", "attacking"]);

function affects(state, effect, current, sourceController) {
  const rule = effect.affects ?? {};
  /* "Artifacts and creatures you control have ward {1}" (Thorin): any of these, each with what they share -- an artifact
     creature once, where two statics would give it the ability twice. */
  if (Array.isArray(rule.anyOf)) {
    const {anyOf, ...shared} = rule;
    return anyOf.some((one) => affects(state, {...effect, affects: {...shared, ...one}}, current, sourceController));
  }
  if (rule.ids && !rule.ids.includes(current.id)) return false;
  /* "For as long as that land has a blight counter on it" (Ultima, Origin of Oblivion; CR 611.2b): an effect's object while
     it has a counter of that kind -- and once it has none, no longer (rules/sba.mjs ends it for good, endCounterDurations). */
  if (effect.whileCounter && !(((current.counters ?? {})[effect.whileCounter] ?? 0) > 0)) return false;
  if (rule.types && !rule.types.every((type) => current.types.includes(type))) return false;
  if (rule.controller === "you" && current.controller !== sourceController) return false;
  if (rule.controller === "opponent" && current.controller === sourceController) return false;
  if (Number.isInteger(rule.controller) && current.controller !== rule.controller) return false;
  if (rule.token !== undefined && (state.objects[current.id]?.token ?? false) !== rule.token) return false;
  /* "Other Elf creatures you control get +1/+1": a subtype (printed, or a type the layers added), and not the source. */
  /* A changeling is every creature type (CR 702.73a): an Elf lord's "other Elves" takes it in. */
  if (rule.subtypes && !rule.subtypes.every((t) => current.types.includes(t) || hasSubtype(current.subtypes, current.everyCreatureType, t))) return false;
  /* "Legendary Humans you control have indestructible" (General's Enforcer): printed supertypes, which no layer changes. */
  if (rule.supertypes && !rule.supertypes.every((t) => (state.objects[current.id]?.supertypes ?? []).includes(t))) return false;
  if (rule.another === true && current.id === effect.sourceId) return false;
  /* "This creature's power and toughness are each equal to ...": the source itself. */
  if (rule.self === true && current.id !== effect.sourceId) return false;
  /* "Equipped creature has haste": the one its source is attached to (CR 301.5). */
  if (rule.attachedBy === "self" && state.objects[effect.sourceId]?.attachedTo !== current.id) return false;
  /* "As long as enchanted creature is white" (Steel of the Godhead): its colors as they now are -- layer 5 is done by the
     time layers 6 and 7 ask. */
  if (rule.colors && !rule.colors.every((color) => (current.colors ?? []).includes(color))) return false;
  /* "Colorless creatures you control get +2/+2" (Forsaken Monument): no color, as layer 5 left it. */
  if (rule.colorless === true && (current.colors ?? []).length > 0) return false;
  /* "As long as this creature has four or more +1/+1 counters on it" (Voice of the Blessed): counters as they are now. */
  if (rule.countersAtLeast && ((current.counters ?? {})[rule.countersAtLeast.counter] ?? 0) < rule.countersAtLeast.count) return false;
  /* "Permanents you control with counters on them have ward {1}" (Innkeeper's Talent): `counters` "any" -- or a kind, "with
     a +1/+1 counter on it" -- as the selector grammar says it (script/filter.mjs), its counters as they are now. */
  if (rule.counters !== undefined && !(rule.counters === "any" ? Object.values(current.counters ?? {}).some((n) => n > 0)
    : ((current.counters ?? {})[rule.counters] ?? 0) > 0)) return false;
  /* "Other tapped legendary creatures you control have indestructible" (The Seriema): tapped as it is, which no layer changes. */
  if (rule.tapped !== undefined && (state.objects[current.id]?.tapped === true) !== rule.tapped) return false;
  /* "Ruric Thar has hexproof as long as they haven't dealt combat damage yet": whether this object has dealt damage, or
     combat damage, as the selector grammar reads it (script/filter.mjs) -- a fact of the game, which no layer changes. */
  if (rule.hasDealtDamage !== undefined && (state.objects[current.id]?.hasDealtDamage === true) !== rule.hasDealtDamage) return false;
  if (rule.hasDealtCombatDamage !== undefined && (state.objects[current.id]?.hasDealtCombatDamage === true) !== rule.hasDealtCombatDamage) return false;
  /* "Attacking creatures you control get +1/+0" (Goblin Oriflamme): in this combat's attacks, declared or put onto the
     battlefield attacking (CR 508.4) -- read off the combat, which no layer changes; over at the end of combat (CR 511.3). */
  if (rule.attacking === true && !(state.combat?.attacks ?? []).some((attack) => attack.attacker === current.id)) return false;
  /* "Creatures you control with toxic have lifelink" (Skrelv's Hive): its keywords as the derivation has them so far -- an
     effect that gives or takes the keyword is one this depends on (CR 613.8a; dependsOn asks, and orders them). */
  if (rule.keywords && !rule.keywords.every((word) => (current.keywords ?? []).includes(word))) return false;
  return true;
}

/** Whether a static ability's `affects` takes in this object as it currently is (rules/statics.mjs reads it). */
export const staticAffects = (state, effect, id, sourceController) => affects(state, effect, characteristicsOf(state, id), sourceController);

function applyEffect(current, effect) {
  const change = effect.apply ?? {};
  if (Number.isInteger(change.controller)) current.controller = change.controller;
  /* CR 613.1d: "in addition to its other types" adds; setTypes replaces. */
  if (change.addTypes) for (const type of change.addTypes) if (!current.types.includes(type)) current.types.push(type);
  /* And subtypes "in addition to its other types" (CR 205.1b; effects/permanents.mjs, animate's `subtypes`). */
  if (change.addSubtypes) for (const subtype of change.addSubtypes) if (!current.subtypes.includes(subtype)) current.subtypes.push(subtype);
  if (change.setTypes) current.types = [...change.setTypes];
  /* "It loses all other ... card types" (Darksteel Mutation; wave 4c, k2): an object has only the subtypes of the card types it
     has (CR 205.3d) -- a land's, a planeswalker's or an enchantment's subtypes go with that type (a Dryad Arbor's Forest, an
     animated Gideon's Gideon), a creature's go once it is no creature (and no kindred); any other kept, an Equipment's among
     them (the card's ruling). `correspondingSubtypes`, after the types are set. */
  if (change.correspondingSubtypes === true) {
    const has = (type) => current.types.includes(type);
    current.subtypes = current.subtypes.filter((subtype) => !((isLandType(subtype) && !has("Land")) || (isPlaneswalkerType(subtype) && !has("Planeswalker"))
      || (isEnchantmentType(subtype) && !has("Enchantment")) || (isCreatureType(subtype) && !has("Creature") && !has("Kindred"))));
    if (!has("Creature") && !has("Kindred")) current.everyCreatureType = false;
  }
  /* "Enchanted permanent is a colorless Forest land" (Song of the Dryads): its subtypes set, every other one lost (CR 205.1b). */
  if (change.setSubtypes) { current.subtypes = [...change.setSubtypes]; current.everyCreatureType = false; }
  /* "Becomes a green Elk creature" (Oko, Thief of Crowns), "is a Turtle" (Retro-Mutation): its creature types set, and only
     those -- each other subtype kept, an Elked Food still a Food (CR 205.1a: a set subtype replaces those of its own set);
     a changeling's every creature type among those replaced. */
  if (change.setCreatureTypes) {
    current.subtypes = [...current.subtypes.filter((subtype) => !isCreatureType(subtype)), ...change.setCreatureTypes];
    current.everyCreatureType = false;
  }
  /* "It loses all land types" (Ultima, Origin of Oblivion; CR 205.3i): every land type taken away, the other subtypes kept. */
  if (change.removeLandTypes === true) current.subtypes = current.subtypes.filter((subtype) => !isLandType(subtype));
  /* "It's not a creature" (impending, CR 702.176a): that type taken away, the rest kept. */
  if (change.removeTypes) current.types = current.types.filter((type) => !change.removeTypes.includes(type));
  if (change.setColors) current.colors = [...change.setColors];
  /* "Gain all creature types" (Mirror Entity, batch 74): a type change, layer 4 (CR 613.1d). */
  if (change.allCreatureTypes === true) current.everyCreatureType = true;
  /* "Loses all abilities" (CR 613.1f): its own, and any given it before -- one given after, in timestamp order, it keeps. */
  if (change.removeAllAbilities) {
    /* A keyword counter put on after it keeps its keyword (above). */
    current.keywords = [...new Set((current.counterKeywords ?? []).filter(([, stamp]) => stamp > (effect.timestamp ?? 0)).map(([word]) => word))];
    current.granted = []; current.lostAbilities = true;
  }
  /* GRANTED ABILITIES (Forge's AddAbility, batch 76): "lands you control have '{T}: Add one mana of any color'", "equipped
     creature has 'Whenever this creature attacks, create a Treasure token'" -- abilities compiled as a card's own are
     (cards/index.mjs), each with an id naming the effect that gave it -- its timestamp, and which of its holder's
     abilities it is -- so two grants of one ability are two abilities. */
  if (change.addAbilities) for (const ability of change.addAbilities)
    current.granted.push({...ability, id: `granted:${effect.timestamp ?? ""}:${effect.id ?? ""}:${ability.id}`});
  /* A keyword given by an effect older than one that took that keyword away is not had: a pump's keywords are applied with its
     power in layer 7c here, and are layer 6's by the rules (CR 613.1f), where timestamps order them (CR 613.7). */
  if (change.addKeywords) for (const word of change.addKeywords)
    if (!current.keywords.includes(word) && !(current.keywordsLost ?? []).some((lost) => lost.words.includes(word) && lost.timestamp > (effect.timestamp ?? 0))) current.keywords.push(word);
  /* "Permanents your opponents control lose hexproof and indestructible until end of turn" (Shadowspear; CR 613.1f): those
     keywords taken away -- printed, given before it, or a counter's put on before it -- and one given after it, in timestamp
     order (CR 613.7), or a keyword counter put on since (above), it has again (the card's rulings). */
  if (change.removeKeywords) {
    const since = new Set((current.counterKeywords ?? []).filter(([, stamp]) => stamp > (effect.timestamp ?? 0)).map(([word]) => word));
    current.keywords = current.keywords.filter((word) => since.has(word) || !change.removeKeywords.includes(word));
    current.keywordsLost = [...(current.keywordsLost ?? []), {words: [...change.removeKeywords], timestamp: effect.timestamp ?? 0}];
  }
  if (Number.isInteger(change.setPower)) current.power = change.setPower;
  if (Number.isInteger(change.setToughness)) current.toughness = change.setToughness;
  if (Number.isInteger(change.power) && current.power !== null) current.power += change.power;
  if (Number.isInteger(change.toughness) && current.toughness !== null) current.toughness += change.toughness;
  if (change.switchPT === true && current.power !== null) {
    const was = current.power;
    current.power = current.toughness;
    current.toughness = was;
  }
  return current;
}

/* A STATIC ABILITY'S CONDITION (Forge's IsPresentStatic): "as long as you control three or more creatures". Asked as the
   effects are gathered, every time. Counting creatures asks their types, which are derived here, so a condition asked
   while another is being asked leaves conditional statics out of that inner derivation (they change keywords and power,
   never what a condition counts) instead of asking forever. */
let conditioning = 0;
function holdsNow(state, condition, context) {
  if (!condition) return true;
  if (conditioning > 0) return false;
  conditioning += 1;
  try { return conditionHolds(state, condition, context); } finally { conditioning -= 1; }
}

/* Every continuous effect in play: the static abilities of permanents, plus effects with a
   duration that a resolved spell left behind in `state.effects`. And a card's static that works from its owner's
   graveyard (`worksFrom: "graveyard"`, CR 113.6b): "as long as this card is in your graveyard and you control a Mountain".
   Gathered once per derivation and guard level (`memo`). */
function allEffects(state) {
  const key = memo !== null && memo.state === state ? (conditioning > 0 ? "inner" : "outer") : null;
  if (key !== null && memo.effects.has(key)) return memo.effects.get(key);
  const found = gatherEffects(state);
  if (key !== null) memo.effects.set(key, found);
  return found;
}
/* "AS LONG AS THE TOP CARD OF YOUR LIBRARY IS A GOBLIN CARD, THIS CREATURE HAS ALL ACTIVATED ABILITIES OF THAT CARD"
   (Conspicuous Snoop; CR 613.1f, layer 6): `apply.topCardAbilities`, what that card must be (its subtypes, a changeling's
   every creature type among them, CR 702.73a) -- read from the holder's controller's library as it now is, so the
   abilities change as the top card does. Its activated abilities, mana abilities among them (CR 605.1a), given as granted
   abilities are; none, and the static gives nothing. */
function topCardGrant(state, holder, ability) {
  const top = state.zones.library?.[holder.controller]?.[0];
  const card = top === undefined ? null : state.objects[top];
  const wanted = ability.apply.topCardAbilities?.subtypes ?? [];
  if (!card || !wanted.every((t) => hasSubtype(card.subtypes ?? [], everyCreatureType(card.keywords), t))) return null;
  const {topCardAbilities: _top, ...rest} = ability.apply;
  return {...ability, apply: {...rest, addAbilities: (card.abilities ?? []).filter((a) => a.kind === "activated" || a.kind === "mana")}};
}
/* "THRANDUIL HAS ALL ACTIVATED ABILITIES OF ALL ELF CARDS IN YOUR GRAVEYARD" (Thranduil, the Elvenking; CR 613.1f, layer 6):
   `apply.graveyardAbilities`, what those cards must be (their subtypes, a changeling card's every creature type among them,
   CR 702.73a) -- read from the holder's controller's graveyard as it now is, so the abilities come and go with the cards.
   Each card's activated abilities, mana abilities among them (CR 605.1a), given as granted abilities are, each named by its
   card as well, so two cards' alike abilities are two; one that works only from a graveyard is given and never offered on
   the battlefield (rules/actions.mjs). No such card, and the static gives nothing. */
function graveyardGrant(state, holder, ability) {
  const wanted = ability.apply.graveyardAbilities?.subtypes ?? [];
  const cards = (state.zones.graveyard?.[holder.controller] ?? []).filter((id) => state.objects[id]
    && wanted.every((t) => hasSubtype(state.objects[id].subtypes ?? [], everyCreatureType(state.objects[id].keywords), t)));
  const {graveyardAbilities: _graveyard, ...rest} = ability.apply;
  return {...ability, apply: {...rest, addAbilities: cards.flatMap((id) => (state.objects[id].abilities ?? [])
    .filter((a) => a.kind === "activated" || a.kind === "mana").map((a) => ({...a, id: `${id}:${a.id}`})))}};
}

function gatherEffects(state) {
  const found = [];
  for (const graveyard of state.zones.graveyard ?? []) for (const id of graveyard) {
    const card = state.objects[id];
    for (const ability of card?.abilities ?? []) {
      if (ability.kind !== "static" || ability.worksFrom !== "graveyard" || ability.rule) continue;
      if (!holdsNow(state, ability.condition, {controller: card.owner, source: id})) continue;
      found.push({...ability, sourceId: id, sourceController: card.owner, timestamp: ability.timestamp ?? card.timestamp});
    }
  }
  for (const id of state.zones.battlefield) {
    const holder = state.objects[id];
    for (const ability of holder.abilities ?? []) {
      if (ability.kind !== "static") continue;
      /* One that works from a graveyard does not work here (CR 113.6). */
      if (ability.worksFrom === "graveyard") continue;
      if (!holdsNow(state, ability.condition, {controller: holder.controller, source: id})) continue;
      const given = ability.apply?.topCardAbilities !== undefined ? topCardGrant(state, holder, ability)
        : ability.apply?.graveyardAbilities !== undefined ? graveyardGrant(state, holder, ability) : ability;
      if (given === null) continue;
      found.push({
        /* "Creatures you control of the chosen type get +1/+1", "this creature is the chosen type": its own choice. */
        ...chosenFor(given, holder),
        sourceId: id,
        sourceController: holder.controller,
        /* A static ability's timestamp is its permanent's (CR 613.7d). */
        timestamp: ability.timestamp ?? holder.timestamp,
        /* Which of its permanent's abilities this is (partOf): one its permanent loses makes no effect from then on. */
        partOf: partOf(id, ability),
      });
    }
  }
  for (const effect of state.effects ?? []) {
    found.push({...effect, sourceController: effect.sourceController ?? null});
  }
  return found;
}

/* A COUNTED CHANGE (script/amount.mjs): "power and toughness each equal to the number of cards in your hand" (CR 604.3,
   a characteristic-defining ability, 7a) and "+1/+1 for each land you control" (7c) are counted each time the layer is
   applied, not once. Counting asks other objects' types and controllers, and a count made while another count is
   being made skips the counted changes it meets: they change power and toughness only, never what is counted, and
   without the skip two Masters of Etherium would each ask the other forever. */
let counting = 0;
function counted(state, effect) {
  const change = effect.apply ?? {};
  if (!Object.values(change).some(isCounted)) return effect;
  if (counting > 0) return null;
  counting += 1;
  try {
    const context = {controller: effect.sourceController, source: effect.sourceId ?? null, x: state.objects[effect.sourceId]?.xPaid ?? 0};
    return {...effect, apply: Object.fromEntries(Object.entries(change).map(([k, v]) => [k, isCounted(v) ? amountOf(state, v, context) : v]))};
  } finally {
    counting -= 1;
  }
}

/* The same effect without its counted amounts, for a derivation that will not be asked power or toughness: what else it
   does (a keyword it gives with them) still applies. */
function uncounted(effect) {
  const change = effect.apply ?? {};
  if (!Object.values(change).some(isCounted)) return effect;
  return {...effect, apply: Object.fromEntries(Object.entries(change).filter(([, v]) => !isCounted(v)))};
}

/* Two derived objects compared by VALUE, not by the order things happen to sit in their lists.
   Without this, two effects that each add a type produce the same set in a different order and look
   mutually dependent — which resolves as a dependency loop and quietly falls back to timestamps,
   turning the dependency rule off exactly where it was needed. */
const canonical = (current) => JSON.stringify({
  ...current,
  types: [...current.types].sort(),
  colors: [...current.colors].sort(),
  keywords: [...current.keywords].sort(),
});

/* CR 613.8a: A depends on B when applying B first would change what A applies to, or what A does.
   The test is done by applying B and asking whether A's outcome moves, each on a trial copy of the derivation so far.
   `applyEffect` sets top-level fields and pushes onto the top-level lists, and changes nothing inside them (a granted
   ability is pushed as a new object), so a trial is the derivation with its own lists: a deep copy of every granted
   ability's script, four per pair (by structuredClone, then a plain copy), was most of a whole game's CPU
   (engine-room-games seed 11, 2026-10-05: the review's F-2). */
const trial = (c) => ({...c, types: [...c.types], subtypes: [...c.subtypes], colors: [...c.colors], keywords: [...c.keywords], granted: [...c.granted]});

/* WHETHER A CAN DEPEND ON B AT ALL, without a trial. dependsOn below finds a dependency in one of two ways: B changes
   whether A applies, or the two applied in either order come out different. The first needs B to write a field A's
   `affects` reads (affects, above: types, subtypes, controller, colors, keywords -- the rest it reads off the game, which
   a trial does not change); the second needs both to write one field with operations whose order matters (a set, a
   removal, a switch, or a push onto a list `canonical` does not sort: subtypes, granted abilities). Neither, and every
   trial would answer no, so none is made: a crowded board's layer 7 -- a dozen +1/+1 statics, none reading power --
   spent most of a game's CPU proving that (the G1 pass of 2026-10-08, D4-D7 seed 3: 20 s of one person's wait). The
   answer is the same either way; `pruneCheck` makes the trial anyway and throws if the two disagree (the suites). */
const READS = {types: ["types"], subtypes: ["types", "subtypes"], controller: ["controller"], colors: ["colors"], colorless: ["colors"], keywords: ["keywords"]};
const WRITES = {controller: "controller", addTypes: "types", setTypes: "types", removeTypes: "types", addSubtypes: "subtypes", setSubtypes: "subtypes", setCreatureTypes: "subtypes",
  allCreatureTypes: "subtypes", removeLandTypes: "subtypes", setColors: "colors", removeAllAbilities: "abilities", addAbilities: "abilities", addKeywords: "abilities", setPower: "pt",
  setToughness: "pt", power: "pt", toughness: "pt", switchPT: "pt"};
/* Operations on one field that give the same result in either order (canonical sorts types and keywords). */
const COMMUTING = {types: ["addTypes"], abilities: ["addKeywords"], pt: ["power", "toughness"], subtypes: ["allCreatureTypes"]};
function readsOf(rule = {}) {
  const fields = new Set();
  for (const [key, value] of Object.entries(rule)) {
    if (key === "anyOf" && Array.isArray(value)) for (const one of value) for (const f of readsOf(one)) fields.add(f);
    for (const f of READS[key] ?? []) fields.add(f);
  }
  /* "Has flying" read off keywords, which "loses all abilities" and a keyword grant both write (as "abilities"). */
  if (fields.has("keywords")) fields.add("abilities");
  return fields;
}
/* An effect's reads and writes, made once per effect object (the effects are gathered once a memo). An `apply` key this
   does not know (one applyEffect learns later) is assumed to matter: `known` false, and the trial is made. */
const profiles = new WeakMap();
function profileOf(effect) {
  let profile = profiles.get(effect);
  if (profile) return profile;
  const writes = new Map();
  let known = true;
  for (const key of Object.keys(effect.apply ?? {})) {
    const field = WRITES[key];
    if (!field) { known = false; continue; }
    writes.set(field, [...(writes.get(field) ?? []), key]);
  }
  profile = {known, reads: readsOf(effect.affects), writes};
  profiles.set(effect, profile);
  return profile;
}
const commute = (field, ops) => ops.every((op) => (COMMUTING[field] ?? []).includes(op));
function mayDepend(a, b) {
  const pa = profileOf(a), pb = profileOf(b);
  if (!pa.known || !pb.known) return true;
  for (const field of pa.reads) if (pb.writes.has(field)) return true;
  for (const [field, opsA] of pa.writes) {
    const opsB = pb.writes.get(field);
    if (opsB && !commute(field, [...opsA, ...opsB])) return true;
  }
  return false;
}
/* Whether no effect in a layer can depend on another (each pair as mayDepend asks it, all at once): no effect reads a
   field another writes, and every field two or more write is written by operations that commute. Then timestamp order is
   the order (CR 613.7), with no pair asked. */
function independent(effects) {
  const writers = new Map();
  for (const effect of effects) {
    const profile = profileOf(effect);
    if (!profile.known) return false;
    for (const [field, ops] of profile.writes) writers.set(field, [...(writers.get(field) ?? []), {effect, ops}]);
  }
  for (const effect of effects) for (const field of profileOf(effect).reads)
    if ((writers.get(field) ?? []).some((w) => w.effect !== effect)) return false;
  for (const [field, list] of writers) if (list.length > 1 && !commute(field, list.flatMap((w) => w.ops))) return false;
  return true;
}
let pruneCheck = false;

function dependsOn(state, a, b, base, sourceOf) {
  if (!mayDepend(a, b)) {
    if (!pruneCheck) return false;
    if (trialDependsOn(state, a, b, base, sourceOf)) throw new Error(`layers: mayDepend said ${a.id ?? "an effect"} cannot depend on ${b.id ?? "another"}, and a trial says it does`);
    return false;
  }
  return trialDependsOn(state, a, b, base, sourceOf);
}
function trialDependsOn(state, a, b, base, sourceOf) {
  trials += 1;
  const withoutB = applyEffect(trial(base), a);
  const afterB = applyEffect(trial(base), b);
  const appliesAfterB = affects(state, a, afterB, sourceOf(a));
  const appliedBefore = affects(state, a, base, sourceOf(a));
  /* Whether A applies at all has changed. */
  if (appliesAfterB !== appliedBefore) return true;
  if (!appliesAfterB) return false;
  /* Or what it produces has changed by more than B's own contribution. */
  const both = applyEffect(trial(afterB), a);
  const reverse = applyEffect(trial(withoutB), b);
  return canonical(both) !== canonical(reverse);
}

/* Order one layer's effects: timestamp order (CR 613.7), then move any effect that depends on a
   later one behind it (CR 613.8). A dependency loop falls back to timestamps, as the rule says.
   Whether A depends on B is asked against the same `base` for the whole ordering, so each pair is asked once: asked
   afresh on every pass, an ordering of n effects made about n^3 trials, and a board with a dozen effects in one layer
   spent seconds there (the review's F-2). */
function orderWithin(state, effects, base, sourceOf) {
  const byTime = [...effects].sort((x, y) => (x.timestamp ?? 0) - (y.timestamp ?? 0));
  if (byTime.length < 2 || (!pruneCheck && independent(byTime))) return byTime;
  const out = [];
  const remaining = [...byTime];
  const index = new Map(byTime.map((effect, i) => [effect, i])), asked = new Map();
  const depends = (x, y) => {
    const key = index.get(x) * byTime.length + index.get(y);
    if (!asked.has(key)) asked.set(key, dependsOn(state, x, y, base, sourceOf));
    return asked.get(key);
  };
  /* Each pass places one effect at least, so a pass for each is enough. (A fixed 64 stopped there, and a layer of more
     than 64 effects lost the rest without a word.) */
  let guard = 0;
  while (remaining.length > 0 && guard <= byTime.length) {
    guard += 1;
    /* The first effect that does not depend on anything still waiting. */
    const at = remaining.findIndex((candidate) =>
      !remaining.some((other) => other !== candidate && depends(candidate, other)));
    /* Every remaining effect depends on another: a loop, so CR 613.8b says use timestamps. */
    out.push(...(at < 0 ? remaining.splice(0) : remaining.splice(at, 1)));
  }
  return out;
}

/* A DERIVATION'S MEMO. Deriving an object asks about others -- a static's condition counts Mountains, a counted power
   counts creatures -- and each of those is derived in turn, the same ones again and again: with Anger in a graveyard ("as
   long as you control a Mountain") and Adeline's power counting creatures on a board of 57 permanents, one projection
   derived the board hundreds of thousands of times, and a game took seconds a step (engine-room-games seed 1,
   2026-10-03). Deriving changes nothing in the game. So while a derivation runs -- or a question that only reads and
   asks many (`deriving`: a projection, the offers) -- each object is derived once per guard level (a condition being
   asked, a count being made: each leaves something out, holdsNow and counted) and the effects in play are gathered once
   per level; every answer handed out is a copy. The memo lives no longer than the call that opened it, so nothing that
   changes the game meets an answer from before the change. `memoOff` is for the suite that compares the two. */
let memo = null, memoOff = false, derivations = 0, trials = 0;
/** Run `fn`, a question that reads the game and changes nothing, with one memo for every derivation it makes. */
export function deriving(state, fn) {
  if (memo !== null || memoOff) return fn();
  memo = {state, characteristics: new Map(), effects: new Map(), asked: new Map()};
  try { return fn(); } finally { memo = null; }
}
/** Inside a `deriving` question, `fn`'s answer about the whole board, made once per guard level (as a derivation is) and
    kept under `key` (the protections in play, asked once per target candidate); outside one, made afresh. The answer is
    shared: never to be edited. */
export function onceAQuestion(state, key, fn) {
  if (memo === null || memo.state !== state) return fn();
  const at = `${key}|${conditioning > 0 ? 1 : 0}|${counting > 0 ? 1 : 0}`;
  if (!memo.asked.has(at)) memo.asked.set(at, fn());
  return memo.asked.get(at);
}
/** Derive afresh for the length of `fn`, then go back to the memo that was open: an object shown another way for a moment --
    an adventurer card weighed as its Adventure (CR 715.3a; rules/actions.mjs) -- is read as it then is, and what the open
    memo holds of it as it was is neither read nor overwritten. With no memo open -- the cast itself, which changes the
    game -- none is opened: each derivation is its own, as ever outside one. */
export function derivingAfresh(state, fn) {
  if (memo === null) return fn();
  const outer = memo;
  memo = {state, characteristics: new Map(), effects: new Map(), asked: new Map()};
  try { return fn(); } finally { memo = outer; }
}
/** For the suites: turn the memo off (to compare), and how many derivations -- and dependency trials (CR 613.8a,
    `dependsOn`) -- were made since `reset`. */
export const deriveMemo = {off(value = true) { memoOff = value; }, count() { return derivations; }, trials() { return trials; }, reset() { derivations = 0; trials = 0; },
  /* Make every trial mayDepend skips, and throw where the two would disagree (the suites; the answer is the same). */
  checkPrune(value = true) { pruneCheck = value; }};
const copy = (v) => (Array.isArray(v) ? v.map(copy) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, copy(x)])) : v);

/**
 * What an object currently is: printed characteristics with every continuous effect applied in the
 * order CR 613 gives.
 *
 * Returns a fresh object each time. A caller that edits the answer has not edited the game, which
 * is the same promise the projection makes and for the same reason.
 */
export function characteristicsOf(state, id) {
  /* Outside a memo the answer is this call's alone; inside one it is shared, and handed out as a copy. */
  const shared = memo !== null;
  const current = derived(state, id);
  return shared ? copy(current) : current;
}

/* The derivation, from the memo when one is open: shared, never to be edited -- the accessors below hand out a field.
   `counts`: whether the question needs power and toughness. A counted change ("+1/+1 for each creature you control",
   "power equal to the number of cards in your hand") changes only those (`counted`), and counting asks about the whole
   board again; who controls an object, what it is and what it has are derived with every effect but its counted
   amounts. A derivation with them answers a question without. */
function derived(state, id, counts = true, through = 7) {
  if (!state.objects[id]) throw new Error(`There is no object ${id} to describe`);
  if (memo === null && !memoOff) return deriving(state, () => derived(state, id, counts, through));
  /* `through`: the last layer derived -- 6, for which of its own abilities a permanent has lost (lostBy). */
  const key = memo !== null && memo.state === state ? `${id}|${conditioning > 0 ? 1 : 0}|${counting > 0 ? 1 : 0}${through < 7 ? `|${through}` : ""}` : null;
  const known = key !== null ? memo.characteristics.get(key) : undefined;
  if (known && (known.counts || !counts)) return known.current;
  const current = derive(state, id, counts, through);
  if (key !== null) memo.characteristics.set(key, {counts, current});
  return current;
}

/* WHICH ABILITY A STATIC'S EFFECT IS PART OF: its permanent and its words. A definition writes an ability that works in
   several layers as statics of one text, a part for each layer -- Eldrazi Monument's +1/+1 (7c) and flying (6), Song of
   the Dryads in layers 4, 5 and 6 -- so its parts are known as one ability (CR 613.6). */
const partOf = (id, ability) => `${id}|${ability.text ?? ability.id ?? ""}`;

/* WHO MAY HAVE LOST THEIR ABILITIES (CR 613.1f): the permanents an effect that takes abilities away can reach, from what it
   affects -- the objects it names, fixed as it began (Oko's +1, Abigale, Day of Black Sun, Retched Wretch), or what its
   Aura enchants (Song of the Dryads, Infinite Coursework) -- or every one (`true`) when it says a kind of permanent. Null
   when nothing does: then each permanent's abilities are its own (an effect gives activated, triggered and keyword
   abilities only, cards/index.mjs GRANTABLE: never a static or a replacement), and nothing is derived to know it. A set to
   look in, never an answer: each one in it is derived. */
function losersAmong(state, effects) {
  let ids = null;
  for (const {apply, affects: rule, sourceId} of effects) {
    if (!apply?.removeAllAbilities) continue;
    ids ??= new Set();
    if (Array.isArray(rule?.ids)) { for (const id of rule.ids) ids.add(id); continue; }
    if (rule?.attachedBy === "self") { const host = state.objects[sourceId]?.attachedTo; if (host !== null && host !== undefined) ids.add(host); continue; }
    return true;
  }
  return ids;
}

/* THE ABILITIES THAT TOOK A PERMANENT'S OWN AWAY (CR 613.1f): its derivation through layer 6, which is all that decides it,
   each by `partOf` (derive keeps them beside the derivation, in `removals`, so no answer about an object changes shape).
   Asked again while it is being asked -- a permanent whose own ability takes its abilities away (Humility made a creature)
   -- and the answer is none but that one: an effect does not depend on itself (CR 613.8a), and keeps applying though its
   ability is removed by it (CR 613.6). Two permanents each taking the other's abilities, a dependency loop (CR 613.8b),
   is a board no definition can make: only an Aura or an effect fixed on its objects takes abilities away. */
const losing = new Set(), removals = new WeakMap();
function lostBy(state, id) {
  if (losing.has(id)) return [];
  losing.add(id);
  try { return removals.get(derived(state, id, false, 6)) ?? []; } finally { losing.delete(id); }
}

/* A STATIC ABILITY ITS PERMANENT HAS LOST (CR 613.1f): taken away in layer 6 by another ability, it makes no effect in layers
   6 and 7 -- whatever the timestamps, since its effect depends on the one that takes it away (CR 613.8a: applying that one
   changes its existence). Song of the Dryads on an Elf lord: the other Elves are no longer pumped. Unless its effect began
   to apply to this object in an earlier layer (`begun`): then it carries on in the later ones (CR 613.6) -- a creature that
   makes lands 1/1 creatures (layers 4 and 7b) still makes them 1/1 once it has lost its abilities. An effect a spell or an
   ability left (`state.effects`) is no ability of a permanent's, and is never lost. */
function lostEffect(state, effect, begun, losers) {
  if (effect.partOf === undefined || begun.has(effect.partOf)) return false;
  if (losers !== true && !losers.has(effect.sourceId)) return false;
  return lostBy(state, effect.sourceId).some((part) => part !== effect.partOf);
}

/* A BASIC LAND TYPE AN EFFECT GAVE (CR 305.7): "lands you control are every basic land type in addition to their other types"
   (Dryad of the Ilysian Grove), "each land is a Swamp in addition to its other land types" (Urborg, Tomb of Yawgmoth; and
   Yavimaya, Cradle of Growth's Forests) -- each one the object does not print brings that type's intrinsic mana ability, "{T}: Add
   [its mana]" (CR 305.6), given with the type in layer 4, so an effect that takes abilities away in layer 6 takes it too
   (CR 613.1f). A type it prints has its ability among its own already: a basic land's, a dual land's written out. Once a
   type, however many effects give it: a subtype is had once (applyEffect). */
function intrinsicMana(state, id, current) {
  /* An object with the land card type and a basic land type has it (CR 305.6): a nonland given one has none. */
  if (!current.types.includes("Land")) return;
  const own = state.objects[id].subtypes ?? [];
  for (const type of current.subtypes) {
    const color = BASIC_LAND_MANA[type];
    if (!color || own.includes(type)) continue;
    current.granted.push({id: `intrinsic:${type}`, kind: "mana", tapSelf: true, produces: {[color]: 1}, text: `{T}: Add {${color}}.`});
  }
}

function derive(state, id, counts = true, through = 7) {
  derivations += 1;
  let current = printed(state, id);
  const effects = allEffects(state);
  const sourceOf = (effect) => effect.sourceController;
  const losers = losersAmong(state, effects);
  /* The abilities whose effects have begun to apply to this object (CR 613.6, lostEffect), and those that took its own
     abilities away (lostBy) -- undefined for an effect a spell or an ability left, which is no permanent's ability. */
  const begun = new Set(), removedBy = [];
  const applied = (effect) => {
    if (effect.partOf !== undefined) begun.add(effect.partOf);
    if (effect.apply?.removeAllAbilities) removedBy.push(effect.partOf);
    return applyEffect(current, effect);
  };

  for (const layer of LAYERS) {
    if (layer > through) break;
    let inLayer = effects.filter((effect) => (effect.layer ?? 0) === layer);
    if (layer >= 6 && losers !== null) inLayer = inLayer.filter((effect) => !lostEffect(state, effect, begun, losers));
    /* Layer 7 always runs, even with no effects in it: counters are sublayer 7d and they are not
       an effect, they are on the object. Skipping the layer because nothing else was in it left
       every counter on every board doing nothing. */
    if (inLayer.length === 0 && layer !== 7) continue;

    if (layer !== 7) {
      for (const effect of orderWithin(state, inLayer, current, sourceOf)) {
        if (affects(state, effect, current, sourceOf(effect))) current = applied(effect);
      }
      if (layer === 4) intrinsicMana(state, id, current);
      continue;
    }

    /* CR 613.4: layer 7 runs sublayer by sublayer, and counters are 7d — after anything that sets
       power and toughness, and after anything that modifies them. */
    for (const sublayer of SUBLAYERS) {
      /* ITS BASE POWER AND TOUGHNESS (CR 208.4b): what characteristic-defining abilities and setting effects made them, before
         anything that modifies them -- "each with power greater than its base power" (Kutzil, Malamet Exemplar). */
      if (sublayer === "c") { current.basePower = current.power; current.baseToughness = current.toughness; }
      if (sublayer === "d") {
        /* +1/+1 and -1/-1, and every other "+X/+Y" counter (CR 122.1a): the -0/-1 counters on Wall of Roots. */
        for (const [kind, n] of Object.entries(current.counters ?? {})) {
          const pt = /^([+-]\d+)\/([+-]\d+)$/.exec(kind);
          if (!pt || !(n > 0)) continue;
          if (current.power !== null) current.power += Number(pt[1]) * n;
          if (current.toughness !== null) current.toughness += Number(pt[2]) * n;
        }
        continue;
      }
      const here = inLayer.filter((effect) => (effect.sublayer ?? "c") === sublayer);
      for (const effect of orderWithin(state, here, current, sourceOf)) {
        if (!affects(state, effect, current, sourceOf(effect))) continue;
        const now = counts ? counted(state, effect) : uncounted(effect);
        if (now) current = applyEffect(current, now);
      }
    }
  }

  removals.set(current, removedBy);
  return current;
}

/** Current power. Null for an object that has none — which is not the same as zero. */
export const powerOf = (state, id) => derived(state, id).power ?? 0;
/** Current toughness, by the same rule. */
export const toughnessOf = (state, id) => derived(state, id).toughness ?? 0;
/** Who currently controls it, after layer 2. */
export const controllerOf = (state, id) => derived(state, id, false).controller;
/** What it currently is, after layer 4 (a copy, as every answer here is). */
export const typesOf = (state, id) => [...derived(state, id, false).types];
/** What it currently has, after layer 6. */
export const keywordsOf = (state, id) => [...derived(state, id, false).keywords];
/** Its colors, after layer 5. */
export const colorsOf = (state, id) => [...(derived(state, id, false).colors ?? [])];
/** Its subtypes, after layer 4. */
export const subtypesOf = (state, id) => [...derived(state, id, false).subtypes];
/** Whether it is every creature type (a changeling, CR 702.73a, or an effect's, layer 4). */
export const everyCreatureTypeOf = (state, id) => derived(state, id, false).everyCreatureType === true;

/* Its own abilities unless it lost them, then the ones given it. */
const heldAbilities = (object, current) => [...(current.lostAbilities ? [] : object.abilities ?? []), ...current.granted];

/* Whether any effect in play may give or take abilities -- an effect left behind, a static on the battlefield or in a
   graveyard (where one may work from, allEffects): when none does, a permanent's abilities are its own, and nothing need
   be derived to read them. */
function abilitiesChange(state) {
  /* And a basic land type given, which brings its mana ability (CR 305.7, intrinsicMana). */
  const changes = (apply) => Boolean(apply && (apply.addAbilities || apply.removeAllAbilities || apply.topCardAbilities || apply.graveyardAbilities
    || [...(apply.addSubtypes ?? []), ...(apply.setSubtypes ?? [])].some((type) => BASIC_LAND_MANA[type])));
  if ((state.effects ?? []).some((effect) => changes(effect.apply))) return true;
  const holders = [...state.zones.battlefield, ...(state.zones.graveyard ?? []).flat()];
  return holders.some((id) => (state.objects[id].abilities ?? []).some((ability) => ability.kind === "static" && changes(ability.apply)));
}

/**
 * A PERMANENT'S ABILITIES NOW (CR 613.1f, batch 76): its own, less them if it lost them, and those other effects gave it
 * -- what its activated, mana and triggered abilities are read from. Anywhere but the battlefield, the card's own.
 */
export function abilitiesOf(state, id) {
  const object = state.objects[id];
  if (object.zone !== "battlefield" || !abilitiesChange(state)) return object.abilities ?? [];
  return heldAbilities(object, characteristicsOf(state, id));
}

/** Permanents' abilities for one look at a board that does not change while it is read (rules/trigger.mjs, collectTriggers):
    whether any effect may give or take abilities is asked once, not once a permanent, and each permanent's abilities are
    read once. With a thousand Goblin tokens on the battlefield (Krenko, Mob Boss and Intruder Alarm; G1, 2026-10-08)
    asking it for each was a million reads for every trigger that resolved. */
export function abilitiesReader(state) {
  const change = abilitiesChange(state), read = new Map();
  return (id) => {
    const object = state.objects[id];
    if (object.zone !== "battlefield" || !change) return object.abilities ?? [];
    if (!read.has(id)) read.set(id, heldAbilities(object, characteristicsOf(state, id)));
    return read.get(id);
  };
}

/**
 * WHAT A PERMANENT'S RULES ARE READ FROM (CR 613.1f with 604.1 and 614.12): the abilities it has after layer 6, so one that
 * has lost all its abilities generates no rule of its own -- no cost change (Marauding Raptor under Song of the Dryads), no
 * "can't attack", no replacement effect. `staticAbilities(state)` is a reader, `(id) => abilities`, for one look at a board
 * that does not change while it is read: rules/statics.mjs, rules/replacement.mjs and the others ask it for each permanent.
 * They run constantly, so a permanent no effect can have taken abilities from (losersAmong, from what is in play without
 * its conditions: a set to look in) is read as it is, with nothing derived, and inside a question that opened a memo
 * (`deriving`) the reader and what it has read are shared by the question. Anywhere but the battlefield, the card's own.
 */
export const staticAbilities = (state) => onceAQuestion(state, "static-abilities", () => staticReader(state));
function staticReader(state) {
  const removers = [...(state.effects ?? [])];
  const take = (id, here) => { for (const ability of state.objects[id].abilities ?? [])
    if (ability.kind === "static" && (ability.worksFrom === "graveyard") === here) removers.push({apply: ability.apply, affects: ability.affects, sourceId: id}); };
  /* A permanent's statics, and a card's that work from its graveyard (CR 113.6b; gatherEffects). */
  for (const id of state.zones.battlefield) take(id, false);
  for (const id of (state.zones.graveyard ?? []).flat()) take(id, true);
  const losers = losersAmong(state, removers), read = new Map();
  return (id) => {
    const object = state.objects[id];
    if (object.zone !== "battlefield" || losers === null || (losers !== true && !losers.has(id))) return object.abilities ?? [];
    if (!read.has(id)) read.set(id, heldAbilities(object, characteristicsOf(state, id)));
    return read.get(id);
  };
}

/**
 * LAST KNOWN INFORMATION (CR 113.7a) — everything about an object, captured before it leaves.
 *
 * "If the source is no longer in the zone it's expected to be in at that time, its last known
 * information is used." A zone change makes a new object with no memory of the old one (CR 400.7),
 * and a token in any zone but the battlefield ceases to exist outright (CR 111.7), so by the time
 * anything asks about the thing that died, there is nothing left to ask.
 *
 * THE SNAPSHOT USED TO BE FIVE FIELDS: id, name, owner, controller and abilities. That was enough
 * for "whenever this creature dies" to find its own trigger and no more. It was not enough for the
 * far more common shape — "whenever a creature you control dies, each opponent loses life equal to
 * ITS POWER" — because power was never recorded, and there is no way to recover it afterwards.
 * Nor "if it was a Goblin", nor "return it with the counters it had".
 *
 * IT IS THE CHARACTERISTICS, NOT THE PRINTED VALUES. A 2/2 wearing two +1/+1 counters under an
 * anthem died as a 5/5, and that is the number the trigger owes. So this runs the layers rather
 * than reading the object's own fields, and `controller` is the post-layer-2 controller — a stolen
 * creature dies under the thief, and its owner is a separate field for the cards that care.
 */
export function lastKnown(state, id) {
  const object = state.objects[id];
  if (!object) return null;
  const current = characteristicsOf(state, id);
  return {
    cardId: id,
    name: object.card,
    owner: object.owner,
    controller: current.controller,
    types: [...current.types],
    /* What "another Vampire you control dies" and "equipped creature dies" ask of a thing that is gone. */
    subtypes: [...current.subtypes],
    supertypes: [...(object.supertypes ?? [])],
    /* What it chose as it entered, for its abilities read as it last was. */
    ...(object.chosen !== undefined ? {chosen: object.chosen} : {}),
    /* Its Class level (CR 716.2a), for the abilities it had at that level. */
    ...(Number.isInteger(object.level) ? {level: object.level} : {}),
    attachments: [...(object.attachments ?? [])],
    /* What it was attached to: "sacrifice this Aura: exile enchanted creature" (Spiral into Solitude). */
    attachedTo: object.attachedTo ?? null,
    colors: [...current.colors],
    keywords: [...current.keywords],
    /* Every creature type, as it last was (Changeling, or an effect's). */
    everyCreatureType: current.everyCreatureType === true,
    /* Null, not zero, for a thing that has no power — a dying Sol Ring is not a 0/0. */
    power: current.power ?? null,
    toughness: current.toughness ?? null,
    counters: {...current.counters},
    damage: object.damage ?? 0,
    tapped: object.tapped === true,
    token: object.token === true,
    commander: object.commander === true,
    /* Its abilities as it last was, the ones given it included: "when this creature dies" given by Feign Death. */
    abilities: structuredClone(heldAbilities(object, current)),
    /* Its copiable values (CR 707.2), when they were not its card's own -- a copy of something else, or face down (708.2a) --
       for "create a token that's a copy of that creature" (Hofri Ghostforge; effects/permanents.mjs, `asItLastWas`). And
       whatever they are, while an ability of its own waits on the stack, which outlives it (CR 113.7a): "create a token
       that's a copy of this creature" (Colorstorm Stallion's Opus; effects/permanents.mjs, copyPermanent's `lastKnown`). */
    ...(object.uncopied || object.faceDown === true || state.stack.some((entry) => entry.cardId === id) ? {copiable: Object.fromEntries(COPIED_KEYS.filter((key) => object[key] !== undefined).map((key) => [key, structuredClone(object[key])]))} : {}),
  };
}
/* The copiable values a permanent shows (effects/permanents.mjs, COPY_KEYS: the same list, kept here to keep the layers free
   of the effects). */
const COPIED_KEYS = Object.freeze(["card", "manaCost", "types", "subtypes", "supertypes", "colors", "keywords", "abilities", "power", "toughness", "loyalty", "spell", "enchant"]);
