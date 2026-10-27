#!/usr/bin/env node
/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
 *
 * Writes data/ai-players/roster.json from game/engine/pilots/roster.mjs, the roster's source of truth: the lobby (a
 * browser) reads the JSON, the Worker and the room import the module, and tests/ai-personas.mjs holds the two equal.
 *
 *   node tools/build-ai-roster.mjs          write the file
 *   node tools/build-ai-roster.mjs --check  exit 1 if the file is not what the module says
 */
import {readFileSync, writeFileSync} from "node:fs";
import {roster, rosterProblems} from "../game/engine/pilots/roster.mjs";

const FILE = new URL("../data/ai-players/roster.json", import.meta.url);
const bad = rosterProblems();
if (bad.length) {console.error(`The roster is not one this build can play:\n- ${bad.join("\n- ")}`); process.exit(1);}
const text = `${JSON.stringify(roster(), null, 2)}\n`;
if (process.argv.includes("--check")) {
  let now = "";
  try {now = readFileSync(FILE, "utf8");} catch {}
  if (now !== text) {console.error("data/ai-players/roster.json is not what game/engine/pilots/roster.mjs says: run node tools/build-ai-roster.mjs"); process.exit(1);}
  console.log("roster.json matches roster.mjs");
} else {writeFileSync(FILE, text); console.log(`wrote data/ai-players/roster.json (${roster().personas.length} personas, ${roster().levels.length} levels)`);}
