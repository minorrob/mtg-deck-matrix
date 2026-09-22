/* WHICH SOUND A CARD MAKES — the pack's Resolution Rules, as a function.
 *
 * The workbook's Resolution Rules sheet, R1 to R7, quoted at each rule below. Kept pure and apart
 * from anything that touches Web Audio, so the tribe order can be tested without a browser or a
 * sound card: the function returns names, and something else decides whether to play them.
 *
 * R1: "When a card is cast/played, play at most ONE primary type SFX (card_type) plus optional
 *      overlays."
 *
 * So the answer is one voice and zero or more overlays, never two voices. The subtype and tribe
 * rules below do not add a sound — they REPLACE the voice with a more specific one.
 */

/* The nine card-type voices the pack ships, by the word that selects them. */
const TYPE_VOICE = [
  ["Land", "sfx_play_land"],
  ["Creature", "sfx_cast_creature"],
  ["Planeswalker", "sfx_cast_planeswalker"],
  ["Battle", "sfx_cast_battle"],
  ["Artifact", "sfx_cast_artifact"],
  ["Enchantment", "sfx_cast_enchantment"],
  ["Instant", "sfx_cast_instant"],
  ["Sorcery", "sfx_cast_sorcery"],
  ["Kindred", "sfx_cast_kindred"],
];

/* R3/R4/R5: "If Artifact subtype Vehicle: prefer sfx_subtype_vehicle over generic artifact",
 * "If Artifact subtype Equipment (on cast): equipment", "If Enchantment subtype Aura: prefer
 * sfx_subtype_aura over generic enchantment."
 *
 * The pack ships ten of these. The three the rules name are the same shape as the other seven —
 * a subtype that is more specific than its type — so all ten are treated alike rather than three
 * being special-cased and Saga, Class, Treasure, Food, Clue, Blood and Fortification shipping
 * unused.
 */
const SUBTYPE_VOICE = new Map([
  ["Vehicle", "sfx_subtype_vehicle"], ["Equipment", "sfx_subtype_equipment"],
  ["Aura", "sfx_subtype_aura"], ["Fortification", "sfx_subtype_fortification"],
  ["Saga", "sfx_subtype_saga"], ["Class", "sfx_subtype_class"],
  ["Treasure", "sfx_subtype_treasure"], ["Food", "sfx_subtype_food"],
  ["Clue", "sfx_subtype_clue"], ["Blood", "sfx_subtype_blood"],
]);

/* R6: "If Creature: play creature_tribe SFX for the first matching tribe in priority list
 *      (Dragon > Angel > Demon > Vampire > Zombie > Human > Beast > …); else sfx_cast_creature."
 * R7: "If multiple tribes, pick the most 'sonically distinctive' (Dragon over Human, etc.)."
 *
 * THE FIRST SEVEN ARE THE WORKBOOK'S, IN ITS ORDER. The "…" is not, and the rest of this list is
 * this repository's reading of R7's principle rather than the designer's ruling: the more exotic a
 * creature is, the more its sound says something the generic creature sound would not. A Human
 * Wizard is a Human by the workbook's own ranking; an Eldrazi Horror is an Eldrazi.
 *
 * It is one array on purpose. Reordering it is a one-line change and needs no other edit.
 */
export const TRIBE_PRIORITY = [
  "Dragon", "Angel", "Demon", "Vampire", "Zombie", "Human", "Beast",
  "God", "Eldrazi", "Phyrexian", "Phoenix", "Kraken", "Giant", "Dinosaur",
  "Horror", "Spirit", "Skeleton", "Elemental", "Treefolk", "Ooze",
  "Golem", "Construct", "Merfolk", "Elf", "Goblin", "Dwarf",
  "Wolf", "Cat", "Bird", "Snake", "Spider", "Insect", "Fish",
  "Knight", "Wizard", "Cleric", "Rogue", "Warrior", "Soldier",
];
const TRIBE_RANK = new Map(TRIBE_PRIORITY.map((name, i) => [name, i]));
const tribeSlug = (tribe) => "sfx_tribe_" + tribe.toLowerCase();

/* A type line is "Legendary Artifact Creature — Human Wizard": supertypes and types before the
 * dash, subtypes after it. Both em dash and hyphen appear in real data, and Scryfall uses the em
 * dash, so both are accepted rather than assuming one.
 */
export function parseTypeLine(typeLine) {
  const text = String(typeLine || "").replace(/\s+/g, " ").trim();
  if (!text) return {supertypes: [], types: [], subtypes: []};
  /* A double-faced card's line carries both halves; the front is what is being cast. */
  const front = text.split("//")[0].trim();
  const [head, tail = ""] = front.split(/\s[—–-]\s/);
  const words = head.split(" ").filter(Boolean);
  const SUPER = new Set(["Legendary", "Basic", "Snow", "World", "Ongoing", "Elite", "Host"]);
  return {
    supertypes: words.filter((w) => SUPER.has(w)),
    types: words.filter((w) => !SUPER.has(w)),
    subtypes: tail.split(" ").filter(Boolean),
  };
}

/* R2: "If Legendary: also play sfx_legendary_emphasis (duck slightly under type)." The pack also
 * ships a Snow emphasis, whose own index row calls it "Optional flavor on snow permanents", so it
 * rides the same overlay path. */
const OVERLAYS = [["Legendary", "sfx_legendary_emphasis"], ["Snow", "sfx_snow_emphasis"]];

/** The sounds a card makes when it is cast or played: one voice, then any overlays. */
export function resolveCardSounds(typeLine) {
  const {supertypes, types, subtypes} = parseTypeLine(typeLine);
  if (!types.length) return [];
  const out = [];

  /* A creature's voice is its tribe when the pack has one. Checked before the subtype rules so an
     Artifact Creature — Golem is a Golem rather than being read as a bare artifact. */
  if (types.includes("Creature")) {
    const best = subtypes
      .filter((s) => TRIBE_RANK.has(s))
      .sort((a, b) => TRIBE_RANK.get(a) - TRIBE_RANK.get(b))[0];
    out.push(best ? tribeSlug(best) : "sfx_cast_creature");
  } else {
    const subtype = subtypes.find((s) => SUBTYPE_VOICE.has(s));
    if (subtype) out.push(SUBTYPE_VOICE.get(subtype));
    else {
      const match = TYPE_VOICE.find(([word]) => types.includes(word));
      if (match) out.push(match[1]);
    }
  }
  if (!out.length) return [];
  for (const [word, slug] of OVERLAYS) if (supertypes.includes(word)) out.push(slug);
  return out;
}

/* R13: "Throttle: ignore duplicate identical SFX within 80ms to avoid machine-gun stacking."
 *
 * Pure so it can be tested against a clock rather than against a speaker: the caller passes the
 * time, the map remembers, and the answer is whether this sound may sound now.
 */
export const THROTTLE_MS = 80;
export function mayPlay(slug, lastPlayed, now = Date.now(), within = THROTTLE_MS) {
  const previous = lastPlayed.get(slug);
  if (previous !== undefined && now - previous < within) return false;
  lastPlayed.set(slug, now);
  return true;
}
