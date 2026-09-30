# Rob's feedback of 2026-09-30 on the board — captured, not yet built

Rob walked staging.crankmagic.com with the board rebuilt to the wireframes (#443) and sent this list, saying
*"to capture, not to execute yet."* Each item is his words first, then what the code and the rules say about it,
and where he asked for ideas, the ideas. Nothing here is built. When he says go, each numbered item is one
proven PR or a group of them, in his order.

## 1. Choose mat

Move **Use this mat** up beside the ✕ in the header; it becomes active once a mat is selected. Remove **Cancel**
(the ✕ closes). — `crankmagic-table.js` `chooseMat()`; the dialog's footer is the app's `cm-form-footer`.

## 2. Table rules, editable by the host

The person who started the table sees a small **Edit** button beside *Table rules* in the center panel — smaller
than the page's other buttons, so the panel's text is not disturbed. — DELTA B.5 put the rules edit under
*Host tools ▾*; Rob wants it on the panel. The rules today are starting life 40, seats, invitations a day, a
dropped player five minutes; which of them are editable, and whether editing is allowed once a seat is ready, is
his call when this is built.

## 3. Table view, in game

1. **The background moves. Make it static for now.** — The living mat (`CrankSea`, `crankmagic-sea.js`, random
   cycle at 45%) behind the boards; the fan crossfades too. Draw the sea's first frame once, or leave the felt.
2. **A draggable horizontal divider** between the other seats' boards and yours: grab it and drag up or down;
   the top row and your row resize against each other. — Today the four boards are identical 16:9 by rule (the
   handoff's "four seats, one size"); this makes the rows' share a person's choice, remembered on the device
   like the card size (AGENTS.md: sizes are sliders, and a divider is one).
3. **The same bar along the top of the hand tray**: dragging it resizes every board proportionally, all equal.
4. **A card-size slider in the hand and on the board**, each its own, superseding the one under Tools; when the
   Tools slider moves, it sets the others to its value (Rob's preferred rule) rather than merely resetting them.
   — `--card-scale` is one value today (`crankmagic-app.js` `cardScale`); this becomes three scopes: table,
   hand, board, with Tools writing all three.
5. **The commander, exile, library and graveyard cards sit on top of their frames, not inside**; they may go
   past the frame's bounds. — The card-shaped frames (`.cm-board-pile`) hold the card inside today.
6. **The mana-open and land-drop reminder goes directly outside and below the Lands frame**, bottom right,
   instead of inside at the top right. — `.cm-board-chip` in `mat()`.
7. **The life counter at the true center of the table**: two to four pie slices, one per seat, the logo in the
   middle; clicking the logo opens Table vitals. In Table vitals, icons: a heart for life, a skull and
   crossbones for poison, none for commander damage. — This is wireframe 2e's center counter, which the
   handoff's later addendum replaced with the vitals pills ("Vitals (replaces the center life counter)");
   Rob's call restores the counter beside the pills. Its geometry is in the wireframe (`counter()` in
   `wf2-screens.js`: a conic disc, one quadrant per seat, the total on each).
8. **"Pass priority" versus "Next step".** *"I want to be able to click Next Step to move between my steps
   instead. If there's not another reason to have Pass Priority, then simply update that text with Next Step;
   otherwise ideate on how to solve for both."*
   - What the rules say: a turn advances by priority. When every player passes in succession with the stack
     empty, the step ends and the next begins (CR 117.4); when they pass with something on the stack, the top
     object resolves instead. So on your own turn with an empty stack, passing *is* "next step"; with a spell
     on the stack, passing means "let it resolve"; on an opponent's turn, passing means "I do nothing here".
     One verb, three meanings — which is why the word is wrong even though the action is right.
   - **Idea: one button that says what passing will do.** *Next step* on your turn with an empty stack;
     *Let it resolve* when something is on the stack (naming it: *Resolve Lightning Bolt*); *Pass* on another
     player's turn. Same message to the room in every case; only the label changes. Skip to end stays beside it.
   - A second idea, if the label alone is not enough: *Next step* could pass through steps where your only
     option is to pass (see 9) so one click moves you to the next step where you can actually do something.
9. **In a two-player game, the first player's first turn does not draw; why is the Draw step not skipped on
   Pass priority?** — CR 103.8a: in a two-player game the player who plays first skips the draw step of their
   first turn. The engine skips the draw; the step itself still happens, and the rules give priority in it
   (CR 504.2), so the room asks. Nothing needs asking when the only option is Pass: **idea — the board (or the
   room) passes by itself in any step where your only legal action is Pass and the stack is empty**, and says
   so in the history ("Draw step: nothing to do"). That is not a decision made for a player (AGENTS.md): there
   was no choice. Rob's item 11 wants the opposite for the real draw, so this applies to empty steps only.
10. **"Your priority" beside the other player's turn in the strip: does it need to be there?** — It is true
    (you receive priority in each of their steps, CR 117.3), and it is why Pass is enabled on their turn; but
    it reads as noise. **Idea:** on another player's turn say what it means — *Bob's combat · you may respond* —
    and drop it once the button's label carries the meaning (item 8).
11. **Upkeep → Draw draws the card at once, then asks for another pass.** *"Don't auto draw at this transition
    between steps. Once the user clicks Pass Priority (or Next Step), don't auto-take action but instead change
    the button to Draw Card."* — CR 504.1: the draw is a turn-based action at the start of the draw step; it
    happens before anyone gets priority and is not a choice, which is why the engine does it unasked. Two ways
    to give Rob the feel he asks for without a rule the engine does not have:
    - **Show the draw as its own beat:** entering the draw step shows *Draw a card* as the one button; the
      click draws (the engine's turn-based action, held until the click) and then priority follows as now. The
      result is the same card; the timing is the player's. The room would carry a "draw" acknowledgement in
      the draw step.
    - **Keep the automatic draw and make it visible:** the drawn card lifts in the hand and the strip says
      *You drew Island* until the next action. No rule bends; the surprise goes away.
    Rob chooses; the first is what he asked for.
12. **The hand tray:** put the count beside the ✋ (remove *Hand · 8*); remove *Bright = you can use it now*;
    keep the space for something hand-specific. **Ideas for the space:** counts by type (*Lands 5 · Creatures 2
    · Instants 1*); *castable now: 3*; the hand's own card-size slider (item 3.4); the next land drop's
    availability. The first two are the most useful in play.

## 4. Focus view — generally good

1. **A draggable vertical divider** between the seat pane on the left and your mat; the seat tiles grow with
   the pane, and past a certain width each tile becomes a miniature of that seat's real board — the
   battlefield and the lands, the cards on them — rather than a name and a life total. — The pane is 168px
   today; the mat is the largest 16:9 beside it (`fit()` in `crankmagic-board.js`), so the mat follows the
   divider. The miniature is the Table view's small board (`mat(p, {size: "table"})`) at a smaller size.
2. **The History drop-down closes on a click anywhere outside it** (the ⌕ on the mat's band opens the same
   drop-down as History ▾; today only Escape or the button closes it). — `historyOpen` in
   `crankmagic-board.js`; a document `pointerdown` outside `#cm-board-history` and its button closes it, the
   way the app's popover menus close.
3. **The Panel:** remove the word *Card* above the card. A tapped card shown there is drawn upright — either
   untapped in the panel, or upright with a small *Tapped* mark instead of the turned image. — `panel()` in
   `crankmagic-board.js` draws `card(pick, {where: "pick"})`; the `where` already exists to vary a card's
   drawing by place, so the pick can drop `is-tapped` and carry a mark. The same applies to Full screen's
   right column, which is the same card panel.
4. **A horizontal divider under the card in the Panel**, dragged up or down: the card scales proportionally
   with the room above the bar, and the history below shows more or less. — The Panel is a column (card,
   the stack, history); the bar sets the card's width (5:7 keeps its height, R3.9) and the history takes the
   rest. Remembered on the device, like the other sizes (AGENTS.md: sizes are sliders). Full screen's right
   column gets the same bar between its card and its log.
