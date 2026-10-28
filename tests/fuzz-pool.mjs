/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from "node:assert/strict";
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {decksFromPool, decksFromLibrary, verdict, favorNames, seedsFrom, playGame, strictFuzzEvidence, finalPoolFrom, houseFuzzLevel} from "../tools/fuzz-live.mjs";
import {createExerciseLedger, addExerciseEvidence, exerciseSummary} from "../game/tools/ability-evidence.mjs";
import {memoryStorage, createMatchStore} from "../game/engine/storage.mjs";
import {tableCards} from "../cloud/game-room.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const throws = (f, pattern, m) => {assert.throws(f, pattern, m); checks += 1;};
const basic = new Set(["Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes"]);

/* Small independent population: a printed commander permission matters, not a legendary-creature regex. A definition
   that throws must fail the population, not disappear; a favored card must have an eligible commander. */
const made = {
  Leader: {type: "Legendary Creature — Human", ci: ["W", "U", "B", "R", "G"], definition: {types: ["Creature"], supertypes: ["Legendary"]}},
  Walker: {type: "Legendary Planeswalker — Tester", ci: ["W", "U", "B", "R", "G"], definition: {types: ["Planeswalker"], canBeCommander: true}},
  Red: {type: "Legendary Creature — Goblin", ci: ["R"], definition: {types: ["Creature"], supertypes: ["Legendary"]}},
  Colorless: {type: "Legendary Artifact Creature — Golem", ci: [], definition: {types: ["Creature", "Artifact"], supertypes: ["Legendary"]}},
  FalseLeader: {type: "Legendary Planeswalker — Tester", ci: [], definition: {types: ["Planeswalker"], supertypes: ["Legendary"]}},
  Favored: {type: "Instant", ci: ["W"], definition: {types: ["Instant"]}},
  Bolt: {type: "Instant", ci: ["R"], definition: {types: ["Instant"]}},
  Rock: {type: "Artifact", ci: [], definition: {types: ["Artifact"]}},
  Land: {type: "Land", ci: [], definition: {types: ["Land"]}},
};
const given = {library: Object.keys(made), oracle: (n) => made[n], cards: (n) => made[n]?.definition};
const decks = decksFromPool(3, {...given, favor: ["Favored"]});
eq(decks.map((d) => d.name).sort(), ["Colorless", "Leader", "Red", "Walker"], "printed permission admits the walker, but not an ordinary legendary planeswalker");
eq(decksFromPool(3, {...given, favor: ["Favored"]}), decks, "a seed reproduces every card and its order");
ok(JSON.stringify(decksFromPool(4, given)) !== JSON.stringify(decksFromPool(5, given)), "another seed changes the deal");
for (const deck of decks) {
  eq(deck.cards.length, 99, `${deck.name}: 99 cards beside its commander`);
  const others = deck.cards.filter((n) => !basic.has(n));
  eq(others.length, new Set(others).size, `${deck.name}: singleton except basics`);
  ok(!deck.cards.includes(deck.commander[0]), `${deck.name}: commander outside the 99`);
  ok(others.every((n) => made[n].ci.every((c) => made[deck.name].ci.includes(c))), `${deck.name}: printed color identity`);
}
ok(decks.filter((d) => ["Leader", "Walker"].includes(d.name)).every((d) => d.cards.includes("Favored")), "compatible decks prioritize the favored card");
throws(() => decksFromPool(1, {...given, favor: ["Missing"]}), /not a playable card/, "a misspelled favorite is not silently dropped");
throws(() => decksFromPool(1, {...given, cards: (n) => n === "Bolt" ? null : given.cards(n)}), /Bolt is missing from the table/, "a stale generated directory cannot silently shrink the final pool");
throws(() => decksFromPool(1, {...given, oracle: (n) => n === "Bolt" ? null : given.oracle(n)}), /Bolt has no oracle record/, "a missing oracle record cannot silently shrink the final pool");
throws(() => decksFromPool(1, {...given, library: ["Red", "Colorless", "Favored"], favor: ["Favored"], count: 2}), /No final commander can include/, "a favorite without a compatible commander fails explicitly");
throws(() => decksFromPool(1, {...given, library: ["Leader"]}), /distinct legal commanders/, "an undersized pool fails");
throws(() => decksFromLibrary(1, {...given, cards: (n) => {if (n === "Bolt") throw new Error("broken Bolt"); return given.cards(n);}}), /broken Bolt/, "a throwing final definition cannot vanish from the sample");
eq(favorNames('Favored\nBolt\nFavored\n'), ["Favored", "Bolt"], "name-per-line favors");
eq(favorNames('{"cards":[{"name":"Favored"}]}'), ["Favored"], "lane-file favors");
throws(() => favorNames('[null]'), /needs a card name/, "invalid favored entries fail");
eq(seedsFrom("1-3,2,5"), [1, 2, 3, 5], "duplicate seeds are not claimed as different games");
throws(() => seedsFrom("4-1"), /ascending ranges/, "an empty seed range cannot pass zero games");
for (const input of ["", " ", "NaN", "Infinity", "1.5", "1-2-3", "1,", "-1", "9007199254740992"])
  throws(() => seedsFrom(input), /nonnegative safe integers/, `invalid seed specification ${JSON.stringify(input)} cannot certify an empty or truncated run`);
eq(seedsFrom("0, 2-3"), [0, 2, 3], "valid finite integer seeds include zero and trimmed ranges");
const clean = {status: "finished", refusals: {since: 0, total: 0}, personRefused: [{reason: "refused"}]};
ok(verdict(clean).clean, "legacy interactive evidence keeps the existing refusal policy");
ok(!verdict({...clean, strictRefusals: true}).clean, "strict evidence includes a person's refused-and-retried answers");
eq(strictFuzzEvidence(["--pool"]), true, "pool CLI evidence always counts human refusals");
eq(strictFuzzEvidence(["--library", "--strict-refusals"]), true, "library CLI evidence can apply the same strict policy");
eq(strictFuzzEvidence(["--library"]), false, "legacy runs retain their recorded policy");
/* These are pure unit inputs, never CLI options and never passed to a seat or a game, even with the guard mutated. */
throws(() => houseFuzzLevel("llm"), /house pilots only/, "a model-backed value is rejected by the pure validator");
throws(() => houseFuzzLevel("hard"), /house pilots only/, "the run's permitted difficulty values are enforced");
eq([houseFuzzLevel(null), houseFuzzLevel("easy"), houseFuzzLevel("normal")], [null, "easy", "normal"], "default and permitted house levels pass validation");
const final = await finalPoolFrom();
ok(final.library.length > 6000, "pool population comes from all final definitions, beyond the library");
ok(final.library.every((n) => final.scripts.some((s) => s.identity.name === n) && !basic.has(n)), "every pool entry is a final nonbasic definition");
ok(final.library.every((n) => tableCards(n)), "every final population entry is actually in the table's generated card source");
const root = mkdtempSync(path.join(tmpdir(), "pool-population-"));
try {
  for (const dir of ["data/engine", "game/engine/cards/a"]) mkdirSync(path.join(root, dir), {recursive: true});
  const names = ["Good", "Banned", "Basic", "Token", "Plane"];
  for (const name of names) writeFileSync(path.join(root, "game/engine/cards/a", `${name}.json`), JSON.stringify({identity: {name}, abilities: []}));
  const cards = names.map((name, i) => ({name, type: ["Creature", "Creature", "Basic Land — Forest", "Token Creature", "Plane — Test"][i]}));
  writeFileSync(path.join(root, "data/engine/oracle.json"), JSON.stringify({cards}));
  writeFileSync(path.join(root, "data/commander-banned.json"), JSON.stringify({cards: ["Banned"]}));
  const fixtureRoot = pathToFileURL(root + path.sep);
  eq((await finalPoolFrom(fixtureRoot)).library, ["Good"], "pool inventory excludes banned cards, basics, tokens, and nondeck cards");
  writeFileSync(path.join(root, "data/engine/oracle.json"), JSON.stringify({cards: []}));
  await assert.rejects(() => finalPoolFrom(fixtureRoot), /has no oracle record/); checks += 1;
} finally {rmSync(root, {recursive: true, force: true});}

/* Existing journal vocabulary, including the events a superficially plausible ledger must not credit. */
const script = (name, abilities = []) => ({identity: {name}, abilities});
const scripts = [script("Bolt", [{kind: "spell", text: "Damage."}]), script("Land", [{kind: "activated", mana: true}]),
  script("Bear", [{kind: "keyword", text: "Flying"}]), script("Bell", [{kind: "activated"}, {kind: "triggered"}, {kind: "static"}]),
  {...script("Front // Back", [{kind: "activated"}]), back: {identity: {name: "Back"}, abilities: [{kind: "activated"}]}}];
const event = (kind, fields) => ({kind, data: {fields}});
const cast = (name, id) => event("GameEventSpellAbilityCast", {card: {name}, sa: {isSpell: true, stackId: id, abilityId: "a0"}});
const resolved = (name, id, extra = {}) => event("GameEventSpellResolved", {card: {name}, stackId: id, abilityId: "a0", kind: "spell", hasFizzled: false, ...extra});
const events = [cast("Bolt", 1), resolved("Bolt", 1), event("GameEventLandPlayed", {land: {name: "Land"}}),
  event("GameEventSpellAbilityCast", {card: {name: "Bell"}, sa: {isSpell: false, abilityId: "a0", stackId: 3}}),
  resolved("Bell", 3, {kind: "ability"}), resolved("Bell", 4, {kind: "trigger", abilityId: "a1"}),
  event("GameEventManaPool", {source: {name: "Land"}, produced: {C: 1}}),
  resolved("Bear", 6), resolved("Bell", 7, {kind: "ability", abilityId: "a2"}),
  resolved("Front // Back", 8, {kind: "ability"})];
const ledger = createExerciseLedger(scripts);
throws(() => addExerciseEvidence(ledger, events), /names a clean game or a passing scenario/, "unlabeled events are not proof of either gate");
ok(!addExerciseEvidence(ledger, events, {game: "dirty", clean: false}), "unclean games add no exercise evidence");
eq(ledger.games, [], "a dirty game adds no game credit");
addExerciseEvidence(ledger, events, {game: "good", clean: true});
eq([ledger.cards.Bolt.cast, ledger.cards.Bolt.resolved, ledger.cards.Bolt.exercised], [1, 1, 1], "a matched successful cast/resolution counts");
eq([ledger.cards.Land.played, ledger.cards.Land.resolved, ledger.cards.Land.exercised], [1, 1, 1], "playing a land is its completed special action");
eq([ledger.cards.Bell.abilities[0].activated, ledger.cards.Bell.abilities[0].resolved, ledger.cards.Bell.abilities[1].triggered], [1, 1, 1], "specific activated and triggered abilities are observed by id");
eq(ledger.cards.Bell.exercised, 0, "an ability resolving does not mean its source was cast and resolved");
eq(ledger.cards.Bear.abilities[0].resolved, 0, "a permanent spell resolving cannot prove its keyword applied");
eq(ledger.cards.Bell.abilities[2].resolved, 0, "a static id is not credited as an activated application");
eq(ledger.cards.Land.abilities[0].resolved, 0, "a mana event without an ability id stays unobserved");
eq(ledger.cards["Front // Back"].abilities.map((a) => a.resolved), [0, 0], "ambiguous face-local ids stay unobserved");
const rejected = createExerciseLedger([script("Bolt", [{kind: "spell"}])]);
addExerciseEvidence(rejected, [resolved("Bolt", 2), cast("Bolt", 1), resolved("Bolt", 1, {hasFizzled: true}), cast("Bolt", 3), resolved("Bolt", 4)], {game: "copies-and-fizzle", clean: true});
eq(rejected.cards.Bolt.exercised, 0, "a copy resolving, a fizzled cast, and a different stack id never prove the card resolved");
const scenarios = createExerciseLedger(scripts);
addExerciseEvidence(scenarios, events, {scenario: "Bolt: damage"});
eq(scenarios.cards.Bolt.exercised, 0, "scenarios are distinct from clean whole games");
eq(scenarios.cards.Bolt.resolved, 0, "scenario resolutions do not enter the game's card counts");
eq(scenarios.cards.Bolt.abilities[0].scenarios, ["Bolt: damage"], "ability evidence names the scenario that reached it");
const summary = exerciseSummary(ledger);
eq(summary.exercised, 2, "only two cards were played and completed");
ok(!summary.complete && summary.unreached.some((a) => a.card === "Bear"), "unknown applications keep the ability gate unmet");

/* A real room journal, rather than only hand-built events: a small fixture game deliberately ends by decking. */
const storage = memoryStorage(), matchId = "pool-ledger-fixture";
const decksReal = [0, 1].map((i) => ({commander: [i ? "Chulane, Teller of Tales" : "Rograkh, Son of Rohgahh"], cards: Array(12).fill(i ? "Plains" : "Mountain")}));
const game = await playGame({decks: decksReal, seed: 27, cards: tableCards, storage, matchId, replay: true, leaks: true, strictRefusals: true});
ok(verdict(game).clean, "the real room fixture finishes without refusals, replay differences, or leaks");
const real = createExerciseLedger([script("Mountain"), script("Plains"), script("Rograkh, Son of Rohgahh"), script("Chulane, Teller of Tales")]);
addExerciseEvidence(real, await createMatchStore(storage, matchId).readJournal(), {game: matchId, clean: verdict(game).clean});
ok(exerciseSummary(real).exercised > 0, "persisted room journal supplies actual cast/play evidence");
console.log(`fuzz-pool: ${checks} checks passed; legal pool dealing, strict refusal evidence, journal attribution, and a clean real-room replay.`);
