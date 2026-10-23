# The brief for every session of the card load of 2026-10-23 (wave 4d)

You are one of six parallel sessions loading the next big batch of Commander cards. `README.md` here has the numbers and
the table of sessions. Your prompt names your lane and its file.

## Your card list

`docs/engine/card-load-2026-10-23/lane-<lane>.json` holds two lists, each most-wanted first.

**`review`: candidates to review and promote.** The card compiler (`game/tools/card-compiler.mjs`) already translated these
and they play at playtest tables. A review reads each one against its oracle text and what its smoke game showed, then
promotes the exact ones to final cards. This is cheap; do it first.

**`cards`: cards to write by hand,** with:
- `scope`: `library` (in Rob's library) or `top` (one of the most-played Commander cards);
- `rank`: its place among the most-played cards (`data/engine/top-cards.json`);
- `type` and `layout`;
- `compiler`: the card compiler's verdict, with the sentences no defined card writes yet in `gaps`;
- `needs`: the coverage tool's estimate of the constructs it lacks. That is measured at the boundary (ADR-001) and is an
  estimate, not a promise: read each card's oracle text and rulings yourself.

If `docs/engine/card-load-2026-10-23/` is not on `main` yet, read it from the branch that made it,
`git show origin/claude/focused-feynman-tt20o3:docs/engine/card-load-2026-10-23/<file>`, and do not commit a copy.

## Read first

- `AGENTS.md`, `CLAUDE.md`, and `docs/ACTIVE.md`: the top, the lanes table, and "Card load, 2026-10-23".
- `game/tools/batch/README.md`, the procedure for writing a card. Follow it:
  - `oracle-show.py`;
  - a generator importing `cardlib.py`, in your scratch space and not the repository;
  - `check-cards.mjs` until it reports 0 failed;
  - `engine-definitions.mjs --write` and `engine-coverage.mjs --write`;
  - the data inventory, the engine suites, and a breaks file.
- `docs/engine/plan-card-load-program.md`, "Waves, built (step 6)": the review and promotion procedure.
- `docs/handoff-2026-10-12/BRIEF-wave.md`, the last hand wave's brief. Its "added these" lists are constructs that exist:
  use them, and never build one again.
- Constructs built since then exist too. Search the engine before building anything; the library load's lane PRs
  #826–#831 and #837 name what they added. Among them:
  - emblems and the Ring;
  - mutate;
  - spree;
  - manifest dread;
  - phasing;
  - a player's hexproof from a color;
  - "can't cast spells this turn";
  - opponents casting only at sorcery speed;
  - exile-until that remembers;
  - a cast permission paid with any mana.
- The definitions in `game/engine/cards/` are the grammar. Find a card that already does what yours does (grep the
  definitions for the effect) and copy its shape.
- Linear ROB-83 lists the constructs known to be missing. One your theme owns is yours to build if it fits the engine's
  terms.

## The order of work

1. **Review and promote your `review` list.**
   1. Run `node --stack-size=4000 game/tools/card-waves.mjs --review --cards "<the names, comma-separated>" --out docs/engine/waves/2026-10-23-<lane>.md`.
   2. Read the sheet. Check every ability against its oracle sentence and against what the game showed.
   3. Approve only what is exactly right.
   4. Run `node --stack-size=4000 game/tools/card-waves.mjs --promote "<approved>"`, then the three regenerations it names:
      `engine-definitions --write`, `card-compiler --write` and `engine-candidates --write`. `tests/table-candidates.mjs`
      requires that no candidate is a defined card.
   5. A candidate that is wrong: write it by hand as in step 2, or leave it with the reason.
2. **Write your `cards` list, most-played first**, per `game/tools/batch/README.md`, with scenarios and one breaks file.
3. **If you run long, stop at a clean point** rather than rush: everything committed passes its checks, and the report
   says where you stopped. A card you cannot make faithful without a large construct your theme does not own: stop on it,
   say exactly what it needs, and go on.

## One rule, one lane

Each lane owns the engine rules its theme needs. A card whose rule belongs to another lane's theme is one you stop on,
naming the rule. The lanes run at once, so another lane's new construct is not on `main` for you.

| Lane | Owns |
| --- | --- |
| L1 stack | Counterspells and conditional counters; copies of spells and abilities (Strionic Resonator, Reprieve); timing and casting restrictions; flash; planeswalker loyalty abilities and emblems beyond what exists; modal double-faced cards and transforming permanents (the Pathways, Valakut Awakening, Sea Gate Restoration, Bridgeworks Battle, Birgi, Etali, Ojer Taq); boast; cards from outside the game (CR 400.11: Cunning Wish, Extrapolate the Impossible; stop unless it is small) |
| L2 graveyard | Returning cards from graveyards; dies and leaves triggers; mill; retrace (Six); affinity (Emry); a replacement on every route to a graveyard (Dauthi Voidwalker); skipping the draw step and exiling discards (Necropotence); a discard as an entering cost (Mox Diamond); recursive creatures (Bloodghast, Reassembling Skeleton) |
| L3 combat | Attack and block triggers and requirements; evasion and protection; Equipment, auto-attach and equip costs; totem armor (umbras); dash (Ragavan); damage doubling and redirection (Gisela, Drakuseth); fog; forced attacks; the library's Bludgeon Brawl |
| L4 mana | Land types and land abilities; mana abilities, rituals and mana doubling; Urza's lands; Food (Gilded Goose); exert (Arena of Glory); hideaway (Spinerock Knoll); landcycling; land creatures (Dryad Arbor); searching another player's library (Opposition Agent) |
| L5 tokens | Token creation; +1/+1 and other counters, including counters divided at activation (The Earth Crystal, CR 601.2d); sacrifice outlets and costs; punisher choices that each player makes (Torment of Hailfire); anthems and -X/-X statics (Elesh Norn); lifegain payoffs |
| L6 spells | Draw and discard, wheels; "cards drawn this turn" (Sylvan Library); cost changes; tutors and searches; convoke with X (Chord of Calling); kicker; untapping permanents (Dramatic Reversal, High Tide); imprint copies cast without paying (Isochron Scepter; stop if copying a card is not built); everything else in your list |

## Rules (the waves', all still in force)

- **Every card** is `game/engine/cards/<letter>/<slug>.json` plus `<slug>.scenarios.json`. The scenarios show every
  ability doing the right thing, and the edges: a choice with nothing to choose, an "up to", an "if you can't".
- **Faithful to the oracle text and the Comprehensive Rules.** Cite CR numbers in comments; never paste CR text.
- **Engine changes are minimal**, in their own module's terms, with a comment saying which card text each serves and the rule
  it follows. A new effect primitive also goes in `game/engine/vocabulary.mjs`, `docs/engine/PLAN.md` §12.2 and the count in
  `tests/engine-vocabulary.mjs`.
- **Tests must be able to fail.** Write one breaks file, `game/tools/batch/breaks-w4d-<lane>.py`, with one break per engine
  change (each guard, each branch). Run `python3 game/tools/batch/breaks.py <file>` until it reports `missed: []`.
- **Players decide** (AGENTS.md): who, which, in what order, whether. Nothing a rule leaves to a player is decided in code.
- **ADR-001: never Forge.** American English everywhere.
- **No API usage:** do not run `game/tools/engine-compile.mjs`.
- **Never touch** `data/live-load.json`, `data/live-state.json`, `release/`, the wrangler config, or another lane's cards.
- **Read narrowly:** grep and line ranges, never a whole generated file or data file; cut command output to what you need.
  If you use workers, ask each for a report of 30 lines or fewer.
- **Note the week's usage** when you start and when you stop.

## What a lane does not do

The integration merges the six as one, so a lane:
- does **not** merge to `main`, and does not merge `main` into its branch more than once, at the start;
- does **not** mark its PR ready (Actions would run six times for nothing);
- does **not** edit `docs/ACTIVE.md`, Linear, or the README's suite count by hand. If you add a suite, set the count to
  `ls tests/*.mjs | wc -l` on your branch; the integration sets it again;
- does **not** resolve another lane's generated files.

## Done means

- `node --stack-size=4000 game/tools/batch/check-cards.mjs` reports 0 failed.
- `node game/tools/engine-definitions.mjs --check` and `node game/tools/engine-coverage.mjs --check` are current, and so
  is `node tools/data-inventory.mjs --check`.
- These pass: `tests/engine-cards.mjs`, `tests/card-waves.mjs`, `tests/table-candidates.mjs`, the `tests/engine-*.mjs` you
  touched, `tests/table-basics.mjs`, `tests/data-integrity.mjs` and `tests/feature-wiring.mjs`.
- `node tools/library-engine-index.mjs --check-lane docs/engine/card-load-2026-10-23/lane-<lane>.json` lists only what you
  stopped on. It checks both lists.
- Your breaks file reports `missed: []`.
- `bash tools/local-ci.sh HEAD 0` reports SCAN PASS.
- Your branch is pushed, with a **draft** PR titled `Card load w4d <lane>: <n> written, <m> promoted`. Its body is the
  report below. Commit messages end with your session's attribution lines.

## The report (the PR body, and your final message in 30 lines or fewer)

- **Promoted:** the cards, and any candidate you rewrote or left, with the reason.
- **Written:** each card defined, with its scenario count.
- **Stopped:** each card, and exactly what it needs.
- **Engine changes:** the file and what each does.
- **Proof:** the suites with their result lines, the breaks result, and the `--check-lane` line.
- **Where it is:** the branch, its head SHA, and the week's usage at the start and the end.
