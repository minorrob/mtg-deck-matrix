/* The composition model, held on the six staging decks and on cards whose roles are not in doubt.
 *
 * deck-composition.js (Linear ROB-114) answers Rob's question about a hundred: how much ramp, draw, interaction,
 * defense and offense it carries, against what its bracket and playstyle ask, and whether the deck's own objectives
 * are served. The Tune tab (ROB-113) renders what it returns and computes nothing. So the model is held here two
 * ways. First, on cards whose role nobody disputes: Sol Ring is ramp, Counterspell is a counterspell and not removal,
 * Wrath of God is a wipe, a creature that merely has hexproof is not protection, a 1/1 is not a threat and a 4/4
 * flier is. Second, on the six staging decks (tests/fixtures/shared-staging-decks.json, read through the engine
 * oracle, which carries every card they name): the counts are pinned as they were on October 18, so a change to
 * the classifier or to this file moves a number here on purpose, with the new number written down, never by
 * accident. The targets file is validated as data: five brackets, five playstyles, every range sane.
 *
 * The breaks: game/tools/batch/breaks-deck-composition.py.
 */
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";

const require = createRequire(import.meta.url);
const Composition = require("../deck-composition.js");
const Classify = require("../card-classify.js");
const Strategies = require("../crankmagic-strategies.js");
const Change = require("../crankmagic-change.js");
const targets = JSON.parse(await readFile(new URL("../data/composition-targets.json", import.meta.url), "utf8"));

let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };
const opts = {classify: Classify.classify, strategies: Strategies, landTarget: Change.landTarget, targets};

/* 1. Cards whose roles nobody disputes. */
const card = (name, typeLine, oracleText, manaCost = "", extra = {}) => ({name, typeLine, oracleText, manaCost, ...extra});
const SOL_RING = card("Sol Ring", "Artifact", "{T}: Add {C}{C}.", "{1}");
const COUNTERSPELL = card("Counterspell", "Instant", "Counter target spell.", "{U}{U}");
const WRATH = card("Wrath of God", "Sorcery", "Destroy all creatures. They can't be regenerated.", "{2}{W}{W}");
const MURDER = card("Murder", "Instant", "Destroy target creature.", "{1}{B}{B}");
const HEXPROOF_BEAR = card("Hexproof Bear", "Creature — Bear", "Hexproof", "{1}{G}", {power: "2", toughness: "2"});
const BOOTS = card("Swiftfoot Boots", "Artifact — Equipment", "Equipped creature has hexproof and haste.\nEquip {1}", "{2}");
const ELF = card("Llanowar Elves", "Creature — Elf Druid", "{T}: Add {G}.", "{G}", {power: "1", toughness: "1"});
const ANGEL = card("Serra Angel", "Creature — Angel", "Flying, vigilance", "{3}{W}{W}", {power: "4", toughness: "4", keywords: ["Flying", "Vigilance"], colorIdentity: ["W"]});
const DRAKE = card("Wind Drake", "Creature — Drake", "Flying", "{2}{U}", {power: "2", toughness: "2", keywords: ["Flying"]});
const DRAIN = card("Exsanguinate", "Sorcery", "Each opponent loses X life. You gain life equal to the life lost this way.", "{X}{B}{B}");
const FOREST = card("Forest", "Basic Land — Forest", "({T}: Add {G}.)");
const TOWER = card("Command Tower", "Land", "{T}: Add one mana of any color in your commander's color identity.");
const WILDS = card("Evolving Wilds", "Land", "{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.");
const SHOCK = card("Breeding Pool", "Land — Forest Island", "({T}: Add {G} or {U}.)\nAs Breeding Pool enters, you may pay 2 life. If you don't, it enters tapped.");
const WASTES = card("Wastes", "Basic Land", "({T}: Add {C}.)");

const roles = (c) => Composition.rolesOf(Composition.normalize(c), Classify.classify).roles.sort();
eq(roles(SOL_RING), ["ramp"], "Sol Ring is ramp and nothing else");
eq(roles(COUNTERSPELL), ["counterspell", "protection"], "Counterspell is a counterspell (and protection, as the classifier files it), never removal");
eq(roles(WRATH), ["wipe"], "Wrath of God is a board wipe");
eq(roles(MURDER), ["removal"], "Murder is removal");
eq(roles(HEXPROOF_BEAR), [], "a creature that merely has hexproof is neither protection nor a threat");
eq(roles(BOOTS), ["protection"], "Swiftfoot Boots hands hexproof over: protection");
eq(roles(ELF), ["ramp"], "a mana dork is ramp, not a threat");
eq(roles(ANGEL), ["threat"], "a 4/4 flier is a threat");
eq(roles(DRAKE), ["threat"], "a 2/2 flier is a threat (two power with evasion)");
ok(roles(DRAIN).includes("finisher") && roles(DRAIN).includes("threat"), "a drain that scales is a finisher, and finishers count as offense");

/* Pips and land colors. */
eq(Composition.pipsOf("{2}{W}{W}"), {W: 2, U: 0, B: 0, R: 0, G: 0}, "two white pips in Wrath");
eq(Composition.pipsOf("{W/U}{W/U}"), {W: 2, U: 2, B: 0, R: 0, G: 0}, "a hybrid pip counts for both colors");
eq(Composition.pipsOf("{2/G}{G/P}"), {W: 0, U: 0, B: 0, R: 0, G: 2}, "two-generic hybrid and Phyrexian count for their color");
eq(Composition.pipsOf("{X}{C}{3}"), {W: 0, U: 0, B: 0, R: 0, G: 0}, "generic, X and colorless add no pips");
const lc = (c, colors) => Composition.landColors(Composition.normalize(c), colors).sort();
eq(lc(FOREST), ["G"], "a Forest makes green");
eq(lc(SHOCK), ["G", "U"], "a Forest Island makes both");
eq(lc(TOWER, ["R", "G"]), ["G", "R"], "Command Tower makes the deck's colors");
eq(lc(WILDS, ["W", "B"]), ["B", "W"], "a land that fetches a basic counts for every color the deck plays");
eq(lc(WASTES, ["R"]), [], "a colorless land makes no colored source");
eq(Composition.manaValueOf("{X}{2}{W/U}{G/P}"), 4, "mana value read off a cost when the record carries none");

/* Record shapes: the engine oracle's short keys read the same as the catalog's. */
const engineShape = {name: "Sol Ring", type: "Artifact", text: "{T}: Add {C}{C}.", mana: "{1}", mv: 1, ci: []};
eq(Composition.normalize(engineShape).typeLine, "Artifact", "the engine oracle's type is the typeLine");
eq(Composition.normalize(engineShape).oracleText, "{T}: Add {C}{C}.", "the engine oracle's text is the oracleText");
eq(roles(engineShape), ["ramp"], "a record in the engine's shape classifies the same");
const scryShape = {name: "Counterspell", type_line: "Instant", oracle_text: "Counter target spell.", mana_cost: "{U}{U}", cmc: 2};
eq(roles(scryShape), ["counterspell", "protection"], "a record in Scryfall's shape classifies the same");

/* Targets: the data file is sane, and the resolution composes bracket then playstyle. */
for (const role of Composition.ROLES) {
  const t = targets.base.roles[role];
  ok(t && Number.isInteger(t.min) && Number.isInteger(t.max) && t.min <= t.max && typeof t.why === "string" && t.why.length > 10, `base target for ${role} is a sane range with a reason`);
}
for (const b of ["1", "2", "3", "4", "5"]) {
  ok(targets.brackets[b] && typeof targets.brackets[b].note === "string", `bracket ${b} has a note`);
  for (const [role, t] of Object.entries(targets.brackets[b].roles)) ok(Composition.ROLES.includes(role) && t.min <= t.max && t.min >= 0, `bracket ${b} ${role} override is sane`);
}
for (const s of Composition.PLAYSTYLES) ok(targets.playStyles[s] && typeof targets.playStyles[s].note === "string", `playstyle ${s} has a note`);
ok(typeof targets.source === "string" && /ROLE_MINIMUMS/.test(targets.source) && /first cut/i.test(targets.source), "the targets file says where its numbers came from and that they are a first cut");
const t3 = Composition.resolveTargets(targets, {bracket: 3, playStyle: "Balanced", colors: ["U"]});
eq([t3.ramp.min, t3.ramp.max, t3.removal.min, t3.wipe.min, t3.draw.min], [10, 14, 8, 2, 10], "bracket 3 Balanced keeps the house floors (ramp 10, removal 8, wipe 2, draw 10)");
const t5 = Composition.resolveTargets(targets, {bracket: 5, playStyle: "Balanced", colors: ["U"]});
ok(t5.ramp.min > t3.ramp.min && t5.tutor.min > t3.tutor.min && t5.counterspell.min > t3.counterspell.min, "cEDH asks more ramp, tutors and counters than bracket 3");
const tAgg = Composition.resolveTargets(targets, {bracket: 3, playStyle: "Aggressive", colors: ["R"]});
ok(tAgg.threat.min === t3.threat.min + 4 && tAgg.removal.min === t3.removal.min - 2, "Aggressive shifts threats up and removal down");
eq(tAgg.counterspell.min, 0, "a deck without blue is asked for no counterspells");
const tCombo = Composition.resolveTargets(targets, {bracket: 2, playStyle: "Combo", colors: ["U", "B"]});
ok(tCombo.tutor.min === targets.brackets["2"].roles.tutor.min + 3, "the playstyle shift applies on top of the bracket's override");
ok(Object.values(Composition.resolveTargets(targets, {bracket: 1, playStyle: "Aggressive", colors: []})).every((t) => t.min <= t.max), "no range inverts after a shift");

/* A small hand-built deck composes end to end. */
const small = Composition.compose([SOL_RING, COUNTERSPELL, WRATH, MURDER, BOOTS, ELF, ANGEL, DRAKE, DRAIN, FOREST, TOWER, SHOCK], {...opts, commanders: [ANGEL], bracket: 3, playStyle: "Balanced"});
eq(small.total, 12, "every card counted");
eq(small.roles.counterspell.cards, ["Counterspell"], "the counterspell is named");
eq(small.groups.find((g) => g.id === "interaction").count, 3, "interaction is removal, counterspells and wipes, each card once");
eq(small.lands.count, 3, "three lands");
eq(small.lands.sources, {W: 1, U: 1, B: 0, R: 0, G: 2}, "sources by color: the Forest, the shock both ways, the Tower in the commander's white");
eq(small.gaps.ramp.verdict, "short", "two ramp against a floor of ten is short");
ok(small.gaps.ramp.says.includes("bracket 3 Balanced asks 10 to 14"), "the gap says what was asked in words");
eq(small.curve.buckets[1], 2, "two one-drops on the curve (Sol Ring, the Elf); X counts as zero, so the drain sits at two");
eq(small.curve.buckets[2], 3, "three two-drops (Counterspell, the Boots, the drain at X plus two black)");
ok(small.objectives.available, "the objectives read the strategy vocabulary");

/* 2. The six staging decks, pinned. */
const oracle = JSON.parse(await readFile(new URL("../data/engine/oracle.json", import.meta.url), "utf8")).cards;
const byName = new Map(oracle.map((c) => [c.name.toLowerCase(), c]));
const find = (n) => byName.get(n.toLowerCase()) || byName.get(n.split(" // ")[0].toLowerCase());
const decks = JSON.parse(await readFile(new URL("./fixtures/shared-staging-decks.json", import.meta.url), "utf8")).decks;
const PINNED = {
  "shared:D1": {roles: {ramp: 14, draw: 12, removal: 8, counterspell: 2, wipe: 4, protection: 5, recursion: 2, tutor: 2, threat: 17, finisher: 0}, lands: 36, served: ["draw-payoff"]},
  "shared:D2": {roles: {ramp: 13, draw: 7, removal: 9, counterspell: 2, wipe: 2, protection: 7, recursion: 3, tutor: 4, threat: 19, finisher: 0}, lands: 37, served: ["untap-loop", "draw-payoff"]},
  "shared:D3": {roles: {ramp: 15, draw: 14, removal: 5, counterspell: 5, wipe: 1, protection: 8, recursion: 1, tutor: 3, threat: 13, finisher: 1}, lands: 37, served: ["untap-loop", "sacrifice-supply", "etb-payoff", "team-quality"]},
  "shared:D4": {roles: {ramp: 12, draw: 7, removal: 10, counterspell: 0, wipe: 1, protection: 7, recursion: 3, tutor: 4, threat: 15, finisher: 1}, lands: 38, served: ["untap-loop", "sacrifice-supply", "death-payoff", "stat-payoff", "recursion-loop", "draw-payoff"]},
  "shared:D5": {roles: {ramp: 12, draw: 9, removal: 7, counterspell: 0, wipe: 3, protection: 4, recursion: 5, tutor: 2, threat: 15, finisher: 2}, lands: 37, served: ["blink-loop", "etb-payoff", "team-quality"]},
  "shared:D6": {roles: {ramp: 14, draw: 5, removal: 13, counterspell: 0, wipe: 3, protection: 2, recursion: 0, tutor: 3, threat: 11, finisher: 2}, lands: 38, served: ["untap-loop", "sacrifice-supply", "etb-payoff", "tribal-payoff"]}
};
for (const d of decks) {
  const cmdrs = d.commander.map(find);
  ok(cmdrs.every(Boolean) && d.cards.every(find), `${d.name}: every card is in the engine oracle`);
  const r = Composition.compose([...d.cards.map(find), ...cmdrs], {...opts, commanders: cmdrs, bracket: 3, playStyle: "Balanced"});
  eq(r.total, 100, `${d.name}: a hundred cards`);
  eq(r.unknown, [], `${d.name}: no unknown cards`);
  const counts = Object.fromEntries(Object.entries(r.roles).map(([k, v]) => [k, v.count]));
  eq(counts, PINNED[d.id].roles, `${d.name}: role counts as pinned on October 18`);
  eq(r.lands.count, PINNED[d.id].lands, `${d.name}: land count`);
  eq(r.objectives.list.filter((o) => o.served).map((o) => o.id), PINNED[d.id].served, `${d.name}: the objectives served`);
  for (const role of Composition.ROLES) eq(r.roles[role].cards.length, new Set(r.roles[role].cards).size, `${d.name}: ${role} names each card once`);
  ok(Object.values(r.gaps).every((g) => ["short", "in range", "over"].includes(g.verdict) && typeof g.says === "string"), `${d.name}: every gap has a verdict and a sentence`);
  ok(r.lands.target !== null && r.lands.says.startsWith("38 lands"), `${d.name}: the land target is Rob's formula`);
  ok(r.lands.colorBalance.every((c) => c.sources > 0), `${d.name}: every color the spells ask for has a source`);
}
/* Krenko in particular: the goblins' commander is a tribal payoff, and the deck's ramp names Sol Ring. */
const krenko = decks.find((d) => d.id === "shared:D6");
const kr = Composition.compose([...krenko.cards.map(find), ...krenko.commander.map(find)], {...opts, commanders: krenko.commander.map(find), bracket: 3, playStyle: "Balanced", mechanics: ["Goblin tribal", "Tokens", "ETB triggers"]});
ok(kr.roles.ramp.cards.includes("Sol Ring"), "Krenko's ramp names Sol Ring");
ok(kr.objectives.list.find((o) => o.id === "tribal-payoff")?.served, "Krenko's tribal payoff objective is served");
ok(kr.gaps.protection.verdict === "short", "Krenko is short on protection against the bracket 3 range (two pieces against a floor of three)");
eq(kr.lands.colorBalance.map((c) => c.color), ["R"], "a mono-red deck balances one color");

/* A catalog row: faces [] and an empty cost (every land the catalog normalizes) must not throw. */
const catalogLand = Composition.normalize({name: "Mountain", typeLine: "Basic Land — Mountain", oracleText: "", manaCost: "", faces: [], colorIdentity: ["R"]});
ok(catalogLand && catalogLand.manaValue === 0 && catalogLand.manaCost === "", "a catalog row with faces [] and no cost normalizes (it threw before)");

console.log(`deck-composition: ${checks} checks passed — roles, pips, land colors, three record shapes, the targets file, and the six staging decks pinned.`);
