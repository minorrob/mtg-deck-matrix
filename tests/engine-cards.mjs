/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE CARD DIRECTORY AND EVERY CARD'S SCENARIOS.
 *
 * `docs/engine/PLAN.md` §6, phase 2.4 -- "scenario runner suite, `cards/index.mjs` with `resolve` and `suggest`" --
 * and §3.4: every definition carries scenarios, and one suite runs them all.
 *   1. Every definition in `game/engine/cards` is a valid `CrankCardScript@1` the engine can play, and its identity
 *      and oracle text are the committed oracle data's (data/engine/oracle.json), so a definition cannot drift from
 *      the card it claims to be (§3.2.5).
 *   2. Every definition has a scenarios file, every scenarios file names a defined card, and every scenario passes,
 *      played through the rules by cards/scenario.mjs.
 *   3. `resolve` folds a name the way people type it; `suggest` finds a misspelling; `definition` is a fresh copy.
 *   4. What the engine cannot play is refused BY NAME before a game -- a primitive not built, a keyword with no
 *      behavior, a cost nothing pays, a trigger nothing watches -- each deliberately written wrong here.
 *   5. The runner itself fails when a scenario is wrong: a bad expectation, a move the rules do not offer.
 *   6. docs/engine/coverage.md is what engine-coverage writes today.
 *   7. The most-played list (data/engine/top-cards.json, Rob 2026-10-01): the cards that make up 80% of Commander
 *      decks, most-played first, every one a card of the oracle data -- the order the directory is filled in.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {loadCardScripts, loadCardScenarios, loadCardIndex} from "../game/tools/engine-cards.mjs";
import {createCardIndex, compileScript, foldName} from "../game/engine/cards/index.mjs";
import {runScenario, SCENARIOS_SCHEMA} from "../game/engine/cards/scenario.mjs";
import {SCRIPT_SCHEMA} from "../game/engine/script/schema.mjs";
import {definitionsModule, DEFINITIONS_MODULE} from "../game/tools/engine-definitions.mjs";
import {tableDefinition, DEFINITIONS} from "../game/engine/cards/definitions.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const throws = (f, re, m) => { assert.throws(f, re, m); checks += 1; };

const ORACLE = new Map(JSON.parse(readFileSync(new URL("../data/engine/oracle.json", import.meta.url), "utf8")).cards.map((c) => [c.name, c]));
const scripts = loadCardScripts();
const index = loadCardIndex();
const files = loadCardScenarios();

/* ---- 1. every definition: valid, playable, and the card it says it is ---- */
{
  ok(scripts.length >= 16, `the directory holds the first batch of definitions (${scripts.length})`);
  const handNames = index.names.filter((n) => index.resolve(n).source === "hand");
  eq(handNames.length, scripts.length, "every hand-authored definition is in the directory, as written by hand");
  const unplayable = handNames.filter((n) => !index.resolve(n).playable).map((n) => `${n}: ${index.problems(n).join("; ")}`);
  eq(unplayable, [], "every hand-authored definition is one the engine can play");
  const drift = [];
  for (const {script, path} of scripts) {
    const card = ORACLE.get(script.identity.name);
    if (!card) { drift.push(`${path}: no oracle card named ${script.identity.name}`); continue; }
    const num = (v) => (v !== null && v !== undefined && /^\d+$/.test(v) ? Number(v) : null);
    /* A modal double-faced card (CR 712.3): its identity is its front face's, its back face the oracle's second. */
    const double = card.layout === "modal_dfc";
    /* An adventurer card (CR 715.2): its identity is its own half's, the oracle's first face, and its Adventure the second.
       The oracle gives an adventurer's halves no colors of their own: each half's are its mana cost's (CR 105.2, 202.2). */
    const adventurer = card.layout === "adventure";
    const front = double || adventurer ? card.faces[0] : card;
    const colorsOf = (face) => face.colors ?? ["W", "U", "B", "R", "G"].filter((c) => new RegExp(`\\{[^}]*${c}[^}]*\\}`).test(face.mana ?? ""));
    /* And a planeswalker's printed loyalty (CR 306.5a). */
    const want = {oracleId: card.id, manaCost: front.mana, colors: colorsOf(front), colorIdentity: card.ci, power: num(front.power), toughness: num(front.toughness),
      ...(front.loyalty ? {loyalty: num(front.loyalty)} : {})};
    const got = {oracleId: script.identity.oracleId, manaCost: script.identity.manaCost, colors: script.identity.colors,
      colorIdentity: script.identity.colorIdentity, power: script.identity.power, toughness: script.identity.toughness,
      ...(script.identity.loyalty !== undefined ? {loyalty: script.identity.loyalty} : {})};
    if (JSON.stringify(got) !== JSON.stringify(want)) drift.push(`${path}: identity ${JSON.stringify(got)} is not the oracle's ${JSON.stringify(want)}`);
    if (script.oracleText !== front.text) drift.push(`${path}: its oracle text is not the oracle's`);
    for (const ability of script.abilities) if (!front.text.includes(ability.text)) drift.push(`${path}: "${ability.text}" is not a sentence of the card`);
    if (double !== (script.back !== undefined)) drift.push(`${path}: ${double ? "a double-faced card without its back face" : "a back face on a card that has none"}`);
    if (double && script.back) {
      const back = card.faces[1];
      const wantBack = {name: back.name, manaCost: back.mana || null, colors: back.colors, power: num(back.power), toughness: num(back.toughness)};
      const gotBack = {name: script.back.identity.name, manaCost: script.back.identity.manaCost ?? null, colors: script.back.identity.colors, power: script.back.identity.power, toughness: script.back.identity.toughness};
      if (JSON.stringify(gotBack) !== JSON.stringify(wantBack)) drift.push(`${path}: back face ${JSON.stringify(gotBack)} is not the oracle's ${JSON.stringify(wantBack)}`);
      if (script.back.oracleText !== back.text) drift.push(`${path}: its back face's oracle text is not the oracle's`);
      for (const ability of script.back.abilities) if (!back.text.includes(ability.text)) drift.push(`${path}: "${ability.text}" is not a sentence of its back face`);
    }
    if (adventurer !== (script.adventure !== undefined)) drift.push(`${path}: ${adventurer ? "an adventurer card without its Adventure" : "an Adventure on a card that has none"}`);
    if (adventurer && script.adventure) {
      const adventure = card.faces[1];
      const [left, right = ""] = adventure.type.split(" — ");
      const wantAdventure = {name: adventure.name, types: left.split(" "), subtypes: right.split(" ").filter(Boolean), manaCost: adventure.mana, colors: colorsOf(adventure)};
      const gotAdventure = {name: script.adventure.identity.name, types: script.adventure.identity.types, subtypes: script.adventure.identity.subtypes, manaCost: script.adventure.identity.manaCost,
        colors: script.adventure.identity.colors};
      if (JSON.stringify(gotAdventure) !== JSON.stringify(wantAdventure)) drift.push(`${path}: Adventure ${JSON.stringify(gotAdventure)} is not the oracle's ${JSON.stringify(wantAdventure)}`);
      if (script.adventure.oracleText !== adventure.text) drift.push(`${path}: its Adventure's oracle text is not the oracle's`);
      for (const ability of script.adventure.abilities) if (!adventure.text.includes(ability.text)) drift.push(`${path}: "${ability.text}" is not a sentence of its Adventure`);
    }
    if (!path.startsWith(`${foldName(script.identity.name).charAt(0)}/`)) drift.push(`${path}: filed under the wrong letter`);
  }
  eq(drift, [], "each definition's identity and text are the committed oracle data's, and every ability is a sentence of the card (§3.2.5)");
}

/* ---- 2. every card has scenarios, and every scenario passes ---- */
{
  const covered = new Set(files.map((f) => f.scenarios.card));
  eq(index.names.filter((n) => index.resolve(n).source === "hand" && !covered.has(n)), [], "every hand-authored definition has a scenarios file (a compiled one has the loader's smoke game instead)");
  eq(files.filter((f) => !index.resolve(f.scenarios.card)).map((f) => f.path), [], "and every scenarios file names a card in the directory");
  eq(files.filter((f) => f.scenarios.schema !== SCENARIOS_SCHEMA || !(f.scenarios.scenarios ?? []).length).map((f) => f.path), [],
    `each is a ${SCENARIOS_SCHEMA} file with at least one scenario`);
  eq(files.flatMap((f) => Object.keys(f.scenarios.fixtures ?? {}).filter((n) => index.resolve(n)).map((n) => `${f.path}: ${n}`)), [],
    "no fixture stands in for a card the directory defines: a defined card is always played from its definition");
  let scenarios = 0, assertions = 0;
  for (const {scenarios: file} of files) {
    for (const scenario of file.scenarios) {
      const {passed} = runScenario(scenario, index.definition, file.fixtures ?? {});
      scenarios += 1;
      assertions += passed.length;
    }
  }
  ok(scenarios >= 25 && assertions >= 80, `${scenarios} scenarios played through the rules, ${assertions} assertions on what each seat sees, all passing`);
}

/* ---- 3. resolve, suggest, definition ---- */
{
  eq(index.resolve("KRENKOS COMMAND")?.name, "Krenko's Command", "a name resolves however it is typed: case and punctuation do not make another card");
  eq(index.resolve("Lightning Bólt")?.name, "Lightning Bolt", "nor do accents");
  eq(index.resolve("Lightning Bolt").oracleId, "4457ed35-7c10-48c8-9776-456485fdf070", "and it carries the oracle id it is matched by");
  eq(index.resolve("Black Lotus"), null, "a card with no definition resolves to nothing");
  eq(index.suggest("Lightnig Bolt"), ["Lightning Bolt"], "a misspelling is suggested its card");
  eq(index.suggest("Zzzzzzzzzzzz"), [], "and nonsense is suggested nothing");
  const first = index.definition("Wall of Omens");
  first.keywords.push("Flying");
  eq(index.definition("Wall of Omens").keywords, ["Defender"], "each definition is a fresh copy: a caller changing one changes nothing for the next game");
  eq(index.definition("Sol Ring").abilities, [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 2}, text: "{T}: Add {C}{C}."}],
    "\"{T}: Add {C}{C}\" compiles to a mana ability, which never uses the stack (CR 605.1a)");
  eq(index.definition("Mind Stone").abilities.map((a) => a.kind), ["mana", "activated"], "Mind Stone: one mana ability and one activated ability");
  eq(index.definition("Wall of Omens").abilities[0].trigger, {on: "GameEventCardChangeZone", to: "Battlefield", who: "self"},
    "\"When this creature enters\" compiles to the engine event trigger.mjs watches");
  eq(index.definition("Nyx-Fleece Ram").abilities[0].trigger, {on: "GameEventTurnPhase", phase: "UPKEEP", yourTurn: true}, "and \"at the beginning of your upkeep\" too");
  ok(index.definition("Lightning Bolt").spell.targets.length === 1, "a spell ability becomes the object's spell, with its targets");
}

/* ---- 4. refused by name: each written wrong on purpose ---- */
{
  const base = (abilities, types = ["Instant"]) => ({schema: SCRIPT_SCHEMA, identity: {name: "Probe", oracleId: "p", types, manaCost: "{1}"}, abilities});
  const problem = (script, re, message) => {
    const {definition, problems} = compileScript(script);
    ok(definition === null && problems.some((p) => re.test(p)), `${message} (${problems.join("; ")})`);
  };
  problem(base([{kind: "spell", text: "Exchange life totals with target player.", effects: [{effect: "exchangeLife"}]}]), /exchangeLife: declared, not built/, "a primitive declared and not built");
  problem(base([{kind: "keyword", text: "Equip {2}", keyword: "equip"}], ["Artifact"]), /Equip: declared, no behavior/, "a keyword with no behavior");
  /* (Batch 27 built "Discard a card"; the example of a cost nothing pays is now one that still is not.) */
  problem(base([{kind: "activated", text: "Exile a card from your graveyard: Draw a card.", cost: [{atom: "exileFromGraveyard"}], effects: [{effect: "draw"}]}], ["Artifact"]),
    /exileFromGraveyard: a cost atom nothing pays/, "a cost atom nothing pays yet");
  /* Batch 8 built "whenever this attacks": it compiles now, and a trigger still unbuilt is refused by name. */
  eq(compileScript(base([{kind: "triggered", text: "Whenever this attacks, draw.", trigger: {on: "attacks"}, effects: [{effect: "draw"}]}], ["Creature"])).problems, [],
    "\"whenever this attacks\" compiles");
  /* (Batch 29 built "life gained", batch 76 "becomes target" and batch 78 "life lost"; the example is now a trigger still
     unbuilt.) */
  eq(compileScript(base([{kind: "triggered", text: "Whenever this becomes the target of a spell, draw.", trigger: {on: "becomes target", spell: true}, effects: [{effect: "draw"}]}], ["Creature"])).problems, [],
    "\"whenever this becomes the target of a spell\" compiles");
  eq(compileScript(base([{kind: "triggered", text: "Whenever an opponent loses life, draw.", trigger: {on: "life lost", loser: "opponent"}, effects: [{effect: "draw"}]}], ["Creature"])).problems, [],
    "\"whenever an opponent loses life\" compiles");
  problem(base([{kind: "triggered", text: "Whenever you play a land, draw.", trigger: {on: "land played"}, effects: [{effect: "draw"}]}], ["Creature"]),
    /land played: a trigger the engine does not watch/, "a trigger the engine does not watch for");
  /* Batch 7 built "whenever another creature dies" (CR 603.10a): it compiles now, and a death watched for some other
     way is still refused by name. */
  const another = compileScript(base([{kind: "triggered", text: "Whenever another creature dies, gain 1.", trigger: {on: "dies", who: "another", filter: {types: ["Creature"]}},
    effects: [{effect: "gainLife", amount: 1}]}], ["Creature"]));
  eq([another.problems, another.definition?.abilities[0].trigger], [[], {on: "GameEventCardChangeZone", from: "Battlefield", to: "Graveyard", who: "another", filter: {types: ["Creature"]}}],
    "a death some other permanent's compiles to the departure the engine watches, its filter read as the thing last existed");
  problem(base([{kind: "triggered", text: "Whenever a creature an opponent controls dies, gain 1.", trigger: {on: "dies", who: "opponent"}, effects: [{effect: "gainLife", amount: 1}]}], ["Creature"]),
    /dies \(opponent\)/, "a death named some other way than this, another or any is refused by name");
  problem(base([{kind: "triggered", text: "Whenever another creature enters, gain 1.", trigger: {on: "enters", who: "another", filter: {kind: "creature"}},
    effects: [{effect: "gainLife", amount: 1}]}], ["Creature"]), /no key "kind"/, "an arrival filter the selector grammar refuses");
  /* Batch 7 built a mana ability that sacrifices another permanent (Skirk Prospector, Ashnod's Altar): it compiles, the
     sacrifice its own choice; one whose cost is a discard is still refused. */
  const goblin = compileScript(base([{kind: "activated", text: "Sacrifice a Goblin: Add {R}.", cost: [{atom: "sacrifice", selector: {subtypes: ["Goblin"]}}], effects: [{effect: "addMana", mana: {R: 1}}]}], ["Creature"]));
  eq([goblin.problems, goblin.definition?.abilities[0].kind, goblin.definition?.abilities[0].sacrifice], [[], "mana", {subtypes: ["Goblin"]}],
    "a mana ability whose cost is a sacrifice of another permanent compiles, what to sacrifice chosen as it is activated");
  problem(base([{kind: "activated", text: "Discard a card: Add {R}.", cost: [{atom: "discard"}], effects: [{effect: "addMana", mana: {R: 1}}]}], ["Creature"]),
    /mana ability the engine cannot run yet/, "a mana ability whose cost is a discard is refused");
  problem(base([{kind: "activated", text: "{T}: Add one mana of any color that a land an opponent controls could produce.", cost: [{atom: "{T}"}],
    effects: [{effect: "addMana", anyColor: "opponents-lands"}]}], ["Artifact"]), /mana ability the engine cannot run yet/,
    "a mana ability whose colors depend on another player's lands (Fellwar Stone)");
  problem(base([{kind: "spell", text: "Counter target spell.", targets: [{what: "spell"}], effects: [{effect: "counterSpell", targets: {target: 0}}]}]),
    /counterSpell: a script names the spell by `spells/, "a counterspell naming its spell by stack id, which no script can know");
  problem(base([]), /no spell ability/, "an instant that does nothing");
  problem(base([{kind: "spell", text: "a", effects: [{effect: "draw"}]}, {kind: "spell", text: "b", effects: [{effect: "draw"}]}]), /second spell ability/, "two spell abilities");
  problem({...base([]), identity: {name: "Probe", types: ["Instant"]}}, /oracleId/, "a script the schema refuses never becomes an object");
  const mixed = createCardIndex([base([{kind: "spell", text: "Exchange life totals with target player.", effects: [{effect: "exchangeLife"}]}])]);
  eq([mixed.resolve("Probe").playable, mixed.definition("Probe"), mixed.problems("Probe")], [false, null, ["exchangeLife: declared, not built"]],
    "a card the engine cannot play resolves, says so and why, and has no definition to seat");
  throws(() => createCardIndex([scripts[0], scripts[0]]), /Two definitions of/, "two definitions of one card are refused, by name and file");
  throws(() => createCardIndex([{schema: SCRIPT_SCHEMA, identity: {}, abilities: []}]), /has no name/, "and a nameless one");
}

/* ---- 5. the runner fails a wrong scenario ---- */
{
  const bolt = files.find((f) => f.scenarios.card === "Lightning Bolt").scenarios;
  const scenario = structuredClone(bolt.scenarios[1]);
  scenario.expect = [{seat: 1, life: 38}];
  throws(() => runScenario(scenario, index.definition, bolt.fixtures), /Maya is at 37 life, not 38/, "a wrong expectation fails, saying what was there");
  const illegal = structuredClone(bolt.scenarios[0]);
  /* No land to tap: since tap-and-cast (the plan's X8), a Mountain untapped would pay for it as it is cast. */
  illegal.setup = illegal.setup.map((entry) => ({...entry, cards: entry.cards.filter((name) => name !== "Mountain")}));
  illegal.steps = [{cast: "Lightning Bolt", targets: [{card: "Grizzly Bears"}]}];
  throws(() => runScenario(illegal, index.definition, bolt.fixtures), /not offered cast Lightning Bolt/, "a move the rules do not offer fails: no mana, no cast");
  throws(() => runScenario({name: "x", setup: [{seat: 0, zone: "hand", cards: ["Black Lotus"]}]}, index.definition), /no definition of Black Lotus/,
    "and a card the engine cannot play is refused by name");
}

/* ---- 6. the coverage document is today's ---- */
{
  const text = execFileSync(process.execPath, ["game/tools/engine-coverage.mjs"], {encoding: "utf8"});
  const doc = readFileSync(new URL("../docs/engine/coverage.md", import.meta.url), "utf8");
  ok(text.startsWith(doc), "docs/engine/coverage.md is what `node game/tools/engine-coverage.mjs --write` writes today");
  ok(doc.includes(`(${index.size} definitions in all)`) && /\| Rob's seven decks \| 477 \| \d+ \|/.test(doc), "and it counts the directory's definitions");
}

/* ---- 7. the most-played list ---- */
{
  const top = JSON.parse(readFileSync(new URL("../data/engine/top-cards.json", import.meta.url), "utf8"));
  const ids = new Set([...ORACLE.values()].map((c) => c.id));
  eq([top.schema, top.share, top.count, top.cards.length], ["CrankTopCards@1", 0.8, top.cards.length, top.count], "the most-played list says what it is: the 80% share, and how many cards");
  ok(top.cards.every((c, i) => i === 0 || top.cards[i - 1].appearances >= c.appearances), "most-played first");
  ok(top.cards.at(-1).cumulative >= 0.8 && top.cards.at(-2).cumulative < 0.8, "and exactly as many as make up 80% of every card appearance in Commander decks");
  eq(top.cards.filter((c) => !ids.has(c.oracleId)).map((c) => c.name), [], "every card on it is a card of the oracle data, by its oracle id: the card, never a print");
  eq(top.cards.slice(0, 3).map((c) => c.name), ["Sol Ring", "Command Tower", "Arcane Signet"], "led by the cards every deck plays");
}

/* ---- what the cloud table plays (M5; the plan review's C4) ----
   The Worker reads no file system, so the directory reaches it as game/engine/cards/definitions.mjs, generated from it:
   the module must be the directory as it stands, or a card merged today would not play at the table tomorrow. */
{
  eq(readFileSync(DEFINITIONS_MODULE, "utf8") === definitionsModule(), true,
    "game/engine/cards/definitions.mjs is the card directory as it stands (node game/tools/engine-definitions.mjs --write)");
  const playable = index.names.filter((n) => index.resolve(n)?.playable === true);
  eq([Object.keys(DEFINITIONS).length, playable.every((n) => JSON.stringify(tableDefinition(n)) === JSON.stringify(index.definition(n)))], [playable.length, true],
    "it holds every playable definition, each the same as the directory's");
  eq([tableDefinition("LIGHTNING BOLT")?.manaCost, tableDefinition("No Such Card")], ["{R}", null], "found by the same folded name, and nothing for a card it does not hold");
}

console.log(`engine-cards: ${checks} checks passed — ${index.size} definitions, each the card it claims to be, each played through the rules by its scenarios, and everything the engine cannot play refused by name.`);
