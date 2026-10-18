# Handoff: Codex · Workshop lane, October 18, 2026

*From the Claude cloud session that took over Codex's UX/UI work on Rob's word: "You are picking up the work of GPT on
the UX/UI and Play." AGENTS.md says a handoff states four things: the branch and commit it describes, what is proven
versus assumed, the command that proves each claim, and what is outstanding. Sections 1 to 4 state them. The state
block comes first, so the next session can start from it.*

## State

- **Updated:** 2026-10-18.
- **Progress:** card status (ROB-150) and budgets (ROB-151) are done and merged. ROB-107 is partly done.
- **Next:**
  1. Read `CLAUDE.md`, then `AGENTS.md`, then the Workshop row in `docs/ACTIVE.md`.
  2. Read this file.
  3. Take the next Workshop item Rob names. The queue is ROB-36 and ROB-37 (sharing, in progress), then ROB-122 and
     ROB-125, plus what remains of ROB-107. Open only the docs that item names.
- **Current state:**
  - `main` carries Rob's card status model and his budget rules. Neither is released; the engine lane releases staging
    (ROB-11).
  - The two Workers Builds checks fail on every PR until Rob flips a dashboard switch (ROB-152).
- **Open questions:** none on this work. Rob kept all three budget defaults (`docs/budgets.md`).

## 1. The branch and commit

- **`main` at `71155f15`:** PR #777 merged with a merge commit, on a green Actions `suites` run of its head `13174970`.
  The merging session re-checked that `main` had not moved into a conflict (it was at `919685fe`, which merged
  cleanly).
- **This handoff:** on `claude/wizardly-einstein-9ibb4j`, restarted from that `main`. It carries only this file, the
  decisions section in `docs/budgets.md`, `docs/ACTIVE.md` and the Workshop feed.

## 2. What was done, and the proof

| Done | Proof (command) | Linear |
| --- | --- | --- |
| **Card status: Use · Ownership · Play, with Upgrade.**<br>One `cardState` in `collection-model.js`.<br>`deckStatus` gives the Deck total, the Group total and Play.<br>The hundred, the Library scoped to a deck and the deck tiles all agree.<br>Per-cell Status and Deck menus; Reserve, Upgrade and Put in flows.<br>Edit holds Quantity and Paid.<br>Change status and Change assignment in the card panel.<br>Finalize became Lock list; Target became Final.<br>Definition: `docs/card-states.md`. | `node tests/card-states.mjs` (140)<br>`GEOMETRY_REQUIRED=1 node tests/card-status-flows.mjs` (40)<br>`python game/tools/batch/breaks.py game/tools/batch/breaks-card-status.py` (8 of 8 caught) | ROB-150 Done; ROB-107 In Progress |
| **Rob's exception:** the Ownership menu never offers To sell or Trade. They follow the Sell and Trade uses automatically. | the `card-states` and `card-status-flows` suites | ROB-150 |
| **Budgets, per deck and account-wide, informational only.**<br>`deckBudget` and `budgets` in the model.<br>Settings › Budget card; a line under the Decks tiles; Budget or No budget on the deck page.<br>Lock list, swap, accept option and identity fixes never refuse for money.<br>Definition: `docs/budgets.md`. | `node tests/budgets.mjs` (29)<br>`GEOMETRY_REQUIRED=1 node tests/settings-r3.mjs` (68)<br>`python game/tools/batch/breaks.py game/tools/batch/breaks-budgets.py` (6 of 6 caught) | ROB-151 Done |
| **The Decks head fits its budget.** The Loading chip shows only while a deck is loading; the word budget is 26. | `GEOMETRY_REQUIRED=1 node tests/page-budget.mjs` (80) | (part of ROB-150) |
| **The whole app still holds.** | `node tests/uat/crankmagic-journeys.mjs` (505), with a static server on 8790; see section 4 | — |
| **Workers Builds root cause.** PR branches have no `wrangler.jsonc`; it exists only on the release branches. | `npx --yes wrangler@4.139.0 versions upload --dry-run` on a PR branch fails: "Missing entry-point to Worker script or to assets directory" | ROB-152 Todo (Rob) |

## 3. Assumed, not proved

- **Rob's current cloud library has not been checked.** Every figure comes from the committed backup
  (`data/live-state.json`, September 30), including D1 Tymna + Kraum. The code is the same, but its numbers have not
  been seen.
- **The app has not been seen on staging.** Nothing from #777 is released; the engine lane's next combined release
  carries it. Release notes are in a comment on ROB-11.

## 4. Outstanding, with the reason

1. **ROB-152: turn off Workers Builds for PR branches.** This is Rob's dashboard switch, under Settings → Build →
   Branch control, for both `crankmagic` and `crankmagic-staging`. A session cannot do it: the environment injects only
   the `*.cloudflare.com` network secret named `CLOUDFLARE_API_TOKEN`. A token saved as `CLOUDFLARE_ACCESS_TOKEN` never
   reaches the container. Until it is done, both checks stay red on every PR. They are not a merge gate; Actions
   `suites` is.
2. **ROB-107, the rest of it.** Still to build:
   - a plain sentence per row with the next action as a button;
   - bulk moves that preview their effect and undo as one change;
   - the complexity dial (ROB-125);
   - a recorded usability pass in `docs/uat`.
3. **Dead CSS.** `.cm-deck-summary` in `crankmagic.css` styles the old two-column cost panel. I removed its only
   writer, `stats()` in `crankmagic-decks.js`. It is harmless, but it can go the next time `crankmagic.css` changes.

### What this session learned about the environment

- **A changed shipped file needs a new `?v=`.** Run `node tools/bump-pins.mjs <files>`, bump anything it reports that
  is itself pinned (the service worker, `crankmagic-assets.js`), then run `node tests/asset-versions.mjs --update`.
  - If you bump again before committing, run `git checkout tests/fixtures/asset-versions.json` first.
  - Otherwise the recorded `crankmagic-app.js` and service-worker hashes chase each other.
- **A new suite that reads a data file** must be recorded by `node tools/data-inventory.mjs`. If it is not,
  `tests/generators.mjs` fails in CI.
- **The README's suite count** ("There are N Node suites here") must match `tests/*.mjs`. `tests/refresh.mjs` holds
  it.
- **The journeys need a static server:** `python3 -m http.server 8790 --bind 127.0.0.1`.
  - Stop it with `pkill -f "[h]ttp.server 8790"`. The bracket keeps `pkill` from matching, and killing, its own shell.
  - `tests/uat/tour-walk.mjs` breaks when `UAT_PLAYWRIGHT` is set; run it without that variable.
- **Before every push:** `sh tools/local-ci.sh HEAD 0`. It is the scan and the merge check; Actions `suites`
  (`bash runtests.sh -q`, about 25 minutes) is the gate.
