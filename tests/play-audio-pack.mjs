/* THE PACK AND ITS INDEX HAVE TO AGREE, OR THE GAME GOES QUIET IN ONE SPECIFIC PLACE.
 *
 * The failure mode this exists for is not loud: a slug the index names with no file behind it is
 * one silent 404 at the moment that sound was meant to play. Nobody notices until somebody says
 * "the board wipe has no sound", and by then it is a hunt.
 *
 * So both directions are checked. Every slug the index names resolves to a file, and every file
 * shipped is named by the index — an orphan is either a sound nothing will ever play or an index
 * row somebody forgot to add.
 *
 * Three rows name no audio on purpose: setting_sfx_volume, setting_bgm_volume and setting_mute_all
 * are the Settings panel described as index rows so they carry an ID. Their own prompt column says
 * "(No audio generation ...)", and they are the only rows allowed to have no file.
 */
import assert from "node:assert/strict";
import {readFileSync, readdirSync, statSync} from "node:fs";
import path from "node:path";
import {ROOT} from "../schema/index.mjs";

const dir = path.join(ROOT, "game/ui/assets/audio");
const index = JSON.parse(readFileSync(path.join(dir, "sound-index.json"), "utf8"));

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

ok(index.schema === "CrankMagicPlayAudio@1", "the index states its schema");
ok(index.rows.length >= 90, `the index carries its rows (${index.rows.length})`);

/* The Settings rows are specifications rather than sounds. */
const SPEC_ONLY = new Set(["setting_sfx_volume", "setting_bgm_volume", "setting_mute_all"]);

const onDisk = new Map();
for (const kind of ["sfx", "bgm"]) {
  for (const file of readdirSync(path.join(dir, kind))) {
    if (!file.endsWith(".mp3")) continue;
    onDisk.set(file.replace(/\.mp3$/, ""), path.join(kind, file));
  }
}

const wanted = index.rows.filter((r) => !SPEC_ONLY.has(r.slug)).map((r) => r.slug);
const missing = wanted.filter((slug) => !onDisk.has(slug));
eq(missing, [], `every sound the index names ships with the app; missing: ${missing.join(", ")}`);

const orphans = [...onDisk.keys()].filter((slug) => !index.rows.some((r) => r.slug === slug));
eq(orphans, [], `every sound shipped is named by the index; orphaned: ${orphans.join(", ")}`);

/* The rows that name no audio are exactly the three Settings specifications and no others —
   otherwise a sound that failed to generate could hide here as "intentionally absent". */
const noFile = index.rows.filter((r) => !onDisk.has(r.slug)).map((r) => r.slug).sort();
eq(noFile, [...SPEC_ONLY].sort(), "only the Settings rows have no sound behind them");

/* The three background beds the resolution rules name by position, plus the two Rob generated on
   2026-09-21 so R11's tension bed and the victory linger could ship as written. */
for (const bed of ["bgm_lobby_mythic_calm", "bgm_game_aether_voyage", "bgm_combat_battle_shimmer",
                   "bgm_tension_darkening_myth", "bgm_victory_linger"]) {
  ok(onDisk.get(bed)?.startsWith("bgm"), `${bed} ships as a background bed`);
}

/* Size is a product decision, not a detail: this whole pack crosses a trycloudflare tunnel to
   reach a remote guest, possibly on a phone. If it grows past this, that is a conversation. */
let bytes = 0;
for (const rel of onDisk.values()) bytes += statSync(path.join(dir, rel)).size;
const mb = bytes / 1048576;
ok(mb < 8, `the pack is ${mb.toFixed(1)} MB; over 8 MB is a decision about what a guest downloads, not a default`);

console.log(`play-audio-pack: ${checks} checks passed — ${onDisk.size} sounds, ${mb.toFixed(1)} MB, index and disk agree both ways.`);
