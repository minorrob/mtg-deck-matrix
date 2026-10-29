/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* Public damage, remembered by the room across pilot recreation. No names or hidden-zone facts are stored. */
const SCHEMA = "PilotCombatMemory@1";
const HALF_LIFE_ROUNDS = 3;
const MAX_DAMAGE = 40;
const age = (hit, turn, seats) => Math.max(0, hit?.amount ?? 0) * 0.5 ** (Math.max(0, turn - (hit?.turn ?? turn)) / Math.max(1, seats) / HALF_LIFE_ROUNDS);

export function rememberDamage(memory, event, eventId, seats) {
  const current = memory?.schema === SCHEMA ? memory : {schema: SCHEMA, lastEvent: 0, hits: {}};
  const sequence = Number(String(eventId).replace(/^event:/, ""));
  const f = event?.data?.fields, target = f?.target?.playerId, source = f?.source?.controller;
  if (event?.kind !== "GameEventPlayerDamaged" || !Number.isInteger(sequence) || sequence <= current.lastEvent
    || !Number.isInteger(target) || !Number.isInteger(source) || source === target
    || target < 0 || source < 0 || target >= seats || source >= seats || !Number.isFinite(f.amount) || f.amount <= 0) return current;
  const turn = Math.max(0, event.data.turn ?? 0), previous = current.hits[target]?.[source];
  return {schema: SCHEMA, lastEvent: sequence, hits: {...current.hits, [target]: {...current.hits[target],
    [source]: {amount: Math.min(MAX_DAMAGE, age(previous, turn, seats) + f.amount), turn}}}};
}

/** Each amount is actual damage, decaying over three table rounds; self damage and life payments never provoke. */
export function combatMemoryFor(memory, seat, turn, seats) {
  const hits = memory?.schema === SCHEMA ? memory.hits : {};
  const taken = {}, dealt = {};
  for (let opponent = 0; opponent < seats; opponent++) if (opponent !== seat) {
    taken[opponent] = age(hits?.[seat]?.[opponent], turn, seats);
    dealt[opponent] = age(hits?.[opponent]?.[seat], turn, seats);
  }
  return {taken, dealt};
}
