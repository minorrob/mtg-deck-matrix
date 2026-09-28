#!/usr/bin/env node
/* THE MIGRATION, PRINTED BEFORE IT RUNS (docs/plan-groups.md §4, "Safety"). A library saved by an older build is
 * migrated the moment the app opens it; this shows, counted, what that will change -- on Rob's real library by
 * default -- without writing anything.
 *
 *   node tools/migrate-dry-run.mjs [backup.json]      default data/live-state.json
 *   node tools/migrate-dry-run.mjs --json [file]      the same, as JSON
 *
 * It reads a CrankMagic backup ({payload: {state}}) or a bare library state, runs the model's own migrate() and
 * validate(), and compares group by group, copy by copy and deck by deck. Nothing is written. */
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const M = createRequire(import.meta.url)(path.join(ROOT, "collection-model.js"));
const args = process.argv.slice(2), asJson = args.includes("--json");
const file = args.find((a) => !a.startsWith("--")) || path.join(ROOT, "data", "live-state.json");

export function dryRun(raw) {
  const before = raw && raw.payload && raw.payload.state ? raw.payload.state : raw;
  if (!before || typeof before.schemaVersion !== "number") throw Error("Not a CrankMagic library: no schemaVersion.");
  if (before.schemaVersion === M.VERSION) return {from: before.schemaVersion, to: M.VERSION, changes: [], counts: {}, note: "Already the current schema; nothing to migrate."};
  const after = M.migrate(before);
  M.validate(after);
  const changes = [], counts = {};
  const tally = (k) => { counts[k] = (counts[k] || 0) + 1; };
  const was = new Map(before.groups.map((g) => [g.id, g])), now = new Map(after.groups.map((g) => [g.id, g]));
  for (const [id, g] of was) if (!now.has(id)) { changes.push(`group removed: ${g.name} (${id})`); tally("groups removed"); }
  for (const [id, g] of now) {
    if (!was.has(id)) { changes.push(`group added: ${g.name} (${id}) as ${M.TEMPLATE_LABELS[g.template] || g.template}`); tally("groups added"); continue; }
    const old = was.get(id);
    if (old.template !== g.template) { changes.push(`group ${g.name}: ${old.template ? M.TEMPLATE_LABELS[old.template] : "no template"} → ${M.TEMPLATE_LABELS[g.template]}`); tally(`groups → ${M.TEMPLATE_LABELS[g.template]}`); }
  }
  const lotsBefore = new Map(before.lots.map((l) => [l.id, JSON.stringify(l)]));
  for (const l of after.lots) if (lotsBefore.get(l.id) !== JSON.stringify(l)) { changes.push(`copy changed: ${l.id}`); tally("copies changed"); }
  if (after.lots.length !== before.lots.length) { changes.push(`copies: ${before.lots.length} → ${after.lots.length}`); tally("copy count changed"); }
  const decksBefore = new Map(before.decks.map((d) => [d.id, JSON.stringify(d)]));
  for (const d of after.decks) if (decksBefore.get(d.id) !== JSON.stringify(d)) { changes.push(`deck changed: ${d.name}`); tally("decks changed"); }
  return {from: before.schemaVersion, to: after.schemaVersion, changes, counts,
    kept: {copies: after.lots.length, decks: after.decks.length, groups: after.groups.length}};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = dryRun(JSON.parse(readFileSync(file, "utf8")));
  if (asJson) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`${path.relative(ROOT, file) || file}: schema ${report.from} → ${report.to}${report.note ? ` — ${report.note}` : ""}`);
    for (const c of report.changes) console.log(`  ${c}`);
    for (const [k, n] of Object.entries(report.counts)) console.log(`  ${n} × ${k}`);
    if (report.kept) console.log(`  kept: ${report.kept.copies} copies, ${report.kept.decks} decks, ${report.kept.groups} groups; nothing written`);
  }
}
