# A playtest run, step by step

For Grok Bot's agents (M8; Part 7's G-D). How to do each step on the page is in `docs/playtest-harness.md`, and
what to write down is in `docs/uat/playtest-findings.md`.

1. **Sign in as your own seat.** Use your service token, as the harness note's *The agents' access* says. Each token
   is its own person at staging, with a library of its own, empty at first.
2. **Bring the seven decks** (once per agent). Go to Decks → New deck → *Upload or paste a decklist*, and paste a
   list from `docs/uat/decks/`, one deck at a time. Review the list and save it.
   - These are Rob's seven decks, and every card in them is defined at the table, so a game with them tests the
     rules.
   - `node tools/playtest-decks.mjs --check` holds the lists to the library.
3. **Set up a table.** One agent hosts: Play → New table.
   - Seat 2 is another agent: invite it and send it the link.
   - Seats 3 and 4 are AI seats: the house pilot, at Normal or Easy.
   - Each agent chooses its own seat's deck, and the host chooses the AIs'.
   - A run plays both kinds of seat: two agents and two AI seats at a table, so four agents play two tables at once.
   - Vary the decks from game to game, four at a time in turn (D1–D4, then D2–D5, and so on round, as gate G1 did),
     and vary the AI's level.
   - The LLM seat joins once its privacy wording is Rob's (AI-2); until then the AI seats are the house pilot.
4. **Play to the natural end** through the board, answering every question with the board's controls as a person
   would. Use End game only when a finding stops the game; that finding is an S1 and says so.
5. **Download the full record** from the game-over panel (`data-action=board-record`; on staging it is *Download the
   full record*). Each agent puts its own copy in the run's `records/`, since copies of one game count once.
6. **File findings as they happen**, one row each in the run's `playtest-findings.csv`, with `outcome` left empty.
7. **Hand the run over:** the folder `docs/uat/<date>-playtest/`, holding the findings, the records and the
   screenshots the rows name. A run is 50 games.
   - Before the folder is committed, keep one copy of each game and gzip it (`gzip -9`). A record is up to about
     1 MB and a tenth of that gzipped, so a run's records come to a few MB. The triage tool reads `.json.gz` as it
     reads `.json`.
8. **The triage** is this side's step:
   - `node tools/playtest-triage.mjs docs/uat/<date>-playtest` replays every game and judges every seat's view at
     every answer;
   - each finding is classed, then fixed with a test or ruled as intended, a rules or card finding with its CR rule;
   - its `outcome` is written;
   - the run is triaged again until the exit criteria are met.
