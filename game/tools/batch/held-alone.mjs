/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* WHICH MOST-PLAYED CARDS ONE MISSING THING ALONE HOLDS BACK -- the cards a batch building that thing can define.
 *
 * Reads game/docs/engine-inventory.json (what each most-played card uses) and the catalog's measure of what the engine
 * has built (engine-constructs.mjs), skipping cards already defined. Each line: the missing thing, how many cards it
 * alone holds back, and their names. Usage, from the repository root:
 *
 *   node game/tools/batch/held-alone.mjs                      every missing thing, most cards first
 *   node game/tools/batch/held-alone.mjs TokenAttacking Goad  only those (each a pattern, case ignored)
 */
import {readFileSync} from "node:fs";
import {missingFor} from "../engine-constructs.mjs";
import {loadCardIndex} from "../engine-cards.mjs";

const inventory = JSON.parse(readFileSync(new URL("../../docs/engine-inventory.json", import.meta.url), "utf8"));
const directory = loadCardIndex();
const wanted = process.argv.slice(2).map((s) => new RegExp(s, "i"));
const groups = new Map();
for (const [name, card] of Object.entries(inventory.top?.perCard ?? {})) {
  if (directory.resolve(name)?.playable === true) continue;
  const keys = [...new Set(missingFor(card).map((m) => `${m.kind}:${m.name}`))];
  if (keys.length !== 1) continue;
  if (wanted.length && !wanted.some((r) => r.test(keys[0]))) continue;
  if (!groups.has(keys[0])) groups.set(keys[0], []);
  groups.get(keys[0]).push(name);
}
for (const [key, names] of [...groups].sort((a, b) => b[1].length - a[1].length)) console.log(`${key} (${names.length}): ${names.join(" | ")}`);
