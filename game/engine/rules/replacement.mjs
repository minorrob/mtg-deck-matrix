/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* REPLACEMENT AND PREVENTION: CR 614, 615, 616.
 *
 * `docs/engine/PLAN.md` §3.3, eighth row — "affected object's controller orders (616.1)".
 *
 * A REPLACEMENT EFFECT IS NOT A TRIGGER, and the difference is the whole file. It does not use the
 * stack, nobody receives priority, and it cannot be responded to. It waits for an event that WOULD
 * happen and changes it before it does, so the original never occurs: a creature that would die and
 * is exiled instead DID NOT DIE, and nothing that watches for deaths sees one. Modeling it as a
 * trigger that undoes the event afterwards produces a game where "whenever a creature dies" fires
 * on creatures that never died, and where the board reports a death it then has to take back.
 *
 * So the rules modules raise a PROPOSAL — "this is about to happen" — and pass it through here
 * before doing anything. The event they finally report is the replaced one.
 *
 * EACH EFFECT APPLIES ONCE TO A GIVEN EVENT (CR 614.5). Without it two effects that each rewrite a
 * zone change can pass the event back and forth without end. That is a hang, not a wrong answer,
 * and a hang inside state-based actions is the kind nothing can report.
 *
 * WHEN SEVERAL APPLY, THE AFFECTED OBJECT'S CONTROLLER CHOOSES (CR 616.1) — not the effects'
 * controllers, and not the engine. The player whose creature is about to be replaced out of
 * existence picks which replacement happens first, and the order decides the outcome whenever the
 * first removes the second's opportunity -- and ONLY then: when every order ends the same way (two players' "exile it
 * instead") the first applies and nobody is asked, because there is nothing to choose (sameEnd).
 *
 * DAMAGE IS ASKED BEFORE ANY OF IT IS DEALT. When several effects apply to one damage event and the orders end
 * differently -- Torbran's "plus 2" and a doubler, a prevention that counts what it stopped (The Mindskinner) and a doubler
 * -- the player dealt it, or the controller of the permanent dealt it, chooses which applies first (CR 616.1). The two
 * places damage is dealt ask first and deal afterwards: a damage effect in a resolution (script/effects/asking.mjs,
 * orderDamage) and the combat damage step (rules/combat.mjs, "order-damage"), each answer kept by the hit it belongs to
 * (`hitKey`) and replayed through `applyReplacements`'s `orders`. Each option says what it leads to ("11 damage", "8 to 12
 * damage"). Damage dealt where nothing can stop to ask -- an effect run directly (what repeats for each player, what
 * follows a prevention, a mana ability's) -- keeps the order that leaves the least (leastFirst): the order the player
 * dealt it chooses on all but rare boards. NAMED: a zone change whose orders end differently is asked, but the move does
 * not yet pause for the answer: no two such effects are among the definitions (one card, Liesa, replaces a zone change),
 * so nothing reaches it today.
 *
 * PREVENTION IS A SHIELD THAT WEARS OUT (CR 615.1), so applying it writes back what is left.
 *
 * WHAT IS DEFERRED AND NAMED: self-replacement effects, which apply before others (CR 614.15), and
 * "as this enters" effects (CR 614.1c) both need the card script to express them; the choice here
 * already has the shape they will slot into. Prevention shields are held on the permanent that
 * grants them, which is right for a static shield and will need the continuous-effect machinery of
 * 1.8 for one that lasts "this turn" and then goes away.
 */

import {compileSelector, matchesSelector} from "../script/filter.mjs";
import {amountOf, isCounted} from "../script/amount.mjs";
import {chosenFor} from "../script/chosen.mjs";

/* "This land enters tapped unless you control a Forest or a Plains" (a check land), "... unless you control two or
   fewer other lands" (a fast land): the arrival's `unless`, read as the land is about to enter -- so the land itself,
   not yet there, is never one of the permanents counted. `controls` is a selector or `{anyOf: [...]}`; at least `min`
   (default 1) and at most `max` of them, controlled by the player whose permanent is entering. */
function unlessHolds(state, unless, player) {
  if (!unless) return false;
  /* "Unless you have two or more opponents": the players still in the game besides this one. */
  if (unless.opponents) {
    const opponents = state.players.filter((p) => p.id !== player && !p.lost).length;
    return opponents >= (unless.opponents.min ?? 1) && (unless.opponents.max === undefined || opponents <= unless.opponents.max);
  }
  const alternatives = Array.isArray(unless.controls?.anyOf) ? unless.controls.anyOf : [unless.controls ?? {}];
  const matchers = alternatives.map((selector) => compileSelector({...selector, controller: "you"}));
  const count = state.zones.battlefield.filter((id) => matchers.some((m) => m(state, id, {controller: player}))).length;
  return count >= (unless.min ?? 1) && (unless.max === undefined || count <= unless.max);
}

/** Where an effect has to be for it to act on the battlefield (CR 113.6). */
const ACTING_ZONES = ["battlefield"];

/* CR 614.5 is per effect, and two permanents' effects may share an ability id ("a1" on each card): which effect it is, by
   who holds it. `applied` reports the ability ids; this is what decides. */
const appliedKey = (holderId, ability) => `${holderId ?? "self"}:${ability.id}`;

/* Whether this effect applies to this proposal, given what has already applied to it. */
function applies(state, ability, holder, proposal) {
  if (ability.kind !== "replacement") return false;
  /* CR 614.5: once per event, whatever else is true. */
  if ((proposal.appliedBy ?? []).includes(appliedKey(holder?.id ?? null, ability))) return false;
  const watches = ability.watches ?? {};
  if (watches.event !== proposal.event) return false;

  if (proposal.event === "enters") {
    /* `who: "self"` is the permanent's own arrival ability. `holder` is null for it, because at
       this moment the permanent is NOT on the battlefield to be a holder — see `applicable`. */
    /* "This creature escapes with two +1/+1 counters on it" (CR 702.138c): "if it escaped, it enters with them" --
       `escaped`, only when the spell it was cast with escape (rules/stack.mjs). */
    if (watches.who === "self") return holder === null && !unlessHolds(state, watches.unless, proposal.player) && (watches.escaped !== true || proposal.escaped === true);
    if (holder === null) return false;
    if (watches.types && !watches.types.every((type) => (proposal.types ?? []).includes(type))) return false;
    if (watches.controller === "controller" && proposal.player !== holder.controller) return false;
    /* "Each other creature you control of the chosen type enters with an additional +1/+1 counter" (Metallic Mimic): what
       is entering, as it is now (a spell, or a card elsewhere), "you" and "the chosen type" the holder's. */
    if (watches.filter) {
      const entering = state.objects[proposal.objectId];
      if (!entering) return false;
      const what = entering.zone === "stack" ? "spell" : "card";
      if (!compileSelector({...chosenFor(watches.filter, holder), what, ...(what === "card" ? {zone: entering.zone} : {})})(state, proposal.objectId, {controller: holder.controller, source: holder.id})) return false;
    }
    return true;
  }

  if (proposal.event === "zone-change") {
    if (watches.from && watches.from !== proposal.from) return false;
    if (watches.to && watches.to !== proposal.to) return false;
    /* "If a creature an opponent controls would die" (Liesa): what is moving, as it is now, "you" the holder's controller. */
    if (watches.filter && !(holder && compileSelector(watches.filter)(state, proposal.objectId, {controller: holder.controller, source: holder.id}))) return false;
    return true;
  }

  if (proposal.event === "damage") {
    /* Damage changed, not a shield (Dictate of the Twin Gods, Torbran, Dolmen Gate): what deals it, to what. */
    if (ability.change) return damageWatched(state, watches, holder, proposal);
    /* A spent shield is not an applicable effect, so it is neither applied nor offered as a
       choice — a player asked to order two effects where one would do nothing is being asked a
       question that is not really a question. */
    if ((ability.prevent ?? 0) <= 0) return false;
    if (watches.toPlayer === "controller" && proposal.toPlayer !== holder.controller) return false;
    if (Number.isInteger(watches.toPlayer) && proposal.toPlayer !== watches.toPlayer) return false;
    return true;
  }

  return false;
}

/* WHAT A DAMAGE CHANGE WATCHES, read as the damage is about to be dealt, "you" its holder's controller:
   - `source`, a description of what deals it -- "a source you control", "a red source you control", "a creature you
     control" -- read where the source is (a permanent, a spell on the stack);
   - `to` "opponent": "to an opponent or a permanent an opponent controls";
   - `toPlayer` "opponent" or "you": to that player only -- "a source you control would deal damage to an opponent" (The
     Mindskinner), "all damage that would be dealt to you" (Pariah; batch 71);
   - `toCard`, a description of the permanent dealt it ("attacking creatures you control");
   - `combat` true or false: combat damage only, or noncombat only. */
function damageWatched(state, watches, holder, proposal) {
  if (!holder) return false;
  const you = holder.controller, context = {controller: you, source: holder.id};
  if (watches.combat === true && proposal.combat !== true) return false;
  if (watches.combat === false && proposal.combat === true) return false;
  if (watches.source) {
    const source = proposal.sourceId === null || proposal.sourceId === undefined ? null : state.objects[proposal.sourceId];
    if (!source) return false;
    const what = source.zone === "battlefield" ? "permanent" : source.zone === "stack" ? "spell" : "card";
    if (!compileSelector({...watches.source, what, ...(what === "card" ? {zone: source.zone} : {})})(state, proposal.sourceId, context)) return false;
  }
  const toPlayer = proposal.toPlayer !== undefined && proposal.toPlayer !== null ? proposal.toPlayer : null;
  if (watches.to === "opponent") {
    const whose = toPlayer !== null ? toPlayer : state.objects[proposal.toCard]?.controller ?? null;
    if (whose === null || whose === you) return false;
  }
  if (watches.toPlayer === "opponent" && (toPlayer === null || toPlayer === you)) return false;
  if (watches.toPlayer === "you" && toPlayer !== you) return false;
  if (watches.toCard && !(toPlayer === null && state.objects[proposal.toCard] && compileSelector({what: "permanent", ...watches.toCard})(state, proposal.toCard, context))) return false;
  return true;
}

/* What one effect would do to an amount of damage, done to nothing: for choosing an order (leastFirst). */
function damageAfter(ability, amount) {
  if (Number.isInteger(ability.prevent)) return Math.max(0, amount - ability.prevent);
  const change = ability.change ?? {};
  if (change.prevent === true) return 0;
  if (Number.isInteger(change.multiply)) return amount * change.multiply;
  if (Number.isInteger(change.add)) return amount + change.add;
  return amount;
}
const leastOf = (candidates, amount) => Math.min(...candidates.map((c) => {
  const rest = candidates.filter((other) => other !== c);
  return rest.length ? leastOf(rest, damageAfter(c.ability, amount)) : damageAfter(c.ability, amount);
}));
/* The effect to apply first so that the order leaves the least damage; the first listed of equals. */
function leastFirst(candidates, amount) {
  let best = candidates[0], least = Infinity;
  for (const c of candidates) {
    const rest = candidates.filter((other) => other !== c);
    const after = rest.length ? leastOf(rest, damageAfter(c.ability, amount)) : damageAfter(c.ability, amount);
    if (after < least) { best = c; least = after; }
  }
  return best;
}

/* Every effect that could apply right now, each with the object holding it.
 *
 * THE ENTERING PERMANENT'S OWN ABILITIES ARE READ FIRST, AND FROM NOWHERE (CR 614.12, 614.15). A
 * land that enters tapped says so with its own ability, and at the moment that ability has to be
 * read the land is a card in a hand or on the stack — it is not on the battlefield, so the scan
 * below cannot find it. The proposal carries the abilities of the thing about to arrive, and they
 * are put at the head of the list because a self-replacement applies before anybody else's (CR
 * 614.15), which is what stops the order being a choice nobody should have to make. */
function applicable(state, proposal) {
  const found = [];
  for (const ability of proposal.entering?.abilities ?? []) {
    if (applies(state, ability, null, proposal)) found.push({holderId: null, ability});
  }
  /* The copied card's own, alone (ownEntering): the others' applied as it entered. */
  if (proposal.ownOnly) return found;
  for (const zone of ACTING_ZONES) {
    for (const id of state.zones[zone]) {
      const holder = state.objects[id];
      for (const ability of holder.abilities ?? []) {
        if (applies(state, ability, holder, proposal)) found.push({holderId: id, ability});
      }
    }
  }
  return found;
}

/* Whether a "prevent all damage ... this turn" effect stops this damage: `affects.ids` the objects it is about (fixed as it
   began, as the card says "that creature" or "those permanents"), `apply.to` damage dealt to them (the default),
   `apply.by` damage they deal, `apply.combat` combat damage only. A new object is not one of them (CR 400.7). */
function preventedForAWhile(state, proposal) {
  return (state.effects ?? []).some((effect) => {
    if (effect.rule !== "prevent-damage") return false;
    const ids = effect.affects?.ids;
    /* Fixed objects ("that creature"), or a description read as the damage is dealt ("creatures your opponents control",
       Obscuring Haze): a prevention effect is not one CR 611.2c fixes, so a creature that arrives later is one of them. */
    const among = (id) => (Array.isArray(ids) ? ids.includes(id) : Boolean(effect.affects) && state.objects[id]?.zone === "battlefield"
      && matchesSelector({what: "permanent", ...effect.affects}, state, id, {controller: effect.sourceController}));
    const how = effect.apply ?? {};
    if (how.combat === true && proposal.combat !== true) return false;
    return (how.to !== false && proposal.toCard !== undefined && proposal.toCard !== null && among(proposal.toCard))
      || (how.by === true && proposal.sourceId !== undefined && proposal.sourceId !== null && among(proposal.sourceId));
  });
}

/**
 * A REGENERATION SHIELD, USED (CR 701.19a): destruction replaced -- "instead remove all damage marked on it and tap it. If
 * it's an attacking or blocking creature, remove it from combat." One shield, one destruction; the shield made this turn
 * is gone at its end (turn.mjs cleanup, `until: "end-of-turn"`). Called where a permanent would be DESTROYED -- the
 * destroy effects, and the state-based actions for lethal damage and deathtouch -- and never for toughness zero or less
 * (704.5f) or a sacrifice, which are not destruction. Returns whether it was regenerated.
 */
export function regenerated(state, id, events = []) {
  const at = (state.effects ?? []).findIndex((e) => e.rule === "regeneration" && (e.affects?.ids ?? []).includes(id));
  const object = state.objects[id];
  if (at < 0 || !object) return false;
  state.effects.splice(at, 1);
  object.damage = 0;
  object.deathtouched = false;
  if (!object.tapped) {
    object.tapped = true;
    events.push({kind: "GameEventCardTapped", data: {turn: state.turn, phase: state.phase, fields: {card: {cardId: id, name: object.card, owner: object.owner, controller: object.controller}, tapped: true}}});
  }
  if (state.combat?.attacks) {
    state.combat.attacks = state.combat.attacks.filter((attack) => attack.attacker !== id);
    for (const attack of state.combat.attacks) if (attack.blockers) attack.blockers = attack.blockers.filter((b) => b !== id);
  }
  events.push({kind: "GameEventCardRegenerated", data: {turn: state.turn, phase: state.phase, fields: {card: {cardId: id, name: object.card, owner: object.owner, controller: object.controller}}}});
  return true;
}

/** Who chooses the order (CR 616.1): the affected object's controller, or the affected player. */
function affectedPlayer(state, proposal) {
  if (proposal.event === "enters") return proposal.player ?? null;
  if (proposal.event === "damage") return proposal.toPlayer ?? state.objects[proposal.toCard]?.controller ?? null;
  if (proposal.objectId !== undefined) return state.objects[proposal.objectId]?.controller ?? proposal.player ?? null;
  return proposal.player ?? null;
}

/* `dry` tries the effect without spending anything: a shield is worn out only when the damage is dealt (CR 615.1), not when
   an order is tried or a question is built. */
function applyOne(state, {holderId, ability}, proposal, dry = false) {
  const next = {...proposal, applied: [...(proposal.applied ?? []), ability.id], appliedBy: [...(proposal.appliedBy ?? []), appliedKey(holderId, ability)]};

  if (ability.change?.to) next.to = ability.change.to;

  /* CR 614.12: modifying how a permanent ENTERS, rather than where a card goes. The permanent is
     not on the battlefield yet, so these land on the proposal and the caller applies them as part
     of putting it there -- which is what makes it one event rather than a permanent that arrives
     and is then tapped. */
  if (ability.change?.entersTapped === true) next.tapped = true;
  /* "As this land enters, you may pay 2 life. If you don't, it enters tapped": tapped unless paid, and the payment is
     a question for its controller once it is there (rules/entering.mjs). */
  if (ability.change?.unlessPay) next.asks = [...(next.asks ?? []), {...ability.change.unlessPay}];
  /* "As this land enters, you may reveal an Island or Swamp card from your hand. If you don't, it enters tapped." */
  if (ability.change?.unlessReveal) next.asks = [...(next.asks ?? []), {reveal: structuredClone(ability.change.unlessReveal)}];
  /* "As this artifact enters, choose a creature type", "choose Khans or Dragons": a question for its controller once it is
     there, the answer kept as the permanent's `chosen` (rules/entering.mjs). */
  if (ability.change?.choose) next.asks = [...(next.asks ?? []), {choose: structuredClone(ability.change.choose)}];
  /* "You may have this creature enter as a copy of any creature on the battlefield" (CR 614.1c, 707.9): which one is asked
     once it is there, its arrival waiting for the answer (rules/entering.mjs) -- "except", "until end of turn", "tapped". */
  if (ability.change?.copyOf) next.asks = [...(next.asks ?? []), {copyOf: structuredClone(ability.change.copyOf),
    copy: {except: structuredClone(ability.change.except ?? {}), keep: [...(ability.change.keep ?? [])], until: ability.change.until ?? null, tapped: ability.change.tapped === true}}];
  if (ability.change?.entersWithCounters) {
    const {counter, count} = ability.change.entersWithCounters;
    /* "With X +1/+1 counters on it" (CR 107.3m: the X paid to cast it), "a +1/+1 counter for each Zombie card in your
       graveyard", "X, where X is the greatest power among other creatures you control": counted as it is about to enter,
       "you" its controller. */
    const n = isCounted(count) ? amountOf(state, count, {controller: proposal.player, source: proposal.objectId, x: proposal.x ?? 0}) : count;
    next.counters = {...(next.counters ?? {})};
    if (n > 0) next.counters[counter] = (next.counters[counter] ?? 0) + n;
  }

  /* "It deals double that damage instead", "triple", "that much damage plus 2", "prevent all combat damage that would be
     dealt to attacking creatures you control". All of it prevented, the event does not happen (CR 615.4). */
  if (ability.change && proposal.event === "damage") {
    if (Number.isInteger(ability.change.multiply)) next.amount *= ability.change.multiply;
    if (Number.isInteger(ability.change.add)) next.amount += ability.change.add;
    /* "Prevent that damage and each opponent mills that many cards" (The Mindskinner), "prevent that damage. Put a +1/+1
       counter on that creature for each 1 damage prevented this way" (Vigor): what follows the prevention, part of the
       same replacement (CR 615.5), done by the damage's dealer once the event is settled (`followUps`) -- about the
       permanent or player it would have been dealt to, "that many" the damage stopped (amount.mjs, damagePrevented). */
    if (ability.change.prevent === true && Array.isArray(ability.change.then) && next.amount > 0) {
      const holder = state.objects[holderId];
      next.followUps = [...(next.followUps ?? []), {effects: structuredClone(ability.change.then), context: {controller: holder.controller, source: holderId,
        about: {...(proposal.toCard !== undefined && proposal.toCard !== null ? {card: proposal.toCard} : {}), ...(proposal.toPlayer !== undefined && proposal.toPlayer !== null ? {player: proposal.toPlayer} : {}), amount: next.amount}}}];
    }
    if (ability.change.prevent === true) next.amount = 0;
    /* REDIRECTION (CR 614.9): "all damage that would be dealt to you is dealt to enchanted creature instead" (Pariah) -- the
       same damage, to the permanent its holder enchants, while it enchants one; the rest of the replacements then look
       at the damage as it now is. */
    if (ability.change.redirect === "enchanted") {
      const host = state.objects[holderId]?.attachedTo;
      if (host !== null && host !== undefined && state.objects[host]?.zone === "battlefield") { next.toPlayer = null; next.toCard = host; }
    }
    if (next.amount === 0) next.prevented = true;
  }

  if (Number.isInteger(ability.prevent) && proposal.event === "damage") {
    const stopped = Math.min(ability.prevent, next.amount);
    next.amount -= stopped;
    /* The shield wears out on the object itself, so what is left is part of the game state and
       survives a checkpoint like everything else. */
    const live = state.objects[holderId].abilities.find((a) => a.id === ability.id);
    if (!dry) live.prevent -= stopped;
    /* CR 615.4: an event whose whole effect is prevented does not happen. Saying so on the
       proposal keeps a caller from reporting zero damage as damage. */
    if (next.amount === 0) next.prevented = true;
  }

  return next;
}

/**
 * Run a proposal through every replacement and prevention effect that applies.
 *
 * @param {object} proposal  `{event: "zone-change"|"damage", …}` — what is about to happen
 * @param {{orders?: string[], askable?: boolean, dry?: boolean}} [how]  for damage (CR 616.1): `orders` the affected
 *   player's answers so far, in the order asked, each the effect they chose to apply first (`candidateKey`); `askable`
 *   when the caller can stop to ask, so the next unanswered choice comes back as `question` with nothing applied past it;
 *   `dry` to try it without spending a shield
 * @returns {{proposal: object, applied: Array<string>, awaiting: boolean, question?: object}}
 *   `awaiting` is true when more than one effect applied at once and the affected player has been
 *   asked which goes first (CR 616.1). The caller stops, the driver answers, and
 *   `resolveReplacementOrder` finishes the job. `question` is damage's: `{player, proposal, options}`, the options
 *   candidate keys, for the caller to ask and replay with the answer added to `orders`.
 */
export function applyReplacements(state, proposal, {orders = [], askable = false, dry = false} = {}) {
  let current = {...proposal, applied: proposal.applied ?? []};
  let used = 0;

  /* PREVENTION FOR A WHILE (CR 615): "prevent all combat damage that would be dealt to and dealt by that creature this
     turn" (Maze of Ith), "prevent all damage that would be dealt to those permanents this turn" (Mutational Advantage)
     -- an effect with a duration (`rule: "prevent-damage"`, effects/permanents.mjs's effectUntil). It prevents all of
     the damage, so nothing is left for another effect to apply to, and there is no order to ask (CR 616.1). */
  if (proposal.event === "damage" && preventedForAWhile(state, current))
    return {proposal: {...current, amount: 0, prevented: true}, applied: current.applied, awaiting: false};

  /* Each round finds what still applies to the event AS IT NOW IS, which is what makes an effect
     that rewrites the destination able to bring a different effect into play. Bounded by CR 614.5:
     the applied list only grows, so this cannot run longer than there are effects. */
  for (let guard = 0; guard < 64; guard += 1) {
    const candidates = applicable(state, current);
    if (candidates.length === 0) break;
    /* Damage (CR 616.1): no question when every order ends the same (two doublers); the answer given, when there is one;
       asked, when the caller can stop; the order that leaves the least, when it cannot (above). */
    if (candidates.length > 1 && current.event === "damage") {
      if (sameEnd(state, current)) { current = applyOne(state, candidates[0], current, dry); continue; }
      const answered = orders[used] === undefined ? undefined : candidates.find((c) => candidateKey(c) === orders[used]);
      if (answered) { used += 1; current = applyOne(state, answered, current, dry); continue; }
      if (askable) return {proposal: current, applied: current.applied, awaiting: false, question: {player: affectedPlayer(state, current), proposal: current, options: candidates.map(candidateKey)}};
      current = applyOne(state, leastFirst(candidates, current.amount), current, dry);
      continue;
    }
    /* Entering: each adds its own part -- tapped, counters, a question asked once it is there -- and in any order the
       permanent enters the same way, so nobody is asked (CR 616.1; a Clone entering beside "each creature you control
       enters with an additional +1/+1 counter"). */
    if (candidates.length > 1 && current.event === "enters") { current = applyOne(state, candidates[0], current, dry); continue; }
    /* CR 616.1 gives the affected player the order, and the order matters only when the orders end differently: two
       players' "exile it instead" (Liesa) exile it either way, so the first applies and nobody is asked. Asking there had
       left a question nothing could answer, and the game stopped. */
    if (candidates.length > 1 && sameEnd(state, current)) { current = applyOne(state, candidates[0], current, dry); continue; }
    if (candidates.length > 1) {
      state.awaiting = {kind: "order-replacements", player: affectedPlayer(state, current), proposal: current};
      return {proposal: current, applied: current.applied, awaiting: true};
    }
    current = applyOne(state, candidates[0], current, dry);
  }

  return {proposal: current, applied: current.applied, awaiting: false};
}

/**
 * How a permanent about to enter the battlefield is modified (CR 614.12).
 *
 * Asked BEFORE the card moves, because the abilities that answer it belong to the card as it is
 * now — once it has moved it is a new object (CR 400.7). The caller applies the answer as part of
 * putting the permanent down, which is what makes entering tapped ONE event: there is no moment
 * where it is on the battlefield untapped, so nothing that watches for tapping sees anything.
 *
 * @returns {{tapped: boolean, counters: object}}
 */
export function enteringModifications(state, {objectId, player, types, abilities, x = 0, escaped = false}) {
  const {proposal} = applyReplacements(state, {
    event: "enters", objectId, player, types: types ?? [], x, escaped,
    entering: {abilities: abilities ?? []},
    tapped: false, counters: {},
  });
  /* A planeswalker enters with as many loyalty counters as its printed loyalty (CR 306.5b): a replacement every
     planeswalker has. */
  const counters = {...(proposal.counters ?? {})}, loyalty = state.objects[objectId]?.loyalty;
  if ((types ?? []).includes("Planeswalker") && Number.isInteger(loyalty)) counters.loyalty = (counters.loyalty ?? 0) + loyalty;
  return {tapped: proposal.tapped === true, counters, asks: proposal.asks ?? []};
}

/**
 * What a permanent that has just entered as a copy gets from the copied card's own "as this enters" (CR 614.12, 707.9):
 * "this land enters tapped", "with N counters", "as this enters, choose a creature type" -- its own abilities alone, the
 * others' having applied as it entered; never "enter as a copy" again.
 *
 * @returns {{tapped: boolean, counters: object, asks: Array}}
 */
export function ownEntering(state, {objectId, player, types, abilities}) {
  const own = (abilities ?? []).filter((ability) => !ability.change?.copyOf);
  const {proposal} = applyReplacements(state, {event: "enters", objectId, player, types: types ?? [], x: 0, entering: {abilities: own}, tapped: false, counters: {}, ownOnly: true});
  return {tapped: proposal.tapped === true, counters: proposal.counters ?? {}, asks: proposal.asks ?? []};
}

/* How an event ends under every order of the effects that apply to it (CR 616.1f: each applied, then what still applies),
   and whether that is one way. Tried dry, so trying each order spends nothing. A damage event ends in how much, to whom,
   and how much a prevention that counts it stopped ("mills that many"). */
const endOf = (p) => JSON.stringify({to: p.to ?? null, tapped: p.tapped === true, counters: p.counters ?? {}, asks: p.asks ?? [],
  amount: p.amount ?? null, toPlayer: p.toPlayer ?? null, toCard: p.toCard ?? null, counted: (p.followUps ?? []).map((f) => f.context.about?.amount ?? null)});
function ends(state, proposal, out = new Set(), depth = 0) {
  const candidates = depth < 8 ? applicable(state, proposal) : [];
  if (!candidates.length) { out.add(endOf(proposal)); return out; }
  for (const candidate of candidates) ends(state, applyOne(state, candidate, proposal, true), out, depth + 1);
  return out;
}
const sameEnd = (state, proposal) => ends(state, proposal).size === 1;

/** Whether two or more effects that change damage are where they act: with fewer, no order of them is anyone's to choose. */
export function damageChoicesPossible(state) {
  let n = 0;
  for (const id of state.zones.battlefield)
    for (const ability of state.objects[id]?.abilities ?? [])
      if (ability.kind === "replacement" && ability.watches?.event === "damage" && (n += 1) >= 2) return true;
  return false;
}

/** Which effect a candidate is, as an answer names it: its holder and ability (CR 614.5 is per effect). */
export const candidateKey = ({holderId, ability}) => appliedKey(holderId, ability);

/** Which hit of a damage effect or a combat damage step an answer belongs to: what deals it, to whom. */
export const hitKey = (sourceId, toPlayer, toCard) =>
  `${sourceId ?? "-"}>${toPlayer !== undefined && toPlayer !== null ? `p${toPlayer}` : `c${toCard}`}`;

/* The range of a list of numbers, said: "11", "8 to 12". */
const range = (list) => { const lo = Math.min(...list), hi = Math.max(...list); return lo === hi ? `${lo}` : `${lo} to ${hi}`; };

/**
 * The choice for CR 616.1 over damage: which of the effects that would change it applies first, asked of the player dealt
 * it or the controller of the permanent dealt it. `awaiting` carries the damage as it now is (`proposal`) and the
 * candidates (`options`, candidate keys). Each option is said by where it leads -- "Fiery Emancipation first: 11
 * damage", "The Mindskinner first: 0 damage, 3 prevented", "Pariah first: 3 damage to Bear" -- the effect's own words
 * being on its card; `leaves` is the least damage it can end in, for a pilot.
 */
export function damageOrderChoice(state, awaiting) {
  const {proposal} = awaiting;
  const byKey = new Map(applicable(state, proposal).map((c) => [candidateKey(c), c]));
  const nameOf = (e) => (e.toPlayer !== null ? state.players[e.toPlayer]?.name : state.objects[e.toCard]?.card) ?? "it";
  const target = nameOf({toPlayer: proposal.toPlayer ?? null, toCard: proposal.toCard ?? null});
  const from = state.objects[proposal.sourceId]?.card;
  /* Index for index with `awaiting.options`, which the answer is read against. */
  const options = awaiting.options.map((key, index) => {
    const candidate = byKey.get(key);
    if (!candidate) return {index, label: "An effect no longer there", leaves: proposal.amount, key};
    const endings = [...ends(state, applyOne(state, candidate, proposal, true))].map((e) => JSON.parse(e));
    const amounts = endings.map((e) => e.amount ?? 0), counted = endings.flatMap((e) => e.counted).filter((n) => n !== null);
    const where = [...new Set(endings.map(nameOf))];
    const said = `${range(amounts)} damage${where.length === 1 && where[0] === target ? "" : ` to ${where.join(" or ")}`}${counted.length ? `, ${range(counted)} prevented` : ""}`;
    return {index, label: `${state.objects[candidate.holderId]?.card ?? "An effect"} first: ${said}`, cardId: candidate.holderId, leaves: Math.min(...amounts), key: candidateKey(candidate)};
  });
  /* Two that would read alike (two permanents of one name) are numbered, so no two options read the same. */
  for (const option of options) {
    const alike = options.filter((o) => o.label === option.label);
    if (alike.length > 1) alike.forEach((o, n) => { o.label = `${o.label} (${n + 1})`; });
  }
  return {
    id: `order-damage:${state.turn}:${awaiting.key}:${(proposal.appliedBy ?? []).length}`,
    title: `${proposal.amount} damage${from ? ` from ${from}` : ""} to ${target}: which applies first?`,
    mode: "one", min: 1, max: 1,
    options: options.map(({key, ...option}) => option),
  };
}

/** The choice (§12.1) for CR 616.1: which applicable effect happens first. */
export function replacementChoice(state, awaiting) {
  const candidates = applicable(state, awaiting.proposal);
  return {
    id: `order-replacements:${state.turn}:${awaiting.proposal.event}`,
    title: "Choose which replacement effect applies first",
    mode: "one",
    min: 1,
    max: 1,
    options: candidates.map((candidate, index) => ({
      index,
      /* The effect's own words. "Effect 1" and "effect 2" is not a choice anybody can make, and
         the two may come from different permanents with the same name. */
      label: `${state.objects[candidate.holderId].card}: ${candidate.ability.text ?? candidate.ability.id}`,
      cardId: candidate.holderId,
    })),
  };
}

/**
 * Apply the chosen effect and carry on through the rest (CR 616.1), asking again if another
 * ambiguity turns up — which it can, because applying one can change what else applies.
 */
export function resolveReplacementOrder(state, awaiting, indices) {
  if (!state.awaiting || state.awaiting.kind !== "order-replacements")
    throw new Error("The engine is not waiting on a replacement order");
  const candidates = applicable(state, awaiting.proposal);
  const chosen = candidates[indices?.[0]];
  if (!chosen) throw new Error("Invalid selection");

  const next = applyOne(state, chosen, awaiting.proposal);
  state.awaiting = null;
  return applyReplacements(state, next);
}
