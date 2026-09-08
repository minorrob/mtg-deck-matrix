/* WHAT EACH ENGINE GENERATION CHANGED, in one place.
 *
 * tools/sim/remeasure-all.mjs used to carry this text inline, keyed on whatever the
 * current generation happened to be. So when the engine moved to v2.8 the tool was about
 * to file v2.6's description under the key "v2.8" -- a note saying "a land that goes and
 * gets a basic now enters tapped" attached to a sweep that had changed the opening
 * procedure and the ramp count instead. A note that describes the wrong generation is
 * worse than no note: it is a confident answer to "why did these numbers move" that is
 * about a different change.
 *
 * So the notes live here, keyed by generation, and the tool looks its own generation up
 * and REFUSES TO WRITE if there is no entry. Bumping the engine now costs a paragraph
 * saying what you did, which is the right price.
 *
 * tests/generators.mjs holds data/simulation-summary.json to this file.
 */

export const GENERATION_NOTES = {
  "v2.6":
    "Measured on v2.6: the v2.5 model, with two corrections to what the engine READS from " +
    "a card before it plays anything. First, a land that goes and gets a basic now enters " +
    "tapped. entersTapped was read off the fetch's own text, and a fetch does not print " +
    "\"enters tapped\" because the fetch is not the land that does -- so Evolving Wilds and " +
    "Terramorphic Expanse modelled as UNTAPPED FIVE-COLOUR LANDS available the turn they " +
    "were played, which is strictly better than any land in Magic, and both Panoramas as " +
    "untapped tri-lands while really charging {1} on top of the sacrifice. Five lands " +
    "change; the three decks holding them fall 0.17 to 0.53 and the other three do not " +
    "move at all. Second, a Treasure behind a condition inside an activated ability is no " +
    "longer ramp: Currency Converter's cost is a bare {T}, so it modelled as a one-mana " +
    "Treasure engine when the Treasure needs a card discarded, exiled with the artifact, " +
    "and a land at that. One card changes, and it is in no shipped deck. No card moved " +
    "between rungs -- the hundreds are exactly those in data/archive/rung-lists.json.",

  "v2.7":
    "Measured on v2.7: mana became typed, exclusive and spendable. Before this, add {C}{C} " +
    "counted as every colour, each coloured pip was checked independently against a source " +
    "count, and nothing was ever removed from the pool -- so Sol Ring could pay a coloured " +
    "pip and one multicolour source could cover two incompatible requirements at once. A " +
    "pool of typed mana is now built per turn, each source contributes once, and every pip " +
    "is paid from it and taken away, scarcest colour first. A held answer is paid for out " +
    "of the same pool, so two answers cannot be counted against one untapped land. And a " +
    "ritual stopped being a mana rock: Dark Ritual and Seething Song add mana once and go " +
    "to the graveyard, and were being modelled as permanents that made that much every " +
    "turn for the rest of the game. Every four-colour deck loses fixing it never had.",

  "v2.8":
    "Measured on v2.8: the opening procedure, and how many lands a fetch fetches. Rule " +
    "103.8c -- in a multiplayer game nobody skips their first draw; the engine drew on " +
    "turn one for even seeds and not for odd ones, which is a two-player rule applied to a " +
    "format that does not have it, so half of every measurement was played a card down. " +
    "Rule 103.5c -- Commander's first mulligan is free; the engine put a card on the bottom " +
    "for every mulligan including the first, so every hand that had been mulliganed at all " +
    "was a card short of a legal one. Together those are worth +4.6 to +6.7 points on the " +
    "six published decks, and they are a correction to the rules, not an improvement to the " +
    "decks. Separately, rampAmount read \"search your library for (a|up to two|two) land\" " +
    "as two mana, so 31 cards that fetch ONE land were credited with two, while Skyshroud " +
    "Claim and Nissa's Pilgrimage fetch two and were credited one because they name a basic " +
    "land type instead of the word land. The count now comes from the number word. Measured " +
    "in isolation that fix moves the six decks by -0.45 to 0.00; it matters in the Deck Lab, " +
    "not here. No card moved between rungs -- the hundreds are exactly those in " +
    "data/archive/rung-lists.json.",
};

/* The sentence at the top of the file that tells a reader which generations it holds and
   what may not be subtracted from what. Written for the generation the sweep just ran. */
export function boundaryNote(generation) {
  return "This file now holds two generations and says which is which. Every RUNG -- all 200 of " +
    "them -- was re-measured together on " + generation + ": the same seeds, the same game count, " +
    "the same objective per rung, so the rungs are comparable with each other and with " +
    "nothing published before them. The alt-commander cases were NOT re-measured: forty " +
    "carry v2.2 and four carry v2.4, and each says so. Do not subtract a figure of one " +
    "generation from a figure of another. CrankMagic's own six decks in " +
    "data/deck-ratings.json are on " + generation + " too, measured by tools/sim/rate-decks.mjs, so " +
    "for the first time since v2.5 the two files describe the same engine and can be read " +
    "beside each other. What moved between v2.6 and " + generation + " is two engine generations at " +
    "once and the notes above say what each did: v2.7 took away fixing that four-colour " +
    "decks never had, and " + generation + " gave every seat the first draw the rules give it and " +
    "stopped shorting mulliganed hands. Expect the second to outweigh the first.";
}

export function noteFor(generation) {
  const note = GENERATION_NOTES[generation];
  if (!note) {
    throw new Error(
      `No note for engine generation ${generation}. Add one to tools/sim/generation-notes.mjs ` +
      "before publishing a sweep: a number filed under a generation nobody described is a " +
      "number nobody can interpret.");
  }
  return note;
}
