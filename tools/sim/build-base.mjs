// Rebuilds every variant's Base rung as the cheapest hundred that is still the
// same deck.
//
//   node tools/sim/build-base.mjs                 # report what would change
//   node tools/sim/build-base.mjs --write         # write it into data/buy-plans.json
//   node tools/sim/build-base.mjs --cap 2 --write # a different per-card ceiling
//
// Base is the entry price: the placeholders you sleeve up while the real cards
// are still on the shop list, and the pile you retire into the salvage yard
// once they arrive. It had drifted a long way from that -- three shells carried
// The One Ring at $113 and eight broke Tier 2 outright -- because the generator
// budgeted at the whole-deck level and let expensive cards land in the starting
// shell.
//
// What it will not touch, and why:
//   * the commander, which is the deck
//   * any card a ladder item's `replaces` points at, because the Tuned, Fun and
//     Max chains resolve through those names and cutting one breaks the rung
//     above it
//   * anything already owned, which costs nothing more to play
//   * anything already under the cap
//
// Everything else is swapped for the cheapest card in the audited catalog that
// does the same job in the same colors, preferring one that also carries the
// deck's theme, so the role census and the strategy both survive the haircut.

import path from "node:path";
import {parseArgs, readJson, writeJson, loadCatalog, loadConfig, baseCards, tunedCards, enhanceCards, maxedCards, funTunedCards, funMaxCards, validateList, themeCensus, themeTermsFor, roleCensus, buildOracleIndex, deckAffinity, Lineup, Compliance, Engine, Generator, ROOT, relative} from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const cap = Number(args.cap ?? 2);
// How much of a card's fit with its deck a cheaper stand-in is allowed to give
// up. At 1 nothing may be traded for anything less connected to the plan, which
// protects the strategy perfectly and saves very little money; lower values buy
// a cheaper Base with a slightly blurrier deck.
const affinityRatio = Number(args["affinity-ratio"] ?? 0.75);
const write = Boolean(args.write);
const only = args.variant ? String(args.variant).split(",") : null;

const {variants, buyPlans, cards: cardData, audited} = await loadCatalog();
const config = await loadConfig();
const oracleIndex = buildOracleIndex(cardData.cards);

const LADDER_KEYS = ["required", "upgrade", "enhance", "max", "tuned2", "enhance2", "max2", "funTuned", "funMax", "altTuned", "altMax"];
const ownedNames = new Set((buyPlans.ownedExtras || []).map((name) => Lineup.normalizeName(name)));
const salvageNames = new Set();
(buyPlans.salvage || []).forEach((card) => String(card.name).split(" // ").forEach((face) => salvageNames.add(Lineup.normalizeName(face))));

// The one job a card does, in the order that matters for keeping a deck able to
// function: a land has to stay a land, and a wipe is not interchangeable with a
// creature. Anything with no job is filler and may be replaced by filler.
const ROLE_ORDER = ["land", "wipe", "ramp", "draw", "removal", "protection", "tutor", "recursion", "finisher", "threat"];
function primaryRole(card) {
  const profile = Engine.classifyCard(card);
  if (profile.isLand) return "land";
  if (profile.isWipe) return "wipe";
  if (profile.isRamp) return "ramp";
  if (profile.isDraw) return "draw";
  if (profile.isRemoval) return "removal";
  if (profile.isProtection) return "protection";
  if (profile.isTutor) return "tutor";
  if (profile.isRecursion) return "recursion";
  if (profile.isFinisher) return "finisher";
  if (profile.isCreature) return "threat";
  return "filler";
}

const carriesTheme = (card, terms) => themeCensus([card], terms) > 0;

// Mechanics distinctive enough that a card carrying one reads as belonging to a
// different deck. Cheap filler is easy to find; cheap filler that does not drag
// an unrelated engine in with it is the part that takes care. A Dimir theft deck
// that quietly picks up a +1/+1-counters card has not saved money, it has
// blurred into the counters deck three slots over.
const SIGNATURES = {
  "Counters / Proliferate": /proliferate|\+1\/\+1 counters?|-1\/-1 counters?|\bamass\b|\bwither\b|\binfect\b|charge counters?/i,
  "Lands / Landfall": /landfall/i,
  "Spellslinger": /magecraft|prowess|\bstorm\b/i,
  "Tribal / Typal": /chosen type|creature type of your choice/i,
  "Sacrifice / Aristocrats": /\bexploit\b|\bcasualty\b/i,
  "Tokens / Go-wide": /\bpopulate\b|\bconvoke\b/i,
  "Graveyard / Reanimator": /\bdisturb\b|\bflashback\b|\bescape\b|\bdelve\b/i,
  "Blink / ETB": /\bblink\b|\bflicker\b/i,
  "Enchantments / Auras": /\bconstellation\b|\bbestow\b/i,
  "Artifacts": /\baffinity\b|metalcraft|\bimprovise\b/i,
  "Lifegain": /\bextort\b|\bafflict\b/i
};
function foreignSignature(card, declared) {
  const haystack = `${card.oracleText || ""} ${card.typeLine || ""} ${(card.keywords || []).join(" ")}`;
  return Object.entries(SIGNATURES).some(([mechanic, pattern]) => !declared.has(mechanic) && pattern.test(haystack));
}

// Shell entries in the hand-authored decks carry price 0 and get their real
// number from the audited catalog, so reading item.price alone would price
// three quarters of the shells at nothing and swap nothing out.
const priceOf = (item) => {
  const own = Number(item.price ?? 0);
  if (own > 0) return own;
  return Number(audited.get(Lineup.normalizeName(item.name))?.price ?? 0);
};

// Every job a card does, not just its headline one. A creature that also grants
// protection is holding two slots in the role census, and replacing it with a
// bare creature quietly costs the deck a defensive card.
function allRoles(card) {
  const profile = Engine.classifyCard(card);
  return new Set(["Ramp", "Draw", "Removal", "Wipe", "Protection", "Finisher", "Recursion", "Tutor", "Land", "Creature"]
    .filter((role) => profile[`is${role}`])
    .map((role) => role.toLowerCase()));
}

const overlap = (roles, wanted) => Array.from(wanted).filter((role) => roles.has(role)).length;

const rows = [];
for (const plan of Object.values(buyPlans.plans)) {
  if (only && !only.includes(plan.variantId)) continue;
  const variant = variants.variants.find((entry) => entry.id === plan.variantId);
  const themeTerms = themeTermsFor(variant?.mechanics || []);
  const declared = new Set((variant?.mechanics || []).map((mechanic) => Generator.THEME_ALIASES[mechanic] || mechanic));
  const shell = plan.startingShell || [];
  const commander = shell.find((item) => item.isCommander);
  const identity = new Set((commander?.colorIdentity || []).map((color) => String(color).toUpperCase()));

  // Names the rungs above Base depend on, in either direction: a card a ladder
  // replaces must stay put, and a card a ladder introduces must not appear here
  // or applying that ladder would duplicate it.
  const replacedByLadder = new Set();
  const introducedByLadder = new Set();
  LADDER_KEYS.forEach((key) => (plan[key] || []).forEach((item) => {
    introducedByLadder.add(Lineup.normalizeName(item.name));
    [].concat(item.replaces || []).forEach((name) => replacedByLadder.add(Lineup.normalizeName(String(name))));
  }));

  // Scored against the Tuned build rather than Base, so the yardstick is the
  // deck as it is meant to end up, not the placeholder pile being rebuilt.
  const affinity = deckAffinity(tunedCards(plan, audited), oracleIndex);
  const before = baseCards(plan, audited);
  const beforeCost = before.reduce((sum, card) => sum + Number(card.price || 0) * Math.max(1, Number(card.quantity || 1)), 0);
  const beforeTheme = themeCensus(before, themeTerms);
  const inDeck = new Set(shell.map((item) => Lineup.normalizeName(item.name)));

  const candidates = cardData.cards
    .filter((card) => {
      const key = Lineup.normalizeName(card.name);
      if (inDeck.has(key) || introducedByLadder.has(key) || salvageNames.has(key)) return false;
      // A missing price is not a low price. Forty-odd cards in the catalog carry
      // no number at all, and some of those (City of Traitors, Lion's Eye
      // Diamond) are worth hundreds -- taking them as free would build a "cheap"
      // Base out of the most expensive cards in the game.
      const price = Number(card.price ?? 0);
      if (!(price > 0) || price > cap) return false;
      if (/\bBasic Land\b/.test(card.typeLine || "")) return false;
      if ((card.legalities?.commander || "legal") !== "legal") return false;
      if (!(card.colorIdentity || []).every((color) => identity.has(String(color).toUpperCase()))) return false;
      if (Compliance.deriveComplianceTags(card).length) return false;
      if (foreignSignature(card, declared)) return false;
      return true;
    })
    .map((card) => ({card, role: primaryRole(card), roles: allRoles(card), themed: carriesTheme(card, themeTerms), affinity: affinity(card), price: Number(card.price || 0)}));

  const taken = new Set();
  const swaps = [];
  const kept = [];
  // The declared-mechanics census is kept as a reported number only -- a sanity
  // read on whether the deck still looks like its label -- while the affinity
  // comparison below is what actually decides each swap.
  const themeStart = themeCensus(before, themeTerms);
  let themeNow = themeStart;

  // Most expensive first, so the biggest savings get first claim on the
  // candidate pool.
  const order = shell.map((item, index) => index).sort((a, b) => priceOf(shell[b]) - priceOf(shell[a]));
  const replacement = new Map();
  order.forEach((index) => {
    const item = shell[index];
    const key = Lineup.normalizeName(item.name);
    if (item.isCommander) return;
    // A Game Changer in the shell makes Base, Tuned and Pod Fun -- every Tier 2
    // rung -- illegal, and no amount of cheapness makes an illegal deck a deck.
    // This one card comes out even when a ladder points at it, and the pointer
    // is rewritten to follow. That rewrite is the one place this tool touches a
    // replaces-chain, which is why the composition gate at the end is a gate.
    const mustGo = Boolean(item.gameChanger);
    if (!mustGo && replacedByLadder.has(key)) return;
    if (!mustGo && ownedNames.has(key)) return;
    const outPrice = priceOf(item);
    if (!mustGo && outPrice <= cap) return;

    const role = primaryRole(item);
    const outRoles = allRoles(item);
    const wantTheme = carriesTheme(item, themeTerms);
    // Same job first, then the deck's own plan, then how much else the card was
    // doing, and only then price.
    // Same job, and no less a part of this deck than the card leaving. Affinity
    // is what protects the strategy: a card the deck barely interacts with can
    // be swapped for anything, and a card carrying the plan can only be swapped
    // for another card that carries it. A Game Changer has to go regardless --
    // an illegal Tier 2 deck is not a deck -- so it takes the best available
    // rather than being blocked.
    const outAffinity = affinity(item);
    const pool = candidates
      .filter((entry) => !taken.has(entry.card.name) && entry.role === role)
      .filter((entry) => mustGo || entry.affinity >= outAffinity * affinityRatio)
      .sort((a, b) =>
        overlap(b.roles, outRoles) - overlap(a.roles, outRoles) ||
        a.price - b.price ||
        b.affinity - a.affinity);
    const pick = pool[0];
    if (!pick) {
      kept.push({
        name: item.name,
        price: outPrice,
        why: `nothing under $${cap} in these colors both fills the ${role} slot and holds the deck's plan as well (affinity ${outAffinity.toFixed(0)})`,
        blocking: mustGo
      });
      return;
    }
    const themeCost = wantTheme && !pick.themed ? 1 : 0;
    const themeGain = !wantTheme && pick.themed ? 1 : 0;
    themeNow += themeGain - themeCost;
    taken.add(pick.card.name);
    swaps.push({out: item.name, outPrice, in: pick.card.name, inPrice: pick.price, role, forced: mustGo});
    if (mustGo && replacedByLadder.has(key)) {
      LADDER_KEYS.forEach((ladder) => (plan[ladder] || []).forEach((entry) => {
        if (!entry.replaces) return;
        if (Array.isArray(entry.replaces)) entry.replaces = entry.replaces.map((name) => (Lineup.normalizeName(String(name)) === key ? pick.card.name : name));
        else if (Lineup.normalizeName(String(entry.replaces)) === key) entry.replaces = pick.card.name;
      }));
    }
    replacement.set(index, {
      ...item,
      id: `shell-${plan.variantId}-base-${Lineup.normalizeName(pick.card.name).replace(/[^a-z0-9]+/g, "-")}`,
      name: pick.card.name,
      manaCost: pick.card.manaCost || "",
      typeLine: pick.card.typeLine || "",
      oracleText: pick.card.oracleText || "",
      keywords: pick.card.keywords || [],
      colorIdentity: pick.card.colorIdentity || [],
      gameChanger: Boolean(pick.card.gameChanger),
      image: pick.card.image || "",
      tcgplayerUrl: pick.card.tcgplayerUrl || "",
      commanderLegal: true,
      price: pick.price,
      ceiling: Number(pick.card.ceiling ?? pick.price)
    });
  });
  const nextShell = shell.map((item, index) => replacement.get(index) || item);

  // The pointer rewrites above already landed on the plan's ladder arrays, so
  // the shell has to land too or the two halves disagree and every rung above
  // Base comes out a card long. Nothing reaches disk until --write.
  plan.startingShell = nextShell;
  const after = baseCards(plan, audited);
  const afterCost = after.reduce((sum, card) => sum + Number(card.price || 0) * Math.max(1, Number(card.quantity || 1)), 0);
  const check = validateList(after, {tier: 2});
  const afterTheme = themeCensus(after, themeTerms);
  rows.push({
    variantId: plan.variantId,
    swaps,
    kept,
    beforeCost: Number(beforeCost.toFixed(2)),
    afterCost: Number(afterCost.toFixed(2)),
    beforeTheme,
    afterTheme,
    total: after.reduce((sum, card) => sum + Math.max(1, Number(card.quantity || 1)), 0),
    ok: check.ok,
    problems: check.problems,
    roleBefore: roleCensus(before),
    roleAfter: roleCensus(after),
    nextShell
  });
}

rows.forEach((row) => {
  const roleDrops = Object.entries(row.roleAfter).filter(([role, count]) => count < row.roleBefore[role]).map(([role, count]) => `${role} ${row.roleBefore[role]}→${count}`);
  console.log(`${row.variantId.padEnd(4)} $${String(row.beforeCost).padStart(7)} → $${String(row.afterCost).padStart(6)}  ${String(row.swaps.length).padStart(2)} swaps  ${row.total} cards  theme ${row.beforeTheme}→${row.afterTheme}  ${row.ok ? "Tier 2 clean" : `TIER 2: ${row.problems.join("; ")}`}${roleDrops.length ? `  roles ${roleDrops.join(", ")}` : ""}`);
  if (args.verbose) {
    row.swaps.forEach((swap) => console.log(`       ${swap.role.padEnd(10)} ${swap.out} ($${swap.outPrice}) → ${swap.in} ($${swap.inPrice})`));
    row.kept.filter((entry) => entry.price >= 5).forEach((entry) => console.log(`       kept       ${entry.name} ($${entry.price}) — ${entry.why}`));
  }
});

const blocked = rows.flatMap((row) => row.kept.filter((entry) => entry.blocking).map((entry) => `${row.variantId}: ${entry.name} — ${entry.why}`));
if (blocked.length) {
  console.error(`\nRefusing to write: ${blocked.length} Game Changer(s) could not be removed from a Tier 2 Base.`);
  blocked.forEach((problem) => console.error(`  - ${problem}`));
  process.exit(1);
}

const totalBefore = rows.reduce((sum, row) => sum + row.beforeCost, 0);
const totalAfter = rows.reduce((sum, row) => sum + row.afterCost, 0);
console.log(`\n${rows.length} variants · $${totalBefore.toFixed(2)} → $${totalAfter.toFixed(2)} · ${rows.reduce((sum, row) => sum + row.swaps.length, 0)} swaps · ${rows.filter((row) => row.ok).length} Tier 2 clean · ${rows.filter((row) => row.total === 100).length} at 100 cards`);

// Every rung above Base resolves its replaces-chain through the shell, so
// touching the shell can silently break a rung two levels up -- a card replaced
// twice, a slot left empty, a list that no longer adds to a hundred. That has
// happened before on this data, so the check is a gate rather than a report:
// nothing is written until every rung of every variant still composes.
const RUNGS = [
  ["Base", baseCards],
  ["Tuned", tunedCards],
  ["Enhance", enhanceCards],
  ["Max", maxedCards],
  ["Pod Fun", funTunedCards, "funTuned"],
  ["Fun Max", funMaxCards, "funMax"]
];
const breaks = [];
Object.values(buyPlans.plans).forEach((plan) => {
  RUNGS.forEach(([label, compose, requires]) => {
    if (requires && !(plan[requires] || []).length) return;
    let list;
    try {
      list = compose(plan, audited);
    } catch (error) {
      breaks.push(`${plan.variantId} ${label}: ${error.message}`);
      return;
    }
    const total = list.reduce((sum, card) => sum + Math.max(1, Number(card.quantity || 1)), 0);
    if (total !== 100) breaks.push(`${plan.variantId} ${label}: ${total} cards, not 100`);
    const seen = new Map();
    list.forEach((card) => seen.set(Lineup.normalizeName(card.name), (seen.get(Lineup.normalizeName(card.name)) || 0) + 1));
    const dupes = Array.from(seen.entries()).filter(([name, count]) => count > 1 && !/^(plains|island|swamp|mountain|forest|wastes)$/.test(name));
    if (dupes.length) breaks.push(`${plan.variantId} ${label}: duplicated ${dupes.map(([name]) => name).join(", ")}`);
    if (!list.some((card) => card.isCommander)) breaks.push(`${plan.variantId} ${label}: no commander`);
  });
});
if (breaks.length) {
  console.error(`\nRefusing to write: ${breaks.length} rung(s) no longer compose.`);
  breaks.slice(0, 20).forEach((problem) => console.error(`  - ${problem}`));
  process.exit(1);
}
console.log(`all ${RUNGS.length} rungs compose for every variant`);

if (write) {
  await writeJson(path.join(ROOT, "data/buy-plans.json"), buyPlans);
  // Provenance. Which card stood in for which, per variant, so the workbook
  // fixture can still be compared card-for-card after the shell moved under it,
  // and so "why is this card in my Base?" has an answer that is not "the tool
  // decided".
  await writeJson(path.join(ROOT, "data/base-rebuild.json"), {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    note: "Base rungs rebuilt as the cheapest hundred that is still the same deck. Prices are real market prices; owned cards were left in place.",
    perCardCapUsd: cap,
    variants: Object.fromEntries(rows.map((row) => [row.variantId, {
      costBefore: row.beforeCost,
      costAfter: row.afterCost,
      substitutions: Object.fromEntries(row.swaps.map((swap) => [swap.out, swap.in])),
      forced: row.swaps.filter((swap) => swap.forced).map((swap) => swap.out),
      keptOverCap: row.kept.filter((entry) => entry.price >= 5).map((entry) => ({name: entry.name, price: entry.price, why: entry.why}))
    }]))
  });
  console.log(`written to ${relative(path.join(ROOT, "data/buy-plans.json"))} and ${relative(path.join(ROOT, "data/base-rebuild.json"))}`);
} else {
  console.log("(dry run — pass --write to save)");
}
