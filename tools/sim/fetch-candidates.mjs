// Builds the pool of cards a simulation run is allowed to swap in.
//
//   node tools/sim/fetch-candidates.mjs --request sim/requests/sim-5o-<stamp>.json
//   node tools/sim/fetch-candidates.mjs --request <file> --offline
//
// Online, this asks Scryfall for role-appropriate cards in the commander's
// colors. Offline — or when Scryfall cannot be reached — it falls back to the
// variant's own Enhance, Maxxed and upgrade ladders plus every audited card in
// data/cards.json that fits the color identity. The offline pool is smaller but
// it is the same curated set the site already prices and links.

import path from "node:path";
import {createRequire} from "node:module";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {parseArgs, readJson, writeJson, loadCatalog, loadConfig, Lineup, Compliance, Engine, ROOT, CACHE_DIR, relative} from "./lib.mjs";

const require = createRequire(import.meta.url);
const Scryfall = require(path.join(ROOT, "scryfall-client.js"));
const args = parseArgs(process.argv.slice(2));

// Node's global fetch does not read HTTP_PROXY/HTTPS_PROXY on its own — that
// needs the --use-env-proxy flag set before the process starts, which is too
// late to set from inside this file. Behind a corporate or sandboxed proxy
// (HTTPS_PROXY set) and about to make a live call, re-exec once with the flag
// added. Nothing here runs when there is no proxy configured, which is the
// case on an ordinary machine, so this is a no-op outside that situation.
if (!args.offline && (process.env.HTTPS_PROXY || process.env.https_proxy) && !process.execArgv.includes("--use-env-proxy")) {
  const child = spawnSync(process.execPath, ["--use-env-proxy", fileURLToPath(import.meta.url), ...process.argv.slice(2)], {stdio: "inherit", env: process.env});
  process.exit(child.status ?? 1);
}

if (!args.request) {
  console.log("Usage: node tools/sim/fetch-candidates.mjs --request <requestFile> [--offline] [--out <file>]");
  process.exit(1);
}

const requestPath = path.resolve(ROOT, String(args.request));
const request = await readJson(requestPath);
const config = await loadConfig();
const {buyPlans, cards: cardData, audited} = await loadCatalog();
const plan = buyPlans.plans[request.variantId] || {};
const identity = new Set((request.constraints.colorIdentity || []).map((color) => String(color).toUpperCase()));
const inDeck = new Set(request.cards.map((card) => Lineup.normalizeName(card.name)));
const maxPrice = Number(request.constraints.maxSwapInPriceUsd || config.maxSwapInPriceUsd);

// Owned cards keep their real market price everywhere, so a build's stated cost
// stays the honest cost of the cards in it. Ownership is carried as a flag for
// display and for deliberate placement, never as a discount. The salvage pile is
// excluded outright -- those are owned cards judged not worth playing, so they
// stay out of every candidate pool.
const ownedNames = new Set((buyPlans.ownedExtras || []).map((name) => Lineup.normalizeName(name)));
const salvageNames = new Set((buyPlans.salvage || []).map((card) => Lineup.normalizeName(card.name)));
(buyPlans.salvage || []).forEach((card) => String(card.name).split(" // ").forEach((face) => salvageNames.add(Lineup.normalizeName(face))));
const isOwned = (card) => ownedNames.has(Lineup.normalizeName(card.name));

function fits(card) {
  if (!card?.name) return false;
  const key = Lineup.normalizeName(card.name);
  if (inDeck.has(key)) return false;
  if (salvageNames.has(key)) return false;
  if (/\bBasic Land\b/.test(card.typeLine || "")) return false;
  if (card.commanderLegal === false) return false;
  if ((card.legalities?.commander || "legal") !== "legal") return false;
  if (!(card.colorIdentity || []).every((color) => identity.has(String(color).toUpperCase()))) return false;
  if (Compliance.deriveComplianceTags(card).length) return false;
  return true;
}

function shape(card, source) {
  const meta = audited.get(Lineup.normalizeName(card.name)) || {};
  const owned = isOwned(card);
  const merged = {
    name: card.name,
    owned,
    typeLine: card.typeLine || meta.typeLine || "",
    manaCost: card.manaCost || meta.manaCost || "",
    oracleText: card.oracleText || meta.oracleText || "",
    keywords: card.keywords || meta.keywords || [],
    colorIdentity: card.colorIdentity || meta.colorIdentity || [],
    commanderLegal: true,
    gameChanger: Boolean(card.gameChanger),
    price: Number(card.price ?? meta.price ?? 0),
    ceiling: Number(card.ceiling ?? card.price ?? meta.price ?? 0),
    tcgplayerUrl: card.tcgplayerUrl || meta.tcgplayerUrl || "",
    image: card.image || meta.image || "",
    source
  };
  const profile = Engine.classifyCard(merged);
  merged.roles = ["ramp", "draw", "removal", "wipe", "protection", "finisher", "recursion", "tutor"]
    .filter((role) => profile[`is${role.charAt(0).toUpperCase()}${role.slice(1)}`]);
  if (profile.isLand) merged.roles.push("land");
  if (profile.isCreature) merged.roles.push("threat");
  merged.cmc = profile.cmc;
  return merged;
}

const pool = new Map();
const add = (card, source) => {
  if (!fits(card)) return;
  const shaped = shape(card, source);
  if (shaped.price > maxPrice) return;
  const key = Lineup.normalizeName(shaped.name);
  if (!pool.has(key)) pool.set(key, shaped);
};

// The variant's own ladders first: these are already researched for this deck.
["enhance", "max", "upgrade", "required"].forEach((bucket) => (plan[bucket] || []).forEach((card) => add(card, `plan-${bucket}`)));

let onlineCards = 0;
let onlineError = "";
if (!args.offline) {
  try {
    const client = Scryfall.createClient({});
    const colors = Array.from(identity).join("").toLowerCase() || "wubrg";
    const queries = [
      `legal:commander id<=${colors} otag:ramp -type:land`,
      `legal:commander id<=${colors} otag:card-draw -type:land`,
      `legal:commander id<=${colors} otag:removal -type:land`,
      `legal:commander id<=${colors} otag:board-wipe -type:land`,
      `legal:commander id<=${colors} otag:protection -type:land`
    ];
    for (const query of queries) {
      const found = await client.search(query, {maxPages: 1, order: "edhrec"});
      found.forEach((card) => {
        onlineCards += 1;
        add(card, "scryfall");
      });
    }
  } catch (error) {
    onlineError = error.message;
  }
}

// Then everything else the site has already audited and priced.
cardData.cards.forEach((card) => add(card, "audited-pool"));

const candidates = Array.from(pool.values()).sort((a, b) => a.name.localeCompare(b.name));
const out = args.out ? path.resolve(ROOT, String(args.out)) : path.join(CACHE_DIR, `pool-${request.id}.json`);
await writeJson(out, {
  schemaVersion: 1,
  requestId: request.id,
  variantId: request.variantId,
  generatedAt: new Date().toISOString(),
  online: onlineCards > 0,
  onlineError,
  maxPrice,
  candidates
});

const byRole = {};
candidates.forEach((card) => card.roles.forEach((role) => { byRole[role] = (byRole[role] || 0) + 1; }));
console.log(`${candidates.length} candidates for ${request.variantId} (${onlineCards ? `${onlineCards} from Scryfall` : `offline${onlineError ? `: ${onlineError}` : ""}`})`);
console.log(`  by role       ${Object.entries(byRole).sort((a, b) => b[1] - a[1]).map(([role, count]) => `${role} ${count}`).join(" · ")}`);
console.log(`  written to    ${relative(out)}`);
