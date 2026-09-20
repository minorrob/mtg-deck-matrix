# Handoff from Fable, 2026-09-20 — the plan, and how to work it well here

**For:** whichever model picks up CrankMagic next (Opus, Sonnet, Codex, Cursor, a cloud
session). Read `AGENTS.md` and `docs/ACTIVE.md` first, as always. This document is what I would
tell you if we were in the same room: the state, the order, and the habits that made the last
two days go well and the mistakes that cost time.

## 1. Where things are

- `main` is green. Everything from the 2026-09-19/20 sessions is merged: #272 (data refresh and
  the star-schema Live Load), #273 (v22 resaved, upgrades priced from the catalog), #274 (the
  Online readiness stack), #275 (F.1, the lobby's arithmetic behind its suite), #276 (C.2, the
  connection panel; the host Game setup page that could not parse), #277–#278 (the walkthrough
  plan and W.1), #279 (C.1, the unknown-card swap), #280–#283 (the UAT plan, W.2, W.3, W.3b),
  #284–#285 (design intake).
- The queue is one list: `docs/app-walkthrough-plan-2026-09-19.md` §9.5, with **Track V** (the
  visual redesign) from `docs/design-intake-2026-09-20.md` §6 running ahead of W.4–W.7 for
  anything visual. The Online tracks keep their definitions in
  `game/docs/readiness-plan-2026-09-18.md`.
- The design handoff is under `docs/design/2026-09-20-deck-page/`, read and mapped in its
  `INTAKE.md`. Its author (Claude Design) hit a usage limit; more may follow. Nothing in it
  ships as-is: it is a reference to recreate in the app's plain HTML/CSS/JS.

## 2. The order, and why

1. **V.1 tokens** — the Gallery tokens are in `crankmagic-design.css` now, held to the handoff
   by `tests/design-tokens.mjs`, with a raw-hex ceiling that only goes down. Next: self-host
   Young Serif (OFL) under `assets/crankmagic/`, add the `data-theme` preference and toggle, then
   convert `crankmagic.css` page by page from hex to tokens, lowering the ceiling in each PR.
   Convert the feature prefixes in this order: `cm-deck`, `cm-tile`, `cm-stat`, `cm-pill`,
   `cm-actions` (the deck surfaces), then `cm-list`/`cm-table`/`cm-sheet`/`cm-tt` (the
   Library), then `cm-facet`/`cm-graph`/`cm-trace` (Explore), then `cm-lobby`, then the rest.
2. **V.2 components and V.3 shell** together: the helpers in `crankmagic-app.js` and the `v-`
   layer restyled; the header bar becomes the 216 px rail with the aether wordmark (port in the
   handoff's `screens/aether.js`); `tests/uat/geometry.mjs` rewritten for the rail, not deleted.
3. **V.4 surfaces**, one PR each, in the order Rob reads the app: Decks home → deck page →
   Library → Explore → the wireframed pages → dialogs. The functional rules ride with their
   surface and get their own tests: sortable headers, the editable Sheet, quick-look links.
4. **V.5 Play** (direction 2b) last, beside E.4 and C.6.
5. **W.4** (one number per concept) can run beside V at any time; it does not touch the look.

## 3. What each PR must carry (this is not optional here)

- **A test that was red first.** Break it, watch it fail, fix it, say so in the commit. For a
  restyle, the red test is the render: `node tools/render-routes.mjs <before>` on `main`,
  `<after>` on the branch, both folders in the report, and a screenshot in chat for Rob.
- **The full suite with the browser flags:** `PAGE_BUDGET_REQUIRED=1 GEOMETRY_REQUIRED=1 bash
  runtests.sh -q`. On Personal-HP set `UAT_PLAYWRIGHT` and `UAT_CHROME` as
  `tests/uat/browser-runner.mjs` reads them (see the memory note or `docs/ACTIVE.md`); the
  browser suites otherwise pass by not running.
- **Pins.** Every changed `.js`/`.css`/`.html` asset moves its `?v=` in `index.html`,
  `crankmagic.html` and the worker's shell list; a worker change moves the worker's pin in
  `crankmagic-app.js`, which moves the app's pin. Then `node tests/asset-versions.mjs --update`.
- **Generated files.** If `docs/data-inventory.md` or `data/manifest.json` drift, regenerate
  with their tools; never hand-edit.
- **Never touch** `data/deck-ratings.json`, `data/simulation-summary.json`, `sim/`,
  `data/deck-guides.json`. If a change makes one stale, stop and say so.

## 4. Habits that saved time, and mistakes that cost it

- **Gate the merge on the check you just ran.** `gh pr checks --watch` prints a result; read it
  before `gh pr merge`, and treat "pending" as not green. I merged #284 with CI red because the
  chain did not look. Main was red for minutes.
- **Re-verify a PR against the main it will land on**, not the one it was opened against.
  `git merge-tree --write-tree origin/main origin/<branch>` exits non-zero on conflict. Stacked
  branches need retargeting (`gh pr edit N --base main`) and a merge of main after the base
  lands; the baton file conflicts every time and is resolved by keeping the branch's version.
- **Suite counts in commit messages are read from the run, not remembered.** I wrote 97 twice
  when the run said 95 and 96. The README pins the Node count; `tests/generators.mjs` pins the
  inventory.
- **Windows shell traps.** Git Bash here strips one level of backslashes inside heredocs, so a
  Python or JS snippet with `\n` or `\d` in a heredoc is corrupted silently. Put such scripts in
  a file (the Write tool) and run the file. `python3` on PATH resolves to the Store stub unless
  the real Python folder is first; a `python3.exe` copy sits in the Python312 folder. Use
  `MSYS_NO_PATHCONV=1` when passing `rev:path` to git.
- **The wiring suite reads the source.** `tests/feature-wiring.mjs` holds the walkthrough and
  UAT fixes by regex over the feature files. When you change how a fix is written, update the
  check with it, and keep it honest: match code, not comments (the dialog check once matched
  the word "dialog." in prose).
- **Do not chain a commit after a test run without `if [ $rc -ne 0 ]; then exit 1; fi`.** I did
  once; the commit message claimed a green suite that was red.
- **Render for Rob.** Every visible change gets a picture in chat before it is called done.
  A refactor meant to change nothing gets before-and-after, and the diff between them measured
  (a pixel diff script is in the session record; commander art and the header tagline differ
  between two runs of the same code, so compare against a same-code rerun).
- **Prove Forge claims on this machine only.** A cloud session cannot; say "unproven" in those
  words. The run-book is `game/docs/readiness-plan-2026-09-18.md` §12.

## 5. Decisions Rob has made (do not reopen)

- Agents may merge to `main` under standard practice (`AGENTS.md`).
- Any 2–4 seats in any mix of human and AI, including a Claude-driven seat through the Chrome
  extension that can also troubleshoot mid-game.
- A catalog-sourced paid figure shows as "≈ (catalog)", never as paid.
- Lobby decks stay real, hidden behind "Show lobby decks", promoted by Save to Decks.
- The Live Load is about loading his workbook, not new front-end; the wide reader's six-deck
  limit is not a question he wants asked.
- No blind `skipWaiting` in the service worker; a reload prompt instead (W.6).

## 5b. Rules added on 2026-09-20, late

- **American English, always, everywhere.** In `AGENTS.md` and in the wiring suite as a ratchet
  (586 legacy occurrences in older code and documents; only goes down; the designer's verbatim
  handoff folder is exempt). This applies to Rob's every tool, not only this repository: never
  write the British forms, and convert them when a source arrives in them.
- **The Game Host** (design intake V.5b): a loud, video-game announcer voice for the live game's
  "Up next" and phase announcements that pulls back once play is under way. Backlog; define it
  as a copy set with tone rules and review it in chat before any ships.
- **V.1b is done**: the legacy tokens read the Gallery tokens and the most-used page hexes are
  converted, so the ground, sidebar, buttons and accents already wear brass and slate; the deck
  tiles and most page-specific surfaces do not yet. That is the next conversion.
- **Usage pivot:** when a session reaches 95% of its usage, stop building and update the
  handoff documents, commit, merge what is green, and leave the next model a clean start.

## 5c. Revision 2 of the handoff (2026-09-20, 11:23)

The designer sent a second revision with `IMPLEMENTATION-GUIDE.md` (a review of the V.1b pass
and the exact order: tokens and a literal-to-token sweep, shell, deck tiles, pages, theme) and
`DELTA-play-and-implementation.md` (Play in detail: lobby quadrants, table view, focus view,
playmats, a Coach stub). It is under `docs/design/2026-09-20-deck-page-r2/` with its own
`INTAKE.md`, which says where the guide and the repository must be reconciled before the sweep
(token names, the font, the Deep Field block, the pip map, the acceptance). **Where revision 2
and the first README disagree, revision 2 wins.** Rob approved self-hosting the display font:
Young Serif is OFL; if a license check says otherwise, choose an open-source display serif of
the same character and say so.

## 6. What I would do first tomorrow

1. Reconcile the guide's token names with the repository (revision 2 `INTAKE.md`, item 1), then
   self-host Young Serif (Rob approved it; OFL) and point `--v-display` and `--font-display` at it.
2. The sweep: the guide's literal-to-token table, mechanically, over both stylesheets, then
   review what is left; lower the 730 ceiling to the measured count; the display face on
   headings and big figures; render before and after. Then the shell (guide step 2), then the
   deck tiles (step 3), each rendered beside the matching `screens/*.dc.html` at 1280 px.
3. Send the designer the gap list (`INTAKE.md`, "Gaps and conflicts") with those renders.
