/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "Copy that spell" after it leaves the stack (Plumb the Forbidden; CR 608.2h, 707.10): retain its last copiable
   characteristics and choices only for abilities already referring to it. No global history grows with every cast. */
import {COPY_KEYS, eventCard} from "../state/index.mjs";
const COPY_FIELDS = [...new Set([...COPY_KEYS, "colorIdentity", "preparation"])];

export function rememberDepartingSpell(state, entry) {
  if (entry?.kind !== "spell") return;
  const object = state.objects[entry.objectId];
  if (object?.zone !== "stack") return;
  const abouts = [...(state.pendingTriggers ?? []).map((trigger) => trigger.about), ...state.stack.map((other) => other.about),
    ...(state.delayedTriggers ?? []).map((trigger) => trigger.about), state.resolving?.context?.about,
    ...(state.resolving?.queue ?? []).filter((effect) => effect.effect === "__about").map((effect) => effect.about)];
  for (const about of abouts) {
    if (about?.card !== entry.objectId || about.stackId !== entry.stackId) continue;
    const values = Object.fromEntries(COPY_FIELDS.filter((key) => object[key] !== undefined)
      .map((key) => [key, object.faceDown === true && key === "colorIdentity" ? [] : structuredClone(object[key])]));
    about.spellLastKnown = {entry: structuredClone(entry), values, reference: eventCard(state, entry.objectId)};
  }
}
