/* THE STRATEGY RANKING (R3.11's "Lab strategy"): CrankStrategies.optionsFor ranks what each commander offers -- the rules
 * text, then how decks and guides name it, both agreeing first, ties to the most distinctive; colors only when a
 * commander has no entry -- with the top fit first and the others "strong" or "good". In Node, over the committed data.
 *
 * The four-step Build wizard (Commander → Strategy → Budget → Review) that showed these chips was retired on 2026-10-23
 * (the Decks requirements' NEW-2): New deck's Create opens Start from and Define the Deck, walked by
 * tests/new-deck-flow.mjs, whose play styles are deck-vocabulary.js's (tests/deck-autocreate.mjs). This suite keeps the
 * ranking, which crankmagic-strategies.js still carries.
 */
import assert from "node:assert/strict";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const S = require("../crankmagic-strategies.js"), data = require("../data/commander-strategies.json"), universe = require("../data/commander-universe.json");
let checks = 0;
const ok = (c, msg) => { checks++; assert.ok(c, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };
const entry = (name) => data.commanders.find((c) => c.name === name) || null;
const counts = data.perStrategy, optionsOf = (name) => S.optionsFor({entry: entry(name), counts});

/* In Node: the ranking itself. */
{
  const krenko = optionsOf("Krenko, Mob Boss");
  eq(krenko[0].fit, "top fit", "the first option is the top fit");
  ok(krenko.slice(1).every((o) => o.fit === "strong" || o.fit === "good"), "the rest are strong or good");
  const both = krenko.filter((o) => /and the decks/.test(o.source)), rules = krenko.filter((o) => o.source === "rules text"), named = krenko.filter((o) => o.source === "the decks and guides");
  ok(krenko.indexOf(both.at(-1)) < krenko.indexOf(rules[0]) && krenko.indexOf(rules.at(-1)) < krenko.indexOf(named[0]), "what the rules text and the decks agree on comes first, then the rules text alone, then the decks alone");
  ok(rules.every((o) => o.fit === "strong") && named.every((o) => o.fit === "good"), "the rules text's are strong, the decks' alone good");
  eq(krenko[0].label, "Tribal payoff", "a tie goes to the more distinctive strategy: of the three Krenko's rules text and decks agree on, Tribal payoff is his");
  const tied = krenko.filter((o) => o.source === krenko[0].source).map((o) => counts[o.id]);
  ok(tied.every((n, i) => !i || tied[i - 1] <= n), "the tied ones in order of how few commanders share them");
  const everyone = data.commanders.map((c) => S.optionsFor({entry: c, counts}));
  ok(everyone.every((o) => o.length >= 1 && o[0].fit === "top fit"), `every one of the ${data.commanders.length} commanders in the file gets at least one option, the first a top fit`);
  eq(S.optionsFor({entry: null, colorIdentity: ["R"]}).map((o) => o.id), S.BY_COLOR.R, "a commander with no entry is read by its colors");
  eq(S.optionsFor({entry: null, colorIdentity: []}).map((o) => o.id), S.BY_COLOR.C, "and a colorless one by the colorless archetypes");
}

console.log(`build-wizard: ${checks} checks passed — what each commander offers, ranked: the rules text and the decks agreeing first, then the rules text, then the decks, ties to the most distinctive.`);
