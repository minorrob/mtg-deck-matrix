# The card graph

A Neo4j model of every Commander-legal card, with your collection and decks as
overlays. It runs on your machine; the app consumes an export of it.

## Why a graph

The simulator scores cards independently. That cannot express *"this card needs
that card"* or *"this card fires off what that one does"* — the two questions
that decide whether a hundred cards are a deck or a pile.

**Cards are never linked to cards.** A card links to the events it fires on and
the events it causes. Synergy is then a path:

```
Krenko ──CAUSES──▶ (creature-etb) ◀──TRIGGERS_ON── Purphoros
```

Nobody authors that pair. 31,830 cards would be 500 million authored pairs; this
is ~130,000 edges, and a card added tomorrow synergises with everything relevant
the moment it lands.

## Running it

```bash
cd graph
docker compose up -d                       # http://localhost:7474  neo4j / mtggraph
node ingest/01-fetch.mjs                   # Scryfall bulk -> .cache
node ingest/02-build-csv.mjs               # -> .import/*.csv
cp .import/*.csv .data/import/             # or mount, see compose
cat schema/constraints.cypher ingest/03-load.cypher | \
  docker exec -i mtg-graph cypher-shell -u neo4j -p mtggraph
```

Then `queries/` holds parameterised Cypher. Neo4j Browser at :7474 is the
exploration surface while the model is still being shaped.

## The model

| node | grain | notes |
|---|---|---|
| `Card` | one per Scryfall `oracle_id` | printing-independent; reprints do not split it |
| `Printing` | one per physical printing | where set, collector number, **foil** and price live |
| `Event` | a thing that happens | creature-etb, land-drop, creature-dies, attack, upkeep… |
| `Resource` | a countable thing | mana, treasure, card, life, counter, token |
| `Role` | a functional slot | ramp, draw, removal, wipe, sac-outlet… **and supply roles** |
| `Mechanic` `Tribe` | printed vocabulary | from Scryfall keywords and subtypes |
| `Deck` `Collection` | your overlays | the only mutable part of the graph |

| edge | meaning |
|---|---|
| `CAUSES` / `TRIGGERS_ON` | the firing side and the listening side of an Event |
| `PRODUCES` / `CONSUMES` | the two sides of a Resource |
| `REQUIRES` | demand: hard means dead without it |
| `FILLS` | supply, weighted |
| `OWNS` | qty, ordered, bench, state — **the dynamic part** |
| `ASSIGNED_TO` | per deck: target, actual, state |

**Supply and demand share one Role vocabulary.** They did not on the first pass,
and every payoff in every deck reported as unsupported — a check that fires on
everything is worse than no check.

## Reminder text

Stripped before any ability is read. Scryfall prints reminder text in
parentheses; reading it as rules text once credited Bronze Guardian with a
+1/+1 counter doubler it does not have, worth 7.6 points of win rate.

## Extraction is the hard part, not the schema

The first run of `queries/03` returned Treasure-makers as Purphoros payoffs,
because the creature-token pattern made the word "creature" optional. The graph
was right; the edges were wrong. Treat every new pattern as guilty until a
query proves it — that is what the `queries/` folder is for.
