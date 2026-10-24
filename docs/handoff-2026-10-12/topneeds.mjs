// The most-played undefined cards of the 80% set, in play order, with what each still needs. Usage: node topneeds.mjs <repo> <n> <out.json> [demand-rows.json]
// Given the card_demand rows (game/tools/card-demand.mjs says how to read them), the cards players asked for come first.
import {readFileSync, writeFileSync} from "node:fs";
const [,, root, n, out, demandRows] = process.argv;
const {loadCardScripts} = await import(root + "/game/tools/engine-cards.mjs");
const {createCardIndex} = await import(root + "/game/engine/cards/index.mjs");
const {missingFor} = await import(root + "/game/tools/engine-constructs.mjs");
const dir = createCardIndex(loadCardScripts().map((e) => ({...e, source: "hand"})));
const inv = JSON.parse(readFileSync(root + "/game/docs/engine-inventory.json", "utf8"));
const top = JSON.parse(readFileSync(root + "/data/engine/top-cards.json", "utf8")).cards;
const rows = [];
for (const [i, c] of top.entries()) {
  const name = typeof c === "string" ? c : c.name;
  if (dir.resolve(name)?.playable === true) continue;
  const card = inv.top.perCard[name];
  rows.push({rank: i, name, missing: card ? missingFor(card).map((g) => `${g.kind}:${g.name}`) : ["(not in inventory)"]});
}
if (demandRows) {
  const {readRows, rankDemand, waveOrder} = await import(root + "/game/tools/card-demand.mjs");
  const demand = rankDemand(readRows(JSON.parse(readFileSync(demandRows, "utf8"))), {playable: (name) => dir.resolve(name)?.playable === true});
  const needs = (name) => {const card = inv.top.perCard[name]; return {missing: card ? missingFor(card).map((g) => `${g.kind}:${g.name}`) : ["(not in inventory)"]};};
  rows.splice(0, rows.length, ...waveOrder(demand, rows, {extra: needs}));
  console.log("demanded first", demand.length);
}
writeFileSync(out, JSON.stringify(rows, null, 1));
console.log("undefined", rows.length, "every rule", rows.filter((r) => r.missing.length === 0).length);
for (const r of rows.slice(0, Number(n))) console.log(r.demand ? `${r.demand.decks} decks` : r.rank, r.name, "|", r.missing.join(", ") || "every rule");
