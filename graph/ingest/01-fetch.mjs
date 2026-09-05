// Pulls Scryfall's bulk files. Oracle cards is one row per distinct card (not per
// printing), which is the grain the Card node wants; oracle tags is the community
// tagger's functional vocabulary, which is a second opinion on what a card does.
//
//   node graph/ingest/01-fetch.mjs [--out graph/.cache]
import {mkdir, writeFile} from "node:fs/promises";
import {createWriteStream} from "node:fs";
import {pipeline} from "node:stream/promises";
import {createGunzip} from "node:zlib";
import {Readable} from "node:stream";

const outDir = argValue("--out") || "graph/.cache";
const WANT = ["oracle_cards", "oracle_tags"];

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
}

await mkdir(outDir, {recursive: true});
const manifest = await (await fetch("https://api.scryfall.com/bulk-data")).json();
for (const entry of manifest.data.filter((d) => WANT.includes(d.type))) {
  const target = `${outDir}/${entry.type}.jsonl`;
  process.stdout.write(`${entry.type}: ${(entry.compressed_size / 1e6).toFixed(1)} MB gz -> ${target}\n`);
  const res = await fetch(entry.jsonl_download_uri);
  if (!res.ok) throw new Error(`${entry.type}: HTTP ${res.status}`);
  // The URI serves gzip; decompress on the way to disk so the loaders read plain JSONL.
  await pipeline(Readable.fromWeb(res.body), createGunzip(), createWriteStream(target));
}
await writeFile(`${outDir}/fetched-at.txt`, new Date().toISOString() + "\n");
console.log("done");
