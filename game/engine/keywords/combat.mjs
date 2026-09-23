/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE KEYWORDS THAT CHANGE COMBAT.
 *
 * `docs/engine/PLAN.md` §3.1 (`keywords/`, one module per family) and §6's phase 2.3.
 *
 * THIS FAMILY FIRST, BECAUSE IT IS THE ONE THE ENGINE ALREADY HALF-KNEW. `game/docs/engine-inventory.json`
 * counted keyword use across Rob's seven decks and FLYING IS 52 of them — more than twice the next.
 * Combat already read `Vigilance` and `Defender`; everything else in the list was a word on a card
 * that nothing looked at, so a flier could be blocked by anything on the ground.
 *
 * MENACE IS NOT A PER-BLOCKER RULE (CR 702.111b). "Can't be blocked except by two or more
 * creatures" is a constraint on the SET: every individual blocker is legal and the set of one is
 * not. An engine whose only question is "may this creature block that one" cannot express it, and
 * menace then silently does nothing — which is the usual way it is got wrong. So there are two
 * questions here, and combat asks both.
 *
 * DEATHTOUCH BELONGS IN THE ASSIGNMENT, NOT AFTER IT (CR 702.2b). It changes what LETHAL means, and
 * lethal is what CR 510.1c uses to decide whether damage may move past a blocker. A 1/1
 * deathtoucher facing two 4/4s assigns one to the first and may then move on.
 *
 * FIRST STRIKE IS A WHOLE EXTRA STEP (CR 510.4), and double strike deals in BOTH of them. The turn
 * table has carried `COMBAT_FIRST_STRIKE_DAMAGE` as a conditional step since 1.2, waiting for
 * something to make its condition true.
 *
 * WHAT IS DEFERRED AND NAMED: protection (CR 702.16) needs a quality — "protection from black" is
 * not a keyword, it is a keyword with an argument, and the card script has to express that;
 * landwalk the same. Intimidate, fear, shadow and horsemanship are one card each in the pool and
 * belong with the long tail. Infect and wither change what damage DOES rather than who may block,
 * and go with the counters family.
 */

import {keywordsOf} from "../rules/layers.mjs";
import {toughnessOf, powerOf} from "../rules/layers.mjs";

/** The families of §3.1, so a caller can ask what this module covers. */
export const KEYWORD_FAMILIES = Object.freeze({
  /** Who may block, and whom. */
  evasion: Object.freeze(["Flying", "Reach", "Menace"]),
  /** What happens when damage is dealt. */
  combat: Object.freeze(["Deathtouch", "Trample", "Lifelink", "First Strike", "Double Strike", "Vigilance", "Defender"]),
});

const has = (state, id, keyword) => keywordsOf(state, id).includes(keyword);

/**
 * Whether this one creature may block that attacker (CR 509.1b).
 *
 * The per-blocker half. Menace is the other half and is not expressible here — see
 * `blockersAreLegal`.
 */
export function canBlockAttacker(state, blockerId, attackerId) {
  /* CR 702.9b: flying can be blocked only by flying or reach (CR 702.17b). Note which way round it
     is — flying restricts who may block IT, and does not restrict what it may block. */
  if (has(state, attackerId, "Flying")
      && !has(state, blockerId, "Flying") && !has(state, blockerId, "Reach")) return false;
  return true;
}

/**
 * Whether this SET of blockers is a legal block on that attacker (CR 509.1b).
 *
 * Blocking with nobody is always legal — declining to block is not a block that has to satisfy
 * anything.
 */
export function blockersAreLegal(state, attackerId, blockerIds) {
  const blockers = blockerIds ?? [];
  if (blockers.length === 0) return true;
  /* CR 702.111b */
  if (has(state, attackerId, "Menace") && blockers.length < 2) return false;
  return blockers.every((id) => canBlockAttacker(state, id, attackerId));
}

/** Why a set of blockers is illegal, for the refusal message. */
export function whyBlockersAreIllegal(state, attackerId, blockerIds) {
  const blockers = blockerIds ?? [];
  if (blockers.length === 0) return null;
  if (has(state, attackerId, "Menace") && blockers.length < 2)
    return `${state.objects[attackerId].card} has menace and can't be blocked except by two or more creatures`;
  const illegal = blockers.find((id) => !canBlockAttacker(state, id, attackerId));
  if (illegal !== undefined)
    return `${state.objects[illegal].card} can't block ${state.objects[attackerId].card}`;
  return null;
}

/**
 * How much damage from this source counts as lethal to that creature (CR 510.1c).
 *
 * Deathtouch makes it one (CR 702.2b). This is what the damage assignment order uses to decide
 * whether damage may move past a blocker, which is why it is a question about the SOURCE and the
 * target together rather than a property of either.
 */
export function lethalNeededFrom(state, sourceId, targetId) {
  const already = state.objects[targetId]?.damage ?? 0;
  const remaining = Math.max(0, toughnessOf(state, targetId) - already);
  if (remaining === 0) return 0;
  if (sourceId !== null && sourceId !== undefined && has(state, sourceId, "Deathtouch")) return 1;
  return remaining;
}

/** Whether a creature deals damage in the first-strike step (CR 702.7b, 702.4b). */
export const dealsFirstStrike = (state, id) =>
  has(state, id, "First Strike") || has(state, id, "Double Strike");

/** Whether it deals in the regular step. Everything does, except a first striker that is not double. */
export const dealsRegular = (state, id) =>
  !has(state, id, "First Strike") || has(state, id, "Double Strike");

/**
 * Whether this combat needs the first-strike damage step at all (CR 510.4).
 *
 * The condition the turn table has been reading since 1.2. Any attacker or blocker with either
 * keyword makes the step happen, and then everything else waits for the regular one.
 */
export function combatNeedsFirstStrike(state) {
  const combat = state.combat;
  if (!combat) return false;
  for (const attack of combat.attacks) {
    if (dealsFirstStrike(state, attack.attacker)) return true;
    for (const blocker of attack.blockers) if (dealsFirstStrike(state, blocker)) return true;
  }
  return false;
}

/** CR 702.19b: what an attacker with trample may push past its blockers. */
export function trampleOver(state, attackerId, assignedToBlockers) {
  if (!has(state, attackerId, "Trample")) return 0;
  return Math.max(0, powerOf(state, attackerId) - assignedToBlockers);
}

/**
 * CR 704.5h: a creature dealt damage by a source with deathtouch is destroyed, whatever its
 * toughness.
 *
 * THAT IS A STATE-BASED ACTION, NOT THE ASSIGNMENT RULE. `lethalNeededFrom` is CR 510.1c and only
 * decides how much has to be assigned before damage may move past a blocker; it kills nothing. An
 * engine with only that half assigns one damage to an eight-toughness wall and then leaves it
 * standing — which is exactly what this engine did until this existed.
 */
export function markDeathtouch(state, sourceId, targetId) {
  if (sourceId === null || sourceId === undefined) return;
  if (!has(state, sourceId, "Deathtouch")) return;
  const object = state.objects[targetId];
  if (object) object.deathtouched = true;
}

/** CR 702.15a: damage dealt by a source with lifelink gains its controller that much life. */
export const lifelinkFrom = (state, sourceId, amount) =>
  (sourceId !== null && sourceId !== undefined && has(state, sourceId, "Lifelink") ? amount : 0);
