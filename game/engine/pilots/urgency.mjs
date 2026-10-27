/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* RESPONSE URGENCY: RAMP, BUILD, OR ANSWER, AND HOW HARD (docs/ai-players/PLAN-2026-10-26.html §4b).
 *
 * Rob, 2026-10-26, on card selection: "based on what is on the table (across all players), does it make sense to ramp, build
 * up my board, is there something urgent that just hit the board I need to respond to with an instant speed card, can it
 * wait until my turn and I use a sorcery to tamp down that threat. Urgency would be based on if the card is a defined
 * cornerstone of infinite loops, the opponent's deck's core engine, a known salty card, a card that has bleed/poison or other
 * draining effects, a card that doubles things, etc. Easy wouldn't pay attention to this. Normal would have a light
 * temperature to it ... hard would be aware of it and have a moderate-high temperature to responding with appropriate degree
 * of urgency (not overkill; e.g. 1 card played that can become a threat because part of an infinite loop is not a reason to
 * cast a board wipe, for example, unless other creatures across opponents boards and few on yours. It's always about weighing
 * the significance of the immediate threat, the near-term threat, the long-term threat engine, and the costs to the caster at
 * each stage when determining what to cast."
 *
 * THREE TIERS, each 0 to 1, for any opposing permanent or spell on the stack, read from its role flags (roles.mjs), the
 * engine links its controller has on the board and the life I have left:
 *   immediate   it kills me or stops my turn: a creature whose damage is a share of my life, an extra turn, bleed when my life is low
 *   near        it wins or locks within a turn or two: a loop piece with its partner in sight (two links on the board), a doubler
 *               beside a link, a bleed engine, a commander that is itself an engine, a salty card
 *   long        a seed: one link with no partner, a doubler alone, a game changer
 * and `urgencyOf` weighs them 1 : 0.6 : 0.3 (TIER_WEIGHT), capped at 1.5.
 *
 * WHAT AN ANSWER IS WORTH is the urgency it removes, in worth (UNIT per full urgency), less what it costs the caster: the card's
 * mana value and, for a wipe, the worth of the caster's own permanents it takes too (`net`). THE PROPORTION RULE: an answer whose
 * net is not above 0 is never taken at Hard, so one loop seed never draws a board wipe unless the board's other creatures make the
 * wipe worth it on its own. The weight the net carries in a cast choice is the difficulty's (URGENCY): Easy 0, Normal 0.4, Hard 1.
 *
 * Pure over the seat's view and public facts: nothing here reads a card the seat could not.
 */
import {has, isLink, LINKS} from "./roles.mjs";

export const TIER_WEIGHT = Object.freeze({immediate: 1, near: 0.6, long: 0.3});
export const URGENCY = Object.freeze({easy: 0, normal: 0.4, hard: 1});
/* How much worth a fully urgent threat is worth removing: a creature of 4 power and 4 toughness is 6. */
export const UNIT = 8;
export const CAP = 1.5;
/* Evasion and extra damage make a hitter faster, as the threat table counts them (threat.mjs). */
const EVASION = {"Flying": 0.5, "Trample": 0.25, "Menace": 0.25, "Double Strike": 1, "Deathtouch": 0.25, "Lifelink": 0.1};

const isCreature = (card) => (card?.types ?? []).includes("Creature");
const clamp = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
const hits = (c) => Math.max(0, c.power ?? 0) * (1 + (c.keywords ?? []).reduce((n, k) => n + (EVASION[k] ?? 0), 0));

/**
 * The engine links each seat has on the board, and the table's reading of a card.
 * @returns {{myLife: number, links: Map<number, number>}}
 */
export function readTable(view, {seat, facts = () => null}) {
  const me = view?.players?.[seat];
  const links = new Map();
  for (const p of view?.players ?? []) {
    const n = (p.zones?.Battlefield?.cards ?? []).filter((c) => c.controller === p.playerId && isLink(facts(c.name)?.flags)).length;
    links.set(p.playerId, n);
  }
  return {myLife: Math.max(1, me?.life ?? 40), links};
}

/**
 * A card's three tiers. `card` is a permanent (a battlefield card, with a controller) or a stack entry's card (with `playerId`
 * as its controller); `commander` marks a commander on the battlefield. `facts` supplies `flags` and `commanderClass`.
 */
export function tiersOf(card, {facts = () => null, myLife = 40, links = new Map()} = {}) {
  const f = facts(card?.name) ?? {}, flags = f.flags ?? "";
  const who = card?.controller ?? card?.playerId;
  const partner = (links.get(who) ?? 0) >= 2;            // another link in sight beside this one
  const t = {immediate: 0, near: 0, long: 0};
  const up = (tier, v) => {t[tier] = Math.max(t[tier], clamp(v));};
  if (isCreature(card) && !(card.keywords ?? []).includes("Defender")) up("immediate", hits(card) / myLife);
  if (has(flags, "X")) up("immediate", 0.7);
  if (has(flags, "B")) {up("near", 0.4); if (myLife <= 12) up("immediate", 0.5);}
  if (has(flags, "L")) up(partner ? "near" : "long", partner ? 0.7 : 0.35);
  if (has(flags, "D")) up(partner ? "near" : "long", partner ? 0.6 : 0.4);
  if (has(flags, [...LINKS].filter((l) => l !== "D").join(""))) up(partner ? "near" : "long", partner ? 0.45 : 0.25);
  if (has(flags, "S")) up("near", 0.3);
  if (has(flags, "G")) up("long", 0.3);
  if (card?.commander && Number.isFinite(f.commanderClass)) up("near", f.commanderClass * 0.6);
  return t;
}

/** The weighted urgency of a card, 0 to CAP. */
export function urgencyOf(card, ctx) {
  const t = tiersOf(card, ctx);
  return Math.min(CAP, TIER_WEIGHT.immediate * t.immediate + TIER_WEIGHT.near * t.near + TIER_WEIGHT.long * t.long);
}

/** Every opposing permanent's urgency, by card id, and the spells opponents have on the stack. */
export function threatsOnTable(view, {seat, facts = () => null}) {
  const ctx = {...readTable(view, {seat, facts}), facts};
  const items = new Map();
  for (const p of view?.players ?? []) {
    if (p.playerId === seat) continue;
    for (const c of p.zones?.Battlefield?.cards ?? []) if (c.controller === p.playerId) items.set(c.cardId, {card: c, controller: p.playerId, urgency: urgencyOf(c, ctx)});
  }
  const stack = (view?.stack ?? []).filter((e) => e.playerId !== seat && e.name).map((e) => ({name: e.name, playerId: e.playerId, urgency: urgencyOf({name: e.name, playerId: e.playerId, types: []}, ctx)}));
  return {ctx, items, stack, total: [...items.values()].reduce((n, i) => n + i.urgency, 0)};
}

/**
 * What an answer nets: the worth of the urgency it removes, less its cost. `removed` is the summed urgency of what it takes from
 * the opponents; `cost` its mana value; `collateral` the worth of the caster's own permanents a wipe takes too.
 */
export const netOf = ({removed, cost, collateral = 0}) => removed * UNIT - cost - collateral;

/**
 * The mana to leave up for an instant answer (Hard, on its own turn): the cheapest answer it holds, when the table holds a seed
 * worth answering -- an opponent with an engine link, a commander that is itself an engine, or a seat whose threat reads high.
 */
export function holdFor({hand, facts, threats}) {
  const answers = hand.map((c) => facts(c.name)).filter((f) => f && has(f.flags, "A") && (f.types ?? []).includes("Instant"));
  if (!answers.length) return 0;
  const worry = threats.rows.some((r) => r.signals.engine > 0 || r.signals.commander >= 0.8 || r.score >= 0.6);
  return worry ? Math.min(...answers.map((f) => f.manaValue ?? 0)) : 0;
}
