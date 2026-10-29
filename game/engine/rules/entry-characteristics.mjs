/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import {chosenFor} from "../script/chosen.mjs";

export function patchEnteringObject(object, patch) {
  for (const key of patch?.remove ?? []) delete object[key];
  Object.assign(object, structuredClone(patch?.set ?? {}));
}

/* CR 614.12: derive an entrant without moving it or counting it among other battlefield permanents. */
export function prospectiveEnteringState(state, frame) {
  const object = {...(frame.candidate ?? state.objects[frame.objectId]), id: frame.objectId, zone: "battlefield", zonePlayer: null,
    controller: frame.player, counters: {}, tapped: false, timestamp: state.nextTimestamp};
  patchEnteringObject(object, frame.entryFace);
  if (frame.faceDown) Object.assign(object, {types: ["Creature"], subtypes: [], supertypes: [], colors: [], keywords: [], abilities: [], power: 2, toughness: 2});
  patchEnteringObject(object, frame.objectPatch);
  const own = (object.abilities ?? []).filter(ability => ability.kind === "static" && ability.layer !== undefined
    && ability.affects?.self === true && !ability.worksFrom).map(ability => ({...chosenFor(ability, object),
    sourceId: frame.objectId, sourceController: frame.player, timestamp: ability.timestamp ?? object.timestamp,
    partOf: `${frame.objectId}|${ability.text ?? ability.id ?? ""}`, affects: {...ability.affects, ids: [frame.objectId]}}));
  return {...state, objects: {...state.objects, [frame.objectId]: object}, effects: [...(state.effects ?? []), ...own]};
}

/* CR 306.5b, 310.4b: printed values supply intrinsic counters only while the prospective ability exists.
   Independent counter grants and placement replacements remain with their existing callers. */
export function intrinsicEnteringCounters(object, current) {
  const counters = {};
  if (current.types.includes("Planeswalker") && !current.lostAbilities && Number.isInteger(object.loyalty)) counters.loyalty = object.loyalty;
  if (current.types.includes("Battle") && !current.lostAbilities && Number.isInteger(object.defense)) counters.defense = object.defense;
  return counters;
}
