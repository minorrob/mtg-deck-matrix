/* THE REGISTRY: every generated or hand-maintained data file the app serves or a workflow
 * writes, the schema id it must carry, the tool that produces it, the tool whose --check
 * vouches for it, and the collection its `count` counts. tests/schemas.mjs validates each
 * file against schema/<name>.json and the four envelope facts; tests/generators.mjs
 * asserts every checkedBy is actually run. A new data file is registered here first. */
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {validate} from "./validate.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const HAND = "hand-maintained";
export const STAMPS = ["generatedAt", "compiledAt", "savedAt", "createdAt", "amplifiersAt", "updatedAt", "revision"];

export const REGISTRY = [
  {file: "data/cards.json", id: "cards@2", generator: "tools/build-card-records.mjs", checkedBy: "tools/build-card-records.mjs", main: "cards"},
  {file: "data/card-facts.json", id: "card-facts@1", generator: "tools/build-card-records.mjs", checkedBy: "tools/build-card-records.mjs", main: "cards"},
  {file: "data/commander-universe.json", id: "commander-universe@1", generator: "tools/commander-universe.mjs", checkedBy: "tools/commander-universe.mjs", main: "cards"},
  {file: "data/commander-ranks.json", id: "commander-ranks@1", generator: "tools/commander-ranks.mjs", checkedBy: "tools/commander-ranks.mjs", main: "cards"},
  {file: "data/flavor-names.json", id: "flavor-names@1", generator: "tools/flavor-names.mjs", checkedBy: "tools/flavor-names.mjs", main: "cards"},
  {file: "data/commander-glossary.json", id: "commander-glossary@1", generator: HAND, checkedBy: "tools/check-glossary.mjs", main: "entries"},
  {file: "data/deck-guides.json", id: "deck-guides@1", generator: "tools/generate-guides.mjs", checkedBy: "tools/generate-guides.mjs", main: "decks"},
  {file: "data/deck-ratings.json", id: "deck-ratings@1", generator: "tools/sim/rate-decks.mjs", checkedBy: "tools/sim/rate-decks.mjs", main: "decks"},
  {file: "data/simulation-summary.json", id: "simulation-summary@3", generator: "tools/sim/rate-decks.mjs", checkedBy: "tools/sim/rate-decks.mjs", main: null},
  {file: "data/graph.json", id: "graph@2", generator: "tools/graph-amplifiers.mjs", checkedBy: "tools/graph-amplifiers.mjs", main: "cards"},
  {file: "data/graph-played.json", id: "graph-played@2", generator: "tools/graph-amplifiers.mjs", checkedBy: "tools/graph-amplifiers.mjs", main: "played"},
  {file: "data/live-load.json", id: "live-load@1", generator: "tools/build-live-load.mjs", checkedBy: "tools/build-live-load.mjs", main: "decks"},
  {file: "data/live-state.json", id: "live-state@1", generator: "tools/build-live-state.mjs", checkedBy: "tools/build-live-state.mjs", main: "payload.state.decks"},
  {file: "data/game-history.json", id: "game-history@1", generator: "tools/compile-game-logs.mjs", checkedBy: "tools/compile-game-logs.mjs", main: "games"},
  {file: "sim/config.json", id: "sim-config@2", generator: HAND, checkedBy: "tests/schemas.mjs", main: null},
  {file: "sim/opponents.json", id: "sim-opponents@2", generator: HAND, checkedBy: "tests/schemas.mjs", main: "profiles"},
  {file: "sim/status.json", id: "sim-status@1", generator: "tools/sim/lib.mjs", checkedBy: "tests/schemas.mjs", main: null},
];

export const byFile = (file) => REGISTRY.find((r) => r.file === file);
export const schemaPath = (id) => path.join(ROOT, "schema", `${id.split("@")[0]}.json`);
export const loadSchema = (id) => JSON.parse(readFileSync(schemaPath(id), "utf8"));
export const readData = (file) => JSON.parse(readFileSync(path.join(ROOT, file), "utf8"));

const dig = (o, p) => p.split(".").reduce((v, k) => (v == null ? v : v[k]), o);
const sizeOf = (v) => (Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : NaN);

/* The envelope facts, then the schema. Returns a list of problems; empty means the file is
 * what the registry says it is. */
export function check(file, data = readData(file)) {
  const entry = byFile(file);
  if (!entry) return [`${file} is not in schema/index.mjs`];
  const problems = [];
  if (data.schema !== entry.id) problems.push(`schema is ${JSON.stringify(data.schema)}; the registry says ${entry.id}`);
  if (data.generator !== entry.generator) problems.push(`generator is ${JSON.stringify(data.generator)}; the registry says ${entry.generator}`);
  if (entry.generator !== HAND) {
    const stamp = STAMPS.find((k) => k in data);
    if (!stamp) problems.push(`no stamp (one of ${STAMPS.join(", ")})`);
    else if (stamp !== "revision" && Number.isNaN(Date.parse(data[stamp]))) problems.push(`${stamp} "${data[stamp]}" is not a date`);
  }
  if (entry.main) {
    const size = sizeOf(dig(data, entry.main));
    if (data.count !== size) problems.push(`count is ${data.count}; ${entry.main} holds ${size}`);
  } else if ("count" in data) problems.push(`carries a count but the registry names no collection to count`);
  const errors = validate(loadSchema(entry.id), data);
  return problems.concat(errors.slice(0, 20).map((e) => `schema/${entry.id.split("@")[0]}.json: ${e}`));
}

/* For a tool's --check: print and exit. */
export function report(file, data) {
  const problems = check(file, data);
  if (problems.length) { console.error(`${file}: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n  - ${problems.join("\n  - ")}`); return false; }
  const entry = byFile(file);
  console.log(`${file}: ${entry.id}, ${data ? data.count ?? "" : ""} ${entry.main ? entry.main : ""} — valid`.replace(/\s+—/, " —"));
  return true;
}
