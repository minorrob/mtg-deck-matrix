# The brief for every session of the library card load (2026-10-21)

You are one of seven parallel sessions loading the cards of Rob's library that no table can play yet, or the integration
session after them (`README.md` here has the numbers and the table of sessions). Your prompt names your lane and its file.

## Your card list

`docs/engine/library-load-2026-10-21/lane-<lane>.json` lists your cards most-wanted first. Each card has:
- **scope**: `live` cards are in the seven decks Rob plays from boxes (D1–D7) and come first; `deck` cards are in a
  design deck; `library` cards are owned only.
- **liveDecks**, **decks** and **owned**.
- **rank**: its place among the most-played Commander cards (`data/engine/top-cards.json`), or null.
- **type** and **layout**.
- **compiler**: the card compiler's verdict (`game/tools/card-compiler.mjs`):
  - `unknown`: sentences no defined card writes yet, listed in `gaps`;
  - `structure`: more than one face;
  - `vetoed`: a template that failed calibration.
- **needs**: the coverage tool's estimate of the engine constructs the card lacks. It is measured at the boundary
  (ADR-001), and it is an estimate, not a promise: read each card's oracle text and rulings yourself.

If `docs/engine/library-load-2026-10-21/` is not on `main` yet, read it from the branch that made it,
`git show origin/claude/focused-feynman-tt20o3:docs/engine/library-load-2026-10-21/<file>`, and do not commit a copy.

## Read first

- `AGENTS.md`, `CLAUDE.md`, and `docs/ACTIVE.md`: the top, the lanes table, and "Library card load, 2026-10-21".
- `game/tools/batch/README.md`, the procedure. Follow it:
  - `oracle-show.py`;
  - a generator importing `cardlib.py`, in your scratch space and not the repository;
  - `check-cards.mjs` until it reports 0 failed;
  - `engine-definitions.mjs --write` and `engine-coverage.mjs --write`;
  - the data inventory, the engine suites, and a breaks file.
- `docs/handoff-2026-10-12/BRIEF-wave.md`, the last wave's brief. Its "Wave 4b added these" and "Wave 4a added these" lists
  are constructs that exist: use them, and never build one again.
- The definitions in `game/engine/cards/` are the grammar. Find a card that already does what yours does (grep the
  definitions for the effect) and copy its shape.

## One rule, one lane

Each lane owns the engine rules its theme needs. A card whose rule belongs to another lane is one you stop on, saying exactly
what it needs. Before building a rule, search for it (`game/engine/script/effects/`, `game/engine/rules/`,
`game/engine/keywords/`): never build a second version.

| Lane | Owns |
| --- | --- |
| L1 walkers | Loyalty abilities and their costs; loyalty counters; planeswalker triggers; activating loyalty abilities twice (Oath of Teferi); emblems (CR 114: Teferi, Hero of Dominaria; Ajani Steadfast; Mordenkainen); "cast spells only any time they could cast a sorcery" (Teferi, Time Raveler); two-faced cards (transform, modal double-faced) and mutate (CR 702.140) |
| L2 stack | Counterspells and conditional counters; "can't cast spells this turn"; spells cast with no mana spent; phasing (CR 702.26); morph (CR 702.37); surge; spree; flash grants; gaining control until end of turn; cards from outside the game (CR 400.11), which is not built (stop unless it is small) |
| L3 graveyard | Returning cards from graveyards; dies and leaves-the-battlefield triggers; returning a creature that died; exile until it leaves (Hostage Taker, including casting the exiled card); manifest dread; shuffling a card into its owner's library |
| L4 combat | Attack and block triggers and requirements ("must be blocked if able", "can't be blocked by more than one"); granted double strike; protection from creatures and from colors (Black Knight's veto); bushido (CR 702.45); saddle; Equipment, auto-attach and opening-hand permanents (Leyline Axe) |
| L5 tokens | Token creation; +1/+1 and other counters (fuse); sacrifice outlets and costs; lifegain payoffs; cumulative upkeep (CR 702.24); survival; blight |
| L6 spells | Draw and discard triggers; triggers on a spell's mana value; landcycling; "if you cast it"; tutors; everything else in your list |
| Candidates | No new rules: review and promote with `game/tools/card-waves.mjs` (`docs/engine/plan-card-load-program.md`, "Waves, built") |

## Rules (the waves', all still in force)

- **Every card** is `game/engine/cards/<letter>/<slug>.json` plus `<slug>.scenarios.json`. The scenarios show every
  ability doing the right thing, and the edges: a choice with nothing to choose, an "up to", an "if you can't".
- **Faithful to the oracle text and the Comprehensive Rules.** Cite CR numbers in comments; never paste CR text.
- **Engine changes are minimal**, in their own module's terms, with a comment saying which card text each serves and the rule
  it follows. A new effect primitive also goes in `game/engine/vocabulary.mjs`, `docs/engine/PLAN.md` §12.2 and the count in
  `tests/engine-vocabulary.mjs`.
- **Tests must be able to fail.** Write one breaks file, `game/tools/batch/breaks-libload-<lane>.py`, with one break per
  engine change (each guard, each branch). Run `python3 game/tools/batch/breaks.py <file>` until it reports `missed: []`. A
  break nothing catches is a missing check: add one. Never edit files while a breaks run is in progress.
- **A card you cannot make faithful without a large new construct: stop on it.** Say exactly what it needs and why, and do the
  others. Never fake it or approximate it.
- **Players decide** (AGENTS.md): who, which, in what order, whether. Nothing a rule leaves to a player is decided in code.
- **ADR-001: never Forge.** American English everywhere.
- **No API usage:** do not run `game/tools/engine-compile.mjs`.
- **Never touch** `data/live-load.json`, `data/live-state.json`, `release/`, the wrangler config, or another lane's cards.
- **Don't edit `docs/ACTIVE.md` or the README's suite count by hand in a lane.** The integration session does both, once.
  If you add a suite, set the README count to `ls tests/*.mjs | wc -l` in your branch; the integration sets it again.
- **Read narrowly:** grep and line ranges, never a whole generated file or data file; cut command output to what you need.
  If you use workers, ask each for a report of 30 lines or fewer.
- **Note the week's usage** when you start and when you stop, and put the points used in your PR.

## Done means (a lane)

- `node --stack-size=4000 game/tools/batch/check-cards.mjs` reports 0 failed.
- `node game/tools/engine-definitions.mjs --check` and `node game/tools/engine-coverage.mjs --check` are current.
- `node tools/data-inventory.mjs --check` is current.
- These pass: `tests/engine-cards.mjs`, the `tests/engine-*.mjs` you touched, `tests/table-basics.mjs`,
  `tests/data-integrity.mjs` and `tests/feature-wiring.mjs`.
- `node tools/library-engine-index.mjs --check-lane docs/engine/library-load-2026-10-21/lane-<lane>.json` lists only the
  cards you stopped on.
- Your breaks file reports `missed: []`.
- `bash tools/local-ci.sh HEAD 0` reports SCAN PASS before the push.
- Your branch is pushed, with a **draft** PR titled `Library load <lane>: <n> of <m> cards`. Don't mark it ready, don't merge
  it and don't release: the integration session merges all seven. Commit messages end with your session's attribution lines.

## The report (your final message, 30 lines or fewer)

- Each card: defined, or stopped and exactly what it needs, plus its scenario count.
- Each engine change: the file and what it does.
- The suites you ran, with their result lines, and the breaks result.
- The branch, the commit SHAs and the PR URL.
- The week's usage at the start and at the end.
