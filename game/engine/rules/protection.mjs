/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* PROTECTION (CR 702.16): "You and creatures you control have protection from the chosen card type" (Serra's Emissary; the
 * live-game plan of 2026-10-04, lane W6).
 *
 * A static ability `rule: "protection"` on a permanent: `affects` the permanents that have it, read as they are now
 * (rules/layers.mjs, staticAffects); `players: "you"`, its controller has it too (CR 702.16j); `from` the quality --
 * `{types: [...]}`, a card type, which may be the one its permanent chose as it entered ("$chosen", script/chosen.mjs),
 * or "everything" (CR 702.16j), or `{colors: [...]}`, a color -- "protection from black" (Karmic Guide), or `{multicolored:
 * true}`, two or more colors (CR 105.2b; Argentum Masticore) -- the keyword compiled
 * to this static on its own permanent (cards/index.mjs). A source has the quality when it is an object of one of those card
 * types or colors, as it now is.
 *
 * What protection does is read where each thing happens (DEBT, CR 702.16b-f, j):
 *   Damage from such a source is prevented          rules/replacement.mjs, applyReplacements
 *   Enchanted or equipped by one, it cannot be        rules/sba.mjs (CR 704.5m, 704.5n); effects/permanents.mjs, attach
 *   Blocked by one, it cannot be                      rules/combat.mjs, canBlockAttacker
 *   Targeted by a spell or ability from one, never    script/filter.mjs (a permanent, or a player)
 */

import {staticAffects, typesOf, colorsOf, controllerOf, onceAQuestion, staticAbilities} from "./layers.mjs";
import {chosenFor} from "../script/chosen.mjs";
import {commanderIdentity, hasCommander} from "./commander.mjs";

/* Every protection there is now, each with what it covers and its quality: once a question, since a question asks it of
   every target candidate. */
const protections = (state) => onceAQuestion(state, "protections", () => gatherProtections(state));
function gatherProtections(state) {
  const found = [];
  /* Its abilities as they are after layer 6 (CR 613.1f): one that lost them all gives no protection. */
  const held = staticAbilities(state);
  for (const holderId of state.zones.battlefield ?? []) {
    const holder = state.objects[holderId];
    for (const own of holder ? held(holderId) : []) {
      if (own.kind !== "static" || own.rule !== "protection") continue;
      found.push({ability: holder.chosen !== undefined ? chosenFor(own, holder) : own, holderId, controller: controllerOf(state, holderId)});
    }
  }
  return found;
}

/* "PROTECTION FROM EACH COLOR THAT'S NOT IN YOUR COMMANDER'S COLOR IDENTITY" (Commander's Plate; wave 4c, k2): the colors
   outside the identity of the commanders of the protection's controller (`holder`), their union (CR 903.4, 702.124c) -- each
   of the five when that identity is colorless, and none for a player with no commander, whose commander's identity is
   undefined (903.4f; the card's ruling). Read as each question is asked: whose it is can change with control. */
function qualityColors(state, from, holder) {
  if (from?.outsideCommanderIdentity !== true) return from?.colors ?? [];
  if (!Number.isInteger(holder) || !hasCommander(state, holder)) return [];
  const identity = commanderIdentity(state, holder);
  return ["W", "U", "B", "R", "G"].filter((color) => !identity.includes(color));
}

/* Whether a source has the quality (CR 702.16a): "everything", one of the card types, or one of the colors (`colors`,
   "protection from black": Karmic Guide), as the source is now -- a permanent through the layers, a spell on the stack or a
   card elsewhere as it is. */
function hasQuality(state, from, sourceId, holder = null) {
  if (from === "everything") return true;
  if (sourceId === null || sourceId === undefined || !state.objects[sourceId]) return false;
  const onBattlefield = state.objects[sourceId].zone === "battlefield";
  const types = onBattlefield ? typesOf(state, sourceId) : (state.objects[sourceId].types ?? []);
  if ((from?.types ?? []).some((type) => types.includes(type))) return true;
  const colors = onBattlefield ? colorsOf(state, sourceId) : (state.objects[sourceId].colors ?? []);
  /* "Protection from multicolored" (Argentum Masticore): a source of two or more colors (CR 105.2b). */
  if (from?.multicolored === true && colors.length >= 2) return true;
  return qualityColors(state, from, holder).some((color) => colors.includes(color));
}

/**
 * HEXPROOF FROM [QUALITY] (CR 702.11d; Skrelv, Defector Mite): "This permanent can't be the target of [quality] spells your
 * opponents control or abilities your opponents control from [quality] sources" -- an effect for a while (effectUntil's
 * `rule: "hexproof-from"`, its `colors`; "hexproof from that color until end of turn"), over the permanents it names. Whether
 * `id` has it from `sourceId` -- the spell, or the ability's source -- of one of those colors as it now is, for a spell or
 * ability of `chooser`'s, an opponent of its controller (script/filter.mjs asks as a target is chosen, and again as it
 * resolves). A hexproof from ability is a hexproof ability (702.11d).
 */
export function hexproofFrom(state, id, chooser, sourceId) {
  if (sourceId === null || sourceId === undefined || !state.objects[sourceId] || controllerOf(state, id) === chooser) return false;
  const colors = state.objects[sourceId].zone === "battlefield" ? colorsOf(state, sourceId) : (state.objects[sourceId].colors ?? []);
  /* Being a hexproof ability, it is lost with hexproof (Shadowspear's "lose hexproof", rules/layers.mjs removeKeywords; the
     card's ruling): one given before that effect is gone, one given after it is had (CR 613.7). */
  const lostAt = Math.max(-1, ...(state.effects ?? []).filter((e) => (e.apply?.removeKeywords ?? []).includes("Hexproof") && (e.affects?.ids ?? []).includes(id)).map((e) => e.timestamp ?? 0));
  return (state.effects ?? []).some((e) => e.rule === "hexproof-from" && (e.timestamp ?? 0) > lostAt && (e.affects?.ids ?? []).includes(id) && (e.colors ?? []).some((c) => colors.includes(c)));
}

/**
 * A PLAYER'S HEXPROOF FROM [QUALITY] (CR 702.11d, 702.11c; Veil of Summer): "you ... gain hexproof from blue and from black
 * until end of turn" -- the same effect over the players it names (effectUntil's `players`): `player` can't be the target of a
 * spell of `chooser`'s, an opponent of theirs, or an ability from a source of theirs, of one of those colors as it now is.
 */
export function playerHexproofFrom(state, player, chooser, sourceId) {
  if (!state.objects[sourceId] || player === chooser) return false;
  const colors = state.objects[sourceId].zone === "battlefield" ? colorsOf(state, sourceId) : (state.objects[sourceId].colors ?? []);
  return (state.effects ?? []).some((e) => e.rule === "hexproof-from" && (e.players ?? []).includes(player) && (e.colors ?? []).some((c) => colors.includes(c)));
}

/**
 * Whether this permanent (`card`) or this player (`player`) has protection from this source.
 * @param {object} state
 * @param {{card?: number, player?: number}} who
 * @param {?number} sourceId
 */
export function protectedFrom(state, {card = null, player = null}, sourceId) {
  if (sourceId === null || sourceId === undefined) return false;
  /* "They gain protection from everything" (Teferi's Reproach): an effect over players (effectUntil's `rule: "protection"`). */
  if (player !== null && player !== undefined && (state.effects ?? []).some((e) => e.rule === "protection" && (e.players ?? []).includes(player) && hasQuality(state, e.from, sourceId))) return true;
  /* "Creatures you control gain ... protection from each color until end of turn" (Akroma's Will): an effect over the
     permanents it named as it resolved (effectUntil's `rule: "protection"` with `selector` or `targets`; CR 611.2c), each for
     as long as it is that object (CR 400.7). "From each color" is a protection from each of the five (`colors`). */
  if (card !== null && card !== undefined
    && (state.effects ?? []).some((e) => e.rule === "protection" && (e.affects?.ids ?? []).includes(card) && hasQuality(state, e.from, sourceId))) return true;
  for (const {ability, holderId, controller} of protections(state)) {
    if (!hasQuality(state, ability.from, sourceId, controller)) continue;
    if (card !== null && card !== undefined && ability.affects && state.objects[card]?.zone === "battlefield"
      && staticAffects(state, {affects: ability.affects, sourceId: holderId}, card, controller)) return true;
    if (player !== null && player !== undefined && ability.players === "you" && player === controller) return true;
  }
  return false;
}
