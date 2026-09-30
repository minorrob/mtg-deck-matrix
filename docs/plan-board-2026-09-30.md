# The board after Rob's walk of 2026-09-30 — the plan, not yet built

Rob walked staging.crankmagic.com with the board rebuilt to the wireframes (#443) and sent his findings across
several messages, with screenshots, saying *"add all of these items as a plan to execute, but don't execute
yet."* This is that plan. Part 1 is every item in his words, each with what the code and the rules say about it
and, where he asked for ideas, the ideas. Part 2 groups them into pull requests in the order to build them, each
with its proof. Nothing here is built; Rob says go, and which decisions he takes where a choice is offered.

## Part 1 — the items

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

## Part 2 — the pull requests, in order

Each is one proven PR (AGENTS.md: the gate green on the head, the walk where a screen changes). Items that need
Rob's decision are marked; the rest are his words as written.

| PR | Items | What is proved |
| --- | --- | --- |
| **1. The bugs seen today** | 22 (fullscreen on the document; Coach in the side column), 23 (the rail's rule), 24 (the clock), 21 (the Coach glyph — Rob picks), 16 (History closes on an outside click), 17 (the Panel's card), 25 (the hand whole in every view) | `tests/table-board.mjs`: in browser fullscreen the Coach and Table vitals are visible; the Tools menu's buttons do not overlap; the hand's last card's bottom is inside the window in all four states at 1400 and 1280; the History drop-down closes on an outside click; the Panel shows a tapped card upright |
| **2. The game survives the pages** | 19 | The board suite: navigate to Decks and back to Play mid-game; the socket count stays one; the room never marks the seat away; Play opens the game; the chip shows on Decks |
| **3. The lobby's two** | 1, 2 (which rules are editable — Rob) | `tests/table-lobby.mjs`: Use this mat beside ✕, enabled on a pick, no Cancel; the host's Edit, its dialog, a guest sees none |
| **4. Table view's shape** | 3, 4, 5, 7, 8, 9, 6 | The board suite: the sea still; the row divider drags and is remembered; the hand bar resizes all four equally; piles' cards overlap their frames; the chip below the Lands; the pie counter's slices and totals; the three card-size scopes and Tools writing all three |
| **5. The turn's words and beats** | 10, 12, 11, 13 (the draw as a beat — Rob chooses) | The board suite: the button reads Next step / Let it resolve / Pass in the three cases; the strip says whose step and that you may respond; an empty step passes itself and says so; the draw waits for its click (if chosen) |
| **6. The hand tray** | 14 (what fills the space — Rob picks from the ideas) | The board suite: the count by the ✋; the type counts; castable now |
| **7. Focus and Full screen** | 15, 18, 20 (the card back — Rob supplies) | The board suite: the pane divider drags and the tiles become miniatures past the width; the Panel's divider; Rotate shows the other seat's hand as backs, never a face |

Estimate: seven PRs; PR 1 and PR 3 are a session each, PR 2 and PR 5 touch the room (`game/room/`) and are a
session each with their own suites, PR 4 is the largest (two sessions), PR 6 and PR 7 a session each.
