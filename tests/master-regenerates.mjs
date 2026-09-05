// data/master-v2.json is a BUILD ARTIFACT of data/source/*.xlsx, not a document.
// This asserts it still is.
//
// WHY THIS TEST EXISTS. Two sessions edit this repository, and the last patch that
// crossed between them changed 23,203 lines of master-v2.json around 96 lines of
// actual decisions. A JSON of that size cannot be merged by hand or reviewed by
// eye, so the only safe rule is: exchange the WORKBOOK and the CODE, never the
// generated JSON, and regenerate after every merge.
//
// A rule nobody can check is a rule that gets broken. This one fails the build if
// the committed JSON stops matching what the importer produces -- which catches a
// hand-edit that would be silently lost on the next regeneration, a workbook that
// moved without the JSON following, and a merge that resolved the JSON the wrong
// way.
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {readFile, writeFile, mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import assert from "node:assert/strict";

const run = promisify(execFile);
const SOURCE = "data/source/Treys_MtG_Master_v3.xlsx";
const COMMITTED = "data/master-v2.json";

// generatedAt is a timestamp; everything else that the workbook decides must
// match exactly.
//
// The workbook does NOT decide every price. It leaves 82 rows blank, and the
// importer fills those from data/card-facts.json, which holds a Scryfall price
// -- and Scryfall reprices daily. Twenty-five of those 82 moved by a cent
// overnight the first time this test ran on a later day, which is the market
// moving, not the file rotting. So a Scryfall-sourced price and the toBuyCost
// computed from it are blanked before the comparison, and checked separately for
// still being present. A workbook price is compared exactly, because that one
// really is a fact about the source.
const sorted = (v) => {
  if (Array.isArray(v)) return v.map(sorted);
  if (v && typeof v === "object") {
    return Object.keys(v).sort().reduce((out, k) => { out[k] = sorted(v[k]); return out; }, {});
  }
  return v;
};
// Sort keys RECURSIVELY. The obvious shorthand, JSON.stringify(o, Object.keys(o)),
// looks like a key sort and is not: an array second argument is a property
// allowlist applied at every level, so each card -- holding none of the top-level
// keys -- serialized to {} and the comparison compared nothing at all. This test
// passed a deliberately corrupted file before that was caught.
const stable = (json) => {
  const copy = {...json};
  delete copy.generatedAt;
  copy.cards = copy.cards.map((card) => card.priceSource === "scryfall"
    ? {...card, price: "(live)", toBuyCost: "(live)"}
    : card);
  return JSON.stringify(sorted(copy));
};

let python = null;
for (const bin of ["python3", "python"]) {
  try { await run(bin, ["-c", "import openpyxl"]); python = bin; break; } catch { /* try the next */ }
}
if (!python) {
  console.log("master-regenerates: skipped, no python with openpyxl on this machine.");
  process.exit(0);
}

// The importer writes to its own fixed path and takes only the source, so the
// only way to get a fresh copy is to let it overwrite and put the original back.
// The restore is in a finally block: a failing assertion must not leave the
// working tree dirty.
const dir = await mkdtemp(join(tmpdir(), "master-regen-"));
const committedText = await readFile(COMMITTED, "utf8");
let freshText = null;
try {
  await run(python, ["tools/import_master_v2.py", SOURCE]);
  freshText = await readFile(COMMITTED, "utf8");
} finally {
  await writeFile(COMMITTED, committedText);
}

try {
  const fresh = JSON.parse(freshText);
  const committed = JSON.parse(committedText);

  assert.equal(committed.source, fresh.source,
    `${COMMITTED} names source "${committed.source}" but the importer produced "${fresh.source}"`);
  assert.equal(committed.cards.length, fresh.cards.length,
    `${COMMITTED} has ${committed.cards.length} cards, regenerating gives ${fresh.cards.length}. ` +
    "Regenerate it rather than editing it: python3 tools/import_master_v2.py " + SOURCE);
  assert.equal(stable(committed), stable(fresh),
    `${COMMITTED} does not match what ${SOURCE} regenerates to. It is a build artifact, not a document -- ` +
    "edit the workbook and re-run tools/import_master_v2.py. If this fired after a merge, the JSON side of " +
    "that merge was resolved by hand and should be thrown away and rebuilt.");

  // Blanking a field is only safe if something else still watches it. A row
  // that lost its Scryfall price would otherwise slip through as "(live)"
  // matching "(live)", and the shopping pages would quietly quote $0.
  const live = committed.cards.filter((card) => card.priceSource === "scryfall");
  const freshLive = new Map(fresh.cards.map((card) => [card.name, card]));
  const lost = live.filter((card) => {
    const now = freshLive.get(card.name);
    return !now || now.priceSource !== "scryfall" || !(Number(now.price) > 0);
  });
  assert.equal(lost.length, 0,
    `${lost.length} row(s) that carried a Scryfall price no longer do: ` +
    lost.map((card) => card.name).join(", ") +
    ". Rebuild data/card-facts.json (python3 tools/build_card_facts.py) and import again.");

  console.log(`master-regenerates: ${committed.cards.length} cards reproduce from ${SOURCE} ` +
    `(${live.length} prices come from Scryfall and are checked for presence, not value).`);
} finally {
  await rm(dir, {recursive: true, force: true});
}
