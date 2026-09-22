/* WHAT DESERVES TO INTERRUPT SOMEBODY, AND WHAT DOES NOT.
 *
 * Rob, playing a four-player pod, 2026-09-21:
 *   "I would like to see the actions the other players take, specifically the cards they play."
 *   "I'm missing key notifications because of how we've laid things out."
 *   "I just had a creature eliminated from my board. I don't know why."
 *
 * The board already receives every one of those facts -- match-telemetry.mjs builds a `recent`
 * feed with the card, the actor and a written label, and even folds in the reason a permanent
 * left the battlefield ("earlier this turn: 3 damage from Odric"). It is all delivered on every
 * poll and none of it is ever put in front of anybody. This decides which of it is worth a
 * notice.
 *
 * The rule has two halves:
 *   - Anything another player DID, because that is the thing Rob cannot see.
 *   - Anything that HAPPENED TO YOU, whoever caused it -- your permanent dying, damage to you,
 *     your life changing -- because those are the ones that decide your next turn.
 * Your own deliberate plays are not announced back at you. You just made them.
 *
 * Kept pure and separate from the board so it can be tested without a browser, and so Stage B
 * moves it rather than rewriting it.
 */

/* Events that are noise in a notice: they fire constantly and carry no decision. Taps, phase
   changes, shuffles and resolutions are all visible on the board itself. */
const LOUD = new Set([
  "GameEventSpellAbilityCast",
  "GameEventLandPlayed",
  "GameEventCardChangeZone",
  "GameEventPlayerDamaged",
  "GameEventCardCounters",
  /* Poison was in the feed from the start and could never be announced, because the row it
     arrives on was pushed without its `kind`. Ten of these ends a game; it is not a footnote. */
  "GameEventPlayerPoisoned",
]);

/* A life total moving is reported without a `kind` (match-telemetry.mjs line 38), so it is
   recognized by its label instead. */
const LIFE = /^Life\s+(-?\d+)\s*→\s*(-?\d+)$/;

/* A creature entering the battlefield follows the cast that put it there, so announcing both says
   the same thing twice. A creature LEAVING is the case Rob could not explain. */
const LEFT_PLAY = /^(Died|Left battlefield)/;
/* Your own draw, which match-telemetry.mjs now keeps for the viewer only. */
const DREW = /^Drew a card$/;

export function isWorthANotice(row, viewerSeatId) {
  if (!row || !row.id) return false;
  const mine = row.playerId === viewerSeatId;
  if (LIFE.test(row.label || "")) return true;
  if (!LOUD.has(row.kind)) return false;
  /* You know what you just cast and what land you just played. */
  if (mine && (row.kind === "GameEventSpellAbilityCast" || row.kind === "GameEventLandPlayed")) return false;
  if (row.kind === "GameEventCardChangeZone") return LEFT_PLAY.test(row.label || "") || DREW.test(row.label || "");
  return true;
}

/* THE ENGINE'S EVENT NAMES ARE NOT ENGLISH. "GameEventCardChangeZone" is what Forge calls it and
 * it is what the history pane would otherwise have to show. A player reading their own game back
 * should be told what happened, not which Java class fired.
 */
const KINDS = {
  GameEventSpellAbilityCast: "put on the stack",
  GameEventCardChangeZone: "moved between zones",
  GameEventPlayerDamaged: "damage dealt to a player",
  GameEventCardDamaged: "damage dealt to a permanent",
  GameEventLandPlayed: "land played",
  GameEventCardCounters: "counters changed",
  GameEventCardTapped: "tapped or untapped",
  GameEventSpellResolved: "resolved from the stack",
};
export function eventKindLabel(kind) {
  return KINDS[kind] || (kind ? String(kind).replace(/^GameEvent/, "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase() : "table event");
}

/* How much a life change moved, so a notice can say "lost 3" rather than "Life 40 → 37". */
export function lifeDelta(row) {
  const m = LIFE.exec(row?.label || "");
  if (!m) return null;
  return Number(m[2]) - Number(m[1]);
}

/* THE FEED IS NEWEST FIRST AND ARRIVES WHOLE ON EVERY POLL, so "new" means "not already seen",
 * never "at the front". `seen` is mutated: the caller owns it across polls.
 *
 * On the FIRST call the whole feed is already history -- a player connecting mid-game does not
 * want eighty notices -- so it is marked seen and nothing is returned. That is what `priming`
 * is for, and getting it wrong is the difference between a useful notice and an unusable one.
 */
export function noticesFor(recent, seen, viewerSeatId, {priming = false} = {}) {
  const rows = Array.isArray(recent) ? recent : [];
  const fresh = [];
  for (const row of rows) {
    if (!row || !row.id || seen.has(row.id)) continue;
    seen.add(row.id);
    if (!priming && isWorthANotice(row, viewerSeatId)) fresh.push(row);
  }
  /* Oldest first, so a queue plays them back in the order they happened. */
  return fresh.reverse();
}
