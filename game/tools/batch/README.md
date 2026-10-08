# Building a card batch (M4 phase 3)

How the engine grows, one proven pull request at a time, in the catalog's order: pick the next thing the most-played
Commander cards need, build it in the engine, define the cards it unlocks, and prove both. These helpers are what the
batches from 40 on were built with. Run everything from the root of the batch's worktree, with the workflow's Node
first on `PATH` (on Personal-HP: `C:/Users/robmi/CrankMagic/workbench/node22/node_modules/node-win-x64/bin`).

| Helper | What it does |
| --- | --- |
| `held-alone.mjs [pattern ...]` | Which most-played cards one missing thing alone holds back: the cards a batch building it can define |
| `oracle-show.py <name> ...` | A card's type line, cost, power and toughness, and oracle text, from `data/engine/oracle.json` |
| `cardlib.py` | Imported by a batch's generator: identity from the oracle data, scenario helpers, `Batch.write` |
| `check-cards.mjs` | Every definition playable, faithful and through its smoke game, and every scenario run, card by card |
| `breaks.py <breaks-file> [label ...]` | Breaks each change in turn, after a green baseline, and reports any break no suite catches |
| `build-catalog-page.py <out> "<line>"` | Rob's Engine Catalog page from `game/docs/engine-catalog.json` |
| `../../../tools/quick-check.sh <suite> ...` | Before a push: the scan and merge with main, then the touched suites |

## A batch, step by step

1. **Pick.** `docs/engine/catalog.md`, *What to build next*, at the top of the stack, then
   `node game/tools/batch/held-alone.mjs <Name>` for the cards each candidate alone holds back, and
   `python game/tools/batch/oracle-show.py <card> ...` for their text. Take what is compact and well defined; a wide,
   many-form construct (remembering an object, MayPlay) is its own project. Say in the PR what was skipped and why.
2. **Branch.** `claude/cards-batch-N`, from `claude/cards-batch-(N-1)` while the stack is open (each PR is based on the
   one before), with a `node_modules` junction in a new worktree.
3. **Build the engine change** in its own module's terms, each piece with a comment saying what card text it serves
   and the rule it follows (CR numbers only -- no Comprehensive Rules text in the repository). Credit a construct in
   `game/tools/engine-constructs.mjs` only when its forms are essentially built; a credit with no new code (the thing
   was built already) says so.
4. **Define the cards** with a generator in your own scratch space, importing `cardlib.py` (its docstring has the
   shape). The grammar is in the definitions already written (`game/engine/cards/`), `game/engine/cards/index.mjs`
   (`TRIGGERS`), `game/engine/script/filter.mjs` (`SELECTOR_KEYS`) and `game/engine/script/amount.mjs`. Each card needs
   scenarios. Then `node --stack-size=4000 game/tools/batch/check-cards.mjs` until it says 0 failed. A card with a
   learned definition stored provisional (`data/engine/scripts`, seated at no table) is confirmed the same way: written
   here by hand with its scenarios, then its stored record and its entry in `tests/fixtures/learned-scenarios.json`
   withdrawn, and its row in `data/engine/onboarding-ledger.json` set to `confirmed`, naming the definition
   (`tests/engine-learned.mjs` holds the two to each other; Tegwyll, Duke of Splendor was the first).
5. **Write the batch's suite**, `tests/engine-<topic>.mjs` -- check the name is free first (`ls`), since the Write tool
   overwrites silently -- for what the scenarios cannot reach: three or four players, the edges, the catalog's credit.
6. **Regenerate** the measured documents, and the data inventory if a file under `data/` gained a reader:

   ```sh
   node game/tools/engine-coverage.mjs --write
   CRANKMAGIC_RULES_ROOT=<rules folder> node game/tools/engine-catalog.mjs --write --rules <rules folder>/MagicCompRules-<date>.txt
   git add -A game/engine/cards tests/engine-<topic>.mjs && node tools/data-inventory.mjs && node tools/data-inventory.mjs --check
   ```

   README: "There are N Node suites here" must equal the count of `tests/*.mjs`, and the new suite needs its list entry.
   A new effect primitive also goes in `game/engine/vocabulary.mjs`, `docs/engine/PLAN.md` §12.2 and the count in
   `tests/engine-vocabulary.mjs`.
7. **Run the engine suites** (`tests/engine-*.mjs`, `tests/data-integrity.mjs`, `tests/feature-wiring.mjs`).
8. **Break it.** A breaks file (shape in `breaks.py`) with one break per engine change -- each guard, each branch, each
   credit -- then `python game/tools/batch/breaks.py <file>`. A break no suite catches is a missing check, or code
   nothing reaches: add the check, or remove the code.
9. **Commit, check, push.** `tools/quick-check.sh <the touched suites>`, push, and a draft PR on the previous batch's
   branch; its body says what was built, the cards, the calls made, what was left out, the coverage and the proof.
10. **Update Rob's page**: `python game/tools/batch/build-catalog-page.py <scratch>/engine-catalog.html "<line>"`, then
    publish it to the page's existing URL.

## What scenarios can and cannot do

`game/engine/cards/scenario.mjs` plays each one through the rules from turn 1's main phase. They pay mana exactly
(`Batch.pay` names the lands); a library's top card is drawn before the next turn's main phase; a trigger's target --
and the order of two triggers at once (`{"settle": true}`) -- is answered before it resolves; another player acts only
after `{"pass": 1}`, with its `seat` named; nobody declares blockers; exile is one shared zone; poison is under
`players[i].health.poison`; a seat's battlefield lists permanents by owner, so control is checked with `controls`; and
`later(...)` puts a card on the battlefield after the first upkeep, so its upkeep trigger does not fire before the
scenario begins.
