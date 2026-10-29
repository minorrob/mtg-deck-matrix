# The brief for every subagent of the card load to 100% (2026-10-28)

**Scope update, October 28:** Rob chose the cards covering **95% of deck appearances**, not 95% of distinct names.
The exact 8,514-name loading target is `scope-95.json`; `README.md` records its sources and gate command. The least-played
remaining appearances are outside the loading target. Wave-0 accuracy debt and all proof requirements remain in force;
do not load tail cards just to reduce the full compiler's diagnostic count.

You are one of eight subagents of one wave. The orchestrator's prompt names your role, your wave number, your card list
and your branch. `README.md` here says where the load stands and what 100% means; `ORCHESTRATION.md` is the
orchestrator's procedure. This file is yours. Where it is silent, wave 4d's brief
(`docs/engine/card-load-2026-10-23/BRIEF.md`) and `game/tools/batch/README.md` hold, and they are the procedure for
writing a card: follow both.

If this folder is not on `main` yet, read it with
`git show origin/claude/engine-loading-orchestration-dd4c7f:docs/engine/card-load-100-2026-10-28/<file>`.

## The machine (Personal-HP, Windows 11)

| What | Where |
| --- | --- |
| Primary checkout (never switch its branch, never commit in it) | `C:\Users\robmi\CrankMagic\repo` |
| Your worktree (the orchestrator made it) | `C:\Users\robmi\CrankMagic\worktrees\load100\w<N>-<role>` |
| Node 22 (put first on `PATH`; no other Node) | `C:\Users\robmi\CrankMagic\workbench\node22\node_modules\node-win-x64\bin` |
| Python 3.12 | `python3` / `python` on `PATH` |
| `node_modules` | a junction to the primary checkout's, made by the orchestrator. **Never delete through it.** |
| Comprehensive Rules text (never committed, never quoted) | `C:\Users\robmi\CrankMagic\rules\MagicCompRules-20260925.txt`; set `CRANKMAGIC_RULES_ROOT=C:/Users/robmi/CrankMagic/rules` |
| GitHub | `gh`, signed in as `minorrob`; the repository is `minorrob/mtg-deck-matrix` |

Bash: `export PATH=/c/Users/robmi/CrankMagic/workbench/node22/node_modules/node-win-x64/bin:$PATH`.
PowerShell: `$env:Path = "C:\Users\robmi\CrankMagic\workbench\node22\node_modules\node-win-x64\bin;" + $env:Path`.
Run every command from the root of your worktree.

## The engine loader: the commands, what each costs

Measured on main `39a45706`, 2026-10-28.

| Command | What it does | Time |
| --- | --- | ---: |
| `python game/tools/batch/oracle-show.py "<Name>" ...` | A card's type line, cost, P/T and oracle text from `data/engine/oracle.json` | 1 s |
| `node game/tools/engine-compile.mjs --plan --cards "<A>,<B>"` | **Free, no key, spends nothing:** what the sentence library already writes of each card (its trusted abilities, arriving written) and the gap sentences only a writer must add. **Every card starts here.** | seconds |
| `node game/tools/batch/held-alone.mjs "<Name>"` | Which most-played cards one missing construct alone holds back | seconds |
| `grep -l '"<Name>": {' game/engine/cards/*/*.scenarios.json` | **Before defining any card:** another card's scenario fixture of that name. Rename it `Smoke <name>` in its own file, or `tests/engine-cards.mjs` fails | 1 s |
| `node --stack-size=4000 game/tools/batch/check-cards.mjs` | Every definition: schema, fidelity to its oracle text, its smoke game, every scenario. Baseline: 6,430 definitions, 11,023 scenarios, 0 failed | 95 s |
| `node --stack-size=4000 game/tools/card-waves.mjs --review --cards "A,B" --out docs/engine/waves/<date>-w<N>-<role>.md` | The review sheet for compiler candidates: each ability beside its oracle sentence, the templates and the cards that taught them, what the game showed | seconds |
| `node --stack-size=4000 game/tools/card-waves.mjs --promote "A,B"` | Writes the approved candidates into the directory, with the observed game as their scenario | seconds |
| `node game/tools/engine-definitions.mjs --write` | Regenerates `game/engine/cards/definitions.mjs` | seconds |
| `node game/tools/card-compiler.mjs --write` | Recompiles every undefined card; rewrites `data/engine/candidates.json`. Today: 25,616 undefined, 116 candidates | 40 s |
| `node game/tools/engine-candidates.mjs --write` | Regenerates `game/engine/cards/candidates.mjs` from the candidates file | seconds |
| `node game/tools/sentence-library.mjs` | The calibration: every defined card held out and translated from the others. Today 4,161 of 4,165 pass (99.9%) | 35 s |
| `node game/tools/engine-coverage.mjs --write` | `docs/engine/coverage.md` | 2 s |
| `node game/tools/engine-catalog.mjs --write --rules C:/Users/robmi/CrankMagic/rules/MagicCompRules-20260925.txt` | `docs/engine/catalog.md`, `game/docs/engine-catalog.json` | seconds |
| `git add -A game/engine/cards tests && node tools/data-inventory.mjs && node tools/data-inventory.mjs --check` | The data inventory reads the **git index**: add first, then regenerate | seconds |
| `node --stack-size=4000 tools/library-engine-index.mjs --check-lane <lane.json>` | Where each card of a lane file stands now: final, candidate, unloaded | 35 s |
| `python3 -u game/tools/batch/breaks.py <breaks-file.py> [label ...]` | Breaks each engine change in turn and reports any break no suite catches. Needs a green baseline of its suites first. `-u` or redirected output appears only at exit | minutes |
| `python game/tools/batch/anchors.py` | Every breaks file's anchors found exactly once (what `tests/engine-breaks-anchors.mjs` runs) | seconds |
| `node tests/<suite>.mjs` | One suite | varies |
| `bash tools/local-ci.sh HEAD 0` | The secrets and personal-address scan and the merge with `main`. **Must report SCAN PASS before any push** | a minute |

**No API endpoint, ever.** Rob, 2026-10-28: the run uses no API of his beyond the plan he is paying for. So: never
`engine-compile.mjs --yes` (it spends on a provider key; `--plan` is free and is the only form you run); never the AI door
or an LLM seat (`tools/fuzz-live.mjs --level` stays `easy` or `normal`, the house pilots; nothing sets an `AI_*`,
`ANTHROPIC_*` or `OPENAI_*` variable; `cloud/ai.mjs` is never called); never a model API from any script you write. The
one outside call allowed is Scryfall's public rulings endpoint (no key; send a `User-Agent`; at most 10 requests a
second; cache what you fetch in your scratch space). You and the other subagents are the writers; nothing else writes
a card.

**Rob's October29 exception:** “Allow this public Scryfall check” authorizes the existing read-only generator checks
to use Scryfall's public card-search endpoint without keys, costs or saved-data writes. The unchanged generators
suite passes93 checks on `55f133f5`; RUN.md records the resolved approval boundary. All provider/LLM restrictions above
remain in force. This exception does not authorize a different external service or an automated card writer.

## The roles

Each writer owns its theme's rules: a construct a card needs is built by the lane whose theme it is, once. If another
lane's theme owns it, stop on the card and name the construct; the orchestrator routes it. The themes are
`tools/library-engine-index.mjs`'s `THEMES`, and its lane files carry each card's theme.

| Role | Branch suffix | Cards | Rules it owns (beyond its cards' own) |
| --- | --- | --- | --- |
| **W1 faces** | `w1-faces` | Lane files `faces` and `walkers`: split, adventure, modal double-faced, transform, flip, meld, prepare, rooms, mutate; planeswalkers, sagas, battles | Layouts and faces; loyalty; emblems; battles (ROB-149's battle half) |
| **W2 stack** | `w2-stack` | `stack` | Counters, copies of spells and abilities ("you may choose new targets"), timing, flash grants, storm, morph, control changes. Cards from outside the game are **not written**: Rob's ruling of 2026-10-28 makes a deck holding Cunning Wish or Extrapolate the Impossible illegal in Play, refused by name (`README.md`, section 8) |
| **W3 graveyard** | `w3-graveyard` | `graveyard` | Recursion, dies and leaves triggers, mill, manifest; **remembered objects** (`RememberObjects`, `RememberChanged`: the most-played missing construct), exile-until, `MayPlay` from exile, every route to a graveyard |
| **W4 combat** | `w4-combat` | `combat` | Attack and block requirements (ROB-149), evasion, protection (including from a source that left), trample assignment **asked** (CR 702.19b), equipment and auras, damage redirection and doubling |
| **W5 mana** | `w5-mana` | `mana` | Land types and abilities, mana abilities, restricted mana, landwalk, "land played" triggers, cost increases and reductions, alternative costs, X and additional costs cast by an effect |
| **W6 tokens** | `w6-tokens` | `tokens` | Tokens, counters (divided at activation), sacrifice, life; the ordering of counter and token replacements (asked, not decided) |
| **W7 spells** | `w7-spells` | `spells` (the catch-all) | Draws and draw replacements, discard, tutors, modal spells, dice, coins, `ChoosePlayer`, `Repeat`, "your life total" |
| **V8 verifier** | `v8-verify` | none written | The test harnesses: `tools/fuzz-live.mjs`, `tests/fuzz-*.mjs`, `game/engine/cards/scenario.mjs` (the runner), the exercised and ability ledgers (read from the journal the engine writes; **never by instrumenting a rules module**). **Never edits a card or a rule module.** |

## Rules (all of wave 4d's, and these)

- **Branch** `codex/engine-load100-w<N>-<suffix>` from the wave's integration branch `codex/engine-load100-w<N>`. Do not
  merge `main` in: the orchestrator does.
- **Every card** is `game/engine/cards/<letter>/<slug>.json` plus `<slug>.scenarios.json`. Its scenarios show **every
  ability** doing the right thing, at three or four players where it matters, and the edges: nothing to choose, an
  "up to" taken as zero, an "if you can't", a target gone on resolution, a copy, a card that changes zones mid-effect.
- **Faithful to the oracle text and the Comprehensive Rules.** Read the card's official rulings
  (`https://api.scryfall.com/cards/named?exact=<name>` → its `rulings_uri`) for every card with any rule interaction
  beyond the vanilla. Cite CR numbers in comments; never paste CR text into the repository.
- **Players decide** (AGENTS.md). Who, which, in what order, whether, how much: anything a rule leaves to a player is
  asked of that player. A rule that leaves no choice says so in a comment with its CR number.
- **Engine changes are minimal**, in their module's terms, each with a comment naming the card text it serves and the
  rule. A new effect primitive also goes in `game/engine/vocabulary.mjs`, `docs/engine/PLAN.md` §12.2 and the count in
  `tests/engine-vocabulary.mjs`.
- **Tests must be able to fail.** One breaks file, `game/tools/batch/breaks-load100-w<N>-<suffix>.py`, one break per
  engine change (each guard, each branch), run until `missed: []`. A break that moves another file's anchor: re-anchor
  that break on the code it was written for and prove it caught again (`breaks.py <file> <label>`).
- **A new suite name must be free:** `ls tests/<name>.mjs` before writing one. Set the README's "There are N Node suites"
  to `ls tests/*.mjs | wc -l` on your branch; the orchestrator sets it again.
- **Fix and ignore are Rob's words.** A fix means the card or rule now behaves as at a physical table, proved by a
  scenario or a suite. Anything excluded, retargeted, loosened or stepped around is an **ignore**, named as one in your
  report, and goes onto the gameplay-gap list. A weakened assertion is never a fix.
- **A card you cannot make exactly right** without a construct another lane owns, or a construct too large for the
  wave: stop on it and say exactly what it needs. Never ship a card that is almost right.
- **Read narrowly:** grep and line ranges, never a whole generated file (`definitions.mjs`, `candidates.mjs`) or data
  file (`oracle.json`, `candidates.json`); cut output to what you need. Write cards in batches with one generator run,
  not one card at a time; read a scenarios file only to edit it; keep command output to its result lines.
- **Every verb is a primitive.** Each verb of a card's oracle text is a CR 701 keyword action or an effect primitive in
  `game/engine/vocabulary.mjs`, implemented once, in one module, and used by every card that says it. A card never gets
  a branch of its own in an engine module; a verb the engine lacks is built as a primitive with its own scenario family
  (two or three cards that use it), then the cards. That is what keeps the data model one grammar as it grows.
- **Every ability is reached.** A card is complete when `check-cards` proves every oracle sentence maps to an ability
  (fidelity) **and** every ability has at least one scenario that makes it fire or apply. Until V8's ability ledger
  (wave 0) reports the second, your PR body lists, per ability, the scenario that reaches it.
- **Never touch** `data/live-load.json`, `data/live-state.json`, `release/`, the wrangler config, `cloud/migrations/`,
  `docs/ACTIVE.md`, Linear, another role's cards, or a file outside your worktree. American English, US formats.
- **Commits** end with your own attribution line. Push your branch; open a **draft** PR into the integration branch.
  Never mark it ready and never merge.

## Writers: the order of work

0. **Wave 0 only: your `debt` rows** (from `README.md`, "Open accuracy debt", each with its evidence line). For each:
   a scenario or suite step that fails on main first, then the fix, then its break. A rule that leaves a choice to a
   player becomes a question to that player, never a better default. A row you cannot fix exactly is reported as an
   ignore with what it needs. Wave 0 has no `cards` list.
1. **Review and promote** the candidates in your list (`review`), with `card-waves.mjs --review`. Read every ability
   against its oracle sentence and the rulings, and what the game showed. Approve only what is exactly right; a wrong
   one is written by hand or left with the reason. Promote, then regenerate (`engine-definitions`, `card-compiler`,
   `engine-candidates`, all `--write`). **Every promoted card then gets scenarios written for each of its abilities**:
   the observed smoke game alone is not enough (a known ignore of the old waves, now closed).
2. **Write your `cards` list in its order** (the orchestrator's order: wanted first, then the sentence that completes
   the most other cards), per `game/tools/batch/README.md`: `oracle-show.py`, the fixture grep, then
   **`engine-compile.mjs --plan --cards "<your batch>"`** for what the library already writes of each card. Take those
   abilities as they are (they are calibrated at 99.9%) and write only the gap sentences, in a generator importing
   `cardlib.py` **in your scratch space, not the repository**; `check-cards.mjs` until 0 failed. A gap sentence you write
   is learned by the library on merge and completes every other card that shares it: prefer the exact oracle wording in
   your ability's `text` so the template matches widely.
3. **The wave's quota** is the orchestrator's (about 30 cards). Stop at a clean point rather than rush: everything
   committed passes its checks.
4. **Fix what V8 reports** on your cards, on your branch, before the orchestrator merges you. Each finding is answered
   with a fix (and its scenario) or a named ignore.

## V8, the verifier: the order of work

You are independent of the writers: you read their work cold, from the oracle text and the rules, never from their
reports. You never edit a card or a rule; you find, prove and report.

1. **Wave 0 only: build the pool fuzz and the exercised ledger** in `tools/fuzz-live.mjs`:
   - `--pool`: for each seed, four legal Commander decks drawn from **every final definition**
     (`tableDefinition`), each a commander the table plays and 99 cards in its color identity, weighted toward
     `--favor <names file>` (the wave's new cards) so each is drawn at least once over the run;
   - `--exercised <out.json>`: for every card, whether it was cast or played and resolved, and how many times each of its
     abilities activated, triggered or applied, in a **clean** game (finished, refusal tally 0, no exception);
   - its suite (`tests/fuzz-pool.mjs`, name checked free) and a breaks file. A game is clean only as the harness already
     defines it (`refusals` 0 from `since` 0), with `--replay` and `--leaks`.
2. **Review every card the wave's writers defined or promoted**, from their PR diffs: each ability against its oracle
   sentence, the rulings and the CR; each scenario's expectations against what a table would do; the edges the
   scenarios miss. A doubt is settled by a scenario you write in your scratch space and run against their branch.
3. **Play the integration branch**, when the orchestrator says it is assembled:
   `node --stack-size=4000 tools/fuzz-live.mjs --pool --favor <wave cards> --humans 0 --seeds <range> --replay --leaks --exercised <file> --json <file>`
   with at least 200 games a wave (5,000 at the program's end). `--humans 0` puts a person's seat in seat 0, so the leak
   check runs at every one of its questions (with AI seats only it runs once a game). Measured 2026-10-28 with
   `--replay --leaks`: 3 to 4 seconds a game with AI seats only, 14 seconds with a person in seat 0 (138 leak checks), so
   200 games with a person are about 50 minutes in one process; shard long runs by seed range across three processes. Also decks drawn from Rob's library
   (`node --stack-size=4000 tools/fuzz-live.mjs --library --humans 0 --seeds 1-50 --replay --leaks`); and Rob's six staging decks,
   four at a time (`node --stack-size=4000 tools/fuzz-live.mjs --backup tests/fixtures/shared-staging-decks.json --decks "D1 Tymna + Kraum|D2 Chulane|D3 Kiora|D4 Felothar" --humans 0 --seeds 1-25 --replay --leaks`,
   then `"D5 Teysa Karlov|D6 Krenko|D1 Tymna + Kraum|D2 Chulane"`). Every new card must appear exercised in a clean game;
   one that random play never casts gets a targeted game (a deck built around it) until it does.
4. **Wave 0 only: close the checks that step around a card** (gameplay-gap list, section 7) that are yours: the scenario
   runner's `settle` taking the first legal answer, `optional` skipping a move not offered without saying so,
   `targets: "any"` taking the first aim; a definition that throws left out of the fuzz silently. Each fix that turns a
   scenario red is a finding for the card's theme lane, not a change you make to the card.
5. **Findings** go to the orchestrator as they appear, each as: card or rule · what a table does · what the engine does ·
   the scenario or seed that shows it · the theme lane that owns it.

## Any model may pick up any lane

### Rob's approved ability-proof supplement, October 28, 2026

Rob approved the additional harness proof: "Allow the additional harness proof." Existing journal evidence stays the
first source. Where events cannot identify a static, keyword, replacement, or mana ability unambiguously, V8 may also
remove that one ability from an in-memory compiled definition and require an originally passing scenario to fail.
This supplements the journal-only method above; it does not change G-3's requirement to account for every ability.

- Never edit saved card definitions, scenarios, or rule modules for the removal. Restore the original lookup after
  every probe; no probe may affect the next scenario or a played game.
- Run the original scenario successfully first. A failure caused only by schema or fidelity validation of a modified
  script is not behavioral proof; remove the ability from a valid compiled/runtime definition.
- A keyword-list presence assertion alone is not proof of evasion, combat, or another keyword's behavior. Preserve
  that assertion, but distinguish it from a behavioral failure when recording counterfactual coverage.
- Record the card, ability path, scenario, original result, removal result, and evidence method. Keep ambiguity,
  redundancy, and a removal the scenario does not detect as unproved, with G-3 unmet for that ability.
- This proves that a scenario depends on the ability. Its accuracy still needs independent Oracle/rules review and
  clean played games; do not turn a coverage result into a claim of universal correctness.

Rob hands lanes between OpenAI's subagents, Claude, Codex, Cursor and Grok as his plan limits allow. So a lane never
depends on a conversation: **everything it knows lives in four places**: its lane file (`w<N>/lane-<role>.json`), its
branch, its draft PR body (the report below, kept current at every push) and `RUN.md`. A session that picks a lane up
reads those four and continues. Branches carry the model's prefix (`codex/` for OpenAI, `claude/`, `cursor/`, `grok/`);
a lane changing hands starts `<prefix>/engine-load100-w<N>-<suffix>-2` from the old head, and the PR says so. Push at
every clean point, never only at the end: an unpushed branch is work nobody else can continue.

## Done means (writers)

- `check-cards.mjs` reports 0 failed; `engine-definitions --check`, `engine-candidates --check` and
  `tools/data-inventory.mjs --check` pass, and `docs/engine/coverage.md` is current (`engine-coverage.mjs` has no
  `--check`; `tests/engine-cards.mjs` holds it).
- These pass: `tests/engine-cards.mjs`, `tests/card-waves.mjs`, `tests/table-candidates.mjs`, `tests/card-compiler.mjs`,
  `tests/sentence-library.mjs` (if it exists), every `tests/engine-*.mjs` reading a file you changed, `tests/table-basics.mjs`,
  `tests/data-integrity.mjs`, `tests/feature-wiring.mjs`, `tests/engine-breaks-anchors.mjs`.
- `tools/library-engine-index.mjs --check-lane <your lane file>` lists only the cards you stopped on.
- Your breaks file reports `missed: []`. `bash tools/local-ci.sh HEAD 0` reports SCAN PASS.
- Every V8 finding on your cards is answered.
- Pushed, with a draft PR into `codex/engine-load100-w<N>` titled `Load 100 w<N> <role>: <n> written, <m> promoted`.

## Done means (V8)

- Every writer PR of the wave reviewed, card by card; every finding answered by its lane or carried to the gap list as a
  named ignore with the orchestrator's agreement.
- On the integration head: the pool fuzz's games all clean, replays identical, no leak, every new card exercised; the
  library's 50 seeds and the staging decks' 2 × 25 seeds clean. The exercised ledger written to `docs/engine/card-load-100-2026-10-28/exercised-w<N>.json`.
- Your harness changes (wave 0) with a suite, breaks `missed: []`, SCAN PASS, a draft PR into the integration branch.

## The report (your PR body, and your last message to the orchestrator, 30 lines or fewer)

- **Promoted:** the cards; any candidate rewritten or left, with the reason.
- **Written:** each card, with its scenario count.
- **Stopped:** each card, and exactly what it needs and whose theme owns it.
- **Engine changes:** the file and what each does, with its CR number.
- **Ignores:** each, named as one.
- **Proof:** each command above with its result line; the breaks result; the `--check-lane` line.
- **Where it is:** the branch and its head SHA.
