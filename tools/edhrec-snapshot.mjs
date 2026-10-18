// A dated snapshot of what EDHREC says people play with a list of commanders, for the reasonableness report.
//
//   node tools/edhrec-snapshot.mjs --out tests/fixtures/edhrec-reference.json "Krenko, Mob Boss" "Atraxa, Praetors' Voice" …
//
// WHY (Linear ROB-112). The reasonableness report compares a deck the app builds from criteria with what people
// actually play for the same commander. EDHREC publishes that per commander (json.edhrec.com; edhrec-client.js reads
// it: inclusion, how many of the commander's decks run a card; synergy, how much more than color-matched decks in
// general). The report must run in CI on cached data, so this writes the cache: for each commander, every card the
// page lists with its inclusion and synergy, and the top ninety-nine by inclusion as a reference hundred. The file
// carries its date; a report says which date it compared against.
//
// curl, not fetch(): the same host-allowlist note graph/ingest/01-fetch.mjs carries.
import {writeFile} from "node:fs/promises";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {createRequire} from "node:module";
import {stamp} from "./lib/envelope.mjs";

const require = createRequire(import.meta.url);
const Edhrec = require("../edhrec-client.js");
const run = promisify(execFile);
const args = process.argv.slice(2);
const at = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const out = at("--out");
if (!out) { console.error("usage: node tools/edhrec-snapshot.mjs --out <file> name ..."); process.exit(2); }
const names = [];
for (let i = 0; i < args.length; i++) { if (args[i].startsWith("--")) { i++; continue; } names.push(args[i]); }

async function get(url) {
  const {stdout} = await run("curl", ["-sSL", "--fail", "--max-time", "45", url], {maxBuffer: 32 * 1024 * 1024});
  return JSON.parse(stdout);
}

const commanders = {};
for (const name of names) {
  let got = null;
  for (const slug of Edhrec.slugCandidates(name)) {
    try { got = {slug, payload: await get(`${Edhrec.BASE}${slug}.json`)}; break; } catch (e) { /* the next spelling */ }
  }
  if (!got) { console.log(`${name}: no EDHREC page`); commanders[name] = null; continue; }
  const parsed = Edhrec.parse(got.payload);
  const rows = [...parsed.cards.values()].map((r) => ({name: r.name, inclusion: r.inclusion, synergy: r.synergy, decks: r.decks, tags: Object.keys(r.tags || {})}));
  const top = rows.slice().sort((a, b) => (b.inclusion || 0) - (a.inclusion || 0) || b.decks - a.decks).slice(0, 99).map((r) => r.name);
  const card = got.payload.container && got.payload.container.json_dict && got.payload.container.json_dict.card;
  commanders[name] = {slug: got.slug, decks: card && Number.isFinite(card.num_decks) ? card.num_decks : null, lists: parsed.lists, rows, top};
  console.log(`${name}: ${rows.length} cards, top ${top.length} (${top.slice(0, 5).join(", ")}, …)`);
  await new Promise((r) => setTimeout(r, 400));
}
await writeFile(out, JSON.stringify(stamp("edhrec-reference@1", "tools/edhrec-snapshot.mjs", {
  source: "json.edhrec.com /pages/commanders/<slug>.json via edhrec-client.js parse(): inclusion and synergy per card; top 99 by inclusion as the reference list",
  commanders
}, {count: Object.values(commanders).filter(Boolean).length}), null, 1) + "\n", "utf8");
console.log(`wrote ${out}`);
