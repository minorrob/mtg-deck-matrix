/* EVERY ENGINE FILE SAYS WHOSE IT IS.
 *
 * `docs/engine/PLAN.md` §12.5 and `docs/engine/ADR-001-own-engine.md`. The engine is the part of
 * CrankMagic Rob may one day want to sell, and the part most likely to be read by someone deciding
 * whether he owns it. A file without the header is not a formatting slip; it is the one question
 * that matters left unanswered.
 *
 * Two things are checked, and the second is the one that would be missed by eye:
 *
 *   1. The header is present, verbatim, at the top.
 *   2. No engine file carries an SPDX identifier for another license. There is no SPDX identifier
 *      for the repository's Source-Available License, so an SPDX line in an engine file can only
 *      have arrived from somewhere else — which is exactly the import the clean-room rule forbids.
 */
import assert from "node:assert/strict";
import {readFileSync, readdirSync, statSync, existsSync} from "node:fs";
import path from "node:path";
import {ROOT} from "../schema/index.mjs";

const HEADER = "/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */";

/* The paths §12.5 names. Each is optional until the phase that creates it, so this suite passes
   from phase 0 and tightens on its own as the engine grows rather than needing an edit. */
const ROOTS = ["game/engine", "data/engine", "game/server/engine-runtime.mjs"];
const TOOLS = ["game/tools/engine-inventory.mjs", "game/tools/engine-coverage.mjs", "game/tools/engine-diff.mjs"];
const CODE = /\.(mjs|js)$/;

function walk(rel) {
  const full = path.join(ROOT, rel);
  if (!existsSync(full)) return [];
  if (statSync(full).isFile()) return CODE.test(rel) ? [rel] : [];
  return readdirSync(full).flatMap((entry) => walk(path.join(rel, entry).split(path.sep).join("/")));
}

const files = [...ROOTS.flatMap(walk), ...TOOLS.flatMap(walk)];
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };

/* Schema files under data/engine/ are JSON and carry their notice in a field rather than a
   comment; they are checked when they exist, by the phase that writes them. */
const missing = files.filter((rel) => !readFileSync(path.join(ROOT, rel), "utf8").startsWith(HEADER));
assert.deepEqual(missing, [],
  `these engine files do not open with the copyright header, so they do not say whose they are:\n  ${missing.join("\n  ")}`);
checks += 1;

const spdx = files.filter((rel) => /SPDX-License-Identifier:/.test(readFileSync(path.join(ROOT, rel), "utf8")));
assert.deepEqual(spdx, [],
  `these engine files carry an SPDX identifier, and the Source-Available License has none — so it came from `
  + `somewhere else, which the clean-room rule forbids:\n  ${spdx.join("\n  ")}`);
checks += 1;

/* The header has to be worth having: if the LICENSE stops naming the engine, the header points at
   a document that does not cover it. §12.5 item 2. */
const license = readFileSync(path.join(ROOT, "LICENSE"), "utf8");
/* Whitespace-tolerant: LICENSE is hard-wrapped, so "card definitions" legitimately straddles a
   line break and a naive match would fail on correct text. */
ok(/rules\s+engine/i.test(license) && /card\s+definitions/i.test(license),
  "LICENSE §2(c) must name the rules engine and its card definitions among the parts that may not be "
  + "incorporated elsewhere, or the header points at a document that does not cover this directory");

/* And the clean-room rule has to be written down where a reader will find it. */
ok(existsSync(path.join(ROOT, "docs/engine/ADR-001-own-engine.md")),
  "ADR-001 records the clean-room rule and the provenance of every card definition");

console.log(`engine-headers: ${checks} checks passed — ${files.length} engine files, each naming its owner, none carrying another license.`);
