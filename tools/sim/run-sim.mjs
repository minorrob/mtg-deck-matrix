// The simulation runner. This file, and only this file, decides when a run
// stops: the ledger cap on games, the wall-clock budget, the iteration limit and
// the convergence test all live here. There is no override flag — a --games
// argument may lower a limit, never raise one — and every stop path returns the
// best list seen rather than the last one tried.
//
//   node tools/sim/run-sim.mjs --request <file> --init
//   node tools/sim/run-sim.mjs --request <file> --apply sim/results/<id>.swaps.json
//   node tools/sim/run-sim.mjs --request <file> --auto
//   node tools/sim/run-sim.mjs --request <file> --finalize
//
// Exit codes: 0 keep going · 2 the proposed swaps were rejected · 10 converged
// · 11 a simulation cap was reached · 12 the iteration limit was reached
// · 13 the wall-clock budget was reached.

import path from "node:path";
import {
  parseArgs, readJson, writeJson, loadConfig, loadOpponents, loadCatalog, buildTable, validateList,
  readLedger, capCheck, recordGames, writeStatus, evaluateList, roleCensus,
  Lineup, Compliance, Engine, ROOT, RESULTS_DIR, CACHE_DIR, EXIT, relative
} from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
if (!args.request) {
  console.log("Usage: node tools/sim/run-sim.mjs --request <requestFile> [--init|--apply <swaps>|--auto|--finalize]");
  process.exit(1);
}

const startedAt = Date.now();
const requestPath = path.resolve(ROOT, String(args.request));
const request = await readJson(requestPath);
const config = await loadConfig();
const opponents = await loadOpponents();
const table = buildTable(opponents, request.table || config.table);
const {audited} = await loadCatalog();
const statePath = path.join(CACHE_DIR, `state-${request.id}.json`);
const poolPath = args.pool ? path.resolve(ROOT, String(args.pool)) : path.join(CACHE_DIR, `pool-${request.id}.json`);
const quiet = Boolean(args.quiet);

// A --games argument may only reduce the batch size.
const gamesPerIteration = Math.max(20, Math.min(Number(args.games || config.gamesPerIteration), config.gamesPerIteration));
const maxIterations = Math.max(1, Math.min(Number(args["max-iterations"] || config.maxIterations), config.maxIterations));
const maxWallClockMs = Math.max(5000, Math.min(Number(args["max-ms"] || config.maxWallClockMs), config.maxWallClockMs));

const log = (message) => {
  if (!quiet) console.log(message);
};

function cardsWithMeta(cards) {
  return cards.map((card) => {
    const meta = audited.get(Lineup.normalizeName(card.name)) || {};
    return {
      ...card,
      typeLine: card.typeLine || meta.typeLine || "",
      manaCost: card.manaCost || meta.manaCost || "",
      oracleText: card.oracleText || meta.oracleText || "",
      colorIdentity: card.colorIdentity || meta.colorIdentity || [],
      price: Number(card.price ?? meta.price ?? 0)
    };
  });
}

async function loadState() {
  return readJson(statePath, {
    requestId: request.id,
    variantId: request.variantId,
    iteration: 0,
    cards: cardsWithMeta(request.cards),
    baseline: null,
    best: null,
    history: [],
    tried: [],
    stalledIterations: 0,
    startedAt: new Date().toISOString()
  });
}

async function saveState(state) {
  return writeJson(statePath, state);
}

async function loadPool() {
  const pool = await readJson(poolPath, {candidates: []});
  if (!pool.candidates.length) {
    console.error(`No candidate pool at ${relative(poolPath)}. Run: node tools/sim/fetch-candidates.mjs --request ${relative(requestPath)}`);
    process.exit(EXIT.ERROR);
  }
  return pool;
}

async function runBatch(cards, seed, label, state, gameCount) {
  const games = Math.min(Number(gameCount || gamesPerIteration), config.maxTotalSimulations);
  const ledger = await readLedger();
  const cap = capCheck(ledger, config, request.id, games);
  if (!cap.allowed) {
    await writeStatus({
      state: "cap-reached",
      message: cap.reason === "ledger"
        ? `The global simulation ledger is exhausted (${cap.used} of ${cap.cap} games).`
        : `This request has used its ${cap.cap}-game allowance.`,
      requestId: request.id,
      variantId: request.variantId,
      iteration: state.iteration,
      maxIterations,
      totalGamesUsed: cap.used,
      maxTotalSimulations: config.maxTotalSimulations,
      bestIteration: state.best?.iteration || 0,
      bestScore: state.best?.metrics.score || 0,
      currentMetrics: state.best?.metrics || null,
      history: state.history
    });
    return {capped: true, cap};
  }
  // A request may override the scoring weights (the Fun rung keeps fun at .10
  // instead of every other rung's .05) without changing anything else about
  // how the run is validated or measured.
  const result = Engine.simulateGames(cards, table.seats, {
    ...config,
    games,
    scoreWeights: request.constraints?.scoreWeights || config.scoreWeights,
    targets: config.targets
  }, seed, async (batch) => {
    await writeStatus({
      state: "simulating",
      message: `${label}: ${batch.completed} of ${batch.total} games`,
      requestId: request.id,
      variantId: request.variantId,
      iteration: state.iteration,
      maxIterations,
      gamesCompletedThisIteration: batch.completed,
      gamesPerIteration: games,
      totalGamesUsed: cap.used + batch.completed,
      maxTotalSimulations: config.maxTotalSimulations,
      bestIteration: state.best?.iteration || 0,
      bestScore: state.best?.metrics.score || 0,
      currentMetrics: batch.metrics,
      history: state.history
    });
  });
  await recordGames(request.id, games);
  return {capped: false, result, gamesUsed: cap.used + games};
}

// What makes a card a cut candidate, most reliable signal first: it sat dead in
// hand, it was cast too late to matter, or it never got cast at all. Win-rate
// lift is deliberately not the ranking — expensive cards only get cast in long
// games, and long games are the ones we survived, so lift flatters them. It is
// used only as a veto below. Lower is a worse card.
function contribution(stat, baseWinRate = 0) {
  const stranded = stat.deadRate || 0;
  const late = Math.max(0, (stat.avgCastTurn || 0) - 6) / 6;
  const unplayed = 1 - (stat.castRate || 0);
  const lift = (stat.winRateWhenCast || 0) - baseWinRate;
  return lift - (stranded * 1.5 + late + unplayed);
}

// A card is only a candidate to cut when the simulation caught it
// underperforming, and never when the games it was cast in were measurably the
// games that were won.
function hasCutEvidence(card, stat, baseWinRate = 0) {
  const rules = config.cutEvidence || {};
  if (!stat || !stat.games) return false;
  if ((stat.winRateWhenCast || 0) - baseWinRate > (rules.liftVeto ?? 0.06)) return false;
  if (stat.castRate < (rules.maxCastRate ?? 0.9)) return true;
  if (stat.deadRate > (rules.minDeadRate ?? 0.1)) return true;
  const cmc = Engine.classifyCard(card).cmc;
  if (stat.avgCastTurn > (rules.lateCastTurn ?? 6) && cmc >= (rules.lateCmc ?? 6)) return true;
  return false;
}

function cutRanking(cards, perCardStats, gaps, landCount, baseWinRate) {
  const stats = new Map(perCardStats.map((stat) => [Lineup.normalizeName(stat.name), stat]));
  const mustKeep = new Set((request.constraints.mustKeep || []).map((name) => Lineup.normalizeName(name)));
  const floodGap = gaps.some((gap) => gap.key === "flood");
  return cards
    .filter((card) => !card.isCommander)
    .filter((card) => !mustKeep.has(Lineup.normalizeName(card.name)))
    .filter((card) => Math.max(1, Number(card.quantity || 1)) === 1 || (/\bBasic Land\b/.test(card.typeLine) && floodGap && landCount > config.landFloor))
    .filter((card) => !/\bLand\b/.test(card.typeLine) || (floodGap && landCount > config.landFloor))
    .map((card) => {
      const stat = stats.get(Lineup.normalizeName(card.name)) || {castRate: 0, deadRate: 1, winRateWhenCast: 0, drawnRate: 0, avgCastTurn: 0};
      return {card, stat, value: contribution(stat, baseWinRate), evidence: hasCutEvidence(card, stat, baseWinRate)};
    })
    .filter((entry) => entry.evidence)
    .sort((a, b) => a.value - b.value);
}

// A deck that already runs one board wipe may keep one; it may not drop to zero.
// Reading the floor as an absolute would leave every deck that starts below it
// unable to make any swap at all.
function effectiveFloors(census) {
  const floors = {...(config.roleFloors || {})};
  floors.land = Math.min(floors.land ?? 33, request.constraints.landFloor ?? 33);
  Object.keys(floors).forEach((role) => {
    floors[role] = Math.min(floors[role], census[role] ?? floors[role]);
  });
  return floors;
}

function candidateRanking(pool, gaps, tried) {
  const severityByRole = new Map();
  gaps.forEach((gap) => gap.rolesToFix.forEach((role) => severityByRole.set(role, (severityByRole.get(role) || 0) + gap.severity)));
  const triedKeys = new Set(tried);
  return pool.candidates
    .filter((candidate) => !triedKeys.has(Lineup.normalizeName(candidate.name)))
    .map((candidate) => {
      const roleScore = (candidate.roles || []).reduce((sum, role) => sum + (severityByRole.get(role) || 0), 0);
      const curveBonus = candidate.cmc <= 3 ? 1.5 : candidate.cmc <= 5 ? 0.5 : 0;
      const priceDrag = Math.min(3, candidate.price / 25);
      return {candidate, value: roleScore + curveBonus - priceDrag};
    })
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value || a.candidate.price - b.candidate.price);
}

// A curated Tuned or Maxed build can include a card the target tier does not
// allow at all — most often a Game Changer baked into a required purchase, not
// an optional pick. That is not something the evidence-based optimizer below
// should be trusted to fix on its own: a Game Changer is usually a strong
// performer, so nothing in cutRanking's cast-rate/dead-rate evidence would
// ever flag it for removal even though its mere presence makes the whole list
// illegal. Legality is the floor everything else stands on, so it is forced
// straight, one named violation at a time, before a single game is measured.
function legalizeForTier(cards, pool, tier) {
  const fixes = [];
  let working = cards.map((card) => ({...card}));
  for (let pass = 0; pass < 12; pass += 1) {
    const result = evaluateList(working);
    const issues = result[`tier${tier}`];
    if (!issues.length) break;
    const inHand = new Set(working.map((card) => Lineup.normalizeName(card.name)));
    const targetKey = issues
      .flatMap((issue) => issue.card.split(" + "))
      .map((name) => Lineup.normalizeName(name))
      .find((key) => inHand.has(key));
    if (!targetKey) break; // not traceable to one named card (e.g. a raw count mismatch) — leave it for validateList to report
    const index = working.findIndex((card) => !card.isCommander && Lineup.normalizeName(card.name) === targetKey);
    if (index < 0) break;
    const removed = working[index];
    const picked = new Set(working.map((card) => Lineup.normalizeName(card.name)));
    const replacement = (pool.candidates || [])
      .filter((candidate) => !picked.has(Lineup.normalizeName(candidate.name)))
      .filter((candidate) => tier !== 2 || !candidate.gameChanger)
      .filter((candidate) => !Compliance.deriveComplianceTags(candidate).length)
      .sort((a, b) => (b.roles?.length || 0) - (a.roles?.length || 0) || Number(a.price || 0) - Number(b.price || 0))[0];
    if (!replacement) break;
    working.splice(index, 1, {...replacement, quantity: 1, isCommander: false});
    fixes.push({out: removed.name, in: replacement.name, reason: `Tier ${tier} does not allow ${removed.name} to stay in this list.`});
  }
  return {cards: working, fixes};
}

function proposeSwaps(cards, perCardStats, gaps, pool, tried, limit, baseWinRate = 0) {
  const landCount = evaluateList(cards).types.Land || 0;
  const cuts = cutRanking(cards, perCardStats, gaps, landCount, baseWinRate);
  const adds = candidateRanking(pool, gaps, tried);
  const census = roleCensus(cards);
  const floors = effectiveFloors(census);
  const swaps = [];
  const usedCuts = new Set();
  for (const add of adds) {
    if (swaps.length >= limit) break;
    const addRoles = rolesOf(add.candidate);
    // Pick a cut that the incoming card can cover for. Proposing a swap the
    // validator will refuse wastes an entire iteration, so the floors are
    // checked here rather than discovered afterwards.
    const cut = cuts.find((entry) => {
      if (usedCuts.has(Lineup.normalizeName(entry.card.name))) return false;
      const cutRoles = rolesOf(entry.card);
      return Object.entries(floors).every(([role, floor]) => {
        const after = (census[role] || 0) - (cutRoles.includes(role) ? 1 : 0) + (addRoles.includes(role) ? 1 : 0);
        return after >= floor;
      });
    });
    if (!cut) continue;
    usedCuts.add(Lineup.normalizeName(cut.card.name));
    rolesOf(cut.card).forEach((role) => { census[role] = (census[role] || 0) - 1; });
    addRoles.forEach((role) => { census[role] = (census[role] || 0) + 1; });
    swaps.push({
      out: cut.card.name,
      in: add.candidate.name,
      reason: `${add.candidate.name} covers ${(add.candidate.roles || []).filter((role) => gaps.some((gap) => gap.rolesToFix.includes(role))).join(", ") || "a measured gap"}; ${cut.card.name} was cast in ${(cut.stat.castRate * 100).toFixed(0)}% of the games it was drawn and sat dead in ${(cut.stat.deadRate * 100).toFixed(0)}%.`,
      priceDelta: Number((Number(add.candidate.price || 0) - Number(cut.card.price || 0)).toFixed(2)),
      addRoles: add.candidate.roles || [],
      cutStat: cut.stat
    });
  }
  return swaps;
}

function applySwaps(cards, swaps, pool) {
  const byName = new Map(pool.candidates.map((candidate) => [Lineup.normalizeName(candidate.name), candidate]));
  const next = cards.map((card) => ({...card}));
  const problems = [];
  swaps.forEach((swap) => {
    const outIndex = next.findIndex((card) => Lineup.normalizeName(card.name) === Lineup.normalizeName(swap.out));
    if (outIndex < 0) {
      problems.push(`${swap.out} is not in the current list.`);
      return;
    }
    const candidate = byName.get(Lineup.normalizeName(swap.in));
    if (!candidate) {
      problems.push(`${swap.in} is not in the candidate pool for this request.`);
      return;
    }
    const quantity = Math.max(1, Number(next[outIndex].quantity || 1));
    if (quantity > 1) {
      next[outIndex] = {...next[outIndex], quantity: quantity - 1};
      next.push({...candidate, quantity: 1, isCommander: false});
      return;
    }
    next.splice(outIndex, 1, {...candidate, quantity: 1, isCommander: false});
  });
  return {cards: next, problems};
}

function reportFor(state, metrics, perCardStats, gaps, extra = {}) {
  return {
    schemaVersion: 2,
    requestId: request.id,
    variantId: request.variantId,
    name: request.name,
    commander: request.commander,
    iteration: state.iteration,
    table: table.name,
    gamesPerIteration,
    metrics,
    gapAnalysis: gaps,
    perCardStats: [...perCardStats].sort((a, b) => contribution(a) - contribution(b)),
    ...extra
  };
}

// What a player actually needs: the difference between the list they have and
// the list that scored best, not the churn of every iteration in between.
function netChanges(baselineCards, finalCards, baselineStats) {
  const key = (card) => Lineup.normalizeName(card.name);
  const before = new Map(baselineCards.map((card) => [key(card), card]));
  const after = new Map(finalCards.map((card) => [key(card), card]));
  const stats = new Map((baselineStats || []).map((stat) => [Lineup.normalizeName(stat.name), stat]));
  const cuts = baselineCards.filter((card) => !after.has(key(card))).map((card) => ({card, roles: rolesOf(card), stat: stats.get(key(card))}));
  const adds = finalCards.filter((card) => !before.has(key(card))).map((card) => ({card, roles: rolesOf(card)}));
  const changes = [];
  const takenAdds = new Set();
  cuts.forEach((cut) => {
    const match = adds.find((add, index) => !takenAdds.has(index) && add.roles.some((role) => cut.roles.includes(role)) && takenAdds.add(index) !== false)
      || adds.find((add, index) => (takenAdds.has(index) ? false : takenAdds.add(index) !== false));
    changes.push({
      out: cut.card.name,
      outRoles: cut.roles,
      outStat: cut.stat || null,
      in: match?.card.name || null,
      inRoles: match?.roles || [],
      priceDelta: Number(((Number(match?.card.price || 0)) - Number(cut.card.price || 0)).toFixed(2))
    });
  });
  adds.forEach((add, index) => {
    if (takenAdds.has(index)) return;
    changes.push({out: null, outRoles: [], outStat: null, in: add.card.name, inRoles: add.roles, priceDelta: Number(Number(add.card.price || 0).toFixed(2))});
  });
  return changes;
}

function rolesOf(card) {
  const profile = Engine.classifyCard(card);
  const roles = [];
  if (profile.isLand) roles.push("land");
  if (profile.isRamp) roles.push("ramp");
  if (profile.isDraw) roles.push("draw");
  if (profile.isRemoval) roles.push("removal");
  if (profile.isWipe) roles.push("wipe");
  if (profile.isProtection) roles.push("protection");
  if (profile.isFinisher) roles.push("finisher");
  if (profile.isCreature) roles.push("threat");
  return roles;
}

async function finalize(state, reason, exitCode) {
  const best = state.best || state.baseline;
  const holdoutSeed = Number(config.seed) + 9973;
  const changed = best.iteration !== 0;
  let holdout = null;
  let holdoutBaseline = null;
  // Unseen seeds, both lists, same opponents. A gain that only exists on the
  // seeds the optimizer tuned against is overfitting, and saying so is the whole
  // point of running the holdout.
  const holdoutGames = Math.min(Number(config.holdoutGames || gamesPerIteration), config.maxTotalSimulations);
  if (capCheck(await readLedger(), config, request.id, holdoutGames).allowed) {
    const run = await runBatch(best.cards, holdoutSeed, "holdout", state, holdoutGames);
    if (!run.capped) holdout = run.result.metrics;
  }
  if (changed && capCheck(await readLedger(), config, request.id, holdoutGames).allowed) {
    const run = await runBatch(state.baseline.cards, holdoutSeed, "holdout baseline", state, holdoutGames);
    if (!run.capped) holdoutBaseline = run.result.metrics;
  }
  const holdoutDelta = holdout && holdoutBaseline ? Number((holdout.score - holdoutBaseline.score).toFixed(1)) : null;
  const winDelta = holdout && holdoutBaseline ? holdout.winRate - holdoutBaseline.winRate : null;
  const noise = holdout && holdoutBaseline
    ? Math.sqrt(Engine.winRateInterval(holdout).margin ** 2 + Engine.winRateInterval(holdoutBaseline).margin ** 2)
    : null;
  const verdict = !changed
    ? "no-change"
    : holdoutDelta === null
      ? "unverified"
      : holdoutDelta > 0 && winDelta > noise
        ? "confirmed"
        : holdoutDelta > 0
          ? "within-noise"
          : "not-confirmed";
  const swapsApplied = state.history.filter((entry) => entry.accepted).flatMap((entry) => entry.swaps.map((swap) => ({...swap, iteration: entry.iteration})));
  const targetTier = request.constraints.tier === 2 ? 2 : 3;
  const landConstraints = {landFloor: request.constraints.landFloor ?? config.landFloor, landCeiling: request.constraints.landCeiling ?? config.landCeiling, mustKeep: request.constraints.mustKeep};
  // Both tiers are checked regardless of which one this run targeted, so a
  // Tuned/Tier 2 result still shows whether the list happens to clear Tier 3
  // too, and vice versa — the target tier alone decides `finalCheck.ok`.
  const finalCheckTier2 = validateList(best.cards, {...landConstraints, tier: 2});
  const finalCheckTier3 = validateList(best.cards, {...landConstraints, tier: 3});
  const finalCheck = targetTier === 2 ? finalCheckTier2 : finalCheckTier3;
  const result = {
    schemaVersion: 2,
    id: request.id,
    variantId: request.variantId,
    deckId: request.deckId,
    name: request.name,
    commander: request.commander,
    stage: request.stage || "Tuned",
    tier: targetTier,
    table: table.name,
    finishedAt: new Date().toISOString(),
    stopReason: reason,
    exitCode,
    gamesPerIteration,
    iterations: state.iteration,
    totalGamesUsed: Number((await readLedger()).requests?.[request.id]?.games || 0),
    baselineMetrics: state.baseline?.metrics || null,
    finalMetrics: best.metrics,
    holdoutMetrics: holdout,
    holdoutBaselineMetrics: holdoutBaseline,
    holdoutScoreDelta: holdoutDelta,
    holdoutWinRateDelta: winDelta === null ? null : Number(winDelta.toFixed(4)),
    holdoutNoiseMargin: noise === null ? null : Number(noise.toFixed(4)),
    verdict,
    recommendation: verdict === "confirmed"
      ? "Make these changes: the improvement held up on games the optimizer never saw."
      : verdict === "within-noise"
        ? "Optional: the changes came out ahead on unseen games, but by less than the sampling noise. Treat them as a preference, not a fix."
        : verdict === "not-confirmed"
          ? "Keep the deck as it is. The changes scored better only on the seeds they were tuned against, and lost ground on unseen games."
          : verdict === "no-change"
            ? "Keep the deck as it is. Nothing in the candidate pool beat the current list."
            : "Unverified: the run stopped before an unseen-seed check could be made.",
    scoreDelta: Number(((best.metrics.score || 0) - (state.baseline?.metrics.score || 0)).toFixed(1)),
    swapsApplied,
    legalityFixes: state.legalityFixes || [],
    netChanges: netChanges(state.baseline?.cards || [], best.cards, state.baseline?.perCardStats),
    roleCensus: {before: roleCensus(state.baseline?.cards || []), after: roleCensus(best.cards)},
    rejectedSwaps: state.history.filter((entry) => !entry.accepted).flatMap((entry) => entry.swaps.map((swap) => ({...swap, iteration: entry.iteration, rejectedBecause: entry.note}))),
    compliance: {
      tier: targetTier,
      ok: finalCheck.ok,
      problems: finalCheck.problems,
      total: finalCheck.result.total,
      lands: finalCheck.result.types.Land || 0,
      gameChangers: finalCheck.result.selectedGameChangers.length,
      tier2Clean: finalCheckTier2.ok,
      tier2Problems: finalCheckTier2.problems,
      tier3Clean: finalCheckTier3.ok,
      tier3Problems: finalCheckTier3.problems
    },
    finalCards: best.cards.map((card) => ({name: card.name, quantity: Math.max(1, Number(card.quantity || 1)), isCommander: Boolean(card.isCommander), price: Number(card.price || 0), typeLine: card.typeLine})),
    perCardStats: best.perCardStats,
    gapsRemaining: best.gaps,
    simplifications: Engine.SIMPLIFICATIONS,
    history: state.history
  };
  const out = path.join(RESULTS_DIR, `${request.id}.json`);
  await writeJson(out, result);
  await writeStatus({
    state: exitCode === EXIT.CAP_REACHED ? "cap-reached" : "done",
    message: reason,
    requestId: request.id,
    variantId: request.variantId,
    iteration: state.iteration,
    maxIterations,
    totalGamesUsed: result.totalGamesUsed,
    maxTotalSimulations: config.maxTotalSimulations,
    bestIteration: best.iteration,
    bestScore: best.metrics.score,
    currentMetrics: best.metrics,
    history: state.history,
    resultPath: relative(out)
  });
  log(`\n${reason}`);
  log(`  baseline score ${(state.baseline?.metrics.score ?? 0).toFixed(1)} → best ${best.metrics.score.toFixed(1)} (iteration ${best.iteration})`);
  if (holdout && holdoutBaseline) {
    log(`  unseen seeds   ${holdoutBaseline.score.toFixed(1)} → ${holdout.score.toFixed(1)} (${(holdoutBaseline.winRate * 100).toFixed(1)}% → ${(holdout.winRate * 100).toFixed(1)}% win rate over ${holdout.games} games each)`);
    log(`  verdict        ${verdict} · ${result.recommendation}`);
  } else if (holdout) {
    log(`  unseen seeds   ${holdout.score.toFixed(1)} (${(holdout.winRate * 100).toFixed(1)}% win rate over ${holdout.games} games)`);
  }
  log(`  swaps applied  ${swapsApplied.length} (${result.netChanges.length} net changes from the list you have today)`);
  log(`  result         ${relative(out)}`);
  return {result, out};
}

async function measure(cards, state, label, seed) {
  const run = await runBatch(cards, seed ?? Number(config.seed), label, state);
  if (run.capped) return null;
  const metrics = run.result.metrics;
  const gaps = Engine.analyzeGaps(metrics, {
    targets: config.targets,
    commanderCmc: run.result.commanderCmc,
    tableWinTurn: table.winTurn
  });
  return {metrics, gaps, perCardStats: run.result.perCardStats, gamesUsed: run.gamesUsed};
}

const state = await loadState();

if (args.init || (!args.apply && !args.auto && !args.finalize)) {
  const initPool = await loadPool();
  const targetTier = request.constraints.tier === 2 ? 2 : 3;
  if (!state.baseline) {
    const legalized = legalizeForTier(state.cards, initPool, targetTier);
    if (legalized.fixes.length) {
      state.cards = legalized.cards;
      state.legalityFixes = legalized.fixes;
      log(`mandatory legality fixes (Tier ${targetTier}): the shopping-guide list is not legal at this tier as published`);
      legalized.fixes.forEach((fix) => log(`  cut ${fix.out} for ${fix.in} — ${fix.reason}`));
      const stillIllegal = evaluateList(state.cards)[`tier${targetTier}`];
      if (stillIllegal.length) log(`  could not fully legalize: ${stillIllegal.map((issue) => `${issue.card}: ${issue.rule}`).join("; ")}`);
    }
    // A wrong card count is not something the legality pass touches — it only
    // swaps named violations one-for-one, which preserves total count by
    // construction — so it is never fixable here. Simulating a 90-card or
    // 110-card "deck" would silently produce metrics for something that is not
    // a legal Commander deck at all, which is worse than refusing to start.
    const startingTotal = evaluateList(state.cards).total;
    if (startingTotal !== 100) {
      console.error(`This request's starting list has ${startingTotal} cards, not 100. That is not something a card swap can fix — check how the request was built.`);
      process.exit(EXIT.ERROR);
    }
  }
  const measured = await measure(state.cards, state, "baseline");
  if (!measured) {
    console.error("The simulation cap was reached before a baseline could be measured.");
    process.exit(EXIT.CAP_REACHED);
  }
  state.baseline = {iteration: 0, cards: state.cards, metrics: measured.metrics, gaps: measured.gaps, perCardStats: measured.perCardStats};
  state.best = state.baseline;
  state.iteration = 0;
  state.history = [{iteration: 0, accepted: true, score: measured.metrics.score, swaps: [], note: "baseline", legalityFixes: state.legalityFixes || []}];
  await saveState(state);
  const report = reportFor(state, measured.metrics, measured.perCardStats, measured.gaps, {
    candidateSwaps: initPool.candidates.length
      ? proposeSwaps(state.cards, measured.perCardStats, measured.gaps, initPool, state.tried, config.maxSwapsPerIteration * 3)
      : [],
    legalityFixes: state.legalityFixes || []
  });
  await writeJson(path.join(RESULTS_DIR, `${request.id}.iter0.json`), report);
  log(`baseline for ${request.variantId} · ${request.name}`);
  log(`  score          ${measured.metrics.score.toFixed(1)}`);
  log(`  win rate       ${(measured.metrics.winRate * 100).toFixed(1)}% ±${(Engine.winRateInterval(measured.metrics).margin * 100).toFixed(1)} over ${measured.metrics.games} games`);
  log(`  avg win turn   ${measured.metrics.avgWinTurn ? measured.metrics.avgWinTurn.toFixed(1) : "no wins"}`);
  log(`  commander      turn ${measured.metrics.avgCommanderTurn.toFixed(1)} in ${(measured.metrics.commanderCastRate * 100).toFixed(0)}% of games`);
  log(`  screw / flood  ${(measured.metrics.screwPct * 100).toFixed(1)}% / ${(measured.metrics.floodPct * 100).toFixed(1)}%`);
  log(`  interaction    ${(measured.metrics.interactionAvailability * 100).toFixed(0)}% of turns 3-7`);
  measured.gaps.forEach((gap) => log(`  gap · ${gap.key.padEnd(16)} ${gap.observed}`));
  if (!args.auto) process.exit(EXIT.CONTINUE);
}

if (args.apply) {
  const pool = await loadPool();
  const proposal = await readJson(path.resolve(ROOT, String(args.apply)));
  const swaps = (proposal.swaps || []).slice(0, config.maxSwapsPerIteration);
  if (!swaps.length) {
    console.error("No swaps were proposed.");
    process.exit(EXIT.INVALID_SWAPS);
  }
  const applied = applySwaps(state.best.cards, swaps, pool);
  const check = validateList(applied.cards, {landFloor: request.constraints.landFloor ?? config.landFloor, landCeiling: request.constraints.landCeiling ?? config.landCeiling, mustKeep: request.constraints.mustKeep, roleFloors: effectiveFloors(roleCensus(state.best.cards)), themeFloor: request.constraints.themeFloor, themeTerms: request.constraints.themeTerms, tier: request.constraints.tier === 2 ? 2 : 3});
  if (applied.problems.length || !check.ok) {
    console.error("The proposed swaps were rejected:");
    [...applied.problems, ...check.problems].forEach((problem) => console.error(`  - ${problem}`));
    process.exit(EXIT.INVALID_SWAPS);
  }
  state.iteration += 1;
  const measured = await measure(applied.cards, state, `iteration ${state.iteration}`);
  if (!measured) process.exit(EXIT.CAP_REACHED);
  const improved = measured.metrics.score > (state.best?.metrics.score || 0);
  state.history.push({iteration: state.iteration, accepted: improved, score: measured.metrics.score, swaps, note: improved ? "accepted" : "score did not improve"});
  swaps.forEach((swap) => state.tried.push(Lineup.normalizeName(swap.in)));
  if (improved) state.best = {iteration: state.iteration, cards: applied.cards, metrics: measured.metrics, gaps: measured.gaps, perCardStats: measured.perCardStats};
  await saveState(state);
  await writeJson(path.join(RESULTS_DIR, `${request.id}.iter${state.iteration}.json`), reportFor(state, measured.metrics, measured.perCardStats, measured.gaps, {
    swapsThisIteration: swaps,
    accepted: improved,
    bestScore: state.best.metrics.score,
    candidateSwaps: proposeSwaps(state.best.cards, state.best.perCardStats, state.best.gaps, pool, state.tried, config.maxSwapsPerIteration * 3, state.best.metrics.winRate)
  }));
  log(`iteration ${state.iteration}: score ${measured.metrics.score.toFixed(1)} (${improved ? "accepted" : "rolled back"}), best ${state.best.metrics.score.toFixed(1)}`);
  if (state.iteration >= maxIterations) {
    await finalize(state, `Stopped at the ${maxIterations}-iteration limit.`, EXIT.MAX_ITERATIONS);
    process.exit(EXIT.MAX_ITERATIONS);
  }
  process.exit(EXIT.CONTINUE);
}

if (args.auto) {
  const pool = await loadPool();
  let stalled = 0;
  let batchSize = config.maxSwapsPerIteration;
  for (;;) {
    if (state.iteration >= maxIterations) {
      await finalize(state, `Stopped at the ${maxIterations}-iteration limit, keeping the best list.`, EXIT.MAX_ITERATIONS);
      process.exit(EXIT.MAX_ITERATIONS);
    }
    if (Date.now() - startedAt > maxWallClockMs) {
      await finalize(state, `Stopped at the ${Math.round(maxWallClockMs / 1000)}-second wall-clock budget, keeping the best list.`, EXIT.TIME_LIMIT);
      process.exit(EXIT.TIME_LIMIT);
    }
    const ledger = await readLedger();
    if (!capCheck(ledger, config, request.id, gamesPerIteration).allowed) {
      await finalize(state, `Stopped at the ${config.maxTotalSimulations}-game cap for this request, keeping the best list.`, EXIT.CAP_REACHED);
      process.exit(EXIT.CAP_REACHED);
    }
    const swaps = proposeSwaps(state.best.cards, state.best.perCardStats, state.best.gaps, pool, state.tried, batchSize, state.best.metrics.winRate);
    if (!swaps.length) {
      await finalize(state, "Stopped because the candidate pool had nothing left that addresses a measured gap.", EXIT.CONVERGED);
      process.exit(EXIT.CONVERGED);
    }
    const applied = applySwaps(state.best.cards, swaps, pool);
    const check = validateList(applied.cards, {landFloor: request.constraints.landFloor ?? config.landFloor, landCeiling: request.constraints.landCeiling ?? config.landCeiling, mustKeep: request.constraints.mustKeep, roleFloors: effectiveFloors(roleCensus(state.best.cards)), themeFloor: request.constraints.themeFloor, themeTerms: request.constraints.themeTerms, tier: request.constraints.tier === 2 ? 2 : 3});
    swaps.forEach((swap) => state.tried.push(Lineup.normalizeName(swap.in)));
    if (applied.problems.length || !check.ok) {
      const note = [...applied.problems, ...check.problems].join(" ");
      state.history.push({iteration: state.iteration + 1, accepted: false, score: 0, swaps, note});
      state.iteration += 1;
      batchSize = Math.max(1, Math.floor(batchSize / 2));
      log(`  iteration ${String(state.iteration).padStart(2)} · rejected before simulating · ${note}`);
      await saveState(state);
      continue;
    }
    state.iteration += 1;
    const measured = await measure(applied.cards, state, `iteration ${state.iteration}`);
    if (!measured) {
      await finalize(state, `Stopped at the ${config.maxTotalSimulations}-game cap for this request, keeping the best list.`, EXIT.CAP_REACHED);
      process.exit(EXIT.CAP_REACHED);
    }
    const gain = measured.metrics.score - state.best.metrics.score;
    // A gain smaller than the sampling noise is not a gain.
    const improved = gain >= (config.minAcceptGain ?? 0);
    state.history.push({
      iteration: state.iteration,
      accepted: improved,
      score: measured.metrics.score,
      gain: Number(gain.toFixed(2)),
      swaps,
      note: improved ? "accepted" : "score did not improve, rolled back"
    });
    if (improved) state.best = {iteration: state.iteration, cards: applied.cards, metrics: measured.metrics, gaps: measured.gaps, perCardStats: measured.perCardStats};
    // A rejected batch of five hides which of the five was wrong, so the next
    // attempt tries fewer changes at once.
    batchSize = improved ? config.maxSwapsPerIteration : Math.max(1, Math.floor(batchSize / 2));
    stalled = gain < config.convergence.minScoreGain ? stalled + 1 : 0;
    await saveState(state);
    await writeJson(path.join(RESULTS_DIR, `${request.id}.iter${state.iteration}.json`), reportFor(state, measured.metrics, measured.perCardStats, measured.gaps, {
      swapsThisIteration: swaps,
      accepted: improved,
      gain: Number(gain.toFixed(2)),
      bestScore: state.best.metrics.score
    }));
    log(`  iteration ${String(state.iteration).padStart(2)} · score ${measured.metrics.score.toFixed(1)} (${gain >= 0 ? "+" : ""}${gain.toFixed(1)}) · ${improved ? "kept" : "rolled back"} · ${swaps.map((swap) => `${swap.in} for ${swap.out}`).join("; ")}`);
    if (stalled >= config.convergence.patience) {
      await finalize(state, `Converged: ${config.convergence.patience} iterations in a row gained less than ${config.convergence.minScoreGain} points.`, EXIT.CONVERGED);
      process.exit(EXIT.CONVERGED);
    }
  }
}

if (args.finalize) {
  await finalize(state, "Finalised on request.", EXIT.CONVERGED);
  process.exit(EXIT.CONVERGED);
}
