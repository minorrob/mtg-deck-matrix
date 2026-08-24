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
export const Generator = require(path.join(ROOT, "deck-generator.js"));

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

// The Base build: the plan's starting shell with nothing bought on top of it.
// This is the cheapest legal hundred the variant can be assembled from -- the
// placeholders you play while the real cards are still on the shop list -- and
// it is measured, never optimized. Its whole point is to show what the entry
// price actually buys you.
export function baseCards(plan, audited) {
  const selection = Lineup.canonicalizeSelection(plan, {
    ...Lineup.emptySelection(),
    shell: (plan.startingShell || plan.baseCards || []).map((item) => String(item.id))
  });
  return literalCardsFor(plan, audited, selection);
}

// The Tuned build: the plan's starting shell with every required purchase applied,
// plus the Monte-Carlo-improved tuned2 cards the Tuned tab folds in alongside them.
// This is what the site shows as the default Buy Picks lineup, independent of
// whichever boxes an individual browser happens to have ticked -- measuring
// required alone would score a list the UI never displays.
export function tunedCards(plan, audited) {
  let selection = Lineup.defaultSelection(plan);
  (plan.tuned2 || []).forEach((item) => {
    selection = Lineup.applyChoice(plan, selection, item.id);
  });
  return literalCardsFor(plan, audited, selection);
}

// Every rung above Tuned layers on the Tuned build, so each starts from the same
// corrected base -- required plus the tuned2 cards the Tuned tab folds in.
function tunedSelection(plan) {
  let selection = Lineup.defaultSelection(plan);
  (plan.tuned2 || []).forEach((item) => {
    selection = Lineup.applyChoice(plan, selection, item.id);
  });
  return selection;
}

// The Enhance build: every Enhance option layered on top of Tuned, without Max
// — the middle rung, same composition method as maxedCards below.
export function enhanceCards(plan, audited) {
  let selection = tunedSelection(plan);
  // ownedOptional items are free substitutions offered to the owner, never part
  // of the published build -- the measured numbers describe the list without
  // them, so composing them in would detach a score from its deck.
  [...(plan.upgrade || []), ...(plan.enhance || [])].filter((item) => !item.ownedOptional).forEach((item) => {
    selection = Lineup.applyChoice(plan, selection, item.id);
  });
  return literalCardsFor(plan, audited, selection);
}

// The Maxed build: every Enhance and Max option layered on top of the Tuned
// build, the same way the site's own "select everything" controls do it —
// composing Lineup.applyChoice one item at a time so slot/replacement and
// duplicate-name resolution behave exactly as they do in the browser.
export function maxedCards(plan, audited) {
  let selection = tunedSelection(plan);
  [...(plan.upgrade || []), ...(plan.enhance || []), ...(plan.enhance2 || []), ...(plan.max || []), ...(plan.max2 || [])].filter((item) => !item.ownedOptional).forEach((item) => {
    selection = Lineup.applyChoice(plan, selection, item.id);
  });
  return literalCardsFor(plan, audited, selection);
}

// The Fun Tuned build: the plan's own fun-weighted ladder applied to the bare
// starting shell. Unlike Enhance/Max this is NOT layered on Tuned -- it is a
// re-optimization built straight off Base, so it starts from the shell alone
// and never applies plan.required.
export function funTunedCards(plan, audited) {
  let selection = Lineup.emptySelection();
  selection.shell = (plan.startingShell || plan.baseCards || []).map((item) => String(item.id));
  selection = Lineup.canonicalizeSelection(plan, selection);
  (plan.funTuned || []).forEach((item) => {
    selection = Lineup.applyChoice(plan, selection, item.id);
  });
  return literalCardsFor(plan, audited, selection);
}

// The Fun Max build: the Fun Max ladder on top of Fun Tuned, the pairing the
// site itself presents (and the only order in which funMax's replaces-chain
// resolves against the cards funTuned actually put on the board).
export function funMaxCards(plan, audited) {
  let selection = Lineup.emptySelection();
  selection.shell = (plan.startingShell || plan.baseCards || []).map((item) => String(item.id));
  selection = Lineup.canonicalizeSelection(plan, selection);
  [...(plan.funTuned || []), ...(plan.funMax || [])].forEach((item) => {
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

// How many cards still carry the deck's declared theme. The optimizer scores a
// deck on how often it wins, and the engine cannot see most theme payoffs at all
// (no cast triggers, no taxation), so left alone it will happily trade a
// spellslinger deck's whole identity for generically efficient cards. Protecting
// named cards would be too blunt -- it freezes specific choices the optimizer
// might legitimately improve. Protecting the DENSITY lets it swap anything it
// likes as long as the result is still recognizably the deck you asked for.
// How much a card reads like the rest of a particular deck.
//
// The declared `mechanics` label turned out to be too coarse to protect a
// strategy: "Control / Interaction" does not describe a theft deck, so a census
// built on it scored every one of that deck's actual theft cards as off-theme
// and let them all be traded away for cheap removal. This measures the deck
// against ITSELF instead. Repeated phrases in a deck's oracle text are what the
// deck is about -- "spirits you control", "sacrifice a land", "magecraft
// whenever" -- and a phrase's weight falls with how common it is across the
// whole catalog, so "draw a card" counts for almost nothing and "cards leave
// your graveyard" counts for a lot.
//
// The result is a number with no absolute meaning, only a comparative one:
// swapping card A for card B is safe for the strategy when B scores at least as
// high as A. Filler scores near zero and can be replaced by anything; a card
// carrying the plan can only be replaced by another card carrying it.
const AFFINITY_STOPWORDS = new Set(("a an the of to and or for with this that it its you your they their target each all any " +
  "from into onto on in at as be is are was were when whenever if then than may can could will would do does put get gets have has had").split(" "));

export function oracleShingles(text, maxSize = 4) {
  const words = String(text || "").toLowerCase().replace(/[^a-z0-9/+\- ]+/g, " ").split(/\s+/).filter(Boolean);
  const grams = new Set();
  for (let size = 2; size <= maxSize; size += 1) {
    for (let index = 0; index + size <= words.length; index += 1) {
      const gram = words.slice(index, index + size);
      if (gram.every((word) => AFFINITY_STOPWORDS.has(word))) continue;
      grams.add(gram.join(" "));
    }
  }
  return grams;
}

// Catalog-wide document frequency, built once and shared by every deck.
export function buildOracleIndex(catalogCards) {
  const documentFrequency = new Map();
  catalogCards.forEach((card) => oracleShingles(card.oracleText).forEach((gram) => {
    documentFrequency.set(gram, (documentFrequency.get(gram) || 0) + 1);
  }));
  return {documentFrequency, documents: Math.max(1, catalogCards.length)};
}

export function deckAffinity(deckCards, index) {
  const deckFrequency = new Map();
  deckCards
    .filter((card) => !/\bLand\b/.test(card.typeLine || ""))
    .forEach((card) => oracleShingles(card.oracleText).forEach((gram) => {
      deckFrequency.set(gram, (deckFrequency.get(gram) || 0) + 1);
    }));
  return (card) => {
    const grams = oracleShingles(card.oracleText);
    if (!grams.size) return 0;
    let total = 0;
    grams.forEach((gram) => {
      const inDeck = deckFrequency.get(gram) || 0;
      if (inDeck < 2) return; // said once, by one card: that is the card, not the deck
      const idf = Math.log(index.documents / (1 + (index.documentFrequency.get(gram) || 0)));
      total += inDeck * Math.max(0, idf);
    });
    // Longer cards say more words and would otherwise always win.
    return total / Math.sqrt(grams.size);
  };
}

// The deck's phrase vocabulary, flattened into something a request file can
// carry: gram -> how much a card matching it counts. Frequency inside the deck
// times how rare the phrase is across the catalog, keeping only the strongest
// few hundred, so the whole signature travels as a few kilobytes of JSON and a
// simulation run can enforce it without re-reading the catalog.
export function affinityWeights(deckCards, index, limit = 400) {
  const deckFrequency = new Map();
  deckCards
    .filter((card) => !/\bLand\b/.test(card.typeLine || ""))
    .forEach((card) => oracleShingles(card.oracleText).forEach((gram) => {
      deckFrequency.set(gram, (deckFrequency.get(gram) || 0) + 1);
    }));
  return Object.fromEntries(Array.from(deckFrequency.entries())
    .filter(([, count]) => count >= 2)
    .map(([gram, count]) => [gram, count * Math.max(0, Math.log(index.documents / (1 + (index.documentFrequency.get(gram) || 0))))])
    .filter(([, weight]) => weight > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit));
}

export function cardAffinity(card, weights) {
  const grams = oracleShingles(card.oracleText);
  if (!grams.size) return 0;
  let total = 0;
  grams.forEach((gram) => { total += weights[gram] || 0; });
  return total / Math.sqrt(grams.size);
}

// How much of the deck's own plan a hundred-card list is still carrying.
export function listAffinity(cards, weights) {
  return cards.reduce((sum, card) => sum + cardAffinity(card, weights) * Math.max(1, Number(card.quantity || 1)), 0);
}

// The oracle-text vocabulary for a variant's declared mechanics. Taken from the
// generator's own theme table so a deck is measured against the same words it
// was built from, rather than a second list that could drift away from it.
export function themeTermsFor(mechanics = []) {
  const terms = new Set();
  (mechanics || []).forEach((mechanic) => {
    const key = Generator.THEME_ALIASES[mechanic] || mechanic;
    (Generator.THEME_QUERIES[key]?.terms || []).forEach((term) => terms.add(term));
  });
  return Array.from(terms);
}

export function themeCensus(cards, themeTerms = []) {
  if (!themeTerms.length) return 0;
  const terms = themeTerms.map((term) => String(term).toLowerCase());
  return cards.reduce((count, card) => {
    const haystack = `${card.oracleText || ""} ${card.typeLine || ""} ${(card.keywords || []).join(" ")}`.toLowerCase();
    return terms.some((term) => haystack.includes(term)) ? count + Math.max(1, Number(card.quantity || 1)) : count;
  }, 0);
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
  // The strategic-identity floor. Role floors keep the deck's shape (how much it
  // ramps, draws, interacts); this keeps its plan -- a Voltron deck must still be
  // stacking one threat, a spellslinger deck must still be casting spells that
  // matter. Without it the optimizer maximizes a score whose engine cannot see
  // most theme payoffs, and quietly hands back a generically efficient pile.
  // The strategy guard. Not a list of protected cards -- the optimizer may swap
  // anything it likes -- but a floor on how much of the deck's own plan the
  // hundred still carries, so it cannot cash the strategy in for generically
  // efficient cards and call that an improvement.
  if (constraints.affinityFloor && constraints.affinityWeights) {
    const carried = listAffinity(cards, constraints.affinityWeights);
    if (carried < constraints.affinityFloor) {
      problems.push(`the list carries ${carried.toFixed(0)} of this deck's own strategy against a floor of ${constraints.affinityFloor.toFixed(0)}. The deck may not trade its own plan away.`);
    }
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
