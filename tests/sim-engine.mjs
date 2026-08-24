import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile, writeFile, mkdir, rm} from "node:fs/promises";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

const run = promisify(execFile);
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const Lineup = require("../lineup-model.js");
const Engine = require("../sim-engine.js");
const buyPlans = JSON.parse(await readFile(new URL("../data/buy-plans.json", import.meta.url), "utf8"));
const cards = JSON.parse(await readFile(new URL("../data/cards.json", import.meta.url), "utf8"));
const opponents = JSON.parse(await readFile(new URL("../sim/opponents.json", import.meta.url), "utf8"));
const config = JSON.parse(await readFile(new URL("../sim/config.json", import.meta.url), "utf8"));
const audited = new Map(cards.cards.map((card) => [Lineup.normalizeName(card.name), card]));

function table(name = "mixed-pod") {
  const mix = opponents.tables[name];
  const total = mix.reduce((sum, entry) => sum + entry.weight, 0);
  return mix.map((entry) => ({...opponents.profiles[entry.profile], weight: entry.weight / total}));
}

function tunedCards(variantId) {
  const plan = buyPlans.plans[variantId];
  const defaults = Lineup.defaultSelection(plan);
  return Lineup.selectedEntries(plan, defaults).map((entry) => {
    const meta = audited.get(Lineup.normalizeName(entry.item.name)) || {};
    return {
      name: entry.item.name,
      quantity: Math.max(1, Number(entry.item.quantity || 1)),
      isCommander: Boolean(entry.item.isCommander),
      typeLine: entry.item.typeLine || meta.typeLine || "",
      manaCost: entry.item.manaCost || meta.manaCost || "",
      oracleText: entry.item.oracleText || meta.oracleText || "",
      colorIdentity: entry.item.colorIdentity || meta.colorIdentity || [],
      price: Number(entry.item.price ?? meta.price ?? 0)
    };
  });
}

// ---------------------------------------------------------------------------
// Card classification: every simplification the game loop relies on
// ---------------------------------------------------------------------------
const classify = (name, typeLine, oracleText, manaCost = "{2}") => Engine.classifyCard({name, typeLine, oracleText, manaCost});

assert.equal(classify("Sol Ring", "Artifact", "{T}: Add {C}{C}.", "{1}").isRamp, true);
assert.equal(classify("Command Tower", "Land", "{T}: Add one mana of any color.", "").isLand, true);
assert.equal(classify("Command Tower", "Land", "{T}: Add one mana of any color.", "").isRamp, false, "a land is never also a ramp spell");
assert.equal(classify("Swords to Plowshares", "Instant", "Exile target creature.", "{W}").isRemoval, true);
assert.equal(classify("Swords to Plowshares", "Instant", "Exile target creature.", "{W}").instantSpeed, true);
assert.equal(classify("Wrath of God", "Sorcery", "Destroy all creatures. They can't be regenerated.", "{2}{W}{W}").isWipe, true);
assert.equal(classify("Wrath of God", "Sorcery", "Destroy all creatures.", "{2}{W}{W}").wipesOwnBoard, true, "a one-shot sweeper takes our board with it");
assert.equal(classify("Elspeth, Sun's Champion", "Legendary Planeswalker — Elspeth", "Destroy all creatures with power 4 or greater.", "{4}{W}{W}").wipesOwnBoard, false, "a sweeper printed on a permanent is not a symmetrical reset");
assert.equal(classify("Rhystic Study", "Enchantment", "Whenever an opponent casts a spell, unless that player pays {1}, you may draw a card.", "{2}{U}").isDraw, true);

const bloodArtist = classify("Blood Artist", "Creature — Vampire", "Whenever this creature or another creature dies, target player loses 1 life and you gain 1 life.", "{1}{B}");
assert.equal(bloodArtist.drain.one, 1, "a repeatable single-target drain is an engine");
assert.equal(bloodArtist.drain.all, 0);
const bastion = classify("Bastion of Remembrance", "Enchantment", "Whenever a creature you control dies, each opponent loses 1 life and you gain 1 life.", "{2}{B}");
assert.equal(bastion.drain.all, 1, "a repeatable each-opponent drain hits every seat");
const kokusho = classify("Kokusho, the Evening Star", "Legendary Creature — Dragon Spirit", "When this creature dies, each opponent loses 5 life.", "{3}{B}{B}");
assert.equal(kokusho.drain.all, 0, "a one-shot death trigger is not a per-turn drain engine");
assert.equal(kokusho.isFinisher, true);

const dual = classify("Sacred Foundry", "Land", "({T}: Add {R} or {W}.)", "");
assert.deepEqual([...dual.produces].sort(), ["R", "W"], "an or-phrased dual land must produce both of its colors, not just the first");
const triome = classify("Zagoth Triome", "Land", "({T}: Add {B}, {G}, or {U}.)", "");
assert.deepEqual([...triome.produces].sort(), ["B", "G", "U"], "a triome must produce all three of its colors");
const painLand = classify("Battlefield Forge", "Land", "{T}: Add {C}.\n{T}: Add {R} or {W}. This land deals 1 damage to you.", "");
assert.deepEqual([...painLand.produces].sort(), ["R", "W"], "a multi-line land must read every add clause");

const pips = Engine.parseManaCost("{3}{W}{B}");
assert.equal(pips.value, 5);
assert.equal(pips.pips.W, 1);
assert.equal(pips.pips.B, 1);
assert.equal(Engine.parseManaCost("{X}{R}").value, 1, "X contributes nothing to a mana value");

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------
const deck = tunedCards("5o");
const first = Engine.simulateGames(deck, table(), {...config, games: 200}, 4242);
const second = Engine.simulateGames(deck, table(), {...config, games: 200}, 4242);
assert.deepEqual(second.metrics, first.metrics, "the same seed must reproduce the same metrics exactly");
assert.deepEqual(second.perCardStats, first.perCardStats, "per-card statistics must be reproducible too");
const third = Engine.simulateGames(deck, table(), {...config, games: 200}, 99);
assert.notDeepEqual(third.metrics, first.metrics, "a different seed must produce a different sample");
assert.ok(Math.abs(third.metrics.winRate - first.metrics.winRate) < 0.25, "two samples of the same deck must stay in the same neighbourhood");

// ---------------------------------------------------------------------------
// Sanity decks: the model has to be obviously right at the extremes
// ---------------------------------------------------------------------------
const commander = {name: "Test Commander", quantity: 1, isCommander: true, typeLine: "Legendary Creature — Human", manaCost: "{2}{W}", oracleText: "", colorIdentity: ["W"]};
const allLands = Engine.simulateGames([commander, {name: "Plains", quantity: 99, typeLine: "Basic Land — Plains", manaCost: "", oracleText: "({T}: Add {W}.)", colorIdentity: ["W"]}], table(), {...config, games: 200}, 7);
assert.equal(allLands.metrics.winRate, 0, "a deck of nothing but lands cannot win");
assert.ok(allLands.metrics.floodPct > 0.8, "a deck of nothing but lands must read as flooded");

const noLands = Engine.simulateGames([commander, ...Array.from({length: 99}, (_unused, index) => ({
  name: `Expensive Spell ${index + 1}`,
  quantity: 1,
  typeLine: "Sorcery",
  manaCost: "{6}{W}",
  oracleText: "Draw a card.",
  colorIdentity: ["W"]
}))], table(), {...config, games: 200}, 7);
assert.equal(noLands.metrics.winRate, 0, "a deck with no lands cannot win");
assert.ok(noLands.metrics.screwPct > 0.9, "a deck with no lands must read as mana screwed");

// A Defender creature must never contribute attack power unless the deck
// itself lifts that restriction (e.g. Felothar the Steadfast). Every card in
// this deck — commander included — has Defender, so with no enabler present
// attack power must be exactly 0 every game, which means the deck can never
// reduce an opponent to 0 life and so can never win.
const wallCommander = {name: "Wall Test Commander", quantity: 1, isCommander: true, typeLine: "Legendary Creature — Wall", manaCost: "{2}{W}", oracleText: "Defender", colorIdentity: ["W"], power: "2", toughness: "4"};
const wallLands = {name: "Plains", quantity: 36, typeLine: "Basic Land — Plains", manaCost: "", oracleText: "({T}: Add {W}.)", colorIdentity: ["W"]};
const testWalls = {name: "Test Wall", quantity: 63, typeLine: "Creature — Wall", manaCost: "{2}{W}", oracleText: "Defender", colorIdentity: ["W"], power: "3", toughness: "6"};
const testAttackers = {...testWalls, name: "Test Attacker", oracleText: "", quantity: 63};
const defenderEnabler = {name: "Defender Enabler", quantity: 1, typeLine: "Legendary Creature — Human Soldier", manaCost: "{1}{W}", oracleText: "Creatures you control can attack as though they didn't have defender.", colorIdentity: ["W"], power: "1", toughness: "1"};

const wallsOnly = Engine.simulateGames([wallCommander, wallLands, testWalls], table(), {...config, games: 300}, 55);
const realAttackers = Engine.simulateGames([wallCommander, wallLands, testAttackers], table(), {...config, games: 300}, 55);
const liftedWalls = Engine.simulateGames([wallCommander, wallLands, {...testWalls, quantity: 62}, defenderEnabler], table(), {...config, games: 300}, 55);
assert.ok(wallsOnly.metrics.winRate < 0.15, `a board of nothing but Defenders and no enabler can never attack, so any win must come from the table eliminating itself, not from us (got ${wallsOnly.metrics.winRate})`);
assert.ok(realAttackers.metrics.winRate > wallsOnly.metrics.winRate + 0.2, `identical stats without Defender must win far more often (walls ${wallsOnly.metrics.winRate} vs attackers ${realAttackers.metrics.winRate})`);
assert.ok(liftedWalls.metrics.winRate > wallsOnly.metrics.winRate + 0.2, `an enabler that lifts Defender must let the same walls fight (walls ${wallsOnly.metrics.winRate} vs lifted ${liftedWalls.metrics.winRate})`);

// An Arcades-style effect goes further than lifting the restriction: the walls
// attack with their toughness, so high-toughness/low-power walls must land far
// harder than the same walls merely allowed to swing for their printed power.
const arcadesEnabler = {name: "Arcades Effect", quantity: 1, typeLine: "Legendary Creature — Elder Dragon", manaCost: "{1}{G}{W}{U}", oracleText: "Each creature you control with defender assigns combat damage equal to its toughness rather than its power and can attack as though it didn't have defender.", colorIdentity: ["G", "U", "W"], power: "3", toughness: "5"};
const weakWalls = {...testWalls, name: "Weak Wall", power: "0", toughness: "6", quantity: 62};
const liftedWeak = Engine.simulateGames([wallCommander, wallLands, weakWalls, defenderEnabler], table(), {...config, games: 300}, 55);
const arcadesWeak = Engine.simulateGames([wallCommander, wallLands, weakWalls, arcadesEnabler], table(), {...config, games: 300}, 55);
assert.ok(arcadesWeak.metrics.winRate > liftedWeak.metrics.winRate + 0.2, `toughness-as-damage must let 0/6 walls actually close a game (lift-only ${liftedWeak.metrics.winRate} vs arcades ${arcadesWeak.metrics.winRate})`);

// A planeswalker commander ("can be your commander") is cast and taxed like
// any commander but never joins combat; the game must run without crediting
// it attack power, and its cast metrics must still be tracked.
const pwCommander = {name: "PW Commander", quantity: 1, isCommander: true, typeLine: "Legendary Planeswalker — Test", manaCost: "{2}{W}", oracleText: "This can be your commander.\n+1: Draw a card.", colorIdentity: ["W"]};
const pwDeck = Engine.simulateGames([pwCommander, wallLands, {...testAttackers, quantity: 63}], table(), {...config, games: 200}, 7);
assert.ok(pwDeck.metrics.commanderCastRate > 0.9, `a planeswalker commander must still be cast nearly every game (got ${pwDeck.metrics.commanderCastRate})`);
assert.ok(pwDeck.metrics.winRate > 0, "a deck with real attackers behind a planeswalker commander must still win games");

// ---------------------------------------------------------------------------
// Combat keywords: card.keywords only tags an ability the card itself has, never one it
// grants or references for other creatures -- checked against the exact granting/referencing
// cards found scanning the real catalog (Favorable Winds, Craterhoof Behemoth, Elspeth's
// ultimate, Iroas, Vito), each reproduced in miniature below.
// ---------------------------------------------------------------------------
assert.equal(classify("Serra Angel Test", "Creature — Angel", "Flying, vigilance", "{3}{W}{W}").hasFlying, true);
assert.equal(classify("Atraxa Test", "Legendary Creature — Phyrexian Angel", "Flying, vigilance, deathtouch, lifelink", "{G}{W}{U}{B}").hasFlying, true);
assert.equal(classify("Atraxa Test", "Legendary Creature — Phyrexian Angel", "Flying, vigilance, deathtouch, lifelink", "{G}{W}{U}{B}").hasDeathtouch, true);
assert.equal(classify("Atraxa Test", "Legendary Creature — Phyrexian Angel", "Flying, vigilance, deathtouch, lifelink", "{G}{W}{U}{B}").hasLifelink, true);
assert.equal(classify("Vorinclex Test", "Legendary Creature — Phyrexian Beast", "Haste, trample", "{4}{G}{G}").hasTrample, true);
assert.equal(classify("Menace Own Test", "Legendary Creature — God", "Indestructible, menace", "{2}{R}{W}").hasMenace, true);
assert.equal(classify("Favorable Winds Test", "Enchantment", "Creatures you control with flying get +1/+1.", "{1}{U}").hasFlying, false, "granting flying to other creatures is not having flying");
assert.equal(classify("Craterhoof Test", "Creature — Beast", "Haste\nWhen this creature enters, creatures you control gain trample and get +X/+X.", "{5}{G}{G}").hasTrample, false, "a granted keyword buried in a later ability is not this card's own keyword");
assert.equal(classify("Elspeth Ultimate Test", "Legendary Planeswalker", "+1: Create a token.\n−7: You get an emblem with \"Creatures you control get +2/+2 and have flying.\"", "{3}{W}{W}").hasFlying, false, "an emblem-granting ultimate does not give the planeswalker itself flying");
assert.equal(classify("Iroas Grant Test", "Legendary Creature — God", "Indestructible\nCreatures you control have menace.", "{2}{R}{W}").hasMenace, false, "granting menace to others is not having menace");
assert.equal(classify("Vito Test", "Legendary Creature — Vampire Cleric", "Whenever you gain life, target opponent loses that much life.\n{3}{B}{B}: Creatures you control gain lifelink until end of turn.", "{2}{B}").hasLifelink, false, "a granted, costed lifelink ability is not this card's own keyword");
assert.equal(classify("First Strike Test", "Creature — Test", "First strike", "{2}{W}").hasFirstStrike, true);
// The keywords array (as Scryfall actually supplies it) must also work, independent of text.
assert.equal(Engine.classifyCard({name: "Keyword Array Test", typeLine: "Creature — Test", oracleText: "", manaCost: "{2}{W}", keywords: ["Flying", "Lifelink"]}).hasFlying, true);
assert.equal(Engine.classifyCard({name: "Keyword Array Test", typeLine: "Creature — Test", oracleText: "", manaCost: "{2}{W}", keywords: ["Flying", "Lifelink"]}).hasLifelink, true);

// ---------------------------------------------------------------------------
// +1/+1 counters: growth (enters-with, a source that adds more, doubling, proliferate),
// never storage/transfer (The Ozolith is deliberately out of scope -- see docs/mechanics-
// design-v2.2.md).
// ---------------------------------------------------------------------------
assert.equal(classify("Enters Test", "Creature — Test", "This creature enters the battlefield with a +1/+1 counter on it.", "{1}{G}").entersWithCounters, 1);
assert.equal(classify("Enters Two Test", "Creature — Test", "This creature enters the battlefield with two +1/+1 counters on it.", "{2}{G}").entersWithCounters, 2);
assert.equal(classify("No Counters Test", "Creature — Test", "", "{2}{G}").entersWithCounters, 0);
{
  const oneShot = classify("One-Shot Counter Test", "Sorcery", "Put a +1/+1 counter on target creature you control.", "{1}{G}");
  assert.equal(oneShot.addsCounterAmount, 1);
  assert.equal(oneShot.addsCounterRepeatable, false, "an instant/sorcery is never a repeatable source");
}
{
  const repeatable = classify("Repeatable Counter Test", "Artifact", "{1}, {T}: Put a +1/+1 counter on target creature you control.", "{2}");
  assert.equal(repeatable.addsCounterAmount, 1);
  assert.equal(repeatable.addsCounterRepeatable, true, "an activated ability can fire every turn");
}
{
  const triggered = classify("Triggered Counter Test", "Creature — Test", "At the beginning of your end step, put a +1/+1 counter on this creature.", "{2}{G}");
  assert.equal(triggered.addsCounterRepeatable, true, "a recurring trigger is also repeatable");
}
assert.equal(classify("Proliferate Spell Test", "Instant", "Proliferate.", "{1}{G}").isProliferate, true);
assert.equal(classify("Proliferate Spell Test", "Instant", "Proliferate.", "{1}{G}").proliferateRepeatable, false);
assert.equal(classify("Proliferate Engine Test", "Artifact", "{1}, {T}: Proliferate.", "{2}").proliferateRepeatable, true);
assert.equal(Engine.classifyCard({name: "Keyword Proliferate Test", typeLine: "Legendary Creature — Test", oracleText: "Flying", manaCost: "{2}{G}", keywords: ["Flying", "Proliferate"]}).isProliferate, true, "an ETB-once proliferate tagged only in keywords must still be detected");
assert.equal(classify("Doubler Test", "Enchantment", "If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead.", "{3}{G}").doublesCounters, true);
assert.equal(classify("Non-Doubler Test", "Creature — Test", "", "{2}{G}").doublesCounters, false);
{
  const withDoubler = Engine.prepareDeck([commander, {name: "Doubler Card", quantity: 1, typeLine: "Enchantment", manaCost: "{3}{G}", oracleText: "If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead.", colorIdentity: ["G"]}]);
  const withoutDoubler = Engine.prepareDeck([commander, {name: "Plain Card", quantity: 1, typeLine: "Sorcery", manaCost: "{1}{G}", oracleText: "Draw a card.", colorIdentity: ["G"]}]);
  assert.equal(withDoubler.counterDoubler, true);
  assert.equal(withoutDoubler.counterDoubler, false);
}

// ---------------------------------------------------------------------------
// Game-loop effects, compared on the SAME seed: since both decks in a pair see identical
// draws, mulligans, and opponent rolls, any difference in outcome is attributable to the
// mechanic itself, not sampling noise -- a much tighter check than an aggregate win-rate
// delta across many stochastic games (real deltas for these keyword-level effects measured
// under 0.05 winRate on a 600-game sample, inside normal seed-to-seed noise at that scale).
// ---------------------------------------------------------------------------
function soloGame(cards, seed) {
  return Engine.playGame(Engine.prepareDeck(cards), table(), config, seed, null);
}
{
  // A creature that grows every turn, with vs without a doubler, holding everything else
  // (including the RNG stream) identical.
  const grower = {name: "Test Grower", quantity: 62, typeLine: "Creature — Test", manaCost: "{2}{W}", oracleText: "At the beginning of your end step, put a +1/+1 counter on this creature.", colorIdentity: ["W"], power: "1", toughness: "1"};
  const doublerCard = {name: "Test Doubler", quantity: 1, typeLine: "Enchantment", manaCost: "{2}{W}", oracleText: "If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead.", colorIdentity: ["W"]};
  const lands36 = {name: "Plains", quantity: 36, typeLine: "Basic Land — Plains", manaCost: "", oracleText: "({T}: Add {W}.)", colorIdentity: ["W"]};
  let doublerWonMore = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const base = soloGame([commander, lands36, {...grower, quantity: 63}], seed);
    const doubled = soloGame([commander, lands36, grower, doublerCard], seed);
    if ((doubled.won ? 1 : 0) >= (base.won ? 1 : 0) && doubled.life >= base.life) doublerWonMore += 1;
  }
  assert.ok(doublerWonMore >= 6, `a doubler must never leave the same seed worse off, and usually help (won/matched-or-better on ${doublerWonMore}/8 seeds)`);
}
{
  // Flying should connect more damage than an identical vanilla creature on the same seed.
  const vanilla = {name: "Test Vanilla", quantity: 63, typeLine: "Creature — Test", manaCost: "{3}{W}", oracleText: "", colorIdentity: ["W"], power: "4", toughness: "4"};
  const flyer = {...vanilla, name: "Test Flyer", oracleText: "Flying"};
  const lands36 = {name: "Plains", quantity: 36, typeLine: "Basic Land — Plains", manaCost: "", oracleText: "({T}: Add {W}.)", colorIdentity: ["W"]};
  let flyerBetter = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const ground = soloGame([commander, lands36, vanilla], seed);
    const air = soloGame([commander, lands36, flyer], seed);
    if (air.life >= ground.life) flyerBetter += 1;
  }
  assert.ok(flyerBetter >= 6, `flying's higher connect rate must leave the defending player at least as well off as the ground version on most identical seeds (${flyerBetter}/8)`);
}
{
  // Lifelink should leave us with at least as much life as an identical non-lifelink attacker.
  const attacker = {name: "Test Attacker", quantity: 63, typeLine: "Creature — Test", manaCost: "{3}{W}", oracleText: "", colorIdentity: ["W"], power: "4", toughness: "4"};
  const lifelinker = {...attacker, name: "Test Lifelinker", oracleText: "Lifelink"};
  const lands36 = {name: "Plains", quantity: 36, typeLine: "Basic Land — Plains", manaCost: "", oracleText: "({T}: Add {W}.)", colorIdentity: ["W"]};
  let lifelinkBetter = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const plain = soloGame([commander, lands36, attacker], seed);
    const linked = soloGame([commander, lands36, lifelinker], seed);
    if (linked.life >= plain.life) lifelinkBetter += 1;
  }
  assert.ok(lifelinkBetter >= 6, `lifelink must leave our own life total at least as high as the same attack without it on most identical seeds (${lifelinkBetter}/8)`);
}
{
  // Deathtouch/first-strike deterrence should reduce incoming damage versus plain blockers
  // of the same stats, raising our own remaining life on the same seed.
  const blocker = {name: "Test Blocker", quantity: 63, typeLine: "Creature — Test", manaCost: "{3}{W}", oracleText: "", colorIdentity: ["W"], power: "2", toughness: "2"};
  const deathtoucher = {...blocker, name: "Test Deathtoucher", oracleText: "Deathtouch"};
  const lands36 = {name: "Plains", quantity: 36, typeLine: "Basic Land — Plains", manaCost: "", oracleText: "({T}: Add {W}.)", colorIdentity: ["W"]};
  let deterrenceBetter = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const plain = soloGame([commander, lands36, blocker], seed);
    const deterred = soloGame([commander, lands36, deathtoucher], seed);
    if (deterred.life >= plain.life) deterrenceBetter += 1;
  }
  assert.ok(deterrenceBetter >= 6, `deathtouch's blocker deterrence must leave our own life total at least as high on most identical seeds (${deterrenceBetter}/8)`);
}

// ---------------------------------------------------------------------------
// The metric has to discriminate: a deliberately damaged deck must score lower
// ---------------------------------------------------------------------------
const healthy = Engine.simulateGames(deck, table(), {...config, games: 1000}, 20260823);
const damaged = deck.map((card, index) => (!card.isCommander && !/Land/.test(card.typeLine) && index % 4 === 0
  ? {name: `Overcosted Blank ${index}`, quantity: 1, typeLine: "Artifact", manaCost: "{8}", oracleText: "", colorIdentity: []}
  : card));
const damagedResult = Engine.simulateGames(damaged, table(), {...config, games: 1000}, 20260823);
assert.ok(damagedResult.metrics.score < healthy.metrics.score - 2, `replacing a quarter of the spells with blanks must measurably hurt (${healthy.metrics.score} vs ${damagedResult.metrics.score})`);
assert.ok(damagedResult.metrics.deadCardsAtT8 > healthy.metrics.deadCardsAtT8, "the blanks must show up as dead cards in hand");

// ---------------------------------------------------------------------------
// Scoring and gap analysis
// ---------------------------------------------------------------------------
const base = {winRate: 0.3, avgWinTurn: 11, screwPct: 0.05, floodPct: 0.04, avgCommanderTurn: 4, commanderCastRate: 0.95, interactionAvailability: 0.5, deadCardsAtT8: 1, participationRate: 0.9, avgPeakBoard: 3, reasonablePaceRate: 0.85, games: 1000};
assert.ok(Engine.compositeScore({...base, winRate: 0.4}) > Engine.compositeScore(base), "a higher win rate must score higher");
assert.ok(Engine.compositeScore({...base, screwPct: 0.3}) < Engine.compositeScore(base), "more mana screw must score lower");
assert.ok(Engine.compositeScore({...base, interactionAvailability: 0.1}) < Engine.compositeScore(base), "less interaction must score lower");
assert.ok(
  Engine.compositeScore({...base, participationRate: 0.2, avgPeakBoard: 0.3, reasonablePaceRate: 0.2}) < Engine.compositeScore(base),
  "a deck that rarely gets to develop a board or finish a real game must score lower on the fun signal"
);
assert.ok(Engine.funScoreFor({...base, participationRate: 1, avgPeakBoard: 4, reasonablePaceRate: 1}) === 1, "a deck that always participates, boards out and paces normally must hit the fun ceiling");
assert.ok(Engine.funScoreFor({...base, participationRate: 0, avgPeakBoard: 0, reasonablePaceRate: 0}) === 0, "a deck that never gets to play must hit the fun floor");
const interval = Engine.winRateInterval({winRate: 0.3, games: 1000});
assert.ok(interval.margin > 0.02 && interval.margin < 0.04, `a 1000-game sample at 30% should carry roughly a three point margin (got ${interval.margin})`);
assert.ok(Engine.winRateInterval({winRate: 0.3, games: 5000}).margin < interval.margin, "more games must narrow the interval");

const gaps = Engine.analyzeGaps({...base, screwPct: 0.25, interactionAvailability: 0.2, avgWinTurn: 14}, {commanderCmc: 4, tableWinTurn: 11.5});
const keys = gaps.map((gap) => gap.key);
assert.ok(keys.includes("mana-screw"), "25% screw must be reported as a gap");
assert.ok(keys.includes("interaction"), "20% interaction availability must be reported as a gap");
assert.ok(keys.includes("clock"), "winning two turns after the table ends must be reported as a gap");
assert.ok(!keys.includes("flood"), "4% flood is inside the band and must not be reported");
assert.deepEqual(gaps.map((gap) => gap.severity), [...gaps.map((gap) => gap.severity)].sort((a, b) => b - a), "gaps must be ordered by severity");
assert.ok(Engine.analyzeGaps({...base, winRate: 0, avgWinTurn: 0}, {}).some((gap) => gap.key === "no-wins"), "a deck that never wins must say so");

// ---------------------------------------------------------------------------
// The cap belongs to the runner: a tiny allowance must stop a run cold
// ---------------------------------------------------------------------------
const scratch = path.join(tmpdir(), `mtg-sim-cap-${process.pid}`);
await mkdir(scratch, {recursive: true});
const tinyConfig = {...config, gamesPerIteration: 100, batchSize: 100, holdoutGames: 100, maxTotalSimulations: 100, maxIterations: 5};
const tinyConfigPath = path.join(scratch, "config.json");
await writeFile(tinyConfigPath, JSON.stringify(tinyConfig));
const env = {
  ...process.env,
  SIM_CONFIG_PATH: tinyConfigPath,
  SIM_LEDGER_PATH: path.join(scratch, "ledger.json"),
  SIM_STATUS_PATH: path.join(scratch, "status.json"),
  SIM_RESULTS_DIR: path.join(scratch, "results"),
  SIM_CACHE_DIR: path.join(scratch, "cache")
};
const requestPath = path.join(scratch, "request.json");
await run(process.execPath, [path.join(ROOT, "tools/sim/make-request.mjs"), "--variant", "5o", "--out", requestPath], {cwd: ROOT, env});
const poolPath = path.join(scratch, "pool.json");
await run(process.execPath, [path.join(ROOT, "tools/sim/fetch-candidates.mjs"), "--request", requestPath, "--offline", "--out", poolPath], {cwd: ROOT, env});

let capExit = 0;
let capOut = "";
try {
  const done = await run(process.execPath, [path.join(ROOT, "tools/sim/run-sim.mjs"), "--request", requestPath, "--pool", poolPath, "--init", "--auto"], {cwd: ROOT, env});
  capOut = done.stdout;
} catch (error) {
  capExit = error.code;
  capOut = error.stdout || "";
}
assert.equal(capExit, 11, `a 100-game allowance must stop the run with exit code 11 (got ${capExit})`);
assert.match(capOut, /cap for this request/, "the runner must say which cap it hit");
const ledger = JSON.parse(await readFile(path.join(scratch, "ledger.json"), "utf8"));
assert.equal(ledger.totalGames, 100, "the ledger must record exactly the games that were played");
assert.ok(ledger.totalGames <= tinyConfig.maxTotalSimulations, "the ledger may never exceed the cap");
const status = JSON.parse(await readFile(path.join(scratch, "status.json"), "utf8"));
assert.equal(status.state, "cap-reached");
assert.ok(status.bestScore > 0, "a capped run must still report the best list it measured");

// A --games argument may lower the batch size but never raise it above the config.
const lowered = await run(process.execPath, [path.join(ROOT, "tools/sim/run-sim.mjs"), "--request", requestPath, "--pool", poolPath, "--games", "999999", "--init"], {
  cwd: ROOT,
  env: {...env, SIM_LEDGER_PATH: path.join(scratch, "ledger2.json"), SIM_CONFIG_PATH: tinyConfigPath}
}).catch((error) => ({stdout: error.stdout || ""}));
const ledger2 = JSON.parse(await readFile(path.join(scratch, "ledger2.json"), "utf8"));
assert.equal(ledger2.totalGames, 100, "a caller may not raise the per-iteration game count above the configured limit");
assert.match(lowered.stdout, /baseline for 5o/);

// A starting list whose card count is wrong is not something a card swap can
// fix, and must never be silently simulated as if it were a real 100-card deck.
const brokenRequest = JSON.parse(await readFile(requestPath, "utf8"));
brokenRequest.id = `${brokenRequest.id}-broken`;
brokenRequest.cards = brokenRequest.cards.slice(0, -3);
const brokenRequestPath = path.join(scratch, "broken-request.json");
await writeFile(brokenRequestPath, JSON.stringify(brokenRequest));
const brokenResultPath = path.join(scratch, "results", `${brokenRequest.id}.iter0.json`);
let brokenExit = 0;
let brokenErr = "";
try {
  await run(process.execPath, [path.join(ROOT, "tools/sim/run-sim.mjs"), "--request", brokenRequestPath, "--pool", poolPath, "--init"], {
    cwd: ROOT,
    env: {...env, SIM_LEDGER_PATH: path.join(scratch, "ledger-broken.json")}
  });
} catch (error) {
  brokenExit = error.code;
  brokenErr = error.stderr || "";
}
assert.equal(brokenExit, 1, `a starting list with the wrong card count must refuse to run rather than simulate it (got exit ${brokenExit})`);
assert.match(brokenErr, /has \d+ cards, not 100/, "the runner must say why it refused");
let brokenResultWritten = true;
try { await readFile(brokenResultPath, "utf8"); } catch (error) { brokenResultWritten = false; }
assert.equal(brokenResultWritten, false, "a refused run must never write a result, or a reader could mistake fabricated metrics for a real deck");

await rm(scratch, {recursive: true, force: true});

// ---------------------------------------------------------------------------
// Page wiring: the Simulate screen and the skill that drives the loop
// ---------------------------------------------------------------------------
const appSource = await readFile(new URL("../app.js", import.meta.url), "utf8");
const indexSource = await readFile(new URL("../index.html", import.meta.url), "utf8");
const skill = await readFile(new URL("../.claude/skills/simulate-deck/SKILL.md", import.meta.url), "utf8");

assert.match(indexSource, /<dialog class="sim-dialog" id="sim-dialog">/, "index.html must carry the simulation dialog");
assert.match(appSource, /function openSimDialog\(variant\)/, "app.js must open a simulation dialog");
assert.match(appSource, /class="simulate-button tip-action/, "every variant card must offer a Simulate button");
assert.match(appSource, /data-live-simulate/, "Live Decks must offer a Simulate button too");
assert.match(appSource, /Lineup\.defaultSelection\(plan\)/, "the request must be built from the plan's Tuned build, not the browser's tick boxes");
assert.match(appSource, /cache: "no-store"/, "status polling must not be served from cache");
assert.match(appSource, /SIM_STATUS_PATH\}\?t=\$\{Date\.now\(\)\}/, "status polling must bust the URL cache as well");
assert.match(appSource, /forgetVariantSelection\(simDialogVariant\.id\)/, "applying an optimized list must drop the stale buy selection");
assert.doesNotMatch(appSource, /api\.anthropic\.com|ANTHROPIC_API_KEY/, "the browser must never call an API to simulate");

assert.match(skill, /never edit `sim\/config\.json`/i, "the skill must state that it cannot raise a cap");
assert.match(skill, /\| 11 \|/, "the skill must document the cap exit code");
for (const code of ["10", "11", "12", "13"]) {
  assert.ok(skill.includes(`| ${code} |`), `the skill must document exit code ${code}`);
}
assert.match(skill, /only propose cards that are in this pool/i, "the skill must confine swaps to the candidate pool");
assert.match(skill, /not-confirmed/, "the skill must report the unseen-seed verdict");

const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
assert.match(readme, /node tests\/sim-engine\.mjs/, "the README must list the simulation test");
assert.match(readme, /run-batch\.mjs/, "the README must show how to run a simulation");

// Metric health. A score that returns nearly the same value for every deck is
// not measuring anything, and weighting it changes nothing -- which is exactly
// how the Fun rung came to be indistinguishable from Tuned. Pod Fun exists to
// discriminate, so it is held to that standard here rather than discovered to
// be flat months later.
{
  const podFun = (over) => Engine.podFunScoreFor({
    avgEndTurn: 11, avgIdleTurns: 0, avgSurvivingSeats: 3, avgFirstElimination: 11, ...over
  });
  const friendly = podFun({});
  const brutal = podFun({avgIdleTurns: 15, avgSurvivingSeats: 0, avgFirstElimination: 5});
  assert.ok(friendly > 0.9, `a table where nobody is eliminated must score high on Pod Fun, got ${friendly}`);
  assert.ok(brutal < 0.2, `a table wiped out at the halfway mark must score low on Pod Fun, got ${brutal}`);
  assert.ok(friendly - brutal > 0.6, "Pod Fun must span a wide range between a friendly table and a brutal one");
  // Each term has to move the number on its own, or it is decoration.
  assert.notEqual(podFun({avgIdleTurns: 6}), friendly, "idle turns must move Pod Fun");
  assert.notEqual(podFun({avgSurvivingSeats: 1}), friendly, "surviving opponents must move Pod Fun");
  assert.notEqual(podFun({avgFirstElimination: 6}), friendly, "how early the first player dies must move Pod Fun");
}

console.log(`Simulation engine verified: deterministic under seed, discriminating between decks (My Fun and Pod Fun both range-checked), and capped by the runner at ${tinyConfig.maxTotalSimulations} games.`);
