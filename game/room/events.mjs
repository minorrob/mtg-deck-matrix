/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE TABLE'S EVENTS (`events.v1`; Linear ROB-77, the UI lane's request #3).
 *
 * The board animated from the history's sentences and from the difference between two views: a spell cast and resolved
 * between two views was never on the stack in either, so it arrived as a permanent from nowhere; a reconnect could play a
 * moment again as if it had just happened; and some moments could not be told apart. These are the same facts as
 * structured events, each with the journal's own id (`event:<sequence>`, the same on a replay, game/engine/journal.mjs),
 * in the order they happened, and the decision it answered when a person's answer made it (`decisionId`, room.mjs): the
 * decision's own id as that room asked it -- what the seat answered -- so a replay, asking the same questions at its own
 * revisions, names them by its own.
 *
 * WHAT A SEAT IS TOLD is what the history tells everyone (history.mjs), as data: a card that moves between two hidden zones
 * is not an event; a draw is the drawer's, and another seat learns only that they drew; a face-down card has no name.
 * The one thing a seat is told that no other is -- the card they drew -- is kept as the event's `secret` and given to that
 * seat alone (`forSeat`). A card is `{cardId, name}`, its name null where it is face down.
 *
 * A `cast` or `ability` event carries `aimed` (and `aimedModes`) when it has targets: engine/aims.mjs, the same Aims as a stack entry's.
 *
 * Kinds: turn, draw, land, cast, ability, resolve, countered, tap, damage, life, token, move, attack, block, reveal,
 * monarch, roll, lost, over. A kind the board does not know it may ignore; a kind is never renamed within v1.
 */
export const EVENTS_SCHEMA = "events.v1";
/** The newest events a room keeps for a reconnecting seat; older ones are in its journal, not its view. */
export const EVENTS_KEEP = 200;

const HIDDEN = new Set(["Library", "Hand"]);
const ZONE = {Battlefield: "battlefield", Graveyard: "graveyard", Exile: "exile", Hand: "hand", Library: "library", Stack: "stack", Command: "command"};
const zone = (z) => ZONE[z?.zoneType] ?? null;
/* A card as every seat may know it. */
const card = (c) => (c ? {cardId: c.cardId ?? null, name: c.faceDown ? null : c.name ?? null} : null);
const aimed = (f) => ({...(Array.isArray(f.aimed) && f.aimed.length ? {aimed: f.aimed} : {}), ...(Array.isArray(f.aimedModes) && f.aimedModes.length ? {aimedModes: f.aimedModes} : {})});
const seq = (eventId) => Number(String(eventId).slice("event:".length));

/** What one engine event says, as at most one table event, or null. `eventId` is the journal's id for it. */
export function tableEvent(event, eventId) {
  const {kind, data} = event || {};
  const f = (data && data.fields) || {};
  const head = {eventId, turn: (data && data.turn) || 0, phase: (data && data.phase) ?? null};
  const at = (k, fields) => ({...head, kind: k, ...fields});
  switch (kind) {
    case "GameEventTurnPhase":
      return f.phase === "UNTAP" && f.playerTurn
        ? at("turn", {player: f.playerTurn.playerId, ...(f.extraTurn ? {extra: true} : {}), ...(Number.isInteger(f.round) ? {round: f.round, turnInRound: f.turnInRound} : {})})
        : null;
    case "GameEventLandPlayed":
      return at("land", {player: f.player.playerId, card: card(f.land)});
    case "GameEventSpellAbilityCast":
      /* What it is aimed at (engine/aims.mjs; ROB-327), public: the board's held-up play says "Lightning Bolt ⤳ Rob" even when the spell
         was cast and resolved between two of its views. */
      return f.sa && f.sa.isSpell
        ? at("cast", {player: f.si.actor.playerId, card: card(f.card), stackId: f.sa.stackId, ...aimed(f)})
        : at("ability", {player: f.si?.actor?.playerId ?? null, card: card(f.card), stackId: f.sa?.stackId ?? null, ...(f.si?.isTrigger ? {trigger: true} : {}), ...aimed(f)});
    case "GameEventSpellResolved":
      if (f.countered) return at("countered", {player: f.playerId ?? null, stackId: f.stackId ?? null});
      return f.card ? at("resolve", {card: card(f.card), stackId: f.stackId ?? null}) : null;
    case "GameEventCardTapped":
      return at("tap", {card: card(f.card), tapped: f.tapped !== false});
    case "GameEventPlayerDamaged":
      return at("damage", {source: card(f.source), target: {player: f.target.playerId}, amount: f.amount});
    case "GameEventCardDamaged":
      return at("damage", {source: card(f.source), target: {card: card(f.card)}, amount: f.amount});
    case "GameEventPlayerLivesChanged":
      if (f.lost) return at("lost", {player: f.player.playerId, ...(f.lossReason ? {reason: f.lossReason} : {})});
      return f.oldLives === f.newLives ? null : at("life", {player: f.player.playerId, from: f.oldLives, to: f.newLives});
    case "GameEventCardChangeZone": {
      const from = f.from && f.from.zoneType, to = f.to && f.to.zoneType, owner = f.card ? f.card.owner : null;
      if (f.createdAsToken) return at("token", {player: f.to?.player?.playerId ?? owner, card: card(f.card)});
      /* A draw: the drawer's own card, theirs alone. */
      if (from === "Library" && to === "Hand") return at("draw", {player: owner, count: 1, secret: {seat: owner, card: {...card(f.card), ...(f.drewAs !== undefined ? {cardId: f.drewAs} : {})}}});
      if (HIDDEN.has(from) && HIDDEN.has(to)) return null;
      return at("move", {card: card(f.card), from: zone(f.from), to: zone(f.to), owner});
    }
    case "GameEventAttackersDeclared":
      return at("attack", {player: f.player.playerId, attackers: (f.attackers || []).map((a) => ({card: card(a.card),
        defender: {player: a.defender?.playerId ?? null, ...(a.defender?.planeswalker ? {planeswalker: card(a.defender.planeswalker)} : {})}}))});
    case "GameEventBlockersDeclared":
      return at("block", {player: f.player.playerId, blocks: (f.blockers || []).map((b) => ({card: card(b.card), blocking: card(b.blocking)}))});
    case "GameEventCardRevealed":
      return at("reveal", {player: f.player.playerId, card: card(f.card)});
    case "GameEventBecomeMonarch":
      return at("monarch", {player: f.player.playerId});
    case "GameEventDieRolled":
      return at("roll", {player: f.player.playerId, sides: f.sides, result: f.result});
    case "GameEventGameOutcome":
      return at("over", {winner: f.winner ?? null});
    default:
      return null;
  }
}

/** One seat's copy of an event: the secret given to the seat it belongs to, and to no other -- and to it only while it may
    still see the card (`knows`, by its id): a card drawn and put back (a mulligan, "put two cards from your hand on top")
    is in a library again, where no one knows it (CR 401.2). */
export function forSeat(event, seat, knows = () => true) {
  if (!event.secret) return event;
  const {secret, ...open} = event;
  return secret.seat === seat && knows(secret.card?.cardId) ? {...open, card: secret.card} : open;
}

/**
 * The events a seat's view carries: after `after` (an event id it has seen), or from `from` (the first event of the change
 * being shown). `reset` when an event after `after` is no longer kept (`floor`, the sequence of the newest one let go): the
 * client starts from the view, not from events.
 */
export function eventsFor(kept, seat, {after = null, from = null, floor = -1, knows} = {}) {
  if (after !== null && after !== undefined) {
    const n = seq(after);
    if (!Number.isFinite(n) || n < floor) return {events: [], reset: true};
    return {events: kept.filter((e) => seq(e.eventId) > n).map((e) => forSeat(e, seat, knows)), reset: false};
  }
  const start = from === null ? Infinity : seq(from);
  return {events: kept.filter((e) => seq(e.eventId) >= start).map((e) => forSeat(e, seat, knows)), reset: false};
}

/** Keep the newest EVENTS_KEEP, in place; the sequence of the newest let go, or `floor` when none was. */
export function keep(kept, floor = -1) {
  if (kept.length <= EVENTS_KEEP) return floor;
  const gone = kept.splice(0, kept.length - EVENTS_KEEP);
  return seq(gone[gone.length - 1].eventId);
}
