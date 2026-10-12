# Handoff, 2026-10-12: the Play UI, from Fable to Codex Astra

Written by the UI lane's session (Fable, a Claude session in a cloud container) at the end of pass 1 on the Play
screen, as its weekly usage ran out. Rob's instruction: *"write up a handoff document where I will have Astra on the
OpenAI platform take my feedback and continue working on the UI of Play."* Everything this document relies on is in
this repository. Nothing depends on the session's container, which will be reclaimed.

**Read first, in this order:** `docs/ui-lane/astra/README.md` is the entry point, and its order of precedence
decides every conflict. In short: `AGENTS.md` and `CLAUDE.md`; `docs/ACTIVE.md`; `docs/ui-lane/README.md`;
`docs/ui-lane/gameplay-anchor.md`; the Astra README; this document; `pre-lobby.md` and `deals.md`;
`brief-v2-play-experience-2026-10-12.md`; `brief-v1-replit-2026-10-12.md`; `docs/ui-lane/plan-play-ui-2026-10-12.md`.

## 1. You, and your lane

You are **Codex Astra**, holding the **UI lane** (AGENTS.md, *Lanes*). You may work on Rob's computer (Personal-HP,
the one clone at `C:\Users\robmi\CrankMagic\repo`) or in the cloud. The engine lane (another Claude session, paused at
2026-10-12, `docs/handoff-2026-10-12.md`) holds `game/**`, `cloud/**`, `data/`, `tools/` and the card definitions.
Nobody edits a file of the other lane.

**Yours:** `crankmagic-board.js` (the board), `crankmagic-table.js` (Play home and the lobby), `crankmagic-tabletop.js`,
`crankmagic-seat-art.js`, `crankmagic-sea.js`, `crankmagic-audio.js`, Settings' Play and display cards in
`crankmagic-settings.js`, `crankmagic.css`, `crankmagic-design.css`, `crankmagic-mats.css`, the browser suites that
drive them, the breaks files `game/tools/batch/breaks-<topic>.py`, `docs/ui-lane/`, and your own section of
`docs/ACTIVE.md` plus its Requests table.

**Your branch:** `codex/ui-<topic>`, from `main`. A draft PR at once. Never `main`, `release/pages` or
`release/cloud-staging`; never a force-push; never a rebase of a branch another system has pulled.

**The seam is the view.** When the board needs a fact the view does not carry, add a row to the Requests table in
`docs/ACTIVE.md` (the field, what for, an example, where it touches the engine). The engine lane adds it in a small PR,
merged first; you build against `main`. Rows 2 to 6 are pass 1's requests, still open (section 7).

## 2. The game, in one page (the anchor has the rest)

- **CrankMagic** is a *Magic: The Gathering* Commander app: decks are built in it, then played at an online table
  hosted in the cloud, two to four seats, people and AI, in a browser on a desktop or a phone held sideways.
- **The server is the authority.** The room sends each seat a view, `CrankRoomView@1`, already filtered for that seat:
  hidden cards arrive as backs with no name. The board renders the latest view, lets the player choose among
  `view.decision.options`, and sends `{type:"act", actionId, revision, kind:"answer", choiceId, indices|amounts}`.
  The only actions outside the options: Concede, End game for everyone, and the step-by-step preference.
- **A turn has seven steps,** untap · upkeep · draw · main 1 · combat · main 2 · end, and Rob wants all seven in view
  on every turn: done, now, and to come. Priority passes seat to seat; the stack resolves top first. Nineteen kinds of
  question reach the board (`decision.kind`): priority, mulligan, blockers, damage, targets, order, costs and the
  rest; `docs/ui-lane/sample-views.json` holds the first view of each from a real 60-turn game.
- **Never decide for the player.** A convenience that passes for them must be one they turned on, and it stops the
  moment anything is on the stack or any other question is asked. The end step always asks.
- **Never name a hidden card,** in a label, a tooltip, a log line, a callout or a screen-reader name.
- **A refusal** (409, 422, 400, 500) always comes with a fresh view and never changes the game; show its words under
  the pass button, naming the thing and what to do. Never a modal, never a warning that can be clicked past.

## 3. Rob's direction for Play, in his words

The brief (`astra/brief-v1-replit-2026-10-12.md`) is the long form. The sentences that govern every decision:

- The product in one line: *"a board game that meets a video game, that meets a social table, that meets a
  competitive league. Open and airy."*
- **Four players, no mode switch:** the Competitive (information one gesture away: the stack, incoming attacks, open
  mana, what is castable now), the Casual (one obvious button, the next step named, help without shame), the Social
  (people, chat, presence, a shared game-over moment), the Competitive-social (records, a friends leaderboard, a
  deck ladder). *"They differ in how much of the interface they show, not in which product they use."*
- **Five pillars:** the open board that fills the window, every container shown, sized or hidden; a round table
  virtualized, you at the near edge, the others as real miniatures of their boards; a callout overlay in a neon-cartoon
  register, loud, brief, legible, skippable; it just works (under a second to paint, smooth at 250 permanents, nothing
  below the window edge, never decides for the player); AI just enough and cheap.
- **Fluidity:** *"nothing over 250 ms except a callout's entrance (≤ 400 ms); a handful of things moving at once at
  most; nothing animated on first paint; reduce motion makes every one of these an instant state change; the board at
  rest is what a glance reads."* View changes walk the camera, never cut.
- **Flexibility:** *"Sizing is one gesture everywhere: drag the divider between two main containers."* Every pane
  header carries one menu holding its options and *Hide this pane*. Sizes are sliders or dividers, never steps.
- **His brief to pass 1 (2026-10-12), verbatim where it matters:**
  - keep from the Replit concept *"the functionality (more fluid, better transitions), the UI (menus, pop-ups, info
    panes, etc.) and specifically the full screen UI with 3D view"*;
  - *"it needs to extend the player mat to no longer being a mat but being the entire background, then bending at a
    2/3 - 3/4 up the canvas horizon line"*;
  - *"we want to maximize screen use in full screen and 3D full screen"*, *"pushing all players to the far sides and
    back while keeping the active player's screen still the maximum size"*;
  - *"I want to see all 7 phases listed out during each turn, which phases are complete and which is active and which
    are yet to come, but very concise yet readable"*;
  - fix *"card clipping at edges"* and that *"I could see other player's hands"*;
  - *"leverage the game engine approach from Replit, but keep our mats backgrounds and our theme color options"*;
  - anything that needs the engine: *"keep those recorded to hand off to other session"* (the Requests table);
  - the loop: a pass, staging, *"let me know it's ready for review and any areas you want me to look at in
    particular where confidence is lower, then I'll send all my feedback, and you can iterate on the next pass."*

**What the concept got wrong, refused in pass 1 and not to be brought back** (plan §1): a land reminder that blocked
a legal pass from the hand's card types (the screen never computes legality); its own themes and seat colors (ours are
the four themes of `crankmagic-design.css`); its four placeholder mats (ours are the thirty of `crankmagic-mats.css`);
one callout at a time (ours holds three); clipping of lifted cards and of opponents' permanents in 3D; "Full screen"
as a browser toggle only; `isPriority` read from a title string (ours reads `decision.kind`).

## 4. Where pass 1 stands

**On `main` as #725 (merge commit 222af699), on staging at the same commit** (`tools/release-staging.sh`:
release-acceptance 22, play-e2e 35; `release/cloud-staging` 4cc2001b; `tools/staging-check.mjs` signed in reads
222af699 on `version.json` and both pages). The record is the UI lane's section of `docs/ACTIVE.md`.

| Piece | Where | Proved by |
| --- | --- | --- |
| The seven steps, every turn, in the strip and in Full screen's pill; done struck through, now the accent chip, to come in ink; short forms under 1400px by a container query; opens the steps menu | `turnRibbon()` and `stepsMenu()` in `crankmagic-board.js`; `.cm-board-ribbon`, `@container strip`, `@container pill` in `crankmagic.css` | `tests/table-board.mjs` (one lit step per strip) |
| Full screen as the table from your chair: the big board's mat is the whole ground (`.cm-full-ground[data-mat]`); the other seats at `data-side` left · back · right (two: left and right; one: across), each a small board of its own (`.cm-mat[data-fit="side"]`); the rail and the side column on a near-opaque dark | `fullView()`, `SIDES`; the Full screen block of `crankmagic.css` (`.cm-full-ground`, `.cm-full-wall`, `.cm-full-floor`, `.cm-full-other`) | `table-board`: the ground is the seat's mat, the whole window; one other seat sits at the back |
| **3D**: the rail's switch (`cm-board-3d` on the device); the ground split into a wall and a floor, the floor `rotateX(38deg)` hinged at a horizon 30% down (`--horizon-px` from `fit()`); the back seat leans away, the sides turn in; your board flat | `THREE_KEY`, `actions["board-3d"]`, `host.dataset["3d"]`; `.cm-board[data-3d="on"]` rules | `table-board`: the floor shown and transformed, remembered |
| The right pane docked beside the mat in Focus and Table, 240–560px by its own divider (`cm-board-panel-w`, arrow keys), tabs Turn Resources · Panel · History | `panel()`, `PANEL_TABS`, `PANELW_KEY`, the `panelw` grip; `.cm-board-panel`, `.cm-board-body.has-panel` | `table-board`: beside the mat and the hand, the drag and the keys, the mat giving room |
| Turn Resources: the hand by type, castable now / in hand (from the decision's options); the lands by name, untapped / all; the pool; the land drop | `turnResources()`; `.cm-resources`, `.cm-res-*` | `table-board`: the lands row as the mat has them |
| The hover card never taller than the mat | `--peek-max` set in `fit()`; the peek rule in `crankmagic.css` | `table-board` at 1280×800 |
| Motion: a played card flies hand to mat (180 ms), a drawn one lifts from the library, a destroyed one slides to its pile (220 ms); a tapped card turns where it lies; the turn's light crossfades (`data-turn-changed`); at most 8 flights a paint; Reduce motion stills all of it | `motionSnapshot()`, `motionPlay()`, around the paint in `render()`; `adopt()` sets `motionFor` and `turnLit` | seen in the fixture; **not held by a suite** |
| Callouts: `calloutsFor(was, next)`, pure, on `globalThis.CrankBoard`: YOUR TURN, INCOMING ×N, RESPONSE, HIT / CRITICAL / KO, LIFE ±N, FATAL, COUNTERED, PROLIFERATE, TOKENS ×N, DESTROYED, EXILED, +N, VICTORY / GAME OVER; six read at most, three shown at most, hold 0.9 s + Overlay × 10 ms; a layer beside the board (`#cm-board-callouts`) so a repaint never takes one away; tones from `--callout-*` tokens | `calloutsFor()`, `callouts()`, `SAMPLE_CALLOUTS`, `actions["board-callout-demo"]` (Tools › Try the callouts); `.cm-callout*` rules | `tests/board-callouts.mjs` (33 checks: the reading of a view, a hidden card never named, six at most); `table-board` (the layer) |
| Settings › Play › Overlay: a slider 0–100 saved as `preferences.play.overlay` (0 is off) | `crankmagic-settings.js`, `data-settings-overlay` | `tests/settings-r3.mjs` |
| The lobby: a seated deck's quadrant wears its commander's color fan; "Launches when all are ready · n to go" | `identityOf()` and the center panel in `crankmagic-table.js` | `tests/table-lobby.mjs` |
| Play home: Recent games under New table, from the library's filed results | `recentGames()` in `crankmagic-table.js` | seen; **not held by a suite** |

**Assumed, not proved:** the flights and the turn's light (seen in `tools/board-fixture.mjs`, no suite); the side
seats at 1280×720 read as presence, not detail; the snapshot's cost at 250 permanents (two layouts a view) is not
measured.

**The commands that prove each claim,** from the repository root, with nothing else editing the worktree:

```
GEOMETRY_REQUIRED=1 node tests/table-board.mjs      # 281 checks; two browsers over the real table
GEOMETRY_REQUIRED=1 node tests/a11y-board.mjs       # 288: contrast measured on all 30 mats in both themes, keys, tab order
GEOMETRY_REQUIRED=1 node tests/table-lobby.mjs      # 89
GEOMETRY_REQUIRED=1 node tests/settings-r3.mjs      # 63
GEOMETRY_REQUIRED=1 node tests/board-choices.mjs    # 40
GEOMETRY_REQUIRED=1 node tests/coach.mjs            # 60
node tests/board-callouts.mjs                       # 33, in Node
node tests/design-tokens.mjs                        # raw-hex ceiling in crankmagic.css
node tests/feature-wiring.mjs                       # American English, no size steps, dialogs bound
node tests/data-integrity.mjs                       # the README names every suite and their count
node tests/asset-versions.mjs                       # every ?v= bumped once, hashes recorded
GEOMETRY_REQUIRED=1 python3 game/tools/batch/breaks.py game/tools/batch/breaks-play-ui.py       # 12 breaks
GEOMETRY_REQUIRED=1 python3 game/tools/batch/breaks.py game/tools/batch/breaks-play-ui-rest.py  # 7 breaks
bash tools/local-ci.sh HEAD 0                       # the secret scan and the merge check
```

## 5. Rob's review, and pass 2

Rob reviews staging at 222af699. **Where confidence is lower** (plan §3), so his feedback there is expected:
1. **The 3D bend:** the horizon 30% down, the floor at 38° under a 1400px perspective; the other seats upright and
   leaning, not lying in the floor's plane. Rob asked for the bend *"at a 2/3 - 3/4 up the canvas horizon line"*;
   measured from the bottom that is 25–33% down, so 30% is inside his range, and the number is one CSS custom property
   (`--horizon-px`, set in `fit()` from `host.clientHeight * 0.3`) and one angle (`rotateX(38deg)`).
2. **The side seats at 1280×720:** a column of 150px at the least, a busy board wrapping to four rows of 26px cards.
3. **The callouts' loudness, hold and place:** a column under the strip (16% down in Full screen), never over the hand
   or the pass button; the concept anchored each to its cause, which needs the layer to know the mat's geometry.
4. **Flights at 250 permanents:** not measured.

**Pass 2's order is set in `README.md` beside this file** (Rob's feedback, then Play home, then the deals' beginnings, then the second-edition brief's pieces); the plan's list (§4) below is the older order, kept for its content:
1. Chairs in Focus as a strip across the top (the concept's Chair), with a priority ring and the away clock; Grid as
   the Table view's name in the Layout menu; "Save my layout".
2. Tracker and Combat tabs in the pane; the stack pinned to Combat; INCOMING's readout in combat order.
3. Callouts anchored to their cause (the attacking seat, the card, the stack), and the sound cues for them
   (`crankmagic-audio.js` is yours).
4. Dice on cards for +1/+1 and loyalty counters; the d20 for first player (needs a room frame, Requests row 6).
5. The Coach's three suggested questions from the decision; the rules helper chip on a stack entry.
6. Open Games, the detail card, Standing, the spectator view, Chat (each needs the room or the Worker; the requests
   are in the plan §5).

**Taking his feedback:** restate each item in one line in your plan file (`docs/ui-lane/plan-play-ui-<date>.md` or
a new section of the existing one), mark which pass carries it, and name the suite check that will hold it. He sends
feedback as one batch; one pass answers the batch, then staging, then his next batch.

## 6. How to work in this lane: what pass 1 learned

**Environment.** Node 22, Python 3.12, no `package.json`. Install as CI does (`.github/workflows/tests.yml`):
`npm install --no-save --no-package-lock playwright@1.56.0`, then `npx playwright install --with-deps chromium`. A
browser suite takes minutes and wants a quiet machine. A system that cannot run a browser cannot prove work here.

**The board.** `crankmagic-board.js` is one feature closure pushed onto `globalThis.CrankFeatures`, given the app
context `C` (`C.esc`, `C.button`, `C.actions`, `C.modal`, `C.notice`, `C.state.preferences`, `C.keepFocus`,
`C.cardScaleRange`). A view arrives over the socket, `adopt()` takes it, `render()` repaints the whole board with
`innerHTML`, `fit()` measures and sets custom properties (`--horizon-px`, `--opp-w`, `--peek-max`, `--panel-w`), and
`overlap()` lets rows overlap before they scroll. Views: Table (2×2), Focus (seat pane · mat · hand), Full screen
(rail · center · side column), phone. Device memory is `localStorage` (`cm-board-view`, `cm-board-3d`,
`cm-board-panel-w`, `cm-board-pane`, the sizes). Mats: thirty, five drawn in CSS and twenty-five in
`crankmagic-mats.css`, applied by `[data-mat="X"]:is(.cm-board-mat,.cm-seatboard,.cm-full-ground)`. Themes: four in
`crankmagic-design.css`, with the board's fixed tokens (`--mat-ink`, `--mat-felt`, `--vital-danger`, `--callout-*`).

**Seeing it.** `node tools/board-fixture.mjs --out <dir> --sizes 1280x720,1920x1080` renders a four-seat table at
those sizes for screenshots (Rob reviews screenshots well; 1920×1080 and 1280×720 are the two to show).

**The cascade** when a shipped file changes: bump its `?v=` in `index.html`, `crankmagic.html` and `crankmagic-sw.js`;
then `crankmagic-sw.js?v=` in `crankmagic-app.js`; then `crankmagic-app.js?v=` in the pages and the worker; then
`node tests/asset-versions.mjs --update`. `docs/ui-lane/tools/bump-versions.py` does the bumps; edit its `CHANGED`
list first. Nothing else in those four files is yours.

**Tests that can fail.** For each thing a change makes true, a break in `game/tools/batch/breaks-<topic>.py` (see
`breaks-play-ui.py` for the shape: a label, a file, the exact text to replace, the replacement) and a run of
`breaks.py` until `missed: []`. Never edit files while a breaks run is going; it edits and restores them itself (a
stop-hook asking about uncommitted `*.bak` files during a run is the runner, not you).

**Pitfalls met in pass 1, each costing a CI cycle:**
- `tests/design-tokens.mjs` caps raw hex colors in `crankmagic.css` (137 at the time). New colors go in
  `crankmagic-design.css` as tokens, read with `var()`.
- `tests/data-integrity.mjs` fails until the README names a new suite and its count is right. Whoever merges second
  sets the count.
- `tests/a11y-board.mjs` measures contrast in pixels on every mat in both themes: text over a mat needs a dark backing
  (the ribbon's `rgb(0 0 0 / .45)`), and a focused card must not be covered by its overlapping neighbors
  (`:focus-visible{z-index:4}`; side seats wrap their rows instead of overlapping).
- `tests/feature-wiring.mjs` rejects British spellings and any size offered in steps.
- The strip must never wrap: under 1400px the ribbon takes short forms and the view buttons drop their words, by
  container query, and the pass button is `flex:0 0 auto`.
- No `overflow:hidden` on the board host in Full screen: the hand grows below and the board scrolls, and
  `table-board` checks it. No `position:relative` on the Full screen host either: it breaks the fixed layout.
- The rail's menus in Full screen need `z-index` above the table, or a click lands on the mat.
- CI's `suites` job takes about 25 minutes and is the only gate; the two *Workers Builds* checks are red by design on
  every branch but the release branches. If a push creates no run, dispatch `tests.yml` on the branch.
- `main` moves while a run is going (the engine lane merges often). Merge `origin/main` into the branch before marking
  ready, and again if the merge is refused; `docs/ACTIVE.md` and the README's count are the usual conflicts.

**Reaching `main`:** merge `main` in; the suites the change touches, plus `data-integrity` and `asset-versions`;
`tools/local-ci.sh HEAD 0`; mark ready; one green `suites` run of the head; a merge commit, never a squash; a line in
your `docs/ACTIVE.md` section saying it is merged. Staging is normally the engine lane's release; while it is paused,
ask Rob, who releases from Personal-HP, or do as pass 1 did on his say-so (`tools/release-staging.sh` with a release
worktree and a local `wrangler`, never on Rob's computer without his go, never touching Cloudflare settings).

## 7. Standing rules, Rob's, all in force

- **American English and US formats** everywhere: color, gray, center, canceled; Sep 25, 2026; 2:42 PM. Card names
  keep their printed spelling.
- **Sizes are sliders or dividers, never steps.** Both ends drawn; the minimum legible, the maximum fits.
- **Decisions inside the game belong to the players.** Nothing is decided in code for them. Every action comes from
  `view.decision.options`.
- **Nothing names a hidden card.** The view is already filtered; never fetch, cache or show more.
- **A refusal names the thing and what to do.** Never a modal, never a warning that can be clicked past.
- **Secrets are never read, printed, copied or uploaded:** browser profiles, `wrangler`'s sign-in, `.env`,
  `.dev.vars`, SSH keys, API keys, Access service tokens. A step that seems to need one stops and asks Rob.
- **On Rob's computer:** Git runs in the one clone only; nothing outside the repository and the folder Rob gives you is
  deleted, moved or cleaned; nothing installed system-wide without his say-so; never run `wrangler`, deploy, or change
  Cloudflare, Access or GitHub settings.
- **No session ends with uncommitted work.** Push before you stop. A handoff states four things: the branch and
  commit; what is proven and what is assumed; the command that proves each claim; what is outstanding and why.
- **A prototype's export lives outside the repository** and is ported, never committed as it is. Rob has the Replit
  export (`CrankMagic-Play`, with its `HANDOFF.md`); ask him for it if you need to look at the concept again. Its
  `HANDOFF.md` lists what it left unbuilt (a real socket adapter, Scryfall images, drag to play, persistent chat,
  music, the Coach, oracle text) and where it departed from the anchor (its spectator view and some decision shapes
  are synthetic).

## 8. Open requests to the engine lane (`docs/ACTIVE.md`, Requests)

| Row | What | For |
| --- | --- | --- |
| 2 | The lobby's countdown starting by itself once every seat is ready; Cancel by the host stays | the brief's lobby ("No Launch button") |
| 3 | A structured record of what happened since the last revision (`events: [{kind, …}]`) | callouts and sounds from facts rather than history sentences |
| 4 | Per-player `manaTapped` this step, or per land `tappedForMana` | Turn Resources' "mana tapped this step" |
| 5 | Whether a permanent is a token; attachments; summoning sickness; colors and mana cost; the face up | dice on tokens, Turn Resources by color, double-faced cards |
| 6 | A `roll` frame for the d20 | the die that animates to the result it was sent |
| 7 | (done on `main`, c629f8c) the advisor suite's clock | — |

Plan §5 adds the spectator projection, the chat channel, and a view delta at 250 permanents, not yet filed as rows.
The engine lane is paused; a request waits until it resumes, or until Rob assigns it. Build what needs no request
first.

## 9. Outstanding at this handoff

- **Rob's feedback on pass 1** has not arrived; pass 2 starts from it.
- **PR #729** (docs only: the `docs/ACTIVE.md` record of the merge and the release, this handoff, the brief and the
  bump script) is a draft on `claude/nice-hypatia-4ajdyi`; it merges on a green `suites` run, or rides along with
  your first PR if you take the branch's commits (merge the branch into yours; never rebase it).
- **Production** serves `main` fa1a7d3b (released today, before pass 1); the production release is Rob's go, two
  profiles in order (`docs/release-production.md`), and not this lane's.
- **Nothing is in flight.** The branch `claude/nice-hypatia-4ajdyi` carries only merged history plus #729's docs.
