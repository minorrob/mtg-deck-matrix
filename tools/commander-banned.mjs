// The Commander banned list, by name, dated.
//
//   node tools/commander-banned.mjs            # write data/commander-banned.json
//   node tools/commander-banned.mjs --check    # fetch and compare with the committed file, write nothing
//
// WHY THIS FILE EXISTS (Linear ROB-104). The legality check (commander-legality.js) refuses a banned card by
// name before a table starts. data/commander-universe.json and the engine's oracle hold only legal cards, so a
// banned name is simply absent from them, and "absent" cannot be told from "too new" or "misspelled". Scryfall's
// `banned:commander` search answers the question outright: eighty-odd names today, Black Lotus to Nadu, the
// conspiracies and the ante cards among them. Small enough to ship, so the refusal names the rule offline.
//
// It is dated by its envelope's generatedAt, which the legality result repeats, so a reader can see how old the
// list is. tools/refresh.mjs runs it with the other data steps.
//
// curl, not fetch(): the same host-allowlist note graph/ingest/01-fetch.mjs carries.
import {readFile, writeFile} from "node:fs/promises";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {stamp} from "./lib/envelope.mjs";

const run = promisify(execFile);
const OUT = new URL("../data/commander-banned.json", import.meta.url);
const check = process.argv.includes("--check");
const QUERY = "banned:commander";

async function get(url) {
  const {stdout} = await run("curl", ["-sSL", "--fail", "--max-time", "45", url], {maxBuffer: 16 * 1024 * 1024});
  return JSON.parse(stdout);
}

const names = new Set();
let page = 1, more = true;
while (more) {
  const data = await get(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(QUERY)}&unique=cards&page=${page}`);
  for (const card of data.data || []) if (card.name) names.add(card.name);
  more = Boolean(data.has_more);
  page += 1;
  await new Promise((r) => setTimeout(r, 110));   // Scryfall asks for 50-100ms between calls
}
const cards = [...names].sort((a, b) => a.localeCompare(b));
console.log(`${cards.length} cards banned in Commander: ${cards.slice(0, 5).join(", ")}, …`);

if (check) {
  const committed = JSON.parse(await readFile(OUT, "utf8"));
  const gone = committed.cards.filter((n) => !names.has(n)), added = cards.filter((n) => !committed.cards.includes(n));
  if (gone.length || added.length) {
    console.log(`drift against the committed list (${committed.generatedAt}): ${added.length} added (${added.join(", ") || "none"}), ${gone.length} removed (${gone.join(", ") || "none"}). Run without --check to write.`);
    process.exit(1);
  }
  console.log(`matches data/commander-banned.json (${committed.generatedAt})`);
  process.exit(0);
}
await writeFile(OUT, JSON.stringify(stamp("commander-banned@1", "tools/commander-banned.mjs", {
  source: `Scryfall /cards/search q=${QUERY} unique=cards`,
  cards
}, {count: cards.length}), null, 1) + "\n", "utf8");
console.log("wrote data/commander-banned.json");
