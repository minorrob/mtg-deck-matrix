# Wave 4 and after: the most-played 90% of Commander cards

*Rob, 2026-10-12: "after wave 3 define a wave 4+ to bring us to the 90% of all cards typically used." Written by the
engine lane's session, measured on main 013ecfc9 (Train E wave 1 in).*

## The target, measured

"Typically used" is measured as `game/tools/engine-top-cards.mjs` measures it. Over EDHREC's co-play for every legal
commander (`data/graph-played.json`), it takes the smallest set of cards, most-played first, whose appearances in
Commander decks add up to the share asked for.

| Share of all card appearances | Cards in the set | Defined today | Still to define |
| --- | ---: | ---: | ---: |
| 80% (`data/engine/top-cards.json`, today's tracked set) | 3,239 | 1,273 | 1,966 |
| 85% | 4,318 | 1,334 | 2,984 |
| **90%** | **5,869** | **1,411** | **4,458** |

**What it means for a player.** A table refuses a deck with even one card it cannot play. Measured over each
commander's typical deck (its 99 most-played cards, weighted by how many decks it leads):

| Defined cards | Share of typical Commander decks fully playable |
| --- | ---: |
| Today | 0% |
| The whole 80% set | 1% |
| The whole 90% set | 12% |

So the 90% set is the right foundation: it covers nine card slots in ten. On its own, though, it does not make most
decks playable, because every deck carries a tail of niche cards. Reaching "most decks play" needs that tail too.
Rob's decision 3 (below) reaches it with more waves beyond 90%, not by loading cards on demand.

## The two ways to define cards, and their costs

| | **A. Session workers** (Trains A to E): chosen | **B. The card loader** (`game/tools/engine-compile.mjs`, PLAN §3.4): declined |
| --- | --- | --- |
| How | Each card hand-authored, with scenarios for its abilities and their edges. Each engine change comes with breaks. | Sonnet 5.5 writes each card from its oracle text. Four checks decide whether it is the card: the schema, fidelity by code and by a Haiku read-back, a smoke game, and rules flagged for a ruling. |
| Quality | The highest: every ability shown working, every guard able to fail. | Checked, but stored *provisional*. Under D5 no table seats it until a played game or Rob confirms it. |
| Cost | The session's weekly usage. Wave 1 took about 2% of a week for 44 cards, so 4,458 cards is about two to three weeks of full use. | Rob's API key, in dollars. It has never run against the API: its 28 ledger entries were written by a session, at $0. PLAN §3.4 asks for a 200-card sample, with its pass rate and cost, before any more. |
| What it can't do | — | A card whose rules the engine lacks fails its checks. Constructs must exist first. |

## The plan, as Rob decided it (A only)

1. **Waves 4a to 4c: the constructs that block the most cards.** Session workers build these, as in Trains D and E.
   They come from the "most-played 80%" table in `docs/engine/coverage.md`:
   - remembered objects (86 cards);
   - remembered changed objects (80);
   - "may play" from other zones (62);
   - token and counter replacements (16, 12);
   - counts: of library cards, of cards entered this turn, and of your life total;
   - the Ring tempting you (11);
   - Repeat (8), choose a player (8), roll dice (7), change targets (7).

   The monarch (10) is already in progress. Each wave is a few constructs plus the cards they unlock, each proved as
   Train E proves its cards.
2. **Wave 5 onward: definitions of the 90% set,** most-played first.
   - Waves of 60 to 90 cards, Train E style.
   - Each wave costs about 2 to 3% of a week.
   - A card whose rule the engine lacks waits for a construct wave rather than being approximated.
3. **Sweeps along the way.** G1-style sweeps with `tools/fuzz-live.mjs` run over decks drawn from the defined part of
   the 90% set: whole games, replayed, and checked for leaks. They find stalls and rules bugs, as G1-L did.
4. **The tail.** A deck with a card the engine lacks is still refused, by name. More waves beyond 90% reach the tail,
   in time.

**Each wave is its own PR:** suites, breaks, seeded games, and a release to staging, as in Trains D and E. The week's
usage is read before each wave. The work stops for a handoff at 90% of the week's usage (Rob's rule).

## Rob's decisions (2026-10-12)

Rob: *"I don't want to use API usage for this. Continue forward, and your plan is auto-approved."*

1. **The target:** the most-played 90% of card appearances, 5,869 cards.
2. **No card loader (B).** Every card is defined by session workers (A), with scenarios and breaks, in waves.
3. **D5 is unchanged.** No card goes provisional, since every card is hand-authored and proved by its scenarios. Loading
   the tail on demand through the API is out. The tail is reached by more waves, beyond 90%, in time.

**The order:**
1. Train E's waves 2 and 3, Rob's library. Done (#720, #721): 1,216 of his 1,217 cards play.
2. Wave 4a, the four constructs that block the most cards (#722).
3. **Wave 4b onward: the most-played cards first, with the constructs they need.** This is reordered from "constructs,
   then definitions". Measured after wave 4a, 1,396 of the 80% set's 1,892 undefined cards already have every rule.
   So do 99 of the next 120 most-played (ranks 23 to 500), among them Cyclonic Rift, Toxic Deluge, Swan Song,
   Teferi's Protection and The One Ring. A deck is refused for a single card it can't play, and a staple sits in more
   decks than any card a rare construct unlocks. Each wave of 120 also builds the small constructs its cards need,
   one family per lane:
   - remembered objects;
   - targets and the top of the library;
   - keywords;
   - activation limits and costs.

   The larger constructs (emblems, replacements on every route to a graveyard, divided counters, the Ring, dice) come
   in their own waves, when the most-played cards still waiting need them.

The week's usage is read before each wave, and the work stops for a handoff at 90%.
