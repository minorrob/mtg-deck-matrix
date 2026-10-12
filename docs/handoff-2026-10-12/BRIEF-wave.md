# Wave 4c: the next most-played Commander cards the table can't play yet

You are one of four workers in wave 4c (docs/engine/plan-coverage-90.md, on Rob's go). Each lane defines about twenty of
the most-played Commander cards (data/engine/top-cards.json, the 80% set, ranks 501 to 723) that the table cannot play
today (`tableCards(name)` in cloud/game-room.mjs returns null). They are in every deck that plays them: a staple done
right is worth more than any rare construct. Most need nothing new. Each lane's cards share a THEME (lands, the graveyard,
tokens and counters, spells and draws), so one lane owns each rule they need. Your lane, its family and its cards are in your prompt, most-played first. Work ONLY in your own git worktree. Do not push and do not open a PR; commit on your local branch and report.

## Read first
- AGENTS.md (rules of engagement), CLAUDE.md, docs/ACTIVE.md (top section).
- game/tools/batch/README.md: the procedure. Follow it: oracle-show.py, a generator importing cardlib.py in YOUR
  scratch space (not the repo), check-cards.mjs to 0 failed, engine-definitions.mjs --write, engine-coverage.mjs
  --write, data-inventory, the engine suites, and a breaks file.
- Existing definitions in game/engine/cards/ are the grammar: find a card that already does what yours does
  (grep the definitions for the effect: "empowerJace", "behold", "modal", "chooseCard", "exchange", "changeTarget",
  "devotion", "experience", "costReduction" ...) and copy its shape.

## Rules
- Each card: `game/engine/cards/<letter>/<slug>.json` and `<slug>.scenarios.json`, scenarios that show its every
  ability doing the right thing AND the edges (a choice with nothing to choose; an "up to"; "if you can't").
- Faithful to the oracle text and the Comprehensive Rules. Cite CR numbers in comments; never paste CR text.
- An engine change goes in its own module's terms, with a comment saying which card text it serves and the rule.
  Keep it minimal. A new effect primitive also goes in game/engine/vocabulary.mjs, docs/engine/PLAN.md §12.2 and the
  count in tests/engine-vocabulary.mjs.
- Tests must be able to fail: write a breaks file `game/tools/batch/breaks-wave4c-<your-lane>.py` with one break
  per engine change (each guard, each branch) and run `python3 game/tools/batch/breaks.py <file>` until "missed: []".
  A break nothing catches is a missing check: add it. Never edit files while a breaks run is in progress.
- A card you cannot make faithful without a large new engine construct: stop on that card, say exactly what it
  needs and why, and do the others. Do not fake it, do not approximate it.
- ADR-001: never Forge. American English.
- Never touch: data/live-load.json, data/live-state.json, release/, wrangler config, anything outside your worktree.

## Done means
- `node --stack-size=4000 game/tools/batch/check-cards.mjs` 0 failed.
- `node game/tools/engine-definitions.mjs --check` and `node game/tools/engine-coverage.mjs --check` current.
- `node tools/data-inventory.mjs --check` current; README suite count = `ls tests/*.mjs | wc -l` if you add a suite
  (and its README list entry; tests/data-integrity.mjs checks both).
- tests/engine-cards.mjs, tests/engine-*.mjs you touched, tests/table-basics.mjs, tests/data-integrity.mjs pass.
- `tableCards(name)` is non-null for each card you defined (check with node).
- Your breaks file: missed: [].
- One commit (or a few) on your branch, message ending with the two attribution lines:
    Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_0117w9NgFp5PywoLmnpLsKQf

## Report (your final message)
For each card: defined or not; the engine change it needed (file, what); scenarios count. Then: the suites you ran
and their result lines, the breaks result, your branch name and commit SHA(s), and anything left open.

## Wave 4c notes

- **Your base:** commit 856eba5b (main plus wave 4b). Your worktree may start older:
  `git checkout -b wave4c-<your-lane> 856eba5b` first, and check `git log --oneline -3`.
- **"Every rule" is the coverage tool's estimate, not a promise.** `game/tools/engine-coverage.mjs` measures each card
  with another engine's script vocabulary (ADR-001: that vocabulary never enters `game/engine/`). Read each card's
  oracle text and its rulings yourself. Example: a land that gives another land a basic land type also gives it that
  type's mana ability (CR 305.6, 305.7). If the engine lacks a rule a card needs and it is small, build it in the
  engine's own terms. If it is large, stop on the card and say exactly what it needs.
- **Wave 4b added these, so use them rather than building again:**
  - **Land types:** a land given a basic land type has that type's mana ability (CR 305.6-305.7; rules/layers.mjs,
    `intrinsicMana`, once at the end of layer 4). Never build this again.
  - **Auras and the graveyard:** an Aura enchanting a creature card in a graveyard (Animate Dead); `enchants: true`.
  - **Targets and libraries:** `rearrangeTop`; changeTargets `to: "self"` and `may`; "whenever you cast or copy"
    (`orCopy`); a delayed trigger at "your next main phase"; X counted on the stack.
  - **Keywords:** eternalize, extort, exalted, gift (all six kinds), an opening-hand action (Gemstone Caverns), riot
    granted.
  - **Others:** `castByYou`; protection over the creatures a spell named; an attack requirement for the turn;
    a triggered mana ability adding the chosen color; `moveZoneAll` under the caster's control; `removeKeywords` in
    layer 6; tokens entering tapped by a replacement; `chooseCard` over several zones; `extra-land-drop` with a count;
    `powerAboveBase`; signed power amounts; `rememberedCount` `controlledBy: "most"`; player hexproof.
  - **Activations and costs:** a cant-activate static's `of` (Grand Abolisher), its mana abilities too;
    spells-cost-more's `targeting` and `life` (Terror of the Peaks); X paid in life as an additional cost (Toxic Deluge);
    imprint as a linked exile (Chrome Mox); the creatures attacked with this turn (`creaturesAttackedWithThisTurn`);
    a trigger's "choose one or more"; "from anywhere other than the battlefield"; all counters moved (The Ozolith);
    `powerAboveOthers`; the command zone face up to a choice.
- **Wave 4a added these too:**
  - **Playing from other zones:** `play-from` with a condition, an additional cost and `anyMana`; permissions kept
    per permanent type (`perType`); `mayPlay` granting a zone's cards with a count, `from` and `payLife`;
    `castFromYourHand`; a Case's `solved`; "look at the top card any time".
  - **Moved cards:** flickered cards return together; `returnTapped`; `only` among moved cards; `link` for cards
    exiled from a graveyard; `dig` with `all: true`; the `unattach` cost; `sameMode` with a fixed count; tokens that
    left the battlefield stay gone (CR 111.8).
  - **Remembered objects:** a copy's `except.entersWithCounters`; loyalty copied (CR 707.2); shadow; "its activated
    abilities can't be activated"; `ownedByControllerOf` targets; `targetsLegal`; `greatestPower`; each player's own
    chosen color.
  - **Replacements:** token creation as grouped events; `tokens-each`; `tokens-plus` by subtype and with the effect's
    own instructions; "instead" replacements ordered under CR 616.1e-f; a cost's counters not doubled; an entering
    permanent's own replacement not applied to itself (614.12); counter events with who put them (`putBy`).
- **Not built:** emblems (CR 114); cards from outside the game (400.11); megamorph; decayed; counters divided among
  targets at activation (601.2d); a replacement on every route to a graveyard (a resolving spell, a discard, cleanup);
  a "discard X cards" cost. A card that needs one of these is one you stop on.
- **One rule, one lane.** Each lane owns the engine rules its THEME needs:
  - k1: lands (land types, land drops, mana from lands, Urza's lands);
  - k2: the graveyard and combat;
  - k3: tokens and counters;
  - k4: spells, draws and discards.

  A card whose rule belongs to another lane's theme, or to a construct shared across themes (layers, the stack,
  priority), is one you stop on, saying exactly what it needs. Never build a second version of a rule that exists:
  search for it first.
- **Timing gate:** another process verifies wave 4b on this machine. Until the file
  <scratch>/suites-4c-gate.txt contains a line starting with "passed", run no check-cards, no suites and no breaks.
  Read and write only. To wait, use a background shell until-loop.
- **The README's suite count:** if you add a suite, set it to `ls tests/*.mjs | wc -l` in your worktree. The merge
  sets it again.
- **Rob's rule for this work:** session workers only, no API usage. Do not run `game/tools/engine-compile.mjs`.
- **Players decide.** Never let the engine make a choice that belongs to a player: who, which, in what order, or whether.
