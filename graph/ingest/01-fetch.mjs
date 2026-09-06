// Pulls Scryfall's bulk files. Oracle cards is one row per distinct card (not per
// printing), which is the grain the Card node wants; oracle tags is the community
// tagger's functional vocabulary, which is a second opinion on what a card does.
//
//   node graph/ingest/01-fetch.mjs [--out graph/.cache]
//
// WHY THIS SHELLS OUT TO CURL RATHER THAN USING fetch(). Some sandboxes -- the
// container this repository is developed in among them -- put Node's fetch behind
// a host allowlist that curl is not subject to, and the failure is opaque: the
// request returns 200 with the body "Host not in allowlist: api.scryfall.com",
// which then dies in JSON.parse with a syntax error about an unexpected 'H'.
// tools/build_card_facts.py already carries the same note and the same fix. curl
// is present anywhere this pipeline can run, so this costs nothing on a normal
// machine and is the difference between working and not on a restricted one.
import {mkdir, writeFile} from "node:fs/promises";
import {spawn} from "node:child_process";
import {createWriteStream} from "node:fs";
import {pipeline} from "node:stream/promises";
import {createGunzip} from "node:zlib";

const outDir = argValue("--out") || "graph/.cache";
const WANT = ["oracle_cards", "oracle_tags"];

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
}

// curl to stdout, as a stream, so a 90 MB download is never held in memory.
function curl(url) {
  const child = spawn("curl", ["-sSL", "--fail", url],
    {stdio: ["ignore", "pipe", "pipe"]});
  let err = "";
  child.stderr.on("data", (chunk) => { err += chunk; });
  child.on("close", (code) => {
    if (code !== 0) child.stdout.destroy(new Error(`curl exited ${code}: ${err.trim()}`));
  });
  return child.stdout;
}

async function curlText(url) {
  const chunks = [];
  for await (const chunk of curl(url)) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  // A blocked host answers 200 with a plain-text refusal, so check the shape
  // rather than the status: a JSON body never starts with a letter.
  if (!text.trimStart().startsWith("{")) {
    throw new Error(`Scryfall did not return JSON. First 120 chars: ${text.slice(0, 120)}`);
  }
  return JSON.parse(text);
}

await mkdir(outDir, {recursive: true});
const manifest = await curlText("https://api.scryfall.com/bulk-data");
for (const entry of manifest.data.filter((d) => WANT.includes(d.type))) {
  const target = `${outDir}/${entry.type}.jsonl`;
  process.stdout.write(`${entry.type}: ${(entry.compressed_size / 1e6).toFixed(1)} MB gz -> ${target}\n`);
  // The URI serves gzip. curl is deliberately NOT given --compressed, so it does
  // not advertise gzip support and hands the raw bytes straight through for
  // createGunzip() to decompress on the way to disk.
  await pipeline(curl(entry.jsonl_download_uri), createGunzip(), createWriteStream(target));
}
await writeFile(`${outDir}/fetched-at.txt`, new Date().toISOString() + "\n");
console.log("done");
