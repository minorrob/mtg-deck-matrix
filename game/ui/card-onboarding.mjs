/* THE CARDS FORGE CANNOT PILOT, TURNED INTO A QUEUE.
 *
 * Rob, 2026-09-21, looking at Forge's own dialog: "instead of showing me this screenshot... show
 * me text saying 'Onboarding your cards...[# of cards processed / # of cards to process]' where
 * the ratio here is real time."
 *
 * Forge already hands us the list. Read out of a real match journal rather than assumed:
 *
 *   title   : "AI can't play these cards well from D5 Shadrix Aristocrats'  Deck"
 *   mode    : ack, min 0, max 0
 *   options : ["=== Main Deck ===", "Orzhov Signet", "Psychosis Crawler"]
 *
 * So the work queue arrives for free, as the options of an acknowledgment nobody can act on. The
 * separators are section headings, not cards. The deck name carries a double space before "Deck"
 * in the live data, so the pattern must tolerate runs of whitespace.
 *
 * This module is the parsing and the wording, kept pure so both can be tested without a browser
 * and without a running engine.
 */

/* `=== Main Deck ===`, `=== Sideboard ===` and friends are headings inside the list. */
const SEPARATOR = /^\s*=+.*=+\s*$/;

export function parseOnboardingChoice(choice) {
  if (!choice || choice.mode !== "ack") return null;
  const title = String(choice.title || "");
  const m = /can'?t play these cards well(?:\s+from\s+(.*?))?\s*$/i.exec(title);
  if (!m) return null;
  /* "<name>'s  Deck" -> "<name>". Forge appends the word Deck and sometimes two spaces. */
  const deck = String(m[1] || "").replace(/\s*'?s?\s+Deck\s*$/i, "").replace(/\s+/g, " ").trim();
  const cards = (choice.options || [])
    .map((o) => String(o.label || "").trim())
    .filter((label) => label && !SEPARATOR.test(label));
  return {deck, cards, total: cards.length};
}

/* WHOSE DECK IS THIS? Rob: "show me when it's me or an AI, or show the user when it's a human
 * player". The dialog names the deck, and the seats carry the same names, so the seat can be
 * found by name rather than guessed. A deck nobody matches is still worth naming. */
export function onboardingSeat(deck, seats = []) {
  if (!deck) return null;
  const norm = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const target = norm(deck);
  return seats.find((s) => norm(s.name) === target)
    || seats.find((s) => target && norm(s.name) && (target.includes(norm(s.name)) || norm(s.name).includes(target)))
    || null;
}

export function onboardingHeadline(deck, seat, viewerSeatId) {
  if (seat && seat.playerId === viewerSeatId) return "Onboarding your cards";
  if (seat && seat.kind === "ai") return `Onboarding ${seat.name}'s cards · AI seat`;
  if (seat) return `Onboarding ${seat.name}'s cards`;
  return deck ? `Onboarding ${deck}'s cards` : "Onboarding cards";
}

/* The five-line spinner: the card being processed in the middle, two behind and two ahead. An
 * index outside the list yields blanks rather than wrapping, so the reel runs out at the end
 * instead of looping over cards already done. */
export function spinnerWindow(cards = [], index = 0, span = 2) {
  const out = [];
  for (let offset = -span; offset <= span; offset++) {
    const i = index + offset;
    out.push({name: i >= 0 && i < cards.length ? cards[i] : "", distance: Math.abs(offset), current: offset === 0});
  }
  return out;
}
