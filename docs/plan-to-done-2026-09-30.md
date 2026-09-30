# The plan to done — from 2026-09-30 to "The app is ready for you and your invites to use!"

**For the executor (the next session, Opus).** This is the one plan: Rob's board findings of 2026-09-30 (Parts 1–2),
the AI program he asked for (Part 3), the roadmap's remaining items merged in (Part 5), a validation that the whole
of it covers the app's UI/UX, functional and non-functional requirements and its code's health (Part 6), and the road
to done with its gates and the two sentences Rob wants to hear, verbatim, only when they are true (Part 7).

**For the executor.** Rob walked staging.crankmagic.com with the board rebuilt to the wireframes (#443) and sent his
findings across several messages, with screenshots, then asked for them as a plan to execute later, with the AI
work added: the Coach wired in, AI players, an AI card loader that grows the card data as new cards are played, an
advisor agent that makes a very low-cost model good at recommending changes to a deck, and the connection between a
person's decks and the decks they can play. He wants the next session (Opus) to build it *without breaking the good
work on Play, sensitive to the connectivity throughout the app and cognizant of the UX.* Part 0 is where things
stand and the rules for building; Part 1 is every board item in his words with what the code and the rules say;
Part 2 groups them into pull requests; Part 3 is the AI program; Part 4 is their order and what Rob decides;
Parts 5–7 are the rest of the road.

## Part 0 — Status, and the rules for the executor

### What shipped on 2026-09-29 and 2026-09-30 (done)

| | |
| --- | --- |
| **#443 — the board to the r3 wireframes** | Merged 2026-09-30 on the local gate with Rob's approval. One playmat component at four sizes; Table, Focus and Full screen laid out as 2e, 2f and the Play Focus mock have them; the game fills the window; the strip's one line; ⟳ Rotate; the centered 400px card pop-up; Skip to end; `fit()` measuring the window. The record of what was followed: `docs/decisions-2026-09-29.md`. `tests/table-board.mjs`: 121 checks. |
| **#445 — New from Wizards** | Merged 2026-09-30. The newest release's precons (Multiverse Reforged, FRC, and the five FDC Foundations Commander decks, all out 2026-10-02) as one-click chips on the landing page and a tile at the head of the Decks grid, from `data/precons-latest.json`; `tools/build-precons.mjs --latest`. `tests/precons.mjs`: 28 checks. |
| **#444, #446 — the hand-off and this plan** | Docs only. `docs/ACTIVE.md` records staging and points here. |
| **Staging** | `release/cloud-staging` c3efae4 = main 64adacd (#443 + #445), Worker `crankmagic-staging` version `e6ba7cd2`, deployed 2026-09-30 13:59 UTC. Production is unchanged (version `2815a453`, main 9e20bfb) and stays so until Rob's go. |

Nothing in Parts 1–3 is built. Every item below is **not started** unless marked otherwise.

### The rules for building any of it

These are the things the executor must keep true. Most are in `AGENTS.md`; the rest were learned building #443.

1. **Read first:** `AGENTS.md`, `docs/ACTIVE.md`, `docs/handoff-2026-09-29.md`, `docs/decisions-2026-09-29.md`,
   and the wireframes the board follows (`docs/design/2026-09-25-redesign-r3/…/wireframes/wf2-screens.js`, the Play
   builders; `screens/Play Focus Mock.dc.html`). Rob's standing rule: **replicate the wireframes' shapes** and
   verify at real sizes before reporting (1280×720, 1400×900, 1920×1080, 2560×1080).
2. **The board's invariants** (`crankmagic-board.js`, `crankmagic.css` "PLAY IN THE CLOUD: THE BOARD"):
   - one playmat component, `mat(p, {size})`, at four sizes; never a second way of drawing a board;
   - sizes are measured by `fit()` (`--board-w`, `--mat-w`, `--mat-reserve`, `--full-w`, `--opp-w`, `--lap`), never
     guessed in CSS; `fit()` is synchronous so a board is never painted, or read by a test, at a fallback size;
   - the board is `position: fixed` over the app; the rail is under it; panels slide over the surface, never
     narrowing it;
   - `tests/table-board.mjs` (121 checks) is the board's proof and **no check is removed without Rob**; a change
     that moves a thing changes the check to read the new place, and adds one for what is new;
   - the Choose-mat preview's `.cm-mat-zone` rules are scoped to `.cm-mat-preview`; the board's zones share the
     class name. Keep them apart.
3. **Connectivity — the app is one shell.** Features register through `CrankFeatures` and speak through `C.*`
   (`C.go`, `C.modal`, `C.notice`, `C.button`, `C.commit`, `C.state`, `C.tableApi`, `C.board`); routes are
   `#decks`, `#cards`, `#discover`, `#game`, `#table?id=`; the table page hands the page to the board while a game
   is on (`crankmagic-table.js` → `C.board.show`). A change to one of these contracts is checked in every caller.
   A new data file is registered in `schema/index.mjs` with its JSON schema in `schema/`, named in
   `crankmagic-assets.js`, listed in `crankmagic-sw.js` (`DATA` or `RUNTIME`), and recorded by
   `node tools/data-manifest.mjs` and `node tools/data-inventory.mjs`.
4. **Every served file that changes moves its `?v=` pin** (`node tools/bump-pins.mjs <file>…`, then the chain it
   names — a pinned file that changes is itself bumped, so `crankmagic-sw.js` and then `crankmagic-app.js` follow —
   then `node tests/asset-versions.mjs --update`). The fixture records a hash per pin; an edit after a bump means
   another bump.
5. **The ratchets only go down:** raw hex in `crankmagic.css` (`tests/design-tokens.mjs`; use the tokens);
   UK spellings (`tests/feature-wiring.mjs`); the page budgets of controls and words before a page's main content
   (`tests/page-budget.mjs`: anything added above the Decks grid or the landing's doors must fit them — the
   New from Wizards strip moved into the grid for this reason); no size picked from steps (`data-size=` and S/M/L
   are refused — sizes are sliders, AGENTS.md).
6. **US English, US dollars, `en-US` dates**, everywhere (AGENTS.md).
7. **Decisions inside the game belong to the players**, and a behavior that would break a game is **refused with
   instructions** (AGENTS.md). Nothing is automated where the rules leave a choice; where they leave none, the
   code says so and cites the rule.
8. **The gate.** GitHub Actions is out on billing (the job is refused within seconds). A PR merges on
   `tools/local-ci.sh HEAD 2` — the workflow's toolchain on a clean worktree of the exact head merged with main,
   twice — and its PASS block goes on the PR before the merge. On Personal-HP the toolchain is Node 22 at
   `C:/Users/robmi/CrankMagic/workbench/node22/node_modules/node-win-x64/bin` (first on PATH; unset `UAT_CHROME`
   and `UAT_PLAYWRIGHT`), Playwright 1.56.0 with its Chromium in the repository's git-ignored `node_modules`, and
   `python3` with openpyxl. A run takes about 27 minutes. Stop a run only with its worktree left alone until its
   processes are gone.
9. **Releases:** staging first, from a commit of `main`, by `node tools/release-pages.mjs --ref origin/main
   --profile cloud-staging --commit` and a push of `release/cloud-staging` (Workers Builds deploys it; confirm with
   `wrangler deployments list --name crankmagic-staging`). Before a staging release that carries Play changes,
   `tests/uat/play-e2e.mjs` under wrangler dev. **Production only on Rob's go, every time.**
10. **Screenshots to Rob at each UI iteration**, from a fixture at real sizes; a four-seat fixture harness for
    the board is the pattern (the session of 2026-09-29 rendered every view from a hand-made view frame).
11. **AI costs money and touches privacy.** Everything AI goes through the door (`docs/ai-door.md`): Rob's four
    gates, the allowlist, the caps, the call log, and the privacy wording approved before the browser offers a
    feature. Nothing sends a hidden card, another seat's hand, an email, or a price paid.

## Part 1 — Rob's board findings, in his words

### A. The Choose mat dialog

1. Move **Use this mat** up beside the ✕ in the header; it becomes active once a mat is selected. Remove
   **Cancel** (the ✕ closes). — `crankmagic-table.js` `chooseMat()`; the footer is the app's `cm-form-footer`.

### B. The lobby

2. The person who started the table sees a small **Edit** button beside *Table rules* in the center panel —
   smaller than the page's other buttons, so the panel's text is not disturbed. — DELTA B.5 put the rules edit
   under *Host tools ▾*; Rob wants it on the panel. Today's rules are starting life 40, the seats, invitations a
   day, a dropped player five minutes; which are editable, and whether once a seat is ready, is his call at build.

### C. Table view, in game

3. **The background moves. Make it static for now.** — The living mat (`CrankSea`, random cycle at 45%) and the
   fan's crossfade. Draw one frame, or leave the felt.
4. **A draggable horizontal divider** between the other seats' row and your row; dragging it resizes the two
   rows against each other. — The boards are identical 16:9 by rule today; the rows' share becomes a person's
   choice, remembered on the device like the card size (AGENTS.md: sizes are sliders, and a divider is one).
5. **The same bar along the top of the hand tray**: dragging it resizes every board proportionally, all equal.
6. **A card-size slider in the hand and on the board**, each its own, superseding the one under Tools; when the
   Tools slider moves it sets the others to its value (Rob's preferred rule). — `--card-scale` is one value
   today; it becomes three scopes (table, hand, board), Tools writing all three.
7. **The commander, exile, library and graveyard cards sit on top of their frames, not inside**; they may cross
   the frame's bounds. — `.cm-board-pile` holds the card inside today.
8. **The mana-open and land-drop reminder goes directly outside and below the Lands frame**, bottom right,
   instead of inside at the top right. — `.cm-board-chip` in `mat()`.
9. **The life counter at the true center**: two to four pie slices, one per seat, the logo in the middle;
   clicking the logo opens Table vitals; in Table vitals a heart for life, a skull and crossbones for poison,
   nothing for commander damage. — This is wireframe 2e's center counter (`counter()` in `wf2-screens.js`: a
   conic disc, one quadrant per seat, the total on each), which the handoff's later addendum replaced with the
   vitals pills; Rob's call restores the counter beside the pills.
10. **"Pass priority" versus "Next step".** *"I want to be able to click Next Step to move between my steps
    instead. If there's not another reason to have Pass Priority, then simply update that text with Next Step;
    otherwise ideate on how to solve for both."*
    - The rules: a turn advances by priority. When every player passes in succession with the stack empty, the
      step ends (CR 117.4); when they pass with something on the stack, the top object resolves instead. So on
      your turn with an empty stack, passing *is* "next step"; with a spell on the stack, passing means "let it
      resolve"; on an opponent's turn, passing means "I do nothing here". One verb, three meanings.
    - **Idea, recommended: one button that says what passing will do.** *Next step* on your turn with an empty
      stack; *Let it resolve* when something is on the stack (naming it: *Resolve Lightning Bolt*); *Pass* on
      another player's turn. The same message to the room; only the label changes. Skip to end stays.
    - With item 11, *Next step* passes through steps where your only option is to pass, so one click lands on
      the next step where you can do something.
11. **In a two-player game the first player's first turn does not draw; why is the Draw step not skipped on
    Pass priority?** — CR 103.8a: the player who plays first skips the draw step of their first turn in a
    two-player game. The engine skips the draw; the step still happens, and the rules give priority in it
    (CR 504.2), so the room asks. **Idea: pass by itself in any step where your only legal action is Pass and
    the stack is empty**, and say so in the history ("Draw step: nothing to do"). Not a decision made for a
    player (AGENTS.md): there was no choice. Item 13 wants the opposite for the real draw; this is for empty
    steps only.
12. **"Your priority" beside another player's turn in the strip: does it need to be there?** — It is true (you
    receive priority in each of their steps, CR 117.3) and it is why Pass is enabled on their turn; it reads as
    noise. **Idea:** say what it means — *Bob's combat · you may respond* — and drop it once the button's label
    carries the meaning (item 10).
13. **Upkeep → Draw draws the card at once, then asks for another pass.** *"Don't auto draw at this transition.
    Once the user clicks Pass Priority (or Next Step), don't auto-take action but change the button to Draw
    Card."* — CR 504.1: the draw is a turn-based action at the start of the draw step, before anyone gets
    priority, and not a choice, which is why the engine does it unasked. Two ways:
    - **Show the draw as its own beat (what Rob asked for):** entering the draw step shows *Draw a card* as the
      one button; the click draws (the engine's turn-based action, held until the click), then priority follows.
      The same card; the player's timing. The room carries a "draw" acknowledgement in the draw step.
    - **Keep the automatic draw and make it visible:** the drawn card lifts in the hand and the strip says *You
      drew Island* until the next action. No rule bends; the surprise goes.
    Rob chooses; the first is his ask.
14. **The hand tray:** the count beside the ✋ (remove *Hand · 8*); remove *Bright = you can use it now*; keep the
    space for something hand-specific. **Ideas:** counts by type (*Lands 5 · Creatures 2 · Instants 1*);
    *castable now: 3*; the hand's card-size slider (item 6). The first two are the most useful in play.

### D. Focus view — generally good

15. **A draggable vertical divider** between the seat pane and your mat; the seat tiles grow with the pane, and
    past a certain width each tile becomes a miniature of that seat's real board — the battlefield and the
    lands, the cards on them. — The pane is 168px today; the mat is the largest 16:9 beside it (`fit()`), so
    it follows the divider. The miniature is the Table view's small board (`mat(p, {size: "table"})`) smaller.
16. **The History drop-down closes on a click anywhere outside it** (the ⌕ on the mat's band opens the same
    drop-down as History ▾). — A document `pointerdown` outside `#cm-board-history` and its button closes it,
    as the app's popover menus close.
17. **The Panel:** remove the word *Card* above the card; a tapped card is drawn upright there — either untapped,
    or upright with a small *Tapped* mark. — `panel()` draws `card(pick, {where: "pick"})`; `where` already
    varies a card's drawing by place. The same for Full screen's right column, the same card panel.
18. **A horizontal divider under the Panel's card**, dragged up or down: the card scales with the room above
    (5:7 keeps its height, R3.9), the history below shows more or less; remembered on the device. Full screen's
    right column gets the same bar between its card and its log.

### E. Across the views

19. **Leaving the board must not lose the game.** *"When a user clicks on the menu icon in the top left, then
    goes to Deck or other, the game should not be lost. When they click on Play again, it should take them back
    into the game if there's still a live game — humans or AI."* — Today the table page's cleanup closes the
    board and its socket on any route change (`crankmagic-table.js`, the `stop` closure → `C.board.close()`),
    and a closed socket starts the seat's five-minute drop clock at the room. The game itself lives on in the
    table's Durable Object; only the page forgets it. **The change:** the board's socket stays open across the
    app's pages (the board object outlives its DOM; drawing resumes when the table page is back); the Play tab
    opens straight onto a game of yours that is on, and a small *Game on · Turn 7 · Return* chip in the rail
    says so from any page. Only Leave, End game or the game's end close the socket.
20. **Full screen, rotated to another seat: the hand shows that seat's hand as card backs, using our CrankMagic
    card backs.** — Rotate keeps your own hand on the tray today. The room sends another seat's hand as a count
    only (`zones.Hand.count`), which is exactly what a row of backs draws. There is no card-back picture in the
    repository yet: `.cm-bcard.is-back` is a CSS stripe (`--card-back`). **Rob supplies the CrankMagic back**
    (his artwork, like the mats) or one is drawn from the wand mark; it goes in `assets/crankmagic/` and is used
    everywhere a back is shown (the library pile too).
21. **The Coach icon looks too much like Gemini's.** The ✦ glyph goes, everywhere the Coach is named (the strip,
    the pane, the phone rail, Full screen's rail, the Tools menu). **Idea:** the wand mark already stands for the
    app; for the Coach a distinct glyph — a whistle, a compass rose, or a small speech bubble with the wand —
    drawn once as an SVG and used in every place. Rob picks.
22. **In Full screen, clicking the Coach does nothing.** — Found the cause: Full screen asks the browser for the
    whole screen on `#cm-board`, and a browser shows only that element's subtree in fullscreen. The Coach panel
    (`#cm-board-coach`), the app's dialogs (`#cm-dialog`: Table vitals, Card zoom) and its notices live outside
    it, so they open invisibly. **The fix:** request fullscreen on the document, not the board; and, as Rob asks,
    in Full screen the Coach opens in the side column's lower half, under the log, instead of the 400px slide-over.
23. **In Full screen, the Tools gear's menu is a mess** (buttons overlapping: *Recommended actions*, *Table
    vitals*, *End game*, *Concede*). — Found the cause: the rail's rule that squares its icon buttons
    (`.cm-full-rail .v-button{width:36px;height:36px;padding:0}`) reaches into the menus the rail opens. Scope
    it to the rail's own buttons.
24. **The history icon in Full screen's rail is ☰, the same as the menu.** A clock is the history's icon,
    everywhere: the rail, the strip's History ▾, the band's ⌕ where it means "open the history".
25. **In every view — Table, Focus, Full screen, and Full screen once the browser's fullscreen is left — the
    bottom of the hand's cards is cut off.** Scrolling does not move the board, and need not; the cards must be
    whole. — The hi-fi mock docks the tray over the mat's foot with the cards peeking, and that is what was built.
    Rob's call: **the hand is whole in every view**; the tray is a full row and `fit()` takes its height from the
    boards' room, in every view, so nothing is ever below the window's edge.

## Part 2 — The board's pull requests, in order

Each is one proven PR (the gate green on the head; the walk where a screen changes; screenshots to Rob). Items that
need Rob's decision are marked; the rest are his words as written.

| PR | Items | What is proved |
| --- | --- | --- |
| **B1. The bugs seen today** | 22 (fullscreen on the document; the Coach in the side column), 23 (the rail's rule), 24 (the clock), 21 (the Coach glyph — Rob picks), 16 (History closes on an outside click), 17 (the Panel's card), 25 (the hand whole in every view) | `tests/table-board.mjs`: in browser fullscreen the Coach and Table vitals are visible; the Tools menu's buttons do not overlap; the hand's last card's bottom is inside the window in all four states at 1400 and 1280; the History drop-down closes on an outside click; the Panel shows a tapped card upright |
| **B2. The game survives the pages** | 19 | The board suite: navigate to Decks and back to Play mid-game; the socket count stays one; the room never marks the seat away; Play opens the game; the chip shows on Decks |
| **B3. The lobby's two** | 1, 2 (which rules are editable — Rob) | `tests/table-lobby.mjs`: Use this mat beside ✕, enabled on a pick, no Cancel; the host's Edit, its dialog, a guest sees none |
| **B4. Table view's shape** | 3, 4, 5, 7, 8, 9, 6 | The board suite: the sea still; the row divider drags and is remembered; the hand bar resizes all four equally; piles' cards overlap their frames; the chip below the Lands; the pie counter's slices and totals; the three card-size scopes and Tools writing all three |
| **B5. The turn's words and beats** | 10, 12, 11, 13 (the draw as a beat — Rob chooses) | The board suite: the button reads Next step / Let it resolve / Pass in the three cases; the strip says whose step and that you may respond; an empty step passes itself and says so; the draw waits for its click (if chosen) |
| **B6. The hand tray** | 14 (what fills the space — Rob picks from the ideas) | The board suite: the count by the ✋; the type counts; castable now |
| **B7. Focus and Full screen** | 15, 18, 20 (the card back — Rob supplies) | The board suite: the pane divider drags and the tiles become miniatures past the width; the Panel's divider; Rotate shows the other seat's hand as backs, never a face |

## Part 3 — The AI program

Rob, 2026-09-30: *"Include in this plan wiring in the CrankMagic Coach AI as well as the AI card loader component
and AI players. I also want to use AI on making update suggestions to a deck given the parameters of the deck, the
deck type and the cards within the deck, on the bench or consider to buy. These recommendations will come from an
agent we'll build that will allow a very low cost AI model to be very good at making sound recommendations to
seasoned Magic the Gathering players. The AI also, when a deck is brought into Play, to recognize cards not already
loaded, where the AI then recognizes the card, captures the required information and updates our database so that
it organically grows as new cards are used. I want the connection between the user's decks and the available decks
to play."*

This sits on what exists: **the AI door** (M6, `cloud/ai.mjs`, `docs/ai-door.md`: one route today,
`POST /api/ai/explain`, shut until Rob's four gates are set), **the Coach shell** (#414: the chat panel with a stub
reply), **the house pilot** (`game/engine/pilots/house-pilot.mjs`: the engine's own opponent, free), **the card
extraction design** (`docs/plan-card-extraction-skill.md`; M7 in `docs/plan-to-100.md`), **the agent designs**
(`docs/ai-agents.md` §2 deck strategy, §3 copilot recommendations, §6 a chat), and the rule that shapes all of it:
**a model chooses only among what the code offers it, and every card an answer names must be one that was sent.**

### The shape shared by every AI feature

- **The Worker is the only caller.** The browser never holds a key. Each feature is one route under `/api/ai/*`,
  behind the door's gates: the AI Access application, the allowlist, the key, the two caps (per person and for
  everyone, over 24 hours), and the call log that records who, the feature, the model, the tokens, the cost and the
  outcome. The caps are checked before a call, on the worst case. `cloud/ai.mjs`'s price table gains the current
  models (Claude Opus 5.5 `claude-opus-5-5` $4/$20 per million tokens, Claude Sonnet 5.5 `claude-sonnet-5-5`
  $2/$10, Claude Haiku 4.5 `claude-haiku-4-5` $1/$5, cache reads a fifth of input), and an unknown model is still
  priced at the dearest rate. Each feature has its own `AI_MODEL_<feature>` so Rob sets a model per job.
- **The agent is code; the model judges.** For each feature the Worker assembles a *brief* deterministically from
  the library and the game — the facts, the candidates, the constraints — and asks the model to choose and explain
  among the candidates only, with structured output (`output_config.format`, a JSON schema per feature) so the
  answer is data the app can check, never prose to parse. This is what makes a low-cost model good: the hard
  work (what is legal, what is owned, what fills a gap, what a card does) is done by the code that already knows
  it; the model reasons over a curated page, not over Magic.
- **Grounding is a gate, not a hope.** An answer naming any card, seat or action that was not in the brief is not
  shown; the log records it as ungrounded (the door does this today for `[[names]]`; the structured schemas make it
  a field check).
- **The stable prefix is cached.** Each feature's system prompt and vocabulary (the roles, the card states, the
  rules of the brief) come first and never change between calls; the brief follows. Prompt caching then makes
  the repeated part nearly free.
- **Effort low or medium; adaptive thinking; streaming where a person waits** (the Coach). Never a refusal shown
  raw: the door's fallback (`fallbacks: "default"`) re-runs a declined request server-side, and a 422 says so.
- **An eval before a model is trusted with a job**, kept in the repository: for the advisor, Rob's seven decks with
  changes he would make himself as the rubric; for the card loader, the cards of the seven decks against their
  oracle text and a smoke test in the engine; for the Coach, a set of board states with the plays a seasoned
  player would name. The eval is the thing that lets a cheaper model replace a dearer one on evidence.
- **Privacy.** What each feature sends is listed in `privacy.html` before it is offered, and Rob approves the
  wording (door step 5). Nothing sends a hidden card, another seat's hand, an email, a library, or a price paid.

### AI-1. The Coach, wired

*Rob's ask:* the Coach answers for real. *Today:* the chat panel (#414) with turn dividers, prompts, a composer and
a stub reply that says it is not switched on; in Full screen it will live in the side column under the log (item 22).

- **The route:** `POST /api/ai/coach` with the asking seat's own view (the same projection the room sends that seat
  — its hand, every public zone, the history's last lines, the decision it is being asked) and the question. Never
  another seat's hand; the projection cannot carry it.
- **The brief:** the board as a table (each seat's life, poison, commander damage, permanents with their state;
  your hand with what each card can do *now*, from the decision's options; the stack; the step); the last twenty
  history lines; the question; and the reply schema: `{answer, plays: [{card, action, why}], threat: {seat, why},
  show: [cardIds]}` — every `card` and `seat` must be in the brief.
- **The panel:** streams the answer as it comes (the Worker passes the stream through); replies carry the action
  chips the shell already draws (*Show me* highlights the named cards on the mat; *Why?* expands the reasoning);
  turn dividers as now. The Coach never acts: it names a play; the person makes it.
- **Model and cost:** Rob sets `AI_MODEL_coach`; the plan proposes Claude Sonnet 5.5 at low effort for a chat that
  must answer in a few seconds, with the eval deciding whether Claude Haiku 4.5 answers as well. Each game has its
  own cap (a Worker variable) on top of the person's.
- **Proof:** `tests/ai-door.mjs` grows a coach section with a stubbed provider: grounding refused, the cap
  refused, a streamed answer's chips; `tests/table-board.mjs`: the Coach's answer and *Show me* highlighting the
  card. The privacy wording, approved, before the switch.

### AI-2. AI players

*Rob's ask:* AI players at the table. *Today:* the lobby's AI seats are the house pilot (free, sees only its seat,
plays what the engine offers); the LLM seat is M6's "through the door".

- **The pilot is a choice provider.** The room asks a seat's pilot for its answer to each decision exactly as it
  asks a person (`game/room/room.mjs` drives pilots the same way). An **LLM pilot** is a second provider beside
  the house pilot: it receives the seat's projection and the decision's options, and returns one option's index.
  It cannot invent an action (the `api-choice-provider` rule from the Forge pilot, kept).
- **The brief:** the seat's view as in AI-1 plus the decision's options, each with what it does; the schema
  `{index, why}`; the house pilot's own evaluation of each option included as a hint, so the model corrects a
  heuristic rather than starting from nothing.
- **Cost control:** the LLM seat is chosen in the lobby's AI configurator (the wireframe's *commander · style ·
  difficulty · pilot*); it costs per decision, so the pilot asks the model only at decisions that matter (a choice
  among more than one non-pass option; mulligans; blocks; targets) and answers priority-with-nothing-to-do itself.
  A per-game cap; when it is reached the seat finishes on the house pilot and the table says so.
- **Model:** Rob sets `AI_MODEL_pilot`; Claude Haiku 4.5 at low effort is the candidate, measured against the house
  pilot over 100 seeded games (M4's gate G1 harness) before a table offers it.
- **Proof:** the engine's determinism holds (the tape records the answer, not the model); `tests/game-room.mjs`
  gains an LLM pilot with a stubbed provider; the lobby suite the configurator's pilot choice; M8's playtests use it.

### AI-3. The card loader: the data grows as cards are played

*Rob's ask:* when a deck is brought into Play, cards the engine does not know are recognized by the AI, which
captures what is needed and updates the data, so it grows organically with use. *Today:* the engine plays basic
lands only; a deck with a card it has no definition for is refused by name (decision M4, 2026-09-25); M7 is the
compiler and the AI reconciliation for every card; the extraction design is written.

- **Where it runs:** at *Prepare decks* in the lobby, when a seat's deck is chosen. The table asks the engine which
  of the deck's names it can play; for the rest, the loader is asked. The seat shows *Pending deck · learning 12
  cards* with progress; a card that cannot be learned is refused by name with instructions (the existing rule).
- **What is captured, and how it is checked** — the extraction design's four checks, run in the Worker:
  1. **the oracle text and the printed facts** come from the data already committed (`data/engine/oracle.json`
     holds the 31,830 Commander-legal cards' text and types), never from the model;
  2. **the model writes the card's script** (`CrankCardScript@1`, the engine plan's format) from the oracle text,
     with structured output against the script's schema;
  3. **fidelity:** a second pass reads the script back against the oracle text and answers a checklist (every
     ability present, costs right, targets right, zones right); a mismatch is a refusal to store;
  4. **the smoke test:** the script is loaded into a scratch engine and the card is cast, resolved, and its
     abilities activated in a seeded scenario; an exception or an illegal state refuses it;
  5. **CR adjudication** where the checklist flags a rule (layers, replacement effects, copy): the citation is
     stored with the script, and the script is marked *provisional* until an M8 playtest or Rob confirms it.
- **Where it is written:** a `card_scripts` store in the cloud (D1 rows keyed by the card's oracle id, with the
  script, its checks' results, the model, the cost, and provisional or confirmed) that the engine reads through
  the M4 storage adapter, and a nightly export to `data/engine/scripts/` in the repository so the data is versioned
  and reviewable, as the extraction design asks. A card is learned once, ever; the second deck that brings it
  loads at once.
- **Cost:** once per card. The model for extraction is the accurate one, not the cheap one: Rob sets
  `AI_MODEL_loader`; Claude Opus 5.5 at medium effort is proposed for the script, Claude Haiku 4.5 for the
  fidelity read-back. A deck of 99 unknown cards is under a dollar at list prices; the ledger is the control, and a
  per-table cap stops a runaway. The seven decks' 477 cards are the first batch (M4's tier 0), run as an offline
  job by Rob rather than at a table.
- **Proof:** `tests/engine-*`: a learned script passes the four checks; a deliberately wrong script fails each
  check; the lobby suite: a deck with unknown cards shows learning and then ready; the refusal with instructions
  for a card that fails; the eval: the seven decks' cards against their oracle text.

### AI-4. The deck advisor: sound changes from a very low-cost model

*Rob's ask:* AI suggestions to update a deck, given its parameters, its type, its cards, the bench, and what to
consider buying — from an agent that lets a very low-cost model be very good at advising seasoned players.
*Today:* the workshop measures a deck (`deck-measure.js`, the simulator, the roles ladder in `crankmagic-lens.js`,
the strategies in `crankmagic-strategies.js`), knows every card's state (`docs/card-states.md`: in the box, a
substitute, reserved, ordered, to buy, watching, on the bench), the prices, the EDHREC ranks and the co-play graph
(`data/graph.json`); "explain the score" reads the measure back (M6's first feature); `docs/ai-agents.md` §2–3
sketch strategy considerations and copilot recommendations.

- **The route:** `POST /api/ai/advise` for one deck. The browser sends nothing but the deck's id and the person's
  question or goal (*"make it faster"*, *"more removal under $20"*, or nothing); the Worker reads the library it
  already holds for that person (the cloud library, Stage 2) and builds the brief itself.
- **The agent (code) builds the brief:**
  1. **the deck's parameters:** commander(s) and color identity, bracket, the cost cap, the strategy chips
     (`CrankStrategies.optionsFor`), the deck's type and what it wants to do (from the guide, `data/deck-guides.json`);
  2. **the measure:** the score and its figures, the roles ladder with each role's count against its target
     (*Removal 6 of 8*), the mana curve, the color pips against the lands, the weakest cards by the simulator;
  3. **the hundred**, each card with its role, its state, its price and its rank;
  4. **the candidates, found by the code, not the model:** cards on the bench, on the To buy list, on Watching,
     and — only if asked — not owned, all inside the color identity and the bracket, each scored by the roles it
     fills that the deck lacks, by co-play with the commander in the graph, by EDHREC rank and by price against the
     cap; the top thirty are the brief's candidate list, no more;
  5. **the constraints:** the cap, the bracket's game-changer limit, what may not leave (the commander, cards Rob
     marks kept), and the ask.
- **The model chooses and explains**, structured: `{changes: [{out, in, role, why, price_delta}], keep: [...],
  summary}` where every `out` is in the hundred and every `in` is a candidate. Nothing else is accepted.
- **The answer is a review, never a change.** It lands in the deck's *Make the change* flow (`crankmagic-change.js`)
  as proposed swaps the person ticks; the library changes only on their commit, through the same review a pasted
  list gets. A tick on a card not owned goes to To buy at its price.
- **Model and cost:** Rob sets `AI_MODEL_advise`. The candidate is **Claude Haiku 4.5 at low effort**, because the
  brief carries the analysis; the eval decides. The stable prefix (the roles, the card states, the rules of the
  brief) is cached; a brief is 8–12K tokens; a call is a cent or two at list prices.
- **The eval (built first):** Rob's seven decks, each with the swaps he would make himself and the ones he would
  refuse, as a rubric of sound versus unsound; the agent is run on Haiku 4.5 and on Sonnet 5.5 and the scores are
  the evidence for the model chosen. The eval lives in `tests/ai-advise-eval/` and runs only when asked (it spends).
- **Proof:** `tests/ai-door.mjs`: the brief's shape from a fixture library (candidates inside the identity and the
  cap; the weak roles first; never a hidden field); grounding refused; the review flow receives the swaps; the cap.

### AI-5. Your decks and the decks you can play — the connection

*Rob's ask:* the connection between the user's decks and the available decks to play. *Today:* the table's Change
deck lists the library's decks that have a commander (done, #409), and a finished game files its result under the
deck it brought (done, #418); but the engine refuses a real deck until its cards are known, so the decks and the
table are not yet one thing.

- **A deck says whether it can be played**, on its tile and its page: *Playable at the table · 87 of 100 known ·
  13 to learn*, read from the engine's ledger through the Worker; the learn happens through AI-3 when the deck is
  chosen, or ahead of time from the deck page (*Prepare for Play*).
- **Play this deck** on the deck page: opens a new table with the deck already at your seat, or offers your open
  table. **New from Wizards → Play:** a precon's chips gain *Play it* (the precon becomes a library deck, then a
  table, in one flow).
- **The table's Change deck** shows the same readiness beside each deck, and the Basic lands test deck stays until
  a deck of Rob's is playable end to end.
- **After the game:** the record and the result file back as they do; the deck page's Record gains the game's
  history line.
- **Proof:** `tests/decks-hub.mjs` and `tests/deck-page-r3.mjs`: the readiness line and *Play this deck*;
  `tests/table-lobby.mjs`: the deck arrives at the seat; `tests/precons.mjs`: *Play it*.

## Part 4 — The order, the estimates, and what Rob decides

**Order.** B1 first (bugs, a session). Then B2 (the game survives the pages; touches the table page and the
board; a session). Then the AI door's gates, which are Rob's own steps (`docs/ai-door.md` 1–5) and gate every
AI-* PR; AI-4's eval and AI-3's first batch can be built while the gates wait, since both run offline. Then, in
parallel tracks: the board's B3–B7 (one session each, B4 two), and the AI program AI-4 (the advisor: two sessions,
eval first), AI-3 (the loader: three sessions, on M4's script format), AI-1 (the Coach: two sessions), AI-2 (the
pilot: two sessions), AI-5 (the connection: one session, after AI-3 makes a deck playable).

**Decisions for Rob**, gathered:

| # | Decision | Recommended |
| --- | --- | --- |
| 2 | Which table rules the host may edit, and whether once a seat is ready | Starting life; not once any seat is ready |
| 13 | The draw as its own beat (a *Draw a card* click) or automatic and visible | His ask: the beat |
| 14 | What fills the hand tray's space | Counts by type, and *castable now* |
| 20 | The CrankMagic card back | His artwork, like the mats |
| 21 | The Coach's glyph | A speech bubble with the wand |
| AI | The door's five steps (`docs/ai-door.md`): the Access application, the allowlist, the key, the caps, the privacy wording | — |
| AI | A model per job: `AI_MODEL_coach`, `_pilot`, `_loader`, `_advise` | Sonnet 5.5 · Haiku 4.5 · Opus 5.5 · Haiku 4.5, each held to its eval |
| AI | The advisor's rubric: his own swaps for the seven decks | An afternoon of his, before AI-4 is judged |
| AI | Whether the advisor may name cards he does not own | Only when asked, priced against the cap |

## Part 5 — The roadmap's remaining items, merged in

`docs/plan-to-100.md` (M1–M11, Rob's decisions of 2026-09-25 at its foot) is the road; this section lists what on
it is still open as of 2026-09-30, corrects boxes that the road left unticked although the work shipped, and says
where each item now sits against Parts 2 and 3. `docs/plan-groups.md` (the library's groups, G1–G8) and
`docs/plan-data-sync.md` (M2) keep their own detail.

### Corrections: done on the road, not yet ticked there

- **M5** — the game room (#406), the table and its front door (#407), leaving a game (#408), the lobby to 2b
  (#409), the board (#410–#416, then #443 to the wireframes), results back to the library (#418), the refusal
  with instructions (#417), the Play release profile on staging (#437), the reconnect and the five-minute drop
  clock, hidden information proved in `tests/table-board.mjs`. Still open in M5: card definitions served to the
  room from R2 or KV rather than bundled (14 MB; AI-3 needs this store); the **audio pack in the cloud board**
  (the local host played it; the cloud board plays nothing yet — added below as B8); the launch gate's live
  MP-07–MP-09 checks; the speed rule measured over the network.
- **M1** — R3.0–R3.12 shipped (#376–#404); the r3 decisions were made 2026-09-25.
- **M8** — M8a (the decision tape and replay) and M8b (the record download) shipped; the findings template
  exists. Open: the agents' access, the two kinds of seat, the triage loop, the exit run, the game night.
- **M10** — the Lab's data-driven strategy shipped (R3.11); the "new version, Reload" prompt shipped.
- **M11** — the architecture page shipped (#375).

### Open, by milestone, and where it now sits

| Milestone | Open items (`docs/plan-to-100.md`) | Where it sits now |
| --- | --- | --- |
| **M2 data** | Live-first reads set by set; stores kept only where §0 says; the adjudication log; the scheduled CR check; About shows every data set's date and stale labels; a game pins its data version; **Rob:** R2 on, the token, the schedule; the bucket; a scheduled refresh; publish to R2 with `current.json`; the Worker serves `/data/*` from R2; the app reads `current.json`; About's "prices refreshed today"; precons in the refresh (done: `tools/refresh.mjs` runs `build-precons.mjs`); split `graph-played.json`; Scryfall's and EDHREC's terms | **Track D (data), after Rob's R2.** The scheduled refresh was to be a GitHub Actions run; Actions is out on billing, so the schedule is either Actions once billing is restored (which also restores CI) or a Cloudflare Cron Trigger calling a refresh Worker — **decision for Rob** (recommended: restore Actions billing; it is the smaller change and CI needs it too) |
| **M3 ops** | Monitoring (Workers logs, an alert on 5xx and sync conflicts, a weekly check; **Rob:** the alert email); backups (D1 Time Travel's window; a nightly copy to R2); invites (Rob, ongoing; the 50-person cap); how Rob's workbook reaches his library; the program document's sync note | **Track O (operations)**, before the human-invites gate (Part 7, G-E): monitoring and backups are a session; the rest is Rob's |
| **M4 engine** | Keyword families for the seven decks (2.3); the scenario runner and `cards/index.mjs` (2.4); **tier 0, the 477 cards** (phase 3); PLAN §5/§7 suites (performance budgets, card scenarios, the bridge contract); deck legality against a dated banned list; the CME history event contract; **gate G1** (seven decks, 100 games each against house pilots and random pilots, zero exceptions, identical replays, no leaks); Rob's calls (Forge's role — dropped; unsupported cards — refused by name, compiled once M7 lands) | **The critical path to a real game.** Tier 0's 477 cards become **AI-3's first batch** (the loader run offline by Rob on the seven decks), with the hand-authored scenario tests kept as the loader's eval; the keyword families and the runner stay engine work (three to four sessions); G1 is the gate before Grok Bot plays real decks |
| **M5 Play** | Card definitions from a store, not bundled; the audio pack; the live hidden-information checks; the speed rule; **Rob:** who plays v1 (decided: the invite list), Workers Paid when CPU passes 10 ms | The store is AI-3's `card_scripts`; **B8, the audio** (below); the checks and the speed rule are the end-to-end test gate (Part 7, G-B) |
| **M6 door** | Rob's five steps; through the door: LLM seats, the Coach, the workshop's features; the privacy wording | **AI-1, AI-2, AI-4** (Part 3); the steps are Rob's, and gate every AI PR |
| **M7 every card** | 6.1–6.3 on a 200-card sample (**Rob:** approve the spend); AI card reconciliation; 6.5–7.5; **gate G4**; phases 9–10 | **AI-3 is the online half** (a card learned when first played); the offline compile of the 27,000 in-vocabulary cards remains M7 and comes after the loader has proved its four checks on the seven decks |
| **M8 playtests** | Access for the agents (**Rob:** four service tokens or invited test addresses, staging only); the two kinds of seat; the triage loop; the exit run of 50 games; **Rob:** a game night | **Part 7, G-D**, with a new item: **a harness note for Grok Bot** (the routes, the stable selectors and ARIA names the board exposes, the record download, the findings template) so the "simulating a human" agents drive the real board |
| **M9 cutover** | `CRANKMAGIC_ENGINE` defaults to `crank`; Forge's tools and the LICENSE §4(a) removal; **Rob:** delete `forge`, `runtime`, `forge-oracle` and the two variables; freeze the local host's documents | After G1: one session, then Rob's deletions |
| **M10 finishing** | The Coach (→ AI-1); accounts' later features (**Rob:** if still wanted: read-only deck links, several libraries, To Trade hosted, playgroups); spectators (if wanted); the workshop queue (W.4–W.7 leftovers; BACKLOG #1, #4, #5 if wanted); the ratchets down | Rob's "if wanted" items are decisions (Part 7); the ratchets ride every PR |
| **M11 architecture** | Retire github.io from `main`; **Rob:** `www` redirect, SPF/DKIM/DMARC, GitHub Pro, the Cloudflare MCP; mark the superseded documents; fix the engine documents' disagreements | Docs and Rob's dashboard; one session for the documents |
| **Groups (`plan-groups.md`)** | G3d automatic reservations (D4 answered 2026-09-28 — check the plan's status row before building), G6b-1/2 the status breakout and the sorting space (after Rob has seen By group), Upgrades in the import, the appearance plan A1–A4, G8 card size per view (done as R3.9b; the per-container sliders of item 6 extend it) | Track W (the workshop), after the board's B-series |
| **Hand-off's waiting list** | The production release of main (Rob's go); the Google login method's name; the login page logo after his privacy review; the Cloudflare API token's expiry | Rob's |

### Added by this plan (found while merging)

- **B8. The audio pack in the cloud board.** The 88 clips (`docs/plan-play-audio.md`) played on the local host
  through `play-audio.mjs` and `play-audio-events.mjs`; the cloud board has no audio. Port the three modules to the
  room's history events (the CME history contract of M4 is what they read), with the gesture rule kept (the context
  built inside the first `pointerdown`). Proof: the clips a real game plays, in `tests/table-board.mjs`.
- **A harness note for Grok Bot** (M8): `docs/playtest-harness.md`.
- **An accessibility pass on the board and the lobby** (Part 6).
- **A browser and device matrix** for the end-to-end walk (Part 6).

## Part 6 — Validation: does the whole plan cover what the app needs?

The remaining plan (Parts 2, 3, 5) was read against four questions. Where it fell short, the item was added.

**UI/UX.** The r3 design is built (M1) and the board now follows its wireframes (#443); Parts 1–2 carry Rob's
walk of it; mobile Play is landscape-only Focus (#415) and the workshop has its phone layouts (R3.12). Journeys:
`tests/uat/crankmagic-journeys.mjs` walks the workshop (505 checks), `tests/uat/release-acceptance.mjs` the release,
`tests/uat/play-e2e.mjs` a game under wrangler dev. **Gaps, added:** (1) **an accessibility pass** — WCAG 2.1 AA
on the board and the lobby: contrast of the zone labels and chips over artwork mats, focus order through the strip
and the mat, the keys the board already has (Space, 1–9, Enter, Escape, ⌘/Ctrl ±) documented in Help, every card's
`aria-label` carrying its state, the pop-up announced; a session, with `tests/browser-geometry.mjs` extended;
(2) **a browser and device matrix** for the end-to-end walk: Chrome, Edge, Safari and Firefox on the desk; Safari on
an iPhone and Chrome on an Android phone in landscape for Play; the walk records which pass; (3) **the end-to-end
UX walk of Play through the real UI** — a four-seat game with the seven decks, every view, a phone seat, the Coach,
the record — as one suite (`tests/uat/play-journeys.mjs`), which is the proof behind the first sentence of Part 7.

**Functional.** Decks, Library, Explore and Play, accounts and sync, imports, precons, the measure, groups: built
and walked. The one thing the app cannot yet do is **play a real deck**: the engine plays basic lands. That is the
critical path — M4's keyword families and gate G1, with AI-3 learning the seven decks' cards — and everything in
Part 7 after G-B depends on it. AI-5 then joins the library's decks to the table. Audio (B8) completes the board.

**Non-functional.** *Security and privacy:* Access guards the API (the Invited policy), the AI door's own
application and allowlist, hidden information proved by inspecting every frame, the secrets scan in the gate, the
privacy page before any AI feature; *reliability:* the room resumes from any decision, sockets reconnect, a dropped
seat has five minutes, D1's Time Travel — and **monitoring and backups (M3) are the open items**, scheduled before
human invites; *performance:* the page budgets, the board measured at four sizes, the engine's budgets in PLAN §5,
Rob's five-second rule measured over the network at G-B; *cost:* the AI caps and the call log, Workers Paid when CPU
passes 10 ms (Rob), Actions billing (Rob) so CI and the scheduled refresh run; *offline and updates:* the service
worker's precache and its "new version, Reload" prompt; *data freshness:* M2, waiting on R2; *observability:* the
AI call log, Workers logs once M3's alerts exist.

**Code health.** 182 suites with the browser ones required, run twice on a clean worktree before every merge; the
ratchets that only go down (raw hex, UK spellings, page budgets, no size steps); one component per thing (the
playmat; the card; the slider); the schema registry and the data manifest; every served file pinned. **Held, not
added:** a change that adds a second way to draw a board, a second card-size mechanism, a hex color, a step picker,
or a suite that cannot fail (AGENTS.md: break it, watch it go red, restore it) is a change to refuse.

**Verdict.** With the four additions (A11y pass, the browser matrix, the Play journeys suite, B8 audio) the remaining
plan is sensible for this build and covers the app's UI/UX, functional and non-functional requirements. Its risk is
sequencing, not scope: **nothing in Part 7 after the staging merge means anything until a real deck plays**, so M4
and AI-3 are worked first among the long items, alongside the short B-series, and every session ends with a merge.

## Part 7 — The road to done: the gates, in order, and the two sentences

Each gate is passed only on its proof. The executor reports a gate as passed by naming the commands that proved it
and their counts; the two sentences Rob wants to hear are said verbatim, once, only when every claim in them is
true, with the proof beneath.

| Gate | What must be true | Proof |
| --- | --- | --- |
| **G-A Build** | Parts 2, 3 and 5's items built, each merged on the gate with Rob's approvals: B1–B8, the AI door's steps (Rob), AI-4 (eval first), AI-3 (the seven decks' cards learned and confirmed), M4's keyword families and G1, AI-1, AI-2, AI-5, M3's monitoring and backups, M2's data track once R2 is on, the A11y pass, the harness note | Each PR's local-gate PASS block; G1's 1,400 games with zero exceptions, identical replays and no leaks |
| **G-B Test end to end** | *Technical:* the whole gate green twice on `main`; `tests/uat/play-e2e.mjs` under wrangler dev; the engine gates; the hidden-information inspection of every frame; the five-second rule measured over the network. *UX:* `crankmagic-journeys.mjs` (the workshop) and the new `play-journeys.mjs` (a four-seat game with the seven decks through the real UI, every view, a phone seat, the Coach, the record) at 1280, 1400, 1920, 2560 and a phone in landscape; the browser and device matrix; the A11y pass's checks; screenshots to Rob at each size | The suites' counts; the matrix table; the screenshots |
| **G-C Staging** | The release built from `main`, `release-acceptance.mjs` green on it, pushed to `release/cloud-staging`, Workers Builds green, the version read back from `wrangler deployments list`; the harness note published for Grok Bot; the four agents' access set by Rob | The release commit, the version id |

**Then, and only then, the executor says:**

> The plan is complete, the app has been tested end to end both technically and from a user experience perspective
> on their journeys. It has been merged to staging.crankmagic.com. It is ready for Grok Bot to run an agent workforce
> across the app for UAT testing, including full game play end-to-end. I'll await Grok Bot's response, make any
> changes, merge to staging.crankmagic.com for you to then test a set of human invites, then for you to perform your
> final review, then remedy any findings you have and then merge into production.

| Gate | What must be true | Proof |
| --- | --- | --- |
| **G-D Grok Bot's UAT** (M8) | The four agents run across the app and play full games — two seats simulating humans through the real board, two as AI (the house pilot, and the LLM pilot once AI-2 is through the door); every finding in the template (`docs/uat/playtest-findings.md`); the triage loop run to its exit criteria: 50 games with zero engine exceptions, zero hidden-information leaks, every rules finding adjudicated against the CR, no severity-1 or -2 UI finding open; the fixes merged and released to staging | The findings CSV with every row's outcome; the replayed games; the release |
| **G-E Human invites** | Rob invites a set of people through the Access "Invited" policy; their games and their workshop use on staging; findings fixed and released | Rob's word, the findings, the release |
| **G-F Rob's final review** | Rob reviews staging; every finding remedied; the production release built from `main`, `release-acceptance.mjs` green on it, pushed to `release/pages` on **Rob's go**, Workers Builds green, walked live (`UAT_BASE=https://crankmagic.com`), the version read back | The release commit, the version id, the live walk's count |

**Then, and only then, the executor says:**

> The app is ready for you and your invites to use!

**Between the gates:** every finding from Grok Bot, the invitees or Rob is one PR each (or a grouped one where they
share a cause), merged on the gate, released to staging, and reported back with the proof; `docs/ACTIVE.md` is
updated at the end of every session; production moves only on Rob's go, every time.
