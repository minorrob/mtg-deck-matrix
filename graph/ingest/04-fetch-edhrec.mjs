// Pulls EDHREC's per-commander aggregates. This is the empirical half of the
// model: where oracle text says what a card COULD do, EDHREC says what people
// actually play alongside a given commander, across a very large sample.
//
//   node graph/ingest/04-fetch-edhrec.mjs                    # commanders in your decks
//   node graph/ingest/04-fetch-edhrec.mjs --all              # every commander in variants.json too
//   node graph/ingest/04-fetch-edhrec.mjs --name "Krenko, Mob Boss"
//
// Cached on disk and rate limited. EDHREC serves this for free; do not hammer it.
import {mkdir, readFile, writeFile, access} from "node:fs/promises";

const cacheDir = arg("--cache") || "graph/.cache/edhrec";
const DELAY_MS = Number(arg("--delay") || 350);
function arg(f) { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Node's fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY is set, and behind a
// proxy that shows up as a flat 403 rather than a connection error -- which reads
// like EDHREC refusing us. Try fetch, fall back to curl, which reads the env vars
// itself. On a machine with no proxy the first path is taken and this is inert.
async function getJson(url) {
  try {
    const res = await fetch(url);
    if (res.ok) return {ok: true, json: await res.json()};
    if (!process.env.HTTPS_PROXY && !process.env.https_proxy) return {ok: false, status: res.status};
  } catch { /* fall through to curl */ }
  const {execFile} = await import("node:child_process");
  const {promisify} = await import("node:util");
  try {
    const {stdout} = await promisify(execFile)("curl",
      ["-sS", "-L", "--max-time", "30", "--fail", url], {maxBuffer: 64 * 1024 * 1024});
    return {ok: true, json: JSON.parse(stdout)};
  } catch (err) {
    return {ok: false, status: err.code ?? "curl-failed"};
  }
}

export function slugify(name) {
  return name.toLowerCase().replace(/'/g, "").replace(/[,.]/g, "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function commanderNames() {
  const explicit = arg("--name");
  if (explicit) return [explicit];
  const master = JSON.parse(await readFile("data/master-v2.json", "utf8"));
  const names = new Set(Object.values(master.decks || {}).map((d) => d.commander).filter(Boolean));
  for (const c of master.cards) if (c.purpose === "Commander") names.add(c.name);
  if (process.argv.includes("--all")) {
    const variants = JSON.parse(await readFile("data/variants.json", "utf8"));
    for (const v of variants.variants) if (v.commander) names.add(v.commander);
  }
  return [...names];
}

await mkdir(cacheDir, {recursive: true});
const names = await commanderNames();
console.log(`${names.length} commanders`);
let hit = 0, miss = 0, fail = 0;
for (const name of names) {
  const slug = slugify(name);
  const file = `${cacheDir}/${slug}.json`;
  try { await access(file); hit++; continue; } catch { /* not cached */ }
  const res = await getJson(`https://json.edhrec.com/pages/commanders/${slug}.json`);
  if (!res.ok) { console.log(`  MISS ${res.status}  ${name} (${slug})`); fail++; await sleep(DELAY_MS); continue; }
  await writeFile(file, JSON.stringify(res.json));
  miss++;
  process.stdout.write(`  ok  ${name}\n`);
  await sleep(DELAY_MS);
}
console.log(`cached ${hit}, fetched ${miss}, failed ${fail}`);
