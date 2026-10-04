/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* PROTECTION (CR 702.16): "You and creatures you control have protection from the chosen card type" (Serra's Emissary; the
 * live-game plan of 2026-10-04, lane W6).
 *
 * A static ability `rule: "protection"` on a permanent: `affects` the permanents that have it, read as they are now
 * (rules/layers.mjs, staticAffects); `players: "you"`, its controller has it too (CR 702.16j); `from` the quality --
 * `{types: [...]}`, a card type, which may be the one its permanent chose as it entered ("$chosen", script/chosen.mjs),
 * or "everything" (CR 702.16k). A source has the quality when it is an object of one of those card types, as it now is.
 *
 * What protection does is read where each thing happens (DEBT, CR 702.16b-f, j):
 *   Damage from such a source is prevented          rules/replacement.mjs, applyReplacements
 *   Enchanted or equipped by one, it cannot be        rules/sba.mjs (CR 704.5m, 704.5n); effects/permanents.mjs, attach
 *   Blocked by one, it cannot be                      rules/combat.mjs, canBlockAttacker
 *   Targeted by a spell or ability from one, never    script/filter.mjs (a permanent, or a player)
 */

import {staticAffects, typesOf, controllerOf} from "./layers.mjs";
import {chosenFor} from "../script/chosen.mjs";

/* Every protection there is now, each with what it covers and its quality. */
function protections(state) {
  const found = [];
  for (const holderId of state.zones.battlefield ?? []) {
    const holder = state.objects[holderId];
    for (const own of holder?.abilities ?? []) {
      if (own.kind !== "static" || own.rule !== "protection") continue;
      found.push({ability: holder.chosen !== undefined ? chosenFor(own, holder) : own, holderId, controller: controllerOf(state, holderId)});
    }
  }
  return found;
}

/* Whether a source has the quality (CR 702.16a): "everything", or one of the card types, as the source is now -- a spell on
   the stack, a permanent, a card in a graveyard. */
function hasQuality(state, from, sourceId) {
  if (from === "everything") return true;
  if (sourceId === null || sourceId === undefined || !state.objects[sourceId]) return false;
  const types = state.objects[sourceId].zone === "battlefield" ? typesOf(state, sourceId) : (state.objects[sourceId].types ?? []);
  return (from?.types ?? []).some((type) => types.includes(type));
}

/**
 * Whether this permanent (`card`) or this player (`player`) has protection from this source.
 * @param {object} state
 * @param {{card?: number, player?: number}} who
 * @param {?number} sourceId
 */
export function protectedFrom(state, {card = null, player = null}, sourceId) {
  if (sourceId === null || sourceId === undefined) return false;
  for (const {ability, holderId, controller} of protections(state)) {
    if (!hasQuality(state, ability.from, sourceId)) continue;
    if (card !== null && card !== undefined && ability.affects && state.objects[card]?.zone === "battlefield"
      && staticAffects(state, {affects: ability.affects, sourceId: holderId}, card, controller)) return true;
    if (player !== null && player !== undefined && ability.players === "you" && player === controller) return true;
  }
  return false;
}
