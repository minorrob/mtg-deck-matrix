// Turns the cached EDHREC pages into PLAYED_WITH edges.
//
//   node graph/ingest/05-build-edhrec-csv.mjs
//
// A NOTE ON THE ONE CARD-TO-CARD EDGE IN THIS MODEL. Everywhere else a card links
// to an Event or a Resource, never to another card, because authored pairs do not
// scale and do not generalise. This edge is different in kind: it is measured, not
// authored -- EDHREC's aggregate over a very large number of real decklists -- and
// it is scoped to a commander, which is what makes it meaningful. Nobody typed it,
// and it updates when the format does.
//
// inclusion = num_decks / potential_decks, the share of that commander's decks
//             running the card.
// synergy   = EDHREC's own figure: inclusion here minus inclusion in comparable
//             decks. Positive means the pairing is specific to this commander
//             rather than a card everyone in these colors plays anyway.
import {readdir, readFile, writeFile, mkdir} from "node:fs/promises";

const cacheDir = "graph/.cache/edhrec";
const outDir = "graph/.import";
const csv = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

const cardsCsv = await readFile(`${outDir}/cards.csv`, "utf8");
const idByName = new Map();
for (const line of cardsCsv.split("\n").slice(1)) {
  if (!line) continue;
  const m = line.match(/^([^,]+),("(?:[^"]|"")*"|[^,]*),/);
  if (!m) continue;
  idByName.set(m[2].replace(/^"|"$/g, "").replace(/""/g, '"'), m[1]);
}

const rows = [];
let pages = 0, unmatched = 0;
for (const file of (await readdir(cacheDir)).filter((f) => f.endsWith(".json"))) {
  const page = JSON.parse(await readFile(`${cacheDir}/${file}`, "utf8"));
  const commander = page.container?.json_dict?.card?.name || page.card?.name;
  const cmdId = idByName.get(commander);
  if (!cmdId) { unmatched++; continue; }
  pages++;
  for (const list of page.container?.json_dict?.cardlists || []) {
    for (const view of list.cardviews || []) {
      const id = idByName.get(view.name);
      if (!id || id === cmdId) continue;
      const num = Number(view.num_decks || 0), pot = Number(view.potential_decks || 0);
      rows.push([cmdId, id, commander, view.name, list.header || "",
                 num, pot, pot ? (num / pot).toFixed(4) : "", Number(view.synergy || 0).toFixed(4)]);
    }
  }
}
await mkdir(outDir, {recursive: true});
const header = ["commanderId","cardId","commander","card","category","numDecks","potentialDecks","inclusion","synergy"];
await writeFile(`${outDir}/played_with.csv`,
  [header.join(","), ...rows.map((r) => r.map(csv).join(","))].join("\n") + "\n");
console.log(`${pages} commander pages -> ${rows.length.toLocaleString()} PLAYED_WITH edges${unmatched ? ` (${unmatched} pages had no matching Card node)` : ""}`);
