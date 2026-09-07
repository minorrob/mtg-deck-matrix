// The default load: what "Load default" puts into a browser that has never opened the app.
//
//   node tools/build-my-load.mjs                       # derive it from data/active-state.json
//   node tools/build-my-load.mjs --from backup.json    # adopt a backup downloaded from the app
//
// WHY IT IS A BROWSER SNAPSHOT AND NOT ANOTHER FORMAT. The workflow it exists for is:
// edit the decks in the browser, press Admin -> Export a backup, hand me the file, and I
// commit it here. That only works if the file the app writes is the file this reads, so
// --from validates a real export against user-state.js and adopts it as-is rather than
// translating it into a third shape nobody can round-trip.
//
// WITHOUT --from it is derived from data/active-state.json, which is the repository's own
// copy of the six built decks: the picks, the ownership ledger, the paid prices, the
// salvage yard and the per-deck holds. That file is already scoped to the six variants
// being built -- 1b, 2c, 3o, 4e, 5o, 7e -- so the default load carries those and nothing
// else. The other 44 variants stay in data/variants.json where the Compare tab can still
// reach them; they are the catalog, not somebody's saved session.
import {readFile, writeFile} from "node:fs/promises";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const User = require("../user-state.js");

const OUT = "data/my-load.json";
const from = (() => { const i = process.argv.indexOf("--from"); return i >= 0 ? process.argv[i + 1] : null; })();

const known = new Set(User.keys());

function report(file) {
  const rows = Object.keys(file.values).map((k) => {
    const meta = User.KEYS.find((x) => x.key === k);
    return `  ${k}  ${(file.values[k] || "").length.toLocaleString()} bytes  ${meta ? meta.what : "UNKNOWN KEY"}`;
  });
  console.log(`${OUT}: ${rows.length} keys, ${JSON.stringify(file).length.toLocaleString()} bytes`);
  console.log(rows.join("\n"));
}

if (from) {
  const file = JSON.parse(await readFile(from, "utf8"));
  if (file.kind !== "mtg-deck-matrix-browser-backup") {
    throw new Error(`${from} is not a browser backup (kind: ${file.kind || "none"}). `
      + "Use Admin -> Export a backup on My Decks to make one.");
  }
  const strangers = Object.keys(file.values || {}).filter((k) => !known.has(k));
  if (strangers.length) {
    throw new Error(`${from} carries keys user-state.js does not name: ${strangers.join(", ")}. `
      + "Add them there first, or the app will drop them on restore and on clear.");
  }
  file.note = "The default load. Replace it with a fresh export from the app; see tools/build-my-load.mjs.";
  await writeFile(OUT, JSON.stringify(file, null, 1) + "\n");
  report(file);
} else {
  const active = JSON.parse(await readFile("data/active-state.json", "utf8"));
  if (!active.state || typeof active.state !== "object") {
    throw new Error("data/active-state.json has no state block to build a default from.");
  }
  const values = {"mtg-deck-matrix-state-v1": JSON.stringify(active.state)};
  if (active.custom) values["mtg-deck-matrix-custom-v1"] = JSON.stringify(active.custom);

  const file = {
    kind: "mtg-deck-matrix-browser-backup",
    version: 1,
    savedAt: new Date().toISOString(),
    note: "Derived from data/active-state.json. Replace it with a fresh export from the app; "
      + "see tools/build-my-load.mjs.",
    source: {from: "data/active-state.json", exportedAt: active.exportedAt || null},
    keys: Object.keys(values),
    values
  };
  const picks = Object.keys(active.state.buySelections || {});
  console.log(`variants in the default: ${picks.length ? picks.join(", ") : "none"}`);
  await writeFile(OUT, JSON.stringify(file, null, 1) + "\n");
  report(file);
}
