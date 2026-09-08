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
  "v2.2":
    "The commander-evaluation pass: fifteen candidate commanders per variant at 4,000 games each, measured before the four-rung ladder existed. Its numbers rank commanders against each other inside one shell and are not comparable with any rung score in this file.",

  "v2.4":
    "Measured on the v2.4 engine: nine opponent archetypes, a four-rung ladder in which every rung starts from the hundred the rung below it finished at, and two objectives rather than one. Tuned and Max maximize win rate. Pod Fun is scored against a 30-45% win-rate band with the ceiling enforced as a constraint, weights the pod-experience metric at 20%, and is floored at 75% of its own Tuned build's power so it can never come out the stronger deck.",

  "v2.5":
    "Measured on v2.5: the v2.4 model, with two changes that both re-base every number. First, creatures fight with their PRINTED power and toughness. Until this generation no card file carried those fields, so the engine estimated every body as max(1, round(cmc * 0.9)) -- a one-mana 2/1 played as a 1/1, a seven-mana 4/4 as a 6/6, in a model whose whole business is combat. Second, all 200 rungs were measured TOGETHER on one protocol, six seeds of 20,000 games, rather than each carrying whatever size and seed its own optimizer stopped at. The second change matters more than it sounds: the v2.4 Max figures in particular came from a promotion pass that kept the swaps that measured best, which is a selection bias, and removing it moves some Max rungs by twenty points. No card moved -- the hundreds are exactly those in data/archive/rung-lists.json.",

  "v2.6":
    "Measured on v2.6: the v2.5 model, with two corrections to what the engine READS from a card before it plays anything. First, a land that goes and gets a basic now enters tapped. entersTapped was read off the fetch's own text, and a fetch does not print \"enters tapped\" because the fetch is not the land that does -- so Evolving Wilds and Terramorphic Expanse modelled as UNTAPPED FIVE-COLOUR LANDS available the turn they were played, which is strictly better than any land in Magic, and both Panoramas as untapped tri-lands while really charging {1} on top of the sacrifice. Five lands change; the three decks holding them fall 0.17 to 0.53 and the other three do not move at all. Second, a Treasure behind a condition inside an activated ability is no longer ramp: Currency Converter's cost is a bare {T}, so it modelled as a one-mana Treasure engine when the Treasure needs a card discarded, exiled with the artifact, and a land at that. One card changes, and it is in no shipped deck. No card moved between rungs -- the hundreds are exactly those in data/archive/rung-lists.json.",

  "v2.7":
    "Measured on v2.7: the v2.6 model, with the mana it pays costs from made typed, exclusive and spendable, and with rituals told apart from ramp. Three things were wrong before and all three flattered the deck. A source was counted once per COLOUR it makes rather than once per mana, so a single Watery Grave paid a {U} and a {B} in the same spell and a triome counted three times. Nothing was ever spent -- the colour table never decremented, so the same land paid for the first spell of a turn and the fourth, and only a scalar total was debited. And colourless paid coloured: \"Add {C}{C}\" was read as \"any colour\", and a rock producing no colour was credited with all five, which is how Sol Ring came to fix a five-colour manabase. Costs are now matched to distinct sources, scarcest colour first, and the assignment that proves a cost payable IS the payment. Separately, a one-shot spell that adds mana is a ritual rather than a permanent rock: Seething Song was modelled as making five mana every turn for the rest of the game. Held answers are also paid for one at a time out of what the one before it left, instead of every instant in hand being asked against the same untouched mana. Every score moves; the six decks fall between 1.7 and 9.2 points, the largest on four-colour Atraxa, which had the most fake fixing to lose. No card moved.",

  "v2.8":
    "Measured on v2.8: the opening procedure, and how many lands a fetch fetches. Rule 103.8c -- in a multiplayer game nobody skips their first draw; the engine drew on turn one for even seeds and not for odd ones, which is a two-player rule applied to a format that does not have it, so half of every measurement was played a card down. Rule 103.5c -- Commander's first mulligan is free; the engine put a card on the bottom for every mulligan including the first, so every hand that had been mulliganed at all was a card short of a legal one. Together those are worth +4.6 to +6.7 points on the six published decks, and they are a correction to the rules, not an improvement to the decks. Separately, rampAmount read \"search your library for (a|up to two|two) land\" as two mana, so 31 cards that fetch ONE land were credited with two, while Skyshroud Claim and Nissa's Pilgrimage fetch two and were credited one because they name a basic land type instead of the word land. The count now comes from the number word. Measured in isolation that fix moves the six decks by -0.45 to 0.00; it matters in the Deck Lab, not here. No card moved between rungs -- the hundreds are exactly those in data/archive/rung-lists.json.",
};

/* The sentence at the top of the file that tells a reader which generations it holds and
   what may not be subtracted from what. Written for the generation the sweep just ran. */
export function boundaryNote(generation) {
  return "This file holds three live generations and says which is which. Every RUNG -- all 200 " +
    "of them -- was re-measured together on " + generation + ": the same seeds, the same game " +
    "count, the same objective per rung, so the rungs are comparable with each other and with " +
    "nothing published before them. The alt-commander cases were NOT re-measured: forty carry " +
    "v2.2 and four carry v2.4, and each says so. Do not subtract a figure of one generation " +
    "from a figure of another. CrankMagic's own six decks in data/deck-ratings.json are on " +
    generation + " too, measured by tools/sim/rate-decks.mjs, so for the first time since v2.5 " +
    "the two files describe the same engine and can be read beside each other. Two engine " +
    "generations moved at once between the rungs' old v2.6 figures and these, and the notes " +
    "above say what each did: v2.7 took away colour fixing that multicolour decks never had, " +
    "and " + generation + " gave every seat the first draw the rules give it and stopped shorting " +
    "every mulliganed hand. The second outweighs the first: 172 rungs rose and 28 fell, mean " +
    "move 1.65 points. The largest fall is 2c Max at -6.87, a four-colour list paying v2.7's " +
    "bill; the largest rise is 4o Tuned at +5.33. No card moved between rungs -- the hundreds " +
    "are exactly those in data/archive/rung-lists.json.";
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
