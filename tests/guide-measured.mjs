// "How to play it", generated from the list -- and the hand-written Splinter guide.
//
// The generator's promise is narrow and checkable: every card it names is in the deck, every
// number it states is in the shape, and it says nothing the list cannot show. guide-agent.js
// already owns the checker that proves the first two for a model's prose; here it is run over
// the generator's prose and over the one guide a person wrote, against the same registry of
// every Commander-legal name.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const C = require("../card-catalog.js");
const G = require("../guide-measured.js");
const Agent = require("../guide-agent.js");

let checks = 0;
const check = (label, fn) => { fn(); checks += 1; console.log("  ok  " + label); };
const at = (p) => new URL(p, import.meta.url);

const cards = JSON.parse(readFileSync(at("../data/cards.json"), "utf8")).cards;
const byName = new Map(cards.map((c) => [c.name.toLowerCase(), c]));
for (const c of cards) if (c.flavorName) byName.set(c.flavorName.toLowerCase(), c);
const universe = JSON.parse(readFileSync(at("../data/commander-universe.json"), "utf8"));
const registry = universe.cards.map((row) => row[universe.fields.indexOf("name")]);
const guides = JSON.parse(readFileSync(at("../data/deck-guides.json"), "utf8"));

// The Splinter list, rebuilt from the guide's own shape counts is not possible; the list is
// the one Rob imported, held here by name so the test does not depend on a private upload.
const SPLINTER = `1 An Offer You Can't Refuse|1 April O'Neil, Live on the Scene|1 Arcade Cabinet|1 Arcane Denial|1 Arcane Signet|1 Ash Barrens|1 Caves of Koilos|1 Changeling Outcast|1 Chromatic Lantern|1 Command Tower|1 Counterspell|1 Cover of Darkness|1 Dark Leo & Shredder|1 Darksteel Mutation|1 Don & Leo, Problem Solvers|1 Donatello, the Brains|1 Donatello's Technique|1 Duty Beyond Death|1 Endless Foot Assault|1 Exotic Orchard|1 Fabled Passage|1 Feed the Swarm|1 Fellwar Stone|1 Foot Chopper|1 Foot Ninjas|1 Fugitive Droid|1 Game Over|1 Gloomlake Verge|1 Grand Coliseum|1 Grounded for Life|1 Hallowed Fountain|1 Hidden Lair|9 Island|1 Kaito, Bane of Nightmares|1 Kaito, Cunning Infiltrator|1 Karai, Future of the Foot|1 Krang & Shredder|1 Lightning Greaves|1 Mistblade Shinobi|1 Momo, Playful Pet|1 Moon-Circuit Hacker|1 Nashi, Moon Sage's Scion|1 Ninja Teen|1 Oroku Saki, Shredder Rising|1 Path of Ancestry|1 Path to Exile|5 Plains|1 Prehistoric Pet|1 Prosperous Thief|1 Satoru Umezawa|1 Secluded Courtyard|1 Shark Shredder, Killer Clone|1 Shattered Sanctum|1 Shredder, Shadow Master|1 Silver-Fur Master|1 Sinister Sabotage|1 Slither Blade|1 Sol Ring|1 Spark Double|1 Splinter, Hamato Yoshi|1 Splinter, the Mentor|1 Splinter, Vengeful Sensei|1 Sunken Hollow|9 Swamp|1 Swiftfoot Boots|1 Taeko, the Patient Avalanche|1 Talisman of Dominance|1 Talisman of Hierarchy|1 Talisman of Progress|1 Terramorphic Expanse|1 The Last Ronin's Technique|1 Thousand-Faced Shadow|1 Throat Slitter|1 Toxic Deluge|1 Triton Shorestalker|1 Turncoat Kunoichi|1 Turtle Lair|1 Walker of Secret Ways|1 Yuriko, the Tiger's Shadow|1 Splinter, Radical Rat`
  .split("|").map((l) => { const m = l.match(/^(\d+)\s+(.*)$/); const raw = byName.get(m[2].toLowerCase()); assert.ok(raw, m[2] + " must be in data/cards.json"); return {card: C.normalize({...raw}), quantity: Number(m[1])}; });
const commander = SPLINTER.find((r) => r.card.name === "Splinter, Radical Rat").card;
const deckForCheck = {cards: SPLINTER.map((r) => ({name: r.card.name, quantity: r.quantity}))};

check("the list is a hundred and the shape counts it", () => {
  const sh = G.shape(SPLINTER);
  assert.equal(sh.total, 100); assert.equal(sh.lands, 38); assert.equal(sh.creatures, 33);
  assert.ok(sh.avgMv > 2 && sh.avgMv < 4, "average mana value " + sh.avgMv);
  assert.equal(Object.values(sh.curve).reduce((a, b) => a + b, 0), 100 - sh.lands);
});

check("the commander's tribe is read from its text and the list", () => {
  const tribe = G.tribeOf(commander, SPLINTER);
  assert.equal(tribe.type, "Ninja"); assert.ok(tribe.count >= 20, tribe.count + " Ninjas");
});

const report = {protocol: "published-v2.6-6x20000", metrics: {score: {value: 58.65, unit: "points"}, winRate: {value: 27.4}, averageWinTurn: {value: 9.8}, averageCommanderTurn: {value: 3.9}, incompleteGames: {value: 0.7}}};
const generated = G.build({commander, cards: SPLINTER, styles: C.playStyles(commander), report});

check("the generated guide names only cards in the deck, against every legal name", () => {
  const result = Agent.check(generated, deckForCheck, registry);
  assert.deepEqual(result.errors, [], result.errors.join(" | "));
});

check("it carries every field the deck page renders, and says what it is", () => {
  assert.equal(generated.origin, "measured");
  for (const key of ["hook", "whatItDoes", "howItWins", "mulligan", "archetype"]) assert.ok(generated[key] && generated[key].length > 20, key);
  assert.equal(generated.turns.length, 3); assert.ok(generated.keyCards.length >= 4); assert.ok(generated.watchFor.length >= 1);
  assert.ok(/26 Ninjas/.test(generated.hook), generated.hook);
  assert.ok(/ninjutsu/.test(generated.whatItDoes), "the kin's shared mechanics are named");
});

check("the measured line quotes the report and only the report", () => {
  const line = generated.watchFor.find((x) => /^Measured:/.test(x));
  assert.ok(line, "a measured line");
  assert.ok(/58\.65 points/.test(line) && /27\.4% wins/.test(line) && /turn 3\.9/.test(line), line);
  const without = G.build({commander, cards: SPLINTER, styles: C.playStyles(commander)});
  assert.ok(!without.watchFor.some((x) => /^Measured:/.test(x)), "no report, no measured line");
  assert.equal(without.measured, null);
});

check("a two-drop the classifier files as a finisher is not called one", () => {
  assert.ok(!/Ninja Teen is the finisher/.test(generated.howItWins), generated.howItWins);
  assert.ok(!generated.keyCards.some((k) => k.name === "Ninja Teen" && /finisher/i.test(k.why)));
});

check("no short commander name leaks into prose (a short name can itself be a card)", () => {
  const prose = [generated.hook, generated.whatItDoes, generated.howItWins, generated.mulligan, ...generated.turns.map((t) => t.do), ...generated.keyCards.map((k) => k.why), ...generated.watchFor].join("\n");
  assert.ok(!/\bSplinter\b(?!, Radical Rat|, Hamato Yoshi|, the Mentor|, Vengeful Sensei)/.test(prose), "bare 'Splinter' in prose");
});

check("the hand-written Splinter guide passes the same checker", () => {
  const guide = guides.decks.find((g) => g.commander === "Splinter, Radical Rat");
  assert.ok(guide, "data/deck-guides.json holds the Splinter guide");
  const result = Agent.check(guide, deckForCheck, registry);
  assert.deepEqual(result.errors, [], result.errors.join(" | "));
  assert.equal(guide.shape.lands, 38);
  assert.ok(guide.keyCards.length === 6 && guide.turns.length === 3 && guide.watchFor.length === 3);
});

check("a commander with no tribe and no report still gets a full guide", () => {
  const sol = C.normalize({name: "Test Wizard, the Plain", typeLine: "Legendary Creature — Human Wizard", manaCost: "{2}{U}", oracleText: "Whenever you cast an instant or sorcery spell, draw a card.", colorIdentity: ["U"], legalities: {commander: "legal"}});
  const rows = [{card: sol, quantity: 1}];
  for (let i = 0; i < 36; i += 1) rows.push({card: C.normalize({name: "Island", typeLine: "Basic Land — Island", oracleText: "{T}: Add {U}.", colorIdentity: ["U"], legalities: {commander: "legal"}}), quantity: 1});
  for (let i = 0; i < 63; i += 1) rows.push({card: C.normalize({name: "Fixture Spell " + i, typeLine: i % 2 ? "Instant" : "Creature — Wizard", manaCost: "{" + (i % 4 + 1) + "}{U}", oracleText: i % 3 ? "Draw a card." : "Destroy target creature.", colorIdentity: ["U"], legalities: {commander: "legal"}}), quantity: 1});
  const g = G.build({commander: sol, cards: rows, styles: []});
  assert.equal(Agent.check(g, {cards: rows.map((r) => ({name: r.card.name, quantity: r.quantity}))}).errors.length, 0);
  assert.ok(g.hook.includes("Test Wizard, the Plain"));
});

console.log(`guide-measured: ${checks} checks passed · generated ${generated.keyCards.length} key cards and ${generated.watchFor.length} watch-fors for Splinter`);
