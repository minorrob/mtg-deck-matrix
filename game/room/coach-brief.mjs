/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE COACH'S BRIEF (X13, AI-1 in docs/plan-to-done-2026-09-30.md): what the Coach may see, built from the asking seat's
 * own view of the game -- the projection the room sends that seat (game/engine/projection.mjs) -- and the deck that seat
 * brought. Rob, 2026-10-09: "keep it's context restricted to the content present within the player's deck and the active
 * played board (can't see the opponents hands)", and then "within the player's hand and knowledge of their deck (not
 * visibility into the order of cards in the deck)". So it holds:
 *
 *   - the person's own hand, each card with what it can do now (the question they are being asked);
 *   - the board as everyone at the table sees it: each seat's life, poison and commander damage, the permanents with
 *     their state, the graveyard, the face-up exile and the command zone; the stack; the step; the history's lines;
 *   - their own deck as a list -- the cards it was built with, sorted by name -- and how many cards the library holds.
 *
 * And never: another seat's hand or library (the projection cannot carry them), a face-down card that is not theirs,
 * or the library's order -- not even a top card a scry or a look showed them, which the projection keeps for the board.
 * It is built on the Worker's side of the table (cloud/game-room.mjs), never from anything a browser sends.
 *
 * Every card is named with the id the board knows it by, so the Coach's answer can point at it (`show`), and the
 * answer's names, ids and seats are checked against this brief before anyone reads it (cloud/ai.mjs, `briefFacts`).
 */

export const COACH_BRIEF_SCHEMA = "CrankCoachBrief@1";
const HISTORY_LINES = 20;
const OPTIONS_SHOWN = 40;

const permanent = (c) => ({id: c.cardId, name: c.name ?? (c.faceDownName ? `${c.faceDownName} (face down)` : "a face-down permanent"),
  ...(c.tapped ? {tapped: true} : {}), ...(c.types?.length ? {types: c.types} : {}),
  ...(c.power !== null && c.power !== undefined ? {power: c.power, toughness: c.toughness} : {}),
  ...(c.damage ? {damage: c.damage} : {}), ...(Object.keys(c.counters ?? {}).length ? {counters: c.counters} : {}),
  ...(c.keywords?.length ? {keywords: c.keywords} : {}), ...(c.commander ? {commander: true} : {})});
const named = (zone) => (zone?.cards ?? []).filter((c) => c.name).map((c) => ({id: c.cardId, name: c.name}));

/**
 * @param {object} view   the room's view for the asking seat (game/room/room.mjs, `view(seatId)`)
 * @param {object} deck   that seat's deck as the table holds it: {name, commander: [names], cards: [names]}
 * @returns {object}      the brief: only what that person may know
 */
export function coachBrief(view, deck) {
  const s = view.state, me = view.seat, names = s.players.map((p) => p.name);
  const own = s.players[me];
  const whose = (id) => (id === null || id === undefined ? null : names[id] ?? null);
  /* What each card in hand can do now: the options of the question being asked, by card. */
  const offers = new Map();
  for (const o of view.decision?.options ?? []) if (o.cardId !== undefined && o.act !== "pass") {
    const list = offers.get(o.cardId) ?? [];
    list.push(o.detail ? `${o.label} ${o.detail}` : o.label);
    offers.set(o.cardId, list);
  }
  const counted = new Map();
  for (const name of [...(deck?.commander ?? []), ...(deck?.cards ?? [])]) counted.set(name, (counted.get(name) ?? 0) + 1);
  return {
    schema: COACH_BRIEF_SCHEMA,
    you: own.name,
    turn: s.turn,
    step: s.phase,
    turnOf: whose(s.turnPlayerId),
    priority: whose(s.priorityPlayerId),
    players: s.players.map((p) => ({
      name: p.name, ...(p.playerId === me ? {you: true} : {}),
      life: p.health.life, ...(p.health.poison ? {poison: p.health.poison} : {}),
      ...(p.health.commanderDamageMax ? {commanderDamageMax: p.health.commanderDamageMax} : {}),
      ...(p.health.status === "lost" ? {lost: true} : {}),
      hand: p.zones.Hand.count, library: p.zones.Library.count,
      battlefield: (p.zones.Battlefield.cards ?? []).map(permanent),
      graveyard: named(p.zones.Graveyard),
      exile: named(p.zones.Exile),
      command: named(p.zones.Command),
    })),
    hand: (own.zones.Hand.cards ?? []).filter((c) => c.name).map((c) => ({id: c.cardId, name: c.name, ...(offers.has(c.cardId) ? {now: offers.get(c.cardId)} : {})})),
    stack: (s.stack ?? []).map((e) => ({id: e.cardId, name: e.name ?? "a face-down spell", controller: whose(e.playerId), kind: e.kind})),
    asked: view.decision ? {title: view.decision.title, kind: view.decision.kind ?? view.decision.mode,
      options: view.decision.options.slice(0, OPTIONS_SHOWN).map((o) => (o.detail ? `${o.label} ${o.detail}` : o.label))} : null,
    history: (view.history ?? []).slice(-HISTORY_LINES).map((h) => `Turn ${h.turn}: ${h.text}`),
    deck: {name: deck?.name ?? null, cards: [...counted].sort(([a], [b]) => a.localeCompare(b)).map(([name, n]) => (n > 1 ? `${n} ${name}` : name)), library: own.zones.Library.count},
  };
}
