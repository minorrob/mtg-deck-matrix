/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.

   THE CATALOG RULE: COMMANDER-LEGAL PAPER CARDS ONLY (Rob, 2026-10-29; Linear ROB-213; tools/catalog-rule.mjs).

     1. The rule. A card is in the catalog when Scryfall says Commander "legal", its name does not begin "A-" (an Arena
        rebalance), and it has a paper printing. The `digital` flag of an oracle_cards row is not the test: it describes
        the one printing Scryfall chose, and a real paper card can be represented by an MTGO printing.
     2. The loaders use it: tools/commander-universe.mjs and tools/build-engine-cards.mjs call `catalogProblem`.
     3. The committed catalogs hold to it: no "A-" card in the engine's oracle and support tables, the commander universe,
        or the graph.
     4. One card is known to break it and waits for the next refresh: "Name Sticker" Goblin, an MTGO-only Unfinity card
        Scryfall marks Commander-legal (found 2026-10-29: 32,116 legal, 32,115 with a paper printing). graph.json names its
        cards by position, which data/graph-played.json's 701,916 edges use, so it leaves with the graph's rebuild and not
        by hand. Until then it is the one exception, and this suite fails the day it is gone from a file or still named
        after the rebuild, so the exception cannot outlive its reason. The universe was rebuilt 2026-10-29 and has none;
        the graph and the engine's oracle and support tables still carry it.

     node tests/catalog-rule.mjs
*/
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {catalogProblem} from "../tools/catalog-rule.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const read = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));

/* ---- 1. the rule ---- */
const card = (name, commander, oracle_id) => ({name, oracle_id, legalities: {commander}});
const paper = new Set(["p1", "p2", "p3", "p4"]);
eq(catalogProblem(card("Palinchron", "legal", "p1"), paper), null, "a legal card with a paper printing is in, whatever printing Scryfall chose to stand for it");
eq(catalogProblem({...card("Palinchron", "legal", "p1"), digital: true, games: ["mtgo"]}, paper), null, "a digital-flagged row of a card that has a paper printing is still in (1,046 such cards)");
eq(catalogProblem(card("Sol Ring", "banned", "p2"), paper), "not Commander-legal", "a banned card is out");
eq(catalogProblem(card("Some Alchemy Card", "not_legal", "p3"), paper), "not Commander-legal", "a not_legal card is out");
eq(catalogProblem({name: "No Field", oracle_id: "p1"}, paper), "not Commander-legal", "a card with no legality field is out, not assumed in");
eq(catalogProblem(card("A-Rebalanced Card", "legal", "p4"), paper), "an Arena rebalanced (A-) card", "an A- card is out even if Scryfall called it legal and printed on paper");
eq(catalogProblem(card("Name Sticker Goblin", "legal", "d1"), paper), "no paper printing", "a Commander-legal card with no paper printing is out");
assert.throws(() => catalogProblem(card("Palinchron", "legal", "p1")), /paper printing/);
checks += 1;

/* ---- 2. the loaders use it ---- */
for (const file of ["tools/commander-universe.mjs", "tools/build-engine-cards.mjs"]) {
  const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  ok(/from "\.\/catalog-rule\.mjs"/.test(text) && /catalogProblem\(/.test(text) && /paperOracleIds\(/.test(text), `${file} applies the catalog rule`);
  ok(!/legalities\?\.commander\s*[!=]==\s*"legal"/.test(text), `${file} no longer filters on legality alone`);
}

/* ---- 3 and 4. the committed catalogs ---- */
const GOBLIN = {id: "acee1d16-1651-4e2c-8138-cc6456c4ee71", name: '"Name Sticker" Goblin'};
const oracle = read("data/engine/oracle.json").cards, support = read("data/engine/support.json").cards;
const universe = read("data/commander-universe.json").cards.map((r) => ({name: r[0]}));
const graph = read("data/graph.json").cards;
const files = {"data/engine/oracle.json": oracle, "data/engine/support.json": support, "data/commander-universe.json": universe, "data/graph.json": graph};
/* The universe was rebuilt on 2026-10-29 and no longer has it (32,116 -> 32,115). The graph and the engine's tables wait
   for their own rebuilds; the day one of them is 0, move it into `rebuilt`, and when all are, delete the exception. */
const rebuilt = new Set(["data/commander-universe.json"]);
for (const [file, rows] of Object.entries(files)) {
  eq(rows.filter((c) => /^A-/.test(c.name)).map((c) => c.name), [], `${file}: no A- card`);
  const goblins = rows.filter((c) => c.name === GOBLIN.name).length;
  if (rebuilt.has(file)) eq(goblins, 0, `${file}: was rebuilt under the catalog rule, so ${GOBLIN.name} is gone`);
  else eq(goblins, 1, `${file}: the one known exception, ${GOBLIN.name}, is still here, awaiting the rebuild (the day this is 0, move it into \`rebuilt\`)`);
}
eq(oracle.find((c) => c.name === GOBLIN.name).id, GOBLIN.id, "the exception is the card Scryfall lists with no paper printing, by oracle id");

console.log(`catalog-rule: ${checks} checks passed -- Commander-legal paper cards only; the loaders apply the rule; no A- card in the committed catalogs; one MTGO-only card is known and waits for the rebuild.`);
