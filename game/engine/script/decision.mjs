/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* Public descriptions of a decision, never another way to answer it. The engine's targets and effect names supply
   the desk's verbs; controller ids are facts, not text parsed out of a label. Unknown effects keep their name out of
   the question rather than guessing. These fields neither add an option nor change its index or legality. */
import {controllerOf} from "../rules/layers.mjs";

const VERBS = Object.freeze({destroy: "Destroy", exile: "Exile", tap: "Tap", untap: "Untap", counterSpell: "Counter",
  copySpell: "Copy", copyPermanent: "Copy", gainControl: "Gain control of", dealDamage: "Deal damage to", draw: "Draw",
  gainLife: "Gain life", loseLife: "Lose life", sacrifice: "Sacrifice", discard: "Discard", pump: "Modify", addCounters: "Put counters on"});
const namesTarget = (value, target) => value && typeof value === "object" && (value.target === target || Object.values(value).some(v => namesTarget(v, target)));

/** The first effect that acts on this instance of target, preserving the card's effect order. */
export function effectForTarget(effects, target = null) {
  for (const effect of effects ?? []) {
    if (!effect || typeof effect !== "object") continue;
    const aimed = target === null || ["targets", "who", "spells", "toPlayer", "controller"].some(k => namesTarget(effect[k], target));
    if (aimed) {
      const word = effect.effect === "moveZone" ? ({hand: "Return", exile: "Exile", graveyard: "Put into the graveyard", battlefield: "Put onto the battlefield"})[effect.to]
        : VERBS[effect.effect];
      if (word) return word;
    }
    const nested = effectForTarget(effect.effects, target);
    if (nested) return nested;
    for (const mode of effect.modes ?? []) { const word = effectForTarget(mode.effects, target); if (word) return word; }
  }
  return null;
}

/** Facts about a target the option already exposes. A face-down card remains an id and never gains its hidden name. */
export function targetFacts(state, target, effect = null) {
  if (!target || !["object", "player", "ability"].includes(target.kind)) return {};
  const object = target.kind === "object" ? state.objects[target.id] : null;
  const entry = target.kind === "ability" ? state.stack.find(e => e.stackId === target.id) : null;
  const controllerId = target.kind === "player" ? target.id : object ? (object.zone === "battlefield" ? controllerOf(state, target.id) : object.controller)
    : entry?.playerId;
  return {...(controllerId !== undefined ? {controllerId} : {}), ...(effect ? {effect} : {}),
    ...(object ? {affected: target.id} : {})};
}

/** One group per instance of the word target. Counted targets stay together, and unchosen placeholders carry no identity. */
export function targetGroups(state, effects, targets) {
  return (targets ?? []).map((group, index) => {
    const effect = effectForTarget(effects, index);
    return {index, ...(effect ? {effect} : {}), targets: [].concat(group ?? []).filter(t => ["object", "player", "ability"].includes(t?.kind))
      .map(target => ({...target, ...targetFacts(state, target, effect)}))};
  });
}
