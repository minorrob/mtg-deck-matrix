/* The Resolution Rules are the part of the audio pack that can be wrong quietly: a card that
 * makes the generic creature noise when the pack shipped a Dragon is not an error anyone reports,
 * it is just a game that sounds flatter than it should. So they are pure and tested here against
 * real type lines rather than invented ones.
 *
 * Every assertion names the rule it holds, R1 to R7, from the pack's Resolution Rules sheet.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolveCardSounds, parseTypeLine, TRIBE_PRIORITY, mayPlay, THROTTLE_MS} from "../ui/play-audio-rules.mjs";

test("a type line splits into supertypes, types and subtypes", () => {
  assert.deepEqual(parseTypeLine("Legendary Artifact Creature — Human Wizard"),
    {supertypes: ["Legendary"], types: ["Artifact", "Creature"], subtypes: ["Human", "Wizard"]});
  assert.deepEqual(parseTypeLine("Instant"), {supertypes: [], types: ["Instant"], subtypes: []});
  assert.deepEqual(parseTypeLine("Basic Land — Forest"),
    {supertypes: ["Basic"], types: ["Land"], subtypes: ["Forest"]});
  /* Real data carries an em dash; a hyphen turns up too, so neither is assumed. */
  assert.deepEqual(parseTypeLine("Artifact - Vehicle").subtypes, ["Vehicle"]);
  /* A double-faced line carries both halves; the front is the half being cast. */
  assert.deepEqual(parseTypeLine("Creature — Human Werewolf // Creature — Werewolf").subtypes,
    ["Human", "Werewolf"]);
  assert.deepEqual(parseTypeLine(""), {supertypes: [], types: [], subtypes: []});
  assert.deepEqual(parseTypeLine(null), {supertypes: [], types: [], subtypes: []});
});

test("R1: one voice, never two", () => {
  for (const line of ["Instant", "Legendary Creature — Elder Dragon", "Artifact — Equipment",
                      "Enchantment — Aura", "Basic Land — Island", "Legendary Planeswalker — Teferi"]) {
    const voices = resolveCardSounds(line).filter((s) => !/emphasis$/.test(s));
    assert.equal(voices.length, 1, `${line} should make exactly one voice, got ${voices.join(", ")}`);
  }
});

test("R2: Legendary adds an emphasis on top of the voice, it does not replace it", () => {
  assert.deepEqual(resolveCardSounds("Legendary Creature — Dragon"),
    ["sfx_tribe_dragon", "sfx_legendary_emphasis"]);
  assert.deepEqual(resolveCardSounds("Creature — Dragon"), ["sfx_tribe_dragon"]);
  /* Snow rides the same path; its own index row calls it optional flavor on snow permanents. */
  assert.deepEqual(resolveCardSounds("Snow Artifact"), ["sfx_cast_artifact", "sfx_snow_emphasis"]);
});

test("R3, R4, R5: a subtype that is more specific than its type replaces the type's voice", () => {
  assert.deepEqual(resolveCardSounds("Artifact — Vehicle"), ["sfx_subtype_vehicle"]);
  assert.deepEqual(resolveCardSounds("Artifact — Equipment"), ["sfx_subtype_equipment"]);
  assert.deepEqual(resolveCardSounds("Enchantment — Aura"), ["sfx_subtype_aura"]);
  /* The pack ships seven more of the same shape; treating them alike is why they are not unused. */
  assert.deepEqual(resolveCardSounds("Enchantment — Saga"), ["sfx_subtype_saga"]);
  assert.deepEqual(resolveCardSounds("Artifact — Treasure"), ["sfx_subtype_treasure"]);
  /* A plain one of each type still gets its own voice. */
  assert.deepEqual(resolveCardSounds("Artifact"), ["sfx_cast_artifact"]);
  assert.deepEqual(resolveCardSounds("Enchantment"), ["sfx_cast_enchantment"]);
});

test("R6 and R7: a creature speaks as its most distinctive tribe", () => {
  assert.deepEqual(resolveCardSounds("Creature — Human Wizard"), ["sfx_tribe_human"],
    "the workbook ranks Human above the class roles");
  assert.deepEqual(resolveCardSounds("Creature — Zombie Dragon"), ["sfx_tribe_dragon"],
    "R7: Dragon over Zombie, whichever order the line lists them");
  assert.deepEqual(resolveCardSounds("Creature — Dragon Zombie"), ["sfx_tribe_dragon"]);
  assert.deepEqual(resolveCardSounds("Creature — Angel Demon"), ["sfx_tribe_angel"],
    "the workbook's own order: Dragon > Angel > Demon");
  /* A tribe the pack has no sound for falls back rather than naming a file that is not there. */
  assert.deepEqual(resolveCardSounds("Creature — Werewolf"), ["sfx_cast_creature"]);
  assert.deepEqual(resolveCardSounds("Creature"), ["sfx_cast_creature"]);
  /* An artifact creature is a creature first, or a Golem would sound like a bare artifact. */
  assert.deepEqual(resolveCardSounds("Artifact Creature — Golem"), ["sfx_tribe_golem"]);
  assert.deepEqual(resolveCardSounds("Legendary Artifact Creature — Phyrexian Horror"),
    ["sfx_tribe_phyrexian", "sfx_legendary_emphasis"]);
});

test("lands and the oddities have voices too", () => {
  assert.deepEqual(resolveCardSounds("Basic Land — Mountain"), ["sfx_play_land"]);
  assert.deepEqual(resolveCardSounds("Legendary Land"), ["sfx_play_land", "sfx_legendary_emphasis"]);
  assert.deepEqual(resolveCardSounds("Kindred Instant — Goblin"), ["sfx_cast_instant"],
    "a Kindred Instant is still cast as an instant; Kindred is the secondary type");
  assert.deepEqual(resolveCardSounds("Battle — Siege"), ["sfx_cast_battle"]);
  assert.deepEqual(resolveCardSounds("nonsense"), [], "a line with no known type makes no sound");
});

/* THE RULES MAY ONLY NAME SOUNDS THE PACK ACTUALLY SHIPS. Getting this wrong is the quiet 404
 * again: a slug with a typo plays nothing and reports nothing. */
test("every slug these rules can produce exists in the pack", () => {
  const rows = JSON.parse(readFileSync("game/ui/assets/audio/sound-index.json", "utf8")).rows;
  const known = new Set(rows.map((r) => r.slug));
  for (const tribe of TRIBE_PRIORITY) {
    assert.ok(known.has("sfx_tribe_" + tribe.toLowerCase()), `the pack ships a ${tribe} sound`);
  }
  const lines = ["Instant", "Sorcery", "Creature", "Artifact", "Enchantment", "Planeswalker",
    "Battle", "Land", "Artifact — Vehicle", "Artifact — Equipment", "Enchantment — Aura",
    "Enchantment — Saga", "Enchantment — Class", "Artifact — Fortification", "Artifact — Treasure",
    "Artifact — Food", "Artifact — Clue", "Artifact — Blood", "Legendary Creature — Dragon",
    "Snow Land"];
  for (const line of lines) {
    for (const slug of resolveCardSounds(line)) {
      assert.ok(known.has(slug), `${line} names ${slug}, which the pack does not ship`);
    }
  }
});

/* R13: "ignore duplicate identical SFX within 80ms to avoid machine-gun stacking." */
test("R13: the same sound cannot stack on itself inside 80ms", () => {
  const seen = new Map();
  assert.equal(mayPlay("sfx_cast_instant", seen, 1000), true);
  assert.equal(mayPlay("sfx_cast_instant", seen, 1000 + THROTTLE_MS - 1), false, "too soon");
  assert.equal(mayPlay("sfx_cast_instant", seen, 1000 + THROTTLE_MS), true, "80ms later is allowed");
  /* A different sound in the same instant is a different sound, not a stack. */
  const other = new Map();
  assert.equal(mayPlay("a", other, 500), true);
  assert.equal(mayPlay("b", other, 500), true);
});
