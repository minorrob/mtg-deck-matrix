/* THE DATA MANIFEST. data/manifest.json is the inventory's data, machine-readable: for every
 * registered data file -- the ones the app serves and the ones a workflow writes -- its schema
 * id, its stamp, its generator, its size, its SHA-256 and the ?v= the asset map serves it
 * under, plus whether the worker precaches it or fetches it on demand. The suites compare the
 * asset map and the worker's lists against it; a sidebar or a future server can read it
 * instead of opening every file. Generated from schema/index.mjs, which stays the registry.
 *
 *   node tools/data-manifest.mjs            write data/manifest.json
 *   node tools/data-manifest.mjs --check    rebuild in memory and compare, stamp aside */
import {readFileSync, writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import path from "node:path";
import {createRequire} from "node:module";
import {stamp} from "./lib/envelope.mjs";
import {REGISTRY, ROOT, STAMPS, report, readData} from "../schema/index.mjs";

const OUT = "data/manifest.json";
const check = process.argv.includes("--check");
const require = createRequire(import.meta.url);
const assets = require(path.join(ROOT, "crankmagic-assets.js"));
const versions = new Map(Object.values(assets).filter((v) => typeof v === "string").map((v) => [v.split("?")[0], Number((v.match(/[?&]v=(\d+)/) || [])[1]) || null]));
const sw = readFileSync(path.join(ROOT, "crankmagic-sw.js"), "utf8");
const listed = (name) => { const m = sw.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`)); const out = []; if (m) for (const x of m[1].matchAll(/'([^'?]+)(?:\?[^']*)?'/g)) out.push(x[1]); return out; };
const precached = new Set(listed("DATA")), onDemand = new Set(listed("RUNTIME"));

const files = REGISTRY.filter((r) => r.file !== OUT).map((r) => {
  const text = readFileSync(path.join(ROOT, r.file));
  const data = JSON.parse(text.toString("utf8"));
  const at = STAMPS.find((k) => k in data);
  return {
    file: r.file, schema: data.schema || null, stamp: at ? data[at] : null, generator: data.generator || null,
    bytes: text.length, sha256: createHash("sha256").update(text).digest("hex"),
    version: versions.get(r.file) ?? null, served: versions.has(r.file),
    cache: precached.has(r.file) ? "precached" : onDemand.has(r.file) ? "on demand" : r.file === "data/live-state.json" ? "fetched by Load Live" : "not served",
  };
});
const out = stamp("manifest@1", "tools/data-manifest.mjs", {files}, {count: files.length});

if (check) {
  let prior = null; try { prior = readData(OUT); } catch { console.error(`${OUT} is missing; run node tools/data-manifest.mjs`); process.exit(1); }
  const strip = (o) => JSON.stringify({...o, generatedAt: null});
  if (strip(prior) !== strip(out)) {
    const stale = out.files.filter((f) => { const p = (prior.files || []).find((x) => x.file === f.file); return !p || p.sha256 !== f.sha256 || p.version !== f.version || p.cache !== f.cache; }).map((f) => f.file);
    console.error(`${OUT} is stale for: ${stale.join(", ") || "the file list"}. Run node tools/data-manifest.mjs.`); process.exit(1);
  }
  process.exit(report(OUT, prior) ? 0 : 1);
}
writeFileSync(path.join(ROOT, OUT), JSON.stringify(out, null, 1) + "\n");
console.log(`wrote ${OUT}: ${files.length} files, ${files.filter((f) => f.served).length} served, ${files.filter((f) => f.cache === "precached").length} precached, ${files.filter((f) => f.cache === "on demand").length} on demand.`);
