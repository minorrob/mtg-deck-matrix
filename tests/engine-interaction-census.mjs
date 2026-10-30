/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE INTERACTION CENSUS (game/tools/interaction-census.mjs): the second check on what the extraction captured and what a player is offered.
 *
 * Linear ROB-317, 326, 330 and 331 (2026-10-29) were four cards whose scenarios passed because the scenario floated the mana by hand, and
 * whose real play did not offer the way: Ash Barrens' cycling, Tezzeret's Gambit's life payment, Hall of Echoes' {5} ability, a Food
 * token's sacrifice. This suite holds the check that would have caught them to what AGENTS.md asks of every test -- it goes red when the
 * thing it tests is broken:
 *
 *   1. The Oracle text parser, on the cases that fooled it while it was built (a granted ability in quotes, "battlefield" read as a battle,
 *      "target X, target Y" read as a union, a Siege's "choose Khans or Dragons" read as a modal spell).
 *   2. Every Layer A detector, against a REAL definition with one way removed: quiet on the original, red on the copy.
 *   3. Layer B's comparison, with the engine replaced by a probe that offers only when the mana is floated, only one way, or always.
 *   4. The compiler's gate: a translation that fills a target's type from the card's own type (Prison Realm: "creature or planeswalker"
 *      compiled as Enchantment or Planeswalker) is refused.
 *   5. The directory and the committed candidates against the baseline (docs/engine/interaction-census-baseline.json), a ratchet:
 *      nothing new, nothing fixed and still listed, and the counts of what was examined above a floor so a parser that finds nothing fails.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {loadCardScripts, loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileCard, scriptOf} from "../game/tools/card-compiler.mjs";
import {createLibrary} from "../game/engine/cards/sentences.mjs";
import {oracleFacets, extractionFindings, paymentWays, fundingFindings, wholeCensus, againstBaseline, readBaseline, keyOf, CLASS_OWNERS} from "../game/tools/interaction-census.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const scripts = loadCardScripts().map((e) => e.script);
const byName = new Map(scripts.map((s) => [s.identity.name, s]));
const card = (name) => { const s = byName.get(name); assert.ok(s, `${name} is not in the card directory`); return structuredClone(s); };
const codes = (def) => extractionFindings(def).map((f) => f.code);

{
  /* 1. The parser, on the text that fooled it. */
  eq(oracleFacets("Choose one —\n• Draw a card.\n• Gain 2 life.").modes, {headers: 1, bullets: 2}, "a modal spell: its header and its bullets");
  eq(oracleFacets("As this enchantment enters, choose Khans or Dragons.\n• Khans — Add {G}{G}.\n• Dragons — Fight.").modes, null, "a Siege's choice is not a modal spell");
  eq(oracleFacets("Lands you control have \"{T}: Add {C}.\"").activated, [], "an ability granted in quotes is not this card's own");
  eq(oracleFacets("{T}: Add {C}.\nLands you control have \"{T}: Add one mana of any color.\"").activated.length, 1, "only the card's own line counts beside a granted one");
  eq(oracleFacets("Exile target creature or planeswalker.").targetUnions, ["creature,planeswalker"], "a union of two types");
  eq(oracleFacets("Destroy target artifact, target creature, target enchantment, and target land.").targetUnions, [], "four targets are not a union");
  eq(oracleFacets("Exile target creature, then return it to the battlefield.").targetUnions, [], "\"battlefield\" is not a battle");
  eq(oracleFacets("Basic landcycling {1}\n{T}: Add {C}.").cycling.length, 1, "cycling by another name");
  eq(oracleFacets("{2}, {T}, Sacrifice this artifact: You gain 3 life.").activated[0].parts, ["{2}", "{T}", "Sacrifice this artifact"], "a cost split at its commas, not inside its braces");
  eq(oracleFacets("Kicker {1}{G} (You may pay an additional {1}{G}.)\nDraw a card.").keywords, ["kicker"], "a way keyword at the start of a line");

  /* The ways of a cost, as the lands that pay each. */
  const gambit = paymentWays("{3}{U/P}");
  eq(gambit.map((w) => [w.lands.length, w.via.join()]), [[4, "mana"], [3, "life"]], "{3}{U/P}: three Wastes and an Island, or three Wastes and 2 life");
  eq(paymentWays("{2/W}{W/U}").length, 4, "{2/W}{W/U}: two ways times two");
  eq(paymentWays("{X}{R}").map((w) => w.lands), [["Mountain"]], "{X} is paid at 0");
  eq(paymentWays("").length, 1, "no cost: one way, with nothing to pay");
}

{
  /* 2. Each Layer A detector, against a real definition with one way removed. */
  const flashback = scripts.find((s) => /^Flashback/m.test(s.oracleText) && s.abilities.some((a) => a.keyword === "flashback"));
  const sacrificer = scripts.find((s) => s.abilities.some((a) => a.kind === "activated" && /^\{[^}]+\}.*Sacrifice/.test(a.text ?? "") && (a.cost ?? []).some?.((c) => c.atom === "sacrifice") && (a.cost ?? []).some((c) => c.atom === "mana")));
  ok(flashback && sacrificer, "the directory still has a flashback card and a mana-and-sacrifice ability to break");
  const mutations = [
    ["Abrade", "MODES_DROPPED", (d) => { d.abilities[0].effects = []; }],
    ["Abrade", "MODES_COUNT", (d) => { d.abilities[0].effects[0].modes.pop(); }],
    ["Ash Barrens", "CYCLING_DROPPED", (d) => { d.abilities = d.abilities.filter((a) => !a.cycling); }],
    [flashback.identity.name, "WAY_KEYWORD_DROPPED", (d) => { d.abilities = d.abilities.filter((a) => a.keyword !== "flashback" && !/^flashback/i.test(a.text ?? "")); }],
    ["Hall of Echoes", "ACTIVATED_DROPPED", (d) => { d.abilities.pop(); }],
    [sacrificer.identity.name, "COST_COMPONENT_DROPPED", (d) => { for (const a of d.abilities) if (Array.isArray(a.cost)) a.cost = a.cost.filter((c) => c.atom !== "sacrifice"); }],
    ["Ajani Resolute", "LOYALTY_DROPPED", (d) => { d.abilities.pop(); }],
    ["Flicker of Fate", "TARGET_UNION_NARROWED", (d) => { d.abilities[0].targets = [{what: "permanent", types: ["Creature"]}]; }],
    ["Flicker of Fate", "TARGET_UNION_NARROWED", (d) => { d.abilities[0].targets = [{what: "permanent", types: ["Creature", "Enchantment"]}]; }],
    ["Altar's Reap", "ADDITIONAL_COST_DROPPED", (d) => { delete d.abilities[0].additionalCost; }],
  ];
  for (const [name, code, mutate] of mutations) {
    ok(!codes(card(name)).includes(code), `${name} as written has no ${code}`);
    const broken = card(name);
    mutate(broken);
    ok(codes(broken).includes(code), `${name} with its way removed is ${code}`);
  }
  eq(Object.keys(CLASS_OWNERS).filter((code) => !mutations.some((m) => m[1] === code)).sort(),
    ["ACTIVATION_ONLY_WHEN_FLOATED", "CAST_ONLY_WHEN_FLOATED", "PAYMENT_WAY_MISSING", "SPREE_DROPPED"], "every class but Layer B's three and spree has a mutation above");
}

{
  /* 3. Layer B's comparison, with the engine out of it: the probe says what a state offers. */
  const hall = card("Hall of Echoes"), gambit = card("Tezzeret's Gambit"), abrade = card("Abrade");
  const floatedOnly = (def, subject, way, floated) => floated;
  const always = () => true;
  const manaWayOnly = (def, subject, way) => way.via.includes("mana");
  const classes = (found) => found.found.map((f) => f.code);
  eq(classes(fundingFindings(hall, null, floatedOnly)), ["ACTIVATION_ONLY_WHEN_FLOATED"], "an ability offered only once the mana is floated");
  eq(classes(fundingFindings(abrade, null, floatedOnly)), ["CAST_ONLY_WHEN_FLOATED"], "a spell offered only once the mana is floated");
  eq(classes(fundingFindings(hall, null, always)), [], "offered both ways: nothing to report");
  eq(classes(fundingFindings(gambit, null, manaWayOnly)), ["PAYMENT_WAY_MISSING"], "a Phyrexian cost offered for its mana and not for its life");
  eq(fundingFindings(gambit, null, () => false).tally.exercised, 0, "a card no state offers is counted as unexercised, not as clean");
}

{
  /* 3b. And the engine itself, on a card it handles: a spell the untapped lands can cast has no finding. */
  const index = loadCardIndex();
  eq(fundingFindings(card("Abrade"), index).found, [], "Abrade, castable from untapped lands, is clean");
  ok(fundingFindings(card("Abrade"), index).tally.exercised === 1, "and it was exercised, not skipped");
}

{
  /* 4. The compiler's gate. Prison Realm compiled by the sentence library filled the target's first type from the card's own. */
  const wrong = card("Abrade");
  wrong.identity.name = "Prison Realm";
  wrong.oracleText = "When this enchantment enters, exile target creature or planeswalker an opponent controls until this enchantment leaves the battlefield.";
  wrong.abilities = [{kind: "triggered", text: wrong.oracleText, targets: [{anyOf: [{what: "permanent", types: ["Enchantment"], controller: "opponent"}, {what: "permanent", types: ["Planeswalker"], controller: "opponent"}]}], effects: []}];
  eq(codes(wrong), ["TARGET_UNION_NARROWED"], "the translation that read the card's own type into the target");
  wrong.abilities[0].targets = [{anyOf: [{what: "permanent", types: ["Creature"], controller: "opponent"}, {what: "permanent", types: ["Planeswalker"], controller: "opponent"}]}];
  eq(codes(wrong), [], "and the translation that kept the text's two types");

  const oracle = JSON.parse(readFileSync(new URL("../data/engine/oracle.json", import.meta.url), "utf8"));
  const index = loadCardIndex();
  const library = createLibrary(scripts);
  const trust = () => ({ok: true, cards: 99, band: {band: "9", rate: 1, low: 1}});
  const record = oracle.cards.find((c) => c.name === "Prison Realm");
  const result = compileCard(record, {library, trust, definition: index.definition});
  ok(result.status === "refused" && result.why.some((w) => /^census: TARGET_UNION_NARROWED/.test(w)),
    `the compiler refuses Prison Realm for the census, not for something else: ${result.status} ${JSON.stringify(result.why ?? result.gaps ?? "")}`);
}

{
  /* 5. The ratchet, against the directory as it stands and the candidates the playtest tables load. */
  const baseline = readBaseline();
  const whole = await wholeCensus();
  const {added, fixed} = againstBaseline(whole.findings, baseline);
  eq(added.map((f) => `${f.card}: ${f.code}: ${f.detail}`).slice(0, 10), [], "no finding the baseline does not list -- a new card or a regression; fix it, never add it to the baseline");
  eq(fixed.slice(0, 10), [], "no finding the baseline lists that is gone -- run `node game/tools/interaction-census.mjs --write-baseline` and lower the ceilings below");
  eq(whole.findings.filter((f) => f.layer === "A").map((f) => `${f.card}: ${f.code}`), [], "Layer A, the extraction, is clean in the directory and in the candidates: nothing about it is baselined");

  /* The ceilings only come down. The numbers are the cards (not findings) on the day of 2026-10-30; fixing the engine lowers them. */
  const CEILING = {ACTIVATION_ONLY_WHEN_FLOATED: 893, CAST_ONLY_WHEN_FLOATED: 59};
  for (const [code, ceiling] of Object.entries(CEILING)) {
    const cards = new Set((baseline.classes[code]?.keys ?? []).map((k) => k.split("|")[0]));
    ok(cards.size <= ceiling, `${code} lists ${cards.size} cards, above its ceiling ${ceiling}`);
  }
  eq(Object.keys(baseline.classes).sort(), Object.keys(CEILING).sort(), "the baseline holds only the classes that have a ceiling");

  /* Non-vacuity: a parser that finds nothing would pass the ratchet. */
  const FLOOR = {modalCards: 80, wayKeywordLines: 100, cyclingLines: 150, activatedLines: 1500, loyaltyLines: 60, costParts: 2000, targetUnions: 150, hybridSymbols: 150};
  for (const [key, floor] of Object.entries(FLOOR)) ok((whole.directory.examined[key] ?? 0) >= floor, `Layer A examined ${whole.directory.examined[key]} ${key}, under the floor ${floor}`);
  ok(whole.directory.subjects >= 6000, `Layer B costed ${whole.directory.subjects} spells and abilities, under the floor 6000`);
  ok(whole.directory.exercised / whole.directory.subjects >= 0.9, `Layer B exercised ${whole.directory.exercised} of ${whole.directory.subjects}: under nine in ten`);
  ok(whole.candidates.exercised >= 90, `Layer B exercised ${whole.candidates.exercised} of the committed candidates' ${whole.candidates.subjects}`);
  ok(baseline.keys.has(keyOf({card: "Tezzeret's Gambit", code: "CAST_ONLY_WHEN_FLOATED", detail: "cast: offered once Wastes, Wastes, Wastes, Island are tapped into the pool by hand, not while they are untapped (way: mana)"})), "the four reported cards are in the baseline until the engine is fixed (ROB-326)");
}

console.log(`engine-interaction-census: ${checks} checks passed — the parser on the text that fooled it, ten detectors red on a real definition with a way removed, the funding comparison with the engine replaced by a probe, the compiler's gate on Prison Realm, and the directory and the candidates held to the ratchet.`);
