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

Run from the repository root, not from `graph/` — the ingest scripts read
`data/master-v2.json` by relative path.

```bash
docker compose -f graph/docker-compose.yml up -d   # :7474  neo4j / mtggraph

node graph/ingest/01-fetch.mjs           # Scryfall bulk  -> graph/.cache  (~30 MB)
node graph/ingest/02-build-csv.mjs       # cards + edges  -> graph/.import
node graph/ingest/04-fetch-edhrec.mjs    # EDHREC pages   -> graph/.cache/edhrec
node graph/ingest/05-build-edhrec-csv.mjs

# compose mounts graph/.import at the container's import directory, so the CSVs
# are already in place -- nothing to copy.
cat graph/schema/constraints.cypher \
    graph/ingest/03-load.cypher \
    graph/ingest/06-load-edhrec.cypher \
  | docker exec -i mtg-graph cypher-shell -u neo4j -p mtggraph
```

About five minutes end to end, most of it the Scryfall download. Everything is
rebuilt from source, so a wiped `.data` costs only the wait.

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

## The second signal: EDHREC

`ingest/04-fetch-edhrec.mjs` caches one JSON page per commander; `05` turns it
into `PLAYED_WITH` edges carrying `inclusion` (share of that commander's decks
running the card) and `synergy` (EDHREC's own figure: inclusion here minus
inclusion in comparable decks).

**This is the one card-to-card edge in the model, and it is different in kind.**
Everywhere else a card links to an Event or a Resource, because authored pairs
neither scale nor generalise. This edge is *measured* — an aggregate over a very
large number of real decklists, scoped to a commander. Nobody typed it, and it
moves when the format moves.

### Why it is worth having both

`queries/06-mechanical-vs-empirical.cypher` puts the two side by side:

| verdict | meaning |
|---|---|
| `AGREE` | text and field both say yes — highest confidence |
| `PLAY-ONLY` | the field plays it heavily, our rules see nothing — **an extraction gap** |

Run against six commanders, that column immediately found three:

1. **Proliferate was not in the event vocabulary at all.** Atraxa — whose whole
   deck is counter manipulation — returned *zero* mechanical matches. Every card
   in her top twenty read PLAY-ONLY. Adding the event took her to 7 of 8 AGREE.
2. **Lands were excluded from `CAUSES`.** Kher Keep makes a creature token every
   turn and is in 54% of Purphoros decks; it was invisible.
3. **Co-payoffs were unreachable.** The path only looked for
   `CAUSES→Event←TRIGGERS_ON`, so two cards cashing the *same* event never
   connected. Impact Tremors is in **87%** of Purphoros decks and is exactly that
   shape. The query now walks `CAUSES|TRIGGERS_ON` on the inbound leg.

Three still read PLAY-ONLY on Purphoros and are genuinely harder: **Norin the
Wary** (flickers itself, so the token-creation rules miss it), **Skullclamp**
(pays off creatures dying, one hop further out), and **Panharmonicon** (doubles
triggers — a card about other cards' rules). They are left as known gaps rather
than papered over.

Keep this query in the loop whenever an edge rule changes. It is the only check
that catches an extraction rule which is confidently, silently wrong.
