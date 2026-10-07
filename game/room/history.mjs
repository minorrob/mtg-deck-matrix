/* THE TABLE'S HISTORY (M5; the handoff's History drop-down and the Focus mat's history band).
 *
 * The engine says what happened as Forge-shaped events (GameEvent*), each carrying the turn and the phase. This
 * turns them into short lines anyone at the table may read, as the room writes them, so there is one history
 * for everyone and nothing in it depends on who is looking.
 *
 * WHAT NOBODY IS TOLD. A card that moves between two hidden zones (a library and a hand) is never named: a
 * draw is "Rob drew a card", however many. Everything else it names was, or has just become, public: a land
 * played, a spell cast, a card discarded, milled, destroyed or exiled.
 *
 * Left out, as noise: tapping, mana, shuffles, and the steps of a turn (the turn itself is a line).
 *
 * A line: {turn, text, n?, who?}. Draws by the same player in a row are one line whose count grows.
 */

const HIDDEN = new Set(["Library", "Hand"]);
export const HISTORY_LIMIT = 300;

const cardName = (card) => (card && !card.faceDown && card.name ? card.name : "a face-down card");

/** The lines one event adds. `names[i]` is seat i's name at the table. */
export function historyLines(event, names = []) {
  const {kind, data} = event || {};
  const f = (data && data.fields) || {}, turn = (data && data.turn) || 0;
  const who = (id) => names[id] ?? `Seat ${Number(id) + 1}`;
  const line = (text, extra = {}) => [{turn, text, ...extra}];
  switch (kind) {
    case "GameEventTurnPhase":
      return f.phase === "UNTAP" && f.playerTurn ? line(`Turn ${turn} · ${who(f.playerTurn.playerId)}`, {mark: "turn"}) : [];
    /* A designation (CR 701.37b, 722.3): monstrous, prepared or unprepared -- public. */
    case "GameEventCardAttribute":
      return line(f.attribute === "monstrous" ? `${cardName(f.card)} became monstrous` : `${cardName(f.card)} ${f.value ? "became prepared" : "is no longer prepared"}`);
    case "GameEventLandPlayed":
      return line(`${who(f.player.playerId)} played ${cardName(f.land)}`);
    case "GameEventSpellAbilityCast":
      return f.sa && f.sa.isSpell ? line(`${who(f.si.actor.playerId)} cast ${cardName(f.card)}`) : [];
    case "GameEventSpellCopied":
      return line(`${who(f.playerId)} copied ${cardName(f.card)}`);
    case "GameEventSpellResolved":
      return f.card ? line(`${cardName(f.card)} resolved`) : [];
    case "GameEventCardChangeZone": {
      const from = f.from && f.from.zoneType, to = f.to && f.to.zoneType, owner = f.card ? f.card.owner : undefined;
      if (from === "Library" && to === "Hand") return [{turn, text: "", n: 1, who: owner, draw: true}];
      if (HIDDEN.has(from) && HIDDEN.has(to)) return [];
      /* Already said by the land played, the spell cast, or the spell resolved. */
      if ((from === "Hand" || from === "Command") && (to === "Stack" || to === "Battlefield")) return [];
      if (from === "Stack") return [];
      const name = cardName(f.card);
      if (to === "Graveyard") return line(from === "Hand" ? `${who(owner)} discarded ${name}` : from === "Library" ? `${name} was milled` : `${name} went to the graveyard`);
      if (to === "Exile") return line(`${name} was exiled`);
      if (to === "Command") return line(`${name} returned to the command zone`);
      if (to === "Battlefield") return line(`${name} entered the battlefield`);
      if (to === "Hand") return line(`${name} returned to ${who(owner)}'s hand`);
      if (to === "Library") return line(`${name} was put into ${who(owner)}'s library`);
      return [];
    }
    case "GameEventPlayerLivesChanged":
      if (f.lost) return line(`${who(f.player.playerId)} lost the game${f.lossReason ? ` (${f.lossReason})` : ""}`);
      return f.oldLives === f.newLives ? [] : line(`${who(f.player.playerId)}: ${f.oldLives} → ${f.newLives} life`);
    case "GameEventPlayerDamaged":
      return line(`${cardName(f.source)} dealt ${f.amount} to ${who(f.target.playerId)}`);
    case "GameEventCardDamaged":
      return line(`${f.source ? cardName(f.source) : "Damage"} dealt ${f.amount} to ${cardName(f.card)}`);
    case "GameEventAttackersDeclared": {
      const attackers = (f.attackers || []).map((a) => cardName(a.card));
      return attackers.length ? line(`${who(f.player.playerId)} attacked with ${attackers.join(", ")}`) : [];
    }
    case "GameEventBlockersDeclared": {
      const blocks = (f.blockers || []).map((b) => `${cardName(b.card)} blocked ${cardName(b.blocking)}`);
      return blocks.length ? line(`${who(f.player.playerId)}: ${blocks.join(", ")}`) : [];
    }
    /* A double-faced permanent turned over (CR 701.27a): both faces are public, so both are named. */
    case "GameEventCardTransformed":
      return line(`${f.from ?? "A permanent"} transformed into ${cardName(f.card)}`);
    /* A face-down permanent turned face up (CR 701.40b, 708.8): its card is shown to everyone as it is, so it is named now. */
    case "GameEventCardTurnedFaceUp":
      return line(`${who(f.player.playerId)} turned ${cardName(f.card)} face up`);
    /* A Class's level (CR 716.2a). */
    case "GameEventCardLevel":
      return line(`${cardName(f.card)} reached level ${f.newValue}`);
    case "GameEventGameOutcome":
      return line(f.winner === null || f.winner === undefined ? "The game is over: no one is left" : `${who(f.winner)} won`, {mark: "end"});
    default:
      return [];
  }
}

/** A draw line's words. */
const drawText = (names, l) => `${names[l.who] ?? `Seat ${Number(l.who) + 1}`} drew ${l.n === 1 ? "a card" : `${l.n} cards`}`;

/**
 * Add an event's lines to a history, in place: draws by the same player in a row are counted on one line, and
 * the history keeps its newest HISTORY_LIMIT lines.
 */
export function addToHistory(history, event, names = []) {
  for (const l of historyLines(event, names)) {
    const last = history[history.length - 1];
    if (l.draw && last && last.draw && last.who === l.who && last.turn === l.turn) {last.n += 1; last.text = drawText(names, last); continue;}
    history.push(l.draw ? {...l, text: drawText(names, l)} : l);
  }
  if (history.length > HISTORY_LIMIT) history.splice(0, history.length - HISTORY_LIMIT);
  return history;
}
