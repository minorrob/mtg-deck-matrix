/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* AI-3'S CARD LOADER, WITHOUT SPENDING A CENT.
 *
 * `docs/plan-to-done-2026-09-30.md` AI-3 asks for proof that "a learned script passes the four checks; a deliberately
 * wrong script fails each check". The model is replaced by a stub that returns what a test tells it to, so every path
 * through the loader runs here and nothing reaches the network:
 *   1. The checks themselves, held against the 75 hand-authored definitions: the printed facts the loader fills in
 *      from the oracle data are the hand definitions' own; every hand definition passes fidelity and the smoke game,
 *      and nearly all are actually played in it. Each check refuses what it exists to refuse.
 *   2. The run: a right answer stored `provisional`; an invented sentence sent back with its errors and refused if
 *      the writer does not mend it; a schema error, a read-back "no", a smoke-game exception each refused at their
 *      stage; a construct the engine has not built stored `blocked`; a hand-authored card skipped without a call; a
 *      card learned once for its oracle text and again when the text changes; the cost cap; the rules flagged.
 *   3. The command line spends nothing without --yes, and its plan says what a run would take.
 *   4. The directory reads compiled cards, and a hand-authored one wins.
 */
import assert from "node:assert/strict";
import {readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {
  identityOf, assembleScript, checkFidelity, oracleClauses, checkReadBack, smokeTest, smokeScenario, zoneProblems,
  writerSystem, writerRequest, WRITER_SCHEMA, READBACK_SCHEMA, checkAnswer, oracleHash, COMPILED_SCHEMA,
} from "../game/engine/cards/compile.mjs";
import {compileCards, costOf, examplesFrom, WRITER_MODEL, READER_MODEL} from "../game/tools/engine-compile.mjs";
import {loadCardScripts, loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORACLE = new Map(JSON.parse(readFileSync(path.join(ROOT, "data/engine/oracle.json"), "utf8")).cards.map((c) => [c.name, c]));
const scripts = loadCardScripts().map((e) => e.script);
const index = loadCardIndex();
const handOf = (name) => scripts.find((s) => s.identity.name === name);

/* ---- 1. the checks, against the hand-authored directory ---- */
{
  const sorted = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
  const drift = scripts.filter((s) => sorted(identityOf(ORACLE.get(s.identity.name))) !== sorted(s.identity)).map((s) => s.identity.name);
  eq(drift, [], `the printed facts the loader fills in from the oracle data are the ${scripts.length} hand definitions' own: the model never writes them`);
  const unfaithful = scripts.filter((s) => !checkFidelity(s).ok).map((s) => `${s.identity.name}: ${JSON.stringify(checkFidelity(s))}`);
  eq(unfaithful, [], "every hand definition passes fidelity: each ability a sentence of the card, every clause claimed");
  const smoked = scripts.map((s) => ({name: s.identity.name, ...smokeTest(s, index.definition)}));
  eq(smoked.filter((r) => !r.ok).map((r) => `${r.name}: ${r.problems.join("; ")}`), [], "every hand definition survives its smoke game");
  const played = smoked.filter((r) => r.played).length;
  ok(played >= scripts.length - 2, `and ${played} of ${scripts.length} were actually played or cast in it (a counterspell for creatures has only a sorcery to answer)`);
  /* Batch 30: a card aimed at its controller's own creature spell answers the Smoke Whelp its player casts first. */
  ok(smoked.find((r) => r.name === "Double Major")?.played === true, "Double Major (\"copy target creature spell you control\") is cast in its smoke game, at its player's own creature spell");
  /* A creature whose ACTIVATED ability copies its controller's spells is cast as any creature is: no spell of its own put on
     the stack first, which would keep a creature from being cast at all. */
  /* A counterspell for a particular spell has one to answer: a creature spell, an instant, a blue spell; and "sacrifice a
     green creature" a green one. */
  eq(["Essence Scatter", "Dispel", "Red Elemental Blast", "Natural Order"].filter((name) => smoked.find((r) => r.name === name)?.played !== true), [],
    "Essence Scatter, Dispel, Red Elemental Blast and Natural Order are cast in their smoke games");
  /* A choice of additional costs (`oneOf`): the fodder for each choice is there, and the spell is cast. */
  eq(["Silence the Echo", "Bogslither's Embrace"].filter((name) => smoked.find((r) => r.name === name)?.played !== true), [],
    "Silence the Echo (sacrifice a creature or planeswalker, or pay {3}) and Bogslither's Embrace (blight 1, or pay {3}) are cast in their smoke games");
  ok(smoked.find((r) => r.name === "Kitsa, Otterball Elite")?.played === true, "Kitsa, Otterball Elite is cast in its smoke game: only a spell's own aim at its controller's spell waits for one");
  /* What a smoke game gives a card to aim at is read from its modes too, and a graveyard target finds a sorcery card as
     well as a creature card: two cards written for these games, not in the directory. */
  const smokeCard = (name, cost, color, text, ability) => ({schema: "CrankCardScript@1",
    identity: {name, oracleId: "00000000-0000-4000-8000-00000000000" + (name.length % 10), types: ["Instant"], manaCost: cost, colors: [color], colorIdentity: [color]},
    oracleText: text, source: "hand", abilities: [{kind: "spell", text, ...ability}]});
  const modal = smokeCard("Smoke Tactics", "{1}{G}", "G", "Choose one \u2014\n\u2022 Destroy target creature with flying.\n\u2022 Put a +1/+1 counter on target creature you control.", {effects: [{effect: "modal", choose: 1, modes: [
    {text: "Destroy target creature with flying.", targets: [{what: "permanent", types: ["Creature"], keywords: ["Flying"]}], effects: [{effect: "destroy", targets: {target: 0}}]},
    {text: "Put a +1/+1 counter on target creature you control.", targets: [{what: "permanent", types: ["Creature"], controller: "you"}], effects: [{effect: "putCounter", targets: {target: 0}, counter: "+1/+1", count: 1}]}]}]});
  ok(smokeTest(modal, index.definition).played === true, "a modal spell whose one castable mode aims at its caster's creature is cast: the modes' targets are read (Warg Tactics)");
  const rewind = smokeCard("Smoke Rewind", "{R}", "R", "Return target instant or sorcery card from your graveyard to your hand.", {
    targets: [{anyOf: [{what: "card", zone: "graveyard", controller: "you", types: ["Instant"]}, {what: "card", zone: "graveyard", controller: "you", types: ["Sorcery"]}]}],
    effects: [{effect: "moveZone", targets: {target: 0}, to: "hand"}]});
  ok(smokeTest(rewind, index.definition).played === true, "a spell aimed at an instant or sorcery card in its caster's graveyard is cast: one is there (Flashback)");

  const bolt = handOf("Lightning Bolt");
  const four = checkFidelity({...bolt, abilities: [{...bolt.abilities[0], text: "Lightning Bolt deals 4 damage to any target."}]});
  eq([four.invented, four.unclaimed], [["Lightning Bolt deals 4 damage to any target."], ["Lightning Bolt deals 3 damage to any target."]],
    "an invented sentence is caught -- a model that changed the card cannot quote it");
  const extra = checkFidelity({...bolt, abilities: [...bolt.abilities, {kind: "spell", text: "Draw a card.", effects: [{effect: "draw"}]}]});
  eq([extra.ok, extra.invented, extra.unclaimed], [false, ["Draw a card."], []], "an extra ability the card does not have is refused on its own, everything else being right");
  const grasp = handOf("Infernal Grasp");
  const partial = checkFidelity({...grasp, abilities: [{...grasp.abilities[0], text: "Destroy target creature."}]});
  eq([partial.ok, partial.invented, partial.unclaimed], [false, [], ["You lose 2 life."]],
    "and a clause no ability claims is refused on its own: the card only partly understood");
  eq(oracleClauses("Defender (This creature can't attack.)\n{T}: Add {G}."), ["Defender", "{T}: Add {G}."], "reminder text in parentheses claims nothing");
  const opt = handOf("Opt");
  eq([opt.abilities[0].text === opt.oracleText, checkFidelity(opt).ok], [true, true],
    "a spell quoting the card whole, a reminder in parentheses in the middle of it, is faithful: both sides are read without the parentheses");
  const scry2 = checkFidelity({...opt, abilities: [{...opt.abilities[0], text: opt.oracleText.replace("Scry 1.", "Scry 2.")}]});
  eq(scry2.ok, false, "and changing a word of it is still an invention");
  eq(oracleClauses("({T}: Add {W}.)"), ["{T}: Add {W}."], "unless it is the whole line, as a basic land's ability is");
  eq(oracleClauses("Flying, double strike, vigilance"), ["Flying", "double strike", "vigilance"], "a keyword line is a clause per keyword");

  eq(checkReadBack({everyAbilityPresent: true, costsRight: true, targetsRight: true, zonesRight: true, effectsRight: true, problems: []}).ok, true, "a read-back of five yeses and no problem passes");
  eq(checkReadBack({everyAbilityPresent: true, costsRight: false, targetsRight: true, zonesRight: true, effectsRight: true, problems: ["The cost omits {1}."]}).failed, ["costsRight"],
    "one no refuses it");
  eq(checkReadBack(null).ok, false, "and no answer at all is a refusal, not a pass");

  const broken = {...handOf("Night's Whisper"), abilities: [{...handOf("Night's Whisper").abilities[0], effects: [{effect: "moveZone", targets: "self", to: "nowhere"}]}]};
  const exploded = smokeTest(broken, index.definition);
  ok(!exploded.ok && /nowhere|zone/i.test(exploded.problems.join(" ")), `a script that throws in its smoke game is refused (${exploded.problems[0]})`);
  const unbuilt = {...handOf("Night's Whisper"), abilities: [{...handOf("Night's Whisper").abilities[0], effects: [{effect: "exchangeLife"}]}]};
  eq([smokeTest(unbuilt, index.definition).blocked, smokeTest(unbuilt, index.definition).ok], [true, false], "one using a construct the engine has not built is blocked, not refused");
  const s = {zones: {hand: [[1]], battlefield: [1]}, objects: {1: {card: "Twice", zone: "hand"}}};
  ok(zoneProblems(s).some((p) => /object 1 is in hand and battlefield/.test(p)), "the smoke game's state check finds a card in two zones");
  const lens = smokeScenario(handOf("Counterspell"));
  ok(lens.scenario.at?.turn === 2 && lens.scenario.steps[0].cast === "Smoke Sorcery", "an instant is smoked in the opponent's turn, in answer to a sorcery");
  const handAt = (sc, seat, zone) => sc.scenario.setup.filter((e) => e.seat === seat && e.zone === zone).flatMap((e) => e.cards);
  eq([handAt(smokeScenario(handOf("Big Score")), 0, "hand"), handAt(smokeScenario(handOf("Opt")), 0, "hand")], [["Big Score", "Smoke Charm"], ["Opt"]],
    "a spell with a discard as an additional cost is smoked with a card to discard; one without, alone");
  ok(["Smoke Bear", "Smoke Relic"].every((c) => handAt(smokeScenario(handOf("Deadly Dispute")), 0, "battlefield").includes(c))
    && !handAt(smokeScenario(handOf("Opt")), 0, "battlefield").includes("Smoke Bear"), "and one that sacrifices, with a creature and an artifact of its own");
  eq(["Big Score", "Village Rites", "Deadly Dispute"].map((n) => smokeTest(handOf(n), index.definition).played), [true, true, true], "so the smoke game casts them");
}

/* ---- the request: the engine's own vocabulary, and a schema the API accepts ---- */
{
  const examples = examplesFrom(scripts);
  const system = writerSystem(examples);
  ok(examples.length >= 5 && examples.every((e) => system.includes(JSON.stringify(e.abilities))), "the writer is shown finished definitions from the directory");
  ok(["dealDamage", "counterSpell", "createToken"].every((p) => system.includes(p)) && system.includes("{\"target\": n}"), "and the engine's own primitives and binding, read off the engine");
  ok(!/exchangeLife/.test(system), "never a primitive the engine has not built (exchangeLife; surveil was the example until batch 20 built it, twoPiles until 2026-10-04)");
  ok(system.includes("additionalCost") && ["Treasure", "Food", "Clue"].every((t) => system.includes(t)) && system.includes("attachedBy") && system.includes("\"Equip {N}\""),
    "the writer is told how an additional cost, a predefined token and Equip are written");
  const strict = (schema) => schema.type !== "object" || (schema.additionalProperties === false && Object.values(schema.properties).every((p) => strict(p.items ?? p)));
  ok(strict(WRITER_SCHEMA) && strict(READBACK_SCHEMA), "both schemas close every object, as structured output requires (no open objects, no recursion)");
  const req = JSON.parse(writerRequest(ORACLE.get("Lightning Bolt"), ["abilities[0].text: missing"]));
  eq([req.card.oracleText, req.yourLastAnswerWasRefused], ["Lightning Bolt deals 3 damage to any target.", ["abilities[0].text: missing"]], "a retry carries what was wrong");
  eq(checkAnswer(ORACLE.get("Lightning Bolt"), {abilitiesJson: "[{oops"}).stage, "schema", "abilities that are not JSON are a schema refusal");
  ok(Math.abs(costOf(WRITER_MODEL, {input_tokens: 1e6, output_tokens: 1e6}) - 12) < 1e-9 && Math.abs(costOf(READER_MODEL, {input_tokens: 1e6, cache_read_input_tokens: 1e6}) - 1.1) < 1e-9,
    "costs at list prices: Sonnet 5.5 $2 in and $10 out, Haiku 4.5 $1 in, a cache read a tenth");
}

/* ---- 2. a run, against a stub of the API ---- */
const YES = {everyAbilityPresent: true, costsRight: true, targetsRight: true, zonesRight: true, effectsRight: true, problems: []};
function stub(plan) {
  const calls = [];
  const call = async (body) => {
    calls.push(body);
    const name = JSON.parse(body.messages[0].content).card?.name ?? JSON.parse(body.messages[0].content).name;
    const step = plan[name];
    const reply = typeof step === "function" ? step(body, calls.filter((c) => c.model === body.model).length) : step;
    return {answer: body.model === READER_MODEL ? (reply?.readBack ?? YES) : reply?.writer, usage: {input_tokens: 1000, output_tokens: 500}};
  };
  return {calls, call};
}
const answerOf = (name, extra = {}) => ({abilitiesJson: JSON.stringify(handOf(name).abilities), notes: "", crFlags: [], ...extra});
const job = (names, call, ledger = {cards: {}}, extra = {}) => {
  const written = {};
  return {written, run: compileCards({names, oracle: ORACLE, hand: new Set(), cards: index.definition, ledger, call, examples: examplesFrom(scripts),
    write: (id, compiled) => { written[id] = compiled; }, now: () => "2026-10-01T00:00:00Z", ...extra})};
};
{
  const {calls, call} = stub({"Lightning Bolt": {writer: answerOf("Lightning Bolt", {crFlags: ["CR 120.3: damage to a creature is marked"]})}});
  const ledger = {cards: {}};
  const {written, run} = job(["Lightning Bolt"], call, ledger);
  const {results, cost} = await run;
  const id = ORACLE.get("Lightning Bolt").id;
  eq([results[0].outcome, ledger.cards[id].status, written[id].status, written[id].schema], ["provisional", "provisional", "provisional", COMPILED_SCHEMA],
    "a right answer passes all four checks and is stored provisional, until a playtest or Rob confirms it");
  eq([calls.map((c) => c.model), calls[0].output_config.effort, calls[1].output_config.effort], [[WRITER_MODEL, READER_MODEL], "medium", undefined],
    "Sonnet 5.5 at medium effort writes it and Haiku 4.5 reads it back, with no effort sent to Haiku");
  ok(calls[0].system[0].cache_control?.type === "ephemeral", "the writer's standing instructions are cached");
  eq([written[id].crFlags, written[id].script.identity.oracleId, written[id].oracleHash], [["CR 120.3: damage to a creature is marked"], id, oracleHash(ORACLE.get("Lightning Bolt"))],
    "with the rules it relied on, the printed facts from the oracle data, and the hash of the text it was learned from");
  ok(Math.abs(cost - (costOf(WRITER_MODEL, {input_tokens: 1000, output_tokens: 500}) + costOf(READER_MODEL, {input_tokens: 1000, output_tokens: 500}))) < 1e-9 && ledger.cards[id].cost > 0,
    "and the ledger records what it cost");
  const again = stub({});
  const second = await job(["Lightning Bolt"], again.call, ledger).run;
  eq([second.results[0].outcome, again.calls.length], ["already learned", 0], "a second run learns nothing it already has: the ledger is read before a token is spent");
  const changed = new Map(ORACLE);
  changed.set("Lightning Bolt", {...ORACLE.get("Lightning Bolt"), text: "Lightning Bolt deals 3 damage to any target. (Errata.)"});
  const third = stub({"Lightning Bolt": {writer: answerOf("Lightning Bolt")}});
  await compileCards({names: ["Lightning Bolt"], oracle: changed, hand: new Set(), cards: index.definition, ledger, call: third.call, examples: [], write: () => {}});
  ok(third.calls.length >= 1, "and a card whose oracle text changed is learned again");
}
{
  const bad = {...answerOf("Lightning Bolt"), abilitiesJson: JSON.stringify([{...handOf("Lightning Bolt").abilities[0], text: "Lightning Bolt deals 4 damage to any target."}])};
  const mended = stub({"Lightning Bolt": (body, n) => ({writer: n === 1 ? bad : answerOf("Lightning Bolt")})});
  const {results} = await job(["Lightning Bolt"], mended.call).run;
  eq([results[0].outcome, results[0].attempts ?? null], ["provisional", null], "an invented sentence sent back with its errors, and mended, is stored");
  ok(JSON.parse(mended.calls[1].messages[0].content).yourLastAnswerWasRefused.some((p) => /not a sentence of the card/.test(p)), "the retry carried what was wrong");
  const stubborn = stub({"Lightning Bolt": {writer: bad}});
  const ledger = {cards: {}};
  const r2 = (await job(["Lightning Bolt"], stubborn.call, ledger).run).results[0];
  eq([r2.outcome, r2.stage, stubborn.calls.filter((c) => c.model === WRITER_MODEL).length, stubborn.calls.filter((c) => c.model === READER_MODEL).length], ["failed", "fidelity", 3, 0],
    "a writer that does not mend it is refused at fidelity after two retries, and nothing is spent reading it back");
  eq(ledger.cards[ORACLE.get("Lightning Bolt").id].stage, "fidelity", "the ledger records where it stopped");
}
{
  const notPrimitive = stub({"Lightning Bolt": {writer: {abilitiesJson: JSON.stringify([{kind: "spell", text: "Lightning Bolt deals 3 damage to any target.", effects: [{effect: "boltThem"}]}]), notes: "", crFlags: []}}});
  eq((await job(["Lightning Bolt"], notPrimitive.call).run).results[0].stage, "schema", "an effect that is not a primitive is refused at the schema");
  const readerNo = stub({"Lightning Bolt": {writer: answerOf("Lightning Bolt"), readBack: {...YES, targetsRight: false, problems: ["Any target includes planeswalkers."]}}});
  const r = (await job(["Lightning Bolt"], readerNo.call).run).results[0];
  eq([r.outcome, r.stage], ["failed", "read-back"], "a read-back no refuses it");
  const boom = {...answerOf("Night's Whisper"), abilitiesJson: JSON.stringify([{...handOf("Night's Whisper").abilities[0], effects: [{effect: "moveZone", targets: "self", to: "nowhere"}]}])};
  eq((await job(["Night's Whisper"], stub({"Night's Whisper": {writer: boom}}).call).run).results[0].stage, "smoke", "a smoke game that throws refuses it");
  const waits = {...answerOf("Night's Whisper"), abilitiesJson: JSON.stringify([{...handOf("Night's Whisper").abilities[0], effects: [{effect: "exchangeLife"}]}])};
  const blocked = job(["Night's Whisper"], stub({"Night's Whisper": {writer: waits}}).call);
  const rb = (await blocked.run).results[0];
  eq([rb.outcome, blocked.written[ORACLE.get("Night's Whisper").id]?.status], ["blocked", "blocked"], "a script waiting on an unbuilt construct is stored blocked, to play the day the engine builds it");
}
{
  const none = stub({});
  const {results} = await compileCards({names: ["Lightning Bolt", "Not A Card"], oracle: ORACLE, hand: new Set(["Lightning Bolt"]), cards: index.definition,
    ledger: {cards: {}}, call: none.call, examples: [], write: () => {}});
  eq([results.map((r) => r.outcome), none.calls.length], [["hand-authored", "no oracle card"], 0], "a hand-authored card is never learned, and a name the oracle data lacks is reported, both without a call");
  const many = stub(Object.fromEntries(["Lightning Bolt", "Vindicate", "Mortify"].map((n) => [n, {writer: answerOf(n)}])));
  const capped = await compileCards({names: ["Lightning Bolt", "Vindicate", "Mortify"], oracle: ORACLE, hand: new Set(), cards: index.definition, ledger: {cards: {}},
    call: many.call, examples: [], write: () => {}, maxCost: 0.001});
  ok(/cap/.test(capped.stopped) && capped.results.length < 3, `the run stops at its cost cap (${capped.stopped})`);
  const sampled = await compileCards({names: ["Lightning Bolt", "Vindicate", "Mortify"], oracle: ORACLE, hand: new Set(), cards: index.definition, ledger: {cards: {}},
    call: stub(Object.fromEntries(["Lightning Bolt", "Vindicate", "Mortify"].map((n) => [n, {writer: answerOf(n)}]))).call, examples: [], write: () => {}, sample: 2});
  eq(sampled.results.length, 2, "and --sample takes only that many cards still to learn");
}

/* ---- 3. the command line spends nothing without --yes ---- */
{
  const env = {...process.env};
  delete env.ANTHROPIC_API_KEY;
  const plan = spawnSync(process.execPath, ["game/tools/engine-compile.mjs", "--plan", "--decks", "--sample", "200"], {cwd: ROOT, encoding: "utf8", env});
  eq(plan.status, 0, "--plan exits cleanly");
  ok(/cards asked for; \d+ hand-authored, \d+ not in the oracle data, \d+ still to learn/.test(plan.stdout) && /spends money/.test(plan.stdout), `and says what a run would take, for free: ${plan.stdout.split("\n")[0]}`);
  const bare = spawnSync(process.execPath, ["game/tools/engine-compile.mjs", "--cards", "Lightning Bolt"], {cwd: ROOT, encoding: "utf8", env});
  ok(bare.status === 2 && /spends money/.test(bare.stdout) && !/no key/.test(bare.stderr), "without --yes it refuses with exit 2 before it looks for a key, having called nothing");
}

/* ---- 4. the directory reads compiled cards; a hand-authored one wins ---- */
{
  const dir = mkdtempSync(path.join(tmpdir(), "compiled-"));
  try {
    const card = ORACLE.get("Elvish Visionary"), mine = ORACLE.get("Fyndhorn Elves");
    const save = (c, script) => { mkdirSync(path.join(dir, c.id.slice(0, 2)), {recursive: true}); writeFileSync(path.join(dir, c.id.slice(0, 2), `${c.id}.json`), JSON.stringify({schema: COMPILED_SCHEMA, status: "provisional", script})); };
    const ornithopter = {id: "9e5bd1f2-6a3c-4f6e-9d1a-000000000001", name: "Compiled Probe", mana: "{G}", type: "Creature — Elf", text: "{T}: Add {G}.", power: "1", toughness: "1", colors: ["G"], ci: ["G"]};
    save(ornithopter, assembleScript(ornithopter, {abilities: handOf("Fyndhorn Elves").abilities}));
    save(card, {...assembleScript(card, {abilities: []}), abilities: []});
    void mine;
    const merged = loadCardIndex(undefined, dir);
    eq([merged.resolve("Compiled Probe")?.source, merged.resolve("Compiled Probe")?.status, merged.resolve("Compiled Probe")?.playable], ["compiled", "provisional", true],
      "a compiled card joins the directory, marked compiled and provisional");
    eq([merged.resolve("Elvish Visionary").source, merged.definition("Elvish Visionary").abilities.length], ["hand", 1], "and where a hand-authored definition exists it wins");
  } finally { rmSync(dir, {recursive: true, force: true}); }
}

console.log(`engine-compile: ${checks} checks passed — the loader's four checks held against ${scripts.length} hand definitions, every refusal at its stage, a card learned once for its text, and nothing spent without --yes.`);
