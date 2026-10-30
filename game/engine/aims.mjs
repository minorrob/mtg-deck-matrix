/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* WHAT A SPELL OR ABILITY IS AIMED AT, AS EVERY SEAT MAY KNOW IT (Linear ROB-327; docs/ui-lane/history-and-targets-contract.md).
 *
 * A stack entry's `targets` are the engine's own choices (`{kind, id}`, nested for a counted target). The board and the history
 * need names, and they need to be told when a target is no longer there. An `Aim` is that, and public:
 *
 *   {kind:"player", id, name}
 *   {kind:"object", id, name, zone}             a card, permanent or spell anyone can see (zone: battlefield, graveyard, exile,
 *                                               stack or command)
 *   {kind:"object", id, name:null, hidden:true} aimed at, but not nameable: face down (CR 708.2a), or in a hidden zone
 *   {kind:"object", id, gone:true}              it has left. A zone change makes a new object (CR 400.7), so the id is nowhere:
 *                                               no name is given, which is why no stale name can be drawn
 *   {kind:"ability", id, name, gone?}           a spell or ability on the stack (`id` its stackId)
 *
 * Nothing here is a seat's secret: a hand or a library is never named, even to its owner, so one function serves every seat
 * and a spectator.
 */

const PUBLIC_ZONES = new Set(["battlefield", "graveyard", "exile", "stack", "command"]);

/** One chosen target as an Aim, or null for a placeholder (a counted target not chosen yet). */
export function aimOf(state, chosen) {
  if (!chosen || typeof chosen !== "object" || chosen.kind === "choose") return null;
  if (chosen.kind === "player") return {kind: "player", id: chosen.id, name: state.players[chosen.id]?.name ?? `Seat ${Number(chosen.id) + 1}`};
  if (chosen.kind === "ability") {
    const entry = state.stack.find((e) => e.stackId === chosen.id);
    if (!entry) return {kind: "ability", id: chosen.id, gone: true};
    return {kind: "ability", id: chosen.id, name: entry.faceDown || !entry.name ? "An ability" : `${entry.name}'s ${entry.kind === "trigger" ? "triggered" : "activated"} ability`};
  }
  if (chosen.kind !== "object") return null;
  const object = state.objects[chosen.id];
  if (!object) return {kind: "object", id: chosen.id, gone: true};
  if (object.faceDown === true || !PUBLIC_ZONES.has(object.zone)) return {kind: "object", id: chosen.id, name: null, hidden: true};
  return {kind: "object", id: chosen.id, name: object.card, zone: object.zone};
}

/** Every target of a list of choices, flat and in order (a counted target's chosen ones each their own). */
export function aimsOfTargets(state, targets) {
  return (targets ?? []).flat().map((t) => aimOf(state, t)).filter(Boolean);
}

/** The modal definition an entry's chosen modes belong to, or null. */
function modalOf(state, entry) {
  if (!Array.isArray(entry.modes)) return null;
  return (entry.kind === "spell" ? state.objects[entry.objectId]?.spell?.modal : entry.script?.modal) ?? null;
}

/**
 * What a stack entry (or a spell or ability being put on the stack) is aimed at: `aimed`, flat; and `aimedModes`, on a modal one,
 * each chosen mode with a target, its own words and its targets (CR 700.2: the targets are kept in the order the modes were
 * chosen, a mode's own specs together -- bind.mjs, modalScript).
 */
export function aimsOf(state, entry) {
  const aimed = aimsOfTargets(state, entry.targets);
  const modal = modalOf(state, entry);
  if (!modal) return {aimed};
  const aimedModes = [];
  let at = 0;
  for (const m of entry.modes) {
    const count = modal.modes[m]?.targets?.length ?? 0;
    const mine = aimsOfTargets(state, (entry.targets ?? []).slice(at, at + count));
    at += count;
    if (mine.length) aimedModes.push({text: modal.modes[m].text ?? "", aimed: mine});
  }
  return aimedModes.length ? {aimed, aimedModes} : {aimed};
}
