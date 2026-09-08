// The join between CrankMagic and the simulator.
//
// WHAT THIS SUITE IS FOR. The app half of a measurement cannot be tested in a browser
// cheaply, but almost none of what can go wrong is browser-shaped. What goes wrong is:
// the wrong hundred gets measured, a number gets filed under a protocol it was not
// measured on, or a score gets printed for a deck the engine could not read. All three
// are pure functions, and all three are tested here.
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";
import {readFileSync} from "node:fs";

const require = createRequire(import.meta.url);
const Sim = require("../crankmagic-sim.js");
const Evidence = require("../collection-evidence.js");
const Measure = require("../deck-measure.js");

const load = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), "utf8"));

let checks = 0;
const check = (label, fn) => { fn(); checks += 1; void label; };

/* ------------------------------------------------ the generation is not a guess */

const summary = await load("../data/simulation-summary.json");
const ratings = await load("../data/deck-ratings.json");

/* PINNED TO CRANKMAGIC'S OWN RATINGS, not to the legacy viewer's summary. This used to
   compare against data/simulation-summary.json, which describes the 200 rungs the OTHER
   app publishes -- a different set of measurements on its own schedule. The two agreed
   until v2.7, when CrankMagic's six decks were re-measured and the viewer's rungs were
   not: re-badging 200 numbers nobody re-ran would have been the exact dishonesty the
   check exists to prevent, so the check now names the file it is actually about. */
check("the generation these reports claim is the generation that measured them", () => {
  assert.equal(Sim.ENGINE_GENERATION, ratings.generation,
    "crankmagic-sim.js names " + Sim.ENGINE_GENERATION + " but data/deck-ratings.json " +
    "was measured on " + ratings.generation + " — a report would be filed under the wrong engine");
});

check("the legacy viewer's rungs say which generation measured them, whatever it is", () => {
  assert.ok(summary.engine, "the summary must name its own engine generation");
  assert.ok(summary.engineNotes?.[summary.engine], "and must document it");
});

check("every engine script the worker loads exists and carries a version", () => {
  Sim.ENGINE_SCRIPTS.forEach((src) => {
    assert.match(src, /^[a-z-]+\.js\?v=\d+$/, src + " needs a ?v= or a cached browser serves the worker a different engine than the page");
  });
});

/* ------------------------------------------------------------------- the lineup */

function deckState() {
  const cards = {
    "card:cmdr": {id: "card:cmdr", name: "Test Commander", typeLine: "Legendary Creature — Human", oracleText: "Whenever you attack, draw a card.", manaCost: "{2}{G}", power: "3", toughness: "3", colorIdentity: ["G"], keywords: []},
    "card:beast": {id: "card:beast", name: "Test Beast", typeLine: "Creature — Beast", oracleText: "Trample.", manaCost: "{4}{G}", power: "5", toughness: "5", colorIdentity: ["G"], keywords: ["Trample"]},
    "card:forest": {id: "card:forest", name: "Forest", typeLine: "Basic Land — Forest", oracleText: "", manaCost: "", colorIdentity: ["G"], keywords: []},
    "card:blank": {id: "card:blank", name: "Unresolved Card", typeLine: "", oracleText: "", manaCost: "", colorIdentity: [], keywords: []}
  };
  const deck = {
    id: "deck:1", name: "Test deck", status: "final", archived: false, locked: false,
    commanders: ["card:cmdr"], versions: [],
    slots: [
      {id: "s1", cardId: "card:cmdr", quantity: 1, purpose: "main", committed: true},
      {id: "s2", cardId: "card:beast", quantity: 1, purpose: "main", committed: true},
      {id: "s3", cardId: "card:forest", quantity: 97, purpose: "main", committed: true},
      {id: "s4", cardId: "card:blank", quantity: 1, purpose: "main", committed: true},
      // An option the reader has not taken. It must not be measured.
      {id: "s5", cardId: "card:beast", quantity: 1, purpose: "upgrade", committed: false, replaces: "s2"}
    ]
  };
  return {state: {cards, decks: [deck]}, deck};
}

check("only the main hundred is measured, never the options beside it", () => {
  const {state, deck} = deckState();
  const lineup = Sim.lineupFor(state, deck);
  assert.equal(lineup.length, 4, "the upgrade slot must not appear in the lineup");
  assert.equal(lineup.reduce((n, r) => n + r.quantity, 0), 100);
});

check("the commander is flagged, and only the commander", () => {
  const {state, deck} = deckState();
  const lineup = Sim.lineupFor(state, deck);
  assert.deepEqual(lineup.filter((r) => r.isCommander).map((r) => r.name), ["Test Commander"]);
});

check("an unresolved card identity stops the measurement rather than being measured", () => {
  const {state, deck} = deckState();
  deck.slots.push({id: "s6", cardId: "card:missing", quantity: 1, purpose: "main", committed: true});
  assert.throws(() => Sim.lineupFor(state, deck), /Resolve every card identity/);
});

/* ----------------------------------------------------------------- what it reads */

check("a card with no printed text counts as unreadable, not as a weak card", () => {
  const {state, deck} = deckState();
  const cover = Sim.coverage(Sim.lineupFor(state, deck));
  assert.equal(cover.total, 100);
  assert.equal(cover.known, 99);
  assert.deepEqual(cover.unreadable, ["Unresolved Card"]);
});

check("a basic land is readable without oracle text; a spell is not", () => {
  const cover = Sim.coverage([
    {name: "Forest", quantity: 1, card: {typeLine: "Basic Land — Forest", oracleText: ""}},
    {name: "Mystery", quantity: 1, card: {typeLine: "Sorcery", oracleText: ""}}
  ]);
  assert.deepEqual(cover.unreadable, ["Mystery"]);
});

check("a published run refuses a deck the engine mostly cannot read", () => {
  const blind = Sim.coverage([{name: "A", quantity: 100, card: {typeLine: "", oracleText: ""}}]);
  assert.throws(() => Sim.assertMeasurable(blind, "published"), /The engine can read 0 of 100/);
});

check("99 of 100 readable is publishable; 80 of 100 is not", () => {
  const {state, deck} = deckState();
  assert.doesNotThrow(() => Sim.assertMeasurable(Sim.coverage(Sim.lineupFor(state, deck)), "published"));
  const thin = {total: 100, known: 80, ratio: 0.8, unreadable: ["x"]};
  assert.throws(() => Sim.assertMeasurable(thin, "published"));
});

/* --------------------------------------------------------------- the report pack */

const fakeResult = {
  score: 62.5, se: 0.41, winRate: 0.331, incompleteRate: 0.007, avgWinTurn: 10.8,
  commanderCastRate: 0.92, avgCommanderTurn: 4.2, screwPct: 0.08, floodPct: 0.05,
  deadCardsAtT8: 3.1, funScore: 0.55, hash: "abcdef0123456789", games: 120000,
  elapsedMs: 5200, gamesPerSecond: 23076, measuredAt: "2026-09-08T00:00:00.000Z",
  scoreParts: [], perCard: [], perSeedScores: [62.1, 62.9]
};

function pack(overrides) {
  return Sim.packFor(fakeResult, {
    protocol: "published", table: "default", seatCount: 3, firstSeed: 20260904,
    cardsVersion: "v2", coverage: {total: 100, known: 100, ratio: 1, unreadable: []},
    ...overrides
  });
}

check("the report satisfies the contract the model and the evidence module enforce", () => {
  const report = pack();
  assert.doesNotThrow(() => Evidence.validate(report));
  assert.equal(report.kind, "report");
  assert.equal(report.deckFingerprint, fakeResult.hash);
  assert.ok(report.protocol.includes(Sim.ENGINE_GENERATION));
});

check("turn-capped games are reported beside the win rate, not inside it", () => {
  const report = pack();
  assert.equal(report.metrics.winRate.value, 33.1);
  assert.equal(report.metrics.incompleteGames.value, 0.7);
});

check("a measured report is marked measured, so it cannot be read as an import", () => {
  assert.equal(pack().origin, "measured");
});

check("a win the engine cannot watch reaches the reader, in the metrics and in the limits", () => {
  /* v2.7 started counting cards that say "you win the game" and showed the count to
     nobody. A deck built on Thassa's Oracle is not a weak deck; it is a deck this
     measurement does not describe, and a score printed without that sentence beside it
     is the score of a different deck. */
  const clean = pack();
  assert.equal(clean.metrics.winPathsTheEngineCannotWatch.value, 0);
  assert.equal(clean.limits.length, 4, "a list with no unwatched win keeps the four standing limits");

  const combo = Sim.packFor({...fakeResult, unwatchedWinPaths: 2, unwatchedWinCards: ["Thassa's Oracle", "Approach of the Second Sun"]}, {
    protocol: "published", table: "default", seatCount: 3, firstSeed: 20260904,
    cardsVersion: "v2", coverage: {total: 100, known: 100, ratio: 1, unreadable: []}
  });
  assert.equal(combo.metrics.winPathsTheEngineCannotWatch.value, 2);
  assert.deepEqual(combo.unwatchedWinCards, ["Thassa's Oracle", "Approach of the Second Sun"]);
  assert.equal(combo.limits.length, 5, "the extra limit is added, not swapped in");
  assert.match(combo.limits[4], /you win the game/);
  assert.match(combo.limits[4], /Thassa's Oracle/, "naming the card is what makes the warning actionable");
  assert.doesNotThrow(() => Evidence.validate(combo));
});

check("the three figures the report was dropping now reach it", () => {
  /* All three existed in the engine and were thrown away at the line that built the
     report: how much of a difference is seed noise, whether "turn 12.5 on average" is one
     hump or two, and which cards the number does not describe. */
  const report = Sim.packFor({...fakeResult, endTurnCounts: [{turn: 9, games: 4}, {turn: 12, games: 10}, {turn: 15, games: 2}]}, {
    protocol: "published", table: "default", seatCount: 3, firstSeed: 20260904, cardsVersion: "v2",
    coverage: {total: 100, known: 98, ratio: 0.98, unreadable: ["Mystery Booster Test Card", "Un-card"]}
  });
  assert.deepEqual(report.perSeedScores, [62.1, 62.9], "per-seed scores travel with the report");
  assert.equal(report.endTurnCounts.length, 3);
  assert.deepEqual(report.endTurnCounts.map((r) => r.turn), [9, 12, 15], "the histogram keeps the turn each count belongs to");
  assert.deepEqual(report.coverage.unreadable, ["Mystery Booster Test Card", "Un-card"]);
  // A run with no histogram still packs an array, so the renderer never reads undefined.
  assert.deepEqual(Sim.packFor(fakeResult, {protocol: "preview", coverage: {}}).endTurnCounts, []);
});

check("the histogram is the same games the average is taken over", () => {
  /* A distribution that does not add up to the run is worse than none: it invites the
     reader to compare a shape against a mean that describes a different set of games. */
  const engine = require("../sim-engine.js");
  const lineup = [{name: "Krenko, Mob Boss", quantity: 1, isCommander: true, typeLine: "Legendary Creature — Goblin Warrior", manaCost: "{2}{R}{R}", oracleText: "{T}: Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control."}]
    .concat([{name: "Mountain", quantity: 99, typeLine: "Basic Land — Mountain", oracleText: ""}]);
  const config = JSON.parse(readFileSync(new URL("../sim/config.json", import.meta.url), "utf8"));
  const opponents = JSON.parse(readFileSync(new URL("../sim/opponents.json", import.meta.url), "utf8"));
  const mix = opponents.tables["mixed-pod"], weight = mix.reduce((sum, e) => sum + e.weight, 0);
  const seats = mix.map((e) => ({...opponents.profiles[e.profile], weight: e.weight / weight}));
  const {metrics: result} = engine.simulateGames(lineup, seats, {...config, games: 200, maxTurns: 16}, 7);
  const counted = (result.endTurnCounts || []).reduce((n, row) => n + row.games, 0);
  assert.equal(counted, result.games, `the histogram holds ${counted} games and the run played ${result.games}`);
  assert.ok((result.endTurnCounts || []).every((row) => row.games > 0), "empty turns are trimmed, not padded with zeroes");
  const mean = result.endTurnCounts.reduce((sum, row) => sum + row.turn * row.games, 0) / counted;
  assert.ok(Math.abs(mean - result.avgEndTurn) < 0.01,
    `the histogram's own mean is ${mean.toFixed(3)} and the reported average end turn is ${result.avgEndTurn.toFixed(3)}`);
});

check("the engine counts and names the win paths it cannot watch", () => {
  const engine = require("../sim-engine.js");
  assert.equal(engine.classifyCard({name: "Thassa's Oracle", typeLine: "Creature — Merfolk Wizard", manaCost: "{U}{U}",
    oracleText: "When Thassa's Oracle enters the battlefield, look at the top X cards of your library... If X is greater than or equal to the number of cards in your library, you win the game."}).altWin, true);
  assert.equal(engine.classifyCard({name: "Sol Ring", typeLine: "Artifact", manaCost: "{1}", oracleText: "{T}: Add {C}{C}."}).altWin, false);
});

check("what the model cannot do travels with the number, not just on screen", () => {
  const report = pack();
  assert.ok(report.limits.length >= 4);
  assert.ok(report.limits.some((line) => /sampled archetype profiles/.test(line)),
    "the report must say the opponents are profiles, not decks");
});

/* ------------------------------- the point of naming a protocol: refusing to diff */

check("two runs on the same protocol, versions and conditions subtract", () => {
  const a = pack();
  const b = pack();
  const diff = Evidence.compare(a, b);
  assert.equal(diff.compatible, true, diff.reasons.join("; "));
  assert.equal(diff.rows.find((r) => r.key === "score").delta, 0);
});

check("a preview will not be subtracted from a published run", () => {
  const diff = Evidence.compare(pack(), pack({protocol: "preview"}));
  assert.equal(diff.compatible, false);
  assert.ok(diff.reasons.includes("Different protocols"));
  assert.equal(diff.rows.find((r) => r.key === "score").delta, null);
});

check("a different engine generation will not be subtracted either", () => {
  const older = pack();
  older.versions = {...older.versions, engine: "v2.5"};
  const diff = Evidence.compare(pack(), older);
  assert.equal(diff.compatible, false);
  assert.ok(diff.reasons.some((r) => /versions/.test(r)));
});

check("a different opponent table is a different condition, so no delta", () => {
  const diff = Evidence.compare(pack(), pack({table: "cutthroat"}));
  assert.equal(diff.compatible, false);
  assert.ok(diff.reasons.some((r) => /declared opponents/.test(r)));
});

/* ---------------------------------------------------------- protocols themselves */

check("the published protocol is the protocol the published numbers were made on", () => {
  const plan = Sim.protocolFor("published");
  assert.equal(plan.seedCount, 6);
  assert.equal(plan.games, 20000);
});

check("an unknown protocol is refused by name", () => {
  assert.throws(() => Sim.protocolFor("whatever"), /Unknown protocol/);
});

/* -------------------------------------------- the runner without a browser Worker */

check("a browser with no Worker says so instead of freezing the page", () => {
  const runner = Sim.createRunner({Worker: null});
  assert.throws(() => runner.measure({lineup: [], config: {}, seats: []}),
    /cannot run background workers/);
});

check("the runner drives a worker, reports progress and resolves the result", async () => {
  // A stand-in for the browser's Worker: it replays the messages sim-worker.js sends.
  const posted = [];
  class FakeWorker {
    constructor(url) { this.url = url; }
    postMessage(message) {
      posted.push(message);
      queueMicrotask(() => {
        this.onmessage({data: {id: message.id, type: "progress", done: 1, total: 6, mean: 61.2}});
        this.onmessage({data: {id: message.id, type: "done", result: fakeResult}});
      });
    }
    terminate() { this.terminated = true; }
  }
  const runner = Sim.createRunner({Worker: FakeWorker});
  const seen = [];
  const result = await runner.measure({
    lineup: [{name: "Forest", quantity: 100}], config: {}, seats: [],
    protocol: "published", onProgress: (m) => seen.push(m.done)
  });
  assert.equal(result.score, 62.5);
  assert.deepEqual(seen, [1]);
  assert.equal(posted[0].seedCount, 6, "the runner must send the protocol's seed count, not a caller's");
  assert.equal(posted[0].games, 20000);
  assert.deepEqual(posted[0].scripts, Sim.ENGINE_SCRIPTS);
});

check("cancelling rejects the run rather than leaving it pending forever", async () => {
  class SilentWorker {
    postMessage() { /* never answers */ }
    terminate() { this.terminated = true; }
  }
  const runner = Sim.createRunner({Worker: SilentWorker});
  const pending = runner.measure({lineup: [], config: {}, seats: []});
  runner.cancel();
  await assert.rejects(pending, /cancelled/);
  assert.equal(runner.busy, false, "a cancelled runner must be ready for the next run");
});

/* ------------------------------------- and the whole path, against the real engine */

const facts = (await load("../data/card-facts.json")).cards;
const config = await load("../sim/config.json");
const opponents = await load("../sim/opponents.json");

check("the pack shape survives a real engine run end to end", () => {
  // A trivial but legal hundred: enough to make the engine produce every field the pack
  // reads, without depending on any deck that may be archived out of the app later.
  const lineup = [
    {name: "Llanowar Elves", quantity: 1, isCommander: false, card: facts["Llanowar Elves"] || {typeLine: "Creature — Elf Druid", oracleText: "{T}: Add {G}.", manaCost: "{G}", power: "1", toughness: "1", colorIdentity: ["G"]}},
    {name: "Forest", quantity: 99, isCommander: false, card: {typeLine: "Basic Land — Forest", oracleText: "", manaCost: "", colorIdentity: ["G"]}}
  ];
  const cards = Measure.hydrate(lineup, null);
  const seats = Measure.buildSeats(opponents, config.table);
  const result = Measure.measure(cards, {config, seats, seedCount: 1, games: 400});

  assert.equal(typeof result.incompleteRate, "number",
    "the engine must report turn-capped games, or the pack files a null");

  const report = Sim.packFor(result, {
    protocol: "preview", table: config.table, seatCount: seats.length,
    coverage: Sim.coverage(lineup)
  });
  assert.doesNotThrow(() => Evidence.validate(report));
  assert.equal(report.deckFingerprint, result.hash);
  assert.equal(report.metrics.incompleteGames.value, Number((result.incompleteRate * 100).toFixed(2)));
});

console.log(`crankmagic-sim: ${checks} checks passed · engine ${Sim.ENGINE_GENERATION} · protocols ${Object.keys(Sim.PROTOCOLS).join(", ")}`);
