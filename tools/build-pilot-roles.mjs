#!/usr/bin/env node
/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
 *
 * THE PILOTS' ROLES TABLE (docs/ai-players/PLAN-2026-10-26.html §4 and §4b): which cards compound, loop, drain, double or
 * are known salty, and how dangerous a commander is, as a few kilobytes the room can hand every AI seat. The graph corpus
 * (data/graph.json, 16 MB) classifies every card's text -- roles, multipliers, triggers, mechanics -- but cannot ride into
 * a Worker; this reads it once, keeps only what the engine can play (game/engine/cards/definitions.mjs) and only the cards
 * that have a role, and writes game/engine/pilots/roles-data.mjs.
 *
 *   node tools/build-pilot-roles.mjs            write the module
 *   node tools/build-pilot-roles.mjs --check    exit 1 if the module is not what the sources say
 *
 * THE FLAGS (one letter each, a card's string is its flags in this order):
 *   D doubler       multiplies mana, tokens, counters, cards, triggers, attacks, life loss ...       (a permanent)
 *   W draw engine   a permanent that draws on a trigger or an ability
 *   T token engine  a permanent that makes tokens on a trigger or an ability
 *   U untapper      a permanent that untaps others
 *   R recursion     a permanent that brings cards back, again
 *   C copier        a permanent that copies
 *   L loop piece    an untapper, copier or blinker: the cornerstone a loop is built round, when its partner is in sight
 *   X extra turn    an extra turn or an extra combat
 *   B bleed         drain, poison, infect, extort: damage that goes round the board
 *   G game changer  on Wizards' list
 *   S salty         a game changer, an extra turn, or on data/ai-players/salty-cards.json (Rob's to edit)
 *   A answer        removal: what a player holds up, or casts, against a threat
 *   K wipe          a mass answer: it takes the board, mine with theirs (the pilot weighs what it costs the caster)
 *   P ramp          mana ahead of the curve
 * An ENGINE LINK is D, W, T, U, R or C on a permanent; the threat signal counts them (pilots/threat.mjs).
 *
 * A COMMANDER'S CLASS, 0 to 1, from the strategies the catalog classifies it into (data/commander-strategies.json): the loops
 * and extra turns highest, the engines in the middle, the tribal and stat payoffs lowest; the most popular get a little more.
 * Only a class of 0.35 or more is kept; the rest read 0.
 */
import {readFileSync, writeFileSync} from "node:fs";
import {DEFINITIONS} from "../game/engine/cards/definitions.mjs";

const ROOT = new URL("../", import.meta.url);
const OUT = new URL("game/engine/pilots/roles-data.mjs", ROOT);
const read = (p) => JSON.parse(readFileSync(new URL(p, ROOT), "utf8"));
export const fold = (name) => String(name ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9/ ]+/g, "").replace(/\s+/g, " ").trim();

const PERMANENT = ["Creature", "Artifact", "Enchantment", "Planeswalker"];
const BLEED = new Set(["infect", "toxic", "extort", "drain life", "blood drain", "poison", "rad"]);
/* What a classified strategy says about a commander (the vocabulary of data/commander-strategies.json). */
const STRATEGY = {"untap-loop": 1, "extra-turns": 1, "copy-loop": 0.9, "blink-loop": 0.8, "tutor-chain": 0.8, "recursion-loop": 0.7, "sacrifice-supply": 0.6,
  "etb-payoff": 0.5, "death-payoff": 0.5, "draw-payoff": 0.5, "counters": 0.5, "landfall": 0.4, "spellslinger": 0.4, "team-quality": 0.35, "stat-payoff": 0.3, "tribal-payoff": 0.3};
const KEEP_CLASS = 0.35, POPULAR = 300, POPULAR_BONUS = 0.1;
const ORDER = ["D", "W", "T", "U", "R", "C", "L", "X", "B", "G", "S", "A", "K", "P"];

export function build() {
  const graph = read("data/graph.json"), strategies = read("data/commander-strategies.json");
  const salty = new Set(read("data/ai-players/salty-cards.json").cards.map(fold));
  const byName = new Map();
  for (const c of graph.cards) byName.set(fold(c.name), c);
  const cards = {}, missingSalty = [...salty].filter((n) => !DEFINITIONS[n]);
  /* The structural half: what the engine's own ability records say a permanent does, whatever the corpus classified. */
  const effectsOf = (def) => (def.abilities ?? []).filter((a) => a.kind === "triggered" || a.kind === "activated").flatMap((a) => (a.effects ?? []).map((e) => e.effect));
  for (const [key, entry] of Object.entries(DEFINITIONS)) {
    const def = entry.definition, g = byName.get(key);
    const permanent = (def.types ?? []).some((t) => PERMANENT.includes(t));
    const roles = new Set(g?.roles ?? []), multiplies = g?.multiplies ?? [], triggers = g?.triggers ?? [], mech = (g?.mechanics ?? []).map((m) => String(m).toLowerCase());
    const eff = effectsOf(def);
    const live = (g?.triggers?.length ?? 0) > 0 || eff.length > 0;
    const f = new Set();
    if (permanent && multiplies.length) f.add("D");
    if (permanent && (roles.has("draw") && live || eff.includes("draw"))) f.add("W");
    if (permanent && ((g?.produces ?? []).includes("token") || eff.includes("createToken")) && live) f.add("T");
    if (permanent && roles.has("untap")) f.add("U");
    if (permanent && roles.has("recursion")) f.add("R");
    if (permanent && roles.has("copy")) f.add("C");
    if (permanent && (roles.has("untap") || roles.has("copy") || roles.has("blink"))) f.add("L");
    if (roles.has("extra-turn")) f.add("X");
    if (mech.some((m) => BLEED.has(m)) || (permanent && ((g?.causes ?? []).includes("life-loss") || eff.includes("loseLife")) && live)) f.add("B");
    if (g?.gameChanger) f.add("G");
    if (f.has("G") || f.has("X") || salty.has(key)) f.add("S");
    if (roles.has("removal")) f.add("A");
    if (roles.has("wipe")) f.add("K");
    if (roles.has("ramp")) f.add("P");
    if (f.size) cards[key] = ORDER.filter((l) => f.has(l)).join("");
    void triggers;
  }
  /* A commander's class: its strongest strategy, and a little more for the most played. */
  const commanders = {};
  for (const c of strategies.commanders) {
    const base = Math.max(0, ...(c.strategies ?? []).map((s) => STRATEGY[s] ?? 0));
    const rank = byName.get(fold(c.name))?.rank;
    const cls = Math.min(1, base + (base > 0 && Number.isFinite(rank) && rank > 0 && rank <= POPULAR ? POPULAR_BONUS : 0));
    if (cls >= KEEP_CLASS) commanders[fold(c.name)] = Math.round(cls * 100) / 100;
  }
  return {cards, commanders, missingSalty, from: {graph: graph.generatedAt, strategies: strategies.generatedAt}};
}

export function moduleText(b = build()) {
  const rows = (o) => Object.entries(o).sort(([x], [y]) => (x < y ? -1 : 1)).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join("\n");
  return `/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* GENERATED by tools/build-pilot-roles.mjs from data/graph.json (${b.from.graph}), data/commander-strategies.json (${b.from.strategies}),
 * data/ai-players/salty-cards.json and the engine's definitions -- do not edit; run it with no argument to write. A Worker reads no
 * file system, so what the pilots know about a card's role reaches them as this module (game/engine/pilots/roles.mjs). */

export const CARD_FLAGS = Object.freeze({
${rows(b.cards)}
});

export const COMMANDER_CLASS = Object.freeze({
${rows(b.commanders)}
});
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const b = build(), text = moduleText(b);
  if (b.missingSalty.length) console.log(`note: ${b.missingSalty.length} names in salty-cards.json are not engine cards yet and are unused: ${b.missingSalty.slice(0, 8).join("; ")}${b.missingSalty.length > 8 ? " ..." : ""}`);
  if (process.argv.includes("--check")) {
    let now = "";
    try {now = readFileSync(OUT, "utf8");} catch {}
    if (now !== text) {console.error("game/engine/pilots/roles-data.mjs is not what its sources say: run node tools/build-pilot-roles.mjs"); process.exit(1);}
    console.log("roles-data.mjs matches its sources");
  } else {
    writeFileSync(OUT, text);
    console.log(`wrote game/engine/pilots/roles-data.mjs: ${Object.keys(b.cards).length} cards, ${Object.keys(b.commanders).length} commanders, ${(text.length / 1024).toFixed(0)} KB`);
  }
}
