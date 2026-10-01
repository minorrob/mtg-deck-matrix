/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* DEFINITIONS WRITTEN IN A SESSION, HELD TO THE LOADER'S CHECKS (game/tools/engine-ingest.mjs).
 *
 * Rob, 2026-10-01: the most-played cards pre-loaded, with few needing his API. A definition written in a Claude Code
 * session is checked as the loader checks its own -- schema, fidelity to the card's text, a smoke game -- and what
 * passes is stored PROVISIONAL in the loader's own shape and place, marked as written in a session and not read back
 * by a second model. A hand-authored definition wins; a card already learned for the same text is not learned again.
 */
import assert from "node:assert/strict";
import {ingestCards, SESSION_SCHEMA} from "../game/tools/engine-ingest.mjs";
import {COMPILED_SCHEMA, oracleHash} from "../game/engine/cards/compile.mjs";
import {createCardIndex} from "../game/engine/cards/index.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const card = (name, text, type = "Artifact", mana = "{2}", extra = {}) => ({id: `id-${name.toLowerCase().replace(/[^a-z]/g, "")}`, name, type, mana, text, colors: [], ci: [], power: null, toughness: null, ...extra});
const ROCK = card("Test Rock", "{T}: Add {C}{C}.");
const BOLT = card("Test Bolt", "Test Bolt deals 3 damage to any target.", "Instant", "{R}", {colors: ["R"], ci: ["R"]});
const HAND = card("Lightning Bolt", "Lightning Bolt deals 3 damage to any target.", "Instant", "{R}");
const oracle = new Map([ROCK, BOLT, HAND].map((c) => [c.name, c]));
const index = loadCardIndex().definition;
const fresh = () => ({schema: "CrankOnboardingLedger@1", cards: {}});
const rockAbilities = [{kind: "activated", text: "{T}: Add {C}{C}.", mana: true, cost: [{atom: "{T}"}], effects: [{effect: "addMana", mana: {C: 2}}]}];
const anyTarget = [{anyOf: [{what: "permanent", types: ["Creature"]}, {what: "permanent", types: ["Planeswalker"]}, {what: "permanent", types: ["Battle"]}, {what: "player"}]}];

{
  const ledger = fresh(), written = [];
  const results = ingestCards({cards: [{name: "Test Rock", abilities: rockAbilities}], writer: "claude-code-session", oracle, hand: new Set(), index, ledger,
    write: (id, record) => written.push([id, record]), now: () => "2026-10-01T00:00:00Z"});
  eq(results.map((r) => r.outcome), ["provisional"], "a definition that passes schema, fidelity and its smoke game is stored provisional");
  const [[id, record]] = written;
  eq([id, record.schema, record.status, record.oracleHash, record.models, record.checks.readBack, record.checks.fidelity],
    [ROCK.id, COMPILED_SCHEMA, "provisional", oracleHash(ROCK), {writer: "claude-code-session", readBack: null}, "not run", "pass"],
    "in the loader's own shape, marked as written in a session and not read back by a second model");
  eq([ledger.cards[ROCK.id].status, ledger.cards[ROCK.id].model, ledger.cards[ROCK.id].cost], ["provisional", "claude-code-session", 0], "the ledger records it, at no cost to anyone's key");
  const loaded = createCardIndex([{script: record.script, source: "compiled", status: record.status}]);
  eq([loaded.resolve("Test Rock").playable, loaded.definition("Test Rock").abilities[0].kind], [true, "mana"], "and the card directory reads the stored script as a playable card");
  const again = ingestCards({cards: [{name: "Test Rock", abilities: rockAbilities}], writer: "claude-code-session", oracle, hand: new Set(), index, ledger});
  eq(again.map((r) => r.outcome), ["already learned"], "the same card for the same text is not learned twice");
}
{
  const ledger = fresh();
  const results = ingestCards({cards: [{name: "Test Bolt", abilities: [{kind: "spell", text: "Test Bolt deals 4 damage to any target.", targets: anyTarget,
    effects: [{effect: "dealDamage", amount: 4, targets: {target: 0}, who: {target: 0}}]}]}], writer: "s", oracle, hand: new Set(), index, ledger});
  eq([results[0].outcome, results[0].stage], ["failed", "fidelity"], "a definition that changed the card's words is refused at fidelity");
  ok(results[0].problems.some((p) => /not a sentence of the card/.test(p)), "naming the sentence it invented");
}
{
  const results = ingestCards({cards: [{name: "Lightning Bolt", abilities: []}, {name: "No Such Card", abilities: []}], writer: "s", oracle, hand: new Set(["Lightning Bolt"]), index, ledger: fresh()});
  eq(results.map((r) => r.outcome), ["hand-authored", "no oracle card"], "a hand-authored card is never overwritten, and a name the oracle does not know is not guessed");
}
{
  const results = ingestCards({cards: [{name: "Test Rock", abilities: [{kind: "activated", text: "{T}: Add {C}{C}.", cost: [{atom: "{T}"}]}]}], writer: "s", oracle, hand: new Set(), index, ledger: fresh()});
  eq([results[0].outcome, results[0].stage], ["failed", "schema"], "a definition the schema refuses is refused at schema");
}
eq(SESSION_SCHEMA, "CrankSessionScripts@1", "the session file's schema name");

console.log(`engine-ingest: ${checks} checks passed — a session-written definition stored provisional only after schema, fidelity and its smoke game, in the loader's shape, never over a hand-authored card.`);
