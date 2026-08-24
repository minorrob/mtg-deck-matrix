// Merges every exported game-log file in data/game-logs/ into one cumulative
// history, and derives the per-variant record that simulated predictions get
// checked against. Idempotent: entries carry their own ids, so re-running after
// adding a night's games only adds that night's games.
//
//   node tools/compile-game-logs.mjs            # write data/game-history.json
//   node tools/compile-game-logs.mjs --check    # verify it is up to date, write nothing

import {readFile, writeFile, readdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOG_DIR = path.join(ROOT, "data/game-logs");
const OUT = path.join(ROOT, "data/game-history.json");
const checkOnly = process.argv.includes("--check");

const REQUIRED = ["id", "variantId", "playedOn", "result"];
const VALID_RESULTS = new Set(["win", "loss", "draw"]);

const files = (await readdir(LOG_DIR).catch(() => [])).filter((name) => name.endsWith(".json")).sort();
const byId = new Map();
const problems = [];

for (const name of files) {
  let payload;
  try {
    payload = JSON.parse(await readFile(path.join(LOG_DIR, name), "utf8"));
  } catch (error) {
    problems.push(`${name}: not valid JSON (${error.message})`);
    continue;
  }
  const games = Array.isArray(payload) ? payload : payload.games;
  if (!Array.isArray(games)) {
    problems.push(`${name}: no games array`);
    continue;
  }
  games.forEach((game, index) => {
    const missing = REQUIRED.filter((key) => game[key] === undefined || game[key] === null || game[key] === "");
    if (missing.length) return problems.push(`${name}[${index}]: missing ${missing.join(", ")}`);
    if (!VALID_RESULTS.has(game.result)) return problems.push(`${name}[${index}]: result "${game.result}" is not win/loss/draw`);
    // Last file wins on a duplicate id, so a corrected re-export supersedes.
    byId.set(game.id, {...game, sourceFile: name});
  });
}

if (problems.length) {
  console.error("Game logs could not be compiled:");
  problems.forEach((problem) => console.error(`  - ${problem}`));
  process.exit(1);
}

const games = Array.from(byId.values()).sort((a, b) => String(a.playedOn).localeCompare(String(b.playedOn)) || String(a.recordedAt || "").localeCompare(String(b.recordedAt || "")));

const mean = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);
const round = (value, places = 3) => (value === null ? null : Math.round(value * 10 ** places) / 10 ** places);

const byVariant = {};
for (const game of games) {
  const record = byVariant[game.variantId] || (byVariant[game.variantId] = {games: 0, wins: 0, losses: 0, draws: 0, turns: [], knockouts: [], podFun: [], myFun: []});
  record.games += 1;
  if (game.result === "win") record.wins += 1;
  else if (game.result === "loss") record.losses += 1;
  else record.draws += 1;
  if (Number.isFinite(game.turns)) record.turns.push(game.turns);
  if (Number.isFinite(game.knockouts)) record.knockouts.push(game.knockouts);
  if (Number.isFinite(game.podFun)) record.podFun.push(game.podFun);
  if (Number.isFinite(game.myFun)) record.myFun.push(game.myFun);
}

const variants = {};
for (const [variantId, record] of Object.entries(byVariant)) {
  variants[variantId] = {
    games: record.games,
    wins: record.wins,
    losses: record.losses,
    draws: record.draws,
    winRate: round(record.wins / record.games),
    avgTurns: round(mean(record.turns), 2),
    avgKnockouts: round(mean(record.knockouts), 2),
    // The pod's own verdict, 1-5. This is the number the simulator's Pod Fun
    // score is ultimately answerable to.
    avgPodFun: round(mean(record.podFun), 2),
    avgMyFun: round(mean(record.myFun), 2)
  };
}

const history = {
  schemaVersion: 1,
  compiledAt: new Date().toISOString(),
  sourceFiles: files,
  totals: {
    games: games.length,
    variantsPlayed: Object.keys(variants).length,
    winRate: round(games.filter((game) => game.result === "win").length / Math.max(1, games.length)),
    avgPodFun: round(mean(games.map((game) => game.podFun).filter(Number.isFinite)), 2),
    avgMyFun: round(mean(games.map((game) => game.myFun).filter(Number.isFinite)), 2)
  },
  variants,
  games
};

const next = `${JSON.stringify(history, null, 2)}\n`;

if (checkOnly) {
  const current = await readFile(OUT, "utf8").catch(() => "");
  const strip = (text) => text.replace(/"compiledAt": "[^"]*",?\n/, "");
  if (strip(current) !== strip(next)) {
    console.error("data/game-history.json is out of date. Run: node tools/compile-game-logs.mjs");
    process.exit(1);
  }
  console.log(`Game history is up to date (${games.length} games across ${Object.keys(variants).length} variants).`);
  process.exit(0);
}

await writeFile(OUT, next);
console.log(`Compiled ${games.length} game${games.length === 1 ? "" : "s"} from ${files.length} file${files.length === 1 ? "" : "s"} across ${Object.keys(variants).length} variant${Object.keys(variants).length === 1 ? "" : "s"}.`);
