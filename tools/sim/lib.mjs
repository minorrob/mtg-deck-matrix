import {createRequire} from "node:module";
import {readFile, writeFile, mkdir} from "node:fs/promises";
import {existsSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const require = createRequire(import.meta.url);
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const Lineup = require(path.join(ROOT, "lineup-model.js"));
export const Compliance = require(path.join(ROOT, "compliance-model.js"));
export const Engine = require(path.join(ROOT, "sim-engine.js"));

export const SIM_DIR = path.join(ROOT, "sim");
export const CONFIG_PATH = process.env.SIM_CONFIG_PATH || path.join(SIM_DIR, "config.json");
export const LEDGER_PATH = process.env.SIM_LEDGER_PATH || path.join(SIM_DIR, "sim-ledger.json");
export const STATUS_PATH = process.env.SIM_STATUS_PATH || path.join(SIM_DIR, "status.json");
// A scratch-isolated test run (or any tool invocation that should not leave
// real-looking artifacts behind) can redirect where finished results and
// per-run cache state land, the same way it already redirects the ledger.
export const RESULTS_DIR = process.env.SIM_RESULTS_DIR || path.join(SIM_DIR, "results");
export const CACHE_DIR = process.env.SIM_CACHE_DIR || path.join(SIM_DIR, "cache");

export const EXIT = {
  CONTINUE: 0,
  INVALID_SWAPS: 2,
  CONVERGED: 10,
  CAP_REACHED: 11,
  MAX_ITERATIONS: 12,
  TIME_LIMIT: 13,
  ERROR: 1
};

export function parseArgs(argv) {
  const args = {_: []};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

// A fallback of null is a real fallback, so presence is decided by arity.
export async function readJson(file, ...fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (fallback.length) return fallback[0];
    throw new Error(`Could not read ${path.relative(ROOT, file)}: ${error.message}`);
  }
}

export async function writeJson(file, value) {
  await mkdir(path.dirname(file), {recursive: true});
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

export async function loadConfig() {
  const config = await readJson(CONFIG_PATH);
  ["gamesPerIteration", "maxIterations", "maxTotalSimulations", "maxWallClockMs"].forEach((key) => {
    if (!Number.isFinite(Number(config[key])) || Number(config[key]) <= 0) throw new Error(`sim/config.json is missing a positive ${key}`);
  });
  return config;
}

export async function loadOpponents() {
  return readJson(path.join(SIM_DIR, "opponents.json"));
}

// The engine samples one profile per seat from this weighted list.
export function buildTable(opponents, tableName) {
  const name = tableName || opponents.defaultTable;
  const mix = opponents.tables[name];
  if (!mix) throw new Error(`Unknown opponent table "${name}"`);
  const total = mix.reduce((sum, entry) => sum + Number(entry.weight || 0), 0) || 1;
  return {
    name,
    winTurn: opponents.tableWinTurn?.[name] || 11.5,
    seats: mix.map((entry) => ({...opponents.profiles[entry.profile], weight: Number(entry.weight || 0) / total}))
  };
}

export async function loadCatalog() {
  const [variants, buyPlans, cards] = await Promise.all([
    readJson(path.join(ROOT, "data/variants.json")),
    readJson(path.join(ROOT, "data/buy-plans.json")),
    readJson(path.join(ROOT, "data/cards.json"))
  ]);
  const audited = new Map(cards.cards.map((card) => [Lineup.normalizeName(card.name), card]));
  return {variants, buyPlans, cards, audited};
}

function literalCardsFor(plan, audited, selection) {
  return Lineup.selectedEntries(plan, selection).map((entry) => {
    const meta = audited.get(Lineup.normalizeName(entry.item.name)) || {};
    return {
      name: entry.item.name,
      quantity: Math.max(1, Number(entry.item.quantity || 1)),
      isCommander: Boolean(entry.item.isCommander),
      typeLine: entry.item.typeLine || meta.typeLine || "",
      manaCost: entry.item.manaCost || meta.manaCost || "",
      oracleText: entry.item.oracleText || meta.oracleText || "",
      keywords: entry.item.keywords || meta.keywords || [],
      colorIdentity: entry.item.colorIdentity || meta.colorIdentity || [],
      commanderLegal: entry.item.commanderLegal !== false && (meta.legalities?.commander || "legal") === "legal",
      gameChanger: Boolean(entry.item.gameChanger),
      price: Number(entry.item.price ?? meta.price ?? 0),
      tags: entry.item.tags || [],
      lineupKind: entry.kind,
      source: entry.kind
    };
  });
}

// The Tuned build: the plan's starting shell with every required purchase applied.
// This is what the site shows as the default Buy Picks lineup, independent of
// whichever boxes an individual browser happens to have ticked.
export function tunedCards(plan, audited) {
  return literalCardsFor(plan, audited, Lineup.defaultSelection(plan));
}

// The Maxed build: every Enhance and Max option layered on top of the Tuned
// build, the same way the site's own "select everything" controls do it —
// composing Lineup.applyChoice one item at a time so slot/replacement and
// duplicate-name resolution behave exactly as they do in the browser.
export function maxedCards(plan, audited) {
  let selection = Lineup.defaultSelection(plan);
  [...(plan.enhance || []), ...(plan.max || [])].forEach((item) => {
    selection = Lineup.applyChoice(plan, selection, item.id);
  });
  return literalCardsFor(plan, audited, selection);
}

export function literalFor(card) {
  return {
    name: card.name,
    quantity: Math.max(1, Number(card.quantity || 1)),
    typeLine: card.typeLine || "",
    colorIdentity: card.colorIdentity || [],
    gameChanger: Boolean(card.gameChanger),
    commanderLegal: card.commanderLegal !== false,
    isCommander: Boolean(card.isCommander),
    tags: [...(card.tags || []), ...Compliance.deriveComplianceTags(card)]
  };
}

export function evaluateList(cards) {
  return Compliance.evaluateCardList(cards.map(literalFor));
}

// How many cards in a list can actually do each job. Used to stop the optimizer
// trading away a whole role — a simulator that rewards attacking will happily
// cut every board wipe, and that is model bias, not deckbuilding advice.
export function roleCensus(cards) {
  const census = {ramp: 0, draw: 0, removal: 0, wipe: 0, protection: 0, land: 0, threat: 0};
  cards.forEach((card) => {
    const quantity = Math.max(1, Number(card.quantity || 1));
    const profile = Engine.classifyCard(card);
    if (profile.isLand) census.land += quantity;
    if (profile.isRamp) census.ramp += quantity;
    if (profile.isDraw) census.draw += quantity;
    if (profile.isRemoval) census.removal += quantity;
    if (profile.isWipe) census.wipe += quantity;
    if (profile.isProtection) census.protection += quantity;
    if (profile.isCreature) census.threat += quantity;
  });
  return census;
}

// Every rule a proposed list must satisfy before a single game is played.
// `constraints.tier` picks which bracket's extra rules gate validity — Tier 2
// (no Game Changers, no mass land denial, no two-card combos) or Tier 3 (up to
// three Game Changers). The 100-card, singleton, identity and legality checks
// are shared by both and always apply. Defaults to 3 to preserve every
// existing caller that never had a tier to specify.
export function validateList(cards, constraints = {}) {
  const problems = [];
  const result = evaluateList(cards);
  const tier = constraints.tier === 2 ? 2 : 3;
  if (constraints.roleFloors) {
    const census = roleCensus(cards);
    Object.entries(constraints.roleFloors).forEach(([role, floor]) => {
      if (census[role] < floor) problems.push(`${census[role]} ${role} cards is below the floor of ${floor}; the deck may not trade a role away.`);
    });
  }
  if (result.total !== 100) problems.push(`The list contains ${result.total} cards; Commander requires exactly 100.`);
  result[`tier${tier}`].forEach((issue) => problems.push(`${issue.card}: ${issue.rule}`));
  const lands = result.types.Land || 0;
  if (constraints.landFloor && lands < constraints.landFloor) problems.push(`${lands} lands is below the configured floor of ${constraints.landFloor}.`);
  if (constraints.landCeiling && lands > constraints.landCeiling) problems.push(`${lands} lands is above the configured ceiling of ${constraints.landCeiling}.`);
  (constraints.mustKeep || []).forEach((name) => {
    if (!cards.some((card) => Lineup.normalizeName(card.name) === Lineup.normalizeName(name))) problems.push(`${name} must stay in the deck but is not in the list.`);
  });
  return {ok: problems.length === 0, problems, result};
}

export async function readLedger() {
  return readJson(LEDGER_PATH, {schemaVersion: 1, totalGames: 0, requests: {}, runs: []});
}

export async function writeLedger(ledger) {
  return writeJson(LEDGER_PATH, ledger);
}

// The cap is enforced here and nowhere else. There is no override flag, and no
// caller can raise a limit: a --max-games argument may only lower one.
export function capCheck(ledger, config, requestId, plannedGames) {
  const used = Number(ledger.requests?.[requestId]?.games || 0);
  const globalUsed = Number(ledger.totalGames || 0);
  if (globalUsed + plannedGames > config.maxLedgerSimulations) {
    return {allowed: false, reason: "ledger", used: globalUsed, cap: config.maxLedgerSimulations};
  }
  if (used + plannedGames > config.maxTotalSimulations) {
    return {allowed: false, reason: "request", used, cap: config.maxTotalSimulations};
  }
  return {allowed: true, used, remaining: config.maxTotalSimulations - used - plannedGames};
}

export async function recordGames(requestId, games) {
  const ledger = await readLedger();
  ledger.totalGames = Number(ledger.totalGames || 0) + games;
  ledger.requests = ledger.requests || {};
  ledger.requests[requestId] = {games: Number(ledger.requests?.[requestId]?.games || 0) + games};
  await writeLedger(ledger);
  return ledger;
}

export async function writeStatus(status) {
  return writeJson(STATUS_PATH, {...status, updatedAt: new Date().toISOString()});
}

export function requestIdFor(variantId, stamp) {
  return `sim-${variantId}-${stamp}`;
}

export function stampNow() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
}

export function relative(file) {
  return path.relative(ROOT, file);
}

export function fileExists(file) {
  return existsSync(file);
}
