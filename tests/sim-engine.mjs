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

console.log(`Simulation engine verified: deterministic under seed, discriminating between decks, and capped by the runner at ${tinyConfig.maxTotalSimulations} games.`);
