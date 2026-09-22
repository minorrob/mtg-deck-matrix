/* WHAT THE TABLE SOUNDS LIKE — the event half of the pack's Resolution Rules.
 *
 * play-audio-rules.mjs answers "what does this CARD sound like" from a type line and knows
 * nothing about CrankMagic. This answers "what does this MOMENT sound like" from the telemetry
 * feed, and knows nothing about Web Audio. The seam is deliberate: if the feed changes shape the
 * card rules do not move, and if the pack reorders its tribes this file does not.
 *
 * AUDIO IS THE SECOND CONSUMER OF A FEED THAT ALREADY EXISTS. match-telemetry.mjs builds
 * `recent` on every poll, deduplicated by event id, with the card, the actor and a written label.
 * table-notices.mjs reads it to decide what interrupts somebody. This reads the same rows with a
 * different filter. The pack's own stub proposes hooking audio into the board at a dozen separate
 * points -- cast, ETB, combat, life, poison, wipe, tokens, proliferate, turn -- and every one of
 * those is already a row here. Hooking them separately would be a second set of triggers to keep
 * in step with the first.
 *
 * R8: "Events (damage, poison, wipe, etc.) play in addition to cast SFX when they happen as
 *      separate moments."
 */
import {resolveCardSounds} from "./play-audio-rules.mjs";

/* The labels match-telemetry.mjs writes. They are matched rather than re-derived because the feed
   is the only thing the board and the notices agree on, and a second derivation would drift. */
const LIFE = /^Life\s+(-?\d+)\s*→\s*(-?\d+)$/;
const DREW = /^Drew a card$/;
const DIED = /^Died\b/;
const ENTERED = /^Entered battlefield$/;
const LEFT_TO = /^Left battlefield → (.+?)(?: ·|$)/;
const ZONE_TO_ZONE = /^(\w+) → (\w+)/;
const COMBAT = /\bcombat\b/;
const COMMANDER_DAMAGE = /· commander damage$/;

/** cardId -> the card, from every zone of every seat. The feed carries ids; the rules want types. */
export function cardIndex(state) {
  const out = new Map();
  for (const player of state?.players || []) {
    for (const zone of Object.values(player?.zones || {})) {
      for (const card of zone?.cards || []) if (card?.cardId !== undefined) out.set(card.cardId, card);
    }
  }
  return out;
}

const battlefieldSize = (state) =>
  (state?.players || []).reduce((n, p) => n + (p?.zones?.Battlefield?.cards?.length || 0), 0);

/* R9: "Board wipe: play sfx_event_board_wipe once per wipe effect, not per card destroyed."
 *
 * The pack gives no number, and neither does the repository's own glossary, which the pack cites
 * as its source. What the glossary DOES give is the shape: a wipe "destroys, exiles, or otherwise
 * removes most or all creatures (or other permanents) at once".
 *
 * So "at once" is one batch of feed rows, and "most" is measured rather than guessed: the board
 * that is left plus what just left it is the board there was, and a majority of it going at once
 * is a wipe. The floor is the one number that is this repository's and not the glossary's --
 * below it, a two-creature board trading in combat would sound like a Wrath of God.
 */
export const WIPE_FLOOR = 3;
export function isBoardWipe(departed, remaining) {
  return departed >= WIPE_FLOOR && departed > remaining;
}

/* What the pack ships for a permanent leaving play, by what the permanent was. The index's own
   trigger text decides: sfx_event_dies is "when a creature dies", sfx_event_destroy is "when a
   permanent is destroyed". */
const leavingSound = (card) => (/\bCreature\b/.test(card?.typeLine || "") ? "sfx_event_dies" : "sfx_event_destroy");

/**
 * The slugs one poll's worth of new rows should make, oldest first.
 *
 * `seen` is mutated and owned by the caller across polls, exactly as table-notices.mjs does it.
 * On the first call the whole feed is already history -- somebody opening the board mid-game does
 * not want eighty sounds at once -- so it is marked seen and nothing is returned.
 */
export function soundsFor(recent, seen, {viewerSeatId, state, priming = false} = {}) {
  const rows = [];
  for (const row of Array.isArray(recent) ? recent : []) {
    if (!row || !row.id || seen.has(row.id)) continue;
    seen.add(row.id);
    rows.push(row);
  }
  if (priming || !rows.length) return [];
  rows.reverse();   /* the feed is newest first; a batch is played in the order it happened */

  const cards = cardIndex(state);
  const out = [];
  /* Two things have to be known about the whole batch before any single row can be answered:
     which players took damage (so their life row is not voiced twice), and which cards were cast
     (so the permanent they became does not announce itself a second time on arrival). */
  const damaged = new Set(rows.filter((r) => r.kind === "GameEventPlayerDamaged").map((r) => r.playerId));
  const cast = new Set(rows.filter((r) => r.kind === "GameEventSpellAbilityCast" && r.cardId !== null).map((r) => r.cardId));
  const departures = rows.filter((r) => r.kind === "GameEventCardChangeZone"
    && (DIED.test(r.label || "") || LEFT_TO.test(r.label || "")));
  const wipe = isBoardWipe(departures.length, battlefieldSize(state));
  let tokensAnnounced = false, wipeAnnounced = false;

  for (const row of rows) {
    const label = row.label || "";
    const card = cards.get(row.cardId);

    /* R1-R7: a card being played is the one moment that uses the card rules. An activated or
       triggered ability is not a card being cast, so it makes no card sound. */
    if (row.kind === "GameEventLandPlayed" || (row.kind === "GameEventSpellAbilityCast" && label === "Spell cast")) {
      out.push(...resolveCardSounds(card?.typeLine));
      continue;
    }

    if (row.kind === "GameEventAttackersDeclared") { if (!/^No attackers/.test(label)) out.push("sfx_event_attack"); continue; }
    if (row.kind === "GameEventBlockersDeclared") { out.push("sfx_event_block"); continue; }
    if (row.kind === "GameEventPlayerPoisoned") { out.push("sfx_event_poison"); continue; }
    if (row.kind === "mechanic-choice-completed" || row.name === "Proliferate") { out.push("sfx_event_proliferate"); continue; }

    if (row.kind === "GameEventPlayerDamaged") {
      /* Combat damage has its own clip and commander damage has its own again. Damage from a
         burn spell is not combat and the pack has no clip for it, so it is heard as the life it
         cost -- which is what the life_loss row's own trigger text, "(non-combat)", describes. */
      if (COMMANDER_DAMAGE.test(label)) out.push("sfx_event_commander_damage");
      else if (COMBAT.test(label)) out.push("sfx_event_combat_damage");
      else out.push("sfx_event_life_loss");
      continue;
    }

    const life = LIFE.exec(label);
    if (life) {
      const delta = Number(life[2]) - Number(life[1]);
      if (delta > 0) out.push("sfx_event_life_gain");
      /* A life total falling is how damage is REPORTED as well as how it is lost, so a player who
         already has a damage row this batch would otherwise hear the same hit twice. */
      else if (delta < 0 && !damaged.has(row.playerId)) out.push("sfx_event_life_loss");
      continue;
    }

    /* Your turn, which the feed has never announced as such: there is no turn-began event here.
       The untap step is the one step every turn begins with and no player ever acts in (CR 502),
       so a phase row for the viewer's own untap is the turn changing hands. */
    if (row.kind === "GameEventTurnPhase") {
      if (label === "untap" && row.playerId === viewerSeatId) out.push("sfx_event_your_turn");
      continue;
    }

    if (row.kind !== "GameEventCardChangeZone") continue;

    if (DREW.test(label)) { out.push("sfx_event_draw"); continue; }

    if (ENTERED.test(label)) {
      /* R10: "one create_tokens SFX per batch, not per token." A token is the card saying so --
         the probe reports it -- rather than the label, which cannot tell a token from a creature. */
      if (card?.token) { if (!tokensAnnounced) { tokensAnnounced = true; out.push("sfx_event_create_tokens"); } continue; }
      /* A permanent arriving right after the spell that cast it is not a separate moment, and R8
         only adds an event sound when it is one. The notices rule reached the same conclusion for
         the same reason: announcing both says the same thing twice. */
      if (!cast.has(row.cardId)) out.push("sfx_event_etb");
      continue;
    }

    if (DIED.test(label) || LEFT_TO.test(label)) {
      if (wipe) { if (!wipeAnnounced) { wipeAnnounced = true; out.push("sfx_event_board_wipe"); } continue; }
      const destination = LEFT_TO.exec(label)?.[1];
      if (destination === "Exile") out.push("sfx_event_exile");
      else out.push(leavingSound(card));
      continue;
    }

    const move = ZONE_TO_ZONE.exec(label);
    if (move) {
      if (move[2] === "Exile") out.push("sfx_event_exile");
      else if (move[1] === "Library" && move[2] === "Graveyard") out.push("sfx_event_mill");
    }
  }
  return out;
}

/* WHAT THE PACK SHIPS THAT THIS CANNOT PLAY, and why -- so nobody hunts for a bug that is a
 * missing input rather than a missing branch:
 *
 *   sfx_event_counterspell  The feed has no row for it. GameEventSpellRemovedFromStack reaches
 *                           public-stack.mjs but match-telemetry.mjs drops it, so a countered
 *                           spell is invisible here. Adding that row is a telemetry change.
 *   sfx_event_equip         Both need to know an ability IS an equip or a crew, which is card
 *   sfx_event_crew          semantics the engine does not report. CrankCardScript@1 is the
 *                           dependency, the same one the blocked board alerts wait on.
 *   sfx_event_victory       Read from state.gameOver rather than from a row, so they belong with
 *   sfx_event_defeat        the background music that has to stop for them.
 *   sfx_ui_priority_nudge   Belongs to the force-recovery path, which is not a table event.
 */
export const UNREACHABLE_FROM_THE_FEED = [
  "sfx_event_counterspell", "sfx_event_equip", "sfx_event_crew",
  "sfx_event_victory", "sfx_event_defeat", "sfx_ui_priority_nudge",
];
