/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE CARD DIRECTORY, READ FROM DISK.
 *
 * `game/engine/cards/<letter>/<slug>.json` is a definition (`CrankCardScript@1`) and `<slug>.scenarios.json` beside it
 * is its scenarios. This is the only part of the directory that touches a file system; `cards/index.mjs` takes what
 * this reads, so a Worker can be handed the same definitions some other way.
 */

import {readdirSync, readFileSync, statSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createCardIndex} from "./index.mjs";

export const CARDS_DIR = path.dirname(fileURLToPath(import.meta.url));

/* Each letter's folder, in order, and its files in order: the same list on every machine. */
function files(root, suffix) {
  const out = [];
  for (const letter of readdirSync(root).sort()) {
    const dir = path.join(root, letter);
    if (!statSync(dir).isDirectory()) continue;
    for (const name of readdirSync(dir).sort()) {
      if (!name.endsWith(".json")) continue;
      if ((suffix === ".scenarios.json") !== name.endsWith(".scenarios.json")) continue;
      out.push(path.join(dir, name));
    }
  }
  return out;
}

const relative = (root, file) => path.relative(root, file).split(path.sep).join("/");

/** Every definition, as `{script, path}` with the path relative to the directory. */
export function loadCardScripts(root = CARDS_DIR) {
  return files(root, ".json").map((file) => ({script: JSON.parse(readFileSync(file, "utf8")), path: relative(root, file)}));
}

/** Every scenarios file, as `{scenarios, path}`. */
export function loadCardScenarios(root = CARDS_DIR) {
  return files(root, ".scenarios.json").map((file) => ({scenarios: JSON.parse(readFileSync(file, "utf8")), path: relative(root, file)}));
}

/** The directory over the definitions on disk. */
export function loadCardIndex(root = CARDS_DIR) {
  return createCardIndex(loadCardScripts(root));
}
