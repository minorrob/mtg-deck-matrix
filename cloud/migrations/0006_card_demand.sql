-- Card load step 1 (Linear ROB-86; docs/engine/plan-card-load-program.md): the cards players asked a table for that it
-- cannot play yet, so the next wave loads the most wanted first. Written by cloud/card-demand.mjs.
-- Card names and counts only: never a deck, a deck's id or name, a table, or a person.
CREATE TABLE card_demand (
  name TEXT NOT NULL COLLATE NOCASE PRIMARY KEY,   -- the card's name, as it was first asked
  asked INTEGER NOT NULL DEFAULT 0,                -- times a table named it as one it cannot play
  decks INTEGER NOT NULL DEFAULT 0,                -- different deck lists it was in
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL
);
CREATE INDEX card_demand_rank ON card_demand (decks DESC, asked DESC);
-- The deck lists already counted, each only as a one-way digest of its card names, so the same list asked again does not
-- count as another deck. Not the deck: its names cannot be read back from the digest, and nothing joins it to a card row.
CREATE TABLE card_demand_lists (
  digest TEXT NOT NULL PRIMARY KEY,
  seen TEXT NOT NULL
);
