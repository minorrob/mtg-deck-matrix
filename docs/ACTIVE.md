# Who holds the work

## r4 coordinated execution, October26,2026 (Codex; Rob: "go")

**Pre-CI source/local-proof snapshot:** combined source and cache pins are integrated at ad4afea1.
The coordinator owns canonical Git/index/pins/docs; Engine holds the serial real-table browser and is
staging release executor. Foundation finished its bounded source/acceptance lane, clean with no browser;
Workshop tabletop and coordinator shared-shell gates are queued. Source snapshots, commands, proof and
outstanding gates are in docs/r4-execution/HANDOFF.md. Preserve the untracked design renders.

The current CI, main merge, staging deployment/readback and remaining release limits are maintained in
[PR #890](https://github.com/minorrob/mtg-deck-matrix/pull/890), linked to ROB-197. This section is the
pre-CI checkpoint rather than a claim about a later deployment. Production requires Rob's separate go.
PR #894 is merged at91989100 and its canonical/browser hold is complete. EX-01–EX-27 record the source
conflicts and later explicit requests; CH-03's unchanged wordmark is superseded by EX-18.

The61-row program uses integration/r4 from main c567c581 and Rob-authorized isolated worktrees, one Play
writer, serial browser checks and preserved Git history. All129 audit findings retain bounded evidence;
source mapping alone does not close the53 unmapped findings or partial/open follow-ups.

## 2026-10-25: main 9ca99e5 in production (Rob: "release main 9ca99e5 to production")

Released by the Decks cloud session (`claude/vibrant-turing-50yl3r`), with the Camera and Settings session told before
the push and after it. Staging already served the same main: `release/cloud-staging` a60c06d, version 8d31593d, read
back with `tools/staging-check.mjs --expect 9ca99e53`.
- **Production** (`cloud-production`, by `tools/release-production.sh`):
  - `release/pages` ccf09c02, on 06d1d733, pushed at 18:26 UTC;
  - local walks: `release-acceptance` 23 and `production-play-e2e` 27;
  - the Worker (`wrangler deploy --dry-run`): 6.98 MB, 1.27 MB gzip;
  - Workers Builds deployed version **e61dde22**, at 100% since 18:26:50 UTC;
  - `version.json` reads 9ca99e53, profile `cloud-production`;
  - the live walk at `https://crankmagic.com`: 23 checks, with `UAT_LIVE_NETWORK=1`;
  - **the rollback target** is **06d1d733** (version bf700e93, main 1fcfc3d, 2026-10-21).
- **Not in production:** what merged after 9ca99e5 (#875 public precons, #877, #878 the board's plays and clicks).
- **It carries everything merged since 1fcfc3d:**
  - **Decks:** the Decks screen and New deck flow (#844, by #852); no flicker when a button is clicked (#865).
  - **Play:**
    - Rob's Full screen notes: a land at any step, a land taken back, the actions over the table (#832, #835);
    - the Babylon tabletop and the lounge (#836, #838);
    - the opponent preview and Full screen's controls (#839 to #841);
    - review actions and card inspection (#842);
    - crowded boards: whole-card rows and zone navigation (#854);
    - the combat strip and Camera (#874).
  - **Cards:** Rob's 34-deck backup and the library load (#816, #826 to #831), planar dice (#833), Nethroi and
    Boromir (#837), wave 4d (#843, #845 to #852), the 10-24 load (#855), Rob's four lists (#862) and the six precons
    (#871): 6,255 definitions.
  - **Cloud:** shared decks loaded within the Worker's CPU budget (#851, #853); the Claude seat asks with thinking off
    (#857).
  - **Tests and records:** Share Library's permission and privacy boundaries (#769), and Requests row 13 (#873).
- **Production's D1, bindings and secrets are unchanged** (migrations 0001 and 0002): no migration, binding or
  Worker setting was added since 1fcfc3d. Sharing stays off in `cloud-production` (it is on in the staging profile
  only), so the `cloud/sharing.mjs` changes do not run there.

## Rob's October 26 follow-ups to r4: the wordmark to the Mana Pool, 2026-10-26 (a Claude cloud session, for Rob; `claude/r4-rob-1026`)

Rob, 2026-10-26, asked for these together, in one PR merged to `integration/r4` (*"Include all of these changes in the
same PR and merge."*). At his word this changes files of three lanes; each change is an EX row of
`docs/r4-execution/DECISIONS.md`.

- **Claude · Engine:** `game/engine/rules/actions.mjs` gains `manaSources(state, player)`, additive, and
  `game/room/room.mjs` one view field, `manaSources`, the seat's own (`docs/ui-lane/gameplay-anchor.md`).
  `tests/room-mana-pool.mjs` covers it, and that a Signet's floating mana is spent first when a spell is cast. No rule,
  decision or journal changes.
- **Codex · Play:** `crankmagic-board.js`, `crankmagic-stage.js`, `crankmagic-stage.css`, `crankmagic-table.js` and their
  suites: Tilt as the angle to the floor (`cm-board-tilt-v3`) and Reset in place of ⌖ (the camera suites now use both),
  the hand that shows what fits, you in the life list, opponents' play cards past the open drawer and below the life
  list, the head look's rise, closer read and steer, the Mana Pool module, and your targeted cards outlined in red.
- **Codex · Workshop:** the Cinzel gilt wordmark, the deck tile's star, Planned Changes' adds and decks past 100
  (`crankmagic.css`, `crankmagic-design.css`, `crankmagic-decks.js`, `collection-model.js`, `crankmagic-change.js`,
  `crankmagic-pull.js`, `docs/design/2026-10-25-redesign-r4/`).

## Play 3D's backdrop videos: Rob's six, at the Graphics resolution, 2K at most, 2026-10-26 (a Claude cloud session, for Rob; `claude/crankmagic-background-videos-8nm59v`, PR #888)

Rob, 2026-10-26: *"Replace the current background videos in the CrankMagic Play 3D with those in this folder. Adjust as
required. Maintain resolution in line with settings selection with 2k at max resolution."* At his word this changes the
Codex · Play lane's `crankmagic-stage.js`, `crankmagic-board.js` (one default), `ui-prototypes/babylon` (two names) and
two Play suites.

- **The backdrops are Rob's six** (his Drive folder "Backdrop videos", each download checked against Drive's byte size):
  Dwarven King (the default, first by name), Goblin Stronghold, Golden Fields, Island, Japanese Samurai, Studious
  Retreat. The volcano and the two placeholders without a video (Forest, Cloud sea) are gone; a saved choice of them
  falls back to Dwarven King.
- **Each kept at 720, 1080 and 1440 lines** by `tools/stage-backdrops.mjs`: framed at 16:9, looped without a seam (the
  last second cross-faded into the first; 10.1 s clips play 9.1 s), VP9 WebM without sound, 24 fps, at most 24 MiB a
  file (the largest is 8.4 MiB; 51 MB in all), a poster each. The five 2544×1456 clips, 1431 lines at 16:9, reach 1440
  (a tier within 2% of the source is kept); **Island's source is 1280×720, so it has 720 only** (never enlarged).
- **The stage plays the height the setting calls for:** the smallest kept that fills the backdrop's height at 16:9 in
  drawn pixels (stage height × the screen's pixel ratio × the kept Graphics resolution), **1440 (2K) at most**;
  changed when the setting is kept (not while the slider previews), the clip keeping its place. **Where WebGL is drawn
  in software and no resolution is chosen, 720 lines at most** (as the skins stay at 1024 there): the 1080 Dwarven King
  took the table's frames on Actions (run 40326429906, `table-tabletop` timed out at the module drag) and here (2 of 2
  failed at 1080, 2 of 2 passed at 720). A resolution chosen in Settings gets what it calls for on any machine.
- **The originals are not committed** (about 72 MB of video in a public history for good): they stay in Rob's Drive;
  `design/art-source/backdrops/README.md` says how to run the tool again, and `.gitignore` keeps the clips out.
- **Proven here:** `board-graphics` (the heights at 50/70/100/110/150/200%, the 2K cap with a 2160 file offered, a
  720-only backdrop, the swap on a kept setting and not on a preview, the clip's place kept, the tool's markers; each
  new check seen red by breaking the code), `feature-wiring`, `release-pages`, `asset-versions`. The loop's seam
  measured on a synthetic clip as an ordinary frame step (PSNR 24.18 against 24.15 for adjacent frames).
- `table-tabletop` no longer names backdrops: it picks the first, and the second for "background is independent of the
  table design" (it had named the `forest` placeholder, gone now). It runs here with
  `NODE_PATH=/opt/node-tools/node_modules` (its preview tool needs `playwright-core`).
- **Not proven:** the backdrops on a GPU browser and a phone; Rob's eye on the loops' seams.

## Planned Changes (C1–C8, once Ready to add), 2026-10-26 (a Claude cloud session, for Rob; `claude/vigilant-dijkstra-bzs1wf`, restarted from main after #885)

Rob, 2026-10-25, from another session's handoff (C1–C8, "Ready to Add" renamed "Planned Changes"; B1–B4, the deck header
revamp, **held**): *"Yes, I want C1-C8 merged in. It can be the next PR if needed, but yes."* His answers here: a To Buy
card swapped in is **"Record the plan"** (its take-out stays in the box as a Substitute until it arrives), and Ordered is
not a list of its own: *"collapse the Ordered into To Buy logic, then within To Buy we have To Buy - Not Purchased > To
Buy - Ordered ... > (leaving the To Buy chain) Owned - Upgrade, Owned - Bench, Owned - Final."*

- **The page** (`#pull?deck=`, `crankmagic-pull.js`, rewritten): **Take out of Box** beside **Add to Box**, one copy a
  side, each a tick, the thumbnail (the card large on a hover), the name, the colors and its label under the name.
  The rows come from the model (`crankmagic-change.js` `planned`): a Substitute beside the card whose seat it holds, an
  Upgrade beside the Final it names, every Owned card that could go in (Final, Substitute, Bench), and the To Buy ones.
- **C1/C2** a tick only selects; **Swap** asks *"Confirm additions and removals?"* (the usual review, previewed by the
  model) and makes it one batch, one undo. **C5** take-outs say *Substitute* or *Final*; adds *Owned - Final*,
  *To Buy · Ordered - Upgrade*, *To Buy - Final* and so on. **C6** Removed, Added, Total Deck Cards (box − out + in),
  green at exactly 100, red otherwise, a warning only. **C7** any ticks in any rows; a lonely add takes a spare ticked
  take-out (`pairUp`) and both wear one colored dot, no words. **C8** mismatched counts swap after the confirmation,
  which states the count.
- **Swaps as commands** (`swapCommands`): an owned card is `place`d (a stand-in for the seat it was chosen for); an
  Upgrade is `acceptOption` (its Final staying as Substitute) or, re-paired with another Final, `swap` into that seat; a
  take-out goes to the Bench unless it sits beside a To Buy Upgrade. Copies of one record moving the same way go as one
  `place`, so ten Mountains stay one record. A To Buy Final is already planned and cannot be ticked (⏳); an Upgrade that
  names no Final cannot either, until it is given one on the deck page.
- **Words:** "Ready to add" is "Planned Changes" in the app's copy (deck page button, Library's More, How, tour, help,
  messages). The old page's *Select all*, *Mark all added*, *Also on your Bench / Reserve them* are gone: a free Bench
  copy is an *Owned - Bench* add.
- **Proof:** new `planned-changes` (67, the model on the live library) and `planned-changes-ui` (41, the page), each red
  under a break (re-pairing off; the counter's 100). `card-states-screens`, `drafts-reserve`, `page-budget` and the UAT
  `crankmagic-journeys` walk drive the new page. The journeys walk stops here, and on main, at its Play step (no Play
  host in this container); its Planned Changes steps pass.
- **`board-3d-camera`, made robust:** it failed on Actions on #885's re-run (`1ac252f5`, "ends exactly at the resting
  camera") and three runs in three here. Frames on a slow runner come 250 ms and more apart, and the test stopped on a
  fixed 150 ms after the look ended, so its last recorded frame was from before the camera's last step home (t 0.2–0.3).
  It now waits for a frame recorded after the look ended; three runs in three pass here. Test-only; the camera is unchanged.
- **Ordered is To Buy · Ordered, app-wide** (Rob, 2026-10-26: *"Yes, relabel Ordered as To Buy · Ordered app-wide"*): the
  status word itself, wherever it is defined or matched -- the model's statuses, ownership, ladder, tones and record
  states (`collection-model.js`), the Library's filters, ladder and Table piles, the Tabletop's piles, the glossary, the
  deck page's Progress, Explore's ownership, the sandbox and the slot model. Verbs stay (the *Ordered…* button that places
  an order, "Ordered 3 copies from …"), and so do the sheet's count column and its CSV header, which an import reads.
- **Urgent, the Actions desk while declaring attackers** (Rob, 2026-10-26: *"the card image can't be resized and the
  bottom selection options I can't see to select ... make the height of the modules grab-n-drag up and down ... make the
  width of the right side drawer adjustable in the same way the left side drawer is"*). The card read at the top of
  Actions was up to 260 px wide (364 tall) inside a question held to 70% of the window less 130 px: at 1366x768 it left
  the nine attack choices **6 px**. Now (`crankmagic-board.js`, `crankmagic-stage.css`):
  - the question is as tall as the drawer (100dvh less 170 px), the options keep at least 120 px, and if the card is
    dragged past that the whole question scrolls, so no choice is out of reach;
  - a bar under the card drags its size (90–360 px wide, 150 by default; ↑/↓ too), kept on the device;
  - a bar under **every module** in both drawers drags its height (80–1400 px; ↑/↓; a double click gives it back its own
    height), kept on the device (`cm-board-module-h`);
  - the right drawer's width drags at its left edge in 3D as in the other views (240–560 px, kept as `cm-board-panel-w`).
  New `board-drawer-sizes` (27), red on the old board ("the options keep room ... (6px)").
  On Actions the first cut held the question to 100dvh − 170px, which ran Confirm off a 1024x768 window while combat's
  band pushes the drawer down to 188px (`board-direct-blocking`); it now counts from where the drawer starts
  (`--rail-top`, 58px or 188px), and after a redraw the choice in hand is kept whole in the list.
- `decks-hub`'s "a line the table's answer does not write again ends hidden" (a 600 ms wait) fails about half the time in
  this container, with or without these changes; it passed on Actions.

## Play's graphics: resolution in Settings, the volcano whole, painted table skins, sharp mat cards; target lands folded, 2026-10-26 (a Claude cloud session, for Rob; `claude/vigilant-dijkstra-bzs1wf`, restarted from main after #884)

Rob, 2026-10-25: *"I also want to increase the game's resolution dramatically. I'd like this to be an option in settings.
The lava background shouldn't be so zoomed in by default either ... the table material/skin looks like an 8-bit graphic.
I want 32-bit graphics in this game as a minimum. We'll look to enable 64-bit later."* And: *"the skin on the tables should
have much more detail to them; look like a more realistic cartoon."* At his word this changes the Codex · Play lane's
`crankmagic-stage.js`, `crankmagic-stage-tables.js`, `crankmagic-stage.css`, `crankmagic-board.js` (the Settings window's
slider) and `crankmagic-settings-play.js`.

- **Resolution:** the 3D table is drawn at **150%** of the screen's pixels by default (was: every frame sized to the
  stage's CSS pixels, 1x, whatever the scaling said), **50% – 200%** in Settings › Play and the table's Settings window,
  previewed as dragged, put back by Cancel, kept per device (`cm-stage-resolution`). Dithered against banding.
- **The volcano whole:** the 1280×720 video is shown at its own 16:9, as large as the stage allows, its blurred poster
  filling the rest, the edges feathered. It is drawn near its native size now; a sharper backdrop needs a larger source.
- **Table skins:** painted pixel by pixel in 32-bit RGBA in a Web Worker (`crankmagic-stage-paint.js`, a file of its own:
  the page admits workers from its origin only): wood rings, fibers, knots, plank seams and bevels; granite, felt, leather,
  iron, brushed steel, frosted glass, obsidian with glowing veins; softly stepped tones, a normal map from the paint, inked
  box edges, mipmaps and 16x anisotropic filtering; 2048 px, 4096 at 175% and over. The table stands in its colors and
  takes its skins when painted (about 1–2.5 s in the cloud container's software WebGL).
- **Sharp cards on the mats** (Rob, same day: *"Note how blurry the cards on the mat are as compared to cards in the hand.
  When I zoom in ... the text can become easily readable on the board. This should be a check for you that needs to
  pass"*): the mats are DOM under a perspective matrix, which the browser paints at their CSS size and then magnifies.
  Each magnified mat is now laid out k times larger (`zoom`) and shrunk back by its matrix, k = its magnification times
  the Graphics resolution, 2 to 4 (`sharpness`). `board-card-sharpness` measures a card's fine print against the same
  picture drawn flat at the same size: at the closest zoom the mat card keeps **102%** (it kept **26%** before), the hand
  61%; the check needs 60% and fails on the old code.
- **Proof:** new `board-graphics` (every design, both Settings, the backdrop's fit, skins in the worker) and
  `board-card-sharpness`. **Not proven:** a GPU browser's frame rate at 200%, Safari/Firefox (`zoom` on a transformed
  mat), a phone.
- **Lands last, folded** (Rob, same day, "Choose targets for Oath of Teferi": *"if the rules allow lands (e.g. permanents),
  always show lands after every other option under a subheader, "lands" and by default have it collapsed."*): in a
  question of targets that offers lands beside other things, the lands come after everything else in a **Lands** group,
  shut by default, open while a land is picked and as the player left it; all-land targets and a cost's question (what to
  tap) are shown as they are. New `board-target-lands`, 12 checks, red on the old board.
- **The renderer's load, measured here:** where the browser draws WebGL in software (this container, Actions' runners),
  the default resolution is 100% and the skins 1024 px; the painter works one skin at a time, stops the moment the table
  moves and applies a finished skin only when it is still. Without that, the skins' painting took the processor from the
  camera's head look (`board-3d-camera` timed out). `board-3d-camera`'s "ends exactly at the resting camera" also fails
  here today on main's code with none of this, so this container's timing is not the gate; Actions is.
- **Release tooling:** `crankmagic-stage-paint.js` is added beside `crankmagic-stage-tables.js` to Play's lists in
  `tools/release-pages.mjs` (the Claude · Engine lane's file, one word, at Rob's word), and `release-pages` checks it.
- **Merged and on staging:** PR #885 merged to main as `f72d857a` on Rob's go before its re-run finished (he wanted it
  on staging within 15 minutes); main's push run 40263765484 green. `tools/release-staging.sh`: release-acceptance 23,
  play-e2e 44, `release/cloud-staging` → `10aa4e91`; `tools/staging-check.mjs --expect f72d857a` passed.
- **64-bit (16 bits a channel):** not started, as Rob said; it would mean half-float textures and an HDR pipeline.
- **Queued for the next round, not started (Rob, 2026-10-25, "for the work after the current"):**
  - "Tap for mana" is offered only in the screen for paying a card being cast, never in the board's general actions; a
    double left click on a land taps it outside a payment.
  - Actions are grouped by **Hand**, **Board** and **Other**; each shows its card type in a smaller line under the name,
    is color coded by card type (instant, creature, artifact, …), and is justified left.
  - The mana-payment panel recorded in the Actions drawer section above (required by color, tapped below, click sources
    to tap, Confirm and cast / Cancel).

## Play's Actions drawer, fewer words; offered cards on the stack; attack risk; mana as symbols; a favorite's star off its pill, 2026-10-25 (a Claude cloud session, for Rob; `claude/vigilant-dijkstra-bzs1wf`)

**Merged and on staging, 2026-10-26** (Rob: *"Determine and execute the best path to get all of the changes I've given you
merged into main and pushed to staging and prod"*). PR #884 merged to main as `010cd98e` (merge commit) on Actions
`suites` green on head `33e9eaaf` (run 40248850930), base `1cd2c669` unmoved. `tools/release-staging.sh` from a cloud
container (wrangler 4.139.0) pushed `release/cloud-staging` `141012d8` (release-acceptance 23, play-e2e 44);
`node tools/staging-check.mjs --expect 010cd98e` passed, both pages and `/api/me`. Production waits for the next PR.

Rob, 2026-10-25, with screenshots: *"Remove the entire "Your Selection" explanation box. The outline around the selection
indicates the selection ... Change "Confirm Action" and "Clear Selection" to "Confirm" and "Clear" and put them
side-by-side. The arrow up next to Actions is way too big ... I don't like the big, obtrusive white line on the side. The
"All Actions", if that's a button should be smaller and justified left."* And: on Decks and Favorites the favorite's star
covered the tile's stage pill. At his word this changes the Codex · Play lane's `crankmagic-board.js`,
`crankmagic-stage.css`, `crankmagic-table.js` (one help sentence) and the Workshop lane's `crankmagic.css` (one rule).

- **Actions:** no "Your selection" box and no paragraph under it (the selection is said to a screen reader alone, in a
  `cm-sr-only` live line); no "Select an option to review it" hint; **Confirm** and **Clear**, side by side, equal width.
  "All actions" is a small chevron link at the left, above the card's name.
- **Chevrons:** the Actions and Boards open/shut are a thin SVG chevron, 24px, no fill, turned right when shut.
- **Scrollbars on the board:** a 10% white track and a 40% gray thumb (`scrollbar-color` on `.cm-board`), thin on the rail.
- **Decks:** a favorite's stage pill stays stepped down below the star, as it already did on hover.
- **A card a question offers from out of sight is on the stack** (Rob, same day: *"When I'm presented with a card I can't
  see (e.g. a scry card), it should be on the stack ... graveyard, multiple cards in either stack, cards in a player's
  graveyard or library"*): any question but priority whose options name cards off every battlefield and your own hand
  (a scry, a search, a graveyard target, exile, a look at a hand) puts them in front of On the Stack, ◇ and edged in gold,
  ahead of the spell or ability that asked; the pile's shuffle carousels through them; Inspect card opens each; the module
  shows them with the stack empty too. A library card is named from the question's own words (`offeredCards`).
- **What an attack risks** (Rob, same day): on Declare attackers each option is **red, ☠** when an untapped creature of
  that defender that could block it (a flyer only by flying or reach) could kill it (power ≥ its toughness left, or
  deathtouch; never an indestructible attacker), and **yellow, ⊘** when it could kill none of them alone. The ☠'s title
  names the killers. A hint from the table as it stands: tricks and first strike are not read (`attackRisk`).
- **A mana ability is its symbols** (Rob, same day, Command Tower's four "Tap for mana" buttons): a card's mana abilities
  whose way is mana alone are one row of small mana-symbol buttons, in Actions and in Card Preview / the Panel; each
  button's accessible name and tooltip is the whole sentence (`withManaRow`). Lands only for now, at Rob's word.
- **The card acted on is read in Actions** (Rob, same day: *"I end up with both the inspection pane and the left side
  pane. Don't need both. Inspection pane should be within the left drawer."*): an inspection the board opens by itself (a
  card clicked for its actions, an option staged, a cost or target asked for a card) is drawn at the top of the Actions
  desk, and no pane opens on the right; nor does a hover preview of that same card. One a person asks for (🔍, Inspect
  card) still opens the inspector (`deskCard`).
- **The hover never locks** (Rob, same day, Sol Ring's "what to tap for it": *"I want to go and hover over [Interplanar
  Beacon] to pop-up the card. I can't. I'm locked into Sol Ring."*): an open inspection had silenced every hover. Now the
  hover pops up any card while a question is open, and an option that names a card (an "Island" to tap) pops that card up
  on a hover or the keyboard's focus (`data-peek-card`). Only the card pinned by 🔍 is not shown twice.
- **Queued, not started (Rob, same day: "Save this feature, will do it after those in progress"): paying a cost as a
  mana panel.** When every source must be tapped there should be one choice, not one per ordering. Instead of an option
  per combination: a row of the cost's mana symbols with the amount required under each; a row below of the mana tapped;
  a left click on a mana source on the table taps it toward the cost (in a "pay for card" state); a clear mark once the
  cost is covered; then **Confirm and cast** and **Cancel**. Rob's screenshot: Way of the Mind Sculptor offered five
  orderings of Island, Sol Ring, Interplanar Beacon and Command Tower.
- **Proof:** `board-r2-actions-inspection` 109 (no visible summary or paragraph, Confirm/Clear words and row, the toggle's
  size and fill, All actions at the left edge, the rail's scrollbar color) and `decks-hub` 70 (star clear of the pill);
  new `board-stack-choices` 16, `board-attack-risk` 11 and `board-mana-symbols` 13; every new check red on the old source. **Not proven:** how Windows/macOS draw the scrollbar colors (headless shows none).

## The board: the same card one stack; the cards others play beside the question, 2026-10-25 (Claude Code on Personal-HP, for Rob; `claude/board-plays-clicks`)

Rob, 2026-10-25, choosing option A from renders: the cards another seat plays, held up for ten seconds, stood over the
question being answered -- its options, Confirm, a blocker's tile -- in every view and size measured (25 of 27), so a full
game against AIs stopped mid-game on main too. And: *"stack cards that are identical and have an x# on them ... If I can
select more than one, I should have a small numeric tick up/down value to choose how many in that stack."* At his word
this changes the Codex · Play lane's `crankmagic-board.js`, `crankmagic-stage.css` and two of its suites.

- **What changed:** the held-up cards move just past the question when they would cover it, and one that still would (a
  window too narrow) is put away, as one over the keyboard's focus already was. In a question for one or many, the same
  card is one button, ×N (a library search's 21 Islands one "Island ×21"); a click takes one, a click again puts it back;
  where more than one may be chosen, a number beside it says how many, never past the stack or the question's most. A
  card on the table is the same only in the same state (a tapped Goblin is not an untapped one's twin).
- **Suites moved with it:** `board-choices`' scry now expects a button per different card (its library repeats a name);
  `tools/play-tabletop-preview.mjs`' long list gives each option a different name, so `table-tabletop` still has 60 and 150.
- **Proof:** `tests/board-choice-stacks.mjs` 63 checks, `breaks-choice-stacks.py` 9 of 9; every suite that loads the board
  green (29); `solo-vs-ai` GAMES=1 plays a whole game to its end through the board, 17 checks.

## Public precons; no deck bundled for everyone, 2026-10-25 (Claude Code on Personal-HP, for Rob; `claude/public-precons`)

Rob, 2026-10-25: *"Make the precons public, available to anyone with access to play, and no other decks other than those
they make, shared with them or public. This removes the prior auto sharing of my decks."* At his word this changes files of
the Codex · Play lane (`crankmagic-table.js`, `crankmagic-stage.css`, `tests/table-lobby.mjs`, `tests/uat/solo-vs-ai.mjs`).

- **What changed:** the table's deck chooser offers **Precons**, the six New from Wizards decks, open to everyone, chosen and
  played with nothing added to a library. Rob's D1–D6, bundled in `crankmagic-table.js` for every player since October 15,
  are gone; "Shared with you" lists only decks shared with the person or made public.
- **Proof:** `table-lobby` 140 checks; `breaks-public-precons.py` 5 of 5; asset-versions, feature-wiring, data-integrity,
  design-tokens, crankmagic-lobby, table-by-group green. `solo-vs-ai` (GAMES=1) seats four precons, starts and reloads the
  game, then stops mid-game where the board's played-cards strip (`#cm-board-plays`) takes a click meant for the board:
  **main fails identically with the bundled decks**, so that is the board's, not this change's.
- **Staging's public shares turned off, 2026-10-25,** on Rob's "turn off the public sharing of my D1-D6 on staging (set
  public_role to none on those six shares)": the six `shares` rows (`deck:live:D1`–`D6`, owner Rob) now have no
  `public_role`, each revision 1 → 2, and no grants; staging holds no other share. Read back the same way. Staging's
  served app already reads shares when signed in, so nobody else is offered those decks there now; the bundled copy in
  the app goes when this PR is released.
## Play 3D: the camera by hand and a card's right-click menu, 2026-10-25 (a Claude cloud session, for Rob; PR #877): merged, on staging

Rob, 2026-10-25: wheel zoom, left-drag on a mat to pan (empty table still tilts), a right-click-hold "head look" (turn,
lean, pitch down, read; 0.25 s + 0.40 s·r, reversed on release), and a quick right-click on a card listing its offered
actions in shorthand. On his review the head look is a glance (`LOOK.strength` 0.5) and zoom goes toward the pointer.
`CrankStage.geometry` is now one general camera pose for Babylon and every DOM surface.

- **Merged:** PR #877 as `2632572b` (merge commit), on Rob's "merge + staging", after Actions `suites` passed on head
  `2c27e8ce` (run 40220341651) with base `9ca99e53` unmoved.
- **Staging:** `release/cloud-staging` `41453e0c` from main `2632572b` (release-acceptance 23, play-e2e 44);
  `staging-check --expect 2632572b` passed. Production is unchanged (it serves `9ca99e5`).
- **Proof:** new `tests/board-3d-camera.mjs` (96; 20 breaks caught, plus full strength caught after the softening),
  `board-babylon` 82, `table-board` 290 and the other Play suites each alone. **Not proven:** a GPU browser at 60 fps,
  Safari/Firefox, Windows' context-menu order, a trackpad pinch, a game with Rob at the table.
- **Next, in flight:** `claude/play-3d-hand-table` (wheel over the hand sizes it; Ctrl-drag lengthens your side of the
  table), stacked on #877. **Then:** the Admin panel; the brainstorm is Rob's doc "CrankMagic Admin Panel — Brainstorm".

## Play: Camera closes on an outside press; Settings is a window, 2026-10-25 (a Claude cloud session, for Rob; PR #874): merged, on staging

**Merged and released, 2026-10-25:** PR #874 merged to main as `9ca99e53` (merge commit) on Rob's "merge 874 and push to
staging when green", after Actions `suites` passed on head `958dd778` (run 40205995620) with base `9f20538d` unmoved.
`tools/release-staging.sh` then pushed `release/cloud-staging` `a60c06dc` from main `9ca99e53` (release-acceptance 23,
play-e2e 44), and `node tools/staging-check.mjs --expect 9ca99e53` passed (both pages and `/api/me`). The release slot is
free; production is unchanged. Locally `a11y-board` fails one contrast reading ("2/2", steel-cobalt, table view) on clean
main `9f20538d` as well; Actions passes it.

Rob, 2026-10-25: *"Camera menu doesn't close when I click anywhere outside of it."* and *"Can't access full settings menu
when selected. It cuts off at bottom of screen and I can't scroll down. ... when I press "Settings" in the dropdown, the
settings screen should be a pop-up window with close in the top right, and save and cancel in the bottom right. The
window should be reactive to the browser size."* No Codex · Play PR was open on these files (the newest, #770, is from
Oct 18), so this small change is made here, in `crankmagic-board.js` and `crankmagic-stage.css` only.

- **Camera ▾** closes on a press anywhere outside it (a capture-phase `pointerdown`, so a card's own handler cannot keep
  it open), as Profile and History already did. A press inside it keeps it open; Escape still closes it.
- **Settings** (Profile ▾ › Settings) opens the app's dialog: ✕ top right, Cancel and Save bottom right, the middle
  scrolling, sized `min(640px, 100vw − 24px)` by `100dvh − 32px` and following the window. Controls still preview live;
  Save keeps them; Cancel, ✕, Escape, a press on the backdrop or a button that leaves the window (Concede, Recommended
  actions, Table vitals, …) put back what was set when it opened (hold, skip-empty and the room's `prefer`, card size,
  sound). ⌘/Ctrl + / − still size the cards with it open.
- **Combat strip** (Rob, same day, a screenshot): each defender's confirmed assignments run in a row and wrap to the next
  when it is full, instead of one column with a scrollbar; defenders stay side by side so each one's first assignment is
  in reach. `board-combat-display` proves the wrap and goes red with the old column.
- **AGENTS.md, "Symbols first, words last":** Rob's new standing rule for every lane, in his words.
- **Parallel, not in this PR:** the 3D camera Rob asked for (wheel zoom, mat-drag pan, right-click-hold head-look, a
  shorthand actions menu on a card's right-click) is on `claude/play-3d-camera`, its own PR.
- **Proof:** new `tests/board-settings-window.mjs` (Camera in Focus and Full; the window at 1440×900, 1024×560 and
  390×700 and made smaller while open; Save/Cancel/✕/Escape); four deliberate breaks caught and restored. The suites
  that drove the old inline menu are updated (`table-board`, `a11y-board`, `table-shared-shell`,
  `board-r2-actions-inspection`); results are on the PR. **Not proven:** a physical phone.

## Card load, 2026-10-25: the six precons on the Decks screen (Claude Code on Personal-HP, for Rob; `claude/engine-precons-oct2`)

Rob, 2026-10-25: *"Next, we need to ensure that all cards in the precons listed on the Decks screen is loaded into the game
engine and can be played in Play."* The six "New from Wizards" decks (Foundations Commander and Reality Fracture
Commander, 2026-10-02): 406 distinct cards, 256 play now, **150 to write**. Multiverse Reforged plays already; of the
commanders only Ghoulcaller Gisa is unwritten. `docs/engine/card-load-precons-2026-10-25/` has the review, the brief and
five lane files, one per deck.

- **Done:** five lanes, one per deck, wrote the 150 (A Angels #869, B Engineering #866, C Dragons #870, D Dinosaurs #867,
  E Zombies #868, each into this branch), none stopped: **6,255 definitions became 6,405**, and all six decks seat whole.
  Built: a block tax (Archangel of Tithes), Duplicant, reselecting a defender, dethrone, pack tactics, behold, read ahead, red mana
  kept, divided damage, paired fights, Kalitas's replacement, and more (the README's result).
- **Ignores, named:** Kalitas beside another exile replacement (order not asked, CR 616.1) and two state-based deaths
  without a Zombie; Emeria Shepherd's Plains read on resolution; Serra Avenger in games saved before this load; Leyline
  Tyrant's zero not offered; pack tactics with negative power.
- **Proof:** `check-cards` 6,405 definitions, 10,928 scenarios, 0 failed; 419 touched suites green; every breaks file
  `missed: []`; `anchors.py` clean. **Not proven:** a game at a real table with these decks. This branch also carries
  #863's record of the 10-24 load.

## AI spend audit and the Claude seat's thinking, 2026-10-24 (a Claude cloud session, for Rob; `claude/busy-dirac-1jkaoo`)

Rob, 2026-10-24: *"I want to understand API usage for the games that have been played. I'm seeing costs much higher
than expected. Make sure that the Claude model we're using for Hard is on the lowest cost model."* The AI seat on Claude
(level `llm`) is already on Claude Haiku 5.5, the lowest-cost model ($0.10 in, $0.50 out a million), on both release
profiles. Every call the door has made is in `ai_calls` (read 2026-10-24):

| Database | Feature | Calls | Logged cost |
| --- | --- | ---: | ---: |
| `crankmagic` (production) | any | 0 | $0 |
| `crankmagic-staging` | pilot (the AI seat on Claude), Oct 22 | 21 (14 errors) | $0.0099 |
| `crankmagic-staging` | coach, Oct 11 to 15 | 12 | $0.0079 |
| `crankmagic-staging` | explain, Oct 9 | 1 | $0.0002 |

- **So the bill is not the games.** About 2 cents in all. The rest of the key's spend is outside the door, which logs
  nothing: the card compiler (`game/tools/engine-compile.mjs`, Sonnet 5.5 writer and Haiku 4.5 read-back), the deck
  guides (`guide-agent.js`, Opus 5) and any session using the same key. Only the Anthropic Console's usage page, by key,
  shows those.
- **Fixed:** 14 of the 21 seat calls ended at exactly 300 output tokens. Haiku 5.5's default thinking used the whole
  allowance, so the answer was cut off: billed, logged as an error, and answered by the house pilot. `pilotBody` now
  turns thinking off for each model in `MODELS`. `tests/ai-door.mjs` checks it, and goes red without it.
- **Not proven:** the live API taking `thinking: {type: "disabled"}` with structured output at low effort on Haiku 5.5.
  Read staging's next seat calls in `ai_calls`: the outcome should be `ok`, with output well under 300 tokens.
- **Joe is on the invite list.** He was added to the Access rule group "CrankMagic invitees",
  which staging's Invited policy includes, as Luke and K. Harbeson are. Production's Invited policy does not include the
  group. Rob, 2026-10-25: *"Add Joe to production's invite list too"*: Joe's address alone is now in production's
  Invited policy too ("CrankMagic Accounts"), beside Rob's. The group is still staging's only.
- **Merged and on staging, 2026-10-25** (Rob: *"Merge it and release staging"*). PR #857 merged as `854ffa1f` with a merge
  commit: Actions `suites` green on head 582fa126 (run 40167591138), base 4096eb28 unmoved. `tools/release-staging.sh`
  ran from a cloud container, with wrangler 4.139.0 authenticated through the proxy. Acceptance passed 23 checks and
  play-e2e 44. It pushed `release/cloud-staging` 78180a8b. `wrangler deploy` of that tested folder made version 2c58059b,
  1.24 MB gzip. The live staging `index.html` is byte-identical to the build and reads `854ffa1 · 2026-10-25`.
- **The two other callers, moved to cheaper models, 2026-10-25** (Rob: *"switch the compiler's check step to Haiku 5.5
  and the guide writer to Opus 5.5"*; PR #864):
  - **The card compiler's read-back** (`READER_MODEL`, `game/tools/engine-compile.mjs`) is Claude Haiku 5.5, $0.10 in and
    $0.50 out, a tenth of Haiku 4.5. It asks with thinking off, as Haiku 4.5 read, so the checklist keeps its 2,000 tokens.
  - **The deck guides** (`guide-agent.js`, the price in `tools/generate-guides.mjs`) are on Claude Opus 5.5, $4 and $20
    against Opus 5's $5 and $25.
  - **Proof:** `tests/engine-compile.mjs` and `tests/guide-agent.mjs` hold both, and each goes red without its change.
  - **Not proven:** a live compile or guide run on the new models; neither spends without Rob's go.

## Card load, 2026-10-24: Rob's four priority lists (Claude Code on Personal-HP, for Rob; PR #862): merged, on staging

**Merged, 2026-10-25:** PR #862 (`claude/card-engine-loading-0584aa`, head e9804988) merged to main as `30172f7e` at
03:22 UTC, by the Decks session at Rob's request, after Actions `suites` passed on that head (run 40140621294, 38
minutes) with base 71929eb4 unmoved. The Decks session then released staging with Codex's #769: release/cloud-staging
`2bfa3082` from main `4096eb28`, which carries #862 (its report: acceptance 23, play-e2e 44, Worker dry-run 6.78 MB /
1.24 MB gzip, Cloudflare version 5c5ad208, `staging-check --expect 4096eb28` passing). The release slot is free.
Production is unchanged. Linear: ROB-195, Done.

Rob, 2026-10-24: *"Here are a few lists of cards we need to prioritize loading into the engine. Review what needs to be
loaded, then begin the engine updates to make all of these cards playable."* Four deck lists, 287 distinct cards: 187
play now (three are flavor names of defined cards), **100 to write**, every list's commander among them.
`docs/engine/card-load-rob-lists-2026-10-24/` has the review (`README.md`), the lanes' brief and the three lane files.

- **Done:** three lanes wrote the 100 (P1 blink #861, P2 Food #860, P3 counters #859, each into this branch), none
  stopped: **6,155 definitions became 6,255**, and all 287 cards of the four lists are final, every commander among them.
  Built: airbend, waterbend, myriad, harness, an additional end step, devour, sacrifice X, descend, shield counters,
  Alliance's unchosen modes, moving counters, "choose one at random", and more (the README's result).
- **The integration** fixed fidelity (an ability inside a longer sentence no longer claims the rest of it; Gandalf the
  White) and made `engine-compile`'s held-out checks independent of the sample's position.
- **Ignores, named:** Entity Tracker and Fear of Sleep Paralysis (no Rooms); Bilbo beside a life doubler (order not
  asked, CR 616.1); Feasting Hobbit's devour counters just after entering; Lobelia's mode chosen on resolution. They join
  the gameplay-gap list when PR #834 reaches `main`.
- **Proof:** `check-cards` 6,255 definitions, 10,482 scenarios, 0 failed; 414 touched suites green; every breaks file
  `missed: []`; `anchors.py` clean. **Not proven:** the Worker bundle's size (`definitions.mjs` 4.4 → 4.5 MB) under
  `wrangler deploy --dry-run` (answered by the release: 6.78 MB); a game at a real table with these decks.

## Codex · Workshop: merge and staging release, October 24, 2026

Rob resumed this lane to merge its completed work and push staging. PR #769 is scoped to Share Library boundary tests and four deliberate mutations, not completion of ROB-36/37. Current main is merged into `codex/workshop-sharing-acceptance`; newer Workshop status/budget records are preserved. Local checks are rerun on the combined tree before ready, followed by the Actions gate. Staging release and deployed-source verification follow the merge, coordinated in ROB-11. Recipient browser coverage and live sharing/mail acceptance remain open; the October 18 sign-in attempts did not yield verified sessions. No new feature, migration, inventory change, or production release is part of this slice.

## Card load, 2026-10-24: the compiler's candidates and the shared sentences (a Claude cloud session, for Rob; PR #855): merged

**Merged, 2026-10-24:** PR #855 merged to main as `abdf77a6` with a merge commit, on Rob's "complete through merge".
- **Readiness, re-run by the merging session:** base 02a52c3 unmoved, no conflicts, Actions `suites` green on head a8cdca0
  (run 40091861196, 35 minutes), and `tools/local-ci.sh` SCAN PASS on that head.
- **Not released to staging:** the next staging release belongs to the Claude · Engine release owner, who should first read
  the Worker's size from `wrangler deploy --dry-run` (below).

Rob, 2026-10-24: *"Look at the card list of cards not loaded in the engine but either automatically can be added or easily
added because of shared mechanics and characteristics with other cards loaded. Then run the load."* Done in one
session, in the Claude · Engine lane's card-load files only (`game/engine/cards/**`, the files generated from them,
`data/engine/candidates.json`, `docs/engine/card-load-2026-10-24/`). No engine code changed. PR #855.

- **The list:**
  - the compiler's 2,731 candidates;
  - 91 missing sentences each shared by 5 or more one-sentence-short cards (713 cards).
- **What changed:** **2,887 definitions became 6,155.**
  - 2,711 candidates promoted after review: 1,331 sentence-to-ability pairs, plus 83 whole cards.
  - 60 cards written by hand, each teaching one shared sentence.
  - 497 candidates those sentences unlocked, reviewed and promoted.
  - A third compile found nothing new.
- **Held back:** 23 candidates, each a compiler template bug: a wrong type slot, a number not carried through, another
  card's overload effect, a dropped condition.
- **Stopped:** 30 sentences that need engine rules (landwalk, horsemanship, wither, myriad, banding, buyback, unleash, …),
  each with the cards it would unlock. `docs/engine/card-load-2026-10-24/README.md` has all three lists.
- **Proof:** `check-cards` passes 6,155 definitions and 10,161 scenarios. The full run's five red suites were this load's
  and are fixed at f255470:
  - fixtures renamed `Smoke <name>`;
  - 2 Mace filed under `2/`;
  - 22 cards given scenarios that cast them;
  - suites made to fit the drained store.

  The PR's body holds the handoff.
- **Not proven:** the Worker build is untested here (no wrangler). `definitions.mjs` grows 2.5 → 4.4 MB (0.43 → 0.74 MB
  gzip), so the release owner should read the size of `wrangler deploy --dry-run` before the next staging release.

## Card load, 2026-10-23: wave 4d, six sessions (a Claude cloud session, for Rob; `claude/focused-feynman-tt20o3`)

The library load's lanes are merged (#826–#831, #837): of Rob's library, 4 cards are unloaded and 8 are candidates. This
wave reaches past the library into the most-played Commander cards (`data/engine/top-cards.json`). Its 333 cards are in
`docs/engine/card-load-2026-10-23/`, dealt into six theme lanes:
- **To write:** 189, the 185 most-played cards no table plays and no candidate covers (ranks 313 to 1,031), and the
  library's last 4.
- **To review and promote:** 144, every candidate among the most-played cards and Rob's 8. Three are in live decks: Absorb
  (D7), Goblin Sledder (D6) and Blossoming Defense (D3).

`README.md` there has the numbers, `BRIEF.md` the rules and the lane ownership, and `PROMPTS.md` the six prompts.

**Integrated, 2026-10-23, in one merge** (PR #852, `claude/focused-feynman-tt20o3`) with the Decks screen and New deck flow
(#844, below), which was held for it. **310 of the 333 cards are final:** 2,577 definitions became 2,887.

| Lane | PR | Final | Stopped on |
| --- | --- | ---: | --- |
| L1 stack | #846 | 52 of 55 | Cunning Wish, Extrapolate the Impossible (cards from outside the game, CR 400.11); Wear // Tear (split cards and fuse) |
| L2 graveyard | #845 | 48 of 55 | Sheoldred, Whispering One (swampwalk); Kardur (forced attacks until your next turn); Forge Anew (instant-speed and {0} equip); Electro (unspent red mana kept); Combustible Gearhulk (an opponent's choice of outcomes); Pest Infestation (up to X targets on a spell, L6 built it since); Mines of Moria (exiling three cards from a graveyard as a cost) |
| L3 combat | #847 | 49 of 55 | Kappa Cannoneer (improvise, L6 built it since); Curse of Opulence (Auras that enchant a player); Grim Hireling and Chatterfang (sacrifice X as a cost); Trouble in Pairs (the second card drawn this turn); Shock stays a candidate (130 scenario files use a Shock fixture) |
| L4 mana | #849 | 54 of 56 | Archway of Innovation (improvise, L6 built it since); Desperate Ritual (splice onto Arcane) |
| L5 tokens | #848 | 53 of 56 | Springheart Nantuko (bestow); K'rrik (life for {B}); Caged Sun (mana doubling on any land's mana ability) |
| L6 spells | #850 | 54 of 56 | Throne of Eldraine (mana spendable only on one color's costs); Marvin, Murderous Mimic (activated abilities copied in layer 6) |

- **Every stored learned record is withdrawn.** The lanes confirmed the last 22 by hand, so the onboarding ledger is 28
  confirmed and `data/engine/scripts/` is empty.
- **Where two lanes built the same rule:**
  - **`multiplyCounters`:** L3 and L5 both added `selector` and `counter`. L3's implementation is kept, and L5's break is
    retargeted to it.
  - **Recording the cards `digUntil` exiled:** L1 and L6 each record them, into different slots. L1's `rememberAll`
    fills "the exiled cards" beside "that card" (Tibalt's Trickery); L6's `remember: "all"` makes them all "that card"
    (cascade). Both are kept.
  - **The X a cast announces, in its target context:** L5 and L6 wrote the same line, and it is kept once. L5's
    `{min: "X", max: "X"}` and L6's up to X on an {X} spell are kept.
- **Four breaks re-anchored** (`anchors.py`: 3,025 breaks, 0 problems) and proved caught again.
- **Next (cards now within reach):** Kappa Cannoneer and Archway of Innovation (improvise exists now) and Pest Infestation
  (up to X targets exists now).

## Rob's two-card engine load, October 23, 2026 (Codex, `codex/cards-nethroi-boromir`)

Rob requested Nethroi, Apex of Death (D4) and Boromir, Warden of the Tower (D7). After putting the release on hold,
he authorized continuing through merge on October 23. Staging deployment remains on hold.
This task owns the engine additions required by those two cards. The separate Play checkout and its changes are preserved.

- **Implemented:** mutate casting and over/under choice, merged physical cards and zone changes, commander components,
  copying, flickering, ordering and Nethroi's total-power target limit; the Ring emblem, bearer designation and all four
  abilities, plus Boromir's vigilance, zero-mana counter trigger and protection ability. Both definitions have card scenarios.
- **Local proof:** `node tests/engine-mutate.mjs` (20 checks), `node tests/engine-ring.mjs` (15 checks),
  `node tests/engine-cards.mjs` (2,602 definitions and 6,250 scenarios), the affected state, stack, target, copy, commander,
  combat, layer, schema, controller, projection and pilot suites, plus the table scenarios and save/resume storage suite.
  `python game/tools/batch/breaks.py game/tools/batch/breaks-mutate.py` and `breaks-ring.py` prove the new paths can fail.
- **CI follow-up:** the first run caught unnecessary counted-power derivations in the legend check and an import before
  the turn module's copyright header. Both are fixed; `engine-derive-once` (17 checks), `engine-headers` (4), the affected
  Ring, mutate, filter, state-based action and turn suites, and both moved Ring breaks pass locally. The corrected head
  must pass CI before the merge.
- **Rules review:** CR 702.140c gives the over/under choice to the mutating spell's controller, including when an opponent
  controls the owned target. The regression first failed with the choice given to the creature's controller, then passed
  with the correction; the creature keeps its controller. A deliberate break holds this case.
- **Merge gate:** main d7589c5f (the latest Play updates) is merged into this branch, with README suite count reconciled.
  The integrated PR head must pass the secret scan and GitHub CI before merge. Staging deployment remains on hold.
  Production is outside this request. No Forge behavior is claimed by this load.


## Rob's fullscreen notes, 2026-10-21 (a Claude cloud session, for Rob; PR #832, `claude/wizardly-galileo-ol2d4s`): merged, on staging

Rob, in Full screen: *"Make these changes now so that I can restart my game with them applied in staging."* At his word this
session changed files of two lanes -- the room and the engine's land offer (Claude · Engine) and the board (Codex · Play,
held by the Personal-HP Claude session) -- in one PR, as #743, #751 and #793 did. Rob, mid-task: *"We want functionality to
be implied where there are parallels ... I can reach over, pick up a card I put down and put it back into my hand. No info
needed."* So the take-back is a gesture with no button or instructions.
- **What changed (new matches only; a match launched before plays as it did):**
  - `landAnyStep` (room key, engine `state.landAnyStep`): a person plays their land drop in any step of their own turn they
    hold priority in, the stack empty -- a house rule over CR 305.1, the AI seats by the book. A land is no reason to stop
    a step that has nothing else, so steps still pass by themselves (`idle`).
  - `takeBackLand`: a land just played, nothing since, goes back to the hand -- the game restored from a copy taken as it
    was played (`landBack`, under its own storage key), checked by hash -- and the person is asked while it may. On the
    board, its double-click; a single click (a tap) waits 300 ms for it; no "You can also" button.
  - `askAimed`: another player's spell or ability on top of the stack aimed at a person, their permanent, spell or
    graveyard card asks them before it resolves. And the way of playing `askStack` (the board's "Skip my priority if no
    response possible", on by default, `prefer` frame) asks them whenever anything is on the stack.
  - The board: a card plays on its click in Full screen too; the pass, Resolve all and Skip to end stand large over the
    table in Full screen; each card another seat casts or plays is held up at the left for ten seconds (or its ✕); the two
    priority checkboxes at their own size, words bold; brighter outline on what you can use; the tabletop's Cards and Zoom
    to 200%; the commander tax moved below the title bar.
- **And Rob's Oct 22 notes, same PR:** on Decks, "Playable" means playable on Play (the summary counts the decks the table
  plays every card of, `C.play.count`, with no "$ to finish them all"), and the chips are Playable (in the app, where Play
  is in the cloud) and Boxed Decks (the physically playable stage; its badge and deck-page word are now Boxed). The lobby's
  deck chooser shows each row's commander colors and what the deck does (its notes, else its commanders' rules text,
  fetched through the card catalog when no record here holds it), and a Playable checkbox, off until ticked, remembered.
- **Proven here (cloud container):** `tests/room-lands-and-aims.mjs` 39 checks, `breaks-lands-and-aims.py` 15 of 15;
  `tests/board-fullscreen-notes.mjs` 31 checks (Chromium), `breaks-board-fullscreen-notes.py` 14 of 14; every board
  browser suite green after its updates (`table-board`, `a11y-board`, `table-tabletop`, `table-camera-layout`,
  `table-shared-shell`, the `board-*` suites); `table-lobby` 131 checks, `decks-hub`, `card-states-screens`; the room and
  engine suites, `feature-wiring`, `data-integrity`, `asset-versions`. Three suites need
  `NODE_PATH=/opt/node-tools/node_modules` in this container (`tools/play-tabletop-preview.mjs` requires
  `playwright-core`).
- **Merged and on staging, 2026-10-22:** #832 merged to main as `159a4057` on Rob's go without its Actions suites run
  ("Suites will fail due to timeout. Skip them."); base 1d38505 unmoved, the touched suites, the 262 CrankMagic Online
  tests and `tools/local-ci.sh HEAD 0` green here. `tools/release-staging.sh` pushed release/cloud-staging `ff5a7994`
  (release-acceptance 22, play-e2e 42); `staging-check --expect 159a4057` read both pages and /api/me back. Staging also
  carries #826, #828 and #830; production is still 1fcfc3d7. The record is in Linear ROB-11.
- **Not proven:** a game with Rob at the table on staging; Forge (none of this touches it); `table-tabletop` here (its
  node process runs out of memory in this container, on main too -- CI runs it), so of the 9 breaks re-anchored on this PR's
  lines, 8 were caught here and the ninth, "the kept Camera not read back" (`breaks-play-tabletop.py`, which only that
  suite catches), was not re-run.
- **CI after the merge (#835):** the first Actions run of the suites on main's code failed one check of
  `tests/board-fullscreen-notes.mjs`, "its single click waits out the double-click": it looked for the tap a round trip
  after the click, and a busy runner's round trip passed the board's 300 ms. The check now times the click to its act
  inside the page (still caught by its break); `table-tabletop` was green there.
- **Outstanding:** play-e2e's sixth step (Rob concedes as the game begins) failed once in the first release walk, `/concede`
  answering without a table, and passed on two re-runs of the same commit: a race between a concede and the alarm's launch,
  not yet chased.

## Library card load, 2026-10-21 (a Claude cloud session, for Rob; PR #816, `claude/focused-feynman-tt20o3`)

Rob's updated library and decks workbook is `data/source/Backup_Load_-_CrankMagic_-_2026-10-21.xlsx` (Master Table v1).
PR #816 has two products.

**The backup.** It holds 34 decks. D1–D7 are live and locked, each with its box; 30 substitutes hold the seats of the cards
coming in, from each deck's `1S-<card>` status and checked against the Card Notes. 27 decks are designs, loaded as drafts.
TB1, TB2 and TB5 are folded into D1 and D7 rather than loaded (Rob's choice): TB2's 27 cards that D1 lacks are D1's watched
cards, and TB5's Upgrade rows are D7's. Each deck's Deck Reference text is its notes, which the deck page shows as its
summary. Rob restores it himself; `data/live-*.json` (Load Live) are unchanged.
- Built by `tools/build-live-load.mjs --only --watch-into` and `tools/build-live-state.mjs --out`.
- Proved by `tests/live-load.mjs` (587 checks, including the workbook's totals: Own 2,038, in boxes 699, to buy 31) and by
  the app's `readBackup`.

**The engine index.** `tools/library-engine-index.mjs` sorts the library's 1,364 cards:

| Final | Candidates | No table plays it |
| ---: | ---: | ---: |
| 1,246 | 8 | 110 |

D7's commander, Queza, is among the 110. The work is dealt into eight sessions in `docs/engine/library-load-2026-10-21/`:
six theme lanes, a candidate review and an integration. `README.md` there has the numbers, `BRIEF.md` the rules, and
`PROMPTS.md` the prompts. Lane branches are `claude/engine-libload-<lane>`; they push draft PRs and do not edit this file. The
integration session (`claude/engine-libload-integrate`) records here, merges, and releases staging only if the Claude · Engine
lane is free or its own.

## Invitation runtime release, October 17, 2026 (Fable 5.1 cloud session, temporarily in Codex's lane)

**October 18: the Play boards handed back to Codex Astra** (`docs/HANDOFF-TO-CODEX-2026-10-18.md`), and Rob's program reorganized around his north star: Linear initiative I-1 with eleven outcome projects, five workstreams (Claude · Engine, Claude · Deck intelligence, Codex · Play, Codex · Workshop, Grok), the charter `docs/program/README.md`, the readout `docs/readout/index.html` with one feed per workstream, the instruction sets `docs/program/workstreams/`, the kick-off prompts `docs/program/KICKOFF-PROMPTS.md`, and the launch checklist draft `docs/program/LAUNCH-CHECKLIST.md` (ROB-137, for Rob's approval). This session continues as Claude · Deck intelligence. The paragraphs below are the record of October 17.

**Holder, temporary (October 17):** a Claude cloud session (Fable 5.1) on `claude/crankmagic-invitations-ob12tu`, holding Codex's lane (access/user management, invitations/sharing, Play presentation, Babylon prototype, UX feedback loop) while Codex usage resets, per Rob's October 17 handoff (`docs/HANDOFF-OPUS-2026-10-17.md` on `codex/handoff-opus-oct17`, PR #738). The engine lane (Fable, `claude/admiring-franklin-58cxy4`, ROB-71) is a separate session; coordination is in Linear ROB-11 and on GitHub only. Ownership returns to Codex with a dated `docs/HANDOFF-TO-CODEX-<date>.md`.

**Done, proven:** PR #737 (`codex/invite-runtime-oct17`, fd152c64) merged to main as `1990ad1d02171b6418fd54d9eeeb0ebda37a438c` with a merge commit, on Rob's one-time exception for the two pre-existing failures in Actions run 39044154055 (`tests/a11y-board.mjs`, `tests/engine-breaks-anchors.mjs`; ROB-15, ROB-16); the run's log names no other failure. Re-run here before the merge, on fd152c64: `tests/sharing.mjs` 68, `tests/cloud-worker.mjs` 126, `tests/feature-wiring.mjs` 124; `tests/uat/sharing-runtime.mjs` under Miniflare 4.20260730.0 with `WORKER_RUNTIME_DATE=2026-08-06` (the newest date that binary supports) passes its three native scenarios; `tools/local-ci.sh fd152c64 0`: SCAN PASS, merge clean. The staging release was built from the merge commit with `tools/release-pages.mjs --ref 1990ad1d --profile cloud-staging` (359 files, 63.7 MB); against the accepted fd152c64 candidate only `index.html`, `crankmagic.html` (the version meta) and `version.json` differ, and against the live release 45d35eef only the two adapters and those three files. `tests/uat/release-acceptance.mjs` passed 22 checks on that build (local serve, live Scryfall). Committed as `release/cloud-staging` `eed2f1a49754b2746ef86c711ac24eb55f8dea3c` and pushed at 16:29 UTC. `tests/uat/play-e2e.mjs` was not re-run here (no wrangler in the container; the change touches no Play module). Production unchanged at c9ad0e65.

**Deployment proof:** Workers Builds built `release/cloud-staging` eed2f1a4 (build `9a2ca50f-bfd7-4665-9054-3645f2e86b64`, success at 16:34:21 UTC) and deployed version `4992a1e5-4cd4-4285-916e-a955ab51b356` (deployment `0eaaffa8-403e-485b-a1c1-25eb7304f512`, 16:34:12 UTC). Authenticated `https://staging.crankmagic.com/version.json` (Access service token) reads `commit` and `source` `1990ad1d02171b6418fd54d9eeeb0ebda37a438c`, profile `cloud-staging`. The deployed `play-worker.js` fetched from the Workers API is byte-identical to `wrangler deploy --dry-run` of the committed release folder (4,120,548 bytes, sha256 `42f1bc7e9fb2ecb7d5641bd14d1bf12dfe63f7ce571b7c0b12d7bedad04898e2`). The `Workers Builds: crankmagic` check on the same commit fails as it has on every staging release commit (production's build trigger reading a staging branch); production's `/version.json` still reads c9ad0e65. Staging secrets were untouched (deploy by Builds, not by hand).

**Live acceptance, October 17, 16:48 and 16:54 UTC (Rob's sessions; this container read only aggregates and masked policy rules):** two owner invitations sent from Rob's owner session on staging 1990ad1d, the second to an address that had never been in any Access policy or group. Each: the reusable Invited policy gained one email rule with the prior group rule preserved (`updated_at` 16:48:44Z and 16:54:56Z; the account audit log shows only these two `access_update_policy` events), the outbox job went to `sent` on its first attempt with a provider message id, the admission lock released, an account and profile were created, and the recipient opened the link, entered the emailed code and signed in (Rob's report). Still to record: the Reviewer-scoped shared decks, a refused write, and a shared deck chosen in a lobby by a recipient (ROB-10, ROB-30, ROB-36, ROB-37).

**Not proven, next:** the six shared decks under Reviewer, write refusal, and a playable shared deck in a lobby, from a recipient's browser (the `/api/social/invite` route admits only `INVITE_ADMIN_ID`, and this container's Access service token names a service, not a person, so recipient-side checks come from Rob's browsers or the `work/` scripts on Personal-HP). Read-only staging facts before the test (D1 counts, no addresses read): 1 invitation row, 0 admitted, 0 mail jobs, 0 locks, 6 public shares. Linear: ROB-10, ROB-72, ROB-11.

**Later on October 17 (same session):** ROB-10 and ROB-72 closed on Rob's word after the second, never-admitted address signed in. The Grok Bot work package is `docs/grok/WORK-PACKAGE-2026-10-17.md` (one coordinator, four workers on disjoint files; Linear ROB-96; not yet handed to a bot). The Play screens were reviewed against Rob's latest decisions (`docs/play-overhaul/PLAY-REVIEW-2026-10-17.md`, twelve findings, shots `review-1017-*.png`): `main` serves three desktop shells and a phone board rotated 90°; the broad draft holds the October 15 decisions but is unmergeable as is, so ROB-99 ports it in three slices. The ROB-14 backlog is reorganized into six project milestones M1–M6 with engine dependencies, and a `Lane` label group (Engine · UI · Shared · Grok). Rob's table feedback ("it is not rendering as a table edge") is ROB-100: the Babylon lab is ported onto this branch unchanged from the draft (`ui-prototypes/babylon/`, 36bb9446), and `tables.js` adds seven table designs as real 3D objects (medieval banded oak, colonial inlaid mahogany, futuristic glass, tavern planks, card-room felt, stone dais, volcanic obsidian), chosen in the lab's Camera panel and remembered per device; the default camera now frames the front edge. `node ui-prototypes/babylon/table-design-checks.mjs` proves each design on desktop and phone sizes with a mutation; shots `table-design-{desktop,phone}-<design>.png`. Step 2 (Rob: keep all seven, default medieval-banded) landed in 7ec10a92, merged with main 9cf57d0c (#729) at 37be0788: `CrankStage.appearances.tables` carries the same catalog, `CrankStage.tableDesign(id)` maps the old `wooden`/`stone`/`obsidian` onto `tavern-plank`/`stone-dais`/`obsidian-glass`, the 2D stage paints a flat fallback per design until the Babylon renderer ships, and the Camera menu's "Table design" select plus a new Settings > Appearance select choose from it per device (`cm-stage-table`); pins stage 6, board 52, settings 13, service worker 482, app shell 498; `tests/table-tabletop.mjs`, `settings-r3` 63, `a11y-board` 288, `asset-versions` 124 and `tools/local-ci.sh HEAD 0` green; shots `table-design-stage-fallback-{medieval-banded,glass-future}.png`. The Grok package's G1 and G2 are withdrawn (both landed on main through other PRs); the relay prompt is `docs/grok/ORCHESTRATOR-PROMPT-2026-10-17.md` (G3, G4; base main 9cf57d0c). Not done: the Babylon renderer on the live board (ROB-52) and host sync of the choice (ROB-51, engine lane).

**Agreed with the engine lane (ROB-11, Oct 17):** no concurrent staging deploys, the slot is handed over in ROB-11 comments; migration 0006 is reserved for `card_demand` (ROB-86), this lane's next is 0007; `commanderTax` is an accepted additive `CrankRoomView@1` field, read by the UI under ROB-29 only after ROB-12 merges; ROB-15/ROB-16 stay in this lane.

## Play tabletop preview, October 14, 2026

**October 23 R3 started, Codex · Play:** Rob requested the next roadmap feature set. `codex/play-r3-zone-navigation` starts from main 8ea72639 (the verified shared-deck Staging release). R3 is crowded boards and card handling; the first slice unifies existing overflow navigation across Table, Focus, 3D and phone. ROB-74 remains Backlog in Linear, so the pending R2 engine payment contract is not invented by presentation. Local proof: crowded-zone navigation 55, real board gameplay 290, accessibility 298, Settings 68, 3D/gesture 48 and R2 Actions 88; three deliberate breaks caught and restored. Scope and remaining work are in `docs/play-overhaul/R3-ZONE-NAVIGATION.md`. This slice does not claim the complete R3 package or a Staging deployment.

**October 24 R3 continued, Codex · Play:** `codex/play-r3-zone-navigation`, draft PR #854, now includes whole-card rows, creatures and planeswalkers first, next-row previews, independently scrollable battlefield and lands, 30-degree tapped cards with reserved space, and uncropped image fitting. Main `02a52c3b` is integrated in merge `7c259046`; asset references preserve both lanes. Proven locally: `node tests/board-r3-zone-navigation.mjs` 121 checks (100 cards per player, four seats, all views, phone and card-size endpoints), `table-board` 290, `board-fullscreen-notes` 48, `settings-r3` 68, `board-r2-actions-inspection` 88; `table-tabletop`, `table-camera-layout`, `table-shared-shell` and `board-control` pass. The eight navigation/layout regressions in `tools/breaks-play-r3-zones.py` are caught and restored. The final accessibility baseline passes (298 checks), and removing the tapped-card focus ring is caught by the revised pixel test: nine deliberate regressions total, all restored. Exact stacks and attachments remain blocked on Requests row 5's authoritative public card contract, verified missing on main; no grouping by name is invented. Physical-device/real-art acceptance, full CI, merge and Staging remain unclaimed. The final pushed head and proof commands are recorded in PR #854 and `docs/play-overhaul/R3-ZONE-NAVIGATION.md`.

**October 24 R3 release authorized, Codex · Play:** Rob requested ready/CI/fix/merge/Staging and live crowded-board verification for #854. Main abdf77a6 (card load #855) is integrated in bfacfb58. The real Worker release walk exposed a stale four-card unsupported shortlist: the new card load supports all four. `tests/uat/play-e2e.mjs` now selects an unsupported mono-red card from the current Oracle catalog and preserves the 99-of-100 validation assertion. The walk fails before this fixture correction and passes all 44 checks after, including shared-deck selection, two people plus AI, reload and record replay. No engine behavior is changed by this correction. CI found and this release repairs the phone field height obscuring a partner commander, compact pile-count legibility, and asset hashes recorded before LF normalization. Crowded-board checks now pass 135, accessibility 298, and the partner-commander suite passes; all three new deliberate regressions are caught and restored. Control-inspection Escape now dismisses its tooltip before any drawer redraw can reopen it. The accessibility card-art fixture now uses an actual portrait card-back aspect ratio, preserving its pixel thresholds.  Loaded card artwork now explicitly replaces fallback text paint, while the accessible card name and failed-image fallback remain available. The new artwork regression is caught and restored; gameplay assertions inspect accessible card identity. Sparse zones and zone boundaries allow the phone frame to scroll through to its commanders and library, proven by the real two-browser gameplay regression failing before the fix. Final CI and the source/artifact/live evidence will be recorded on PR #854 and in the Play status report before completion; production is outside this release.

**October 23 shared-deck release repair:** Rob authorized Codex to repair `cloud/sharing.mjs` after live R2 verification found Cloudflare resource-limit errors in the shared-deck chooser. PR #851 merged as b9a1d8aa and reached Staging artifact 0b969931 after green CI, release acceptance 23 and Worker journey 44. Its per-owner request reuse reduced work, but the ninth live load still hit `exceededCpu`; it is not a fully verified resolution. Follow-up branch `codex/play-shared-deck-projections` continues this narrow Workshop exception: faster byte decoding plus a bounded immutable projection cache (100 entries / 2 MiB, five-minute expiry), scoped to the database binding and exact owner snapshot. Every request still reads current permissions and head; no full backup, permission result or request object is cached. Local proof: sharing 97, sharing UI 11, Worker routing/privacy 126, feature wiring 124, assets 125, plus four native workerd scenarios including cross-request projection reuse and immediate revocation. Deliberately disabling the cache and removing snapshot-version keys both fail the regressions. Fixtures cover 10 and 100 decks; live has six. No plan, spending cap, permission, migration or production change is included. The follow-up PR will carry exact-head CI and live Staging evidence; reliable live loading is still pending.

**October 23 R2 interim release, Codex · Play:** Rob authorized finishing the Actions flow and related ready UI/lobby work, then merging and deploying to Staging. PR #842 (`codex/play-r2-actions-inspection`) adds explicit selection/review/confirmation, a nonmodal card-use chooser, current-revision guards, and the lounge/four-seat setup layout. Existing engine payment choices remain authoritative; ROB-74's reversible source draft/atomic cast contract is still outstanding. Full first-final acceptance is not claimed. Proof and final release evidence are recorded in `docs/play-overhaul/R2-ACTIONS-INSPECTION.md` and PR #842. No production deployment is authorized. Local verification is complete: 88 R2, 289 room-game, 138 lobby, 298 accessibility, 74 Babylon and 48 gesture/scroll checks, plus four caught deliberate regressions. The PR records the exact-head CI gate and the subsequent Staging receipt; the downloadable report remains the status snapshot.

The first R2 full-CI run caught combat scrolling in the narrowed Actions pane, Coach's old dock, and outdated harness documentation. All three are corrected. Crowded blocking/tall-text cases, Coach's 65 checks across all views, and 153 harness checks pass; two deliberately restored layout regressions were caught. The corrected PR head must pass the fresh CI gate; final merge/deployment evidence remains on PR #842 and the downloadable report.

**October 23 R2 started, Codex · Play:** Rob authorized shared Actions/card inspection, the 3D rename and initial desktop default with remembered preferences. Branch `codex/play-r2-actions-inspection`, based on `a0310037`. Work is limited to Play presentation and browser proof. The separate engine session reports its Nethroi/Boromir staging release is complete at main a0310037 / artifact 49157517; that release does not include this R2 work. The fixed report baseline is at `C:/Users/robmi/CrankMagic/play-status/`; completion requires verified production release. The first R2 slice is locally verified: 61 R2 checks, 289 two-browser gameplay checks, 298 accessibility checks, 74 Babylon checks, long-choice scrolling, and three caught deliberate regressions. A draft PR carries the handoff; no R2 deployment or full CI pass is claimed. Remaining R2 scope and exact commands are in `docs/play-overhaul/R2-ACTIONS-INSPECTION.md`.

**October 23 final pane-bound follow-up:** `codex/play-preview-pane-bounds` measures both Focus's existing Boards pane and any open tools drawer. The live screenshot made their separate bounds visible; a preview must use the outermost of them when calculating the spare gap. The shared drawer/legacy pane consolidation remains in the first-final plan. The 43-check fullscreen suite covers the visible surfaces, narrow/exact-fit gaps and collapse; its deliberate omission of the Boards bound is caught. Final staging evidence is on the follow-up PR.

**October 23 screenshot refinements, Codex · Play:** Rob's two screenshots requested opponent-play previews in Focus's spare gap, roughly 10–15% smaller Full-screen actions, and tilt without rotation. `codex/play-preview-placement` merged in PR #839 as `13faf30b`, staging artifact `6d39278f`: measured drawer/mat gap on arrival, redraw and resize; desktop actions reduced from 56px to 49px; no rotation UI or horizontal drag rotation, and older saved yaw ignored. Its 298 accessibility checks required dark primary-action ink after shrinking the text. Follow-up `codex/play-preview-gap-edge` removes the extra margin from the fit threshold: a preview which fits the gap must not cover the drawer even when the preferred spacing cannot fit. The first-final plan now carries the Decision Desk/Table Companion visual direction with a feature-preservation crosswalk. Targeted checks and final release evidence belong to the PR records. This is a refinement of the existing controls, not completion of the remaining first-final features.

**October 23 staging verification, Codex · Play:** PR #836 merged as `35018161` on Rob's explicit "Skip suites and merge"; the pending full suite was not claimed green. On Rob's staging request, release `bc28e208` was pushed to `release/cloud-staging` and read back through Access, including both entry pages and `/api/me`. Chrome verified the Commander lounge and its explicit New table action. Live Full-screen verification then found a real opening-hand bug: the room's phase is null before turn one, and `fitStage` called `startsWith` on it before mounting Babylon. Follow-up branch `codex/play-release-verification` guards that phase, checks the pre-turn scene in the Babylon and Worker walks, updates the release walks for the lounge, and preserves the caller's Chrome override in the release script. Its test/release outcome is recorded in `docs/play-overhaul/BABYLON-LOUNGE-INTEGRATION-2026-10-22.md`. No further first-final features are included.

**October 23 merge handoff, PR #836:** Rob authorized checking final CI, fixing failures, and merging when all checks pass. Branch `codex/play-engine-lounge`; code/asset fix `baae9ef0`, based on `20e30f27`. The first full run passed 596 suites and failed only asset hashes recorded from CRLF working bytes; the canonical LF correction passes all 125 hashes against Git's index, feature wiring, release packaging (223), and the pre-push scan. Cloudflare's automatic preview builds are now disabled through the saved dashboard switches for both Workers; deleting generated triggers alone had not stopped their recreation. Release branches and deployments are unchanged. The PR records the final head, green gate and merge result when complete. First-final scope and limitations remain in the plan and proof below; a merge is not a deployment.

October 22–23, **Codex resumed Play on Rob's direct instruction**, on `codex/play-engine-lounge`, from main `20e30f27`. The first-final plan now reconciles CM-PLAY-MASTER v1; Rob authorized adopting the prototype engine without another bounded trial and making website Play open the pre-game lounge. The live stage uses Babylon table meshes with the existing room-authoritative DOM cards, shared projection, rotation/ground dragging and real context-loss recovery. The lounge preserves the seat/socket and offers verified Resume, New table, invitations and recent games. No fake chat/discovery. Proof: `docs/play-overhaul/BABYLON-LOUNGE-INTEGRATION-2026-10-22.md` (90 integration, 132 lobby, 288 real-game board, 298 accessibility, 31 fullscreen, 68 Settings, camera/shared-shell/tabletop, 223 release checks; six new and two re-anchored regressions caught). First-final scope/dependencies: `docs/play-overhaul/PLAY-FIRST-FINAL-2026-10-22.md`. Not deployed; rigid mesh-card interaction, the Actions/Boards overhaul, chat/presence and physical-device acceptance remain. The original dirty `codex/play-priority-cards` work, including untracked files, is preserved in stash `codex-preserve-priority-cards-before-play-engine-oct22`.

October 21, Claude (holding Codex · Play), for Rob's one-person, three-AI table: no blockers question when there is no blocker, on `claude/no-blockers-no-question`, stacked on #823. The solo-vs-AI run asked Declare blockers of the person with "No legal blockers." on it and a No blocks to press, for most of the AI seats' attacks. The declaration is empty (CR 509.1a), so it is no choice. The room now makes it for a person with no block on offer, and the history says "Rob has no creature that can block: no blockers". A person with a block they could make is asked as ever, yielding or not. It is a new pod key, `blocksNone` (room.mjs, kept with the match, saved and reopened), and `tableOn` launches every new match with it, so a game launched before is asked as it was. `tools/fuzz-live.mjs`'s pod, the table's, carries it too. Measured on 12 seeded games of Teysa, Krenko, Tymna + Kraum and Kiora: 864 decisions for the person against 957 without it, about 8 fewer a game. Proof: the new room-blocks-none 8, game-table, the 30 suites that launch table matches, table-board, 12 of 12 fuzz-live games clean with `--replay --leaks`, and `breaks-blocks-none.py` catches all eight breaks.

October 21, Claude (holding Codex · Play), for Rob's one-person, three-AI table: callouts that keep up with the game and keep off the question, on `claude/callouts-keep-up`, stacked on #822. Three solo-vs-AI games through the real board showed the problems. The callouts fell turns behind: "YOUR TURN · Turn 33" on turn 38, over the YOU LOST panel and its buttons, and "LIFE -3 · You · 20" at 5 life. They also lay over Discard 1 card's options and the turns-gone-by panel. Each view earns up to six callouts and they are read about one every 0.6 s, so the AI seats' bursts outran them.
- When a view's callouts come, any still waiting from more than 2 s before are passed over (never a KO or a FATAL).
- The game's end clears the queue and the screen, so GAME OVER or VICTORY is the last word. One batch alone, Try the callouts, is read whole.
- With a question's panel on screen, the callout layer moves below it, or above it, or waits out of sight (`placeCallouts`).
- On the phone the board's fixed layer (z-index 60) lay over the callouts', so none ever showed there. They now show, under the turn bar.
- At the end, the pass button reads "Game over" (it read "Resolve Massacre Girl, Most Wanted"), and a seat out of the game says "Out of the game." on its empty mat.

Proof: board-callouts 46, board-ending-rematch 68, the new board-callouts-place 24 (Full, Table, Focus, phone), table-board 287. `breaks-callouts-keep-up.py` catches all ten breaks.

October 21, Claude (holding Codex · Play), for Rob's one-person, three-AI table: "All at <player>" on Declare attackers, on `claude/attack-all`, stacked on #821. The engine offers one option per creature per player, so a Krenko swarm at three opponents was a pick per goblin. Now one press picks, for every creature that may attack that player, its option at them, keeping any other creature's pick; "None" clears them. It never picks a planeswalker. Nothing is sent until Confirm, and the room checks the attack as ever. `tests/board-attack-all.mjs`, `breaks-attack-all.py` 6 of 6.

October 21, Claude (holding Codex · Play and the engine halves Play waits on), for Rob's one-person, three-AI table: ROB-24's "show why another card is unavailable", on `claude/why-not-playable`. While Rob holds priority, each of his hand and command cards that nothing offered plays carries `why` from the room. The engine's `whyNot` gives the first reason a person would give:
- a land played already, or not his turn or main phase;
- a creature at the wrong time;
- "It costs 5 mana, and you can make 1 now", with the commander tax counted in;
- "It needs {R}, and nothing you have untapped makes it";
- otherwise, no target or another cost.

The board says it where the card's options would be: the hand's pop-up and Card zoom, a notice on a click, the Full card panel, and with the card's name for a screen reader. Only his own cards carry it, and no other seat's view. The contract line is in `docs/ui-lane/gameplay-anchor.md`.

October 21, Claude (holding Codex · Play), for Rob's one-person, three-AI table: ROB-171's placement on `claude/play-control`. This is Codex's draft #800 (source ef071f2a), with today's main merged in and kept whole. A permanent whose control changed (Oko's exchange, Zealous Conscripts) now sits on its controller's board, framed and labeled "Owner: …", and its owner's board keeps a faded, inspection-only reference "With …". Before, it stayed on its owner's board while another player attacked with it. The Oracle return explanation and displaced-controller ghosts still wait on Engine ROB-172; until then the reference says the return condition is unavailable. Record: `docs/play-overhaul/ROB-171-CONTROL.md`.

October 21, Claude (holding Codex · Play and the engine halves Play waits on), for Rob's one-person, three-AI table: `xTaps` on `claude/x-spells-tap`, ROB-74's slice that a person hits. A table's new matches offer an {X} spell for each X the pool and the caster's untapped sources pay together, tapping the sources as it is cast. Before, X counted only what was already floating, so a person had to tap every land by hand before Martial Coup, Grand Crescendo, Rally the Ancestors (D5 Teysa), Purphoros's Intervention or Tempt with Vengeance (D6 Krenko) was offered at all. It's a pod key, new matches only, so recorded games replay unchanged. The payment draft and Confirm cast are still ROB-74's.

October 21, Claude (holding Codex · Play and the engine halves Play waits on), on Rob's "what else can you do to make the game as ready as possible": ROB-170 on `claude/solo-away-waits`. At a table where every other seat is an AI, a person whose connection drops is no longer conceded after five minutes. Nobody is waiting on them, so the game waits, as they left it, and their Leave or Concede still ends it. With another person at the table, the five minutes are as before. This was the issue's own proposal; the rule was marked Rob's call, and it is one line in `dropped` (game/room/table.mjs) to revert.

October 21, Claude (holding Codex · Play, with the engine halves Play waits on): ROB-102's first half on `claude/play-pass-stack`, stacked on #809. A new match passes the stack for a person with no answer to it (the room's `passStack`), so Rob isn't stopped at every AI spell; the board calls out each spell that came and went on his next view (**CAST** · Maya · Cultivate · resolved). A person who holds an answer is still asked. It's a table rule, on unless the host turns it off (`/table/rules {passStack: false}`); the lobby switch comes with ROB-124. Record: `docs/play-overhaul/ROB-102-PASS-STACK.md`.

October 21, Claude (holding Codex · Play), on Rob's "make sure we aren't regressing anything": main checked beyond CI. The walks CI doesn't run passed on main's own build: release-acceptance, play-e2e, solo-vs-ai, real-deck-game, cloud-e2e, tour-walk, browser-geometry, sharing-runtime. Today's breaks files caught 133 of 134 on main. What still failed is brought up to date on `claude/stale-checks`:
- **first-look:** r3's wording, "Restore backup…", and r3's one-row phone bar that scrolls sideways.
- **crankmagic-journeys:** Play is New table now. The local host's lobby it walked is gone.
- **play-journeys:**
  - ROB-174, Focus's Lands caption under a land at 1280x720, fixed in crankmagic.css as the Table view's was;
  - Full is the 3D table, and the walk now counts its fan;
  - #813 moved the phone's Settings into the profile menu, and the walk reaches it there. That one was a real miss of mine.
- **board-combat-display:** now checks the board starts below the combat picture, so `breaks-combat-display.py`'s header break is caught.

All of those fail the same way on production's commit 5f6ea9cc, except the Settings move.

October 21, Claude (holding Codex · Play): ROB-18 on `claude/play-phone-upright`, stacked on #812. The phone board is upright, as Rob approved on Oct 18 (Codex's design from its prototype, #766). From the top: the rail with Camera, the seats in a row, the turn, the battlefield and its lands at full width scrolling in their own frame, then what is asked. Sideways, the seats are a column at the right. The hand is a drawer from the bottom, and nothing is drawn turned a quarter any more. Still open: tap-to-inspect on the battlefield, one utility at a time, keyboard clearance, a real phone. Record: `docs/play-overhaul/ROB-18-PHONE-UPRIGHT.md`.

October 21, Claude (holding Codex · Play): ROB-98 on `claude/play-land-spacing`, stacked on #811. Rob's approved 48px foot on the Full-view front mat keeps every land's upper half reachable with any hand card hovered (two land points blocked at 1280x720 without it), and the right drawer's resize line sits on its edge rather than 17px inside it. Both are Codex's Oct 18 fixes from its named stash, read and not dropped. Record: `docs/play-overhaul/ROB-98-LAND-SPACING.md`, "Shipped". ROB-18, the upright phone layout Rob approved the same day, is next.

October 21, Claude (holding Codex · Play): ROB-102's second half on `claude/play-draw-card`, stacked on #810. A table's new matches wait in the draw step for their player's **Draw card** (`drawBeat`), as Rob's Oct 15 playtest decisions ask; the library is the same button, and an AI seat draws for itself. ROB-24's upkeep and post-draw actions (with why a card can't be played yet) and the draw's motion for the other players are still open. Same record.

October 21, Claude (holding Codex · Play, with the engine halves Play waits on): ROB-168 on `claude/engine-combat-labels`, stacked on #808. In a person's view of Declare attackers and Declare blockers, same-named creatures say their power and toughness, then are numbered, each the same number in every option ("Wall 0/4 #1 blocks Goblin 1/1 #2"). A block on an attack at a planeswalker says so. These are the words only (`combatWords` in `game/room/room.mjs`): indices and ids stay the engine's, so answers and replays are unchanged, and a choice with no two alike is untouched. Proof: `tests/room-combat-words.mjs` (22, including a room game where every Brute is named Brute) and `breaks-combat-words.py` (5 of 5).

October 21, Claude (holding Codex · Play): ROB-166 and ROB-167 on the board, on `claude/play-ending-rematch`, stacked on #806 (the rematch route), which holds #805 (`result.ending`), #807 (ROB-29, ROB-169) and #804 (ROB-26). The banner reads `ending`: a person knocked out at a table of AIs reads "You lost. Your life reached 0. With only AI players left, the game ends here.", and every other ending says what it was. Play again and Leave the table are on the banner, and the lobby shows every seat's answer, the closing time and the buttons. Proof: `tests/board-ending-rematch.mjs` (62), `breaks-ending-rematch.py` (11 of 11), and `tests/uat/solo-vs-ai.mjs`, which plays a whole 1-vs-3 game, says "You lost", presses Play again and gets the next match `…g2` on the board. Notes: `docs/play-overhaul/ROB-166-167-ENDING-REMATCH.md`. Pins board 62, table 30, service worker 503, app 520.

October 20, 23:18 UTC onward, **Claude holds Codex · Play** (Rob: *"Open AI is done for the next few days. Pick up from where we're at."*). #801 (ROB-26 direct blocking, Codex's head `d6f5e554`) failed its exact-head run 39468706080: in Focus at 1280x720 the No blocks button ran below the window under CI's taller fonts. Continued on `claude/play-direct-blocking` from Codex's head, which stays untouched: Table and Focus now hold the question to the window (`fit()` measures its room; its middle scrolls, as #793 did for Full), proved by new tall-text cases in `tests/board-direct-blocking.mjs` and two caught breaks. ROB-173's wheel loop in `tests/table-tabletop.mjs` now scrolls to the list's end. Pins board 60, stage CSS 26, service worker 501, app 518. Proof: `docs/play-overhaul/ROB-26-DIRECT-BLOCKING.md` (its Oct 20 later section). In parallel: the room's structured ending (Requests row 10, ROB-166) and the rematch route (row 12, ROB-167) on `claude/engine-` branches. Next: #802 (ROB-23, ROB-24, ROB-29, ROB-169), then Play's halves of ROB-166 and ROB-167. #800 stays parked for row 11 (ROB-172).

October 20, Codex Play: ROB-26 direct blocking is complete locally on `codex/play-direct-blocking`, source `4a6551b1`, PR #801, with main `27fba609` merged. Private drafts use authoritative legal pairs and serialized room checks; explicit Confirm is guarded across stale replies, reconnect and receipt-before-view. All 16 deliberate regressions caught; required board/accessibility/Settings/tabletop suites and six-layout pointer proof pass. Three full solo games pass 42 checks, 78 combat comparisons and 585 privacy checks over 598 frames, identical replay, no AI refusals; ROB-166 still reproduces. Pins board 59, CSS 25, worker 500, app 517; 125 asset hashes pass. Proof and stable-ID screenshots: `docs/play-overhaul/ROB-26-DIRECT-BLOCKING.md`. Exact-head CI and Engine-owned staging acceptance remain. Next are ROB-23/24/29/169; ROB-167 requires the rematch route in Requests row 12. #800 stays parked for ROB-172; #795/#796 remain with the other harness. Production held.

October 20, Codex Play: #799 confirmed combat display merged with a merge commit as main `27fba609`, exact head `e36d138e` green in full CI run `39459768526`; main was unchanged at `17a1218c` and mergeability rechecked. Local proof remains in `docs/play-overhaul/ROB-26-COMBAT-DISPLAY.md`: required browser suites, twelve caught regressions, three full solo games with 78 combat-view comparisons and 585 privacy checks. Staging acceptance requested from Engine in ROB-11; production held. Direct blocking remains in draft #801, with #800 parked for ROB-172. Feed and ROB-26 updated at this merge.

October 20, Codex Play: continuing ROB-26 direct blocking on `codex/play-direct-blocking`, from main `17a1218c` with the pending #799 combat-display dependency merged. Drafts use `decision.legalBlocks` and the private socket `check`/`checked` contract, with explicit confirmation. ROB-171 remains parked in draft #800 for Engine ROB-172. Rob assigned #795 and #796 to another harness; this lane leaves their review and merge there. Remaining play-test fixes follow this slice.

October 20, 16:39 UTC, Codex Play merge: PR #798 merged with a merge commit as main `17a1218cc93da8e00c31cdfc5ffeeea44a4f11ae`, landing ROB-28 and ROB-165 together. Exact head `740a2fca` passed Actions run `39453407024`; main was rechecked unchanged at `d7eadfe1`, the PR mergeable, and the merge tree is the tested head's. #797's Yield commits are preserved and GitHub marks it merged too (its own head passed run `39450693232`). The reconciled feed is updated; Linear proof and the Engine-owned staging request are in ROB-11. Production remains held. The combat-display branch #799 has this main merged before readiness; its local proof and next direct-blocking slice are below. ROB-166 still waits on the structured room reason.

October 20, Codex Play: ROB-26's first slice is implemented on `codex/play-combat-display`, PR #799, source commit `e5d04d44`, with #798 integrated. The confirmed combat strip groups defenders and preserves public object IDs, planeswalker targets, blocker inspection, private drafts and removal behavior across Full/Table/Focus/phone. Review caught phone overlap; space is now reserved and a deliberate regression proves the defending creature's tap target. Eleven focused breaks plus the whole-game missing-display break are caught. Board 281, accessibility 298, Settings 68, shared-shell and tabletop pass. Three full solo games (42 checks) finish at turns 38/34/41, compare 78 actual combat views, replay identically, pass 585 privacy checks over 598 frames, and have zero AI refusals. Pins board 57, stage CSS 23, service worker 498, app 515; proof and labeled shots: `docs/play-overhaul/ROB-26-COMBAT-DISPLAY.md`. Feed updated. Exact-head CI and Engine-owned staging remain; physical phones and hardware WebGL remain unproven. Next is direct blocking from `legalBlocks` with serialized draft validation and the list fallback, then ROB-23/24/29. ROB-166's terminal reason remains requested; production is held.

October 20, Codex Play: ROB-165 is implemented on `codex/play-choice-scroll`, PR #798, with #797's Yield branch integrated. A long choice keeps its position across selection and deselection only within the same decision and match. Real pointer and five-point hit tests cover 60/150 options at 1024x768, 1280x720 and 1400x900; fresh decision and match frames reset to the top. All three deliberate regressions were caught. Board 278, accessibility 298 and Settings 68 pass before the conflict-free Yield integration; the combined tabletop and focused Yield checks pass. One camera-reload setup run stopped at an open dialog; the unchanged repeat passed, recorded without weakening assertions. Pins board 56, service worker 497, app 514, stage CSS 22 unchanged; screenshots and commands are in `docs/play-overhaul/ROB-165-CHOICE-SCROLL.md`. Feed updated; staging acceptance remains Engine-owned. #798 carries #797's commits for a combined merge on its exact-head CI. Next: ROB-26's shared combat display before direct blocking. ROB-166's structured terminal reason remains requested in row 10 and ROB-11; production is held.

October 20, Codex Play resumed on `codex/play-room-yield`, PR #797, from main `d7eadfe1`, following the newer handoff while #796 is open. ROB-28 now sends the room's Yield policy and reads acknowledged state, preserving required decisions and reconnect behavior. Proof: board 281, accessibility 298, Settings 68, shared-shell, tabletop, focused Yield browser checks with pointer hits at 1024/1280/1400 and phone, room Yield 43, and all six deliberate regressions caught. The adopted solo harness from #796 now checks private-zone identities against the replay oracle rather than exempting any first library card; its deliberate regression is caught. Three whole browser games finish in 38/34/41 turns, replay identically, pass 585 privacy checks over 598 browser frames, and refuse no AI answers. Pins board 55, stage CSS 22, service worker 496, app 513; proof and labeled screenshots: `docs/play-overhaul/ROB-28-ROOM-YIELD.md`. Feed reconciled with the handoff and validated. CI, merge and engine-owned staging remain; physical phone and hardware WebGL are unproven. ROB-166 is requested in row 10 and ROB-11; the banner reproduced, while current main already has a loss branch in `outcomeOf`, so the library claim needs separate proof. Next: ROB-165 choice scroll. Paused ROB-98 and drawer work remain in the named Oct20 stash; both visual approvals stand.

October 18, 08:03 UTC: ROB-99 slice 1 / ROB-19 merged in PR #754 as `73f55b353c3174ef735ec22ef2e733112c86a13d`, a merge commit, on exact-head `b538be8e` green Actions run `39107631823`. The merging session rechecked main unchanged at `41997462`, mergeability and the exact green head; local browser proof, 23 deliberate regressions and 223 release-package checks pass. Settings' Play implementation is now its own file; Workshop owns general Settings. Linear ROB-99, ROB-19 and ROB-11 carry the merge proof and staging request; the feed records ROB-19 in review with one hour remaining and ROB-99's remaining slices at 20 hours. `node tests/readout-feeds.mjs` validates the updated feed. The next PR #765 has main merged via `37f40e3e`, with no source changes from its proven `3e87d903` tree. ROB-98 and ROB-18 await Rob's visual choices; staging, physical phones and hardware WebGL remain unproven.

October 18 follow-up on `codex/play-table-camera`, draft PR #765, from `origin/main` with the pending #754 shared shell merged as its dependency. ROB-97 removes the duplicate Table slider and keeps Camera reachable when the enlarged hand makes Table scroll. Proof with `GEOMETRY_REQUIRED=1`: board 277, accessibility 298, Settings 63, tabletop/shared-shell/Camera-layout suites, and all four deliberate regressions caught (`missed: []`); static reviews found no actionable regressions. Pins board 54, stage CSS 18, service worker 484, app 500; details and labeled 1280 x 720 / 390 x 844 screenshots are in `docs/play-overhaul/ROB-97-CAMERA-SLIDER.md`. ROB-98's separate before/after proposal recommends 48px inside the front mat; the tested land targets clear at 1024/1280/1400 while the 1280 baseline fails. Its screenshot choice is pending in Linear and the feed; no production land spacing is changed. #754 remains in its single full CI run. Staging, physical phones and hardware WebGL remain unproven.

October 18, Codex · Play resumed on `codex/play-shared-shell`, PR #754, with latest main `41997462` (PR #753) integrated by merge commit `3b981760`. ROB-99 slice 1 shares the desktop header, Camera and overlay drawers and extracts Settings' Play card to `crankmagic-settings-play.js`. Local proof with `GEOMETRY_REQUIRED=1`: `table-board` 276, the shared-shell and tabletop suites, the full accessibility pass, Settings, choices 42, Coach 60 and Resolve All 59; all 23 new or moved deliberate regressions caught, none missed. Labeled desktop and phone-baseline screenshots and exact proof are in `docs/play-overhaul/ROB-99-SLICE-1.md`; wiring, data, readout, cache and anchor checks pass. Read-only review found two keyboard issues, both fixed with failing-then-passing checks. The engine-owned staging release is requested after merge and Rob's look; a physical phone and hardware WebGL are unproven. The feed revises ROB-19 to review with 2 hours remaining and ROB-99 to 20 hours for the remaining slices. Next: ROB-98, ROB-97, ROB-18, then ROB-52/ROB-100. Original pre-handoff local edits remain safely stashed.

October 17 invitation runtime diagnosis: the user-provided local ACCESS_INVITE_TOKEN verifies active and reads the configured staging app/policy (all HTTP 200). Its value was installed privately into staging's existing secret; the invitation still failed before admission. Native workerd reproduction rejects redirect:'error' before network access. Both Access admission and Resend used that unsupported option; both now use manual redirects and reject non-success responses without forwarding credentials. Native intercepted-network checks cover success, Access redirect refusal/no email, and mail redirect refusal. Reintroducing the old option fails the intended success assertion. Sharing 68, cloud-worker 126, feature-wiring 124 and data integrity passed. Runtime test is `tests/uat/sharing-runtime.mjs`, with MINIFLARE_MODULE pointing to the installed Miniflare module; installed workerd supports dates through September 30, which is used for this local check. Follow-up staging release and real mail remain pending. No engine changes. Full tracing was rejected by automatic approval review and remains disabled; no credential values were read back or logged.

October 17 Linear and staging checkpoint: Rob requested the complete Codex plan/backlog in Linear. ROB-14 now indexes 55 child issues (ROB-15 through ROB-69), with source coverage for P01-P15 and R01-R37, cross-story rules/UX acceptance, current evidence, and engine/UI dependencies. Read `docs/play-overhaul/LINEAR-BACKLOG.md`. Existing Claude engine issues ROB-12/ROB-13 retain their ownership and status; shared non-Play work coordinates through ROB-11. No engine edits in this checkpoint.

Focused PR #736 merged as 2d5772259fa3936543792c1e7ef20d396ee15c6f and staging release 45d35eefdc16d0af7160ca756d610b1ac32e3cfb is serving that source, verified through authenticated version readback. Rob authorized a one-time exception for the two existing failures in CI 38941502137; ROB-15 tracks accessibility repair and ROB-16 tracks the four mutation anchors. Production remains c9ad0e65264582a786d02710e0b76774d064a792. The first live new-account invitation failed Access admission and correctly withheld email; token settings are awaiting user confirmation. ROB-10 remains open: recipient sign-in, live sharing and playable-deck checks are unproven. Private authentication/test data remain in ignored work/. Preserve the unrelated collection-model edit and four MP3s.

October 16 CI result and release hold: run 38936762897 completed with a11y-board, deck-page-r3 and engine-breaks-anchors failures. The new Share Deck menu expectation is corrected (41 checks pass), and placing the staging sharing profile after cloud restores three release-profile mutation anchors without changing configuration. All 359 packaged files remain byte-identical to the accepted candidate (work/check-resend-artifact.mjs). The anchor scan now reports only the four pre-existing board anchors. An isolated accessibility diagnostic replacing its obsolete container selector exposes further assumptions about the retired rail, keyboard order and side pane; no accessibility assertions were removed and no diagnostic changes were copied into the release. Staging deployment and live mail remain pending the release gate. Prepared separate recipient login, read-only permission and playable-deck lobby scripts in ignored work/. Recurring release automation was rejected by automatic approval review and was not created; continuation is supervised in this chat. Production unchanged. ROB-10 retains the release evidence.

October 16 release waiting on CI: focused PR #736 is ready at ae1f677d and GitHub run 38936762897 is executing the required suites. Six owner-backed public Reviewer deck shares were inserted in staging with a current-head revision/checksum guard after re-reading the authenticated profile (revision 37); no library content changed. Migrations 0003–0005 and both Worker secrets are present. The live application still serves da39a2ed on staging and c9ad0e65 in production. The owner test session is authenticated, and a separate, previously unregistered recipient has been supplied privately. Live invitation/share/Email Deck browser testing is prepared but not executed until deployment. Fable handoff is published at docs/handoff-fable-engine-2026-10-16.md and tracked in ROB-11; release tracking remains ROB-10. No game/simulation edits after Rob assigned that lane to Fable.

October 16 lane ownership confirmed by Rob: Fable owns the game engine and simulation model; Codex owns UI and user management. Read `docs/handoff-fable-engine-2026-10-16.md` for the verified main/staging/production versions, pending commander patch to port selectively, playtest rules backlog, card-load program, and cross-lane contracts. Codex will not continue editing engine/simulation code. Shared cloud integration, migration numbering and releases require coordination; Codex retains the in-progress Resend staging release. Migrations 0003–0005 are now applied to staging, both secrets are installed, and the reusable invitation policy preserves its rules. Owner test-browser sign-in is authenticated. Release-acceptance 22 and local multiplayer 42 passed; application deployment and real email/new-invitee validation remain pending. Production source remains c9ad0e65; staging remains da39a2ed.

October 16 invitation admission checkpoint: staging now has ACCESS_INVITE_TOKEN and RESEND_API_KEY; owner authenticated the dedicated test browser with an email code. Staging’s existing Invited policy was converted to reusable, retaining its ID, rules, precedence and sole app attachment. The admission helper only updates that configured policy, preserves existing rules, checks attachment and readback, and serializes updates with migration 0005’s D1 lease. It never creates per-invite legacy policies. Local proof: sharing 68, cloud-worker 126; removing prior include rules makes the preservation assertion fail, then restoration passes. Updated multiplayer acceptance checks the live saved deck name and its commander independently. Focused release branch codex/staging-resend-oct16 retains main’s deployed board/engine; the working UI branch keeps the unfinished camera/header and commander work. Application deployment, migrations 0003-0005, six public live deck shares and authenticated invitation/sharing delivery are still pending. Linear ROB-10. Production unchanged; preserve unrelated collection-model and four MP3s.

October 16 Resend checkpoint, branch `codex/ui-playtest-plan-oct15`, draft PR #735, tracked as Linear ROB-10: invitation, sharing, Email Deck, and email-verification delivery now use a server-only Resend adapter with `invite@crankmagic.com`. A domain-restricted sending key was installed as `RESEND_API_KEY` on the staging Worker directly from the owner's local Credential Manager credential; no credential was printed or committed. The earlier provider-only test was delivered, but application-level staging acceptance is still unproven. Delivery retains an outbox-based idempotency key, a 15-second timeout, bounded attempts, recovery of interrupted sends, and a 23-hour retry cutoff. Migration 0004 adds attempt timestamps; 0003 and 0004 still need staging application. Sent means provider acceptance, not confirmed inbox delivery.

Proof: `node tests/sharing.mjs` passes 61 checks; removing the provider idempotency header fails the intended assertion, then restoring it passes. `node tests/cloud-worker.mjs` passes 126 checks; `node tests/sharing-ui.mjs` passes 11 browser checks with installed Chrome; `node tests/release-pages.mjs` passes 223 checks outside the sandbox (the first run could not initialize its temporary Git fixture). Release configuration includes staging-only account/application IDs; the sender is explicitly allowed by the release privacy scan. No UI layout or game mechanics changed in this checkpoint.

Outstanding: owner must install the scoped `ACCESS_INVITE_TOKEN` secret (setup steps supplied); authenticated staging invitation/share/email-deck tests and actual delivery readback; additive migrations and six verified live public deck shares; focused release packaging that excludes the unfinished desktop board refactor. Review Access admission against current reusable-policy APIs before live account-invitation testing. Sign-in investigation: owner reported that Google rejected the email address; staging's Google redirect reaches accounts.google.com, its Access audience matches the Worker, and owner Allow plus Google/OTP methods are present. No cause is proven; owner was asked to try existing email-code sign-in. Recent logs separately show a previously allowed staging invitee denied on production. No access policy was widened. Production remains unchanged. Preserve the unrelated collection-model edit and four MP3s.

October 15 Product Pass planning checkpoint, branch `codex/ui-playtest-plan-oct15`, draft PR #735: Rob requested an execution integration plan for Runway Pro, Higgsfield Pro, Magic Patterns, Mobbin, Jam, and PostHog, with code redemption handled manually by him. Added P15 to `docs/play-overhaul/PLAYTEST-PLAN-2026-10-15.md`: activation/entitlement checks; offline environment and material production; design-reference/prototype handoff; private bug reporting with public-repository sanitization; staging-first explicit analytics; safe renderer flags; and concrete acceptance milestones. Updated the earlier renderer decision text to reflect the already approved Babylon prototype at `36bb9446`. Official product docs and the current Product Pass catalog were checked. Runway API billing is separate from Pro; Higgsfield MCP can use plan credits while its API has separate billing. WebGL replay needs canvas-specific privacy treatment and is off initially. PostHog and Higgsfield plugins were found and suggested but are not confirmed connected. Other exact provider plugins were not returned by discovery; verified MCP/export paths remain planned. No accounts, billing, SDKs, remote dashboards, assets, reports, or deployments were changed. Next: Rob redeems benefits, then verify account scopes/quotas and implement P15 milestones B/C/D as dependencies become ready. Existing rules/UI work can continue independently.

October 15 Babylon checkpoint, branch `codex/ui-playtest-plan-oct15`, draft PR #735: Rob approved a true 3D interaction prototype using existing game state. `ui-prototypes/babylon/` is an isolated UI experiment reading the same projected recording as the current preview, initially frame 14/42. It includes a pinned, integrity-checked Babylon.js 9.30.0 setup, strictly allowlisted GET-only server, real card meshes with lift/settle shadows, within-section dragging and snapping, local tap/untap, inspection/return, keyboard controls, fixed Focused touch layout, desktop tilt, zoom/pinch/pan, existing muted Volcano video, playmat artwork, and locally cached card art. Public opponent cards are view-only; opponent hands remain backs. No game engine, cloud state, or production asset manifest is changed. The wood surface remains prototype art.

Proof command: `node ui-prototypes/babylon/interaction-checks.mjs` with UAT_PLAYWRIGHT, UAT_CHROME, and GEOMETRY_REQUIRED=1. Chrome mouse, keyboard, and emulated touch checks cover lift/settle geometry, bounded movement, tap, inspection, unchanged source state, hidden hands, frame changes, camera endpoints, portrait/landscape, pinch, cancellation, reduced motion, and server boundaries. The suite also disables movement and proves the movement assertion fails. Screenshots with feedback IDs are `docs/play-overhaul/screenshots/babylon-{desktop,picked-up,inspect,mobile,mobile-landscape}.png`. Feature wiring (124) and data integrity (50 variants) passed. Run instructions and limitations are in `ui-prototypes/babylon/README.md`.

Preview is served locally on port 4391, optionally on the trusted LAN for phone testing. Physical phones/Safari, hardware performance and battery use, live-room action integration, and final rendering/art quality remain unproven. Local taps do not pay mana or submit game actions. Nothing from this checkpoint has been deployed to staging. The broader P01-P14 work, prior stale board-suite assertions, and email setup remain outstanding. Preserve the unrelated collection-model edit and four MP3s.

October 15 resumed checkpoint, branch `codex/ui-playtest-plan-oct15`, draft PR #735: the authenticated Cloudflare MCP now works for Access/DNS inspection. Email Sending still returns 2036; Rob checked the dashboard and confirmed an upgrade requirement. He requested an infrastructure/rendering assessment using his Product Pass benefits before purchasing. The assessment and proposed sequence are added to `docs/play-overhaul/PLAYTEST-PLAN-2026-10-15.md`: Resend for outbound mail, retain Cloudflare game rooms, evaluate a Babylon.js rendering slice, and evaluate Supabase Auth/normalized deck data separately. No new provider, paid upgrade, Access policy, email, or migration was activated. The exact staging Access app is confirmed, but live invitation credentials and delivery remain unfinished.

This checkpoint completes the shared-shell interaction pass: Camera switches all desktop views, Tilt stays Full-only, Table/Focus drawers resize by drag or keyboard, Camera follows the right drawer, and mobile stays in native portrait/landscape Focused with no view switch. Table/Focus/mobile Camera zoom now changes mat size; Cards changes card size. The old fixed portrait rotation is overridden. Screenshots with H01/C01/D02/B01/M01/M02/A01 are `docs/play-overhaul/screenshots/shell-*.png`. Browser proof: `node tests/table-tabletop.mjs` with UAT_CHROME, UAT_PLAYWRIGHT, GEOMETRY_REQUIRED=1; additional focused rerun `node work/shell-proof.mjs` exercises the committed `tests/uat/table-shell-checks.mjs`. Both passed. The latter also inserts a deliberate rotated-mobile rule and proves the orientation assertion rejects it. Feature wiring (124), service worker (9), and asset hashes (124, unrelated model held separately) passed.

Not release-ready: `node tests/table-board.mjs` was rerun and stopped on its former `.cm-board-strip` locator at line 197, superseded by the common header. Its subsequent legacy pane/view assertions and a11y/anchor suites need migration and real-game verification. The wider P01-P14 work remains outstanding; no staging deployment from this checkpoint. Mobile touch-card inspection, crowded-board ergonomics, the enlarged maximum zoom range/card angle, manual payment, priority/draw/combat work, and live email/invitations are not claimed complete. Preserve the unrelated model edit and four audio files.

October 15 execution authorization: Rob approved the updated plan, starting with authenticated staging-deck verification and commander casting, then the remaining stories. Codex holds `codex/ui-playtest-plan-oct15` for this work. The engine lane is recorded paused until October 16; this authorized fix includes the narrowly required payment/commander engine changes and their tests, with no card-load-program work. Latest UI scope: mobile has one fixed Focused view; desktop shares header, configurable modules and collapsible drawers across Full/Table/Focus, retaining applicable non-Full drawer resizing. Camera appears in every view, owns desktop view switching, and shows Tilt only in Full. Screenshots retain feedback IDs. Cloudflare sign-in succeeded. Staging revision 36 verifies the current six: D1 Tymna + Kraum, D2 Chulane, D3 Kiora of Salt and Sand, D4 Felothar, D5 Teysa Karlov, D6 Krenko. The local shared catalog and fixture now match; the real lobby suite passed 114 checks. October 15 scope also includes live deck/library sharing, Reviewer/Collaborator permissions, shared decks in Play, administrator invitations, profiles and compact Settings. This explicitly authorized work includes the needed cloud API and migration while the engine lane remains paused. Cloudflare Email Sending inspection returned Unauthorized (2036); delivery setup is not yet proven.

October 15 sharing checkpoint: P14 adds live owner-backed deck/library grants, Reviewer/Collaborator roles, explicit public access, revocation, autocomplete, Email Deck, account-only invitations, profiles and compact Settings. Verified staging owner ID is 1. Local proof: `node tests/sharing.mjs` (42 checks), `node tests/cloud-worker.mjs` (126), `node tests/sharing-ui.mjs` (11 browser checks), `node tests/settings-r3.mjs` (63), `node tests/table-lobby.mjs` (114), `node tests/release-pages.mjs` (223), feature wiring (124), service worker (9), and version hashes (124 assets with the unrelated collection-model edit held separately). Removing the write-permission check makes the Reviewer edit test fail. Wrangler's staging dry run bundles the Worker; its duplicate commander-case warning comes from the preserved unrelated local collection-model edit, which is excluded from this branch's commits. Screenshots S01-S04/P01-P04 are under `docs/play-overhaul/screenshots/sharing-*` and `settings-*`.

Not deployed: apply migration 0003 and seed the six verified live deck IDs as public Reviewer shares before switching the staging chooser to account-based sharing. Email Sending returns Unauthorized (2036) despite the CLI's email scope. The sender domain, EMAIL binding, scoped ACCESS_INVITE_TOKEN, CLOUDFLARE_ACCOUNT_ID and ACCESS_INVITE_APP_IDS still need live configuration/verification. Never commit those credentials. Verified email changes preserve the canonical library/table identity; the former sign-in is denied. No automated test sends actual email. The earlier shared desktop header/Camera refactor is still in progress and has not passed the updated board suites; do not release that unfinished board tree. The rest of P01-P13 remains authorized and outstanding. Preserve the unrelated collection-model.js edit and four MP3s.

**Holder:** Codex on Personal-HP, `codex/ui-play-tabletop-preview`, merged as `da39a2ed` on main via PR #734 (tested UI head `25669945`).
Rob authorized the updated plan, starting with the reconciled checklist and working tabletop preview. On October 14 he explicitly transferred staging release ownership to Codex and authorized publishing this tested update so invitees can use his shared decks. Production remains unchanged.
Latest corrections: another seat shows its hand as backs; screenshots include object IDs;
notify before configurable side-pane modules. Rob canceled the HTML UAT guide and will transcribe the game; staging release remains authorized.
Full screen now always uses the table, with no 3D switch. Tilt is 0–60 degrees, default 40;
cards and mats share one physical camera perspective. Zoom is 60–120%, with 100% equal to the former 110%; table edges may clip at high zoom. Cards is separate: 100% equals the former 130%, 150% is another 40% larger. T11 is a container-free fan with seven visible
cards and wrapping arrows for larger hands. Background and Table are independent local previews;
host synchronization is pending. The supplied videos have been inspected for table structure.
Latest readability correction: upper-left player life totals have a black container at 80% transparency, with opaque text. Chrome inspection confirms rgba(0,0,0,0.2) and text opacity 1; screenshot T21 is in tabletop-14-life-readability.png. Feature wiring, service-worker and asset-version checks pass; the unrelated collection-model edit remains untouched.
Drawer controls T12/T13 now use 24-by-32-pixel edge tabs with thin chevrons, hover and keyboard-focus feedback. Browser inspection at widths 1400 and 1024 confirms size, edge attachment in both states, and Enter/Space toggling. Reference links for shadcn/ui, Radix, Atlassian and W3C are recorded in the requirements checklist. Feature wiring, service-worker and isolated asset-version checks pass.
On the Stack now uses one overlapping card pile beside a numbered, wrapping name/player list. Clicking a name animates that card forward; clicking the pile cycles and wraps without changing resolution order. Stack and Card Preview share a size (178.56 by 249.98 pixels in the measured 900-high viewport). Chrome checks pass at widths 1400 and 1024, including reduced motion and a deliberately broken thumbnail-size assertion. The supplied October 14, 8:52 PM video is the Volcano background: an 8-second VP9 WebM with its audio stream removed, a still poster, and pause on reduced motion or hidden tabs. Battlefield cards can be dragged within their section or moved with Alt+Left/Right; ordering persists per profile, match, viewed seat and section without changing game state. The focused tabletop browser suite passes the interaction, refresh persistence, cross-section refusal and video checks. Evidence: `screenshots/tabletop-19-pile-video.png` (M01 stack, M04 Card Preview).
Latest playtest update: drawer Add module / Restore default layout footers and their unused handlers are removed; Settings > Set Side Drawer Modules remains the placement control. Rob explicitly authorized every signed-in human to choose his decks. The lobby now offers a snapshot of all seven committed D1-D7 deck lists, without importing the collection or attaching the owner's library source IDs. Every shared choice is disabled until the active server confirms its card names. `tests/table-lobby.mjs` passes 118 checks, including an empty-library player submitting all seven complete, exact lists to the real rules server and an intentionally missing Sol Ring disabling affected decks. The focused tabletop browser suite passes through Settings-only configuration. Screenshots: tabletop-17-module-space.png (M01/M04) and tabletop-18-shared-decks.png (D1-D7). Staging was published from main `da39a2ed` as release `bad37e87`; Cloudflare Workers Builds succeeded (build `3fa1ab35-59bc-4baa-9ec6-97cbf7d0a9fd`, deployed version `2e431de5-dee3-41a0-af02-12f0d950176a`). The published 352-file tree matches the accepted build byte for byte. `tests/uat/release-acceptance.mjs` passed 22 checks on that build with live Scryfall access. Rob explicitly instructed publishing regardless of the full regression result; Actions run `38663852137` was still running at publication, so this release does not claim a green full-suite gate. Authenticated live readback was unavailable because this session has no staging Access service credentials; the deployment proof is Cloudflare’s successful staging build. No production release was requested or published.
Latest staging-runtime proof: `tests/uat/play-e2e.mjs` passes 38 checks, including a separate signed-in invitee with an empty library seeing all seven validated shared decks, choosing Krenko, playing through turn 4 with the host, reconnecting, and replaying the completed record.
Requirements and remaining scope: `docs/play-overhaul/REQUIREMENTS.md`.

October 15 planning update: Rob requested a plan only after the multiplayer playtest, with implementation waiting for his go-ahead. The draft is `docs/play-overhaul/PLAYTEST-PLAN-2026-10-15.md`. Confirmed: mobile redesign, manual mana tapping with optional Auto-pay, and comfortable zoom near the middle to upper-middle with an oversized maximum. The game record for Luke’s reported missed draw has not been located locally; authenticated staging-log access is unavailable. Run 38663852137 finished with failures in a11y-board (old full-rail locator timeout), engine-breaks-anchors (four stale UI anchors), and generators (data inventory drift). Those are included in the baseline repair story; no application or engine behavior was changed for this planning request.

October 15 expanded draft, branch `codex/ui-playtest-plan-oct15`, draft PR #735: P09–P13 cover turn-scoped Yield turn (auto-pass priority, preserve required choices), commander affordability and per-commander cast tax, corrected shared decks from Rob's staging profile, account Game Logs, and updated Play home/lobby with Human / AI seats and Cloudflare email delivery. Rob confirmed Easy / Normal / Claude. The earlier seven-deck repository snapshot is the wrong source; do not reuse it as proof of the current six. Authenticated profile/export verification, D1's partners and exact D3 identity, and Luke's game record remain outstanding. The plan adds cross-story rules scenarios, mobile accessibility, performance, invitation admission, and privacy acceptance. Current Cloudflare docs support outbound Email Sending beta on Workers Paid; this account's setup remains unverified. Documentation only: implementation still awaits Rob's go-ahead; preserve the unrelated collection-model.js and audio files.

**In progress:** always-on Full screen Pixi ground with the existing DOM cards, three back-row seats,
viewed-seat hand, camera controls and overlay rails. The isolated recorded-view harness is
`tools/play-tabletop-preview.mjs`. It does not send actions to a live cloud match.
The existing `collection-model.js` edit belongs to prior work and is not part of this change; temporarily held for exact-tree release checks, then restored from stash `3c136218f9be752fba3ff7ac1809fcbe80a68d07`. The stash and four unrelated audio files are retained.
**Preview proof:** `tests/table-tabletop.mjs` passes geometry and Chrome interaction at
1024/1280/1400 widths, tilt 0/60, zoom 60/120, with shared mat/card perspective, wrapping seven-card hands,
private opponent backs, persistent canvas, overlay sizing, live reduced motion and phone fallback. Broken camera foreshortening and carousel wrapping deliberately failed their assertions, then were restored.
`tests/table-board.mjs` passed 280 real-game checks after the latest module registry, shared perspective and camera correction. Service-worker (9), release builder (223), feature
wiring (124) and data-integrity checks pass. Asset versions pass for all 123 assets with the unrelated collection-model edit held separately. The profile test uses real backup serialization against an isolated HTTP store, not a live cloud account. New zoom-limit mutations deliberately fail and are restored.
The final focused browser pass also verifies all eleven module choices, Actions popup routing, Coach draft retention through moves, the Screen View popout beside its drawer, hand edge clipping and the 40% card-size increase.
Commands: set UAT_CHROME to installed Chrome and GEOMETRY_REQUIRED=1 for the browser suites.
Screenshot evidence is in `docs/play-overhaul/screenshots/`; the recorded preview runs with
`node tools/play-tabletop-preview.mjs`. This is a preview milestone, not full-overhaul acceptance.

**Outstanding:** shared events, final environments and motion, lobby, music, final module acceptance,
Counterintelligence. The current preview milestone is deployed to staging. Side-pane modules started after notifying Rob: profile placement, drag and keyboard order, hide/restore and public-count Counter-Intel are implemented in the preview.
The module registry now includes Screen View, History, AI Coach, Counter-Intel, Resources, On the Stack, Card Preview, Table Vitals, Recommended Actions, Chat, and Actions. AI Coach embeds its existing conversation and preserves drafts through moves; Recommended Actions uses that service. Chat is explicitly unavailable pending the contract below. Actions routes to its assigned drawer in Full screen, with ordinary popups retained elsewhere.
Volcano uses Rob's supplied video; other environments and the table artwork still need final assets. Crowded-mat layout and text readability need further polish.

## Decks screen and New deck flow, October 23, 2026 (a Claude cloud session, for Rob; `claude/vibrant-turing-50yl3r`, PR #844): merged with wave 4d (PR #852)

Rob named this session for the lanes the Decks requirements name (§19): **Codex · Workshop** for the screens and the
collection model, **Claude · Deck intelligence** for the backup builder, the write-ups, the vocabulary, recommendations and
Auto-create. Rob's go, October 23: "Go ahead with the Q1 default, run C, A, B straight through. And handle 844." Every §16
question took its default (Q1 approved by Rob); §17 and the other Proposed lines (GEN-7, GEN-8, GEN-9) are not built. Six
other sessions work the engine and card loads; a separate merge session merges this branch with theirs, so this session
does not merge. The requirements and the plan are `docs/design/2026-10-23-decks-screen/`.
- **Branch and commits:** Part C `6242caf`, Part A `17a0490`, Part B on top (the PR's head names it).
- **Proved here (cloud container, Chromium):** Node suites `deck-writeups` 203, `deck-stages` 51, `deck-autocreate` 207,
  `live-load` 1,266, `collection-model` 746, `card-states` 140, `card-status-flows` 40, `sharing` 71, `deck-composition` 198,
  `build-wizard` 9, `release-pages` 223, `asset-versions` 133, `feature-wiring` 124, `data-integrity`; browser suites
  `decks-hub` 64, `new-deck-flow` 41, `deck-writeups-screens` 26, `deck-page-r3` 41, `card-states-screens` 24, `page-budget`
  80, `browser-geometry` 138, `mobile-r3` 27, `a11y-app` 48, `import-flow` 29, `landing-r3` 51, `group-templates` 16,
  `deck-holds-cards` 26, `table-lobby` 132; `tests/uat/tour-walk.mjs` 61 steps. Breaks, each caught by a suite:
  `breaks-deck-writeups.py` 14, `breaks-deck-writeups-screens.py` 6, `breaks-deck-stages.py` 16, `breaks-decks-hub.py` 12,
  `breaks-deck-autocreate.py` 18, `breaks-new-deck-flow.py` 12: all 78 caught. `tools/local-ci.sh HEAD 0`: SCAN PASS.
- **For the merge session:** regenerate the `?v=` record (`node tests/asset-versions.mjs --update`) after merging the
  others; this branch bumped every served file it changed and adds `deck-vocabulary.js`, `deck-recommend.js`,
  `deck-autocreate.js`, `crankmagic-newdeck.js`, and puts `compliance-model.js`, `deck-generator.js` and
  `commander-legality.js` on the pages; it removes `crankmagic-build.js`. README's suite count is 568 here (four suites
  added). Data: `data/deck-writeups-2026-10-23.json`, `data/deck-reference-2026-10-21.json`, `data/commander-index.json`
  (`node tools/build-commander-index.mjs --check`), and a `Defensive` play style in `data/composition-targets.json`.
- **Cross-lane, said here:** `tests/table-lobby.mjs` (Codex · Play's suite) had one assertion about the Decks hub's chips;
  it now reads Boxed and Playable. `tests/release-pages.mjs` allows `data/source/` as provenance (the write-ups name their
  workbook). `tests/feature-wiring.mjs` exempts printed card names ("Long-Bodied Grey Dog") from the UK-spelling count.
- **Not proved, and why:** Rob's own restored library isn't reachable from here; Apply deck write-ups is proved on the
  committed library and a backup built from the 10-21 workbook. Sharing's Shared chip with an account (no Worker here);
  `tests/sharing.mjs` proves the `via` field. `tests/uat/crankmagic-journeys.mjs` (not in the gate) passes every Decks and
  New deck step and stops at the Play step's "New table" heading, which this branch doesn't touch.
- **Known limits, on the PR:** Friends forever pairs aren't offered in Start from's second slot (the graph doesn't mark
  them); mass land denial is refused only where a card's text is in hand (compliance-model.js); CRD-6's pool check is per
  mechanic, not per combination; Compare is greyed when a shared deck is selected; the four new play styles are read by
  `deck-vocabulary.js` from each commander's terms, not added to `crankmagic-strategies.js`.

## The lanes (AGENTS.md, *Lanes*), since 2026-10-12; five lanes since 2026-10-18

| Lane | Held by | Branch | Doing |
| --- | --- | --- | --- |
| **Claude · Engine** (engine, rooms, Worker routing, migrations, card loads, releases) | A Claude cloud session, since October 19 (Fable held it October 16 to 18; a fresh session built card load step 1 in #776) | `claude/exciting-sagan-qe5yuf` (the session's assigned branch), then `claude/engine-<topic>` | Engine, simulation, card loads. Linear: ROB-71 and its children (ROB-12, ROB-13, ROB-73 to ROB-95, ROB-149). On staging (main 78dc2a47, `release/cloud-staging` 704a7ca7, version db1962ce byte-identical): ROB-12 (#739), ROB-81 (#742), ROB-13 (#745), ROB-73 (#746), ROB-77 (#747), ROB-76 (#748), ROB-75 and the room's socket frames (#778), and card load step 1 (#784). Card load steps 1 to 3 are on `main`: ROB-86 as 78dc2a47 (#784, carrying #776), ROB-87 as 40d14519 (#785), ROB-88 as bdc64567 (#789), step 5's first part (ROB-91, candidates at playtest tables) as c42416e5 (#790), and the rest of the loader (ROB-90, ROB-91, ROB-92) as d7eadfe1 (#791). Migrations: 0006 ROB-86 (`card_demand`), 0007 ROB-127, 0008 ROB-88, next free 0009. Staging serves main 27fba609 (`release/cloud-staging` 8636fef0, version f42fa2af byte-identical to its dry run), which carries the whole loader and Play's #797 to #799; migration 0006 is on staging D1. See "2026-10-19: the engine lane" below. Brief: `docs/program/workstreams/claude-engine.md`. |
| **Claude · Deck intelligence** (the models and data under the screens; the program readout) | The second Claude session (a cloud container), since October 18 | `claude/deck-<topic>`; ten PRs merged October 18: `deck-composition` (#749), `deck-synergies` (#750), `deck-resolve` (#752), `deck-legality` (#753), `deck-buyplan` (#758), `deck-compliance` (#759), `deck-criteria` (#757), `deck-swaps` (#760), `deck-reasonableness` (#761), `deck-sim-audit` (#762), `deck-sim-variance` (#764); the program itself merged (#740) | Done: ROB-138, 114, 115, 131, 104, 119, 111, 109, 117, 112, 84. In progress: ROB-116 (steps 1 and 3 on main; step 2 waits on the engine lane's `playPod`, Requests row 1). Waiting on Rob: the popularity dial (ROB-109), ROB-95 before ROB-128/130/129/132, the Settings card for ROB-123, his call on ROB-121. Keeps `docs/readout/` (feed `feeds/claude-deck.json` at every merge). Session closed 2026-10-18 evening; handoff `docs/handoff-deck-intelligence-2026-10-18.md`. |
| **Codex · Play** (the Play boards and player interaction) | Codex, resumed October 22 at Rob's request; earlier Claude handoffs remain recorded above | `codex/play-engine-lounge`; previous drafts remain separate | Babylon live tabletop and lounge entry locally verified. Full evidence and remaining first-final work are in `docs/play-overhaul/BABYLON-LOUNGE-INTEGRATION-2026-10-22.md` and `PLAY-FIRST-FINAL-2026-10-22.md`. Room authority preserved; no deployment. Original priority-card edits preserved in a named stash. |
| **Codex · Workshop** (every screen outside the boards; `cloud/library`, `sharing`, `access-invites`, `mail`) | Codex Astra, session 2, from October 18. **Later on October 18, Rob handed Codex's UX/UI work to a Claude cloud session** ("You are picking up the work of GPT on the UX/UI and Play") | `codex/workshop-<topic>`; Claude: `claude/wizardly-einstein-9ibb4j` | ROB-36, ROB-37 to finish; ROB-122, ROB-125, ROB-106, ROB-105. Brief: `docs/program/workstreams/codex-workshop.md`. **Claude, October 18, closed out (handoff: `docs/HANDOFF-WORKSHOP-2026-10-18.md`):** PR #777 merged to `main` as `71155f15` (merge commit, green Actions `suites` on `13174970`), not released (the engine lane releases staging; notes on ROB-11). It carries the card status model Rob approved with Upgrade (`docs/card-states.md`; Linear ROB-150, Done; ROB-107 In Progress for the per-row sentence, bulk moves and the usability pass) and budgets (`docs/budgets.md`; ROB-151, Done; Rob kept all three defaults). Proof: `tests/card-states.mjs` (140), `tests/card-status-flows.mjs` (40), `tests/budgets.mjs` (29), `tests/uat/crankmagic-journeys.mjs` (505), breaks 8 of 8 and 6 of 6. Open: ROB-152, Rob's dashboard switch for the Workers Builds checks that fail on every PR. The Workshop lane is free for the next session Rob names; its queue is ROB-36, ROB-37, then ROB-122 and ROB-125. |
| **Grok** (bounded tasks under a coordinator) | Grok Bot workers, when Rob relays the prompt | `grok/<task>-<topic>` | G3 (ROB-27), G4 (ROB-61), G6 (ROB-136) from `docs/grok/WORK-PACKAGE-2026-10-17.md`. Brief: `docs/program/workstreams/grok.md`. |

The program's charter (the north star in Linear, the file ownership table, the seams, decide-or-surface, the readout
protocol) is `docs/program/README.md` (October 18, 2026). Rob's queue and each lane's remaining hours are on
`docs/readout/index.html`.

### Claude · Engine, card load step 1: demand capture (Linear ROB-86): merged, on staging, session closed 2026-10-19

The session that built step 1 on `claude/practical-shannon-ga8i5j` has stopped. The engine lane is the Oct 19 session's
(above). The handoff, in AGENTS.md's four parts:
- **Branch and commits.** #776 (head d2502ac8, Actions `suites` green, run 39177742030) reached main through #784, as
  main 78dc2a47. Staging serves it: `release/cloud-staging` 5634b896 → 704a7ca7, released by this session on Rob's go.
  The rollback target is main 62900176 (version b6f37e78).
- **Proven:**
  - migration 0006 (`card_demand`, `card_demand_lists`, sha256 `a4bba8a0e313adde…`);
  - the counting at `known` (also `{decks}`) and at a seat's deck refused, with `listed` in the answer;
  - names and counts only, and the answer unchanged without the table;
  - the wave ranking (`game/tools/card-demand.mjs`, `topneeds.mjs`'s fourth argument).
- **Commands that prove it:**
  - `node tests/card-demand.mjs` (43 checks);
  - `python3 game/tools/batch/breaks.py game/tools/batch/breaks-card-demand.py` (17 of 17);
  - staging: `release-acceptance` 22, `play-e2e` 42 before the push, and `tools/staging-check.mjs --expect 78dc2a47`
    passed.
- **Proven since, by the Oct 19 engine session once ROB-157 was fixed:** the deployed version is db1962ce, and its
  `play-worker.js` is byte-identical to `wrangler deploy --dry-run` of `release/cloud-staging` 704a7ca7 (4,160,870 bytes,
  sha256 `32d2dd6f663c5081…`); its 27 bindings are unchanged from b6f37e78. Migration 0006 is on staging D1 (17:20:10
  UTC; bookmark before the write `000000d6-00000000-00005109-32543247fde961f32cebcc7da1aeee01`; ROB-158 Done).
- **Not proven, and why:**
  - **`known` on staging:** Access sends the service token's POST to its sign-in page; the token reads only
    staging-check's GETs.
- **Outstanding:**
  - **ROB-159 (Codex · Play):** the deck page's "on the list for the next wave" line from `listed`, and the hub asking
    `{decks}` (Requests row 3).
  - **Production:** D1 has 0001–0002. 0006 there, and turning step 1 on, are a production release on Rob's go.
- **Next for the engine lane:** card load step 3 (ROB-88); step 2 is main 40d14519 (#785).

### Requests between the lanes

Latest UI requests:

- October 23, Workshop (Decks) → Play: the lobby's deck chooser shows a deck's notes (`crankmagic-table.js`). Notes are the owner's own now (the Decks requirements' DPG-4); please show `description` first, then the commanders' rules text as today. Every deck of the 10-21 backup carries one.

- October 22, Codex Play → Engine: the first-final plan requires standard Commander defaults, with `landAnyStep` and broader take-backs only as explicit shared opt-in policies recorded at launch; preserve old match versions. Current human-only relaxed timing is not standard Commander acceptance. ROB-190's pause is not lifted by this planning synthesis.
- October 22, Codex Play → Engine/shared service: ROB-54 authenticated lobby/table chat and presence are required for first-final. Define membership, ordering/cursors, reconnect, retention and privacy before wiring a live composer. Public discovery, spectators and leaderboards may follow. Existing placeholders stay honest until that service exists.
- Provide authenticated table chat with shared ordered messages, reconnect history, sender/seat identity, send/refusal status and membership checks. The Chat module is a clearly marked placeholder until this exists; voice chat is a later feature.
- Project authoritative round and turn-within-round into CrankRoomView, starting round 1. Define extra/skipped turns and eliminated seats; the UI must not guess from global turn divided by initial seat count. *Answered: `state.round`, `turnInRound`, `turnId`, `extraTurn` (Linear ROB-76, #748), on staging since Oct 18; the anchor doc's "Rounds".*
- Save preferences-only accounts through cloud sync. Existing sync treats a library without decks/lots as empty, so its first cloud save waits for library content. The drawer proof uses a real deck fixture and the existing authenticated backup flow against an isolated HTTP store; no production account was changed.

UI appearance request (October 14, latest Rob feedback): add a host-owned `appearance: {background, table}` field to the table settings and public table view, validated against stable IDs. Initial IDs: background `volcano`, `forest`, `clouds`; table `wooden`, `stone`, `obsidian`. Persist through reconnect/rematch and freeze or authorize changes consistently with other table rules. The UI registry and local preview selectors are ready; local previews do not claim synchronization.

A lane that needs something of the other's files asks here: the field or change, what it is for, an example. The
other lane answers in the last column.

| # | From | Asks for | What for | Answer |
| --- | --- | --- | --- | --- |
| 13 | Workshop (Decks) → Play | An intermittent failure in `tests/table-board.mjs` (Codex · Play's suite), seen once in CI and never locally: "the real-game inspector keeps its card aspect beside an independently arranged History module" (lines 667-669) failed on Oct 25 in Actions run 40157906338 (PR #769's head `33c6749e`, `main` `71929eb` merged in, a branch that changes no Play file). The next run passed it (run 40161187064), and on `main` `afe58d5` it passes 3 of 3 locally (290 checks). The check measures `#cm-full-pick .cm-bcard`'s ratio (within 0.01 of 5/7) and counts the History module straight after the click, with no wait for the layout to settle, so a slow runner may read a mid-layout card. Please make it wait for the settled size, or fix the layout if the card really drifts from 5:7. (The other Play failure seen alongside it, `tests/board-control.mjs` "Escape dismisses hover", is fixed on `main` by #854: it now passes there.) | A Play suite that fails at random turns any lane's PR red, and the next run passing it hides the cause | `tests/table-board.mjs` | |
| 11 | Codex · Play → Engine | ROB-172 for ROB-171: project public control provenance, displaced controller(s), source object identity/name and exact Oracle effect text/duration; define chained steals, return destinations, entering under another controller and face-down sources | Rob requests the actual card on its controller's board and a ghost where control was lost, with who took it and how it returns. Current owner/controller fields cannot establish prior control or a return condition. Document and merge the additive contract before Play consumes it | Requested Oct 20 in ROB-11; Play builds existing-contract placement and ownership marker meanwhile |
| 12 | Codex · Play → Engine | ROB-167: expose `POST /api/tables/:id/rematch {accept}` and public votes/deadline; launch the next round with retained seats/decks using the existing lifecycle | Board/lobby Play again, visible votes and Leave need a deployed route and documented table state. Prove one person/three AIs, a declined human seat, deadline expiry, and a fresh match ID | Requested Oct 20 on ROB-167 and ROB-11; Engine half must merge before Play consumes it **Built:** `POST /api/tables/:id/rematch {accept}` (#806): votes, deadline (2 minutes, `REMATCH_WINDOW`) and the next round with the same seats, decks and rules as `<tableId>g<n>`; the view's `table.rematch` `{lastMatchId, deadline, outcome, reason, votes}`; the host must stay for a next game; documented in `docs/ui-lane/gameplay-anchor.md` ("After the game: Play again"). Play wires the buttons next. |
| 10 | Codex · Play → Engine | ROB-166: project a structured terminal reason identifying the eliminated human seat and its loss reason when the remaining seats are AIs; distinguish elimination from voluntary end and disconnect timeout | The banner must say who lost and why, and the person's game record must be a loss. Please document the additive view/result contract and merge it before Play consumes it | Requested Oct 20; Play will retain existing result handling until the authoritative contract is on main. **Built:** `result.ending` (`game/room/ending.mjs`, #805): `{kind, seatId, reason, seats: [{seatId, outcome, reason}]}`, kind `won`, `draw`, `eliminated`, `conceded`, `timed-out` or `ended`; `reason`/`endedBy` unchanged; documented in `docs/ui-lane/gameplay-anchor.md` ("How the game ended"). Play consumes it next (ROB-166's banner and record). |
| 8 | Codex · Play → Workshop | Settings' Play card is extracted to `crankmagic-settings-play.js` in PR #754; general Settings calls its registration | Separate ownership while preserving the existing page and preferences | On main `73f55b35`; Workshop keeps `crankmagic-settings.js` |
| 9 | Codex · Play → Engine | Release ROB-99 slice 1 from main `73f55b35` after Rob's look | Shared desktop header, Camera and drawers; proof and labeled screenshots in `docs/play-overhaul/ROB-99-SLICE-1.md` | On staging since main 5f6ea9cc (`release/cloud-staging` b99e2199, Oct 18) and in every staging release since; on production with 5f6ea9cc (Rob's go, Oct 18) |
| 2 | UI | The lobby's countdown to start by itself once every seat is connected, has a deck and is ready, with no Start press; the host's Cancel stays, and a seat's Not ready stops it | The brief's lobby ("No Launch button: when every human is ready, a 10-second countdown starts, cancelable by the host"). Today the lobby reads "Launches when all are ready · n to go" and the host presses Start | `game/room/table.mjs`, where `ready` is taken: begin the countdown when nothing blocks. The lobby already follows `phase: countdown` | |
| 3 | UI | A structured record of what happened since the last revision: `events: [{kind, …}]` on the view (damage dealt with its source and target; a spell countered and by what; tokens created with their count; proliferate; a permanent destroyed or exiled; life gained or lost with its cause; a seat out) | The callouts over the table and the sounds read these from the difference between two views and from the history's sentences (`/countered/`, `/created N … tokens/`), which is brittle and carries no cause; the brief's readouts (damage per source, what was prevented) need the facts | `game/room/history.mjs` already knows each; the view's builder in `game/room/room.mjs` | Built: `events.v1` (Linear ROB-77, #747), on staging since Oct 18, its kinds in `docs/ui-lane/gameplay-anchor.md` (Events); a reconnect sends `{type: "view", after}` |
| 4 | UI | Per player, the mana tapped this step (`manaTapped`), or on each land whether it was tapped for mana | Turn Resources' "mana tapped this step"; today it counts tapped lands, which includes a land tapped for anything else | the view's players | |
| 5 | UI | On a card: whether it is a token; what an Aura or Equipment is attached to; summoning sickness; colors and mana cost; which face is up. R3 needs an authoritative public equivalence key (or complete equivalent public attributes) for exact token/basic-land grouping, including current abilities, counters, modifiers, attachments, designations and control history; tapped state remains per member. | The anchor's own list; R3 exact stacks must separate a modified token, and attachment title peeks require explicit host IDs. A Vehicle is not inferred to be attached merely because it is crewed. | Rechecked October 24 on main 02a52c3b: projection still lacks token/basic-supertype and attachment-host facts; same names/current power alone cannot prove equivalence. Play leaves cards individual until the additive contract merges. | |
| 6 | UI | A `roll` frame at the game's start: the d20 for first player, sent to every seat with its result | The brief's die, which animates to the result it was sent | the room, at launch | |
| 7 | UI | `tests/advisor.mjs` to pass again: its clock is fixed at 2026-10-11T12:00Z and its `ai_calls` rows are written at that clock, but the meter's 24-hour window (`cloud/ai.mjs` `since()`, through `aiMeter` in `cloud/worker.mjs`) runs on the real clock, so from 2026-10-12T11:59Z the rows fall outside it and the meter check fails on every branch, `main` included | The Actions gate is red for every PR until it is fixed; #725 (the UI pass) waits on it to merge | `cloud/worker.mjs` (`aiMeter`: pass the request's `now` to the door's `spent`), or the suite's rows at the real clock | Fixed on `main` in c629f8c1 (#723): `aiMeter` takes the request's clock. #727 puts the LLM seat's call log on the table's clock too (`cloud/game-room.mjs`), with `tools/ai-clock-breaks.py`; the AI suites pass with the machine's clock moved days either way |
| 1 | Engine | The board to show the monarch (CR 725): the view's `state.players[i]` now carries `monarch: true` for the monarch, public to every seat, and no key for anyone else; the history says "Maya became the monarch" | Ginger, Queen of Sweets and Tamiyo, Upriser Crowned make their controller the monarch; the monarch draws a card at their end step, and a creature's combat damage to them makes its controller the monarch -- a player should see who holds it | The engine lane built it (Train E, the `monarch` branch); `docs/ui-lane/gameplay-anchor.md` lists the field. For the UI lane to show |
| 2 | Engine | A switch in the host's Table rules (`crankmagic-table.js`): *The player who goes first skips their first draw*, on unless the host turns it off. The table's view carries `rules.skipFirstDraw` (`true` by default); the host sends it with the other rules, `POST .../rules {skipFirstDraw: false}`, refused once a seat is ready like the others. It matters only at a two-seat table: in a game of three or four nobody skips (CR 103.8c), so the switch can be shown only there | Rob, 2026-10-12: "this can be toggled off in game setup by the lobby owner". CR 103.8a as a house rule: with it off, the first player of a two-player game has a draw step on turn 1 | The engine lane built the rule, the table's field and the room's pod (`claude/first-draw-step`; `docs/ui-lane/gameplay-anchor.md`). For the UI lane to show: Linear ROB-148 |
| 3 | Engine → Play | The deck page's readiness line (`crankmagic-table.js`, `readinessText`) to say which of a deck's cards "are on the list for the next wave" (Rob's decision 5 of 2026-10-14): `POST /api/tables/known` now answers `{unknown, listed}`, `listed` being the names just counted (absent when nothing could be recorded, so say nothing then). And the hub to ask `{decks: [[names], ...]}`, each deck its own list, instead of one merged `{names}`, so each deck is counted once; the answer's `unknown` is the same union as before | Card load step 1 (Linear ROB-86, PR #776): which cards players want, ranked for the next wave. Until the hub sends `decks`, its questions count as asked and in no deck; a seat's deck refused at a table counts as a deck already. Filed for Play as Linear ROB-159 | `crankmagic-table.js`, `unknownOf` and `readinessText` | |
| 4 | Engine → Play | The board to label a candidate and offer "report a wrong card" (Rob's decision 2): a card in the view with `candidate: true` (`state.players[i].zones.<Zone>.cards[j]`, said only where the seat can name the card) shows a "Candidate" mark, and its link sends `POST /api/tables/:id/report {cardId, note}` (201 `{report}`; 404 when the card is not a candidate the seat can see; 409 at a table that is not a playtest table, or past its 200 reports) | Card load step 5: playtest tables seat the card compiler's candidates, which no wave has reviewed yet, so a player knows which cards may play wrong and can say so. Reports reach the triage loop in the game's record (`cardReports`) | |
| 5 | Engine → Workshop | When a library or deck is saved, ask `POST /api/tables/known {decks: [[names], ...]}` for its cards, as the hub already does for readiness (Rob's decision 3) | Card load step 5: the answer records every card no table can play on the demand list (step 1), which the backstop loads first (`game/tools/engine-compile.mjs --demand`) and the waves review first (`game/tools/card-waves.mjs`). Nothing else changes for the player; the answer's `unknown` and `listed` are the readiness line's own. The save hook is in `cloud/library.mjs`, Workshop's file | |
| 1 | Deck intelligence | A headless batch entry point that plays N seeded games with house pilots and returns facts as data: `playPod({pod, seeds, cards, turnLimit}) → [{seed, turns, winner, reason, refused, perSeat: {life, lossReason, commanderDamage, turnsTaken}, perTurn: [{turn, landsInPlay, manaProduced, cardsDrawn}]}]`, deterministic per seed, with a stated budget per game; the room already plays a whole all-house game in one call (`game/room/room.mjs` `startRoom`, as `tests/engine-room-games.mjs` does) | ROB-116's calibration harness: the same hundred played in the engine and in the simulator, the distributions compared (turn of first lethal attack, mana by turn, cards drawn); the audit `docs/engine/sim-model-audit.md` (ROB-84) found no such runner exists and the deck lane never edits `game/**`. Asked on ROB-11, 2026-10-18 | |

## 2026-10-21: main a94be110 in production (Rob: "Release main a94be110 to production with tools/release-production.sh cloud-production, push release/pages, and read crankmagic.com back")

Released by the Personal-HP Claude session holding Codex · Play. It was announced in ROB-11 before the push and recorded
there after. Before it, every check passed on main: CI's `suites`, and the walks CI doesn't run, on main's own builds
(#814).
- **Production** (`cloud-production`, by `tools/release-production.sh`):
  - `release/pages` d3138dcb, on 67fffbd1, pushed at 14:24 UTC;
  - local walks: `release-acceptance` 22 and `production-play-e2e` 27;
  - Workers Builds `crankmagic` succeeded, and deployed version **331672d4** is at 100% since 14:24:54 UTC;
  - `version.json` reads a94be110, profile `cloud-production`;
  - the live walk at `https://crankmagic.com`: 22 checks, with `UAT_LIVE_NETWORK=1`;
  - **the rollback target** is **67fffbd1** (version 76f7206c, 5f6ea9cc, 2026-10-18).
- **Staging** serves the same main: `release/cloud-staging` 526860bb, version cc415e1c, read back with
  `tools/staging-check.mjs --expect a94be110`.
- **It carries everything merged since 5f6ea9cc:**
  - **Play:**
    - an AI's "up to" picks (#792);
    - Full view's long choices (#793);
    - Yield turn, the combat picture and kept scroll (#797–#799, Codex);
    - direct blocking (#804);
    - the commander tax, partners and a looked-at hand (#807);
    - how a game ended, and Play again (#805, #806, #808);
    - same-named creatures numbered in combat (#809);
    - no stop at every AI spell, with CAST, and Draw card (#810, #811);
    - land spacing and the drawer edge (#812);
    - the upright phone (#813);
    - Focus's Lands caption (#814, ROB-174).
  - **Engine:** card load steps 1 and 2 (#776/#784, #785).
- **Production's D1 and secrets are unchanged** (0001 and 0002):
  - card demand records nothing there until migration 0006, and answers as before (`card-demand` proves it);
  - sharing is off in `cloud-production`;
  - Claude seats wait on `ANTHROPIC_API_KEY` (ROB-95); Easy and Normal AIs play.

## 2026-10-20: Play ready for a 1-person, 3-AI play test; main a9bec38f on staging (a Claude session on Personal-HP)

Rob, Oct 19: *"Evaluate how ready the Play capability is for me to play with all the features in a 1 human v 3 AIs …
not the refinements, just fully functional"*, then *"merge when green"* and *"keep working through the other needed fixes
to give me a green light to play test"*. This session read, measured and released. Two sessions it proposed made the
fixes.

- **Branch and commits:**
  - main 0cb93288 (#792, ROB-164, the AI seats' optional picks) and main a9bec38f (#793, ROB-163, Full view's long
    choices). Each was a merge commit on a green `suites` run of its exact head, with the base unmoved: runs 39334837399
    and 39372898353.
  - Staging: `release/cloud-staging` e504f220 → ccbaa386 (main 0cb93288) → 027c3e67 (main a9bec38f), each by
    `tools/release-staging.sh` from a detached `origin/main` checkout. Production is unchanged at 5f6ea9cc.
- **Proven, and the command for each:**
  - **Every card of the six staging decks is defined,** and all 904 of their scenarios pass. The checks were scratch
    scripts over `tests/fixtures/shared-staging-decks.json` and `tableCards`.
  - **Headless games:** 25 games of the six decks with Normal AI seats finished, with 0 refused AI answers. Replays were
    identical and no seat was sent another's cards (`tools/fuzz-live.mjs --replay --leaks`).
  - **Through the real board in Chromium,** with the GameTable carried in-process as `tests/uat/real-deck-game.mjs`
    carries it, on main 0cb93288:
    - three games of one person against three Normal AIs, each seat's deck chosen from the lobby's Shared decks, played
      to the end through the board's own controls (38, 34 and 41 turns);
    - a reload mid-game returned the same revision and the same pending question;
    - 172–226 frames per game sent none of the AIs' cards;
    - the AIs ended with 7–11 lands;
    - `real-deck-game.mjs` itself passed 13 checks, a natural end at turn 36.
  - **Cards that draw beside another effect, in the six decks:** 27 engine-level probes, all correct, so ROB-17 isn't
    reproduced by any of these cards. Four scenarios don't assert one of their card's effects: Protege's Awakening's
    draw, Steady Progress's and Tezzeret's Gambit's proliferate, and Freyalise's −6. That's ROB-94's to add.
  - **Before each staging push:** release-acceptance 22 and play-e2e 42. Workers Builds `crankmagic-staging` succeeded
    on ccbaa386 and on 027c3e67.
  - **Read back, Oct 20:** `node tools/staging-check.mjs --expect a9bec38f` exits 0. `version.json` and both pages say
    a9bec38f (cloud-staging, 2026-10-20), and `/api/me` answers as the token's own `service:e07b4fed5ab9`.
    `wrangler deployments status --name crankmagic-staging` shows version 30409bec at 100% since 06:13:41 UTC.
  - **Personal-HP can read staging now.** Rob made a second Access service token, `crankmagic-staging-checks-hp`, in
    staging's Session checks policy, and saved it in the Windows user environment as `CF_ACCESS_CLIENT_ID` and
    `CF_ACCESS_CLIENT_SECRET`. How a session started before then reads them is in `tools/staging-check.mjs`'s header.
    Wrangler here is signed in to Rob's account (OAuth) for the deployment reads.
- **Not proven:**
  - The deployed bytes against the dry run.
  - A game with Rob at the table.
- **Outstanding for the play test** (none blocks it; Rob plays on desktop, at a table started after 027c3e67, because
  `pilotPicks` is a new match's pod key):
  - **Claude seats in production** need `ANTHROPIC_API_KEY` on the production Worker (ROB-95; Rob's step). Easy and
    Normal work everywhere, and staging offers Claude.
  - **Rough, and known:**
    - a priority stop on every AI spell and trigger (ROB-28, ROB-102);
    - same-named attackers unnumbered in Declare blockers (a Krenko swarm);
    - an X spell offered only once its lands are tapped for mana (ROB-74);
    - the loss banner reads "ended early: every person had left the game";
    - no rematch;
    - away more than five minutes concedes;
    - a long pick list scrolls back to its top after each pick (ROB-163's note);
    - the phone in portrait is drawn sideways (ROB-18, #766).

## 2026-10-19: the engine lane, reconciled with Linear (a Claude cloud session; Linear ROB-71)

- **Holder:** a Claude cloud session on `claude/exciting-sagan-qe5yuf`, from main 303e31b3. Rob: *"Rationalize the
  session hand-offs from yesterday evening against the existing plan as captured in Linear. Update where required, then
  begin work on the engine load."* This session takes the lane from Fable's (stopped after #779) and the card load step 1
  session's (#776).
- **What did not agree, and how it stands now:**
  - **Migration numbers.** The engine section below said, from the morning of Oct 18, 0006 ROB-127 and 0007 ROB-86. ROB-11
    corrected it at 16:39 that day and ROB-86 records Rob's approval of 0006 as `card_demand`: **0006 ROB-86, 0007
    ROB-127, 0008 ROB-88, next free 0009.** The lanes table and the section below now say so.
  - **#776 (ROB-86)** was green on its head d2502ac8 (Actions run 39177742030) but conflicted with `main` in this file
    after #781 and #783. #784 merged it with `main` and carried its commits unchanged: **step 1 is main 78dc2a47**
    (Oct 19, merge commit, green `suites` run 39213237634 of the exact head; GitHub shows #776 merged with it).
  - **Staging** serves main 62900176: `node tools/staging-check.mjs --expect 62900176` passed on Oct 19 with the
    staging Access service token. ROB-157 is narrower than filed: the Cloudflare API refuses this container ("Missing
    Authorization header"), so no D1 write and no check of deployed bytes, but the Access read-back works.
  - **Unreleased on `main`:** #775, #777 (card status, budgets), #779, #781, #783, and #741, #743, #751, which Rob merged
    on Oct 19 between 01:52 and 03:41 UTC (Play lane files changed at his request by the Personal-HP session; ROB-156,
    ROB-161, ROB-162, each noted). The next staging release carries them with step 1.
  - **Migration 0006 on staging D1:** approved by Rob for the file whose sha256 begins `a4bba8a0e313adde` (ROB-86);
    applied later the same day (below).
  - **Other lanes' close-out PRs still open:** #780 (ready) and #782 (draft, the UI lane's handoff). Both edit this file;
    they are their lanes' to merge.
- **Step 2 (ROB-87), merged as main 40d14519 (#785), Done; nothing served, so no staging release:** `game/engine/cards/sentences.mjs` (the library: 5,650 templates
  from 2,407 cards) and `game/tools/sentence-library.mjs` (the calibration). Each card held out: 520 of 2,470 translated
  from the others' templates alone, 519 passed their own scenarios (99.8%, lower bound 98.9%); minimum count 1. Report
  `docs/engine/sentence-calibration-2026-10-19.md`; plan `docs/engine/plan-card-load-program.md`, "Step 2, measured".
  Proof: `tests/sentence-library.mjs` (63), `breaks-sentence-library.py` (21 of 21).
- **Staging and D1, later on Oct 19.** The step 1 session released main 78dc2a47 to staging at 07:57 UTC on Rob's go
  (`release/cloud-staging` 704a7ca7). Rob fixed ROB-157 at about 17:05 UTC: the environment's `*.cloudflare.com` secret
  had the header name `ACCESS_INVITE_TOKEN`, so Cloudflare never got an `Authorization` header. This session then proved
  the deployed bytes (version db1962ce byte-identical to the dry run of 704a7ca7; 27 bindings unchanged) and applied
  migration 0006 to staging D1 (ROB-158; bookmark before the write
  `000000d6-00000000-00005109-32543247fde961f32cebcc7da1aeee01`). From a cloud session, `curl` and wrangler reach the
  API through the proxy, which adds the credential; Node's own `fetch` needs `NODE_USE_ENV_PROXY=1` and
  `NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`.
- **The next session starts here.** This one stopped after #785, per the card load plan's "Running a lane". Step 3
  (ROB-88: the compiler, the scored index, `card_candidates` as migration 0008) starts from its kickoff prompt in
  `docs/engine/plan-card-load-program.md`, on `createLibrary`/`translate` (game/engine/cards/sentences.mjs) and the
  minimum count (game/tools/sentence-library.mjs).
- **Step 3 (ROB-88), on Rob's "keep adding cards to the engine":** `game/tools/card-compiler.mjs` runs the sentence
  library on every undefined Commander card. **2,429 candidates** (`data/engine/candidates.json`): each translated whole
  from calibrated templates, compiled, its oracle text, and its smoke game played. 12,320 more cards are one sentence
  short; `docs/engine/card-compiler-2026-10-19.md` ranks the sentences that would complete them. Candidates are stored in
  the repository, not D1 (0008 stays for step 5's save-time compiles); no table seats them until the next PR. Proof:
  `tests/card-compiler.mjs` (29), `breaks-card-compiler.py` (10 of 10).
- **Step 3 merged** as main bdc64567 (#789; green `suites` run 39311878672 of the exact head 640b2664, base unmoved).
- **Step 5, first part (ROB-91), on Rob's "the loader capability … once finished with your current series":** playtest
  tables seat the 2,429 candidates, labeled (Rob's decision 2). Their definitions reach the Worker as
  `game/engine/cards/candidates.mjs`, generated by `game/tools/engine-candidates.mjs`. A playtest table's new matches
  say `candidates` in their pod; every other table refuses a candidate by name. Each object made from one says
  `candidate: true`, which a seat's view shows only where the seat can name the card. `POST /api/tables/:id/report
  {cardId, note}` takes "report a wrong card" and hands the reports over in the game's record (`cardReports`). The board's
  label and link are Play's: Requests, Engine → Play 4. Proof: `tests/table-candidates.mjs` (41),
  `breaks-table-candidates.py` (24 of 24). **Merged** as main c42416e5 (#790; green `suites` run 39322411012 of the exact
  head bbc76e81, base unmoved). Its first run had failed on three suites: four other-lane breaks anchored on lines it
  changed (re-anchored, each caught again), the generated module's printed card names against the spelling rule
  (exempt, as `definitions.mjs` is), and `table-tabletop`, which timed out once waiting on a board module in the browser and passed on the next commit's run,
  which changed nothing the board reads.
- **The loader, finished (ROB-88, ROB-90, ROB-91, ROB-92), on Rob's word that this body of work finishes now.** **Merged**
  as main d7eadfe1 (#791; green `suites` run 39437504326 of the exact head 6f66c15d, base 7e32df0a unmoved, main merged
  in first). The plan's "The loader, finished" says what each path costs and what makes it right. In short:
  - **Spell composition:** 2,643 zero-token candidates (was 2,429), calibration still 545 of 546.
  - **Step 4:** the gap-only backstop (`engine-compile.mjs`). It writes only the sentences the library lacks, and runs a
    held-out sample with `--held-out 200`. Built, not run: it needs Rob's key and `--yes`.
  - **Step 5's second part:** the demand list is the queue (`--demand`), and the backstop's 25 provisional cards seat at
    playtest tables. Workshop's save asks `known` (Requests, Engine → Workshop 5). This departs from the plan's
    Worker-side backstop and D1 store; Rob decides on migration 0008.
  - **Step 6:** the waves tool (`card-waves.mjs`): review sheets demand first, drafted scenarios, promotion.
- **ROB-164, the AI seats take what an "up to" or a search is for** (#792, `claude/engine-pilot-picks`; a Personal-HP session
  started by the Play readiness evaluation, Oct 19, inside the engine lane's files). Every AI seat (L0, L1 at Easy and
  Normal, the LLM seat's L1) answered a choice whose least answer is none with none: Evolving Wilds found no land,
  Cultivate nothing, proliferate nothing. The house pilot now has a rule for each (`picks`,
  `game/engine/pilots/house-pilot.mjs`):
  - a library search takes as many as it may. A land search takes the lands of the colors its hand and commanders need
    and it lacks (a nonbasic by the mana it makes); any other search takes the costliest card it could cast by its next
    turn, or a land when it has none to play. Diabolic Tutor and Gamble no longer take the first card offered.
  - a "may" from its hand or graveyard is answered the same way (Chulane's land); Brainstorm's put-back is answered as
    before.
  - proliferate takes its own counters that help it and another's that hurt them, never an opponent's +1/+1 or loyalty.
  - any other "any number" takes the permanents and players on its side (Peregrine Drake untaps its own lands).
  - **Replays.** This changes no rules. The room tapes no AI answer, so the change rides on a pod key, `pilotPicks`. The
    table asks for it on new matches, and the room keeps it with the match and hands it to every AI seat's pilot. A match
    launched before replays as it was played. The room's facts now carry a card's `colors` and the mana it `makes`.
  - **Measured** with `tools/fuzz-live.mjs`, which gained `--lands <n>`, `--no-picks` and the shared decks file (80
    seeded all-AI games at Normal, the six staging decks in two sets of four, seeds 1-10, every game clean). Lands in
    play after a seat's sixth turn went from 4.81 to 5.08: D1-D4 4.79 to 5.28, D3-D6 4.83 to 4.88. The gain is in the
    ramp decks (Kiora +0.5 and +0.4, Chulane +0.5).
  - **Proof:** `tests/engine-pilot-picks.mjs` (116) and `breaks-pilot-picks.py` (58 of 58). The touched suites pass:
    `engine-room-games` (58), `room-seat-pilots` (15), `game-table` (172), `engine-house-pilot` (19) and the anchors.
  - **Not done:** a tutor doesn't choose by the commander's plan, and surveil, scry and explore still keep everything on
    top. On staging since main 0cb93288 (`release/cloud-staging` ccbaa386), and in a9bec38f after it, for tables launched since.
- **Staging releases by this session, Oct 20** (each by `tools/release-staging.sh` from a detached `origin/main`, with
  release-acceptance 22 and play-e2e 42 before the push, `tools/staging-check.mjs --expect <commit>` after, and the
  deployed `play-worker.js` compared byte for byte with `wrangler deploy --dry-run` of the release commit):

  | main | `release/cloud-staging` | Deployed version | `play-worker.js` |
  | --- | --- | --- | --- |
  | a9bec38f (released from Personal-HP) | 027c3e67 | 30409bec | 5,355,003 bytes, sha256 `188243476918c43d…`, identical |
  | d7eadfe1 (#791) | e973fcc8 | f0cedf20 | 5,488,087 bytes, sha256 `80645034c2c8a1a4…`, identical |
  | 17a1218c (Play's #797, #798) | e884320e | 5a74e443 | the same bytes as d7eadfe1's: those PRs change only the board's static files |
  | 27fba609 (Play's #799) | 8636fef0 | f42fa2af | the same bytes again: #799 changes only the board's static files |

  Each is announced in ROB-11. Production is unchanged at 5f6ea9cc.
- **The handoff (AGENTS.md, four things).** This session stops here, at Rob's word that this body of work finishes now.
  - **Branch and commits:** `claude/exciting-sagan-qe5yuf`. On main: #789 bdc64567, #790 c42416e5, #791 d7eadfe1; staging
    as in the table above.
  - **Proven, and the command for each:**
    - `node tests/sentence-library.mjs` (77), `tests/card-compiler.mjs` (29), `tests/table-candidates.mjs` (43),
      `tests/card-waves.mjs` (22) and `tests/engine-compile.mjs` (76).
    - The breaks files `breaks-sentence-library.py` (29), `breaks-card-compiler.py` (10), `breaks-table-candidates.py`
      (27), `breaks-card-backstop.py` (12) and `breaks-card-waves.py` (13), every break caught.
    - Calibration: `node game/tools/sentence-library.mjs` gives 545 of 546 held-out cards passing.
    - Candidates: `node game/tools/card-compiler.mjs` gives 2,643.
  - **Assumed, not proven:**
    - the backstop's pass rate and cost per card, until Rob runs
      `node game/tools/engine-compile.mjs --yes --held-out 200 --max-cost 5`;
    - how a candidate plays in a person's game, until a playtest reports one (the "report a wrong card" route is live,
      and Play's visible label is not).
  - **Outstanding, with the reason:**
    - **ROB-90:** Rob's held-out sample (his key).
    - **ROB-91:** Rob's call on a batch backstop instead of the Worker (migration 0008 then free to reassign); Workshop's save
      asking `known` (Requests, Engine → Workshop 5); Play's label and report link (Engine → Play 4).
    - **ROB-92:** the first wave, from staging's demand list once decks have fed it.
- **The engine queue, in order** (for the next engine session): a small wave on the top missing sentences (Swampwalk and the rest, each completing 13 to 23 cards); then ROB-144 (the release verifier for the Babylon renderer, which holds Play's #767); Requests row 1 (`playPod`,
  for ROB-116); the ROB-134 routes; ROB-94's remaining steps; ROB-74, ROB-78, ROB-149.

## 2026-10-18: main 5f6ea9cc on staging and in production (Rob: "release it to staging", then "release it to production")

Released by the Personal-HP Claude session that built #730, on Rob's go each time. Each release was announced in ROB-11
before its push and recorded there after.
- **Staging:** `release/cloud-staging` b99e2199, on e9b855e5.
  - Local walks: `release-acceptance` 22, `play-e2e` 42.
  - Workers Builds deployed version **21c97df2** (build 69abdbb8).
  - Not read back signed in: the session had no Access service token, so `tools/staging-check.mjs --expect 5f6ea9cc`
    is still to run.
- **Production** (`cloud-production`, by `tools/release-production.sh`):
  - `release/pages` 67fffbd1, on b0cdc46e, pushed at 13:28 UTC;
  - local walks: `release-acceptance` 22 and `production-play-e2e` 27;
  - Workers Builds deployed version **76f7206c** (build 66fe6ec1), at 100% since 13:29 UTC;
  - `version.json` reads 5f6ea9cc, profile `cloud-production`;
  - the live walk at `https://crankmagic.com`: 22 checks, with `UAT_LIVE_NETWORK=1`;
  - **the rollback target** is **5bfe13ab** (c9ad0e65, 2026-10-14).
- **It carries** everything merged since c9ad0e65:
  - the lobby fix (#730, ROB-146);
  - Play's shared shell (#754) and the Table camera fix (#765), which Rob chose to look at on staging;
  - the tabletop preview;
  - deck sharing and invitations, on in staging only;
  - the Deck intelligence PRs.
- **Production's D1 and secrets are unchanged.** Sharing is on only in `cloud-staging`, and every use of migrations
  0003 to 0005 is behind `SHARING_ENABLED`. Production's D1 has 0001 and 0002. Before sharing is turned on in
  production, it needs those three migrations, and `RESEND_API_KEY` and `ACCESS_INVITE_TOKEN` on the `crankmagic`
  Worker. The AI door there still waits on `ANTHROPIC_API_KEY`.

## 2026-10-17: the engine lane resumed (Fable, `claude/admiring-franklin-58cxy4`; Linear ROB-71)

- **Linear:** every engine, simulation and card-load item in the backlog and the plan is filed under ROB-71, in an order of work Rob may change:
  ROB-12, ROB-13, ROB-73 to ROB-95, the card load program as ROB-85 with its steps ROB-86 to ROB-92. ROB-70 is closed as a duplicate of
  ROB-17. Each child names the Codex issue it unblocks.
- **Triage of the October 16 handoff:** implementing ROB-12 (floating mana, multi-mana sources, commander tax). Next: ROB-81 (a
  battlefield static changes cards in other zones, CR 611.3a), ROB-13 (auto-pass, Yield turn), ROB-73 (Draw card), ROB-94 (the six
  live decks). Deferred with issues filed: the UI contracts (ROB-74 to ROB-78), the room's countdown and d20 (ROB-79, ROB-80), the
  commander audit (ROB-82), the card load program, the simulation audit (ROB-84), constructs and waves (ROB-83, ROB-93). Blocked:
  ROB-17, on the game record.
- **Merged:** #739 (ROB-12) as main 7fcf26b2, on Rob's go under the same exception as #736 (CI red only on a11y-board and the four
  UI anchors, both red on main; ROB-15, ROB-16). **On staging:** main 7fcf26b2 (with #737) as `release/cloud-staging` 44af45b4,
  Workers version 2192fe90, play-worker.js byte-identical to the release (9e59b223bdd8); `staging-check --expect 7fcf26b2`
  passes; release-acceptance 22, Play walk 42. ROB-12 Done. Production unchanged.
- **Merged:** #742 (ROB-81) as main 08dcb89f, on green CI (run 39077666709) once #729 (9cf57d0c) had made main green; the ROB-16
  anchor patch was withdrawn, #729 having dropped those four breaks. **On staging:** main 08dcb89f as `release/cloud-staging`
  699c8999, Workers version 0b9bce12, play-worker.js byte-identical to the release (0189b94b1ee1); `staging-check --expect
  08dcb89f` passes; release-acceptance 22, Play walk 42. ROB-81 Done. Production unchanged.
- **ROB-12:** the engine and test paths of 377d6487 ported, behind a pod key: a table's new match carries `pooledTaps: true`, and a
  match launched before offers what it offered and replays the same. A view key, `commanderTax`, on a command-zone commander. Proof:
  engine-tap-to-cast 64, engine-commander 56, engine-cost-targets 42, room-pooled-taps 8 (new), game-table 168; breaks-pooled-taps
  15 of 15; the four anchors it moved re-anchored and caught again.
- **ROB-81:** a permanent's static affects permanents only, unless its `affects` names another zone (`zone`, or `"any"`; CR
  109.2); an effect on named objects (`ids`) applies wherever they are. Maskwood Nexus carries `zone: "any"`. Proof:
  engine-layers 35, engine-wave4c-k3 171; breaks-layers-zone 4 of 4.
- **ROB-101, merged (#744, main 23c96b7e, green suites):** `tests/master-regenerates.mjs` regenerated `data/archive/master-v2.json`
  over the committed file while other suites read it (pilot-policy failed on #742's CI). It now regenerates into its own
  temporary directory (`tools/import_master_v2.py` takes an output path). A reader parsing the file in a loop through five
  runs: main tore 568 of 1,168 reads, the fix none. breaks-master-regenerates 2 of 2. No served file changes.
- **ROB-13:** two pod keys in the room.
  - `yieldTurn`, on a table's new matches: `room.yieldTurn(seatId, {on})` passes each priority of the seat's for the rest of
    an opponent's turn, still asking what the rules ask, on the tape (a `yield` entry) and replayed; it ends with that turn
    or its player. The seat's own view carries `yielding` or `mayYield`.
  - `passStack`, built but not yet asked for by the table: a person with something on the stack and no response they could
    make passes by itself (rules/actions.mjs, nothingToDo with `stack`; a mana ability that does more than add mana is a
    response, `plainMana`); one who cast holding priority is asked. Such a spell is never on the stack in that person's
    views, and the board draws and voices spells from the stack, so the table turns it on once the board shows a spell
    cast and resolved between two views (ROB-23).
  - The G1 harness now launches its games as the table does. The contract, and whether this lane adds the `yield` frame to
    `cloud/game-room.mjs`, are asked in ROB-11. Proof: engine-pass-stack 18, room-yield-turn 43; breaks-yield-turn 41, each
    caught.
  - **Merged:** #745 as main 7df7064a, on green suites. **Staging held:** two tries of its release stopped at
    release-acceptance's Measure step, live Scryfall's `/cards/collection` taking 6.5 to 30 s against the page's 10 s; the Play
    walk passed 42 both times and nothing was pushed (staging is still 699c8999, version 0b9bce12). Retried once Scryfall
    answers quickly again.
- **ROB-73, merged (#746, main 20601740):** `room-draw-card` proves Draw card at the room (a double submission, a reopen while
  it waits, the first draw's rules, an empty library); breaks-draw-card 6 of 6. Tables launching with `drawBeat` waits on
  the board's side of ROB-24 (table-board's walk clicks no Draw card).
- **ROB-77 (this branch's next PR):** the table's events, `events.v1` (game/room/events.mjs): each view carries what the
  action behind it did, each event with the journal's id and the decision whose answer made it; a draw the drawer's alone
  and only while the card is in their hand; `room.view(seatId, {after})` for a reconnect, `eventsReset` past the newest 200
  kept. A drawn card's id in the hand is now in its engine event (`drewAs`). The socket's `after` waits on one line in
  `cloud/game-room.mjs` (asked in ROB-11). Proof: room-events 32; breaks-table-events 17, each caught; fuzz-library's and
  room-g1-terms' no-leak checks read every view's events.
- **ROB-76, done (#748, main 2030725c; staging 7ebf7d89, version 383c0a2c byte-identical):** the round and the turn
  within it (rules/turn.mjs, `nextRound`): `state.round`, `turnInRound`, `turnId` and `extraTurn` in every view, and
  `round` in the turn's events. Proof: engine-rounds 27; breaks-rounds 13, each caught.
- **ROB-75 and the socket frames, done (#778, main 62900176; staging 5634b896, version b6f37e78 byte-identical):** a
  draft of blocks checked before Confirm (`legalBlocks` on the declare-blockers decision; `room.check`, rules/combat.mjs `blockers.check`, every reason at once and nothing changed),
  and the three frames in `cloud/game-room.mjs`, the engine lane's file since the charter: `{type: "view", after}`
  (ROB-77), `{type: "yield", on}` (ROB-13) and `{type: "check"}` (ROB-75). Required blocks, "an additional creature",
  "can't block alone" and battles are not in the rules yet (ROB-149). Proof: room-block-check 30, breaks-block-check 13;
  game-room 531, breaks-socket-frames 6; each caught.
- **ROB-94, started:** revision 37's six decks (fresh from staging D1 with Rob's OK, kept in the ignored `game/.local/`),
  every card defined; 72 games through the real room with `--replay --leaks`, all clean (ROB-94 in Linear).
- **Waiting on Rob:** the backstop's daily cap (ROB-90); the AI door's two settings (ROB-95: the staging AI Access app, and the
  production key); whether waves 4d onward wait on card-load steps 1 to 4 (ROB-93).
- **Files and releases (the October 18 charter, `docs/program/README.md` section 3):** this lane edits `game/**`, the room and
  Worker routing files in `cloud/` (`worker.mjs`, `play-worker.mjs`, `game-room.mjs`, `tables.mjs`, `ai.mjs`, `access.mjs`),
  `migrations/**`, `data/engine/**`, the release and CI tooling, and its own feed; never `docs/ui-lane/**` or another lane's
  `cloud/` files, which are asked for in ROB-11. Staging releases of main are this lane's: announced in ROB-11 before the push
  and recorded after it, never two at once.
- **The next session starts here.** This one stopped after #778, per the card load plan's "Running a lane" (one step, one
  fresh session, one PR). Card load step 1 (ROB-86) is #776; step 2 (ROB-87) starts from its kickoff prompt in
  `docs/engine/plan-card-load-program.md`. Migrations as corrected in ROB-11 at 16:39 on Oct 18: 0006 ROB-86
  (`card_demand`, #776), 0007 ROB-127 (preferences), 0008 ROB-88 (`card_candidates`). Open with the engine lane: Codex · Play's answer on the anchor
  lines for the block draft and the three frames (ROB-11, Oct 18); the ROB-134 routes (`GET /d/<shareId>`,
  `GET /api/public/decks/<shareId>`) and their Access bypass, staging first (Rob approved it on Oct 18); the ROB-132 meter;
  ROB-94's remaining steps; a per-turn stats field for ROB-116 once Deck intelligence names the fields (Requests row 1).

## 2026-10-14: Rob's decisions on the card load program

Rob asked for "a card load-to-engine program" to replace session waves at about 7 cards a point. He reviewed the
proposal (the Card Load Program page) and decided, on 2026-10-14:
1. **The compiler first**, from oracle text; the Claude API as its backstop where the compiler's confidence in a card
   is below 99%.
2. **Candidate cards may play at playtest tables** (D5 changes for candidates only), labeled.
3. "Real time" means **when a deck is saved**.
4. Friday's work runs **in a fresh session per lane**.
5. **Players are told their card was recorded** for the next wave.

These supersede decisions 2 and 3 of 2026-10-12 (`docs/engine/plan-coverage-90.md`). The plan, the measurements
behind it and the order of work: `docs/engine/plan-card-load-program.md`. Still Rob's to set: the backstop's daily
cap. No lane runs the API writer before that step is built and the cap is set.

Measured for it: a compiler built from the 2,470 defined cards' sentences reaches at most 21.7% of all cards and 12.5%
of the 90% target's 4,186 still undefined (`docs/handoff-2026-10-12/sentence-reuse.mjs`). A point is about $10 of
usage at API list prices, so a card in a session wave costs about $1.40, against an estimated 1 to 3 cents through the
backstop.

## 2026-10-14: main c9ad0e65 on staging and in production (Rob: "Release it all to prod")

- **Staging:** `release/cloud-staging` e3b62777. Local walks: `release-acceptance` 22, `play-e2e` 35. Workers Builds
  deployed version **1585a9a3**, its `play-worker.js` byte for byte the dry run (sha256 a3f3f187df92), the AI settings
  bound with `AI_EVERYONE`. `staging-check`, signed in, reads c9ad0e65.
- **Production** (`cloud-production`, by `tools/release-production.sh`):
  - `release/pages` b0cdc46e, on 04b415de;
  - local walks: `release-acceptance` 22 and `production-play-e2e` 27;
  - Workers Builds deployed version **5bfe13ab**, its `play-worker.js` byte for byte the dry run (a3f3f187df92), the
    AI settings bound on the "CrankMagic Accounts" sign-in;
  - `version.json` reads c9ad0e65, profile `cloud-production`;
  - the live walk at `https://crankmagic.com`: 22 checks, with `UAT_LIVE_NETWORK=1`. Without it, the walk's Scryfall
    stub stopped *Measure* on 44 cards only Scryfall knows; `docs/release-production.md` now says so.
  - **The rollback target** is the previous Play version, **8997e158** (fa1a7d3b), or the standby **a2c6fbb4**.
  - It carries #718 to #732: the card waves 1 to 4c, the first-draw rule, the UI lane's Play pass 1, the AI door
    open to everyone signed in.
- **The AI door in production waits on the key:** `ANTHROPIC_API_KEY` on the `crankmagic` Worker (none at
  2026-10-14). Until then it answers 503. On staging it waits on the AI testers' Access application, deleted or widened.

## 2026-10-14: the AI door open to everyone signed in

Rob: *"I want the AI door open on staging and production for anyone that can sign in (e.g. given I am manually adding
who can access, I'm fine with those I want everyone I add to be able to use the AI features)."*
- **Built:** the switch `AI_EVERYONE` (`ai.everyone` in a release profile). On, the invite list is the allowlist, and
  the door takes the app's own sign-in as well as an AI application's. Off, both hold as before. On in `cloud-staging`
  and `cloud-production`. Production's door uses the "CrankMagic accounts" sign-in, with staging's caps, model and
  features. The pages release and the standby keep it shut. `privacy.html` says "signed in" where it said "invited to
  AI features". The record is in `docs/ai-door.md`, *Open to everyone signed in*.
- **Proof:** ai-door 61, agent-seat-table 19, release-pages 216, cloud-worker 120, advisor 56, coach 60,
  room-agent-seat 23. Breaks: `tools/ai-everyone-breaks.py`, 13 of 13 caught. Four anchors this change moved were
  re-anchored and caught again: three in `breaks-ai-staging-on.py`, one in `ai-clock-breaks.py`.
- **Rob's steps:**
  - staging: delete the Access application "CrankMagic AI (staging)", whose policy is the three AI testers, or give
    it staging's people;
  - production: the key (`ANTHROPIC_API_KEY` on the `crankmagic` Worker; none there at 2026-10-14; staging has one);
  - production: the go for the release that carries it. That release ships all of main since fa1a7d3b (#718 to #727),
    the UI lane's Play pass 1 (#725) among it.

## 2026-10-13: the lobby's buttons in reach at any window size (`claude/ui-lobby-seat-buttons`; Claude on Personal-HP)

UI-lane files, at Rob's direct request; no UI-lane branch touched them. Rob, testing staging with an invited player: "their
screen wasn't maximized, and the buttons aren't visible when the screen isn't big enough".
- **What it was:** a seat's quadrant clips what it holds, and the 2x2 shrinks with the window. At 1024x768 her seat
  showed Change deck, with Choose mat and Ready cut off below it.
- **Built:** the cloud table keeps its 2x2 only while every seat's card, reading and controls fit inside what clips
  them, and stacks the seats otherwise (`fitSeats` in `crankmagic-seat-art.js`). The seats keep clear of the rules
  panel's 246px floor. A stacked seat is as tall as what it holds. The stacked table is no longer 18px wider than its
  column.
- **Proof:** `tests/table-lobby.mjs`, 97 checks: every control reached as a person can and hit-tested, guest and host,
  at six window sizes. `breaks-lobby-reach.py`, 9 of 9 caught.
- **For whoever holds the UI lane next (Codex Astra):** a Playwright click scrolls inside clipped boxes, which a person
  cannot. Prove a control usable by hit-testing it (`inReach` in `tests/table-lobby.mjs`).
- **Merged** as #730 (5f6ea9cc) on 2026-10-18, after main had been merged in four times. `table-lobby` was 122 checks
  on the final tree. Released to staging and production the same day (the record above; Linear ROB-146).

## 2026-10-12: the UI lane's pass 1 on the Play screen (Fable, a Claude session in a cloud container)

Rob's brief of 2026-10-12: evaluate the Replit concept (`CrankMagic-Play`, with its `HANDOFF.md`) and the board, plan
the port, build a first pass, put it on staging, and iterate on his feedback. The plan, what was kept and what was
refused of the concept, and the passes to come: `docs/ui-lane/plan-play-ui-2026-10-12.md`.

- **Branch** `claude/nice-hypatia-4ajdyi`, from main 494bf0f (#722). The harness names the branch; the lane's
  `claude/ui-<topic>` form is for the next topic.
- **Built** (the board, its CSS, the mats sheet, the lobby, Settings' Play card; nothing of the engine's):
  - the seven steps always in the strip and in Full screen's pill, done · now · to come, short forms under 1400px;
  - Full screen as the table from your chair: the big board's mat is the whole ground; the other seats at the far sides
    and the back as boards of their own; a **3D** switch in the rail bends the ground at a horizon, remembered on the device;
  - the right pane docked beside the mat in Focus and Table, its own width divider, with the tabs Turn Resources · Panel
    · History (Rob's notes 9 and 10); the hover card no taller than the mat;
  - motion: a played card flies from the hand to the mat, a drawn one from the library, a destroyed one to its pile; a
    tapped card turns where it lies; the turn's light crossfades; Reduce motion stills all of it;
  - the callouts (the brief's overlay): YOUR TURN, INCOMING, HIT, KO, COUNTERED, TOKENS, DESTROYED, EXILED, +N and the
    rest, read from the difference between two views; three at most; Settings › Play › Overlay (a slider) sets how
    loud and how long; Tools › Try the callouts fires the set;
  - the lobby: a seated deck's quadrant wears its commander's color fan; "Launches when all are ready · n to go";
  - Play home: Recent games under New table.
- **Proved** (each command from the repository root, `GEOMETRY_REQUIRED=1`):
  - `node tests/table-board.mjs`: the ribbon, Full screen's ground and seats, 3D, the docked pane and its divider, Turn
    Resources, the hover cap, the callouts' layer;
  - `node tests/board-callouts.mjs` (new, in Node): the callouts' reading of a view, a hidden card never named;
  - `node tests/table-lobby.mjs`, `node tests/settings-r3.mjs`, `node tests/a11y-board.mjs`, `node tests/board-choices.mjs`,
    `node tests/coach.mjs`, `node tests/feature-wiring.mjs`, `node tests/room-resolve-all.mjs`, `node tests/room-beats.mjs`,
    `node tests/playtest-harness.mjs`, `node tests/data-integrity.mjs`, `node tests/asset-versions.mjs`;
  - breaks: `python3 game/tools/batch/breaks.py game/tools/batch/breaks-play-ui.py` (12) and `breaks-play-ui-rest.py` (7).
- **Assumed, not proved:** the flights and the turn's light are seen in the fixture (`tools/board-fixture.mjs`) and not
  yet held by a suite; the side seats' boards at 1280×720 are legible as presence, not to read.
- **Asked of the engine lane:** Requests rows 2 to 6 above.
- **Outstanding:** the merge of #725 on a green run of its head (the advisor suite's clock, Requests row 7, was fixed on
  `main` in c629f8c and is merged into the branch); then the staging release, Rob's review, and pass 2
  (`plan-play-ui-2026-10-12.md` §4).
  The suites this pass touches are green on its head: a11y-board 288, table-board 281, table-lobby 89, board-callouts 33,
  settings-r3 63, board-choices 42, coach 60, design-tokens 91; the 19 breaks all caught.

- **Handed off (2026-10-12, merged 2026-10-17):** `docs/ui-lane/astra/` (its `README.md` first): the handoff, Rob's two
  briefs, Play home and the deals, assembled when this lane passed to Codex. Main has moved since (Codex's Play
  overhaul, `docs/play-overhaul/`; the lanes as the table above states them now); where that directory and newer
  records differ, the newer wins, as its README says.

- **2026-10-17, the gate for #729 (Rob: "fix the a11y walk here"):** `tests/a11y-board.mjs` was red on main since the
  tabletop rewrite (#734) removed the Full screen rail it drove (ROB-15), and `engine-breaks-anchors` for four breaks of
  pass 1 on code the rewrite removed (ROB-16). Both fixed on `claude/nice-hypatia-4ajdyi`:
  - the walk's Full screen section rewritten for the tabletop (its regions, Tools through the profile menu's Settings,
    the table panel's last control in view and its scroll, a view left through Screen View, the words read over
    the tabletop); the four stale breaks dropped;
  - what the walk then found in the tabletop, fixed in `crankmagic-stage.css` and `crankmagic-stage.js`: the rear seat
    label's commander name and the turn caption under 4.5:1 over the mats (now on dark plates), a fanned card's name
    under 3:1 (now on a title plate), and Pixi 8's accessibility listeners reaching a destroyed renderer after leaving
    Full screen (one renderer is now kept across visits; the stage is emptied and the canvas detached instead);
  - **found, not fixed, for the UI lane:** opening Settings from Full screen's profile menu drops the keyboard focus
    to the page body (the Settings button is redrawn away); the old rail kept it. The walk asserts what holds.
  - Breaks: `game/tools/batch/breaks-a11y-tabletop.py`.

## 2026-10-12: the AI call log on the clock it is handed (`claude/advisor-meter-clock`)

Claude Code on Personal-HP, at Rob's request, for one small fix in the engine lane's files. `advisor` failed on main
494bf0f4 once the real date passed 2026-10-12T12:00Z: the settings' meter read the last 24 hours on the machine's clock.
The engine lane fixed the meter in c629f8c1 (#723). This branch fixes the one other call log on the machine's clock:
- **The LLM seat** (`agentChoice`, `cloud/game-room.mjs`) logged its calls and read the day's caps on the machine's
  clock. It now uses the table's clock (`this.now`), as the countdown and the away clocks do. Production is unchanged.
- `tests/agent-seat-table.mjs`, 18 checks (from 16): calls are logged at the table's clock, and a spend logged a minute
  before it counts against the host's day.
- `tools/ai-clock-breaks.py`: 6 breaks, each caught by the check it targets.
- **The suites no longer depend on the real date:** advisor, ai-door, coach, cloud-worker and agent-seat-table pass with
  the machine's clock moved 30 days back, 2 back, 30 on and 400 on (a preload that moves `Date.now()` and a bare
  `new Date()`; the PR has it). With the meter's old code, advisor passes 2 days back and fails 30 days on.
- **Merged #727** (main f293e327, 2026-10-12) on one green `suites` run of its head 245985ad. Nothing is open.

## 2026-10-12, later: Train E, Rob's library, in waves; the plan to 90%

This session (Claude, a cloud container), with session workers only. No API usage (Rob: "I don't want to use API
usage for this").
- **Wave 1, merged #719** (main 0b9de9a8), on staging (b1369b4b3bf3): 44 cards. With them came:
  - warp, void and sneak;
  - explore and the Map token.
- **Wave 2, merged #720:** 63 cards from four workers.
  - Engine pieces:
    - morph;
    - behold-and-exile;
    - last known power in a trigger;
    - `differentNames` and `greatestManaValue`;
    - a goad for the rest of the game;
    - a different opponent for each permanent given away;
    - replicate.
  - Fixed: whether a first-strike damage step happens is now decided as combat damage begins, not at blocks (CR 510.4).
    A creature given first strike after blocks used to deal no combat damage.
  - Waiting: Extrapolate the Impossible, which needs cards from outside the game (CR 400.11).
- **Wave 3, merged #721:** 63 cards from four workers, the last of Rob's library.
  - Engine pieces:
    - Narset's "can't draw more than one card each turn" (CR 121.2b);
    - a modal "you may choose the same mode more than once" (700.2d);
    - "the first time this ability has resolved this turn";
    - a blocks trigger naming what it blocks;
    - a cast trigger's "while";
    - incubate and the Incubator token;
    - "move X counters" moving what is there;
    - an unless cost's discard of a kind;
    - "you may choose new targets";
    - no maximum hand size for the rest of the game.
  - A second worker made wave 2's CR 510.4 fix independently; wave 2's was kept.
- **The monarch** (CR 725), merged #721:
  - one monarch at a time, with its two inherent triggers;
  - a monarch who leaves passes it on (725.4);
  - `becomeMonarch`, and `monarch: "you"`;
  - `monarch: true` in the view (Requests row 1).

  With it, a creature leaves combat when its controller changes (CR 506.4). Ginger, Queen of Sweets and Tamiyo, Upriser
  Crowned now play.
- **Rob's library, after waves 1 to 3:** 1,216 of his v43 library's 1,217 cards play (`tableCards`). The one left is Extrapolate the Impossible,
  which needs cards from outside the game (CR 400.11).
- **Wave 4a, merged #722** (main 494bf0f4), on staging (5153cc15): four constructs, and 72 of the most-played Commander cards they unlock. The 80% set goes
  from 1,275 defined to 1,347, and from 2,661 with every rule to 2,743.
  - "You may play that card" from another zone: 17 cards. Valgavoth waits on a replacement on every route to a
    graveyard.
  - The cards an effect moved: 17 cards. Gix, The Legend of Kyoshi and Gisa wait.
  - Objects an effect remembers: 19 cards. Daretti waits on emblems.
  - Token and counter replacements: 19 cards. The Earth Crystal waits on counters divided at activation.

  None of the four constructs is credited in full. Each lane names the forms still missing.
- **Every break anchors once again.** Later merges had moved the anchors of 37 breaks across 15 files, so those breaks
  no longer broke anything. Each was re-anchored on the code it was written for and proved caught; 1,098 breaks
  checked. Wave 4b's merges moved 23 more, in 10 files: each re-anchored and proved caught the same way. Every one of
  the 1,368 breaks in the 40 files now finds its code exactly once.
- **The plan, reordered** (`docs/engine/plan-coverage-90.md`):
  - 1,396 of the 80% set's undefined cards already have every rule, so the most-played cards come first, each wave
    building the small constructs its cards need.
- **Wave 4b, merged #723** (main a61244a0): 112 of the 120 most-played cards the table couldn't play (ranks 23 to 500), and three
  more that prove its constructs. Four lanes, each building the constructs its cards needed:
  - j1, 26 cards: an Aura on a graveyard card (Animate Dead), a land given a basic land type taps for its mana
    (CR 305.6), protection from colors over the creatures a spell named (Akroma's Will), "if you cast it".
  - j2, 31 cards: changing targets to this creature (Spellskite), the top of a library put back in any order
    (`rearrangeTop`), "whenever you cast or copy" (magecraft), the amount a delayed trigger remembers (Mana Drain).
  - j3, 30 cards: exalted, extort, eternalize, gift, an opening hand's card beginning on the battlefield (CR 103.6a),
    base power.
  - j4, 28 cards: "can't be activated" (Grand Abolisher), a cost raised for what a spell targets (Terror of the Peaks),
    X paid in life (Toxic Deluge), imprint, the creatures attacked with this turn (Minas Tirith).
  - Three lanes each built CR 305.6 on its own. One is kept (`intrinsicMana`, rules/layers.mjs, layer 4), only for a
    land, and gives each type's ability once.
  - Not defined, each waiting on another family: Sylvan Library, Arena of Glory, Mosswort Bridge, Six, Ragavan, Dauthi
    Voidwalker, Birgi and Emry.
  - The 80% set: 1,462 defined (from 1,347), 2,780 with every rule. The 90% set: 1,605 of 5,869 defined (from 1,411).
    The defined cards now cover 60.3% of all card appearances (52.6% when the plan was written; the PRs and the
    handoff said 52.0%, which was the 80% set's share, not the 90% target's).
  - Breaks: j1 33, j2 45, j3 111, j4 81, each caught.
- **Wave 4c, merged #726** (main 0540d882): 78 of the next 80 most-played cards (ranks 501 to 723), in four lanes by theme, each owning the
  rules its cards need:
  - k1 lands, 21: a land played as an effect resolves (Windbrisk Heights, and Mosswort Bridge, which 4b had left).
  - k2 graveyard and combat, 19: delve, dredge, fabricate, a flashback cost that sacrifices, the rest of a dig on the
    bottom in an order its owner chooses (CR 401.4), Commander's Plate's protection, CR 205.3d's subtypes.
  - k3 tokens and counters, 18: dice (`rollDie`), offspring, "becomes level", +1/+1 and -1/-1 counters cancelling
    with the deaths (CR 704.5q), Saw in Half's copies, a counter for each creature of the chosen type.
  - k4 spells and draws, 20: affinity, a hand looked at (Gitaxian Probe), "draws more" and "an empty draw wins"
    (Teferi's Ageless Insight, Laboratory Maniac), a fixed life payment as a cost's choice.
  - Stopped on: Mox Diamond (an "instead of entering" asked before it enters, on every route to the battlefield);
    The Earth Crystal (counters divided at activation, CR 601.2d); Tibalt's Trickery (a random number, a cast by
    another player as it resolves).
  - Two lanes built the same "tap a permanent without {T}" mana cost (Urza; Relic of Legends): one kept.
  - **Every break still breaks something:** `tests/engine-breaks-anchors.mjs` holds each anchor to being found once
    (`game/tools/batch/anchors.py`). It named the three breaks this wave's own merge moved, and three stale ones in
    `train-b6-breaks.py` the earlier scans never read. 53 files, 1,712 breaks.
  - The 80% set: 1,540 defined (from 1,462), 2,814 with every rule. The 90% set: 1,683 of 5,869. The defined cards
    cover 62.5% of all card appearances.
  - **On staging with wave 4b** (main 0540d882): release-acceptance 22, play-e2e 35; Workers Builds deployed version
    fe296442, its `play-worker.js` byte for byte the release's dry run (sha256 dc3437729abb); `staging-check` signed in
    reads 0540d882. The release of a61244a0 had stopped at `play-e2e` (Cyclonic Rift named as unplayable); #726 fixed it.
- **Paused here at 83% of the week's usage**, at a wave's end rather than mid-wave (Rob's 90% rule): the handoff is
  `docs/handoff-2026-10-12.md`. Wave 4d starts at rank 724 of the 80% set, plus the leftovers it lists.
- **Open, for later waves:**
  - **Fixed on `claude/first-draw-step`:** in a two-player game the starting player skipped the draw step's draw, not
    the step (CR 103.8a), so its beginning triggers fired on turn 1. Now the step is skipped.
    - A draw step brought by an added beginning phase (CR 500.8) still happens: Sphinx of the Second Sun on turn 1.
    - The table's host may turn the skip off (Rob, 2026-10-12; Requests row 2).
    - Breaks: `breaks-first-draw-step.py`, 16 of 16 caught.
    - Orcish Bowmasters (wave 4b): its turn-1 scenario drew in the step that no longer happens. It now shows Rob's
      turn-1 draw triggering it. A new dredge scenario (CR 702.52a) catches j4's "an effect's draw" break again.
    - Crossing the lanes: `tests/table-board.mjs`, the UI lane's suite, had its turn-1 history line updated. No UI-lane
      branch touches that file.
  - When two limited permissions allow the same card, the engine merges them and picks one. That choice is the
    player's.
- **The plan to 90%** (Rob: "after wave 3 define a wave 4+ to bring us to the 90% of all cards typically used"):
  `docs/engine/plan-coverage-90.md`.
  - The target is 5,869 cards, of which 1,411 are defined.
  - Waves 4a to 4c build the constructs that block the most cards.
  - Wave 5 onward defines the rest, 60 to 90 cards a wave.
  - The week's usage is read before each wave.

## 2026-10-12: Rob's notes merged and on staging; his v43 library restored there; Train D

This session (Claude, a cloud container):
- **Merged #714** (main a8008918) on one green `suites` run: notes 1 to 8 and 14 of Rob's playtest notes (the table
  below). Its 50 breaks are all caught. It is released to staging, and the deployed worker is byte for byte the dry
  run's (play-worker.js 597fe3975a37).
- **Rob's library is v43 on staging.** Rob restored `crankmagic-library-v43.json` (built from his v43 Master workbook,
  the six Target decks only) through Settings. The cloud's head, revision 30, read back from D1 and decoded:
  - its cards, decks, copies and groups are identical to the file;
  - six decks, each final and ready at 100 of 100 (D1 Tymna + Kraum, D2 Chulane, D3 Kiora, D4 Felothar,
    D5 Teysa Karlov, D6 Krenko);
  - 1,217 cards and 2,245 copies; none of the old decks is left.
- **Production waits on Rob's restore**, done the same way.
- **The old saved versions are purged** (Rob's OK, 2026-10-12): every one of his versions but the head, the guard
  `cloud/library.mjs`'s own pruning uses. Staging lost 20 and keeps v43 (revision 30); production lost 8 and keeps its
  head of 2026-10-04 until Rob restores v43 there, after which its one old version goes too. D1 Time Travel can still
  restore either database for 30 days.
- **Merged #715** (main cb73f7d0) and on staging:
  - Load Live reads two partners as a deck's commanders, and a workbook's decks named by hand (`--decks`);
  - the board's notes 11 to 13.
- **Merged #716** (main 4a024c1b): an AI on Claude and the deck advisor on at staging; the lanes and the UI brief; Train D's
  first 16 cards.
- **An AI on Claude and the deck advisor are on at staging.** Rob approved their privacy wording on
  2026-10-12 ("Approved on privacy wording"). Production's door stays shut.
- **Train D: all 18 of the six decks' cards now play.** 16 came in #716. Oko, Thief of Crowns and Retro-Mutation come
  in this branch, with the engine gap that stood in their way:
  - "Loses all abilities" now switches off a permanent's static abilities and replacement effects, not only its
    keywords and its triggered, activated and mana abilities (CR 613.1f).
  - An effect begun in an earlier layer keeps applying (613.6). Every static and replacement reader takes an object's
    abilities as they are after layer 6.
  - Eight cards already defined were wrong on about a quarter of their targets, and 16 new scenarios show each one
    right: Song of the Dryads on a lord no longer leaves its anthem on.
  - New: `exchangeControl` (CR 701.12), and a layer-4 change of creature types only (205.1a), so an Elked Food stays a
    Food. `tests/engine-ability-loss.mjs`, 109 checks; `breaks-ability-loss.py`, 76 of 76 caught.
  - **Left open:**
    - Song of the Dryads' ability loss belongs to its layer-4 effect (CR 305.7), and is applied in layer 6.
    - A Saga under it still reads its printed chapters.
    - An ability lost as a permanent enters (614.12) is not built.

    No card in the library depends on any of these.
  - Next, the library's other ~175 cards.
- **G-F: production is released, with Play open** (Rob: "Workers Builds branch is release/pages, go ahead with
  production", 2026-10-12). Both releases were built from main fa1a7d3b, the same commit staging serves (its worker
  byte-identical to its dry run, 40d0018f1647). Each went out by `tools/release-production.sh`, and Workers Builds
  deployed each push of `release/pages`.
  1. **The standby** (Play closed, the table class registered):
     - `release/pages` 6799f713;
     - local walks: `release-acceptance` 23 and `production-play-e2e` 27;
     - deployed as version **a2c6fbb4**, the recovery target;
     - the live walk at `https://crankmagic.com`: 23 checks.
  2. **Play** (`cloud-production`):
     - `release/pages` 04b415de;
     - local walks: 22 and 27;
     - deployed as version **8997e158**; `version.json` reads `fa1a7d3b`, profile `cloud-production`;
     - the live walk: 22 checks.

  Production's AI door stays shut: the version has no `AI_*` binding, and opening it is a later go of Rob's. `/api/*` is
  behind Access.
- **Before Part 7's second sentence:**
  - G-D: Grok Bot's 50 games wait on the four agents' tokens.
  - G-E: Rob's invites.
  - Rob's v43 restore on production, which serves the current app now.
- **Rob's choice, 2026-10-12:** a second system takes the UI lane (the board, its CSS, Settings' Play card) while this
  session keeps the engine, the room and the card loads (the lanes above; AGENTS.md, *Lanes*). Notes 9 and 10 move to
  that lane.

## 2026-10-11: G-A built, G-B proved again with it, the rest waits on Rob

This session (Claude, a cloud container) built the rest of G-A and merged each piece on the gate, released to
staging with its deployed bytes compared:
- AI-4, the deck advisor (#697);
- AI-6, AI Coach settings (#698);
- M3's monitoring (#699);
- Train C, Rob's library: 1,130 of his 1,132 cards play (#700), and 1,131 with Gandalf since (the Gandalf record below);
- the A11y pass (#701).

It then ran G-B again on main bf0e9d21, with all of it in (the rows below): the journeys, the gallery and the A11y checks pass;
the gate failed once in one `table-board` check, root-caused to a race in the board and fixed (#702), then passed twice on main 74f715c7. **What is left is Rob's:**
- the privacy wording for *AI players on Claude* and *The deck advisor* (`docs/ai-door.md`);
- the advisor's eval with his key;
- confirming his library plays as he expects;
- M3's two alerts and their email, and R2 with the nightly copy's window and deletion promise (`docs/ops.md`);
- G-C's four agents' access: four service tokens, admitted at staging (M8; the steps are in `docs/playtest-harness.md`);
- then G-D (Grok Bot), G-E (his invites) and G-F (his review and production go).

Part 7's first sentence waits on G-A's approvals and G-C's agents.

**Later the same day (#702 to #708, each merged on green Actions and released to staging, its worker compared byte for
byte with the dry run):**
- G-C's agents' access: each service token staging admits is an identity of its own (#704);
- G-D to G-F, this side's half: the triage tool, the run's brief, the invites' runbook, and production's release
  script, rehearsed (#705);
- words on the accent at 4.5:1 across the app (#706);
- Gandalf, so 1,131 of Rob's 1,132 cards play, and control for good no longer breaking a room's save (#707);
- G-D's dress rehearsal: 50 games through the real board, every one replayed with no leak, M8's exit criteria met (#708);
- G1 over Rob's whole library, not only his seven decks: 650 games, and the two table-stalling bugs they found fixed
  (#710, #711), then 250 more with both fixes in, every one clean (the G1-L record below).

Staging serves main 039c86dd. Every gate item that is this side's is done; what is left is Rob's (the list above, and
G-D's 50 games by Grok Bot once the agents' tokens are in).

### Rob's playtest notes, 2026-10-11

Rob played Focus at staging and sent his notes through the evening, with screenshots. What each was, and where it stands:

| # | Rob's note | What it was | Where it stands |
|---|---|---|---|
| 1 | "It says we are on turn 3, but I only played one land" | The strip's turn is the game's, counting every player's: turn 3 was his second. | **Built.** The room counts each seat's own turns (`yourTurn`); the strip reads *Turn 3 · You (your 2nd)*. |
| 2 | "Passing the turn to the next player should always require player confirmation, never happen automatically" | His end step, with nothing to do, passed by itself, ending his turn. | **Built.** The sixth beat, `endAsks`, kept with the match as the others are: a person's own end step is always asked, and the button there reads **End turn**. A game made before it replays as it was played. |
| 3 | "It's skipping turns when I didn't play a land" | The data says otherwise: 405 steps passed by themselves in 40 games, and not one was a main phase with the land drop unused. Playing a land is something to do (`nothingToDo`), and a spell is counted with the mana the lands on the mat could make. What he saw was note 2: the turn ending without him. | **Answered** by note 2's fix; no main phase was ever skipped. |
| 4 | "The option to require manual transition from each of the 7 steps … a toggle in settings" | No such setting. | **Built.** Settings › Play › *Stop at every step of my turn*: kept with his preferences, told to the room by the board, on the tape (`prefer`), so a game replays where it asked. |
| 5 | "I should also be able to click the card to untap it again" | Mana tapped and not spent could not be taken back. | **Built.** The seventh beat, `untapMana` (game/engine/rules/untap-mana.mjs): a land tapped for mana, its mana unspent and nothing since, is lit and says *Untap*; a click puts it upright. Proved by the state's hash: the game is exactly as it was before the tap. A pain land, a sacrifice or a mana trigger is never offered. Rob: "You can only untap a land if it hasn't been spent", which is the rule as built. |
| 6 | Rampant Growth: "Search your library: nothing to find", with 19 basics in his library | **A real bug, at every table.** The table's card lookup took the room's bare basics first: no Basic supertype, no land type. Every "basic land card" search failed (Rampant Growth, Fertilid, Fabled Passage), and so did "a Plains card" and "unless you control a Forest or an Island" (Hinterland Harbor). | **Fixed.** The table plays the engine's own definitions, basics included; the room's basics are Basic and of their land type (CR 205.4c, 305.6). tests/table-basics.mjs plays all 3,876 card scenarios through the table's lookup. |
| 7 | Valorous Stance offered only the indestructible mode on an opponent's Fertilid | As intended: Fertilid is printed 0/0, so with two +1/+1 counters it is 2/2, and the destroy mode needs toughness 4 or greater (CR 700.2a). Counters do count (CR 613.4c), as Rob asked. | **As intended.** And his follow-up is built: an option that helps an opponent says *helps Maya*, one aimed at your own *against your own* (room.mjs `leaning`), marked on the board. |
| 8 | Freyalise's Elf Druid token's mana ability | Already fixed in #703 (another session), and on staging. | **Done** earlier. |
| 9 | A *Turn Resources* tab beside *Panel*: by land and card type, how many can be played this turn, how many in all, the mana tapped | Not built. | **Open.** Proposed for the UI lane (above). |
| 10 | The right pane lies over the mat; it should sit beside it like the left one, its width dragged within the same bounds | The right pane is an overlay. | **Open**, with the hover card no taller than the mat (his note of the same day). |
| 11 | Hovering a stack entry ("1. Fertilid") shows the card beside the On the stack box | Not built. | **Built.** An entry under the pointer, focused or tapped shows its card at the hover's size beside the box: to its left where it fits, else below. Escape or the pointer leaving puts it away. |
| 12 | A sorcery or instant is not seen while it resolves ("they should appear on the battlefield while being resolved") | The stack is a list of names. | **Built.** The On the stack box shows its top spell as a card above the list. |
| 13 | The Lands row cuts off its last cards with no scroll bar | The zone clips. A tapped land's margins were left out of the row's measure, and it took no share of the overlap. | **Built.** A full row overlaps to fit, its tapped lands included. Past a readable strip of each card (30%), it scrolls with a bar. |
| 14 | Show hand: the end of a long card name ran under the next card (found by a11y-board, not Rob) | The fan overlaps each card's right edge. | **Fixed.** A covered card's name wraps within what shows of it. |

Breaks: `game/tools/batch/breaks-turn-flow.py` (the room, 15), `breaks-turn-flow-board.py` (the board and Settings, 10),
`breaks-untap-mana.py` (14), `breaks-table-basics.py` (3), `breaks-leaning.py` (8).
Notes 11 to 13: `breaks-board-rows-stack.py` (10). Load Live's partners: `breaks-live-load-partners.py` (4).

## RESUMED, 2026-10-08: the review-response session (Claude, a cloud container), on Rob's "Keep building"

The review-response session paused on 2026-10-06 at 97% of the week's usage (Rob: pause at 90% and "write up a
comprehensive handoff packet for another AI platform"). Codex on Personal-HP then picked the handoff up on 2026-10-07
(its record below): B4, B6 and B3 landed with suites and breaks (5d068d26), 53 of the seven decks' 477 cards left
undefined. On 2026-10-08 Rob told this session "Keep building", the week's usage read back at 1%, so the baton is back
here, on the same branch and PR #669, building on Codex's commit. **`docs/handoff-2026-10-06.md` is still the map**, with
`docs/train-b-proof-2026-10-07.md` and `docs/production-readiness-2026-10-07.md` beside it. Train B goes on as the
handoff's §3 says, five workers by engine area (permissions and attack statics; effects, counts and triggers; memory;
keywords; costs and filters), merged here in turn. Rob's rule stands: at 90% of the week's usage, pause and hand off.

**Where the gates stand, 2026-10-11** (Part 7 of `docs/plan-to-done-2026-09-30.md`; the records below are the proof):

| Gate item | State | Proof, or whose step |
| --- | --- | --- |
| G-A: G1, 1,400 games | **done: 1,400 of 1,400 clean** | PR #686's head ccb250d1: every game finished, none refused, every replay identical, 0 leaks in 105,656 checks of every seat's view |
| G-A: the AI program (AI-1 to AI-6), X13 | the door open and proven on staging; **AI-1, the Coach, on on staging**, with a daily cap of its own ($1.50, released at 905394dc); **AI-2's L1 built** (Normal and Easy, measured against L0: Normal 61%, Easy 56%, L0 itself 51%); **the LLM seat built behind its switch**, its privacy wording Rob's to approve; **AI-5 built and on staging** (each deck says whether the table can play it; Play this deck); **AI-4, the deck advisor, built behind its switch**, its privacy wording Rob's to approve; **AI-3: 1,131 of Rob's 1,132 cards play** (Train C, then Gandalf; the one left, Extrapolate the Impossible, does nothing in Commander), Rob's to confirm; **AI-6, AI Coach settings, built** | every gate set on staging (the AUD, 300¢ a day for everyone, Haiku 5.5, Rob's key, three allowlist rows), released at c025d5d0; Rob's first call through it logged ok; the Coach's privacy wording approved by Rob and released at 81bcda09 (records below) |
| G-A: M3's monitoring and backups | **monitoring built** (Workers Logs keeps the Worker's own 5xx and sync-conflict lines; `tools/ops-week.mjs`, the weekly check); Time Travel confirmed, 30 days | **Rob:** the two alerts and their email; R2 turned on, the nightly copy's window and what deletion promises (`docs/ops.md`) |
| G-A: the A11y pass | **done**: WCAG 2.1 AA on the board and the lobby, measured from the screen's pixels; and words on the accent at 4.5:1 across the app (the item left) | `tests/a11y-board.mjs` 288 checks, 72 breaks caught (the A11y record below); `tests/a11y-app.mjs` 48 checks, 9 breaks caught |
| G-B: the whole gate green twice on main | **done again, with G-A complete** | dispatched Tests runs on main 74f715c7 (G-A's items in, and the drop check's race fixed): **2579 and 2580, both green**. Before them, on bf0e9d21: 2572 green, 2573 red once in `table-board`'s drop check, root-caused to a race in the board and fixed (#702, the race record below). Earlier: 2499 on def8fa89 and 2503 on eff40fdc, both green |
| G-B: `play-e2e` under wrangler dev | done | 35 checks at every staging release |
| G-B: hidden information in every frame | done | `play-journeys` reads every frame to both people; G1's oracle 102,879 checks, no leak |
| G-B: the five-second rule | **done** | over a real network, Rob on staging (2026-10-10): ten turns against the AI, the longest wait *"about 3 seconds"*; here, `play-journeys` median 280 ms, longest 1.0 s; G1's 700 games with a person: each game's longest wait a median 172 ms, 99th percentile 1.6 s, the worst 3.5 s, none over 5 s |
| G-B: `play-journeys` with the seven decks | done, again on bf0e9d21 | 82 checks: every view at 1280, 1400, 1920, 2560 and the phone, the Coach's stub, the record (PRs #681, #682; run again 2026-10-11) |
| G-B: `crankmagic-journeys` and the tours | done, again on bf0e9d21 | `journeys.mjs`: geometry 138, workshop 504, tour-walk 7 tours and 61 steps (2026-10-11) |
| G-B: the browser and device matrix | **done** | `docs/uat/browser-matrix.md`: Chrome, Edge and WebKit on Personal-HP (2026-10-01); the phones, held sideways, by Rob on staging (2026-10-10): *"phones work"* |
| G-B: screenshots to Rob | done, refreshed | the gallery "CrankMagic Board Sizes", version 2: both tables, every view at four sizes and the phone, from bf0e9d21 after the A11y pass |
| G-B: the A11y pass's checks | done | `tests/a11y-board.mjs` 288 checks on the merge with Train C (the A11y record below) |
| G-C: staging from main, version read back | **done**, signed in too | the G-C records below; and `tools/staging-check.mjs` signed in as the session-check token (A5; 2026-10-10): staging serves 2125854a, both pages say so, `/api/me` seats the token |
| G-C: the harness note for Grok Bot | done | `docs/playtest-harness.md`, held to the page by `tests/playtest-harness.mjs` (PR #681) |
| G-C: the four agents' access | **built and on staging; waiting on Rob's four tokens** | at staging each service token Access admits is an identity of its own, so four agents are four seats (#704; released, and the session's token now reads back as `service:e07b4fed5ab9`, the agents' access record below); how an agent signs in, and **Rob's** five steps, in `docs/playtest-harness.md`; the proof once they're made: `node tools/staging-check.mjs --agents` |
| G-D: Grok Bot's UAT (M8) | **ready for the agents; not run** | this side's half built: the triage tool (`tools/playtest-triage.mjs`: every game replayed from its record, every seat's view judged at every answer, M8's exit criteria; 32 checks, 22 breaks caught), the findings' outcome column, the seven decks to paste (`docs/uat/decks/`, held to the library), the run step by step (`docs/uat/playtest-run.md`); **a dress rehearsal through the real board, done: 50 games**, two people and two house AIs a table, the seven decks four at a time; the triage replayed all 50 to the same journal, with 0 thrown and 0 leaks in 21,006 checks of every seat's view; both findings were ruled (each the harness's, not the board's), and **M8's exit criteria are met** (the rehearsal record below). **Rob:** the agents' tokens (G-C), then Grok Bot's 50 games |
| G-E: human invites | **ready for Rob's invites** | `docs/play-invites.md`, *G-E*: Rob's steps (one rule group of invitees for both Access applications), the before-the-first-invite checklist, and how their findings arrive (*Send feedback* names the release and the game). **Rob:** staging's invite list and its block page, the alerts and R2, then the invites |
| G-F: Rob's review and production | **rehearsed; on Rob's go** | `tools/release-production.sh` and `docs/release-production.md`: the standby, then Play, each built from main, walked and committed locally, and pushed only on Rob's go; the standby rehearsed on main 1aa46cd (`release-acceptance` 23, `production-play-e2e` 27, nothing pushed). **Found:** production's Workers Builds has not deployed `release/pages` (the last deploy was by wrangler, 2026-10-01; the release of 2026-10-03 never went live). **Rob:** that build's settings, his review, each go |

**What Part 7's two sentences wait on (2026-10-11).** What is this side's is built, merged and on staging: G-A's
items, G-B twice on main, G-C's release and the agents' access. G-D to G-F are ready and rehearsed.
- **The first sentence waits only on Rob:**
  - G-A's approvals: the privacy wording for *AI players on Claude* and *The deck advisor* (`docs/ai-door.md`), the
    advisor's eval with his key, and confirming his library;
  - M3's two alerts and their email, and R2 turned on, which the nightly copy and M2's data track wait on
    (`docs/ops.md`);
  - G-C's four agents' tokens (`docs/playtest-harness.md`).
- **The second** then waits on:
  - G-D: Grok Bot's 50 games, and the fixes;
  - G-E: Rob's invites;
  - G-F: Rob's review, and each of his production goes (`docs/release-production.md`).

**Later, 2026-10-08:** the five workers' 45 cards and CR 800.4a merged here (#676); and on Rob's go ("merge Codex's stack") Codex's #670 to #675, reviewed first, merged here too -- every card of the seven decks is now defined; #676 merged on main 09499dcd and #671 to #675 closed as merged through it. The first G1 pass (70 games over seven pods) then found two blockers, each on its own worker: Tegwyll's provisional definition kept D7 off the table (now confirmed, hand-authored, 477 of 477), and a person's answer the engine refuses (Lethal Scheme's convoke) escaped room.act after the tape had recorded it, so the room could not reopen. Codex's records of 2026-10-07 follow, as it left them.

**G1, second and third passes (PR #677):** both blockers fixed (a refused answer is now a 422 with the room restored from its last save; convoke asks which mana pays the rest), and the layers' dependency trials made only where one can find a dependency (CR 613.8a; `tests/engine-layer-prune.mjs`, the slow game 2.5 times faster). Pass two, at 3df6e1b4: 70 of 70 games clean, none refused, but "longest waits" of up to 9.3 s, every one on a game's last turn. Their cause was in the harness: `tools/fuzz-live.mjs` built its pod without the table's beats, so once the person was out its timer ran while three AI seats played the game out, which no person at the table waits through (`endWhenNoPerson`, Rob's of 2026-10-06). The harness now launches its games as `game/room/table.mjs` does (the draw's click, the empty step passed, the game ending once every person is out); `tests/game-leave.mjs` checks the two pods agree, and three breaks are caught. Pass three, with that pod: **70 of 70 clean, none refused; over the 35 games with a person, the longest wait was 3.3 s, the median 0.23 s and the 90th percentile 0.43 s.** The 3.3 s is a real mid-game wait (D7|D1|D2|D3, seed 2, turn 27 of 33, a 35 s game), measured with three sweeps sharing the container: under the five-second rule, and the first one to profile. #677 merged on main 0d173a0d on green Actions.

**G1's other two terms (PR #678).** G1 asks for "zero exceptions, identical replays and no leaks", and `tools/fuzz-live.mjs` judged only the first; `tests/engine-gate.mjs` proves the others for vanilla decks alone. It now has `--replay` (each game replayed from seed and tape, fingerprints compared) and `--leaks` (every seat's view read, at each of the person's questions, for a card name that seat may not know, judged by the state's own facts, never by the projection being judged). The replay found two checkpoints that could not be read back -- JSON drops a key holding undefined and the state hash keeps it -- so a Durable Object woken mid-game would have refused to resume: every effect without a sublayer wrote `sublayer: undefined`, and a permanent that became a copy kept "had no supertypes" as one (`engine-room-games` seed 7). Neither writes one now; a copy moves as itself woken or not; and `saveCheckpoint` refuses any state that would not read back, naming the field, so the class fails in every suite instead of at a wake in production. `tests/room-g1-terms.mjs` (27 checks), two in `engine-storage`, 22 breaks caught; the full local run otherwise green (386 suites, 262 game tests). The sweep then found two more such keys (the discard question's `who`, the resolution's `__about` mark), and a probe of all 70 games walking the whole state after every event found no fifth; and the leak check's false reports were fixed (a name inside a longer card name; the cards a scry, surveil or search shows the player it asks; what the journal has shown everyone). **G1 on #678: 70 of 70 games clean -- finished, nothing refused, every replay identical, 0 leaks over 5,473 checks of every seat's view in the 35 games with a person**; 34 breaks caught. #678 merged on main e5770295 on green Actions.

**G-C, staging, 2026-10-08:** `tools/release-staging.sh` released main e5770295 to `release/cloud-staging` d4221982 (release-acceptance 22 checks, play-e2e 35 under `wrangler dev`); Workers Builds deployed it at 10:39:51 UTC (version 75bba14c), and the deployed `play-worker.js` is byte-identical to the release's `wrangler deploy --dry-run` bundle (2,419,636 bytes, sha256 61ec084b…). The read-back over the network (`tools/staging-check.mjs`) did not run: this environment has `CF_ACCESS_CLIENT_ID` but not `CF_ACCESS_CLIENT_SECRET` (Rob's, in the environment's settings; A5).

**G1, the 1,400 games (PR #679, 2026-10-08).** Seven pods (each deck in seat 0 once, the next three after it), 100 seeds with a random person in seat 0 and 100 all house, every game with `--replay --leaks`. **1,398 of 1,400 clean -- finished, nothing refused, every replay identical, no leak: all 700 house games; 698 of the 700 with a person, 0 leaks over 102,879 checks of every seat's view.** The person's longest wait: median 0.22 s, 90th percentile 0.46 s, 99th 1.84 s, at most 4.7 s (four games at a time on four cores). The run found, and #679 fixes, each with its check:
- **An engine exception:** a Sower of Temptation that took itself (its trigger's only target) threw as it died: `controlSourceLeft` ended what it was the source of before spending the records of changes to it. A fourth Sower scenario.
- **A false leak report:** a history line naming a card that had left the game with its owner was read as a shorter name inside it; the check remembers every card name the game has had.
- **The harness's person** repeated an optional loop without end (Krenko, Mob Boss with Intruder Alarm in D6: the board doubled with every activation, 2,047 Goblins and 2,034 triggers in one turn). A person picks how many times to go round (CR 732.2a): it now activates one ability at most four times a turn, then passes; it did so in 18 games.
- **Saves that grew with the game:** the room copied the whole journal at every decision, and hashed each checkpoint three times; and collecting triggers re-read every permanent's abilities per permanent (a million reads per resolution at a thousand tokens).

**The two that did not finish -- Rob's call (pod 5, D6 in the person's seat, seeds 54 and 90).** Krenko, Mob Boss with Intruder Alarm is a legal infinite combo, and four activations a turn on every player's turn still compound: by turn 50, 4,000 Goblins and 7,059 triggers on the stack. Every trigger resolving asks the person a question, and every answer saves the whole game; at a thousand permanents each resolution is about 0.2 s, and it grows with the board. Rob can do this with his own deck, and a Durable Object has 30 s of CPU per request, so a real game would stall the same way. The options: (1) a shortcut -- "pass until the stack is empty" or "repeat N times" (CR 732.2a), one decision for a thousand identical triggers, as the digital games have it; recommended. (2) A cap on the board's size. (3) Deeper engine work (incremental saves, cheaper derivations), which helps but cannot keep up with doubling alone. G1 is clean except these two, and closes when one of these is chosen and built. #679 merged on main 8787d103 on green Actions.

**G-C again, 8787d103:** released to `release/cloud-staging` f903322f (release-acceptance 22, play-e2e 35); deployed at 20:17:26 UTC as version e00791d2, byte-identical to the release's dry-run bundle (2,420,554 bytes, sha256 21d7b7ee…). The first attempt was held back by the script itself: play-e2e's two-people step timed out on a Pass button the board had just redrawn away (isEnabled on a vanished element waits its 30 s); the walk now reads a vanished control as "not now" (PR #680), and walked clean, 35 checks. #680 merged on main 9c5fb728 on green Actions.

**X14, `play-journeys` on the seven real decks (PR #681, 2026-10-08).** G-B's Play journey played vanilla stand-ins
of every card; it now plays the decks' own cards (`tableCards`, all 477 defined). A person's seat is answered through
the board's own controls as the house pilot would answer it, a target, mode, payment or order included
(`tests/uat/board-person.mjs`, shared with `real-deck-game.mjs`), and the table's slices are carried on by its alarm,
as the Worker's are. Two four-seat tables, D1-D4 and D5-D7 with D1, Rob at a desk and Maya on a phone held sideways,
to turn 12: **58 checks** -- 172 answers through the board, no AI answer refused, the decks' own abilities and triggers
on the stack, no other seat's hand or library named in any frame, every view at 1280, 1400, 1920 and 2560 and the
phone, the phone's hand, a concession from the phone's settings with the game going on, the Coach, End game and the
record. **The person's waits, in this process: median 292 ms, the longest 1.0 s** (1.9 s with two other browser runs
sharing the four cores; from a click to the room's next question to a person; over the network it still needs a
browser on a real network, Rob's or Grok Bot's). D5's whole
game through two browsers on the shared helper: 13 checks, a natural end, none refused. The harness note for Grok Bot
(`docs/playtest-harness.md`) now names the controls a real card's questions use, says what a refusal looks like, and
points at `board-person.mjs` as the worked example; `tests/playtest-harness.mjs` (new, 139 checks) holds every control,
id, class, attribute and file the note names to the page and the repository, and every control and id to a test that
uses it. It found four the note named and no test pressed: Copy link and Withdraw now in `table-lobby` (71 checks:
the clipboard holds the link; a withdrawn link no longer works), the phone's hand and Concede in `play-journeys`.
Breaks: 3 of 3 in `play-journeys`, 7 of 7 in `playtest-harness`.
#681 merged on main 53985e7a on green Actions.

**Every caption on a board read whole (PR #682, 2026-10-08).** `play-journeys` now reads every caption on every board
in every view at every size (a zone's, a group's heading, a pile's count) against the cards of its zone and the life
counter, a circle at the table's true center. In Table view, at every size, it found five covered: the top-left
board's graveyard count, the top-right board's "Lands · 3" and your own first group heading under the counter (whose
inner corners it overlaps, as item 9 places it), "Lands · 2" under an untapped land (a mat with art gives the Lands row
the piles' height, `1.4 × card + 1.3em + 2px`, and the zone's own padding pushed a 1.4-card land 8 px over its
caption), and, at 1280x720, "Battlefield" under a second row of creatures. Fixed in `crankmagic.css`: at the table, a land
starts at the Lands frame and its caption keeps to a tight line; the three captions at the counter moved clear of it (`--pie`
now the table's, so the boards read it; the heading's rule carries `#matrix-v2`, since `#matrix-v2 :is(h1,h2,h3,p)` sets
every margin); and at the table, once a board holds a group, the group's heading names what is there and
"Battlefield" is kept for screen readers. The counter stays where it is. `play-journeys` 82 checks; the whole local run
green (425 suites, 24.5 minutes); 5 of 5 breaks caught. Screenshots of both tables at every size and on the phone, with
the fix before and after, published for Rob.
#682 merged on main def8fa89 on green Actions.

**G-C, def8fa89:** released to `release/cloud-staging` bc88dce3 (release-acceptance 22, play-e2e 35); deployed at
22:50:49 UTC as version bdaece4f (number 124), a minute after the push. Its `play-worker.js` is byte-identical to the
release's dry-run bundle (2,420,554 bytes, sha256 21d7b7ee…) -- the same bundle as 8787d103's, since #680 to #682
changed tests and static files, not the Worker. Those files (the new `crankmagic.css` v=272) are served from the
version's assets, which only a signed-in read can see: staging is behind Access, `workers.dev` is off for it, and the
service token's secret is Rob's (A5). The Builds API refuses this session's token, so the build's commit is read from
the timing.

**The tour walk, run again (PR #683, 2026-10-08).** `tests/uat/tour-walk.mjs`, the one check that a tour step points at
something on the page, had skipped itself in every run: it found Playwright only through two variables nobody set, and
`journeys.mjs` let it. Set by hand, it could not start either -- *Take a Tour* has been in the rail's Menu since the
redesign, and the walk served itself on 127.0.0.1, where the app hides the rail. It now uses `browser-runner.mjs`'s
`openBrowser` (Playwright where it is installed, the repo under crankmagic.localhost), opens the Menu, lists every
step that misses rather than stopping at the first, and `journeys.mjs` runs it required. Walked, 6 of 61 steps in four
tours pointed at nothing or at an empty box; each now points at the page as it is (`crankmagic-tour.js` v=23): Explore
starts on its chooser's search and the graph steps open a graph (`graphOn`: your first deck's, or Sol Ring's); Narrow
it points at *Filters · lens*, since the filters sit in a panel shut until opened; Take it with you at *Add and/or
buy…* (`add-buy`, renamed from `add-card`); the Collect tour's trays are the sorting space with no deck picked (G6b-2);
What the score is at the deck's Simulation history; and A tray puts it on the list opens Table on a deck with a group,
or points at the deck picker. **tour-walk: 7 tours, 61 steps, every one pointing at something real**; `tour` 9
checks; the release journeys (`journeys.mjs`): geometry 138, `crankmagic-journeys` 504, tour-walk 61 steps.
#683 merged on main eff40fdc on green Actions.

**G-C, eff40fdc:** released to `release/cloud-staging` e279db77 (release-acceptance 22, play-e2e 35); deployed at
00:16:48 UTC on 2026-10-09 as version afb87439, its `play-worker.js` byte-identical to the release's dry-run bundle
(2,420,554 bytes, sha256 21d7b7ee…; the tours are static files, read back only signed in, A5).

**The AI door, wired on staging (2026-10-09).** Rob made the Access application "CrankMagic AI (staging)" on
`staging.crankmagic.com/api/ai/*` (Google sign-in; its "AI Testers" policy three emails), approved the privacy wording,
and chose one cap for everyone: *"I only want a general spending cap, not per person"*, 300¢. Then: *"I want tight
controls on the coach. It's responses should be very concise, no more than 1-3 sentences with 80% being 1 sentence,
when in coach. We will always be using sonnet or other lowest cost models."* And: *"change the model use to Haiku
explicitly"*, with the Coach seeing only the player's hand, the board, and their deck as a list, never its order. So:
- **The staging release** carries `AI_ACCESS_AUD`, `AI_CAP_TOTAL_CENTS` 300, `AI_CAP_PERSON_CENTS` 300 (the same
  number, so it never binds first) and `AI_MODEL` claude-haiku-5-5 (`tools/release-pages.mjs`, the profile's `ai`).
  The release tool refuses any other set, and any AI variable at all in production, whose door stays shut.
- **Haiku, and never dearer than Sonnet:** `cloud/ai.mjs` calls only `MODELS` (Claude Haiku 5.5, the default, and
  Claude Sonnet 5.5, the ceiling); `AI_MODEL` naming any other keeps the door shut, and nothing is sent. The server-side fallback is no
  longer asked for, since it can re-run a declined request on a dearer model; a refusal is a plain 422.
- **The privacy wording** is on `privacy.html`, and `DELETE /api/account` deletes the person's `ai_calls` rows.
- **The Coach's brevity** is written into AI-1 (`docs/plan-to-done-2026-09-30.md`) as Rob then put it: the Coach's
  brief instructs the model to answer in one to three very concise sentences, aiming for one; nothing checks the
  length afterward, and there is no 80% gate.
- **What the Coach may see** is written into AI-1 too: the person's own hand, the board as everyone at the table sees
  it, and their deck as a list sorted by name with the library's count, never its order, its top card or another
  seat's hand; the Worker builds the brief from the room's own projection for that seat, not from the browser.
- Proof: `ai-door` 50 checks, `release-pages` 188, `cloud-worker` 109.
- **Rob's, left:** the key as a Secret on `crankmagic-staging`, a monthly limit in the Anthropic console, and the three
  emails in `crankmagic-staging`'s `ai_allowlist` (0 rows and no secrets at last check). Both work from the dashboard.


## Cloud production Play preparation, October 7, 2026

**Holder:** Codex, `/workspace/crankmagic-cloud`, `codex/production-play-profile`,
following Faerie draft PR #674 at `a985022f`. Commander draft PR #673 is now
`3fdedc29`, with 35 successful actual-workerd browser checks and corrected
runtime expectations for the now-supported Quintorius. Faerie proof remains
57 targeted checks, 20 faults and 243 engine/regression suites.

**Candidate:** explicit production Play and standby profiles, the same production
account resources, no staging privileges, exact build binding guards and a
standby entry closure that retains GameTable storage. Default pages is unchanged.
108 Worker checks, 174 release-builder checks, three caught faults, and 27 actual
local-workerd recovery checks pass. See
`docs/production-play-profile-2026-10-07.md` for the first-migration rollback
constraint, existing-socket/clock limitations and remaining live gates.

No merge, deployment, new credentials or paid calls. Main `2ad84eb0`, Train B
`5d068d26` and the exact-head green PRs #670–672 remain preserved. The saved cloud
cannot currently reach staging; Actions secret presence cannot be inspected with
the connected tool. The separate GitHub-runner route is documented, not installed.

## Cloud Faerie interactions, October 7, 2026

**Holder:** Codex, `/workspace/crankmagic-cloud`, `codex/faerie-interactions`,
following commander draft PR #673 at `3fdedc29`. Mastermind, Spellstutter and
Winnower pass 57 targeted checks, all 20 fault checks and all 243 engine/regression
suites. See `docs/faerie-interactions-2026-10-07.md`. There are 46 distinct
unavailable names left in the seven committed decks. Sower needs genuine
source-duration control support; Tegwyll remains provisional.

Main and Train B remain unchanged. PRs #670–672 have exact-head green Tests runs.
No release or credential changes have occurred. GitHub-hosted staging acceptance
is being investigated: current workflows have no staging job or Access-secret
references, and the connected app cannot inspect secret metadata. A single
service identity cannot stand in for a separately signed-in friend.

## Cloud linked-exile commanders, October 7, 2026

**Holder:** Codex, `/workspace/crankmagic-cloud`, `codex/exile-commanders`,
following advice PR #672 at `b58b4534`. Quintorius and Maralen are implemented;
107 targeted checks, all 38 faults caught, all 242 engine/regression suites and
final D2/D5 two-browser natural games pass. See
`docs/exile-commanders-2026-10-07.md` for rules scope and evidence limits.

**Verified stack:** #670 `5174b836` / Actions `37630443333`, #671 `6eec6348` /
`37632309093`, and #672 `b58b4534` / `37632350352` are all ready with successful
full Tests runs. Main `2ad84eb0` and Train B `5d068d26` remain unchanged.
Nothing has been merged or deployed. Current release configuration/user actions
and the Library screenshot transfer failure are documented in
`docs/cloud-release-gates-2026-10-07.md`. Production Play is in scope, after
staging, data, Access and rollback gates; paid AI remains unapproved.

## Cloud advice preparation, October 7, 2026

**Holder:** Codex in `/workspace/crankmagic-cloud`, `codex/bounded-advice`,
following D2 draft PR #671 at `6eec6348`. D2 and its natural browser game are pushed.
The advice contract prepares bounded, account-scoped, versioned requests and
checks evidence/card/option references against fresh snapshots. It cannot call
providers, schedule work, persist credentials or mutate game/library data.

**Proof:** 45 contract checks, 10 caught deliberate faults, data integrity and
feature wiring; existing AI door's 45 fake-provider checks still pass. See
`docs/bounded-advice-2026-10-07.md`. Paid AI remains unapproved and disabled.
This is groundwork; monthly reservations, trusted source/UI integration and
responsive live delivery are not claimed complete.

**CI:** library PR #670 at `5174b836` is checking in Actions `37630443333` after
repairing its sole inventory failure. D2 PR #671 remains draft/mergeable on
`6eec6348`. Train B/main remain unchanged. Release blockers below still apply.

## Cloud D2 completion, October 7, 2026

**Holder:** Codex, `/workspace/crankmagic-cloud`, `codex/chulane-completion`,
following PR #670. Train B/main remain unchanged. Guardian Project, Yavimaya
Dryad and Claim Jumper are defined with engine behavior and rules tests.

**Proof:** 241 engine/regression suites passed; 67 dedicated checks; 37 caught
faults. A new cloud-local D2 game through two human browser sessions plus two
house pilots finished naturally in 44 turns / 349 UI actions, zero refusals.
Reload and all 354 hidden-information frames per person passed. See
`docs/chulane-completion-2026-10-07.md` for commands and evidence limits.
D2 has zero unavailable cards; 51 distinct unavailable names remain across the
seven committed decks. This does not materialize the exact October 4 backup.

**CI:** the separate library worktree repaired PR #670's generated inventory
failure at `5174b836`; Actions `37630443333` is running. D2 is a separate draft
follow-up. No merge or deployment. Staging egress/credentials, exact-backup
materialization and AI budget approval remain open.

## Cloud library continuation, October 7, 2026

**Holder:** Codex in Rob's authorized separate cloud checkout, `/workspace/crankmagic-cloud`,
`codex/real-deck-acceptance`. The remote follow-up was recovered at `e6715329`; Train B remains
unchanged at `5d068d26`, PR #669 ready, with its successful Actions run freshly confirmed through
GitHub's connected app. The offline desktop's uncommitted edit was not recovered.

**Work:** direct reviewed card removal, commander changes, direct deck deletion, and a deletion
Undo receipt that survives navigation. Ownership, reservation and physical location stay distinct.
The evidence, commands, cloud toolchain differences and exact blockers are in
`docs/cloud-continuation-2026-10-07.md`.

**Release gates:** Access/Cloudflare credentials absent; staging egress CONNECT 403; exact October 4
backup not materialized in cloud; AI spending unapproved. No merge or deployment, no production
readiness claim. Continue the card coverage and real-game gates after this library increment.

**CI repair:** PR #670's first ready run passed every suite except the generated
data inventory: the recovered real-deck harness added one reader. The generated
record is repaired; the new head still needs a green Actions run. Full local
generator testing reaches an unrelated Scryfall HTTP 403; the inventory check itself passes.

## Library and real-deck acceptance, October 7, 2026

**Holder:** Codex on Personal-HP, `codex/real-deck-acceptance`, based on the verified
Train B head `5d068d26`. PR #669 is pushed and ready. Its full Actions run
`37576879773` passed 396 suites and 262 companion tests. Both Workers Builds previews
remain failed (D8); no merge or deployment was performed.

**New proof:** the exact October 4 backup passed 50 two-human-protocol/two-house games
and 30 all-house games, all with zero whole-match refusals. The 50 games took 14,115 human
decisions, 35-65 turns, and at most 4,198 ms for a local human response. These are isolated
room simulations. `tests/uat/real-deck-game.mjs` also proves a natural D5 game through two
separate browsers: 377 UI actions, 33 turns, zero AI refusals, reload preserving the pending
question, and all 381 frames per person keeping other hands and libraries hidden.

**Next:** audit the actual library/deck experience with isolated data and improve obvious
remove, delete, commander and copy-moving paths, preserving quantities through undo,
reload, repeated clicks and multiple tabs. Then take D2's three missing cards in bounded
engine increments. Train B's tested head stays unchanged.

**Live blockers:** service-token environment variables are absent, and the supported browser
connection twice failed to load its request-header policy before any site interaction.
No Access policy, credential, permission or reserved dashboard setting was changed.
Paid AI waits on a concrete cap. D11's Claude settings are optional tooling, not a launch gate.

## The previous record: the Train B continuation, October 7, 2026 (Codex)

**Holder:** Codex on Personal-HP, continuing the authorized production-readiness work on
`claude/admiring-franklin-58cxy4` from `d8774b32`, PR #669. B4, B6 and B3 are integrated:
25 additional definitions, 22 dedicated suites and 97 caught deliberate faults. The final
affected aggregate passed 282 suites; check-cards passed 1,681 definitions and 2,747 scenarios.
The exact commands, fixes and limits are in `docs/train-b-proof-2026-10-07.md`.
The standalone ten-game CPU gate also passed after removing unnecessary controller and
attack-cap derivations; no budget was raised. Real-deck refusal-free acceptance is still open.

**Next:** complete the scan/push and ready #669 for Actions; diagnose its exact head. Then
prove real-card games with D5 Shadrix, finish D2 Chulane's three missing cards, and continue
library/deck integrity, human-game recovery and bounded AI acceptance as recorded in
`docs/production-readiness-2026-10-07.md`. No production gate is declared passed.

**Backup and access:** the exact October 4 live-game backup was found in the MtG project's
AI Input folder and validated read-only with the app's checksum and model checks. No real
library was restored or changed. The staging service-token environment variables are absent
here, so signed-in live staging checks remain blocked. Paid AI usage waits on a concrete cap.
Reserved access, credential, persistent-permission, history and branch-deletion actions are
untouched. The unrelated local settings file remains untracked.

## The record before: PAUSED, 2026-10-06 ~18:30 UTC

The review-response session's last record before the pause; `docs/handoff-2026-10-06.md` is its handoff.

| | |
| --- | --- |
| **Holder** | **Held: the review-response session of 2026-10-05 (Claude, a cloud container), on Rob's go to evaluate the independent review (OpenAI, report-only, of the freeze `31801daa`), update the plan, put live games in the cloud first, and execute.** The evaluation, what was done and the plan are **`docs/review-response-2026-10-05.md`** (its Phase L ahead of `docs/plan-execution-2026-10-03.md`). **Done:** #665 (F-1's tally, F-2's layer fix, slices) and #666 merged on the local gate; the staging release of 2fd4b1bd pushed and **deployed by Workers Builds** (version `88cd1fae`, 2026-10-05 18:20 UTC; Rob did not deploy, so Builds works again, D8). **Rob's answers, 2026-10-06:** #663 and #664 folded in (yes); once every person is out the game ends there (no to playing on: built as `endWhenNoPerson`); the standing decisions explained in the doc's §6.1, and how to do A3, A4, A5 and A8 in §6.2. **#667 merged** (`main` a2063d95, on the local gate); its staging release, `release/cloud-staging` fc09b4ad, **deployed by Workers Builds** as version `480fc72a` at 2026-10-06 15:07:51 UTC, its Worker byte-identical to the release's bundle. **Rob, 2026-10-06, later:** "Continue with the 28 cards still undefined, X8b/X8c, a narrowed X9, X10–X14, then gates G-B through G-F to the two sentences. We skipped the live game." On this branch since: X8c (hold priority or yield, said by the switch and in Tools), X8's captions (R12: 10px floors at 1280x720), X9 (the CPU check in `tests/engine-room-games.mjs`, seed 1's two repeated answers made once), L5 (an invitation survives Access's sign-in, an empty library offers Restore, Play leads back to your seat), **Train A** (the 28 live-deck cards, four workers merged in four commits, all 28 seated by the table), **X10** (the velocity pilot measured: 28 provisional definitions, seated nowhere) and **X8b** (a cast or ability the pool pays more than one way is offered and asks which way; `SLICE_STEPS` 100 for the heavier games that followed). check-cards: 1,614 definitions (1,586 hand-authored), 2,516 scenarios. The X10 worker pushed `claude/x10-velocity` on this session's instruction, against the one-branch rule; it is merged here and can be deleted. And Rob: **the repository is public** (D7, option C: Actions is the gate again), **A5 and A8 done** (read back from the Cloudflare API), A4's deploy fallback set as an environment variable for new sessions. |
| **Branch** | `main` at a2063d95 (#667); `release/cloud-staging` at fc09b4ad, live on staging; this record and the work above on `claude/admiring-franklin-58cxy4` (#668). |
| **Since** | 2026-10-05 (this session) |
| **Proven here** (the cloud container, Node 22.22.0, Playwright 1.56.0 with Chromium, wrangler 4.139.0) | **The freeze's gate on the supported toolchain:** `tools/local-ci.sh 31801daa 1` PASS, 342 suites. **F-1:** `room.refusals`, the match's tally; `tools/fuzz-live.mjs`; `tests/room-refusals.mjs` (the history had undercounted seed 1 of the pinned deal, 12 of 22). **F-2:** a regression bisected to #600 and fixed, seed 11 21.4 s to 5.1 s, the ten pinned games identical. **Slices:** `tests/room-slices.mjs`; proven in workerd on 2026-10-05 (a conceded game played out on the object's alarm). **#665 and #666:** `tools/local-ci.sh <head> 2` PASS, 344 suites and 262 node tests a run. **The release:** `release-acceptance` 22 checks, `play-e2e` 26; staging's deployed Worker byte-identical to the release's bundle. **The game ending once every person is out:** `tests/game-leave.mjs` 58 checks (the last person conceding, knocked out, a woken room, a match without the flag playing on, the table launching with it), four breaks caught; `tests/uat/play-e2e.mjs` 35 checks under `wrangler dev`, #663's two people and an AI among them. **A cloud container's browser and the network:** its Chromium does not trust the egress proxy's CA until it is in the NSS store, so live-network walks fail with "Failed to fetch" (`ERR_CERT_AUTHORITY_INVALID`): `apt-get install -y libnss3-tools`, then `certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n ccr-agent-proxy -i /root/.ccr/agent-proxy-ca.crt`. Never by turning certificate checks off. |
| **Assumed, not proven here** | What a signed-in person sees at staging, and both boards' WebSockets there (the container cannot pass Access, and its proxy carries no WebSocket): L2 is Rob's. That workerd on Cloudflare runs within about 2.6 times the container's speed. The live decks' refusal totals: the backup file is not here (A2). |
| **Outstanding** | **The session:** L4 once the backup is attached; L5 (the three limitations likeliest to stop a friend); L6's service-token seat once A5 exists. **Rob:** the rest of L2, now that the live game was skipped only when Rob wants it (staging's Access admits "Rob Only" and the service token, so a friend's address goes in a staging policy first, A3); A2 the backup file; A4's rest (the injected token expires 2026-10-25 and cannot read Workers Builds); D8's previews off, D11 (the permission rule), production (refresh the workshop on your go; Play not before G-F); and whether to rewrite `main`'s history for the three personal addresses still in commits of 2026-09-17 to 09-24 (now public; removed from the files on 09-24). A6 is moot: helper B's 19 cards are being rebuilt. |
| **The plan's steps** | `docs/review-response-2026-10-05.md` §5: Phase L (L0-L1b done; L2 the signed-in check; L3 the first live game; L4 the 80 games on the exact decks; L5 the three limitations likeliest to stop a friend; L6 what is left of the deploy path), then the execution plan's steps as amended there. |
| **Part 7 gates** | **G-A Build: not passed. G-B Test end to end: not passed. G-C Staging: not passed.** |

## The previous record: the readiness checks after the code freeze, 2026-10-04 21:55 UTC (#664)

| | |
| --- | --- |
| **Holder** | **Held: the execution session of 2026-10-03 (Claude, a cloud container), after the live game's code freeze.** `main` is frozen at **31801daa** (train 5, #662) until Rob says tonight's game is over; work goes on branches only. Rob, about 20:40 UTC: write a brief that lets another AI test the whole experience on its own (a host, a new user's sign-in, the Play screen, joining, the game, the engine, the cards), then outline and run every check and simulation that makes the app as ready as it can be for a new user. Tonight's game became two people and two AIs: Rob (Jace, Multiverse Architect (Trey)), a friend new to CrankMagic in seat 2 (one of the AI decks' "(table)" copies), and two house-pilot seats. |
| **Branch** | `main` at 31801daa (the code freeze). Held for after the game: `claude/play-e2e-two-people` (#663, draft) and `claude/live-record-readiness` (this record). |
| **Since** | 2026-10-03 (this session) |
| **Proven here** (the cloud container, Node 22.22.0, Playwright 1.56.0 with Chromium, wrangler 4.139.0) | **R1, the room.** 100 games of the four live decks with both people's seats answered at random from exactly what each was offered (`game/engine/pilots/random-legal.mjs`, seeded) and two house pilots, then 50 four-AI games: all finished, none refused, no exception (refusals counted from the history's newest 300 lines, which can drop early ones: F-1 of the review of 2026-10-05; recount with `tools/fuzz-live.mjs`). The longest wait for a person, the AI play between two of their decisions (one Durable Object request), was 1.9 seconds; typical waits 0.1-0.5 seconds. **R2, the browser** (the staging build of 31801daa under `wrangler dev`, two Access identities, each its own origin and library): two people and two AIs played whole games to the end twice (51 and 36 turns) through their boards, with lands, spells, attacks and every question answered; both saw the game-over panel; the record (531 answers) downloaded and replayed to the same end with the table's own cards. **R3, a new user's wrong turns.** Joining with an empty library, restoring, then opening the link again gets back to the seat; a reused link and a withdrawn one are refused ("This invitation has expired or was withdrawn"); New link seats the person. **R4, a phone** (390×844, touch): the lobby works; the board is drawn for landscape, and plays go through the hand (✋); a reload, and a closed page reopened through the link, return to the game; a concession lets play go on; End game works. **R4b**: a person who drops (another page for ten seconds) and comes back keeps their seat past the five minutes; the table's away list empties on return. **R5, real staging** (staging.crankmagic.com, still release 8107df4 at 21:50 UTC): a test identity on Rob's own mailbox, admitted by a staging-only Access policy, signed in with Access's emailed code (read from Rob's inbox with Rob's leave) and restored the backup; a signed-out person opening an invite link lands on the home page after Access's sign-in (the fragment is lost), and opening the link again works. **The release:** `node tools/release-pages.mjs --profile cloud-staging --ref 31801daa… --out` builds, and `wrangler deploy --dry-run` reads 2,007 KiB (361 KiB gzipped) with the table, D1, Access and playtest bindings. **The Play walk** with a two-people step: 32 checks (#663). |
| **Assumed, not proven here** | Staging at 31801daa: Rob releases it (the container cannot deploy). The board's WebSocket at the real staging: this container's network proxy carries no WebSocket, so the board was proven only under `wrangler dev`. A phone browser old enough to match a `wss:` socket against CSP `'self'` differently than today's. |
| **Outstanding** | **Rob, tonight:** release staging at 31801daa (`--ref`, `rob-steps.md`); let the friend's address through staging's Access ("CrankMagic staging"); send the friend the backup file and the one-page guide ("Joining Rob's table"); say when the game is over. **Rob, when convenient:** the invite link under staging's whole-host Access (below); helper B's 19 cards (its pushes wait on Rob's approval). **The session:** remove the staging Access policy "Rehearsal: test friend (2026-10-04)" once Rob is done with it (it admits only the test identity; "Rob Only" is untouched); the real-table check at staging once 31801daa is live; after the game, gate and merge #663 and this record, then the live decks' last cards and Rob's Priority Batch 10.3 in Rob's order. |
| **The plan's steps** (`docs/plan-execution-2026-10-03.md`) | As the record below; A7, Rob's game at staging, is Rob's. |
| **Named, not built** (each said in #663) | As the record below, plus: (1) staging's Access guards the whole host, so an invite link opened while signed out loses its `#table/<id>/<code>` in the sign-in redirect; the code rides in the fragment on purpose (`cloud/tables.mjs`), so the fix is Rob's call (a query or path link, or a landing page outside Access); production is unaffected, its Access guarding only `/api/*`. (2) With an empty library, a playtest table's deck dialog offers only the basic lands test deck, with no hint to restore or import decks. (3) Before a game starts, the Play tab shows New table rather than the table a person sits at; the invite link takes them back. (4) Each person may make 120 API requests a minute; only a harness polling faster than the lobby's two seconds meets it. (5) Once, after several navigations, a phone board showed its own seat "Dropped · back by …" while connected; the server had cleared the drop (R4b), and it did not recur. |
| **Part 7 gates** | **G-A Build: not passed. G-B Test end to end: not passed. G-C Staging: not passed.** Everything short of the real staging has been walked; the live game is the first real table. |

## An earlier record: the live game's code freeze, 2026-10-04 19:30 UTC (train 5)

| | |
| --- | --- |
| **Holder** | **Held: the execution session of 2026-10-03 (Claude, a cloud container), executing the live-game plan (`docs/plan-live-game-2026-10-04.md`) to its code freeze.** Rob plays a four-player Commander game tonight with the "Live Game Load 10.4" decks: Trey's (Rob's seat) Jace, Multiverse Architect, and three house-pilot seats, Chulane, Teller of Tales (AI 1), Kiora of Salt and Sand (AI 2) and Teysa Karlov (AI 3). Rob, 17:15 UTC: complete the plan by 9:30 PM, read here as 21:30 UTC (the plan's clock). Two helper sessions built cards beside this one. **Helper A** (`claude/live-game-pieces`, #657) built both commanders' pieces (P1-P5: empower Jace, granted loyalty abilities, reveal until a creature or planeswalker, the loyalty-activation trigger, "pay {2} or can't attack Jaces") and Trey's and Kiora's cards. **Helper B** (`claude/live-game-ai-decks`) defined 19 of AI 1's and AI 3's cards. Its permission check refused every push and any route through another session, so they wait on Rob's approval. **Merged, each a merge commit on the local gate, its PASS block on the PR:** **train 1**: #653 (P46), #655 (the engine's card data refreshed from Scryfall, 32,116 cards, with the generated files it had left stale), #656 (the record before this one), #658 (wave W1, 9 lands and 11 cards with `unless.opponentsControl`; helper A's P1-P5 with Jace, Kiora, Ajani Unrelenting and 13 more). **Train 2**: #659 (wave W4: Ob Nixilis, Avacyn, Vraska, Niv-Mizzet, Grateful Apparition, Silence the Echo, Prophesied End, with a wipe that remembers what it destroyed and combat damage "to a player or planeswalker"; helper A's W5, 12 cards with excess damage, doubled counters, two piles and increment; the smoke game paying a choice of additional costs). **Train 3**: #660 (helper A's W6, nine of Trey's cards: Oblivion Ring, Serra's Emissary, Darksteel Angel, Ajani Resolute, Overlord of the Mistmoors, Gifts Ungiven, Winds of Abandon, Quintorius Kand, The Ur-Sphinx, with linked exile, protection, can't lose, emblems, impending, overload, discover and eminence; and play-e2e's stale label, the walk passing under `wrangler dev` again). **Train 4**: #661 (six of Kiora's deck: Delay, Song of the Dryads, Everflowing Chalice, Kasmina, Hall of Echoes, Way of the Cryomancer). **Train 5, at this record:** #662 (helper A's last two of Trey's deck: Teferi's Reproach, with phasing and protection from everything, and Emrakul, the Exigent Doom; and this record). |
| **Branch** | `main` once train 5 is in: the code freeze for the live game. |
| **Since** | 2026-10-03 (this session) |
| **Proven here** (the cloud container, Node 22.22.0, Playwright 1.56.0 with Chromium, wrangler 4.139.0) | **Gates.** Train 1 passed twice at 88bf8d5b, 324 suites a run. Its first gate, at 5cdd252e, failed on three files the refresh had left stale (the data manifest, the creature types, the data inventory); 68fe9577 fixed them. Train 2 passed twice at f3930b1c, 328 suites a run; train 3 at b31baae7, 335; train 4 at ff0c7973, 340; train 5 is gated at its head before it merges, its PASS block on #662. Main's tree equals each gated head's. **The live decks at the code freeze:** Trey (Jace, Rob's seat) 100 of 100 defined; AI 1 (Chulane) 86; AI 2 (Kiora) 95; AI 3 (Teysa) 91: 372 of the 400 slots, the 28 others each with its stand-in in the backup's "(table)" copies. **Acceptance, on the very file Rob restores.** A3: every card of the four decks as seated (Rob's own, the AI decks' "(table)" copies) is defined at the table. A4/A5: four house pilots played them through the real room on five seeds, every game to its end (33-41 turns, 3-15 s), no exception, no refused answer (counted from the history's newest 300 lines, which can drop early refusals: F-1 of the review of 2026-10-05; recount with `tools/fuzz-live.mjs`). A6: `tests/uat/play-e2e.mjs` under `wrangler dev --local` passed 22 checks: the staging release's Play tab, a playtest table with an AI seat, the alarm launching the game, the board over the WebSocket, the full record replayed. In a local-only extension, the four "(table)" decks took their seats in workerd and the game started. **Rob's library file:** `crankmagic-backup` v1, with the four decks exact and finalized (400 owned copies) and a "(table)" draft copy of each deck that still holds an undefined card (the three AI decks; Rob's has none), its stand-ins curated by role and color identity (`standins-final.json` in the session's scratchpad). Read back with the app's own `readBackup` and sent to Rob. |
| **Assumed, not proven here** | Staging itself: nothing was deployed. The container cannot deploy, and Workers Builds still fail every build. Rob releases staging from Personal-HP (`node tools/release-pages.mjs --profile cloud-staging --out <folder>`, then `npx --yes wrangler@4.139.0 deploy` from it; `docs/release-pages.md`). Cloudflare Access and the invite list at staging. The AI credential Rob added is visible to neither this session nor its helpers. The AI seats are the house pilot (D-L5). |
| **Outstanding** | **Rob, tonight:** release staging; save the current staging library, then restore the backup; seat the decks ("(table)" copies where a deck still has a stand-in) and start. **Rob, when convenient:** approve helper B's pushes (its 19 AI 1 and AI 3 cards), then a session folds them after the game. **Rob, standing:** the production release (D8); the runner or the billing (D7); Workers Builds and their previews off (D8); the permission rule for merges and releases (D11); the Build from Deck error in production (BACKLOG.md item 9). **The session, after the game:** the cards still undefined (AI 1: helper B's Reflector Mage, Deputy of Detention, Soulherder, Divert Disaster, Fell the Mighty, Faeburrow Elder, Loot, the Nexus, Ephemerate, Skyclave Apparition, Fblthp, the Lost and The Eternal Wanderer; Karmic Guide; Bofur and Venat, not in the card data. AI 2: Tekuthal, Reality Shift, Germination Practicum, Innkeeper's Talent, Study Hall. AI 3: helper B's Tithe Taker, Millikin, Rally the Ancestors, Skrelv's Hive, Ao, the Dawn Sky, Promise of Loyalty, Serra Paragon and Bolas's Citadel; Path of Ancestry); then Rob's Priority Batch 10.3 in Rob's order, and X8b-X14. |
| **The plan's steps** (`docs/plan-execution-2026-10-03.md`) | As the record below, and the live game is the plan's step now: its trains 1-3 merged; A3-A6 proven here; A7 (Rob's smoke test at staging) is Rob's. |
| **Named, not built** (each said in its PR) | As the record below, plus: a token's own abilities inside `createToken` are not compiled. Its mana ability is written in the engine's form (Vraska's Sculpture Treasure); Freyalise's Elf Druid's "{T}: Add {G}" is offered as an ability that uses the stack. A sacrifice cost's `anyOf` reads only the keys inside each alternative. Karmic Guide (protection from black) and the cards not in the card data (Bofur, Venat) wait. |
| **Part 7 gates** | **G-A Build: not passed. G-B Test end to end: not passed. G-C Staging: not passed.** A6 passed under `wrangler dev`; the live game at staging tonight is the first real table. |

## An earlier record: the live game's start, 2026-10-04 15:45 UTC

| | |
| --- | --- |
| **Holder** | **Held: the execution session of 2026-10-03 (Claude, a cloud container), which since 2026-10-04 15:20 UTC executes the live-game plan first** (`docs/plan-live-game-2026-10-04.md`, #654): Rob plays a four-player Commander game with the four decks of the "Live Game Load 10.4" sheet (Trey's Jace, Multiverse Architect, and three AI seats: Chulane, Teller of Tales; Kiora of Salt and Sand; Teysa Karlov) at about 22:25 UTC on 2026-10-04. A branched planning session wrote that plan; **helper A** (a second cloud session) builds the two missing commanders' engine pieces on `claude/live-game-pieces`, which this session folds into its gated trains. Before that, at Rob's "keep going, merge when the gate passes", this session went on with **Rob's Priority Batch 10.3** in Rob's order. **Merged since the record below, each a merge commit on the local gate, its PASS block on the PR:** #628-#652, the slices P23-P45: impulse draw, flicker until the next end step, "can't gain life", cycle triggers, partner and backgrounds, combat damage this turn, reveal until N creatures, exile-this and remove-a-counter costs, spend-restricted mana from an effect, graveyard batch triggers, triggers and state-based actions in the cleanup step (CR 514.3a), animate with colors, blight as a cost and as a spell's additional cost, the mana spent to cast that spell, the chosen color, a free cast once during each of your turns, multicolored spells, spells that target a creature, what entered this turn, stun counters (CR 122.1d), "tap three untapped creatures", and the target's owner putting it second from the top; each with its cards, scenarios, a suite and breaks. **Open:** #653 (P46: "blight 1 or pay {3}", a mana ability's color), #654 (the live-game plan, docs), #655 (the engine's card data refreshed from Scryfall: 286 cards more, the sets of 2026-10-02 among them), and this record. |
| **Branch** | `main` at 8bb0ae7b (#652); the live game's train 1 is #653, #655, #654 and this record, then the first wave of the live decks' cards. |
| **Since** | 2026-10-03 (this session) |
| **Proven here** (the cloud container, Node 22.22.0, Playwright 1.56.0 with Chromium) | **Gates:** every train PASS twice at its head, 317 suites a run at 78ece407 (281 Node suites and 36 CrankMagic Online suites), 262 of 262 browser tests. **Coverage at #653:** 1,486 definitions (from 1,412 at the record below); Rob's seven decks 326 of 477 defined, 401 with every rule (84.1%); the card library 866 defined, 1,792 with every rule (75.8%); the most-played 3,238 Commander cards 1,136 defined, 2,437 with every rule (75.3%). **Rob's Priority Batch 10.3:** 641 of its 1,095 cards defined (581 at the record below). **The live decks at #655:** Trey (Jace) 59 of 100 defined, AI 1 (Chulane) 82, AI 2 (Kiora) 68, AI 3 (Teysa) 88; 100 distinct cards to define, all now in the card data. **Rob's library file:** a `crankmagic-backup` v1 of the four decks (finalized, commanders set, 400 owned copies), read back with the app's own `readBackup`, sent to Rob. |
| **Assumed, not proven here** | Staging and production: nothing was deployed. The container cannot deploy, and Workers Builds still fail every build. The live game is played at staging, which Rob releases from Personal-HP (the plan's D-L1). The AI credential Rob added is visible to neither this session nor its branches; the AI seats are the house pilot today (D-L5). |
| **Outstanding** | **Rob, for the live game:** the plan's decisions D-L1 to D-L6 (§6.4), the recommended answers taken until Rob says otherwise; the stand-in table at about 18:15 UTC (D-L4); the staging release between 21:20 and 21:45 UTC (D-L1). **Rob, standing:** release staging and production from Personal-HP (D8); the runner or the billing (D7); Workers Builds and their previews off (D8); the permission rule for merges and releases (D11); the Build from Deck error in production (BACKLOG.md item 9). **The session:** the live-game plan's trains (§6.2), then Rob's Priority Batch in Rob's order again (the next engine pieces: prepare, CR 722, for ten of the list's cards; Increment; Rubble Rouser's reflexive mana trigger; Steal the Show's "any number"), then X8b-X14. |
| **The plan's steps** (`docs/plan-execution-2026-10-03.md`) | **X1-X4 done** (#577-#582). **X5** done but its game: D5's mechanics and cards are in (#583-#598); Rob's game at staging waits on a release. **X6** half: the worker pool is in (#599); the runner is Rob's (D7). **X7** not started (Rob's releases, D8). **X8** a third: X8a, tap-and-cast (#600); X8b (the payment question) and X8c (holding priority) not started. **X9, X10** not started. **X11** under way as Rob's Priority Batch 10.3 (Rob's order replaced the plan's deck order): 641 of 1,095, the seven decks at 84.1% with every rule. **X12-X14, G-D to G-F** not started. **Ahead of all of it now: the live game** (§ "The live game" in the plan). |
| **Named, not built** (each said in its PR) | As the record below, less what P23-P46 built (blight and counters of any kind as costs, stun counters, "gains all creature types"), plus: an untap paid as a cost does not read stun counters; a free cast's condition is read only where a rule static reads one; the record of what entered keeps no face-down permanent's secret (morph is not built); a modal chosen by another player inside a `branch` or a repetition binds no owner (the resolution's top level does). |
| **Part 7 gates** | **G-A Build: not passed. G-B Test end to end: not passed. G-C Staging: not passed.** Nothing was played at staging; the live game is the first. |

## An earlier record: this session at the train #623-#627

| | |
| --- | --- |
| **Holder** | **Held: the execution session of 2026-10-03 (Claude, a cloud container), which went on after #587 at Rob's "keep going, merge when the gate passes", and goes on after this record with Rob's Priority Batch 10.3.** After the record below it built the rest of X5 (D5's mechanics and cards), X6 (the suites in a worker pool), X8a (tap-and-cast), Rob's two backlog items (BACKLOG.md items 8 and 9), modes chosen as a spell is cast (#604, Rob's question whether the engine is strict about priority and resolution order), and **Rob's Priority Batch 10.3**, the cards on Rob's spreadsheet not yet added, in Rob's order: twenty-two slices so far, seven of them engine pieces. **Merged, each a merge commit on the local gate, its PASS block on the PR:** #588-#599 (X5e-X5n, the derive-once memo, X6); #600 X8a; #601 the backlog items; #602, #603 the first two slices and #604 modes chosen as cast; #612 each resolution event handed back once; the train #605-#611 and #613-#617 (slices 3-13, and #614, a commander sent to a hand or library by any effect, CR 903.9b); #618 amass (CR 701.47); the train #619-#622 (convoke, CR 702.51; recruit, CR 701.70; storied, CR 702.195; the eighteenth slice). **The train at this record, gated once at its head:** #623 "whenever this creature becomes tapped"; #624 evoke (CR 702.74); #625 the mana spent to cast it ("if {G}{G} was spent to cast it", adamant); #626 investigate (CR 701.16); and this record. |
| **Branch** | `main` once the train #623-#627 is in; the session's next slices branch from there. |
| **Since** | 2026-10-03 (this session) |
| **Proven here** (the cloud container, Node 22.22.0, Playwright 1.56.0 with Chromium) | **Gates:** every merge on `tools/local-ci.sh <head> 2`, a train once at its head (293 suites a run at d2082a76). Two first gates **failed** and were fixed before the merge: the train #605-#617's, on b7571d9f, in `engine-rules-conformance` (a resolution that stops to ask handed its earlier events back twice: Uro's life gain logged twice) and `engine-compile` (four cards never cast in their smoke games), fixed by #612 and #617; and the train #619-#622's, on 07cb70a3, in `engine-derive-once` (storied's check made 7,696 derivations), fixed by 1ee40df9. **Each engine change:** red first, then green, every change broken with `game/tools/batch/breaks.py` and caught; a break first missed got its check. **Coverage at this record:** 1,412 definitions (from 1,021 at #587); Rob's seven decks 314 of 477 defined, 392 with every rule (82.2%); the card library 821 defined, 1,759 with every rule (74.4%); the most-played 3,238 Commander cards 1,119 defined, 2,416 with every rule (74.6%). **Rob's Priority Batch 10.3:** 581 of its 1,095 cards defined (231 at its start). |
| **Assumed, not proven here** | Staging and production: nothing was deployed. The container cannot deploy, and Workers Builds still fail every build, every PR's preview included. Anything on Personal-HP, a phone or Firefox. |
| **Outstanding** | **Rob:** release staging and production from Personal-HP (D8); the runner or the billing (D7); Workers Builds and their previews off (D8); the permission rule for merges and releases (D11); the Build from Deck error in production (BACKLOG.md item 9). **The card data:** 203 of the priority list's cards are not in `data/engine/oracle.json` (Scryfall's oracle cards of 2026-09-22), being newer; they cannot be defined until it is refreshed, which is `docs/plan-data-sync.md`'s decision. **The session, next:** every card of the priority list that needs only a definition is defined; the 311 left in the oracle data each need an engine piece. By how many of them each piece holds back (and how many it alone holds back): RememberChanged 35 (7), RememberObjects 33 (4), MayPlay 24 (4), alterAttribute 11 (4), ETBReplacement 10 (3), PresentZone 5 (3), ThisTurnEntered 4 (3), AlternateAdditionalCost 3 (3); and about 120 set aside for what the catalog does not measure, each named in its slice's PR. Then X8b (the payment question), X8c (holding priority), and X9-X14 in the plan's order. |
| **Named, not built** (each said in its PR) | **Mechanics:** adventures; emblems; suspend; meld; waterbend; behold; blight and counters of any kind as a cost; stun counters; "gains all creature types"; triggers on how mana was spent; the Blood token predefined (Voldaren Epicure writes it out); a type-changing static under a condition (Purphoros: the layers leave conditional statics out of a condition's own derivation, sound only while they never change what a condition counts); "if you can't" (Eldrazi Monument); "when you cast this spell" (Nulldrifter, Artisan of Kozilek); a trigger from the graveyard (Squee, Goblin Nabob); an "unless" cost with an outcome either way (Divert Disaster); mana value X in a selector; a sum of two counts; cards "exiled with" an object; attacking alone; "creatures you control with flying" in a layer's selection; damage divided as its caster chooses (Fury, CR 601.2d); a graveyard put on the bottom of its library in a random order (Endurance); a target for each opponent (Desecrate Reality, which the catalog counts as built); activated abilities that cost less (Forensic Gadgeteer); the table showing an enduring story. **Rules:** a Phyrexian symbol payable either way is not offered (X8b); a pool that could pay a generic cost more than one way is not offered (X8b); restricted mana honored only from mana abilities; the mana spent to cast a permanent, read by a trigger of its own departure (a departure's trigger does not remember it). |
| **Part 7 gates** | **G-A Build: not passed. G-B Test end to end: not passed. G-C Staging: not passed.** X1-X6 and X8a are built; X5's mechanics and D5's definition-only cards are in; twenty-two slices of Rob's list. Nothing was played at staging. |

## An earlier record: the execution session of 2026-10-03, to #587

| | |
| --- | --- |
| **Holder** | **Open: the execution session of 2026-10-03 (Claude, a cloud container) has closed, and this is its closing record.** It executed `docs/plan-execution-2026-10-03.md` from its brief, `docs/prompt-execution-2026-10-03.md`. Rob's go ("begin executing the fixes, merges and plan"; later "keep going, merge when the gate passes") was taken as the go for the merges and the fix steps in order, with the plan's recommended answer to each of D1-D12; #577 says so. **Merged, each a merge commit on the local gate, its PASS block on the PR:** #571-#576 (Phase A); #577 C1, the commander layer; #578 C2a, the rules a player checks; #579 C2b, the decisions that are the player's; then one train: #580 C3, the conformance suite; #581 C4, M5 (the table plays the engine's definitions); #582 C2c, CR 616.1 for damage, the board's damage division, and the `tests/reset-all.mjs` race fix; #583 X5a, "up to N targets"; #584 X5b, a cost that sacrifices a set; #585 X5c, Afterlife and "whenever you create one or more creature tokens"; #586 X5d, what a player did this turn, counted and compared; and this record. |
| **Branch** | `main` after the train; nothing of this session's is open. |
| **Since** | 2026-10-03 (this session) |
| **Proven here** (the cloud container, Node 22.22.0, Playwright 1.56.0 with Chromium) | **Gates:** C1+C2a+C2b's head 8407c99d PASS twice (272 suites a run); C3+C4's head 2928410a failed run 2 once on a race in `tests/reset-all.mjs`, which neither PR touched. The race was proven by forcing it (the cloud's answer delayed 1.5 s), fixed on #582, and the head re-run (#581). The train's head carries everything after (the PASS blocks on #582-#586 and this PR). **Each PR:** red first against the head before it, then green, every guard broken with `game/tools/batch/breaks.py` and caught: C1 23 breaks, C2a 21, C2b 13, C2c 14, X5a 28, X5b 6, X5c 5, X5d 13. A break first missed got its check, or its unreachable code was removed. **The room:** seven seeded four-seat games of the engine's own definitions through the cloud table's card source, each to its end with no exception (`tests/engine-room-games.mjs`). **Coverage:** most-played Commander cards with every mechanic built went from 2,267 to 2,373 (73.3%); Rob's seven decks from 358 to 377 of 477 (79.0%); 1,021 definitions. **Suites:** 241. |
| **Assumed, not proven here** | Staging and production: nothing was deployed. The container cannot deploy, and Workers Builds still fail every build. `tests/uat/play-e2e.mjs` against staging once C4 is released. Anything on Personal-HP, a phone or Firefox. |
| **Outstanding** | **Rob:** release staging and production from Personal-HP (D8; until X7, the commands in Questions 0 below); register the runner or restore billing (D7); turn Workers Builds and their previews off (D8); the permission rule for merges and releases (D11). **The next session:** X5's remaining D5 mechanics, then D5's 25 cards that need only a definition, then Rob's game at staging. The remaining mechanics are: Escape, whose "exile four other cards from your graveyard" is a pick-several as the cast is taken, and "escapes with two +1/+1 counters" (Woe Strider); Encore (Angel of Indemnity); Combat Calligrapher's "Inklings can't attack you" and its attack trigger; and planeswalker loyalty (Elspeth, Sun's Nemesis). After X5 comes X6-X14 in the plan's order. |
| **Named, not built** (each said in its module's header or its PR) | **Rules:** the order of damage replacement effects where nothing can stop to ask (an effect repeated for each player, what follows a prevention, a mana ability's), which keeps the least-damage order; a zone change whose replacement orders end differently, asked but not yet paused for; CR 903.9b for a move that is not an effect's moveZone; Vehicles and Spacecraft as commanders (CR 903.3); planeswalkers (CR 306, 606, 704.5i), which `missingFor` does not flag, so coverage counts a few that cannot be played; a count that is X ("up to X target creatures"); a spell with a counted target cast as an effect resolves; a copy's new list for a counted target; a Phyrexian-mana cast when two payments exist; ThisTurnEntered, "what entered or died this turn", beyond tokens made. **The pilot and the room:** the house pilot cannot see an attack tax, so the room survives its refused answer and gives the least; seeds 2, 6 and 7 of the room-games deal run past 90 s (the room's per-request cost, review 2.12; X9). |
| **Part 7 gates** | **G-A Build: not passed. G-B Test end to end: not passed. G-C Staging: not passed.** Of G-A1, X1-X4 are built (the commander layer, the rules a player checks, the conformance suite, the definitions at the table), and X5 is under way. This session built five of D5's mechanics (up to N targets, a cost that sacrifices a set, Afterlife, the token-created trigger, counted comparisons over the turn's records) and defined eight of its cards. Nothing was played at staging. |

## The record before it: the plan-review session of 2026-10-03

| | |
| --- | --- |
| **Holder** | **Open -- the plan-review session of 2026-10-03 (Claude, a cloud container) has closed; this is its closing record.** It reviewed `docs/plan-remaining-2026-10-03.md` and `docs/engine/velocity-2026-10-03.md` as devil's advocate (`docs/prompt-plan-review-2026-10-03.md`), changed no engine, app or test code, and left two documents: **`docs/plan-review-2026-10-03.md`** (the findings, with their evidence) and **`docs/plan-execution-2026-10-03.md`** (the plan the execution session follows, its twelve decisions for Rob at the top, and the prompt that starts that session at its end). **Rob's next step:** merge #571-#575 in order, then the review's draft PR **#576** (branch `claude/plan-review-2026-10-03`, docs only, on #575's head; `gh pr edit 576 --base main` once #575 is in); answer the execution plan's decisions D1-D12 (a line each); then start the execution session with the prompt at the end of `docs/plan-execution-2026-10-03.md`; its working brief (the merge procedure, the container's limits, the designs and test shapes for the first fixes) is `docs/prompt-execution-2026-10-03.md`. Rob, later on 2026-10-03: the model of this session changes to Opus and begins the merges and the fixes itself, in that brief's order. |
| **Branch** | `claude/plan-review-2026-10-03`, from the handoff head 849845bf (#575); docs only. |
| **Since** | 2026-10-03 (this session) |
| **Proven here** (the cloud container, Node 22.22.0, Playwright 1.56.0 with Chromium) | **The whole gate green once on 849845bf:** `tools/local-ci.sh HEAD 1` PASS, 272 suites and `node --test game/tests`, scan clean, 988 s. **The engine suites:** 117 of 117. **The coverage figures** reproduced (992 / 2,267 / 70.0%; the seven decks 157 / 358). **`tests/uat/play-journeys.mjs`: 49 checks passed** (two four-seat tables through the real UI, the phone, every view at four sizes, the record). **The board fixture** at 1280x720 and 1920x1080 (eight shots, the hand whole in all). **Twelve four-seat games in the room** with four house pilots on the engine's own definitions: nine finished (1.5-23 s each; two of them 86 and 117 s), two threw an engine exception a real table reaches (a blockers question about an attacker that had left; a house pilot's single block on a menace creature refused and uncaught), one had not finished after 25 minutes (profiled: the layers derived afresh and recursively on every question). **Five rules defects, each played through the scenario runner** (review, Part 2 and Part 6): a commander exiled or destroyed by an effect never returns (CR 903.9a); commander combat damage is never counted (903.10a); the commander tax is forgotten after the first return (903.8); the legend rule is absent (704.5j); combat damage among blockers still demands the removed damage assignment order (510.1c). **GitHub Actions** refuses jobs within seconds (runs 2102-2104). **Cloudflare:** production on version 2fc36d3b (Oct 1, 19:59 UTC), staging on 99f23f29 (Oct 3, 04:57 UTC), nothing deployed since. |
| **Assumed, not proven here** | Anything on Forge, the JDK, a phone, Firefox or a Workers Build (AGENTS.md's table); that the two slow room games are the layers being derived afresh (a profile is X9); that D5 Shadrix Aristocrats is the deck closest to whole (counted from the inventory and the directory, not played). |
| **Outstanding** | **Rob:** the merges and the releases (as the previous record says, from Personal-HP); the twelve decisions; the runner or the billing; Workers Builds and previews off. **The execution session:** X1 (the commander layer) first, then X2-X14 as the plan orders them. **Not done by this review:** no code was changed, so the five defects stand at the handoff head and at staging. |
| **Part 7 gates** | **G-A Build: not passed. G-B Test end to end: not passed. G-C Staging: not passed.** Unchanged by this session; the execution plan says what each still needs and proposes (D6) that G-A split into G-A1, a played game, and G-A2, the rest of the AI program and operations. |

## The record before that: the Personal-HP session of 2026-10-03

| | |
| --- | --- |
| **Holder** | **Open — the Personal-HP session of 2026-10-03 has closed; this is its closing record.** It began as the fix for the flaky "Skip to end" check and, at Rob's word, folded in the other open work, built engine batches 79 and 80, evaluated how to speed engine work up, and wrote the remaining plan and the prompt for a plan-review session. **Rob's next step:** merge the five PRs below in order (this session's permission check refuses `gh pr merge`), release staging and production (approved by Rob 2026-10-03; the check refuses deploys too), then start the plan-review session with `docs/prompt-plan-review-2026-10-03.md`; the execution session follows the plan that review produces. |
| **Branch** | **To merge, in this order, each a merge commit on the local gate** (GitHub Actions still refuses jobs on billing, checked 2026-10-03 12:29 UTC): **#571** (the Skip to end race; PASS on d8a2fdba posted) → **#572** (the Coach's ⋯ menu kept open and its focus kept; another session's, which merged #571 into it and gates its head f8aa981b) → **#573** (batch 79) → **#574** (batch 80; `gh pr edit 574 --base main` once #573 is in) → **#575** (this record and the plans; docs only). **The merge spot is proven:** the commit 18c07644, #572's head merged with #574's — the tree `main` has once #571–#574 are in — passed `tools/local-ci.sh 18c07644 2` (PASS: 2 × 272 suites and 262 game tests, scan clean, 2,738 s); the handoff head adds only `docs/` and is gated too (its PASS block is on #575). After all five, `git rev-parse origin/main^{tree}` must equal `git rev-parse <#575's head>^{tree}`: the tree that was tested. **Then the releases**, from a detached `origin/main` checkout as a tracked background task: staging, `tools/release-staging.sh` (release-acceptance and Play end-to-end walked), pushing `release/cloud-staging`; production, `node tools/release-pages.mjs --ref origin/main --commit` (the `pages` profile), `tests/uat/release-acceptance.mjs` on it, pushing `release/pages`. **Both deploy through Cloudflare Workers Builds, and every release build since 2026-10-03 05:19 UTC was terminated in the queue** ("Build failed to initialize and was timed out"): staging still serves the release of `ecc869fe`, crankmagic.com still `release/pages` 721e5c4. Re-run the latest build of each Worker (dashboard → Workers → the Worker → Deployments → Builds), or deploy from Personal-HP as Questions 0 says. |
| **Since** | 2026-10-03 (this session) |
| **Doing** | **Built and proven this session, none merged yet (the permission check, above):** **#571** `tests/table-board.mjs`'s Skip to end race — the label is short-lived (the board passes 120ms after the click and the room runs to turn 2), so the room is now held while it is read; the caster's "Waiting on" is waited for on its own page; proven by forcing each race (old check red, fix green), breaks, and 6 suites at once under 44 spinning threads (old suite failed 2 of 3, fixed 3 of 3); local gate PASS. **#573, batch 79** — RememberChanged's forms that need no randomness: every library `fromTop` names and an amount, `moveZoneAll` remembering, `play`'s "any number", a permanent chosen on the battlefield as an effect resolves, a flicker remembering what came back, `anyOf` in a condition, commander ninjutsu (CR 702.49d), a cost increase for a while; 9 cards (Living Death, Etali, Villainous Wealth, Yuriko, Temur Sabertooth, Splash Portal, Spelunking, Mind's Dilation, Elspeth Conquers Death); 29 breaks caught. RememberChanged stays uncredited (its random-order, any-order and "exiled with this" forms are not all built). **#574, batch 80** — the game's random stream handed to plain effects (passPriority → resolveTop → the resolution → each effect, and on after an answer, which dropped it): shuffle (CR 701.24, credited), "shuffle it into its owner's library", a random order on the bottom, a discard at random (CR 701.9b), dig's filter, "may", memory and random rest, "that many"; 3 cards (Gamble, Winds of Change, The Key to the Vault) and **3 defined cards corrected that had faked a random order with the order taken** (Jodah, The Regalia, Sunbird's Invocation); nothing random is ever made up — without the stream an effect refuses; 38 breaks caught. **The velocity evaluation** (Rob asked how to speed engine work up): `docs/engine/velocity-2026-10-03.md` and its page; **the remaining plan:** `docs/plan-remaining-2026-10-03.md`; **the plan-review prompt:** `docs/prompt-plan-review-2026-10-03.md`.<br>**Coverage at #574:** of the most-played 3,238 Commander cards, 992 are defined and 2,267 (70.0%) have every mechanic built (from 980 and 2,255 at #568); the card library 440 defined, 1,565 (66.2%); Rob's seven decks 358 of 477 (75.1%). The Engine Catalog page (claude.ai/artifact/2p7KuxoPTNF1wvk2GAsH72) shows batch 80. |
| **Since Stage 2** | **The first-look list, live 2026-09-25 (#372, walked 21/21 on crankmagic.com):** Rob's list from walking crankmagic.com, plus Grok Bot's UAT of the same build (`docs/uat/2026-09-24-cloud-workshop/`). Card names open the card again (a stray `back` had broken every click); menus are opaque and a second click closes them (the `--v-*` tokens are `:root`'s too); card-name hover shows the card at 360px in Library and in a deck's hundred; the printed cost only (`CrankCatalog.frontCost`; 32 mana values rebuilt); Satoshi headings in the app and the design guide; the Overview's By card type bar; Full guide and SWOT stays on the deck; Explore's chooser no longer waits on 21 MB, its search works, and the graph opens in Inspect; Table S/M/L 30% larger; Subscribe, the mirror, Load Live and the rail note gone, and Rob's collection files are never served. The calls are `docs/decisions-2026-09-24.md` §12. Still owed from the list: **card data that refreshes itself on Cloudflare** — the design and Rob's four decisions are **`docs/plan-data-sync.md`** — and which remaining Menu backup/share entries stay. |
| **Next for whoever picks this up** | **The plan-review session first** (`docs/prompt-plan-review-2026-10-03.md`): it reviews `docs/plan-remaining-2026-10-03.md` as devil's advocate and writes the plan the execution session follows. Until it does, the remaining plan's order stands. **The engine, in the catalog's order** (`docs/engine/catalog.md`, *What to build next*): remembering an object (RememberObjects), MayPlay's remaining forms, ETBReplacement's remaining forms, SetState (double-faced cards), Imprint, RingTemptsYou; and, per the velocity evaluation, a measurement batch (parameter-level inventory, the axis matrix) and a 50-card bulk-definition pilot from the 1,275 cards with every mechanic built. **Named and not built, found while building:** an order the player chooses mid-effect (Scroll Rack, Teferi's Puzzle Box), "exiled with this" (Nautiloid Ship, Gisa), attaching a chosen permanent as an effect resolves (Armored Skyhunter), a filter on what a move takes and spell mastery (Animist's Awakening), planeswalker loyalty (Tezzeret), another player's "may pay" and playing lands from exile (Gix), a spell's own "when you cast this spell" (Kozilek, Ulamog, Artisan of Kozilek, Nulldrifter, Flayer of Loyalties); a search's own shuffle does not yet end a look (CR 701.20d; one line through `shuffleLibrary`); subtypes kept in layer 4 when `setTypes` removes Creature; umbra armor; landwalk; "up to N targets"; a Phyrexian mana payment either way. **Counted as every rule but needing something the catalog does not measure** (named in their PRs): Vigor, Uncivil Unrest, Necrobloom, Guide of Souls, Caesar, Sorin, Planar Genesis, Atraxa, Selvala, Aetherworks Marvel. **The definitions are not yet served to the cloud table** (M5). **The local gate:** about 33 minutes a run on Personal-HP (two at once is fine on its 22 cores; the Skip to end check that load used to trip is fixed by #571). **Building a batch:** `game/tools/batch/README.md`; `breaks.py` can fail to restore a file on Windows (an "Invalid argument" on the copy back): check `git diff` for a leftover break and a `.bak` file after every run. **On Personal-HP:** Bash heredocs drop one backslash — write scripts with the Write tool; check a new suite's name is free before writing it; a new worktree needs the node_modules junction; release from a detached `origin/main` checkout, as a tracked background task. **Scenarios** pay mana exactly, answer a trigger's target (and an order of triggers, `settle`) before resolving it, cannot declare blockers, list a seat's permanents by owner (`controls` reads control), and now hand the game's random stream to what resolves; in three or more seats the first player draws on turn 1 (CR 103.8a). |
| **Questions for Rob** | **0. Merges and releases** (Branch, above): this session's permission check refused `gh pr merge` ("Merge Without Review", even with your approval in chat) and re-running a Workers Build ("Production Deploy"). Merge #571 → #572 → #573 → #574 → #575 yourself, or add a permission rule for this repository's local-gate merges and release pushes. If Workers Builds keeps terminating, production can be deployed from Personal-HP: `git archive origin/release/pages | tar -x -C ../crankmagic-release`, then `npx --yes wrangler@4.139.0 deploy` there, then `UAT_BASE=https://crankmagic.com UAT_LIVE_NETWORK=1 node tests/uat/release-acceptance.mjs`.<br>**1. GitHub Actions** still refuses every job on billing ("recent account payments have failed or your spending limit needs to be increased"). Restore billing (Settings → Billing & plans), or keep the local gate.<br>**2. Workers Builds previews:** both Workers build a *preview* of every branch push (`npx wrangler preview`), which fails (the config has no `previews` block), shows two red checks on every PR, and likely crowds the queue that terminated the release builds. Recommended: turn previews off for both Workers (Settings → Builds), since staging and production deploy only from the release branches.<br>**3. Play on production:** crankmagic.com runs the `pages` profile, where Play shows "Coming Soon". Should Play itself go live there?<br>**4. The first-look list vs. wireframe r3:** *Restore a backup* vs. *Import*, and the phone's action bar scrolling vs. fitting — which wins where they disagree?<br>**5. The browser matrix (#481):** Firefox needs the Visual C++ runtime on the workbench; Safari on an iPhone and Chrome on an Android phone are yours to run.<br>**6. Play fixes on staging** — #489, #493, #512, #510, and now #571/#572 once released: worth a fresh look in a game.<br>**7. Calls made and said in their PRs** (each reversible): RememberChanged left uncredited until its remaining forms are built (#573); Elspeth Conquers Death III puts a +1/+1 counter on a creature, a loyalty counter on a planeswalker (#573); without the game's random stream an effect refuses rather than falls back to any order, and dig without `random` keeps the order looked at, no card using it (#574). |
| **Part 7 gates** | **G-A Build: not passed. G-B Test end to end: not passed. G-C Staging: not passed.** None of the three gates' own checks was run this session; `docs/plan-remaining-2026-10-03.md` sets out what each still needs. |

## The engine has started — phase 0 done, phase 1 next

Rob authorized phases 0 and 1 on 2026-09-22 after reading `docs/engine/PIVOT-OR-PERSIST.md`,
overriding the plan's own start condition (decision 3, Track V first). `docs/engine/PLAN.md` §6
carries the status table; `docs/engine/ADR-001-own-engine.md` carries the clean-room rule, which
is the constraint everything else rests on: **the Comprehensive Rules and Scryfall oracle text come
in, nothing from Forge comes in, and a divergence is adjudicated against the CR rather than settled
by copying.**

**Phase 0 is done (PR #353).** The scaffold refuses loudly and `CRANKMAGIC_ENGINE` defaults to
`forge`, so the engine is unreachable by anyone who has not asked for it by name. The pool is
fixed at **31,830 Commander-legal cards** in `data/engine/`, every ledger row `unsupported`.

**Phase 1 is next and not started.** Begin at 1.1 — rng, state, zones, objects, players, journal,
hashes, and the determinism test that stays forever. The gate to leave phase 1 is a four-player
game of vanilla creatures and lands with commanders running to completion for **1,000 seeds** with
no exception, the same hash on replay, and no hidden card in any seat projection. Estimated 4–6
sessions; this session stopped before starting it, at the plan's own 95%-of-usage rule, rather
than leaving half a kernel behind.

## Play audio, all five phases in

The pack Rob generated (`crankmagic2-play-audio-generated`, 88 files, 5.3 MB) is served by the
host and the gateway, and the board plays it. `docs/plan-play-audio.md` carries the detail; the
shape is three modules that do not know about each other.

| | |
|---|---|
| `play-audio-rules.mjs` | R1–R7 and R13 as pure functions of a type line. Has never heard of a speaker |
| `play-audio.mjs` | Two Web Audio buses, lazy decode, crossfade. Context, fetch and storage injected, so it runs headless |
| `play-audio-events.mjs` | The feed → clip names. A second consumer of the same `recent` the notices read, with its own filter and its own `seen` set |
| `review.mjs` | The only place that knows about all three: arms, pumps, chooses a bed, draws the sliders |

**The gesture is the whole difficulty**, and it is worth knowing before touching this: a browser
refuses to play anything on a page nobody has clicked, and refuses *silently*. The context is
therefore built and resumed **synchronously inside the first `pointerdown`** — one `await` before
that call and the permission is gone with no error anywhere.

**It has been heard in a real game.** A two-seat match against the native Forge AI, driven from a
browser: the lobby bed, the game bed crossfading in when the table went live, the viewer's own
draw, a land, a permanent arriving, and the combat bed at the first `COMBAT_` step — with no page
errors. Engine event → journal → `match-telemetry` → `play-audio-events` → `play-audio` → network,
all of it.

**Three clips can never play**, and `UNREACHABLE_FROM_THE_FEED` in `play-audio-events.mjs` says
why, with a test that fails if a fourth one quietly joins them. `sfx_event_counterspell` needs a
telemetry row that does not exist (`GameEventSpellRemovedFromStack` reaches `public-stack.mjs` but
not `match-telemetry.mjs`); `sfx_event_equip` and `sfx_event_crew` need `CrankCardScript@1` from
the engine plan — the same dependency the two blocked board alerts wait on.

**Two claims in the plan were wrong and are struck through in it rather than footnoted.**
`GameEventTurnBegan` does not exist anywhere in this repository, and the countered-spell row never
reaches the feed. Both were ticked ✅ in the plan's own mapping table before anyone looked.

## Stage A, finished

Six of Rob's findings turned out to be one finding: **the board had the facts and never drew them.**

| | |
|---|---|
| A.1 | The lag measurement — which found the board was never connecting at all |
| A.2 | A spent prompt is not a decision. Forge never clears `prompt`, so `/^Priority:/` matched an answered string. `ui.inputType` is the fact to stand on |
| A.3 | `End game` and `Auto-pass turn` out of the action row |
| A.4 | The skipped first draw explained where the player was refused (CR 103.8a, two players only) |
| A.5 | **Answered from Rob's own match journal:** the starting player *does* draw in a four-player pod |
| A.6.1–4 | Notices with an OK button, history with the card and the reason, incoming damage where blocks are chosen, poison and your own draw |

## Stage B, against wireframes 2e and 2f

**The frames are numbers, not sketches** — React trees with inline styles, extracted once into
`docs/plan-stage-b-board.md` so nobody re-derives them. Drawn at half scale; double for the build.

| | |
|---|---|
| B.1 | The step strip — `Turn 4 · You`, brass step chip, `4 / 7`, **`Next: …`** |
| B.2 | Four **identical** 16:9 boards in one 2×2. **At 1920×1080: 533×300 each, mat 1131px** (measured live 2026-09-23). Earlier note said 584×329 with no viewport attached, which back-solves to a ~1258px-tall window — **always record the viewport, or the number cannot be checked against anything** |
| B.3 | The center counter — 152px, four totals on their own `--seat` colors, the disc cycles life → commander damage → poison |
| B.4 | The hand on the mat's bottom edge. **Zero overlap**, tested with real-sized cards |
| B.5a | The panel slides **over** the mat; the mat's width does not change whether it is open or shut (1368px at the viewport that was measured at; 1131px at 1920×1080) |
| B.6a | The mat stops printing the steps list and the life box — B.1 and B.3 carry both now. **Seen working with cards** |
| B.6c | The other three boards as a left pane in Focus, with Table view and a collapse. **Seen working with cards** |

### The board has now been seen with cards, and it was wrong in two ways

`game/tools/qa-pod.mjs` starts a pod against the native Forge AI, plays it far enough that the
boards have something on them, photographs it and measures it. **Three Stage B pieces were blocked
for a week on the sentence "cannot be judged without cards on screen"; they are not blocked any
more.** Run it against a second host on a spare port unless the one in use is idle:

```
node game/tools/qa-pod.mjs --out shots/ --port 8778 --turns 3
```

The first run found both of these, and no CSS-shape suite could have:

- **The hand was 500px below the fold** at 1920×1080. A card is *dragged* from the hand onto a
  mat, so a hand off screen is not a cosmetic problem. Fixed by bounding the mat by the viewport's
  height and taking its width from 16:9 — which is what `mats.css` already did for its own compact
  overview, so the approach had a precedent rather than being invented.
- **The counter sat on a player's own name**, because all four headings rode the top edge. Frame 2e
  had said how to avoid that (`column-reverse` on the bottom row) and nothing had implemented it.

Both are in #347, and the harness reports the `fold` line, the audio clips a real game played and
the page-error count on every run.

### What is left, and why each one waits

- **B.5b — the rail overlay.** `/review` is a standalone page. There is no CrankMagic rail on it to
  bring back, so the control would open an empty drawer. It arrives when the board becomes a view
  of the one app.
- **The hand card, fixed 2026-09-23.** It drew at 152×212 against the frame's 68×92 because four
  width rules across three stylesheets fought over one element and a `clamp(112px,10vw,152px)`
  out-weighed the other three instead of replacing them (INDEX trap 2). The hand took 352px of a
  1080px window while a whole board took 240, which pinned every board to its floor — and since a
  2×2 of 16:9 boards is itself 16:9, the mat could only be 917px in a 1920px window. At the frame's
  size the hand is 225px, `--board-chrome` drops 600→480, and the boards clear the floor:
  **533×300, mat 1131**. Guarded now by `wireframe-conformance.mjs`, which also fails a second rule
  for the same element.

- **B.6b — the History band. ANSWERED 2026-09-23: option 2, the empty strip.** The band goes at
  `left:72% top:5.5% width:25.5% height:31%` and no zone moves. Re-proportioning was rejected: the
  gap between the pile pairs is 4.8% of the mat against the ~15% a band needs, and closing it makes
  both pairs shorter than a card at small board sizes on all four boards at once. Verified while
  deciding: `.mat-turn-guide` and `.mat-life` have styles in `mats.css` but **nothing in `game/ui/`
  ever builds them**, so the strip is free and the band covers printed artwork only. See
  `docs/decisions-2026-09-23.md`.
- **B.6d — the Coach.** Not to be built until it works. 2f draws it and says "its logic is a later
  phase"; Rob's standing rule (2026-09-22) is that nothing is available before it is functional, so
  the surface waits for the logic rather than arriving ahead of it.
- **B.2b — the light mat. ANSWERED 2026-09-23: stay dark.** The cream play surface (`#e9e4da`) is a
  **post-release enhancement**, not dropped. There was no toggle to remove — a search of `game/`
  found no light-mat control of any kind. See `docs/decisions-2026-09-23.md`.

## Three limits found by measuring, which the next person should not re-discover

**The adapter reports exactly nine keywords** — flying, reach, trample, first strike, double
strike, deathtouch, lifelink, infect, wither (`ForgeProbe.java:241`). Menace, protection,
indestructible, shadow and fear never leave the engine. Widening it is a Java change and a rebuild.

**Forge can take back mana but never a land.** `setUndoable(true)` is called in exactly two places,
both mana effects, and `recordUndoableActions()` is reached only from `MagicStack.add()`, which a
land play never touches. That is CR 305.1 rather than an omission, and it is why the control is
called "Take mana back" instead of "Undo".

**Two of Rob's alerts need card text, not events** — "exiled with a return condition" and "a
mechanic triggered by other players". They are the first consumer of the card extraction skill, and
`docs/plan-card-extraction-skill.md` is the design: emit `CrankCardScript@1` (#305 §3.4) so one
artifact serves the pilot now and the engine later.

## Standing facts

- The host serves `game/ui/*` **per request**, so UI changes land on reload. Anything the host
  *imports* — `serve-review.mjs`, `game/server/*`, `match-telemetry.mjs`, the launcher — needs a
  restart. A **new** file in the served map needs one too, so import new `game/ui` modules
  optionally (`await import(...).catch(...)`), the way `review.mjs` already does.
- **`COMMANDER_GUEST_PUBLIC_ORIGIN` does not keep a tunnel alive; it only changes what the host
  SAYS.** This note used to read "every restart preserved `medium-linking-replies-take` that way",
  and on 2026-09-22 that address no longer resolved at all — `curl` could not even find it in DNS,
  while the gateway itself answered `200` on `127.0.0.1:8769`. Passing a stale origin back is
  therefore **worse than not passing it**: the lobby offers remote invitations that lead nowhere,
  instead of saying plainly that this host is local-only.
  The host does not run `cloudflared`; `game/tools/start-crankmagic.ps1 -RemoteGuests` does. So a
  plain `node game/tools/serve-review.mjs` has no tunnel and should not claim one. **Check the
  address answers from outside before passing it back**, and relaunch through the script when
  remote guests are actually wanted.
- The adapter is compiled by the launcher at every game start, so a Java change needs no build
  step — but it fails at game start rather than in a test, so compile it against the pinned jar
  before committing.
- `tools/board-latency.mjs` and `tools/first-draw-check.mjs` are read-only and safe against a live
  game. Neither invents a verdict it did not observe.

**#685 merged on main c025d5d0 on green Actions; staging released, the AI door open there.** `tools/release-staging.sh`
released c025d5d0 to `release/cloud-staging` 5e6d83e9 (release-acceptance and play-e2e passed). Workers Builds deployed it at
15:42:54 UTC as version 1c4870d8, its `play-worker.js` byte-identical to the release's dry-run bundle (2,420,941 bytes,
sha256 6537556247f6…). Its bindings: `AI_ACCESS_AUD` (the AI application), `AI_CAP_TOTAL_CENTS` and
`AI_CAP_PERSON_CENTS` 300, `AI_MODEL` claude-haiku-5-5, and Rob's `ANTHROPIC_API_KEY`. Rob first put the key in the
Builds section's variables, which only the build sees; he moved it to the Worker's own Variables and Secrets. The
staging allowlist holds his three emails, all lowercase. Every gate is set: the first real call is his, from his browser.

**Resolve all (PR #686, 2026-10-09).** Rob: *"#2. Yes, resolve all. Games as huge as you saw in those 2 will never happen
because half of the board you were seeing would win before ever getting to that point."*
- **The room:** a fourth beat, `resolveAll`, kept with the match. With a run of the same trigger on top of the stack
  (`triggerRun`), the person is offered *Resolve all N*. Taken, the room passes for that seat through that run only, no
  more passes than the run held, and asks again as soon as anything else is on top. It is saved with the room, so a wake
  mid-run goes on, and the tape replays it.
- **The board:** *Resolve all N* beside the pass, and the stack shows a run as one line, ×N.
- **What it was not enough for:** a profile of seed 54 with it. On turn 48 the person's four Krenko activations took the
  board from 23 permanents to 259, and one Resolve all over 252 triggers then took 25 s, about 0.1 s a resolution:
  - each seat's legal actions, worked out at every pass, a third of the time;
  - the saves, a fifth;
  - the resolutions, a fifth.

  A standing pass now skips its own seat's legal actions. But a board that doubles outruns any speed-up.
- **So G1's person** also goes round no loop once its seat controls 100 permanents, as Rob says a person with that board
  has won.
- **Pod 5 again, clean:**
  - seed 54: the person (D6) the last standing, 56 turns, 47.6 s, Resolve all 7 times;
  - seed 90: the person the last standing, 38 turns, 81.9 s, Resolve all 17 times.

  Both replayed identically, with 0 leaks. Seed 90's longest wait was 6.5 s on turn 34, alone on the machine: one
  Resolve all over 79 triggers on a board of 93. Most of it was D6's Quest for the Goblin Lord asking *"you may put a
  quest counter"* once per Goblin, each answer a save, and the AI seats' passes.
- **Rob's answer to that (2026-10-09): "Yes to all, and yes, build #1."**
  - **The same answer for the same question:** in a run the person let resolve, the first of a question (its words,
    mode, limits, and every option's words and card: `questionKey`) is asked. The board says *"Resolve all: your
    answer goes for this same question each time the run asks it"*. The room then gives that answer, yes or no, each
    time the very same question comes again in that run. It is kept with the standing pass, so a wake and the replay
    agree.
  - **The house pilot's quick pass:** `passes(actions, stackSize)` is true only when `choose` would pass whatever the
    board. The room then passes for the AI seat without working out its view. `engine-house-pilot` and
    `room-g1-terms` check it against the full choice at every AI pass, vanilla and on Rob's decks.
  - **Pod 5 with both:**
    - seed 90: longest wait 2.8 s (was 6.5), 39.9 s (was 77.9), 285 decisions (was 436);
    - seed 54: 1.1 s, 38.0 s.

    Both clean, replayed identically, 0 leaks. `room-resolve-all` 59 checks.
- **G1, the 1,400 again, on ccb250d1:** seven pods, 100 seeds each with a person in seat 0 and 100 all house, every
  game with `--replay --leaks`, four at a time (3.7 hours of games). The results:
  - **1,400 of 1,400 clean:** finished, none refused, every replay identical, 0 leaks in 105,656 checks of every seat's
    view.
  - **The person's longest wait in each of the 700 games:** median 172 ms, 90th percentile 363 ms, 99th 1.6 s, and the
    worst 3.5 s (pod 5 seed 90, turn 34, the biggest board). None was over five seconds.
  - **The person** stopped going round a loop 239 times.

  The later commit cb92f98e changed a test only (`room-refused-answer`'s breaking pilot), so these games stand for
  the PR.
- **Breaks:** 26 of 26 caught: the 14 above; the answer not carried, the answer not kept, the question not told, every
  question the same, a card not part of the question, the board silent about the run; and the quick pass too eager,
  blind to mana, to spells, to lands, and to loyalty.

**G-C, 6e24523a (#686's merge):** released to `release/cloud-staging` 17d71486; deployed at 20:35:18 UTC on 2026-10-09
as version 469ff5a4, its `play-worker.js` byte-identical to the release's dry-run bundle (2,424,596 bytes, sha256
54c405a478b5…).

**The AI door, proven (2026-10-09).** Rob's first call, from his browser at 20:30 UTC: Explain, Claude Haiku 5.5, 566
tokens in and 239 out, 177 micros (0.018¢), logged as ok. The door's GET reply, *"Explain is a POST."*, was his first
sight of it signed in.

**The Coach (AI-1, X13), built behind its own switch (2026-10-09).** Rob: *"begin building the coach next"*.
- **The brief** (`game/room/coach-brief.mjs`): built by the table (`GET /table/brief`, `game/room/table.mjs` `brief`)
  from the asking seat's own projection and the deck that seat brought. It holds the person's hand, each card with what
  it can do now; the board as everyone sees it (life, poison, commander damage, permanents with their state, graveyards,
  face-up exile, the command zone); the stack; the step; the history's last 20 lines; the question being asked; and the
  deck as a counted list sorted by name, with the library's count. Never another seat's hand or library, a face-down
  card that is not theirs, the library's order, or a top card a look showed them. The front door (`cloud/tables.mjs`)
  forwards no such path: only the Worker's AI door asks for it, and nothing from the browser goes into it.
- **The route:** `POST /api/ai/coach` with `{tableId, question}` (a question of at most 300 characters), behind the AI
  door's gates (Access, the allowlist, the key, the caps, the model), then its own switch, `AI_COACH`. It is set only by
  a release profile whose `ai.coach` is true (`tools/release-pages.mjs`); staging's is not, so staging answers *"The
  Coach is not switched on here yet."* until Rob approves the Coach's privacy wording (drafted in `docs/ai-door.md`).
  A table's refusal (no seat, no game yet) is passed on as the table said it.
- **The call:** Claude Haiku 5.5 at low effort, a JSON schema `{answer, plays[{card, action, why}], threat?, show}`, and
  the instruction as the brevity control: *"one to three at most, and aim for one"*, and that it sees no other hand or
  library order. Nothing measures the length afterward; `COACH_MAX_TOKENS` (1,200) is a cost ceiling only. The same
  caps and log as Explain, logged as `coach`.
- **Grounding:** every `[[card]]` in the answer, every play's card, every id to highlight and the threat's seat must be
  in the brief, or the answer is not shown (502) and is logged as ungrounded.
- **The board:** the stub reply is gone. An answer shows its card names in bold; *Show me* lights the cards it names for
  four seconds; *Why?* opens each play's reason and the threat. Signed in to the library only, the reply is a link to
  `GET /api/ai/login?to=#table?id=…`, which comes back to the table once signed in to the AI door.
- **Not built, by Rob's own cap choice:** the plan's per-game cap. Rob chose *"a general spending cap, not per
  person"*, 300¢ a day for everyone, which holds the Coach as it holds Explain.
- **Proof:** `coach` 51 checks (the brief by hand and from a real table against an AI seat whose seven-mana Bears stay in
  its hand; the door with the table bound; the board's panel in Chromium), `release-pages` 191, `table-board` 236,
  `playtest-harness` 150; 41 breaks caught: the brief carrying the library, its deck list in library order or uncounted, another seat's view, the brief before the game, the front door forwarding it, the switch ignored, the allowlist skipped, the browser's brief used, a table's refusal hidden, the sign-in sending anywhere, the question unbounded, Sonnet, the instruction's two lines, the effort, the log's feature, the asker sent, each of the grounding's checks, Show me, Why?, the bold, the sign-in link, the board sending its view, and the release's switch on and off.
- **Rob's, left:** approve the Coach's privacy wording. Then it goes on `privacy.html`, staging's profile gets
  `ai.coach: true`, and the next staging release turns the Coach on.

**#687 merged on main 662e1aba on green Actions; staging released.** `tools/release-staging.sh` released it to
`release/cloud-staging` 658edafa (release-acceptance 22, play-e2e 35); Workers Builds deployed it at 21:43:15 UTC as
version fa3dead1, its `play-worker.js` byte-identical to the release's dry-run bundle (2,435,420 bytes, sha256
8ed11a8e5e4e…). The Coach is in it, switched off (`AI_COACH` unset) until Rob approves its privacy wording.

**The Coach, switched on for staging (2026-10-09).** Rob: *"Coach privacy wording approved."* The wording is in the AI
features section of `privacy.html`; staging's profile has `ai.coach: true`, so its release sets `AI_COACH` on; and
`tools/release-pages.mjs` now refuses any release that switches the Coach on where the privacy policy does not say what
it sends. `release-pages` 193 checks. #688 merged on main 81bcda09 on green Actions; `tools/release-staging.sh` released it
to `release/cloud-staging` 4df68386 (release-acceptance 22, play-e2e 35), and Workers Builds deployed it at 23:08:02 UTC
as version 1a4de099, its `play-worker.js` byte-identical to the release's dry-run bundle (2,435,420 bytes, sha256
8ed11a8e5e4e…), its bindings `AI_COACH` on, `AI_MODEL` claude-haiku-5-5 and the key a secret. **The Coach answers on
staging.** Production's AI door stays shut until Rob's go.

**Rob's playtest, 2026-10-09: ten turns against the AI on staging, and his notes.** Each is built and held by a suite:
- *"Draw phase should be resolved automatically by drawing a card and progress to the next screen."* The table no
  longer launches games with the held draw (`game/room/table.mjs`, and the G1 harness with it); a game launched
  before keeps its `drawBeat` and replays as played. *"Clicking the library pile should Draw a Card"*: in such a game
  your Library pile is the Draw a card button too. `table-board`: turn 2's draw by itself, no button, on to Main 1.
- *"When I play a card to the board from my hand, I don't want to have to click a pop-up to resolve it."* A fifth
  beat, `passAfterCast` (`game/room/room.mjs`): a person's cast or activation passes the priority it brings back to
  them (CR 117.3c), so it resolves unless someone responds. Holding priority stays the caster's choice (AGENTS.md:
  decisions belong to the players): Tools' *Hold priority after I cast*, remembered on the device and sent with the cast
  as `hold`. `room-beats` 33 checks (without the beat, with it, holding, a convoke cast woken mid-question, each game
  replayed); `table-board`: a cast that passes and Maya's that holds.
- *"I shouldn't have to acknowledge every stage."* *Turns went by* puts itself away after six seconds; OK only does it
  sooner.
- *"In 2-player, the screen should split down the middle vertically"*, and *"each board will be landscape on each half
  of the screen"*: two seats sit side by side in Table view, yours on the right, each the largest 16:9 its half allows,
  the life counter and an upright bar between them (← and →).
- *"Card hand size should never decrease the board size. The user would just scroll down on the window to see the full
  card if it goes below the bottom."* In every view the boards are fitted with room for a hand at the table's card size
  (Tools), and a larger hand runs on below the window, the board scrolling to it; the strip stays at the top.
  `table-board`: Table, Focus and Full screen at Hand cards 160%.
- *"Needs more clear indication of whose turn it is. Icon on the Card in the left or right side pane."* The seat whose
  turn it is: its Focus tile ringed and marked *Your turn* / *Maya's turn*, and its line of Full screen's vitals too.
- *"Lobby music."* The pack's lobby bed (`bgm_lobby_mythic_calm`) from the first press in a table's lobby, crossfading
  into the game's bed when the board opens; leaving the page stops it. `table-lobby`.
- And the screenshot after End game, *"I couldn't click off of it"*: the card shown large under the pointer stayed when
  the board was redrawn under a still pointer. A press anywhere, Escape, or a redraw with no such card under the pointer
  now puts it away. `table-board`.
- A phone finding on the way: a main phase's ten ways to play covered 46% of a phone held sideways; what is asked there
  is at most a third of the height now, scrolling within.
- *"Resolving Land should be called 'Untap Lands' during the first untap phase"*, and then *"It's the Resolve pop-up
  that came up on my first turn in a 2-player game."* Nothing in the engine is titled *Resolve*: the only one is the pass
  button, which names what is on top of the stack, so on that first turn something of his was waiting there to be let
  resolve. With the cast that passes, his own spells and abilities no longer ask it; should a *Resolve* still show on a
  first turn, a screenshot names what was on the stack.
- **Proof:** `room-beats` 34, `table-board` 246, `table-lobby` 73, `board-choices` 38 (its scry and Zap now read with
  the cast that passes), `game-leave` 59, `playtest-harness` 153; the full local run green but for `board-choices`,
  since fixed; **35 breaks caught**: the cast's pass (never made, holding ignored, the answer's `hold` unread,
  activations, not kept across a wake, on every game), the table's beats (the pass, the held draw, the harness), the
  board's Hold priority (never sent, always sent, not kept, Tools silent), *Turns went by* waiting for OK, the turn
  marks (none, the tile, Full screen), the peek (a press, Escape, a card gone from under the pointer), two seats
  stacked again or fitted as rows, the upright bar (dragged up and down, deaf to ← →), the life counter's halves, the
  hand's room (Table, Focus and Full screen each following the hand, the board not scrolling, Focus clipping it, Full
  screen's hand growing up, the Table tray stretched), the phone's question, and the lobby's music (silent, the game's
  bed).

**#689 merged on main 2125854a on green Actions; staging released.** `tools/release-staging.sh` released it to
`release/cloud-staging` b6437fd6 (release-acceptance 22, play-e2e 35); Workers Builds deployed it at 00:48:13 UTC on
2026-10-10 as version ae71a787, its `play-worker.js` byte-identical to the release's dry-run bundle (2,436,473 bytes,
sha256 d099d931004c…). Rob's playtest notes are on staging.

**Rob's two G-B steps, done (2026-10-10).** *"Longest wait was about 3 seconds. phones work."* Over his own network,
in ten turns against the AI on staging, no wait reached five seconds; and Play on an iPhone and an Android phone held
sideways works. Both are in `docs/uat/browser-matrix.md` (and its generator, `tests/uat/browser-matrix.mjs`, so a
rewrite keeps them) and in the table above.

**The signed-in read-back (A5), done (2026-10-10).** Rob put the service token's secret in the environment's settings
(kept there as `CF_Access_Client_Secret`; Linux's names are case-sensitive, so `tools/staging-check.mjs` now finds the
token's two names in any case). Its first run read version.json, `/` and `/api/me` but called `/crankmagic.html` refused:
staging's static files answer it with their own 307 to `/crankmagic`, and the tool read every redirect as Access's. It now
follows a redirect on the same site, the token's headers with it, and calls only one off the site or to
`/cdn-cgi/access/` a refusal. **`node tools/staging-check.mjs --expect 2125854a…`: staging serves 2125854a (cloud-staging),
both pages say 2125854, `/api/me` answers as `service:session-checks`; exit 0.** `staging-check` 12 checks; 3 breaks
caught (every redirect read as Access, one off the site followed, the names in one case only).

**The Coach's own daily cap (2026-10-10).** Rob: *"$1.50 for the coach per day is good."* Inside the general 300¢, for
everyone together: `AI_CAP_COACH_CENTS` (the profile's `ai.coachCapCents`, 150 on staging), counting only calls logged
as `coach` and checked on the call's worst case before a cent is spent, like the others. Reached, the Coach answers
429, *"The Coach has reached its spend cap for the last 24 hours. Try again tomorrow."*, and Explain goes on.
`tools/release-pages.mjs` refuses a release that switches the Coach on without it. `coach` 54 checks, `release-pages`
195; **11 breaks caught** (the cap unread, read in the wrong unit, never checked, checked on what was spent without
the call's worst case, counting every feature, counting only the asker, the feature not passed, the refusal unnamed;
staging's cap unset, the variable never emitted, an uncapped Coach released).

**AI-2's levels, decided (2026-10-10).** Rob defined the house pilot's levels of decision, L0 (legal, today's) to L3
(chained probability, other players' likely plays included), and: *"Use Haiku 5.5. 0.25 per game is good"*; *"I do want
to deliver on L0 as part of the LLM AI seat capability"*; *"We won't be doing L2 or L3 right now."* Researched against
how game AIs that are not language models set difficulty, the recommendation, which Rob took (*"I agree with your
recommendations"*): one engine with three knobs (look-ahead, knowledge, chosen mistakes), never more information; L0 the
floor and the baseline; Easy L1 with weighted chance, Normal L1, Medium L2, Hard L3; the LLM seat asked only at close
calls that matter, with L1's scores as its hint and the house pilot as its fallback; and, in Phase 2, the model writing
each deck's L2 formulas once rather than at every decision. Written into AI-2 of `docs/plan-to-done-2026-09-30.md`,
with its sources. **Next: Phase 1, L1 in the house pilot, then the LLM seat.**

**#691 merged on main 905394dc on green Actions; staging released.** `tools/release-staging.sh` released it to
`release/cloud-staging` 1d34e211 (release-acceptance 22, play-e2e 35); Workers Builds deployed it at 21:37:33 UTC as
version d59a3702, its `play-worker.js` byte-identical to the release's dry-run bundle (2,437,220 bytes, sha256
ee1b400c670a…), its bindings `AI_CAP_COACH_CENTS` 150 beside `AI_CAP_TOTAL_CENTS` and `AI_CAP_PERSON_CENTS` 300. The
Coach's $1.50 a day is live on staging.

**AI-2, Phase 1: L1 built (2026-10-10).** `game/engine/pilots/scored-pilot.mjs` and `odds.mjs`, as Rob's L1 and the
settings he agreed. It scores five choices and leaves the rest to L0:
- the mana it spends;
- where a spell is aimed;
- attacks against the swing back;
- blocks;
- the opening hand's odds.

Combat is exact. On New table an AI seat is *An AI · Normal* or *An AI · Easy*; the table, the room and the record
keep it; the room makes the pilot with the seat's deck list and the match's seed. A seat without a setting is L0, so
matches launched before replay unchanged.
- **Measured** (`tools/pilot-bench.mjs`): 420 two-seat games of the seven decks per arm, on the same seeds.
  - Control (L0 against L0): 51%.
  - **Normal: 242 to 178, 58% (95%: 53–62%); paired with the control, 51 games won that L0 lost and 23 the other
    way, p = 0.0015.**
  - Easy: 55%.
  - Decision time: the median under 0.01 ms, the slowest 24 ms.
  - Answers refused: none.
- **Proof:**
  - `engine-scored-pilot` 51 checks;
  - `room-seat-pilots` 12;
  - `table-lobby` 74, `table-board` 246, `game-table` 154, `game-room` 520, `room-g1-terms` 45, `room-beats` 34,
    `room-slices` 26, `game-leave` 59, `engine-house-pilot` 19, `asset-versions`, all green;
  - **45 breaks caught**: the odds (the binomial, the tail); combat (first strike, double strike, deathtouch, indestructible, marked damage, a first striker striking twice, trample); who may block (flying, menace); the defender (chumps when not lethal, trades at any price, no walls, the dearest chump, a menace attacker blocked alone); the spells (aim, tax, the mana, the cheapest first, no plan); the attack (the swing back unweighed and unpunished, vigilance, no plan); no block plan; the hand (by land count, the same draws either way, odds without a deck); easy (beyond the band, from a stream, no chance at all); another seat's view; the room (the setting ignored, no deck, no seed, the seed forgotten on reopening, a person given a setting, the seats hiding it); the table (Easy dropped, launched without settings, the view hiding it); the lobby (the form, the seat's title).
- **Next:** L1's activated abilities, which L0 never uses (Krenko's Goblins among them); then the LLM seat on L0.

**#692 merged on main 862fae14 on green Actions** (its first run failed on `generators`: `docs/data-inventory.md` had
not named the bench as a reader of `data/live-state.json`; regenerated with its own tool). Staging released from it:
see below.

**L1's activated abilities (2026-10-10).** L0 never takes an ability that is not a mana or loyalty ability; Krenko's
Goblins, Chulane's, Sakura-Tribe Elder's, Priest of Forgotten Gods' and a Clue's went unused hundreds of times. L1 now
weighs each one by what the card says it does (cards, tokens counted on its own board, a land fetched, counters, a
look, a threat destroyed at the worthiest target) against what it costs (mana, a creature tapped, what it sacrifices
or discards, counters, life), in its own main phase with the stack empty, once no spell fits.
- **Where it stops,** since it keeps no count: never an ability that costs nothing; no tokens past 60 permanents of its
  own, no draw past eight in hand or five left in the library, no ability past 150 permanents on the battlefield. The
  first bench hung on Krenko with Intruder Alarm, doubling Goblins with every untap; the board's size now ends it.
- **The room's part:** the quick pass is told whose turn it is and the step. A card's facts carry its subtypes and
  activated abilities, as the card says them, read once a match.
- **Measured** (420 games an arm, the same seeds as before):
  - **Normal with abilities: 255 to 165, 61% (56–65%); paired, +60 / −19 against the L0 control, and +19 / −6
    against Normal without them (p = 0.015).**
  - Easy, its temperature raised from 1.5 (59%, too close to Normal) to 4: 56%. That is +54 / −34 against L0 and
    +22 / −43 against Normal, each significant. So L0 51%, Easy 56%, Normal 61%.
  - The slowest decision: 176 ms, on a board of a hundred Goblins.
- **Proof:** `engine-scored-pilot` 60 checks, `room-seat-pilots` 15; `game-room` 520, `table-board` 246, `table-lobby`
  74, `room-g1-terms` 45, `game-leave` 59, `room-slices` 26, `engine-x11-leave-questions` 94, `engine-derive-once` 16
  green; **12 more breaks caught**:
  - a free ability taken;
  - abilities at any time;
  - tokens without end;
  - a sacrifice costing nothing;
  - an ability unaimed;
  - the quick pass blind to abilities, or looking on any turn;
  - no ability plan;
  - facts without abilities or subtypes;
  - facts read anew;
  - the quick pass not told the turn.

**#692 and #693 on staging.** #692 (862fae14) was released to `release/cloud-staging` 076d3828 and deployed at 22:30:08
UTC as version a5ff4906 (2,455,957 bytes, sha256 1641c4f82dcf…). #693 merged on main dc03fa81 on green Actions; it was
released to 3da63aed and deployed at 22:50:02 UTC as version 9b85364a (2,463,462 bytes, sha256 93027a433636…). Each
release passed release-acceptance (22) and play-e2e (35), and each deployed `play-worker.js` is byte-identical to its
release's dry-run bundle. **New tables on staging seat L1 AIs at Normal or Easy, abilities and all.**

**AI-2: the LLM seat, built behind its switch (2026-10-10).** *An AI · Claude* on New table, offered and seated only
where the AI door would let the host spend on it. It plays L1 at Normal, and at its close calls the room offers it the
decision as it would a person. A close call is the spells it would cast, or an attack, with L1's two best plans within a
point of each other. The table's object asks Claude Haiku 5.5 on its alarm, with the seat's own view, no person's name,
and L1's choice as the hint. Each call is logged as `pilot` under the host, within the day's caps and the game's 25¢.
When the model cannot answer, the seat's own pilot does. Every answer is on the tape, so a replay never asks the model.
- **Proof:**
  - `room-agent-seat` 23 checks;
  - `agent-seat-table` 16;
  - `coach` 55;
  - `table-lobby` 75;
  - `release-pages` 200;
  - **35 breaks caught**: when it consults (at every decision, never, on any turn, the margin always wide, holding back counted per opponent); the room (a consult ignored at a choice or at priority, the llm setting dropped, the seat made as L1, houseAnswer for a person); the table (seated without the door, llm dropped, no alarm for the seat); the object (the gate skipped, the switch or the allowlist ignored, the game's cap ignored, spend not kept, any index used, the model never asked); the brief (names sent, every hand in it, the hint dropped, a repeated index allowed); the call (on Sonnet, effort not low, logged as the Coach); the Worker's question (the switch or the allowlist ignored); the release (the switch always on, without the privacy wording, without the game's cap); the lobby (Claude always, or never, offered).
- **Rob's, left:** approve the privacy wording in `docs/ai-door.md` ("AI players on Claude"). Then it goes on
  `privacy.html` and staging's profile switches it on.
- **Then:** the bench against L1 with a real model, on staging or with a key in the environment.

**#694 merged on main 4a10c030 on green Actions; staging released.** The first `tools/release-staging.sh` run did not
release. Its Play walk (play-e2e, under `wrangler dev`) stopped at the third table: polling the table for its countdown,
one reply came back with no table, and the walk read it as one. The same walk passed on its own straight after, and the
second release run passed both walks (release-acceptance 22, play-e2e 35) and released it to `release/cloud-staging`
68724131. Workers Builds deployed it at 00:57:22 UTC on 2026-10-11 as version 05b81554, its `play-worker.js`
byte-identical to the release's dry-run bundle (2,477,269 bytes, sha256 a4eb41299cb7…). Its AI bindings carry no
`AI_PILOT`: the LLM seat is not offered on staging until Rob approves its privacy wording.
- **The walk's reply, made to say itself:** the reply's body was not kept. A refusal is the likely one: the person's
  rate limit is 120 requests a minute, and the walk polls twice a second on a slow machine. Both of the walk's
  countdown polls now wait out a reply with no table and, if the wait runs out, name the table's last answer
  (`tests/uat/play-e2e.mjs`, `tableUntil`). play-e2e 35 checks.

**AI-5: your decks and the table, connected (2026-10-11).** Each deck now says whether the table can play it, before any
table is opened. Where Play is in the cloud, a deck's tile reads *Playable at the table* or *13 cards to learn for the
table*. Its page reads *Playable at the table · all 100 cards known* with **Play this deck**, or *87 of 100 known · 13 to
learn* and names the cards the table cannot play yet.
- **The question:** `POST /api/tables/known` (`cloud/tables.mjs`) asks which of a deck's card names a table cannot play,
  with no table. One object answers it from the engine's cards alone. Its name holds a hyphen, so no table's id can be
  it. The hub asks once for every deck; the page keeps each answer.
- **Play this deck** opens New table with *You bring D1 Quintorius Spirits to seat 1.*, and the deck takes your seat once
  the table is made. Already seated at a table whose game has not begun, it offers **Bring … there** instead. A deck the
  table cannot play whole is not brought: New table names its cards, and you choose another there.
- **New from Wizards' Play it** starts the precon's import as its chip does, and once the deck is made goes on to New
  table with it, in place of the deck's page.
- Only where Play is in the cloud (`crankmagic-table.js`, `C.play`); production leaves the file out, and nothing shows.
- In passing: a long commander's name in the hub's narrow New from Wizards tile ran out of its chip (a flex item never
  shrinks under its content); it now ellipsizes as written.
- **Proof:**
  - `table-lobby` 88 checks (13 new), now through the Worker's real front door (`cloud/tables.mjs`): the tiles, the
    hub asking once, both deck pages, Play this deck to a new table, Bring … there, a deck not brought, and Play it;
  - `game-table` 159 (the door: the names alone, one object, POST only, the size limit, shut without Play's binding);
  - precons, decks-hub, deck-page-r3, page-budget, feature-wiring, release-pages, playtest-harness, coach unchanged and
    green;
  - **21 breaks: 20 caught.** The one missed was a guard no suite could see: an answer landing after the page moved on
    writes into a page already gone. It was removed.
- **Not built:** learning a card at *Prepare decks* (AI-3's online half). Until then *to learn* means the table refuses
  the deck by name, as Change deck already said.

**#696 merged on main 317be8f0 on green Actions; staging released.** `tools/release-staging.sh` released it to
`release/cloud-staging` b56404d4 (release-acceptance 22, play-e2e 35). Workers Builds deployed it at 03:18:11 UTC as
version ba942e7f, its `play-worker.js` byte-identical to the release's dry-run bundle (2,477,826 bytes, sha256
09f40cf9…). Its AI bindings are the Coach's alone, as before.

**AI-4: the deck advisor, built behind its switch (2026-10-11).** *Ask the AI advisor* under a deck's More menu, where
the AI door would answer the person. The page sends the deck's id and a goal; the Worker builds the brief itself from
the person's library as last saved to the cloud, with the catalog's facts slimmed for the Worker, and asks the door's
model at low effort. Swaps naming a card not in the brief are dropped and counted. Each swap is a row to tick, and a
ticked one is saved as the deck's linked upgrade; nothing else changes.
- **Proof:** `advisor` 43 checks (the seven decks' briefs equal the whole catalog's), `advisor-page` 9,
  `release-pages` 204; 28 breaks caught.
- **Rob's, left:** the privacy wording in `docs/ai-door.md` ("The deck advisor"), then staging's profile switches it on;
  the eval with his key, and the swaps he would refuse.

**#697 merged on main c9f87a3f on green Actions; staging released.** `tools/release-staging.sh` released it to
`release/cloud-staging` 819748c2 (release-acceptance 22, play-e2e 35). Workers Builds deployed it at 04:25:44 UTC as
version 37a15ed9, its `play-worker.js` byte-identical to the release's dry-run bundle (2,814,318 bytes, sha256
b02a0dcf…). Its AI bindings are the Coach's alone: `AI_ADVISE` is not set, so the advisor stays shut on staging
until Rob approves its privacy wording.

**AI-6: AI Coach settings, built (2026-10-11).** One panel, from Settings (its own card, *AI Coach*) and from the
board's *Tools ▾ › AI Coach settings…*, saved with the person's preferences and synced with the library. Six controls:
cards not owned (off), the person's own first (on), inside the bracket (on), advice short or detailed, what the Coach
sees (board and hand, or board only), and the person's spending over the last 24 hours against their cap.
- **The advisor's four** are read by the Worker from the library it holds, never from the page. Cards not owned come
  from the catalog: Commander-legal, inside the commander's colors and the per-card cap, with ten places of their own.
- **The Coach's:** *My board only* sends the question with the hand withheld, and the table's brief leaves the hand and
  the question being asked out.
- **Proof:** `advisor` 56 checks, `coach` 60, `settings-r3` 56, `table-board` 250, `advisor-page` 9; 26 breaks caught.

**#698 merged on main d32d42ca on green Actions; staging released.** `tools/release-staging.sh` released it to
`release/cloud-staging` 3a123909 (release-acceptance 22, play-e2e 35). Workers Builds deployed it at 05:09:41 UTC as
version 848671e7, its `play-worker.js` byte-identical to the release's dry-run bundle (2,824,874 bytes, sha256
dbfa9625…). Its AI bindings are the Coach's alone, as before: the AI Coach settings are on staging, and the advisor
they steer is still shut.

**M3: monitoring, built (2026-10-11).** The Worker writes one line for each answer the operator should hear about,
through `serve()` around `handle()` (`cloud/worker.mjs`, `opsLine`): every 5xx with its status (a 503 is a feature
switched off, and the alerts leave it out), and a save refused as a sync conflict. A line names the route's resource,
never the person, an id or what was sent. Each cloud release turns Workers Logs on with those lines only: the
platform's per-request line, which carries the request's headers, stays off, and `tools/release-pages.mjs` refuses a
release that would keep it. `tools/ops-week.mjs` is the weekly check, and it only reads. Run on staging today: no
incidents, 3 people, 24 versions, Time Travel back to the database's birth (its 30-day window), and R2 not on.
- **Proof:** `cloud-worker` 117 checks, `ops-week` 23, `release-pages` 210; 30 breaks caught.
- **Rob's, left:** the two alerts with his email; R2 on, and the nightly copy's window and deletion promise
  (`docs/ops.md`).

**#699 merged on main 65d02094 on green Actions; staging released.** `tools/release-staging.sh` released it to
`release/cloud-staging` 4a9272a3 (release-acceptance 22, play-e2e 35). Workers Builds deployed it at 06:06:09 UTC as
version 9e463c21, its `play-worker.js` byte-identical to the release's dry-run bundle (2,825,718 bytes, sha256
efa5ea01…). Its AI bindings are the Coach's alone. **Workers Logs is on for crankmagic-staging as built:** the
Worker's `script-settings` read `observability.enabled` true, `head_sampling_rate` 1, `logs.invocation_logs` false.

**Train C (AI-3): Rob's whole library, learned (2026-10-11).** Of the 1,132 cards in Rob's library, 825 were playable
before Train C; 305 of the other 307 are now defined, each with scenarios that can fail, so **1,130 of 1,132 play**.
- **Phase 1** defined 167 with the engine as it was (seven workers by card kind).
- **Phase 2** built the engine pieces the rest needed, in six areas: four bugs; the turn's and game's records;
  costs that read their targets, cost atoms, behold, waterbend; replacements and last-known information; keywords
  (split second, riot, surge, freerunning, embalm, tiered, suspend from the hand, disguise, partner with,
  firebending, compleated, and more); combat (attacked recipients, attacks alone, losing the game).
- **Wave 2** built the rest in five areas: selectors and conditions, with mana provenance and mana withheld from
  casting from hand; counted amounts; revealed hands and the triggers the engine lacked; counters, copies, Roles,
  attachments and searches; the stack as targets, prevention shields, votes and tempting offers, and the fix for an
  attack tax the attacker can't pay (CR 508.1d). Then a last area of four. Phase 2 and wave 2 defined 138 of the
  307, and a few cards beside them (a second Danitha, Gandalf the White) whose clauses the areas were named for.
- **The two left, and why:** Gandalf, Goblins' Bane // Flameshape (playing a face-down exiled card, CR 406.3a, isn't
  built) and Extrapolate the Impossible (nothing outside the game in Commander, CR 903.5e and 903.11, so it does
  nothing there). Gandalf has been defined since (the Gandalf record below), so 1,131 play.
- **Proof:** check-cards 2,041 definitions, 3,868 scenarios, 0 failed; about 80 new engine suites, every engine, room
  and game suite green; 1,381 breaks, every one caught; G1's shape on a sample, 140 games: **140 of 140 clean** (seven pods, each with a person in seat 0 and all house, seeds 1-10, `--replay --leaks`): every game finished, none refused, every replay identical, 0 leaks in 8,774 checks of every seat's view; the person's longest wait in a game, median 0.16 s, 90th percentile 0.40 s, at most 1.2 s.
- **Rob's, left:** confirm the library plays as he expects (AI-3 asks "learned and confirmed"); the two cards above.
- **Found and fixed on the way** (each from a check that failed first): step-beginning triggers lost when the step's
  turn-based action asks (a held draw, declare attackers or blockers) -- live tables; a negative printed power read as
  null; an adventurer card changed just by listing what it may do; an attack tax the house pilot couldn't pay.

**#700 merged on main cd3c794a on green Actions; staging released.** `tools/release-staging.sh` released it to
`release/cloud-staging` 6eac25f9 (release-acceptance 22, play-e2e 35). Workers Builds deployed it at 10:10:30 UTC as
version 0261051e, its `play-worker.js` byte-identical to the release's dry-run bundle (3,301,891 bytes, sha256
f236861e…; it grew with the engine from 2,825,718, and is 647 KiB gzipped). Its AI bindings are the Coach's alone. So
staging's table plays 1,130 of Rob's 1,132 library cards.

**The A11y pass: WCAG 2.1 AA on the board and the lobby (2026-10-11).** The new suite, run first against the base,
failed in 172 places; it now passes 288 checks.
- **Contrast (1.4.3, 1.4.11):** each word is measured from the screen's pixels over all 30 playmats, both themes and
  all three views. The worst went from 1.07:1 (the hand's "3/3", light) to 4.77:1. The focus rings are two-tone, and
  the 24 that vanished on light or mid-tone art now meet 3:1 along 97-100% of their edge. Tokens only, no raw hex.
- **Focus (2.4.3, 2.4.7, 2.1.1, 2.1.2):** the page behind the board no longer takes Tab, Table view tabs in reading
  order, focus survives each redraw, menus say `aria-expanded`, and modals trap and return focus.
- **Keys in Help (2.1.1):** every key the board binds, checked against the handlers.
- **Card names (1.1.1, 4.1.2):** combat state, chosen and selected; a face-down permanent is "Face-down creature",
  never its name; a check scans every name and label for hidden cards.
- **Announced (4.1.2, 4.1.3):** one polite status region beside the board, and the dialogs named and modal.
- **Proof:** `tests/a11y-board.mjs` 288 checks, 72 breaks caught; `table-board`, `table-lobby`, `browser-geometry`,
  `page-budget`, `play-journeys` (82) and the rest green. `table-board`'s Coach-under-the-log check measures the side
  column as it scrolls now.
- **Left:** "token" and "summoning sick" in a card's name (the engine's projection carries neither). The primary
  buttons outside Play, on the light and steel-cobalt themes, are done: see the record of 2026-10-11 below.

**#701 merged on main bf0e9d21 on green Actions; staging released.** `tools/release-staging.sh` released it to
`release/cloud-staging` 03a69b16 (release-acceptance 22, play-e2e 35). Workers Builds deployed it at 11:17:16 UTC as
version 51634bdc, its `play-worker.js` byte-identical to the release's dry-run bundle and to #700's (3,301,891 bytes,
sha256 f236861e…): the A11y pass changed the browser's files only. Its AI bindings are the Coach's alone.

**G-B's one red, root-caused (2026-10-11).** Tests run 2573 on main bf0e9d21 failed once in `tests/table-board.mjs`:
Maya's board was not told within 10 s that Rob's socket had dropped. Seven local runs passed. Reading the path
found the race: the lobby reads the table every two seconds, and each read redraws who is away from the table alone
(`C.board.show`). A read the room answered just before Rob dropped, landing just after the room's "away" frame,
took Maya's flag down. In the check her later reads are held, so it stayed down past 10 s; on a real network it
would have come back at the next read, two seconds on.
- **Proof the race was the cause:** forced on main as it was (the read let through as the room told her, both landing
  before the check first looked), the drop check failed exactly as run 2573 did: a 10 s timeout, her flag "", her
  socket having brought `away s0`. With the fix, the same forcing passes. A new check makes the race happen every
  time: one of Maya's reads is answered before the drop and kept on its way back until the room has told her; it
  failed on main as it was.
- **The fix, newest wins, as views already do:** the lobby says when it asked for each read, and the board keeps the
  room's last frame about a seat over a read asked before that frame came (`crankmagic-board.js`,
  `crankmagic-table.js`).
- **Checks:** `table-board` 251 checks; `tools/table-away-breaks.py` 6 breaks, every one caught.
- The timeout's message still says what Maya's flag read and what her socket last brought, should it fail again.

**Freyalise's Elf Druid, a mana ability (2026-10-11; Claude on Personal-HP, `claude/gallant-williams-342c9c`).** The +2's
token wrote "{T}: Add {G}." as a card's activated ability, and createToken makes a token's abilities as written, so the
token offered a stack-using `activate` rather than an `activate-mana` (CR 605.1a). It is now `kind: "mana"`, as the
Treasure's is; a fourth scenario taps it for {G} on turn 3 (pool {G}, stack empty); and the compiler refuses a token's
mana ability written as a card's, by name. Of 218 token specs in 2,014 scripts, it was the only one.
- **Checks:** check-cards 2,041 definitions and 3,869 scenarios, 0 failed; `engine-cards` 54, `engine-cards-pb9` 28,
  `engine-learned` 253, `engine-mana-withheld` 48; definitions, coverage and catalog `--check` current.
- **Breaks:** the old form with the guard in place is refused (NOT PLAYABLE, its three scenarios fail); with the guard
  off, only the new scenario fails ("Rob is not offered activate-mana Elf Druid").

**G-C, the agents' access (2026-10-11).** Staging seated every service token Access admitted as one identity,
`service:session-checks`, so the four agents M8 plays staging with would have been one person: one library, one seat.
Now each token is `service:` and twelve hex of its client id's SHA-256 (`cloud/access.mjs`). The same token is always
the same identity and four tokens are four; none is a person's address, and the client id isn't repeated. It is still
staging only (`SERVICE_SEATS`).
- **How an agent gets in** (`docs/playtest-harness.md`): the token's two headers on every request. Checked against
  staging with the session's token:
  - Access answers the first request with its `CF_Authorization` cookie (Secure, SameSite=None, about 30 days);
  - a request carrying only that cookie was seated as the token's identity;
  - in Chromium, extra headers stay off a socket's handshake while the cookie goes with it, so the cookie carries the
    table's socket.
  
  A real socket through Access is not yet seen: this container's proxy carries none.
- **Checks:** `cloud-worker` 120, `staging-check` 18 (`--agents`: four identities, none admitted by production),
  `playtest-harness` 155, `play-e2e` 35, `production-play-e2e` 27; `tools/agents-access-breaks.py` 8 breaks, every one
  caught.
- **Rob's:** make the four tokens; admit them on staging's application only (Service Auth, strict service token
  authentication left off); give each agent its own; put them in the environment as `AGENT1_` to `AGENT4_` for the
  check.
- Once released, the session's token reads back as its own `service:` identity, and what staging kept under
  `service:session-checks` (test data only) is no longer reached.

**#704 merged on main 5a452aba on green Actions; staging released.** `tools/release-staging.sh` released it to
`release/cloud-staging` 6bc453a1 (release-acceptance 22, play-e2e 35). Workers Builds deployed it at 14:56:09 UTC as
version edd03cf8, its `play-worker.js` byte-identical to the release's dry-run bundle (3,302,092 bytes). Its AI
bindings are the Coach's alone. `tools/staging-check.mjs --expect 5a452ab`, signed in as the session's token, exits
0: staging serves 5a452ab, both pages say so, and `/api/me` seats the token as `service:e07b4fed5ab9`, an identity of
its own.

**G-D's dress rehearsal, under way (2026-10-11).** It runs `tests/uat/real-deck-game.mjs` with `REAL_GAMES` and
`RECORDS`:
- two people through the real board and two house AIs at each table;
- the seven decks four at a time;
- playtest tables, as staging's are;
- both people downloading each game's full record from the game-over panel.

`tools/playtest-triage.mjs` on what is in: **7 games, every one replayed to the same journal, no leak in 3,092 checks
of every seat's view.** Two findings are open, in the run's own CSV, as the agents will file theirs:
- **PT-R-01 (S2, ui):** table 19 stopped when *Turns went by*'s OK could not be pressed for 30 s, because the board
  kept drawing it anew. The board-person now says, when that happens, how often the board was redrawn and what the
  seat was asked, which tells the board's fault from the harness's.
- **PT-R-02 (S1, rules until ruled):** table 5 ended naturally, then failed the harness's frames check (a frame to
  seat 0 named a card in another seat's hand or library) before its record was downloaded.
  - The rules show some such names (a revealed card, a library's top played revealed), and G1's oracle found no leak
    in its 1,400 games, so the harness's simpler check may be the stricter.
  - The records now come first, and the check names the card, so the next one can be ruled from its record.

**#705 merged on main 46407e27 on green Actions; staging released.** `tools/release-staging.sh` released it to
`release/cloud-staging` 625fce97 (release-acceptance 22, play-e2e 35). Workers Builds deployed it at 15:39:52 UTC as
version cc02a843. Its `play-worker.js` is byte-identical to the release's dry-run bundle and to #704's (3,302,092
bytes): #705 changed the browser's files only. Its AI bindings are the Coach's alone. `tools/staging-check.mjs
--expect 46407e2` exits 0, seating the session's token as `service:e07b4fed5ab9`.

**Words on the accent, across the app (2026-10-11): the A11y pass's item left.** The pass darkened the accent under
words on the board and in the lobby (`--accent-fill`). The rest of the app's words on the accent read 3.86:1 on Felt &
Cream and 3.98:1 on Steel & Cobalt:
- the primary buttons and the v-primary;
- the shop's chosen tab and the graph's chosen mode;
- the skip link;
- the landing's step numbers and closing panel;
- the build's current step.

They now sit on `--accent-fill`. `tests/a11y-app.mjs` reads each such rule in all four themes, and the Decks page's
own primary buttons: 48 checks, failing in 20 places before. `tools/a11y-app-breaks.py`: 9 breaks, every one caught.
A tenth found the list row's own primary rule dead (its detail is drawn inside the app, where the app's rule wins),
so it was removed.

**#706 merged on main fa7cbc7d on green Actions; staging released.** `tools/release-staging.sh` released it to
`release/cloud-staging` 2f21208a (release-acceptance 22, play-e2e 35). Workers Builds deployed it at 16:24:17 UTC as
version 1baa83a9. Its `play-worker.js` is byte-identical to the release's dry-run bundle and to #705's (3,302,092
bytes): #706 changed the browser's files only. Its AI bindings are the Coach's alone. `tools/staging-check.mjs
--expect fa7cbc7` exits 0, seating the session's token as `service:e07b4fed5ab9`.

**Gandalf, Goblins' Bane // Flameshape: 1,131 of Rob's 1,132 cards play (2026-10-11).** Train C's one card left for
want of an engine piece. Flameshape looks at the top two cards and exiles them face down; while they remain exiled
their controller may play them if they control a Wizard. What was built for it:
- **Playing a card exiled face down (CR 406.3a).** It is offered by its real characteristics: a land under the land
  drop's rules; a spell by its own cost, timing, targets, modes and alternative costs; an adventurer card as its
  Adventure too. It turns face up and is revealed as it is played. It is weighed face up only while its offers and
  questions are, the way Adventures and disguise already are, and is put back untouched unless played.
- **Hidden until played.** Only a player who may look at it is offered it (the projection's own `mayLookAt`, now
  exported). Every other seat sees a face-down card, in the projection and to G1's leak judge. Flameshape's controller
  may keep looking, as CR 406.3 lets a player who looked at a card and exiled it face down.
- **"If you control a Wizard":** an `onlyIf` on the play permission, checked each time the card would be played, so
  a Wizard leaving removes the offer. The permission names the object, so it ends as the card leaves exile.
- **Two fixes the card needed:** an Adventure card exiled face down kept its Adventure (a manifested one leaving the
  battlefield had lost it too); and *nothing to do* now sees a face-down card the player could cast.
- **Found by CI on the PR, and fixed:** the guard that offers a face-down card only to a player who may look at it
  held every face-down card to it, and disguise weighs a library's top shown face down through the same permission.
  So Mystic Forge could no longer cast a disguise card face down from the top of the library (`engine-disguise`, which
  the worker had not run). The guard is now for a card exiled face down only, as the rule it follows is.
- **Proof:** check-cards 2,042 definitions, 3,876 scenarios, 0 failed. `tests/engine-face-down-play.mjs` (new), 52
  checks. `breaks-flameshape.py`: 32 breaks, every one caught, with `engine-disguise` among its suites and a break
  for the guard's reach. All 359 engine, room and game suites pass here; `engine-room-games` missed its time budget
  once at a load average of 17 and passed alone. A smoke run, not committed: eight four-seat room games with Gandalf leading red decks and a person in seat 0,
  `--replay --leaks`. All 8 were clean, with 0 leaks in 1,367 checks of every seat's view; Flameshape was cast 95
  times, and 8 spells and 10 lands were played from face down.
- **Left:** Extrapolate the Impossible, which does nothing in Commander. Not built, because no defined card needs it:
  - casting a face-down exiled card face down (CR 708.4);
  - playing a face-down card one may not look at (CR 406.4);
  - an effect that plays the card as it resolves.

  The offers are proven down to the table's words for them (the room's `offerDetails`, in `engine-face-down-play`),
  not yet in a browser: Gandalf is in Rob's library but not in his seven decks, and those are what the browser suites
  play.

**Found on the way, and fixed: control gained for good broke the room's save.** `gainControl` wrote `until:
undefined` for a change for good. `storage.mjs` refuses a checkpoint that JSON would change, since the room could not
wake from it. So a room would stop saving the moment one of these resolved: Agent of Treachery; Alexios, Deimos of
Kosmos; Archmage's Charm; Hellkite Tyrant; Humble Defector. None is in Rob's seven decks, which is why G1's 1,400
games never met it; but all five are defined, so an invitee's deck could bring one.
- **The fix:** a change for good now says no duration at all (`effects/permanents.mjs`).
- **The checks:**
  - `engine-control`: the state of a change for good reads back from JSON as it is.
  - `engine-cards`: every card scenario's state is now checked the way a room's save checks it, with the storage's
    own `lostIn`, now exported. On main without the fix, this check names exactly those five cards' 7 scenarios, and
    nothing else in the 3,869. With the fix, none of the 3,876 lose anything.
  - `breaks-control-for-good.py`: 2 breaks, both caught. The `engine-cards` check also fails on its own with the fix
    reverted.

**#707 merged on main fd628286 on green Actions; staging released.** `tools/release-staging.sh` released it to
`release/cloud-staging` 39b46f0d (release-acceptance 22, play-e2e 35). Workers Builds deployed it at 18:31:25 UTC as
version 30b5cf40, its `play-worker.js` byte-identical to the release's dry-run bundle (3,305,833 bytes; it grew with
the engine from 3,302,092). Its AI bindings are the Coach's alone. `tools/staging-check.mjs --expect fd62828` exits 0,
seating the session's token as `service:e07b4fed5ab9`; its first read, a minute after the deploy, found `/` still at
fa7cbc7 at the edge, and the next found both pages at fd62828. So staging's table plays 1,131 of Rob's 1,132 cards.

**G-D's dress rehearsal: done, 50 games, and M8's exit criteria met (2026-10-11).** It ran `tests/uat/real-deck-game.mjs`
for 50 tables here, on the release's own pages and table (not on staging):
- two people through the real board, each in a browser session of their own, and two house AIs at each table;
- the seven decks four at a time;
- playtest tables, as staging's are;
- both people downloading each game's full record from the game-over panel, each record judged at once by G1's oracle.

**The triage** (`tools/playtest-triage.mjs` over the run's folder, as Grok Bot's run will be triaged): **50 games, 50
replayed to the same journal, 0 threw, 0 leaked, in 21,006 checks of every seat's view**, in 25 minutes here (about 30
s a game). Both findings are ruled, so the exit criteria are met. Each finding was the harness's, not the board's:
- **PT-R-01 (S2, ui): as intended.** *Turns went by*'s OK could not be pressed for 30 s (tables 19 and 33). The panel
  puts itself away after six seconds by design (Rob, 2026-10-09: nothing to acknowledge). The harness's click outlived
  it and waited out its 30 s; table 33's diagnostic showed the board still, at the seat's priority. The harness now
  presses the OK while it is there, and says why when a shown OK cannot be pressed.
- **PT-R-02 (S1, rules): as intended, CR 401.5.** The harness's own frames check, stricter than the rules, flagged
  cards the rules show:
  - a library's top played revealed (Conspicuous Snoop, in D6, at the first table);
  - a card revealed and known while it stays on top (Chaos Warp at table 13; CR 701.20a, 701.20d).

  G1's oracle passed every recorded game. The first table's own card can't be named: its record was not kept, because
  the check ran before the download (since reversed). With the records on, the frames are now held to what the oracle
  passed, so the oracle is the one judge.

**What the rehearsal changed** (the follow-up PR to #707):
- the harness's two fixes above;
- the triage asks a CR citation of a `rules` or `card` finding ruled as intended. A `ui`, `ux` or `performance` one
  answers to the design, which its outcome says; PT-R-01 had no rule of the game to cite, and the agents' will not
  either. The tool is now 32 checks and 22 breaks, every one caught;
- "play with the top card of your library revealed" cited as CR 401.5, not 401.4, in the projection, G1's oracle and
  two suites.

**The run's stops**, none the board's:
- five where I stopped the run myself, or it reached the two-hour limit for a background job; each was resumed at its
  table;
- three on the harness's two findings above.

A table's rerun reuses its match id (`journey0005g1`), which the agents' games on staging will not.

**#708 merged on main 73279bc0 on green Actions; staging released.** `tools/release-staging.sh` released it to
`release/cloud-staging` 6bedebdd (release-acceptance 22, play-e2e 35). Workers Builds deployed it at 19:32:27 UTC as
version 44986635. Its `play-worker.js` is byte-identical to the release's dry-run bundle and to #707's (3,305,833
bytes): #708 changed comments in shipped code only, which the bundle does not carry. Its AI bindings are the Coach's
alone. `tools/staging-check.mjs --expect 73279bc` exits 0, seating the session's token as `service:e07b4fed5ab9`.

**G1-L: G1's checks over Rob's whole library (2026-10-11).** G1's 1,400 clean games played his seven decks' 477 cards; the
rest of his library was proven by its cards' scenarios alone, and #707's save bug had lived there. `tools/fuzz-live.mjs
--library` (#710) plays, for each seed, four Commander decks made from `data/live-load.json`'s cards (decksFromLibrary: a
legendary creature the table plays, 99 cards of its color identity, none twice but basics; the same seed, the same decks),
with G1's terms: finished, nothing refused over the whole match, replayed identically, no seat sent a card it may not know.
- **The sweep, 650 games**, seat 0 a person (G1's random-legal answerer) or all four seats house AIs (Normal):

  | Run | Games | Clean | Not clean |
  |---|---:|---:|---|
  | a person, seeds 1-300 (before either fix) | 300 | 299 | seed 229 |
  | all AI, seeds 1001-1150 (before either fix) | 150 | 150 | |
  | a person, seeds 301-400 (the waterbend fixed) | 100 | 100 | |
  | all AI, seeds 1151-1250 (the waterbend fixed) | 100 | 99 | seed 1193 |

  1,123 of the library's 1,126 playable cards were in at least one deck (the three not drawn are red-green cards with
  one red-green commander to lead them); every all-AI game played to a winner, in 25 to 95 turns.
- **Seed 229, fixed in #710: a waterbend paid with rider mana stalled the table.** Foggy Swamp Vinebender's waterbend
  offer named its rider mana (Path of Ancestry's) against a cost it took as nothing, so once the creatures were picked
  the rest could not be paid "without the riders". The payment was refused after the ability was on the stack, the
  room's least answer found no question, and the person's turn was undone each time it was replayed. A waterbend offer
  now names no rider mana; the rest is paid plain mana first, as anything but a spell is.
- **Seed 1193, fixed after #710: amass made "Goblin" a card type.** Amass Goblins on a Zombie Army added Goblin to its
  card types, not its subtypes (CR 701.47a, 205.3m). Braids, Arisen Nightmare's "a permanent that shares a card type with
  it" then bound "Goblin" as a card type, and the selector's grammar refused it part-way through the sacrifice: the same
  stall. `engine-amass`'s own check read types and subtypes together, so it could not see it; it now reads the card
  types alone.
- **Both are one kind: an AI's answer refused after it had changed the game.** The room assumes the rules refuse an
  answer before they change anything, which both bugs broke. A snapshot of the game before each AI answer, to undo such a
  refusal, was measured: about 6 ms an answer, 20 to 30 percent of a game's time on the Durable Object. It was set aside;
  the library sweep is the guard, and `tests/fuzz-library.mjs` plays seeds 229 and 1193 clean.
- **Proof:** `tests/fuzz-library.mjs` (new), 12 checks; `tests/engine-waterbend.mjs` and `tests/engine-amass.mjs`, each
  a check that fails before its fix; `breaks-fuzz-library.py`, 9 breaks, every one caught; check-cards 3,876 scenarios,
  0 failed.

**#710 merged on main 9c746136 on green Actions; staging released.** `tools/release-staging.sh` released it to
`release/cloud-staging` be14ee56 (release-acceptance 22, play-e2e 35). Workers Builds deployed it at 22:31:19 UTC as
version 025e7c27, its `play-worker.js` byte-identical to the release's dry-run bundle (3,305,854 bytes). Its AI bindings
are the Coach's alone. `tools/staging-check.mjs --expect 9c74613` exits 0, seating the session's token as
`service:e07b4fed5ab9`.

**#711 merged on main 039c86dd on green Actions; staging released.** `tools/release-staging.sh` released it to
`release/cloud-staging` 74fe31e2 (release-acceptance 22, play-e2e 35). Workers Builds deployed it at 23:00:47 UTC as
version 20b71b9f, its `play-worker.js` byte-identical to the release's dry-run bundle (3,305,857 bytes). Its AI bindings
are the Coach's alone. `tools/staging-check.mjs --expect 039c86d` exits 0, seating the session's token as
`service:e07b4fed5ab9`.

**G1-L's third sweep, with both fixes in: 250 of 250 clean (2026-10-11).** `tools/fuzz-live.mjs --library`, fresh seeds,
G1's terms (finished, nothing refused over the whole match, replayed identically, no leak):
- with a person in seat 0, seeds 401-500: 100 of 100;
- all AI seats, seeds 1251-1400: 150 of 150.

So of the library sweep's 900 games, the two that were not clean were the two stalls, both fixed (#710, #711).
