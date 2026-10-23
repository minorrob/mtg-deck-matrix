/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* Mutate (CR 702.140, 730): one permanent, with separately tracked physical components.
 * Component records are not objects in a zone and cannot be selected. Copiable values live
 * on the permanent; its physical cards and commander designations never become copiable. */
import {COPY_KEYS, removeObject, eventCard, commanderKeyOf} from "../state/index.mjs";
import {controllerOf} from "../rules/layers.mjs";

const values = (o) => Object.fromEntries(COPY_KEYS.filter(k => o[k] !== undefined).map(k => [k, structuredClone(o[k])]));
function component(object) {
  const original = object.faceDownCard ?? object;
  const physical = structuredClone({...object, ...original, ...(object.uncopied ?? {})});
  delete physical.faceDown; delete physical.faceDownCard;
  return {physical, values: values(object), ...(object.faceDown ? {faceDown: true} : {})};
}

export function mergeObjects(state, spellId, hostId, onTop) {
  const spell = state.objects[spellId], host = state.objects[hostId];
  if (!spell || !host || spell.zone !== "stack" || host.zone !== "battlefield") throw new Error("Choose the creature this spell is mutating onto.");
  const parts = host.merged ?? [component(host)];
  const incoming = component(spell);
  if (spell.copy) { incoming.physical.token = true; delete incoming.physical.copy; }
  if (onTop) parts.unshift(incoming); else parts.push(incoming);
  const previous = values(host), top = onTop ? incoming.values : previous;
  const combined = {...top, abilities: [...(previous.abilities ?? []), ...(incoming.values.abilities ?? [])],
    keywords: [...(previous.keywords ?? []), ...(incoming.values.keywords ?? [])]};
  /* Each component's ability is independent, including two copies of the same mutate trigger. */
  combined.abilities = combined.abilities.map((ability, i) => ({...ability, id: `merged-${host.id}-${i}`}));
  for (const key of COPY_KEYS) {
    if (combined[key] === undefined) delete host[key]; else host[key] = structuredClone(combined[key]);
  }
  host.merged = parts;
  host.mutations = (host.mutations ?? 0) + 1;
  host.token = onTop ? spell.token === true || spell.copy === true : host.token === true;
  const commanders = parts.map(p => p.physical).filter(p => p.commander === true);
  host.commander = commanders.length > 0;
  if (commanders.length) {
    host.commanderKey = commanderKeyOf(commanders[0]);
    host.colorIdentity = [...new Set(commanders.flatMap(p => p.colorIdentity ?? []))];
  } else delete host.commanderKey;
  /* The permanent retains its identity, status, counters and continuous effects (CR 730.2c).
     Its top component determines whether it is face down (CR 730.2e). */
  if (onTop) { delete host.faceDown; delete host.faceDownCard; delete host.disguised; delete host.mdfc; delete host.face; }
  if (host.faceDown) {
    const revealed = parts.map(p => p.faceDown ? values(p.physical) : p.values);
    host.faceDownCard = {...revealed[0], abilities: revealed.flatMap(p => p.abilities ?? []).map((a, i) => ({...a, id: `merged-${host.id}-${i}`})),
      keywords: revealed.flatMap(p => p.keywords ?? [])};
  }
  host.timestamp = state.nextTimestamp++;
  removeObject(state, spellId);
  return [{kind: "GameEventMutates", data: {turn: state.turn, phase: state.phase,
    fields: {card: eventCard(state, hostId), mutations: host.mutations}}}];
}

export const mergePermanent = {
  open(state, params, context) {
    const host = params.targets?.[0];
    if (!state.objects[host] || !state.objects[context.source]) return false;
    state.awaiting = {kind: "effect-choice", effect: "mergePermanent", player: controllerOf(state, host), host, spell: context.source};
    return true;
  },
  choice(state, awaiting) {
    return {id: `mutate:${awaiting.spell}`, title: `Put ${state.objects[awaiting.spell].card} over or under ${state.objects[awaiting.host].card}?`,
      mode: "one", min: 1, max: 1, options: [{index: 0, label: "Over — use its characteristics"}, {index: 1, label: "Under — keep the creature's characteristics"}]};
  },
  apply(state, awaiting, indices) {
    if (indices.length !== 1 || ![0, 1].includes(indices[0])) throw new Error("Choose over or under for this mutation.");
    return mergeObjects(state, awaiting.spell, awaiting.host, indices[0] === 0);
  },
  left() { return []; },
};
