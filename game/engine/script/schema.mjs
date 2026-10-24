/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* `CrankCardScript@1`: WHAT A CARD DEFINITION IS ALLOWED TO SAY.
 *
 * `docs/engine/PLAN.md` §3.4, and §6's phase 2.1. Thirty-one thousand of these will be written by a
 * model, so this is not documentation. It is the thing standing between a plausible-looking
 * generated document and a game that plays it wrong.
 *
 * EVERY EFFECT NAMES A PRIMITIVE FROM THE CATALOG, which is why 2.1a came first. A schema that
 * accepted any string for `effect` would accept `destroyCreature`: not a primitive, reads
 * perfectly, and would compile, validate, ship, and then do nothing at all. Principle 6 says
 * unsupported is loud; this is where that gets enforced for cards.
 *
 * EVERY ABILITY CARRIES THE ORACLE SENTENCE IT IMPLEMENTS (§3.2.5), so a definition can be
 * re-checked when the text changes. Without it, an errata'd card has a definition nobody can tell
 * is now wrong — among thirty-one thousand others.
 *
 * EACH ABILITY KIND IS HELD TO WHAT ITS ENGINE MODULE ACTUALLY NEEDS. A static ability without a
 * layer cannot be ordered by `layers.mjs`; a triggered ability without a trigger event is not
 * something `trigger.mjs` can watch for; a replacement without `watches` is not something
 * `replacement.mjs` can match. Validating against the modules that execute them is the only way the
 * schema means anything — a schema that agreed with itself and not with the engine would pass
 * documents the engine then refused.
 *
 * `reveals` EARNS ITS PLACE. A card declares what information it exposes and to whom, so 1.10's
 * hidden-information property has something to check a card against. Without it the first card
 * reading "look at target player's hand" either leaks by accident or is indistinguishable from a
 * leak, and the property test cannot tell which.
 *
 * VALIDATION RETURNS A LIST. The compiler retries against the errors, so it needs all of them at
 * once; stopping at the first turns a fixable document into as many round trips as it has
 * mistakes, thirty-one thousand times over.
 */

import {isPrimitive, isKeyword, isTriggerEvent} from "../vocabulary.mjs";
import {compileSelector} from "./filter.mjs";
import {targetRefs, SHARES} from "./bind.mjs";
import {LAYERS} from "../rules/layers.mjs";
import {STATIC_RULES, CANT_ATTACK_DEFENDERS} from "../rules/statics.mjs";
import {amountProblems, AMOUNT_PARAMS, isCounted} from "./amount.mjs";
import {conditionProblems, asksFirstResolution} from "./condition.mjs";
import {isCreatureType} from "../keywords/types.mjs";
import {parseManaCost} from "../rules/mana.mjs";
import {CONTROL_DURATIONS} from "./effects/permanents.mjs";

/* The facts about a target an effect may name where it takes a number (script/bind.mjs). */
const FACT_KEYS = ["powerOf", "manaValueOf", "controllerOf"];

export const SCRIPT_SCHEMA = "CrankCardScript@1";

/** The six kinds of ability a card can have (§3.4). */
export const ABILITY_KINDS = Object.freeze([
  "spell", "activated", "triggered", "static", "replacement", "keyword",
]);

/* Composers hold other effects rather than doing something themselves, so their children are
   validated too — a validator that only checked the top level would pass every nested mistake, and
   nesting is where a generated document goes wrong. */
const COMPOSERS = {
  sequence: (effect) => effect.effects ?? [],
  repeatFor: (effect) => effect.effects ?? [],
  /* One way or the other (batch 72): its `then` and its `otherwise`, each a list -- one that is not is reported, not read. */
  branch: (effect) => [...(Array.isArray(effect.then) ? effect.then : []), ...(Array.isArray(effect.otherwise) ? effect.otherwise : [])],
  modal: (effect) => (effect.modes ?? []).flatMap((mode) => mode.effects ?? []),
  /* What follows not paying, and -- "if they do" (Divert Disaster) -- what follows paying. */
  unlessPays: (effect) => [...(effect.effects ?? []), ...(Array.isArray(effect.whenPaid) ? effect.whenPaid : [])],
  delayedTrigger: (effect) => effect.effects ?? [],
  /* A reflexive trigger (batch 72): what it does. */
  immediateTrigger: (effect) => effect.effects ?? [],
};

/** What an ability may say it exposes. Closed, like every other vocabulary here. */
const REVEAL_WHAT = ["hand", "library", "card", "top", "face-down"];
const REVEAL_TO = ["controller", "owner", "target", "all", "you"];

const isText = (value) => typeof value === "string" && value.trim() !== "";

function checkEffect(effect, path, errors) {
  if (!effect || typeof effect !== "object") {
    errors.push({path, message: "An effect is an object naming a primitive"});
    return;
  }
  const name = effect.effect;
  if (!isText(name)) {
    errors.push({path, message: "An effect names a primitive in its `effect` field"});
    return;
  }
  if (!isPrimitive(name)) {
    errors.push({path, message: `${JSON.stringify(name)} is not a primitive in the catalog (§12.2)`});
    return;
  }
  /* A counted amount (script/amount.mjs) where an effect takes a number: "X", or one of its closed kinds. */
  for (const key of AMOUNT_PARAMS) {
    const value = effect[key];
    if (value === undefined || typeof value === "number") continue;
    /* A fact about a target ({powerOf: {target: 0}}, bind.mjs's), read as the resolution begins; anything else is a count. */
    const keys = value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value) : [];
    if (keys.length === 1 && FACT_KEYS.includes(keys[0]) && Number.isInteger(value[keys[0]]?.target)) continue;
    for (const message of amountProblems(value)) errors.push({path: `${path}.${key}`, message});
  }
  /* "Each player ... discards half the cards in their hand, then sacrifices half the permanents they control" (Pox Plague;
     effects/asking.mjs): a count counted for each player as they are asked -- on a discard or a sacrifice of a counted
     amount, nothing whole, at random or kept. */
  if (effect.perPlayer !== undefined && (effect.perPlayer !== true || !["discard", "sacrifice"].includes(name) || !isCounted(effect.count)
    || ["all", "random", "keep", "keepTypes", "keepPowerAtMost"].some((key) => effect[key] !== undefined)))
    errors.push({path: `${path}.perPlayer`, message: "perPlayer is true, on a discard or a sacrifice whose count is counted for each player"});
  /* An effect's own condition ("if this spell was cast from a graveyard", "if you do"; resolution.mjs asks it): closed, as
     an ability's is -- an unknown key refused here rather than read as true. */
  for (const message of conditionProblems(effect.condition)) errors.push({path: `${path}.condition`, message});
  /* A reflexive trigger's own targets (CR 603.12): selectors, and every `{target: n}` its effects name declared among them.
     What it is about: this resolution's, or what the effect before it remembered (`about: "remembered"`). */
  if (name === "immediateTrigger") {
    if (effect.about !== undefined && effect.about !== "remembered") errors.push({path: `${path}.about`, message: "A reflexive trigger is about what its resolution is, or `about: \"remembered\"`"});
    for (const [index, spec] of (effect.targets ?? []).entries()) {
      /* A counted one ("up to that many target ...", CR 601.2c): its count beside the selector, its most a number or X. */
      const {count, forEach, ...selector} = spec && typeof spec === "object" ? spec : {};
      if (count !== undefined && !countValid(count, {x: true}))
        errors.push({path: `${path}.targets[${index}].count`, message: "A reflexive trigger's target count is `{min, max}`, its max a whole number or \"X\" (up to that many)"});
      /* "For each opponent, destroy up to one target creature or planeswalker that player controls" (Lich's Relic; script/bind.mjs,
         `forEach`): for each opponent, up to one of the permanents that player controls (CR 601.2c) -- the one form built. */
      if (forEach !== undefined && !(forEach === "opponent" && (count?.min ?? 0) === 0 && count?.max === 1
        && (Array.isArray(selector.anyOf) ? selector.anyOf : [selector]).every((one) => (one?.what ?? "permanent") === "permanent")))
        errors.push({path: `${path}.targets[${index}].forEach`, message: "\"For each opponent, up to one target ... that player controls\" is forEach: \"opponent\" with count {min: 0, max: 1}, its alternatives permanents"});
      checkSelector(spec && typeof spec === "object" ? selector : spec, `${path}.targets[${index}]`, errors, {choice: true});
    }
    for (const n of targetRefs(effect.effects ?? []))
      if (n < 0 || n >= (effect.targets ?? []).length) errors.push({path: `${path}.effects`, message: `A reflexive trigger's effect names target ${n}, and it declares ${(effect.targets ?? []).length}`});
  }
  /* What a permanent put onto the battlefield is required to attack (CR 508.1d): "that opponent this turn" (encore), or
     anyone "this combat" (Legion Warboss) -- effects/permanents.mjs, afterwards. */
  if (effect.mustAttack !== undefined && !["that player", "this combat"].includes(effect.mustAttack))
    errors.push({path: `${path}.mustAttack`, message: "What it must attack is \"that player\" (this turn) or anyone \"this combat\""});
  /* "Each player with exactly 13 life loses the game" (Triskaidekaphobia; effects/resources.mjs): a life total, a whole number. */
  if (effect.withLife !== undefined && (name !== "loseGame" || !Number.isInteger(effect.withLife)))
    errors.push({path: `${path}.withLife`, message: "\"With exactly N life\" is withLife: a whole number, on loseGame"});
  /* "Its controller creates two tokens that are copies of that creature, except their power is half that creature's power"
     (Saw in Half; effects/permanents.mjs, movedCopies): copies of what the effect before it moved (`of: "moved"`), their power
     and toughness halved, rounded up (`halfStats`) -- on a copyPermanent, and halving only those. */
  if (effect.of !== undefined && !(name === "copyPermanent" && effect.of === "moved" && effect.targets === undefined && effect.selector === undefined))
    errors.push({path: `${path}.of`, message: "Copies of what the effect before it moved are copyPermanent's of: \"moved\", with no targets or selector of their own"});
  if (effect.halfStats !== undefined && !(effect.halfStats === true && effect.of === "moved"))
    errors.push({path: `${path}.halfStats`, message: "halfStats is true, on copies of what the effect before it moved (of: \"moved\")"});
  /* "Roll a d20" (CR 706.1; effects/resources.mjs): a die of `sides` sides, a whole number 2 or more. */
  if (name === "rollDie" && !(Number.isInteger(effect.sides) && effect.sides >= 2))
    errors.push({path: `${path}.sides`, message: "A die rolled says how many sides it has: sides, a whole number 2 or more (a d20 is 20)"});
  /* "You become the monarch", "its controller becomes the monarch" (CR 725.3; effects/resources.mjs): one player -- its
     controller ("you", or unsaid), a target player, or the controller of what the trigger is about. */
  if (name === "becomeMonarch" && effect.who !== undefined && !["you", "that card's controller"].includes(effect.who) && !Number.isInteger(effect.who?.target))
    errors.push({path: `${path}.who`, message: "One player becomes the monarch: \"you\" (unsaid), a target player ({target: n}), or \"that card's controller\""});
  /* "The player or planeswalker that creature is attacking" (Raid Bombardment; script/bind.mjs): damage, to that one alone. */
  if (effect.who === "attacked" && (name !== "dealDamage" || effect.targets !== undefined))
    errors.push({path: `${path}.who`, message: "\"The player or planeswalker it's attacking\" (who: \"attacked\") is dealt damage, by dealDamage with no other target"});
  /* Control for the turn, or "for as long as this creature remains on the battlefield" (CR 611.2b; Sower of Temptation),
     or for good when unsaid (effects/permanents.mjs). */
  if (name === "gainControl" && effect.until !== undefined && !CONTROL_DURATIONS.includes(effect.until))
    errors.push({path: `${path}.until`, message: `Control is gained for good, or until ${CONTROL_DURATIONS.join(" or ")}`});
  /* "With the greatest power", "with the greatest mana value" (Crackling Doom, Soul Shatter; End of the Hunt): what is
     sacrificed, or a permanent chosen on the battlefield (effects/asking.mjs, greatestBy) -- never read anywhere else. */
  if (effect.greatest !== undefined && !(["power", "manaValue"].includes(effect.greatest) && (name === "sacrifice" || (name === "chooseCard" && effect.zone === "battlefield"))))
    errors.push({path: `${path}.greatest`, message: "\"The greatest power\" or \"mana value\" (`greatest`) is a sacrifice's, or a chooseCard's on the battlefield: \"power\" or \"manaValue\""});
  /* "For each of those permanents, choose a different opponent. Each opponent gains control of the permanent for which they
     were chosen" (Dack Fayden, Helping Hand; effects/asking.mjs, controlToOpponents): `toEach`, of the permanents `targets`
     names, for good, to no one player. */
  if (effect.toEach !== undefined && (name !== "gainControl" || effect.toEach !== "different opponent" || effect.until !== undefined || effect.toPlayer !== undefined
    || effect.selector !== undefined || effect.targets === undefined))
    errors.push({path: `${path}.toEach`, message: "A different opponent for each permanent (`toEach: \"different opponent\"`) is gainControl's, of its `targets`, for good, with no `toPlayer`"});
  /* "Goaded for the rest of the game" (Dack Fayden, Helping Hand; CR 701.15a): a goad's `until` is "game" or unsaid (until
     its controller's next turn). */
  if (name === "goad" && effect.until !== undefined && effect.until !== "game")
    errors.push({path: `${path}.until`, message: "A goad lasts until its controller's next turn, or for the rest of the game (`until: \"game\"`)"});
  /* Control of two permanents exchanged (CR 701.12b; effects/permanents.mjs, exchangeControl): the one (`from`) and the other
     (`targets`) -- or the two of `targets` -- for good. */
  if (name === "exchangeControl" && (effect.targets === undefined || effect.until !== undefined))
    errors.push({path: `${path}.targets`, message: "exchangeControl exchanges control of two permanents, for good: `from` the one and `targets` the other, or the two of `targets`"});
  /* "You put that card onto the battlefield under your control" (Jhoira, Weatherlight Corsair; effects/zones.mjs, digUntil):
     the one controller a found card is put there under besides its owner -- any other word would be read as its owner. */
  if (name === "digUntil" && effect.found?.controller !== undefined && !(effect.found.controller === "you" && effect.found.to === "battlefield"))
    errors.push({path: `${path}.found.controller`, message: "A card found is put onto the battlefield under its owner's control, or `controller: \"you\"` with `to: \"battlefield\"`"});
  /* "Exile ... until this leaves the battlefield" (CR 610.3): the one "until" the engine returns from. */
  if (name === "exileUntil" && effect.until !== "this leaves")
    errors.push({path: `${path}.until`, message: "exileUntil returns what it exiled when its source leaves the battlefield: `until: \"this leaves\"`"});
  /* "And all other nonland permanents that player controls with the same name" (Deputy of Detention): a selector of the others. */
  if (name === "exileUntil" && effect.sameName !== undefined) checkSelector(effect.sameName, `${path}.sameName`, errors);
  /* "Can't cast spells with the same name as that creature" (Reflector Mage): which name, and whose -- both, or it forbids
     nothing it could say. */
  /* Or every spell (`allSpells`, Conduit of Worlds's "you can't cast additional spells this turn"), never beside a name. */
  if (name === "effectUntil" && effect.rule === "cant-cast" && ((effect.named === undefined) === (effect.allSpells !== true) || effect.who === undefined
    || (effect.allSpells !== undefined && effect.allSpells !== true)))
    errors.push({path, message: "A cast forbidden for a while names the spells (`named`) or forbids every one (`allSpells: true`), and the players (`who`)"});
  /* "If that creature would die this turn, exile it instead" (rules/replacement.mjs): about what it names, fixed as it
     resolves -- `targets`, and for this turn. */
  if (name === "effectUntil" && effect.rule === "exile-if-dies" && (effect.targets === undefined || (effect.until ?? "end-of-turn") !== "end-of-turn"))
    errors.push({path, message: "\"If it would die this turn, exile it instead\" names what it is about (`targets`), for this turn"});
  /* "Unless you pay {3}{W}{W}" (echo): a mana cost with its colors, `mana`, in place of a generic `amount`, never beside one. */
  if (name === "unlessPays" && effect.mana !== undefined) {
    let parsed = null;
    try { parsed = typeof effect.mana === "string" ? parseManaCost(effect.mana) : null; } catch { /* reported below */ }
    if (!parsed || !parsed.symbols.length || parsed.variable > 0) errors.push({path: `${path}.mana`, message: "An \"unless\" mana cost is mana symbols, without X: \"{3}{W}{W}\""});
    if (effect.amount !== undefined) errors.push({path: `${path}.mana`, message: "An \"unless\" cost is `mana` or a generic `amount`, not both"});
  }
  /* "Unless you return another creature you control to its owner's hand" (Faerie Impostor): a selector of the payer's
     permanents, the cost's only part beside mana or life. */
  if (name === "unlessPays" && effect.returnToHand !== undefined) {
    checkSelector(effect.returnToHand, `${path}.returnToHand`, errors);
    if (effect.sacrifice !== undefined || effect.discard !== undefined)
      errors.push({path: `${path}.returnToHand`, message: "An \"unless\" cost returns a permanent, sacrifices one or discards a card: one of them"});
  }
  /* "You may tap another untapped Merfolk you control" (Meanders Guide): a selector of the payer's permanents, the cost's only
     part beside mana or life. */
  if (name === "unlessPays" && effect.tap !== undefined) {
    /* Or "that card", the permanent the trigger is about (Charismatic Conqueror: "they may tap that permanent"). */
    if (effect.tap !== "that card") checkSelector(effect.tap, `${path}.tap`, errors);
    if (effect.sacrifice !== undefined || effect.discard !== undefined || effect.returnToHand !== undefined)
      errors.push({path: `${path}.tap`, message: "An \"unless\" cost taps a permanent, returns one, sacrifices one or discards a card: one of them"});
  }
  /* "You may pay {X}. When you do, ..." (Halo Forager): X chosen as it is paid, so no amount beside it, and only a "you may". */
  /* "You may pay {2}{R} any number of times. When you pay this cost one or more times, ..." (Bloodthirsty Adversary): a mana
     cost, how many times chosen as it is paid, so no amount beside it, and only a "you may". */
  if (name === "unlessPays" && effect.timesAny !== undefined && !(effect.timesAny === true && effect.ifPaid === true && typeof effect.mana === "string" && effect.mana.length
    && effect.amount === undefined && effect.amountX === undefined && effect.manaTimes === undefined))
    errors.push({path: `${path}.timesAny`, message: "\"You may pay a cost any number of times\" is `timesAny: true` with `ifPaid: true` and a `mana` cost, nothing else to pay beside it"});
  if (name === "unlessPays" && effect.amountX !== undefined && !(effect.amountX === true && effect.ifPaid === true && effect.amount === undefined && effect.mana === undefined))
    errors.push({path: `${path}.amountX`, message: "\"You may pay {X}\" is `amountX: true` with `ifPaid: true`, and no amount or mana beside it"});
  if (name === "play" && effect.exileInstead !== undefined && effect.exileInstead !== true)
    errors.push({path: `${path}.exileInstead`, message: "\"If that spell would be put into a graveyard, exile it instead\" is `exileInstead: true`"});
  if (name === "unlessPays" && effect.whenPaid !== undefined && !(Array.isArray(effect.whenPaid) && effect.whenPaid.length))
    errors.push({path: `${path}.whenPaid`, message: "What follows paying is a list of effects"});
  /* Where a countered spell goes instead of its owner's graveyard: exile (Force of Negation) or the top of its owner's
     library (Memory Lapse) -- any other word would be read as the graveyard. */
  if (name === "counterSpell" && effect.to !== undefined && !["exile", "top"].includes(effect.to))
    errors.push({path: `${path}.to`, message: "A countered spell goes to its owner's graveyard, or `to` \"exile\" or \"top\" instead"});
  /* "If a permanent spell is countered this way, exile it instead" (Thranduil's Decree): a permanent spell's place instead. */
  if (name === "counterSpell" && effect.permanentTo !== undefined && effect.permanentTo !== "exile")
    errors.push({path: `${path}.permanentTo`, message: "A countered permanent spell goes to exile instead: `permanentTo: \"exile\"`"});
  /* A vote (CR 701.38): two or more choices, each words of their own. */
  if (name === "vote" && !(Array.isArray(effect.choices) && effect.choices.length >= 2 && effect.choices.every((c) => typeof c === "string" && c.length) && new Set(effect.choices).size === effect.choices.length))
    errors.push({path: `${path}.choices`, message: "A vote is among two or more choices, each its own words"});
  /* "Each opponent may ...": the mode that is doing so, kept for "for each opponent who does" (script/amount.mjs). */
  if (name === "modal") (effect.modes ?? []).forEach((mode, m) => {
    if (mode?.did !== undefined && mode.did !== true) errors.push({path: `${path}.modes[${m}].did`, message: "A mode that is doing what was offered says `did: true`"});
  });
  /* "For as long as it remains exiled": a permission only for a card in exile now. */
  if (name === "mayPlay" && effect.zone !== undefined && effect.zone !== "exile")
    errors.push({path: `${path}.zone`, message: "mayPlay's zone is \"exile\": a card there now, for as long as it remains exiled"});
  /* "If you control a Wizard" (Flameshape): a permission's condition, closed as an effect's own is -- an unknown key refused
     here rather than read as true. */
  if (name === "mayPlay") for (const message of conditionProblems(effect.onlyIf)) errors.push({path: `${path}.onlyIf`, message});
  /* "Repeat this process" (Grist, the Hunger Tide; effects/index.mjs repeatFor): the condition asked after each pass. */
  if (name === "repeatFor" && effect.again !== undefined) for (const message of conditionProblems(effect.again)) errors.push({path: `${path}.again`, message});
  /* A zone's cards for a while (Chainer, Nightmare Adept; Gwenom, Remorseless): its graveyard or the top of its library, in
     place of named cards -- what may be played (`spells`, a selector), "pay life equal to its mana value" (`payLife`), and
     how many cards before it is spent (`count`). */
  if (name === "mayPlay" && effect.from !== undefined) {
    if (!["graveyard", "library-top"].includes(effect.from)) errors.push({path: `${path}.from`, message: "mayPlay's `from` is \"graveyard\" or \"library-top\""});
    if (effect.targets !== undefined || effect.zone !== undefined || effect.onlyIf !== undefined)
      errors.push({path: `${path}.from`, message: "mayPlay from a zone names no cards: no `targets`, `zone` or `onlyIf` beside `from`"});
    if (effect.spells !== undefined && effect.spells !== true) checkSelector(effect.spells, `${path}.spells`, errors, {choice: true});
    if (effect.payLife !== undefined && effect.payLife !== "manaValue") errors.push({path: `${path}.payLife`, message: "payLife is \"manaValue\""});
    if (effect.count !== undefined && !(Number.isInteger(effect.count) && effect.count >= 1)) errors.push({path: `${path}.count`, message: "count is how many cards it lets be played, 1 or more"});
  }
  /* "You may play a card exiled with Lobelia" (Rob's lists P2): `linked`, the cards this source's other ability exiled, and
     `count`, how many of them -- in place of `targets`. */
  if (name === "mayPlay" && effect.linked !== undefined && !(effect.linked === true && effect.from === undefined && effect.targets === undefined))
    errors.push({path: `${path}.linked`, message: "mayPlay's `linked` is true: the cards this source's other ability exiled, in place of targets or a zone"});
  if (name === "mayPlay" && effect.linked === true && effect.count !== undefined && !(Number.isInteger(effect.count) && effect.count >= 1))
    errors.push({path: `${path}.count`, message: "count is how many cards it lets be played, 1 or more"});
  if (name === "mayPlay" && effect.from === undefined && ["spells", "payLife", ...(effect.linked === true ? [] : ["count"])].some((key) => effect[key] !== undefined))
    errors.push({path, message: "spells, payLife and count are a mayPlay's from a zone (`from`); count also a linked one's"});
  /* Amass (CR 701.47a): the creature type its Army is, "Goblin" for "amass Goblins 2"; the Army chosen remembered or not. */
  if (name === "amass") {
    if (!isText(effect.subtype) || !isCreatureType(effect.subtype))
      errors.push({path: `${path}.subtype`, message: "Amass names the creature type its Army is: `subtype`, \"Goblin\" for \"amass Goblins\""});
    if (effect.remember !== undefined && effect.remember !== true) errors.push({path: `${path}.remember`, message: "Amass remembers the amassed Army with `remember: true`"});
  }
  /* Damage dealt by each of a set (damageEach): what each deals, an amount counted for it ("that card" the one dealing it),
     and to whom -- itself, or the effect's targets and players. */
  if (name === "damageEach") {
    if (effect.dealt === undefined) errors.push({path: `${path}.dealt`, message: "damageEach says what each deals: `dealt`, an amount"});
    else for (const message of amountProblems(effect.dealt)) errors.push({path: `${path}.dealt`, message});
    if (effect.to !== undefined && effect.to !== "itself") errors.push({path: `${path}.to`, message: "damageEach deals to `to: \"itself\"`, or to its targets and players"});
    if (effect.to === undefined && effect.targets === undefined && effect.who === undefined) errors.push({path, message: "damageEach deals its damage to itself, or to targets or players"});
    if (effect.selector !== undefined) checkSelector(effect.selector, `${path}.selector`, errors, {choice: true});
  }
  /* "Put each creature card exiled with this artifact onto the battlefield" (Ghost Vacuum): of a linked move's cards, those a
     selector fits (`linkedOnly`) -- only beside `linked`. */
  if (name === "moveZone" && effect.linkedOnly !== undefined) {
    if (effect.linked !== true) errors.push({path: `${path}.linkedOnly`, message: "linkedOnly narrows a linked move: it goes with `linked: true`"});
    checkSelector(effect.linkedOnly, `${path}.linkedOnly`, errors);
  }
  /* WHAT AN EFFECT MOVED, REFERRED TO AFTER IT (wave 4a, h2): "put all artifact cards from among them onto the battlefield"
     (Tezzeret, Master of the Bridge) -- of what a move names, those a selector fits (`only`); "then return it to the
     battlefield tapped" (Eldrazi Confluence) -- a flicker's return, tapped (`returnTapped`, beside `andReturn`); "exile target
     player's graveyard" kept for "a creature card exiled with this Vehicle" (Nautiloid Ship; moveZoneAll's `link`); "you may
     attach it to a creature you control" (Armored Skyhunter; chooseCard's `attach`, a permanent chosen where it is); "put all
     land cards from among them onto the battlefield" (Animist's Awakening; dig's `all`, nobody asked). */
  if (name === "moveZone" && effect.only !== undefined) checkSelector(effect.only, `${path}.only`, errors);
  if (name === "moveZone" && effect.returnTapped !== undefined && !(effect.returnTapped === true && effect.andReturn !== undefined))
    errors.push({path: `${path}.returnTapped`, message: "A flicker's return tapped is `returnTapped: true`, beside `andReturn`"});
  /* "Onto the battlefield under your control" (Rise of the Dark Realms, wave 4b j1; effects/zones.mjs moveZoneAll). */
  if (name === "moveZoneAll" && effect.controller !== undefined && !(effect.controller === "you" && effect.to === "battlefield"))
    errors.push({path: `${path}.controller`, message: "What a move of all puts onto the battlefield under its controller's control is `controller: \"you\"` with `to: \"battlefield\"`"});
  if (name === "moveZoneAll" && effect.link !== undefined && !(effect.link === true && effect.to === "exile"))
    errors.push({path: `${path}.link`, message: "What a move of all exiles, kept for its source's linked ability, is `link: true` with `to: \"exile\"`"});
  /* "Exchange your hand and library" (Mordenkainen; effects/zones.mjs moveZoneAll): your cards of one hidden zone, exchanged
     with your cards of another. */
  if (name === "moveZoneAll" && effect.exchange !== undefined && !(effect.exchange === true && effect.selector?.controller === "you"
    && ["hand", "library", "graveyard"].includes(effect.selector?.zone) && ["hand", "library", "graveyard"].includes(effect.to) && effect.selector.zone !== effect.to))
    errors.push({path: `${path}.exchange`, message: "An exchange of two zones is `exchange: true`, your cards of one of hand, library or graveyard (`selector`) with your cards of another (`to`)"});
  if (name === "chooseCard" && effect.attach !== undefined && !(effect.attach === "remembered" && effect.to === "stay" && effect.zone === "battlefield"))
    errors.push({path: `${path}.attach`, message: "Attaching what the effect before it put onto the battlefield to a permanent chosen is `attach: \"remembered\"`, with `zone: \"battlefield\"` and `to: \"stay\"`"});
  /* "It loses 'enchant creature card in a graveyard' and gains 'enchant creature put onto the battlefield with this Aura.' ...
     attach this Aura to it" (Animate Dead, wave 4b j1; effects/permanents.mjs attach): `enchants: true`, an Aura attaching
     itself, its Enchant from then on that creature alone. */
  if (effect.enchants !== undefined && !(name === "attach" && effect.enchants === true && effect.source === undefined))
    errors.push({path: `${path}.enchants`, message: "An Aura that enchants only what it attaches itself to is attach's `enchants: true`, with no other `source`"});
  if (name === "dig" && effect.all !== undefined && !(effect.all === true && effect.selector !== undefined && effect.upTo === undefined && effect.take === undefined))
    errors.push({path: `${path}.all`, message: "Every card a selector fits, taken with nobody asked, is `all: true` beside a `selector`, with no `take` or `upTo`"});
  /* "Put up to one of them on top of your library" (Thassa's Oracle, wave 4c k2; effects/asking.mjs, digToTop): one card, kept
     in the library and lifted to its top -- never several, whose order on top nothing asks. */
  if (name === "dig" && effect.to === "top" && !((effect.take ?? 1) === 1 && effect.all === undefined && effect.toByType === undefined))
    errors.push({path: `${path}.to`, message: "A card a dig puts on top of the library is one card: `to: \"top\"` with `take: 1`, never `all` or `toByType`"});
  /* MANIFEST DREAD (CR 701.62a; Innocuous Rat): "look at the top two cards of your library. Manifest one of them, then put the
     cards you looked at that were not manifested this way into your graveyard" -- a dig of two, one taken onto the battlefield
     face down as a manifest is (CR 701.40a), the rest into the graveyard. `manifest: true` is that, and nothing else. */
  if (name === "dig" && effect.manifest !== undefined && !(effect.manifest === true && effect.to === "battlefield" && (effect.take ?? 1) === 1 && effect.rest === "graveyard"
    && effect.upTo === undefined && effect.all === undefined && effect.selector === undefined && effect.reveal === undefined))
    errors.push({path: `${path}.manifest`, message: "Manifest dread is `manifest: true` with `to: \"battlefield\"`, `take: 1` and `rest: \"graveyard\"`: one card, chosen from all of them, none revealed"});
  /* Counters moved (moveCounters, CR 122.5; script/effects/resources.mjs): from one object onto another, of a kind named --
     or "chosen", its controller's choice among the kinds there (effects/asking.mjs, counterKind). */
  if (name === "moveCounters") {
    if (effect.from === undefined) errors.push({path: `${path}.from`, message: "moveCounters says what it moves counters from: `from`, an object"});
    if ((effect.targets === undefined) === (effect.onto === undefined)) errors.push({path: `${path}.targets`, message: "moveCounters says what it moves them onto: `targets`, an object, or `onto`, what its controller may choose among"});
    if (typeof effect.counter !== "string") errors.push({path: `${path}.counter`, message: "moveCounters names the kind of counter it moves, or \"chosen\" for its controller's choice"});
    /* "Move all counters" (The Ozolith, wave 4b): every kind, all of them, onto one object -- no count of its own. */
    if (effect.counter === "all" && (effect.count !== undefined || effect.onto !== undefined))
      errors.push({path: `${path}.counter`, message: "\"All counters\" moves every one of every kind onto its `targets`: no count, and no `onto`"});
    /* "Move any number of +1/+1 counters from this creature onto other creatures" (Forgotten Ancient): `onto`, a selector of
       the permanents, with `anyNumber` and a kind named (effects/asking.mjs, countersOnto). */
    if (effect.onto !== undefined) {
      checkSelector(effect.onto, `${path}.onto`, errors);
      if (effect.anyNumber !== true || effect.counter === "chosen" || effect.count !== undefined)
        errors.push({path: `${path}.onto`, message: "Counters moved onto permanents chosen as it resolves are any number (`anyNumber: true`) of a kind named, with no count"});
    }
    if (effect.anyNumber !== undefined && effect.onto === undefined) errors.push({path: `${path}.anyNumber`, message: "anyNumber goes with `onto`"});
  }
  /* A designation (alterAttribute, script/effects/attributes.mjs): monstrous or prepared. */
  if (name === "alterAttribute" && !["monstrous", "prepared", "solved"].includes(effect.attribute))
    errors.push({path: `${path}.attribute`, message: "alterAttribute gives or takes a designation: \"monstrous\", \"prepared\" or \"solved\""});
  /* Solved stays until the Case leaves the battlefield (CR 719.3b): given, never taken. */
  if (name === "alterAttribute" && effect.attribute === "solved" && effect.value !== undefined)
    errors.push({path: `${path}.value`, message: "A Case once solved stays solved (CR 719.3b): solved is given, never taken"});
  /* "Each opponent may sacrifice ... For each opponent who doesn't, ..." (Braids, Arisen Nightmare; effects/asking.mjs): a
     sacrifice that may be declined (`optional`), and what follows for each player who sacrifices nothing (`ifNot`), held to
     the effect grammar. */
  if (name === "sacrifice") {
    if (effect.optional !== undefined && effect.optional !== true) errors.push({path: `${path}.optional`, message: "A sacrifice that may be declined is optional: true"});
    /* Declined, or -- a sacrifice that must be made -- one a player can't make: "each player who can't discards a card"
       (Plaguecrafter; effects/asking.mjs, sacrifice's `named`). Never beside keeping (Tragic Arrogance's `keep`). */
    if (effect.ifNot !== undefined) {
      if (!Array.isArray(effect.ifNot) || !effect.ifNot.length || effect.keep !== undefined || effect.keepTypes !== undefined || effect.keepPowerAtMost !== undefined)
        errors.push({path: `${path}.ifNot`, message: "What follows a sacrifice declined, or one a player can't make, is a list of effects -- never beside keeping"});
      else effect.ifNot.forEach((child, index) => checkEffect(child, `${path}.ifNot[${index}]`, errors));
    }
  }
  /* "All other creatures they control that don't share a creature type with the chosen creature they control" (Winnowing;
     effects/zones.mjs, sacrificeAll): `exceptSharing` "creature type", beside `except` "remembered" -- what it is shared with. */
  if (effect.exceptSharing !== undefined && !(name === "sacrificeAll" && effect.exceptSharing === "creature type" && effect.except === "remembered"))
    errors.push({path: `${path}.exceptSharing`, message: "What a sacrifice of all spares by sharing it with a creature chosen is exceptSharing: \"creature type\", on sacrificeAll beside except: \"remembered\""});
  /* A branch's test: a condition, and there must be one. */
  if (name === "branch") {
    if (effect.if === undefined) errors.push({path: `${path}.if`, message: "A branch says what decides it: `if`, a condition"});
    for (const message of conditionProblems(effect.if)) errors.push({path: `${path}.if`, message});
    for (const key of ["then", "otherwise"]) if (effect[key] !== undefined && !Array.isArray(effect[key])) errors.push({path: `${path}.${key}`, message: `A branch's ${key} is a list of effects`});
  }
  /* What follows a prevention shield's prevention (Inkshield, Deflecting Palm; CR 615.5): effects, each held to the rest. */
  if (name === "effectUntil" && Array.isArray(effect.then)) effect.then.forEach((child, index) => checkEffect(child, `${path}.then[${index}]`, errors));
  const children = COMPOSERS[name];
  if (!children) return;
  const nested = children(effect);
  if (nested.length === 0) errors.push({path, message: `${name} composes other effects and has none`});
  nested.forEach((child, index) => checkEffect(child, `${path}.effects[${index}]`, errors));
}

function checkSelector(selector, path, errors, {choice = false} = {}) {
  try {
    /* A choice of alternatives ("instant and sorcery spells") where the reader takes one (statics.mjs costReduction):
       each alternative, with the keys they share, is a selector of its own. */
    const {anyOf, ...shared} = selector ?? {};
    if (choice && Array.isArray(anyOf)) for (const one of anyOf) compileSelector({...shared, ...one});
    else compileSelector(selector);
  } catch (error) {
    errors.push({path, message: error.message});
  }
}

/* A target's count: `min` a whole number (0 when absent), `max` a whole number at least 1 and at least `min`, or absent. */
/* `x`: "up to that many" -- a reflexive trigger's `max: "X"`, the X it was made with (Bloodthirsty Adversary). */
const countValid = (count, {x = false} = {}) => Boolean(count) && typeof count === "object" && !Array.isArray(count)
  && Object.keys(count).every((k) => k === "min" || k === "max")
  /* "Exile X target creatures" (Curse of the Swine; script/bind.mjs countOf): exactly X, `{min: "X", max: "X"}`. */
  && (count.min === undefined || (Number.isInteger(count.min) && count.min >= 0) || (count.min === "X" && count.max === "X"))
  && (count.max === undefined || (x && count.max === "X" && (count.min ?? 0) === 0) || (count.min === "X" && count.max === "X") || (Number.isInteger(count.max) && count.max >= 1 && count.max >= (count.min ?? 0)));

/* `permanent`: the card is a permanent card, whose spell ability may say only its additional cost (below). */
function checkAbility(ability, path, errors, {permanent = false, manaX = false} = {}) {
  if (!ability || typeof ability !== "object") {
    errors.push({path, message: "An ability is an object"});
    return;
  }
  if (!ABILITY_KINDS.includes(ability.kind)) {
    errors.push({path: `${path}.kind`, message: `An ability is one of ${ABILITY_KINDS.join(", ")}, not ${JSON.stringify(ability.kind)}`});
    return;
  }
  /* §3.2.5 */
  if (!isText(ability.text))
    errors.push({path: `${path}.text`, message: "An ability carries the oracle sentence it implements, so it can be re-checked when the card is errata'd"});

  /* A target is a selector, or `{anyOf: [...]}` for "any target" (script/bind.mjs) -- either with a `count`, `{min, max}`, for
     "up to N", "any number of", "one or two" (CR 115.1, 601.2c). */
  for (const [index, spec] of (ability.targets ?? []).entries()) {
    const {totalPowerAtMost, count, distinctFrom, onlyIf, differentControllers, share, forEach, ownedByControllerOf, ...selector} = spec && typeof spec === "object" ? spec : {};
    if (totalPowerAtMost !== undefined && !(Number.isInteger(totalPowerAtMost) && totalPowerAtMost >= 0 && count !== undefined))
      errors.push({path: `${path}.targets[${index}].totalPowerAtMost`, message: "A total power limit is a nonnegative integer on a counted target"});
    /* "Each of up to X targets" (Crackle with Power): a spell's X, in its mana cost, is announced before its targets are chosen
       (CR 601.2b-c). */
    if (count !== undefined && !countValid(count, {x: ability.kind === "spell" && manaX}))
      errors.push({path: `${path}.targets[${index}].count`, message: "A target's count is `{min, max}`: whole numbers, max at least 1 and at least min, or no max for \"any number\""});
    /* "Target artifact a player controls and target artifact card in that player's graveyard" (Goblin Welder; script/bind.mjs,
       `ownedByControllerOf`): an earlier, single target of the same ability, a permanent -- this one a card, uncounted. */
    if (ownedByControllerOf !== undefined && !(Number.isInteger(ownedByControllerOf) && ownedByControllerOf >= 0 && ownedByControllerOf < index && count === undefined
      && (selector.what ?? "permanent") === "card" && ((ability.targets ?? [])[ownedByControllerOf]?.what ?? "permanent") === "permanent" && (ability.targets ?? [])[ownedByControllerOf]?.count === undefined))
      errors.push({path: `${path}.targets[${index}].ownedByControllerOf`, message: "ownedByControllerOf names an earlier, single permanent target of the same ability, by number, on a single card target: \"in that player's graveyard\""});
    /* "For each opponent, put X -1/-1 counters on up to one target creature that player controls" (Hapatra, the Desert Fang,
       Train E; script/bind.mjs, `forEach`): a triggered ability's, as a reflexive trigger's is (above) -- the one form built. */
    if (forEach !== undefined && !(ability.kind === "triggered" && forEach === "opponent" && (count?.min ?? 0) === 0 && count?.max === 1
      && (Array.isArray(selector.anyOf) ? selector.anyOf : [selector]).every((one) => (one?.what ?? "permanent") === "permanent")))
      errors.push({path: `${path}.targets[${index}].forEach`, message: "\"For each opponent, up to one target ... that player controls\" is forEach: \"opponent\" with count {min: 0, max: 1}, on a triggered ability, its alternatives permanents"});
    /* "A second target", "up to one other target" (script/bind.mjs, SPEC_KEYS): an earlier target of the same ability. */
    if (distinctFrom !== undefined && !(Array.isArray(distinctFrom) && distinctFrom.length && distinctFrom.every((n) => Number.isInteger(n) && n >= 0 && n < index)))
      errors.push({path: `${path}.targets[${index}].distinctFrom`, message: "distinctFrom names earlier targets of the same ability, by number: [0]"});
    /* A target had only if, as it is cast (CR 601.2c): a condition, held to the condition grammar. */
    for (const message of conditionProblems(onlyIf)) errors.push({path: `${path}.targets[${index}].onlyIf`, message});
    if (differentControllers !== undefined && !(differentControllers === true && count !== undefined))
      errors.push({path: `${path}.targets[${index}].differentControllers`, message: "\"Controlled by different players\" is differentControllers: true, on a counted target"});
    /* "From a single graveyard", "that share a creature type" (script/bind.mjs, `share`): on a counted target. */
    if (share !== undefined && !(SHARES.includes(share) && count !== undefined))
      errors.push({path: `${path}.targets[${index}].share`, message: `What a counted target's choices share is ${SHARES.map((s) => JSON.stringify(s)).join(" or ")}, on a counted target`});
    if (spec && typeof spec === "object" && "anyOf" in spec) {
      if (!Array.isArray(selector.anyOf) || selector.anyOf.length === 0 || Object.keys(selector).length !== 1)
        errors.push({path: `${path}.targets[${index}]`, message: "A choice of targets is `{anyOf: [selector, ...]}` and nothing else, or that with a count"});
      else selector.anyOf.forEach((one, at) => checkSelector(one, `${path}.targets[${index}].anyOf[${at}]`, errors));
    } else checkSelector(spec && typeof spec === "object" ? selector : spec, `${path}.targets[${index}]`, errors);
  }
  /* Every `{target: n}` an effect names is a target the ability declares, or it would bind to nothing, silently. A
     modal whose modes carry their own targets (chosen as it is cast, CR 700.2): each mode's effects name its own. */
  const modal = (ability.effects ?? []).length === 1 && ability.effects[0]?.effect === "modal" && (ability.effects[0].modes ?? []).some((m) => Array.isArray(m?.targets))
    ? ability.effects[0] : null;
  if (modal) {
    for (const [m, mode] of (modal.modes ?? []).entries()) {
      for (const [index, spec] of (mode.targets ?? []).entries()) {
        const {count, share, differentControllers, ...selector} = spec && typeof spec === "object" ? spec : {};
        if (count !== undefined && !countValid(count))
          errors.push({path: `${path}.effects[0].modes[${m}].targets[${index}].count`, message: "A target's count is `{min, max}`"});
        if (share !== undefined && !(SHARES.includes(share) && count !== undefined))
          errors.push({path: `${path}.effects[0].modes[${m}].targets[${index}].share`, message: `What a counted target's choices share is ${SHARES.map((s) => JSON.stringify(s)).join(" or ")}, on a counted target`});
        /* "Any number of target tapped creatures with different controllers" (Cloud's Limit Break's Blade Beam): a mode's
           counted target may say it, as an ability's may (script/bind.mjs). */
        if (differentControllers !== undefined && !(differentControllers === true && count !== undefined))
          errors.push({path: `${path}.effects[0].modes[${m}].targets[${index}].differentControllers`, message: "\"Controlled by different players\" is differentControllers: true, on a counted target"});
        if (spec && typeof spec === "object" && "anyOf" in spec) (selector.anyOf ?? []).forEach((one, at) => checkSelector(one, `${path}.effects[0].modes[${m}].targets[${index}].anyOf[${at}]`, errors));
        else checkSelector(spec && typeof spec === "object" ? selector : spec, `${path}.effects[0].modes[${m}].targets[${index}]`, errors);
      }
      for (const n of targetRefs(mode.effects ?? []))
        if (n < 0 || n >= (mode.targets ?? []).length)
          errors.push({path: `${path}.effects[0].modes[${m}]`, message: `A mode names target ${n}, and declares ${(mode.targets ?? []).length}`});
    }
  } else for (const n of targetRefs(ability.effects ?? []))
    if (n < 0 || n >= (ability.targets ?? []).length)
      errors.push({path: `${path}.effects`, message: `An effect names target ${n}, and the ability declares ${(ability.targets ?? []).length}`});
  for (const [index, reveal] of (ability.reveals ?? []).entries()) {
    if (!REVEAL_WHAT.includes(reveal?.what))
      errors.push({path: `${path}.reveals[${index}].what`, message: `A reveal exposes one of ${REVEAL_WHAT.join(", ")}`});
    if (!REVEAL_TO.includes(reveal?.to))
      errors.push({path: `${path}.reveals[${index}].to`, message: "A reveal says TO WHOM, or there is nothing for the projection to be checked against"});
  }

  /* A condition (script/condition.mjs): closed, like the rest. */
  for (const message of conditionProblems(ability.condition)) errors.push({path: `${path}.condition`, message});

  /* "Choose one or both" (`chooseUpTo`, Perfect Intimidation): built for a spell whose one effect is the modal, its modes
     chosen as it is cast (cards/index.mjs, rules/actions.mjs). Anywhere else the modal is asked as it resolves, as one. */
  /* And for a triggered ability whose one effect is the modal, its modes chosen as it is put on the stack (CR 603.3c, 700.2b;
     rules/trigger.mjs, modalWays): "at the beginning of your first main phase, choose one or more" (Black Market Connections,
     wave 4b) -- one or more, never none (`choose: 0`) and never one mode twice (`sameMode`) there. */
  for (const [index, effect] of (ability.effects ?? []).entries()) {
    if (effect?.effect !== "modal" || effect.chooseUpTo === undefined) continue;
    const triggeredOne = ability.kind === "triggered" && effect.choose !== 0 && effect.sameMode === undefined;
    if (!(ability.kind === "spell" || triggeredOne) || (ability.effects ?? []).length !== 1)
      errors.push({path: `${path}.effects[${index}].chooseUpTo`, message: "\"Choose one or both\" is built for a spell whose one effect is the modal, or a triggered ability's choosing one or more"});
    if (!Number.isInteger(effect.chooseUpTo) || effect.chooseUpTo <= (effect.choose ?? 1))
      errors.push({path: `${path}.effects[${index}].chooseUpTo`, message: "chooseUpTo is how many modes at most: a whole number more than choose"});
  }
  /* "Choose up to four. You may choose the same mode more than once" (Moment of Reckoning; CR 700.2d): `sameMode`, and
     `choose: 0` for "up to" -- none chosen is a choice too -- each beside a chooseUpTo, so only on such a spell. */
  for (const [index, effect] of (ability.effects ?? []).entries()) {
    if (effect?.effect !== "modal") continue;
    /* Or exactly so many, two or more: "Choose three. You may choose the same mode more than once" (Eldrazi Confluence). */
    if (effect.sameMode !== undefined && !(effect.sameMode === true && (effect.chooseUpTo !== undefined || (Number.isInteger(effect.choose) && effect.choose >= 2))))
      errors.push({path: `${path}.effects[${index}].sameMode`, message: "\"You may choose the same mode more than once\" is sameMode: true, beside chooseUpTo or a choose of two or more"});
    if (effect.choose === 0 && effect.chooseUpTo === undefined)
      errors.push({path: `${path}.effects[${index}].choose`, message: "choose: 0 is \"up to\" chooseUpTo modes, beside it"});
  }
  /* "If this is the first time this ability has resolved this turn" (`firstResolution`; Nissa, Leyline Tamer): asked of a
     triggered or activated ability's effect as it is reached (script/resolution.mjs; rules/stack.mjs counts) -- never of the
     ability's own condition, asked before it resolves, nor of a spell's. */
  if ((ability.condition && typeof ability.condition === "object" && "firstResolution" in ability.condition)
    || (!["triggered", "activated"].includes(ability.kind) && asksFirstResolution(ability.effects)))
    errors.push({path, message: "firstResolution is asked of a triggered or activated ability's effect as it resolves"});

  const effectful = ["spell", "activated", "triggered"].includes(ability.kind);
  if (effectful) {
    const effects = ability.effects ?? [];
    /* A permanent spell's effect is its entering (CR 608.3): a permanent card's spell ability says only "as an additional cost
       to cast this spell, ..." (Lys Alana Dignitary; CR 601.2b), and has no effects of its own (cards/index.mjs). */
    const additionalOnly = permanent && ability.kind === "spell" && Array.isArray(ability.additionalCost) && ability.additionalCost.length > 0;
    if (effects.length === 0 && !additionalOnly)
      errors.push({path: `${path}.effects`, message: `A ${ability.kind} ability with no effects is a definition somebody did not finish`});
    effects.forEach((effect, index) => checkEffect(effect, `${path}.effects[${index}]`, errors));
  }

  if (ability.kind === "activated" && (ability.cost ?? []).length === 0)
    errors.push({path: `${path}.cost`, message: "An activated ability has a cost; one with none is a free ability nobody wrote"});

  if (ability.kind === "triggered") {
    const on = ability.trigger?.on;
    if (!isText(on)) {
      errors.push({path: `${path}.trigger`, message: "A triggered ability says what it triggers on"});
    } else if (!isTriggerEvent(on)) {
      /* The app's vocabulary and the engine's are bridged, not interchangeable — `vocabulary.mjs`
         maps `creature-dies` to `dies`, and a script has to carry the engine's spelling or
         `trigger.mjs` will never match it. */
      errors.push({path: `${path}.trigger.on`, message: `${JSON.stringify(on)} is not a trigger event the engine declares; the app's terms are bridged in vocabulary.mjs, not accepted here`});
    }
    /* A state trigger's state (CR 603.8): a condition, held to the condition grammar. */
    if (on === "state") for (const message of conditionProblems(ability.trigger.state ?? null)) errors.push({path: `${path}.trigger.state`, message});
    /* "When you cast this spell while you control a creature" (Social Snub): a condition asked as the spell is cast and never
       again (rules/trigger.mjs) -- of a spell cast trigger, and of an attack trigger ("whenever this creature attacks while
       saddled", Bounding Felidar), the two that read it, and held to the condition grammar. */
    if (ability.trigger?.while !== undefined) {
      if (!["spell cast", "attacks"].includes(on)) errors.push({path: `${path}.trigger.while`, message: "\"While\" a condition holds is read by a spell cast trigger and an attack trigger alone"});
      for (const message of conditionProblems(ability.trigger.while ?? null)) errors.push({path: `${path}.trigger.while`, message});
    }
    /* "Attack one of your opponents or a planeswalker they control" (CR 506.3): planeswalkers: true, beside defender: "opponent".
       "Whenever a creature attacks you or a planeswalker you control" (Revenge of Ravens; library load L4): beside defender:
       "you", as rules/trigger.mjs reads it. "Deals combat damage to a player or planeswalker" (Grateful Apparition):
       planeswalkers: true, on a damage trigger about a player. */
    const damageToPlayer = ["damage dealt", "damage dealt once"].includes(on) && ["player", "opponent"].includes(ability.trigger?.to ?? "player");
    if (ability.trigger?.planeswalkers !== undefined && (ability.trigger.planeswalkers !== true || !((on === "attacks" && ["opponent", "you"].includes(ability.trigger.defender)) || damageToPlayer)))
      errors.push({path: `${path}.trigger.planeswalkers`, message: "\"Or a planeswalker they control\" is planeswalkers: true, on an attack trigger with defender: \"opponent\" or \"you\"; \"or planeswalker\", on a damage trigger about a player"});
  }

  if (ability.kind === "keyword") {
    if (!isKeyword(ability.keyword))
      errors.push({path: `${path}.keyword`, message: `${JSON.stringify(ability.keyword)} is not a keyword the engine can grant`});
  }

  if (ability.kind === "static") {
    /* A static changes a characteristic, in a layer (CR 613), or a rule, by name (rules/statics.mjs): one or the
       other, never neither -- something nothing orders and nothing reads would validate and do nothing. */
    if (ability.rule !== undefined) {
      if (!Object.hasOwn(STATIC_RULES, ability.rule))
        errors.push({path: `${path}.rule`, message: `${JSON.stringify(ability.rule)} is not a rule a static ability can change; they are ${Object.keys(STATIC_RULES).join(", ")}`});
    } else {
      if (!LAYERS.includes(ability.layer))
        errors.push({path: `${path}.layer`, message: `A static ability says which layer it applies in (CR 613); layers are ${LAYERS.join(", ")}`});
      if (!ability.apply) errors.push({path: `${path}.apply`, message: "A static ability says what it does"});
    }
    if (!ability.affects) errors.push({path: `${path}.affects`, message: "A static ability says what it affects"});
    /* A rule is read through the whole selector grammar (rules/statics.mjs), a choice of selectors included: "creatures you
       control with power or toughness 1 or less". A layer's `affects` is the layers' narrower matcher, and is not. */
    /* "The same objects as this ability's earlier part" (`continued`, CR 613.6; Bludgeon Brawl, rules/layers.mjs): no selector,
       on a layer static alone. */
    else if (ability.affects.continued === true && ability.rule === undefined && Object.keys(ability.affects).length === 1) { /* the earlier part's objects */ }
    else checkSelector(ability.affects, `${path}.affects`, errors, {choice: ability.rule !== undefined});
    /* "By paying life equal to its mana value rather than paying its mana cost" (Demon of Fate's Design): a free cast's cost of
       life, its mana value. */
    if (ability.rule === "cast-without-paying" && ability.payLife !== undefined && ability.payLife !== "manaValue")
      errors.push({path: `${path}.payLife`, message: "payLife is \"manaValue\""});
    if (ability.rule === "play-from") {
      if (!["graveyard", "library-top", "exile"].includes(ability.zone)) errors.push({path: `${path}.zone`, message: "play-from zone is graveyard, library-top or exile"});
      /* `perType`: a land and a spell of each permanent type (Muldrotha); `anyMana`: "mana of any type can be spent to cast
         those spells" (Tinybones, CR 118.14). */
      for (const key of ["free", "graveyardToLibraryBottom", "perType", "anyMana"]) if (ability[key] !== undefined && ability[key] !== true)
        errors.push({path: `${path}.${key}`, message: `${key} is true`});
      if (ability.perType === true && ability.limit !== undefined) errors.push({path: `${path}.perType`, message: "A permission kept by type has no other limit"});
      if (ability.spells && typeof ability.spells === "object") checkSelector(ability.spells, `${path}.spells`, errors, {choice: true});
      /* "By sacrificing a land in addition to paying its other costs" (Exploration Broodship; CR 601.2b): an additional cost of
         the spells cast through it -- a sacrifice of a permanent the selector describes; or "by discarding a land card" (retrace,
         CR 702.81a, given by Six), a discard of a card it describes. */
      if (ability.additionalCost !== undefined) {
        if (!(Array.isArray(ability.additionalCost) && ability.additionalCost.length && ability.additionalCost.every((a) => ["sacrifice", "discard"].includes(a?.atom) && a.count === undefined)))
          errors.push({path: `${path}.additionalCost`, message: "A permission's additional cost is a list of sacrifices or discards of one each ({atom: \"sacrifice\" or \"discard\", selector})"});
        else ability.additionalCost.forEach((a, i) => { if (a.selector !== undefined) checkSelector(a.selector, `${path}.additionalCost[${i}].selector`, errors, {choice: true}); });
        if (ability.lands) errors.push({path: `${path}.additionalCost`, message: "An additional cost is a spell's (CR 601.2b): a permission with one lets spells be cast, not lands be played"});
      }
    }
    /* What causes a trigger to trigger again: an arrival, a death, an attack, an arrival or a departure, or its controller
       casting or copying a spell (Veyran, Voice of Duality; rules/trigger.mjs). */
    if (ability.rule === "triggers-again" && ability.cause !== undefined && !["enters", "dies", "attacks", "enters or leaves", "cast or copy"].includes(ability.cause?.event))
      errors.push({path: `${path}.cause`, message: "What causes it to trigger again is an event: enters, dies, attacks, or enters or leaves; or a spell's, cast or copy"});
    /* A restriction on attacking (CR 508.1c): whom, in its words, and a condition under which it does not apply. */
    if (ability.rule === "cant-attack") {
      if (ability.defender !== undefined && !CANT_ATTACK_DEFENDERS.includes(ability.defender))
        errors.push({path: `${path}.defender`, message: `Whom it can't attack is one of ${CANT_ATTACK_DEFENDERS.join(", ")}, or anyone when unsaid`});
      if (ability.unless !== undefined) for (const message of conditionProblems(ability.unless)) errors.push({path: `${path}.unless`, message});
    }
    /* "You or planeswalkers you control" (CR 506.3): a restriction on attacking its controller, or a tax on it, that reaches
       the planeswalkers they control too. Attacking one of those is not attacking them (rules/statics.mjs). */
    if (ability.planeswalkers !== undefined && (ability.planeswalkers !== true || !(ability.rule === "attack-tax" || (ability.rule === "cant-attack" && ability.defender === "you"))))
      errors.push({path: `${path}.planeswalkers`, message: "\"Or planeswalkers you control\" is planeswalkers: true, on a tax on attacking you or a restriction on attacking you"});
    /* "During combat, players can't cast spells or activate abilities that aren't mana abilities" (Yuriko, Blade of the
       Mighty; CR 506.1): `duringCombat` true, on a cast or an activation forbidden -- and an activation forbidden only then,
       its one built form (rules/statics.mjs, activationForbidden). */
    if (ability.duringCombat !== undefined && (ability.duringCombat !== true || !["cant-cast", "cant-activate"].includes(ability.rule)))
      errors.push({path: `${path}.duringCombat`, message: "\"During combat\" is duringCombat: true, on a cant-cast or cant-activate static"});
    /* Or of some permanents' abilities, mana abilities among them: "during your turn, your opponents can't ... activate
       abilities of artifacts, creatures, or enchantments" (Grand Abolisher, wave 4b; rules/statics.mjs,
       permanentActivationForbidden) -- `of` a selector of those permanents, during its controller's turn (`duringYourTurn:
       true`) or always ("activated abilities of artifacts can't be activated"). */
    const ofPermanents = ability.rule === "cant-activate" && ability.of !== undefined;
    if (ability.rule === "cant-activate" && !(ofPermanents ? [undefined, true].includes(ability.duringYourTurn) && ability.duringCombat === undefined
      : ability.duringCombat === true && ability.duringYourTurn === undefined))
      errors.push({path, message: "An activation forbidden is forbidden during combat (duringCombat: true), or of some permanents (`of`), always or during your turn (duringYourTurn: true): its two forms built"});
    if (ability.of !== undefined && ability.rule !== "cant-activate") errors.push({path: `${path}.of`, message: "`of`, the permanents whose abilities can't be activated, is a cant-activate static's"});
    if (ofPermanents) checkSelector(ability.of, `${path}.of`, errors, {choice: true});
    /* How many counters instead (CR 614.1a; rules/statics.mjs, placeCounters): "twice that many" `times`, "that many plus
       one" `plus`, "half that many, rounded down" `half` -- one of them -- and who must be putting them. */
    if (ability.rule === "more-counters") {
      if (["times", "plus", "half"].filter((key) => ability[key] !== undefined).length > 1)
        errors.push({path, message: "More counters instead is one of times, plus or half"});
      if (ability.times !== undefined && !(Number.isInteger(ability.times) && ability.times >= 0)) errors.push({path: `${path}.times`, message: "times is a whole number, 0 or more"});
      if (ability.plus !== undefined && !(Number.isInteger(ability.plus) && ability.plus !== 0)) errors.push({path: `${path}.plus`, message: "plus is a whole number, not 0: 1 for \"that many plus one\", -1 for \"that many minus one\""});
      if (ability.half !== undefined && ability.half !== true) errors.push({path: `${path}.half`, message: "half is true: half that many, rounded down"});
      if (ability.putBy !== undefined && !["you", "opponent"].includes(ability.putBy)) errors.push({path: `${path}.putBy`, message: "putBy is \"you\" or \"opponent\": who must be putting them"});
      /* A player's counters too: any player's ("on a permanent or player"), or its controller's ("or on yourself"); with
         `affects: {what: "player"}`, a player's alone ("if you would get one or more counters", Winding Constrictor). */
      if (ability.players !== undefined && ![true, "you"].includes(ability.players)) errors.push({path: `${path}.players`, message: "players is true (any player's counters too) or \"you\" (its controller's)"});
      if (ability.affects?.what === "player" && (ability.players === undefined || Object.keys(ability.affects).length !== 1))
        errors.push({path: `${path}.affects`, message: "A player's counters alone are affects {what: \"player\"}, and players says whose"});
      /* "If an effect would put" (Doubling Season): not counters put as a cost. */
      if (ability.byEffect !== undefined && ability.byEffect !== true) errors.push({path: `${path}.byEffect`, message: "byEffect is true: counters an effect puts, not a cost"});
    }
    /* "You may play two additional lands on each of your turns" (Azusa, Lost but Seeking; rules/actions.mjs, landDropsLeft):
       how many more, 1 or more -- one when unsaid. */
    if (ability.rule === "extra-land-drop" && ability.count !== undefined && !(Number.isInteger(ability.count) && ability.count >= 1))
      errors.push({path: `${path}.count`, message: "An additional land drop says how many: a whole number, 1 or more"});
    /* "Twice that many of those tokens instead" (rules/statics.mjs, tokensCreated): how many times, 2 or more. */
    if (ability.rule === "more-tokens" && !(Number.isInteger(ability.times) && ability.times >= 2))
      errors.push({path: `${path}.times`, message: "More tokens instead says how many times as many: a whole number, 2 or more"});
    /* "That many 5/5 red Dragon creature tokens with flying are created instead" of artifact tokens: the tokens it replaces
       by their card types, and the token made instead. */
    /* A token a replacement makes: a spec, or a predefined token by name (CR 111.10; "an additional Food token"), which the
       card's compiling gives its definition (cards/index.mjs). */
    const tokenSpec = (token) => Boolean(token) && (isText(token.predefined) ? Object.keys(token).length === 1 : isText(token.name) && Array.isArray(token.types));
    if (ability.rule === "tokens-instead") {
      if (Object.keys(ability.affects ?? {}).some((key) => key !== "types")) errors.push({path: `${path}.affects`, message: "The tokens made instead of others are told by their card types: affects {types}"});
      if (!tokenSpec(ability.token)) errors.push({path: `${path}.token`, message: "What is made instead is a token: {name, types, ...} or {predefined}"});
    }
    /* "Those tokens plus a 1/1 white Soldier creature token are created instead" of creature tokens (Queen Allenal), "plus an
       additional Treasure token" of Treasure tokens (Xorn), of any tokens (Peregrin Took): the tokens it adds to by their card
       types and subtypes, any unsaid, and the token it adds. */
    if (ability.rule === "tokens-plus") {
      if (Object.keys(ability.affects ?? {}).some((key) => !["types", "subtypes"].includes(key)) || Object.values(ability.affects ?? {}).some((v) => !Array.isArray(v) || !v.length))
        errors.push({path: `${path}.affects`, message: "The tokens another is added to are told by their card types and subtypes, or any token: affects {types?, subtypes?}"});
      if (!tokenSpec(ability.token)) errors.push({path: `${path}.token`, message: "What is added is a token: {name, types, ...} or {predefined}"});
      /* "Plus that many 1/1 green Squirrel creature tokens" (Chatterfang): as many as the event makes, not one. */
      if (ability.thatMany !== undefined && ability.thatMany !== true) errors.push({path: `${path}.thatMany`, message: "thatMany is true: as many added as the tokens it adds to"});
    }
    /* "If you would create a Clue, Food, or Treasure token, instead create one of each" (Academy Manufactor): the tokens it
       names, two or more predefined tokens (CR 111.10), each told by its subtype. */
    if (ability.rule === "tokens-each" && !(Array.isArray(ability.each) && ability.each.length >= 2 && ability.each.every((kind) => isText(kind?.predefined) && Object.keys(kind).length === 1)))
      errors.push({path: `${path}.each`, message: "One of each says which tokens: each, two or more [{predefined}]"});
    /* "Draw two cards instead" (Teferi's Ageless Insight; rules/statics.mjs, drawsMore): how many cards for each one, 2 or more,
       and the first card of the player's draw step left alone or not. */
    if (ability.rule === "draws-more") {
      if (!(Number.isInteger(ability.count) && ability.count >= 2)) errors.push({path: `${path}.count`, message: "More draws instead says how many cards for each: a whole number, 2 or more"});
      if (ability.exceptFirstInDrawStep !== undefined && ability.exceptFirstInDrawStep !== true) errors.push({path: `${path}.exceptFirstInDrawStep`, message: "exceptFirstInDrawStep is true"});
    }
    /* "Twice that much life instead" (rules/statics.mjs, lifeGained): how many times, 2 or more. */
    /* Or "that much life plus 1" (Bilbo, Birthday Celebrant; rules/statics.mjs, lifeGained): `plus`, 1 or more, in place of `times`. */
    if (ability.rule === "more-life" && ability.plus !== undefined) {
      if (!(Number.isInteger(ability.plus) && ability.plus >= 1 && ability.times === undefined))
        errors.push({path: `${path}.plus`, message: "More life plus some says how much more: plus, a whole number, 1 or more, and no times beside it"});
    } else if (["more-life", "more-life-loss"].includes(ability.rule) && !(Number.isInteger(ability.times) && ability.times >= 2))
      errors.push({path: `${path}.times`, message: "More life instead says how many times as much: a whole number, 2 or more"});
    /* A card's own restriction on casting it (Proft, Sinister Mastermind): what lets it be cast, a condition, said. */
    if (ability.rule === "cant-cast-self") {
      if (ability.unless === undefined) errors.push({path: `${path}.unless`, message: "\"You can't cast this spell unless ...\" says what: `unless`, a condition"});
      else for (const message of conditionProblems(ability.unless)) errors.push({path: `${path}.unless`, message});
    }
    /* What a chosen target must be for the spell to cost less (CR 601.2f): "if it targets an attacking creature" (Run Behind). */
    if (ability.rule === "this-costs-less" && ability.targeting !== undefined) checkSelector(ability.targeting, `${path}.targeting`, errors);
    /* "As though it had flash if it targets a commander" (Timely Ward): what it must target, a permanent, said. */
    if (ability.rule === "flash-if-targets") {
      if (!ability.targeting || typeof ability.targeting !== "object") errors.push({path: `${path}.targeting`, message: "Flash if it targets something says what (`targeting`, a selector of a permanent)"});
      else checkSelector({...ability.targeting, what: "permanent"}, `${path}.targeting`, errors);
    }
    /* "Spells your opponents cast that target this creature cost an additional 3 life to cast" (Terror of the Peaks, wave 4b;
       rules/statics.mjs, increasesOn): what one of a spell's chosen targets must be, and the increase in life (`life`, a whole
       number, 1 or more) in place of mana -- never beside an amount of mana. */
    if (ability.rule === "spells-cost-more" && ability.targeting !== undefined) checkSelector(ability.targeting, `${path}.targeting`, errors);
    if (ability.life !== undefined && !(ability.rule === "spells-cost-more" && ability.amount === undefined && Number.isInteger(ability.life) && ability.life >= 1))
      errors.push({path: `${path}.life`, message: "An increase in life (`life`, a whole number, 1 or more) is a spells-cost-more static's, in place of its mana `amount`"});
    /* "Can block only creatures with flying" (CR 509.1b): which attackers, a selector. */
    if (ability.rule === "can-block-only") {
      if (!ability.attackers || typeof ability.attackers !== "object") errors.push({path, message: "\"Can block only\" says which attackers: `attackers`, a selector"});
      else checkSelector(ability.attackers, `${path}.attackers`, errors, {choice: true});
    }
    if (ability.rule === "cant-be-blocked-by") {
      if (!ability.by && ability.byPowerBelowSource !== true) errors.push({path, message: "\"Can't be blocked by\" says by what: `by`, or `byPowerBelowSource`"});
      if (ability.by) checkSelector(ability.by, `${path}.by`, errors, {choice: true});
    }
  }

  if (ability.kind === "replacement") {
    if (!ability.watches?.event)
      errors.push({path: `${path}.watches`, message: "A replacement effect says which event it is watching for (CR 614)"});
    if (!ability.change && ability.prevent === undefined)
      errors.push({path: `${path}`, message: "A replacement effect either changes the event or prevents it"});
    /* What follows a prevention (CR 615.5, rules/replacement.mjs): effects held to the effect grammar, after a prevention
       only. A redirection (CR 614.9) goes to what its holder enchants. */
    const then = ability.change?.then;
    if (then !== undefined && (ability.change.prevent !== true || !Array.isArray(then) || then.length === 0))
      errors.push({path: `${path}.change.then`, message: "What follows a prevention is a list of effects, beside prevent: true"});
    if (Array.isArray(then)) then.forEach((effect, index) => checkEffect(effect, `${path}.change.then[${index}]`, errors));
    if (ability.change?.redirect !== undefined && ability.change.redirect !== "enchanted")
      errors.push({path: `${path}.change.redirect`, message: "Damage is redirected to \"enchanted\": what the holder enchants"});
    /* "Prevent 1 of that damage" (Hedron-Field Purists; CR 615.10): all of it (true), or that much of each damage event. */
    if (ability.change?.prevent !== undefined && !(ability.change.prevent === true || (Number.isInteger(ability.change.prevent) && ability.change.prevent >= 1)))
      errors.push({path: `${path}.change.prevent`, message: "A prevention prevents all the damage (true), or that much of it, a whole number, 1 or more"});
    /* "Prevent all but 1 of that damage" (Ajani Steadfast's emblem; rules/replacement.mjs): what is left, 1 or more. */
    if (ability.change?.preventAllBut !== undefined && !(Number.isInteger(ability.change.preventAllBut) && ability.change.preventAllBut >= 1))
      errors.push({path: `${path}.change.preventAllBut`, message: "\"Prevent all but N\" leaves N, a whole number, 1 or more"});
  }
}

function checkIdentity(identity, errors) {
  if (!identity || typeof identity !== "object") {
    errors.push({path: "identity", message: "A script carries the card's identity"});
    return;
  }
  if (!isText(identity.name)) errors.push({path: "identity.name", message: "A card has a name"});
  if (!isText(identity.oracleId))
    errors.push({path: "identity.oracleId", message: "A card carries its oracleId, which is how a definition is matched to a card at all"});
  if (!Array.isArray(identity.types) || identity.types.length === 0)
    errors.push({path: "identity.types", message: "A card has at least one type"});
  if (identity.manaCost !== undefined && identity.manaCost !== null && typeof identity.manaCost !== "string")
    errors.push({path: "identity.manaCost", message: "A mana cost is the printed text, or null for a card with none"});
  /* A planeswalker's printed loyalty (CR 306.5a). */
  if (identity.loyalty !== undefined && identity.loyalty !== null && !(Number.isInteger(identity.loyalty) && identity.loyalty >= 0))
    errors.push({path: "identity.loyalty", message: "A planeswalker's loyalty is its printed number, 0 or more"});
}

/**
 * Check a card definition.
 *
 * @returns {{valid: boolean, errors: Array<{path: string, message: string}>}} every problem, each
 *   saying where it is, because the compiler retries against them.
 */
export function validateScript(script) {
  const errors = [];
  if (!script || typeof script !== "object") {
    return {valid: false, errors: [{path: "", message: "A card script is an object"}]};
  }
  if (script.schema !== SCRIPT_SCHEMA)
    errors.push({path: "schema", message: `A card script names its schema as ${SCRIPT_SCHEMA}, not ${JSON.stringify(script.schema)}`});

  checkIdentity(script.identity, errors);

  if (!Array.isArray(script.abilities)) {
    errors.push({path: "abilities", message: "A script has an abilities list, empty for a vanilla card"});
  } else {
    const permanent = Array.isArray(script.identity?.types) && !script.identity.types.some((t) => t === "Instant" || t === "Sorcery");
    /* {X} in its mana cost (CR 107.3): a spell whose targets may be "up to X" (Crackle with Power). */
    const manaX = /\{X\}/.test(String(script.identity?.manaCost ?? ""));
    script.abilities.forEach((ability, index) => checkAbility(ability, `abilities[${index}]`, errors, {permanent, manaX}));
  }

  /* A NONMODAL DOUBLE-FACED CARD (CR 712.2): one that transforms says so, `layout: "transform"`, beside its back face; a
     double-faced card that does not say is a modal one (712.3). */
  if (script.layout !== undefined && (script.layout !== "transform" || script.back === undefined))
    errors.push({path: "layout", message: "A double-faced card that transforms says layout: \"transform\", with its back face; a modal one says nothing"});
  /* A DOUBLE-FACED CARD'S BACK FACE (CR 712.3, 712.8): its own identity and abilities, the card's oracle id. */
  if (script.back !== undefined) {
    const back = script.back;
    if (!back || typeof back !== "object" || !Array.isArray(back.abilities)) errors.push({path: "back", message: "A back face is an identity and a list of abilities"});
    else {
      const before = errors.length;
      checkIdentity({...back.identity, oracleId: back.identity?.oracleId ?? script.identity?.oracleId}, errors);
      for (const e of errors.slice(before)) e.path = `back.${e.path}`;
      back.abilities.forEach((ability, index) => checkAbility(ability, `back.abilities[${index}]`, errors));
    }
  }

  /* AN ADVENTURER CARD'S ADVENTURE (CR 715.2): its own identity -- an instant or sorcery with the subtype Adventure -- its
     own oracle text and abilities, the card's oracle id. Never beside a back face: a card is one layout or the other. */
  if (script.adventure !== undefined) {
    const adventure = script.adventure;
    if (!adventure || typeof adventure !== "object" || !Array.isArray(adventure.abilities)) errors.push({path: "adventure", message: "An Adventure is an identity and a list of abilities"});
    else {
      const before = errors.length;
      checkIdentity({...adventure.identity, oracleId: adventure.identity?.oracleId ?? script.identity?.oracleId}, errors);
      for (const e of errors.slice(before)) e.path = `adventure.${e.path}`;
      const types = adventure.identity?.types ?? [];
      if (!(types.length === 1 && ["Instant", "Sorcery"].includes(types[0])) || !(adventure.identity?.subtypes ?? []).includes("Adventure"))
        errors.push({path: "adventure.identity", message: "An Adventure is an instant or a sorcery with the subtype Adventure (CR 715.2)"});
      adventure.abilities.forEach((ability, index) => checkAbility(ability, `adventure.abilities[${index}]`, errors));
    }
    if (script.back !== undefined) errors.push({path: "adventure", message: "A card is an adventurer card or a double-faced card, not both"});
  }

  /* A PREPARATION CARD'S PREPARE SPELL (CR 722.2): its own identity, oracle text and abilities, the card's oracle id. One
     layout per card. */
  if (script.prepare !== undefined) {
    const prepare = script.prepare;
    if (!prepare || typeof prepare !== "object" || !Array.isArray(prepare.abilities)) errors.push({path: "prepare", message: "A prepare spell is an identity and a list of abilities"});
    else {
      const before = errors.length;
      checkIdentity({...prepare.identity, oracleId: prepare.identity?.oracleId ?? script.identity?.oracleId}, errors);
      for (const e of errors.slice(before)) e.path = `prepare.${e.path}`;
      prepare.abilities.forEach((ability, index) => checkAbility(ability, `prepare.abilities[${index}]`, errors));
    }
    if (script.back !== undefined || script.adventure !== undefined) errors.push({path: "prepare", message: "A card is a preparation card, an adventurer card or a double-faced card: one of them"});
  }

  return {valid: errors.length === 0, errors};
}

/**
 * Check, and throw with everything that is wrong.
 *
 * The loud form, for a caller that has no way to recover — the runtime loading a committed
 * definition, rather than the compiler working one out.
 */
export function assertScript(script) {
  const {valid, errors} = validateScript(script);
  if (valid) return script;
  const detail = errors.map((e) => `${e.path}: ${e.message}`).join("; ");
  throw new Error(`${script?.identity?.name ?? "A card"} is not a valid ${SCRIPT_SCHEMA} — ${detail}`);
}
