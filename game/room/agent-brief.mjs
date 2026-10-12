/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* WHAT THE LLM SEAT'S MODEL IS SHOWN, AND WHAT IT MAY ANSWER (AI-2, docs/plan-to-done-2026-09-30.md).
 *
 * At a close call the room offers the LLM seat one decision (game/engine/pilots/agent-pilot.mjs); the table builds this
 * brief from the seat's own view, as the room sends it to any seat (game/room/room.mjs `view`), and asks the model to
 * choose among the decision's options (cloud/ai.mjs `pilot`).
 *
 *   - THE SEAT'S OWN VIEW, AND NOTHING ELSE: its hand, its library's count, the board as everyone sees it, the stack, the
 *     turn and step. Never another seat's hand or a library's order: the projection cannot carry them.
 *   - NO PERSON'S NAME: the seats are "Seat 1" to "Seat 4", "you" among them, in the brief and in every option's words.
 *     A person's name is theirs, and the model has no use for it.
 *   - THE DECISION: its options by index, in its own words, and which of them the house pilot would choose (L1, the hint):
 *     the model corrects a heuristic rather than starting from nothing.
 *
 * `pickOf` reads the model's answer back: the indices must be the decision's own, as many as it allows, or the answer is
 * not used and the house pilot answers instead.
 */

const seatWord = (i, me) => (i === me ? "you" : `Seat ${i + 1}`);
const cardOf = (c) => ({name: c.name ?? (c.faceDown ? "a face-down card" : "a card"), ...(c.types?.length ? {types: c.types} : {}),
  ...(c.power !== null && c.power !== undefined ? {power: c.power, toughness: c.toughness} : {}), ...(c.tapped ? {tapped: true} : {}),
  ...(c.damage ? {damage: c.damage} : {}), ...(c.keywords?.length ? {keywords: c.keywords} : {}),
  ...(c.counters && Object.keys(c.counters).length ? {counters: c.counters} : {}), ...(c.commander ? {commander: true} : {})});

/** The brief for the seat's model: its view, its decision, and the house pilot's choice (`hint`, indices). */
export function agentBrief(view, hint = []) {
  const s = view.state, me = view.seat;
  const names = s.players.map((p) => p.name).filter((n) => typeof n === "string" && n.trim().length > 1);
  /* A person's name, as a whole word ("→ Maya", "Maya's"), becomes their seat; a card's name that holds it is left alone. */
  const word = (n) => new RegExp(`(?<![\\w'])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w])`, "g");
  const unnamed = (text) => names.reduce((t, n) => t.replace(word(n), seatWord(s.players.findIndex((p) => p.name === n), me)), String(text ?? ""));
  const zone = (p, z) => p.zones?.[z]?.cards ?? [];
  const decision = view.decision;
  return {
    turn: s.turn, step: s.phase, yourTurn: s.turnPlayerId === me,
    players: s.players.map((p, i) => ({seat: seatWord(i, me), life: p.life, ...(p.health?.poison ? {poison: p.health.poison} : {}),
      ...(p.health?.status === "lost" ? {out: true} : {}), handCount: p.zones?.Hand?.count ?? 0, libraryCount: p.zones?.Library?.count ?? 0,
      ...(i === me ? {hand: zone(p, "Hand").map(cardOf), mana: p.mana ?? []} : {}),
      battlefield: zone(p, "Battlefield").map(cardOf), graveyard: zone(p, "Graveyard").map((c) => c.name).filter(Boolean),
      command: zone(p, "Command").map((c) => c.name).filter(Boolean)})),
    stack: (s.stack ?? []).map((e) => ({name: e.name ?? "a face-down spell", by: seatWord(e.playerId, me), kind: e.kind})),
    decision: {title: unnamed(decision.title), mode: decision.mode, min: decision.min ?? 0, max: decision.max ?? 1,
      options: (decision.options ?? []).map((o, i) => ({index: o.index ?? i, label: unnamed(o.label), ...(o.detail ? {detail: unnamed(o.detail)} : {})}))},
    housePilotWouldChoose: hint,
  };
}

/**
 * The model's answer as the decision's own indices, or null: each an option's index, none twice, and as many as the
 * decision allows (one for "one"; between its min and max for "many"). Anything else is not used.
 */
export function pickOf(decision, answer) {
  const indices = Array.isArray(answer?.indices) ? answer.indices : Number.isInteger(answer?.index) ? [answer.index] : null;
  if (!indices || indices.some((i) => !Number.isInteger(i))) return null;
  const known = new Set((decision.options ?? []).map((o, i) => o.index ?? i));
  if (indices.some((i) => !known.has(i)) || new Set(indices).size !== indices.length) return null;
  if (decision.mode === "one" && indices.length !== 1) return null;
  if (decision.mode === "many" && (indices.length < (decision.min ?? 0) || indices.length > (decision.max ?? indices.length))) return null;
  if (decision.exclusiveBy) {
    const by = new Map((decision.options ?? []).map((o, i) => [o.index ?? i, o[decision.exclusiveBy]]));
    const seen = indices.map((i) => by.get(i)).filter((v) => v !== undefined);
    if (new Set(seen).size !== seen.length) return null;
  }
  return indices;
}
