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
const base = {winRate: 0.3, avgWinTurn: 11, screwPct: 0.05, floodPct: 0.04, avgCommanderTurn: 4, commanderCastRate: 0.95, interactionAvailability: 0.5, deadCardsAtT8: 1, games: 1000};
assert.ok(Engine.compositeScore({...base, winRate: 0.4}) > Engine.compositeScore(base), "a higher win rate must score higher");
assert.ok(Engine.compositeScore({...base, screwPct: 0.3}) < Engine.compositeScore(base), "more mana screw must score lower");
assert.ok(Engine.compositeScore({...base, interactionAvailability: 0.1}) < Engine.compositeScore(base), "less interaction must score lower");
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
  SIM_STATUS_PATH: path.join(scratch, "status.json")
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

await rm(scratch, {recursive: true, force: true});

console.log(`Simulation engine verified: deterministic under seed, discriminating between decks, and capped by the runner at ${tinyConfig.maxTotalSimulations} games.`);
