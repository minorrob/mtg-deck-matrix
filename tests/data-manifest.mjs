/* THE MANIFEST IS TRUE, AND THE SHARDING RULE HOLDS. data/manifest.json is generated from the
 * registry by tools/data-manifest.mjs; this suite pins that its hashes are the files' hashes,
 * that every data URL the asset map serves is in it under the same ?v=, that every file the
 * worker precaches is in it as precached, and recommendation 16's rule for a static site: no
 * precached data file over 5 MB, and any served file over 5 MB is fetched on demand and named
 * in the registry as large -- the two graph files today, split by a stable key when the Trace
 * needs it. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import path from "node:path";
import {createRequire} from "node:module";
import {ROOT, REGISTRY, readData} from "../schema/index.mjs";

const require = createRequire(import.meta.url);
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const manifest = readData("data/manifest.json");
const byFile = new Map(manifest.files.map((f) => [f.file, f]));

for (const f of manifest.files) {
  const bytes = readFileSync(path.join(ROOT, f.file));
  ok(createHash("sha256").update(bytes).digest("hex") === f.sha256 && bytes.length === f.bytes, `${f.file}: the manifest's hash and size are the file's`);
}
const assets = require(path.join(ROOT, "crankmagic-assets.js"));
for (const url of Object.values(assets).filter((v) => typeof v === "string" && /^(data|sim)\//.test(v))) {
  const [file, q] = url.split("?"); const version = Number((q || "").match(/v=(\d+)/)?.[1]) || null;
  const m = byFile.get(file);
  ok(m && m.served && m.version === version, `${url} is in the manifest under the same version`);
}
const sw = readFileSync(path.join(ROOT, "crankmagic-sw.js"), "utf8");
const listed = (name) => { const m = sw.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`)); const out = []; if (m) for (const x of m[1].matchAll(/'([^'?]+)(?:\?[^']*)?'/g)) out.push(x[1]); return out; };
for (const file of listed("DATA")) ok(byFile.get(file)?.cache === "precached", `${file} is precached by the worker and the manifest says so`);
for (const file of listed("RUNTIME")) ok(byFile.get(file)?.cache === "on demand", `${file} is fetched on demand and the manifest says so`);

/* Recommendation 16: the sharding rule. */
const LIMIT = 5 * 1024 * 1024;
for (const f of manifest.files.filter((f) => f.cache === "precached")) ok(f.bytes <= LIMIT, `${f.file} is precached and under 5 MB (${(f.bytes / 1e6).toFixed(1)} MB)`);
for (const f of manifest.files.filter((f) => f.served && f.bytes > LIMIT)) {
  const entry = REGISTRY.find((r) => r.file === f.file);
  ok(f.cache === "on demand" && entry && entry.large, `${f.file} is over 5 MB, so it is fetched on demand and the registry names it large (${entry && entry.large})`);
}
const named = REGISTRY.filter((r) => r.large).map((r) => r.file);
assert.deepEqual(named.sort(), manifest.files.filter((f) => f.served && f.bytes > LIMIT).map((f) => f.file).sort(), "the registry names exactly the served files over 5 MB as large"); checks++;

console.log(`data-manifest: ${checks} checks passed — ${manifest.files.length} files hashed, ${manifest.files.filter((f) => f.served).length} served, the sharding rule holds (${named.length} large on-demand files).`);
