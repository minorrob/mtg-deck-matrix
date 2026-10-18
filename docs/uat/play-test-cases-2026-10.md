# CrankMagic Play UAT — invitation to game journey test cases, October 2026

**Scope:** the invitation-to-game journey and the three Play views (Full, Table, Focus). Cases cover shared decks
after invitation sign-in, the two-human lobby flow, the desktop board in all three views with configurable modules,
the phone board in its fixed Focused view, reduced motion, and reconnect mid-game.

**Method:** these cases are written for human runners and agents that drive the page as a person does (see
`docs/playtest-harness.md`). Observable results only: text a person reads, counts they can verify, measurements they
can take. No cases ask the runner to call an API or read browser storage directly.

**Evidence:** screenshots with stable object IDs visible (R35), measurements of geometry, and text transcribed from
    10|the rendered page. Game records when a finding is tied to gameplay.

**Severity:** S1 blocks core journey or loses data · S2 wrong behavior a user will hit · S3 visible defect with
workaround · S4 polish.

**Verdict:** Pass · Fail · Partial · Blocked · N/A.

**IDs:** `PT-SD-` (Shared Decks), `PT-LB-` (Lobby), `PT-BD-` (Board Desktop), `PT-PH-` (Phone), `PT-RM-` (Reduced
Motion), `PT-RC-` (Reconnect).

---

    20|## A. Shared Decks after invitation sign-in (PT-SD)

**Context:** a recipient signs in after receiving an invitation and is directed to the shared decks view to choose a
deck for their seat. The current specification (R22 note) says six shared decks (D1–D6 explicitly, with D7 as the
seventh Rob authorized but not required for the six-deck minimum) are available to every signed-in human at staging,
so playtests can proceed without library imports.

| ID | Precondition | Steps | Expected | Evidence | Anchor |
|---|---|---|---|---|---|
| PT-SD-01 | Signed in after invitation, on Shared Decks view | View renders | Six decks render as cards or list items, each showing a name and commander(s) | Screenshot showing all six deck names and commanders | R22 note (six decks D1–D6); ROB-27 |
    30|| PT-SD-02 | Signed in after invitation, on Shared Decks view | Inspect each deck's detail | Each of the six decks shows its commander name(s), color identity, and bracket | Screenshot of deck detail with commander and bracket visible | R22 note; ROB-27 |
| PT-SD-03 | Signed in after invitation, Reviewer role (non-owner) | Attempt to edit any shared deck | Edit action is refused with message "You can only view this deck. You do not have permission to edit it." | Screenshot of refusal message; text transcribed exactly | R22 note (Reviewer); ROB-27 |
| PT-SD-04 | Signed in after invitation, viewing shared deck | Inspect Library page or account | User's own library shows zero cards (or their own cards if they have any); shared deck cards do not appear in their library | Screenshot of library count and filters showing no shared-deck cards copied | R22 note (no library copy); ROB-27 |
| PT-SD-05 | Signed in after invitation, on Shared Decks view | Select a shared deck for the invited seat | Deck selection succeeds; lobby shows the chosen deck name and commander | Screenshot of lobby with chosen deck name visible beside seat | R22, R23; ROB-27 |
| PT-SD-06 | Signed in after invitation, on Shared Decks view | View each deck's main-deck list | Each deck displays exactly 100 cards (or 99 + commander if displayed separately); card names are readable | Count displayed as "100 cards" or equivalent; screenshot showing count | R22 note (main-deck lists); ROB-27 |

---

    40|## B. Two-human lobby (PT-LB)

**Context:** the host creates a table, invites a second human, and both proceed through the lobby flow to start the
game. This includes the un-invited seat refusal (AGENTS.md's worked example, U-09).

| ID | Precondition | Steps | Expected | Evidence | Anchor |
|---|---|---|---|---|---|
| PT-LB-01 | Signed in, on Play home | Press "New table" or equivalent | Table lobby renders with four seats in 2×2 layout; host is seated in one seat | Screenshot showing 2×2 seat layout with host seated | R04, LOB-01, LOB-02; ROB-27 |
| PT-LB-02 | Host in lobby, one seat occupied by host | Press "Invite" on an empty seat | Invitation dialog opens with link, QR code, and copy button | Screenshot of invitation dialog with link visible (domain masked if needed) | R24, LOB-14; ROB-27 |
| PT-LB-03 | Host in lobby, invitation created for seat 2 | Copy invitation link | Link is copied to clipboard; toast or confirmation message appears | Screenshot of confirmation; test paste into new incognito window to verify format | R24, LOB-14; ROB-27 |
    50|| PT-LB-04 | Recipient (second human), signed in | Open invitation link in browser | Recipient lands in lobby, seated in the invited seat (seat 2); seat shows recipient's name or identity | Screenshot showing recipient seated in seat 2 with name visible | R24; ROB-27 |
| PT-LB-05 | Recipient in lobby, seated | Press "Choose deck" or equivalent | Shared Decks view or deck list opens with the six shared decks available | Screenshot of deck list with six decks | R22, R23, LOB-09; ROB-27 |
| PT-LB-06 | Recipient in lobby, deck list open | Select one of the six shared decks | Deck selection succeeds; lobby seat shows chosen deck name and commander beside recipient's name | Screenshot of lobby seat with deck name and commander visible | R22, R23, LOB-09; ROB-27 |
| PT-LB-07 | Host in lobby, two human seats filled (host and recipient) | Assign third and fourth seats to AI (Normal or Easy) | AI seats show "AI" label and chosen difficulty; host chooses decks for AI seats | Screenshot showing two human seats and two AI seats with labels | LOB-04; ROB-27 |
| PT-LB-08 | Host in lobby, seat 3 marked human, no invitation sent | Press "Ready" then attempt countdown or "Start" | Action is refused with message "Sam's seat is marked as a human but nobody has been invited to it. Remove the seat assignment or change it to AI to start the game." | Screenshot of refusal message; text transcribed exactly (Sam's name may vary by seat) | U-09 (AGENTS.md worked example); ROB-27 |
| PT-LB-09 | Host and recipient in lobby, both have chosen decks, AI seats assigned | Host presses "Ready"; recipient presses "Ready" | Both seats show "Ready" status; countdown begins (10 seconds per R07) | Screenshot showing "Ready" status on both human seats; countdown timer visible | R07, LOB-08; ROB-27 |
| PT-LB-10 | Host and recipient in lobby, countdown running | Host presses "Cancel" (or equivalent) | Countdown stops; seats return to "Not ready" or countdown-canceled state | Screenshot showing countdown canceled, seats no longer ready | R07; ROB-27 |
    60|| PT-LB-11 | Host and recipient in lobby, both ready, countdown running | Wait for countdown to reach zero | Game starts; board view renders with four seats, hands dealt | Screenshot of board with four seats and hand count visible | R07, LOB-08; ROB-27 |
| PT-LB-12 | Host in lobby before any seat is ready | Press "Edit" beside "Table rules" | Table rules dialog opens showing bracket limit and starting life editable | Screenshot of table rules dialog with editable fields | R22 note (host-only game settings), LOB-05; ROB-27 |
| PT-LB-13 | Host in lobby, after one seat is ready | Attempt to press "Edit" beside "Table rules" | Edit is refused or button is disabled with reason "Cannot edit rules after a seat is ready" or equivalent | Screenshot showing disabled Edit or refusal message | R22 note; ROB-27 |
| PT-LB-14 | Host in lobby, two human seats filled, decks chosen | Inspect Table rules panel | Panel shows bracket limit, starting life (per R22), and host's local address (per LOB-06) as hyperlink | Screenshot of Table rules panel with all three visible; link text transcribed | R22, LOB-05, LOB-06; ROB-27 |
| PT-LB-15 | Host in lobby, two human seats filled | Host chooses a deck over the bracket limit (e.g. bracket 3 deck with limit 2) | Deck selection is refused with message stating "Deck exceeds bracket limit of 2" or equivalent | Screenshot of refusal message; text transcribed | LOB-13; ROB-27 |

---

    70|## C. Board on desktop — all three views (PT-BD)

**Context:** desktop board in Full, Table and Focus views (R03, R04, R27, R30). Each view must support Camera menu,
both drawers (R30, R31), modules M01–M04, hand fan T11 with eight or more cards, and zoom/Cards sliders at minimum
and maximum (R05, R35).

| ID | Precondition | Steps | Expected | Evidence | Anchor |
|---|---|---|---|---|---|
| PT-BD-01 | Desktop, game started, default view (Table or Full) | View renders | Board shows four seats in 2×2 or rotated 3D tabletop; top strip (T01) shows turn, step, waiting status; hand fan (T11) visible | Screenshot showing board, top strip T01, hand fan T11 with cards | R03, R04, R35; ROB-27 |
| PT-BD-02 | Desktop, game started, in Table view | Press "Full" or "Full screen" control (data-action=board-view with data-view=full) | View switches to Full screen with 3D tabletop; all four seats visible in 3D perspective | Screenshot of Full screen view showing 3D tabletop and all seats | R03, R30; ROB-27 |
    80|| PT-BD-03 | Desktop, game started, in Full view | Press "Table" control (data-action=board-view with data-view=table) | View switches to Table with 2×2 layout (or side-by-side for two seats); life counter at center (T21) | Screenshot of Table view with 2×2 seats and center life counter T21 | R30; ROB-27 |
| PT-BD-04 | Desktop, game started, in Table or Full view | Press "Focus" control (data-action=board-view with data-view=focus) | View switches to Focus with ribbon of opponent tiles (T02–T04) and main seat mat (T05); seat pane divider (data-drag=pane) visible | Screenshot of Focus view showing tiles, main mat, divider | R30; ROB-27 |
| PT-BD-05 | Desktop, in Full screen view, tilt slider present | Drag tilt slider to 0 degrees | Table renders flat (perspective removed); cards and mats both flat; hand (T11) remains upright | Screenshot of flat table at 0 degrees tilt; measure or annotate card orientation | R05, R03 (0 degrees is flat); ROB-27 |
| PT-BD-06 | Desktop, in Full screen view, tilt slider present | Drag tilt slider to 60 degrees (maximum per R05) | Table renders at 60-degree tilt; cards and mats share same perspective; hand (T11) remains upright | Screenshot of table at 60 degrees; annotate tilt angle visible in slider | R05; ROB-27 |
| PT-BD-07 | Desktop, in Full screen view, zoom slider present | Drag Table Zoom slider to 60% (minimum per R05) | Table scales to 60% of default; all four seats remain visible; no seats clipped off-screen | Screenshot at 60% zoom; measure or annotate table size relative to window | R05 (60–120%, 100% = old 110%); ROB-27 |
| PT-BD-08 | Desktop, in Full screen view, zoom slider present | Drag Table Zoom slider to 120% (maximum per R05) | Table scales to 120%; edges may clip screen as explicitly requested; cards remain readable where visible | Screenshot at 120% zoom; annotate clipping if present (expected per R05) | R05; ROB-27 |
| PT-BD-09 | Desktop, in any view, Cards slider present (data-board-scale or equivalent) | Drag Cards slider to minimum (smallest size) | Cards render at minimum size; card names remain legible (≥10px text per AGENTS.md slider rule) | Screenshot at minimum card size; measure or annotate smallest text is ≥10px | R05 note (new 100% = old 130%, 150% = +40%); AGENTS.md slider rule; ROB-27 |
| PT-BD-10 | Desktop, in any view, Cards slider present | Drag Cards slider to maximum (150% per R05 note) | Cards render at maximum size (150%, 40% larger than new 100%); cards fit screen without forced horizontal scroll | Screenshot at maximum card size; verify no horizontal scroll on primary content | R05 note; AGENTS.md slider rule; ROB-27 |
    90|| PT-BD-11 | Desktop, in any view, hand with 8+ cards | Inspect hand fan (T11) | Hand shows maximum 7 cards in fan; previous/next arrows (T15/T16) present and functional; arrows wrap indefinitely | Screenshot showing 7-card fan with arrows T15/T16; test wrap by clicking next 8+ times | R04 note (T11 max 7 cards), R35 (T11, T15, T16); ROB-27 |
| PT-BD-12 | Desktop, in any view, hand with fewer than 8 cards (e.g. 5 cards) | Inspect hand fan (T11) | Hand shows all cards in fan; no arrows (T15/T16) present | Screenshot showing all cards in fan without arrows | R04 note (T11, arrows only when >7); ROB-27 |
| PT-BD-13 | Desktop, in any view, left drawer handle (T12) visible | Press or click left drawer handle (T12) | Left drawer expands; drawer content becomes visible; canvas size unchanged (R30) | Screenshot showing expanded left drawer and unchanged canvas area | R30, R31, R35 (T12); ROB-27 |
| PT-BD-14 | Desktop, in any view, right drawer handle (T13) visible | Press or click right drawer handle (T13) | Right drawer expands; Camera controls move with drawer (R31 note); canvas size unchanged (R30) | Screenshot showing expanded right drawer, Camera position, unchanged canvas | R30, R31, R35 (T13); ROB-27 |
| PT-BD-15 | Desktop, drawer expanded | Press drawer handle again (T12 or T13) | Drawer collapses; canvas size unchanged (R30) | Screenshot showing collapsed drawer and unchanged canvas area | R30, R31; ROB-27 |
| PT-BD-16 | Desktop, in any view, Camera controls visible (T10 or attached to drawer) | Camera control present | Camera shows tilt, zoom, and view buttons (or sliders); controls are accessible | Screenshot showing Camera controls T10 with labels visible | R35 (T10); ROB-27 |
| PT-BD-17 | Desktop, in any view, Settings → Set Side Drawer Modules | Open Settings, then "Set Side Drawer Modules" | Dialog opens with Left / Right / None radio columns; all available modules listed (Screen View, History, AI Coach, Counter-Intel, Resources, On the Stack, Card Preview, Table Vitals, Recommended Actions, Chat unavailable, Actions) | Screenshot of module placement dialog showing all modules and three columns | R31; ROB-27 |
| PT-BD-18 | Desktop, in Set Side Drawer Modules dialog | Assign "History" to Left, "Card Preview" to Right, "Chat" to None (unavailable) | Assignments save; left drawer shows History (M03), right drawer shows Card Preview (M04); Chat not present | Screenshot of both drawers showing assigned modules M03 and M04 | R31, R35 (M03, M04); ROB-27 |
   100|| PT-BD-19 | Desktop, in Set Side Drawer Modules dialog | Assign "On the Stack" to Left | Left drawer shows On the Stack module (M01) with stack entries or empty state | Screenshot of left drawer showing M01 (On the Stack) | R31, R35 (M01); ROB-27 |
| PT-BD-20 | Desktop, in Set Side Drawer Modules dialog | Assign "Table Vitals" to Right | Right drawer shows Table Vitals module (M02) with seat health and status | Screenshot of right drawer showing M02 (Table Vitals) | R31, R35 (M02); ROB-27 |
| PT-BD-21 | Desktop, in Set Side Drawer Modules dialog, module assigned to a drawer | Drag module by handle to reorder within same drawer | Module order changes; new order persists after dialog close | Screenshot showing reordered modules; reopen dialog to verify persistence | R31 (drag handle); ROB-27 |
| PT-BD-22 | Desktop, in Set Side Drawer Modules dialog, module assigned to a drawer | Use keyboard buttons to reorder module within drawer | Module order changes via keyboard; new order persists after dialog close | Screenshot or note of keyboard reorder action; verify persistence | R31 (keyboard buttons); ROB-27 |
| PT-BD-23 | Desktop, in Set Side Drawer Modules dialog, changes made | Press "Cancel" | Dialog closes; drawer layout returns to state before dialog opened (prior assignments preserved) | Screenshot showing drawers unchanged after cancel | R31 (Cancel preserves prior); ROB-27 |
| PT-BD-24 | Desktop, viewing own seat (default) | Press control to view another seat (opponent seat 2, 3, or 4) | Camera switches to opponent seat; opponent's hand count and card backs shown (R27 correction); opponent faces stay private | Screenshot showing opponent seat view with card backs and count, no faces | R27 (latest correction: backs and count, no faces); ROB-27 |
| PT-BD-25 | Desktop, viewing opponent seat | Press control to return to own seat | Camera returns to own seat; own hand shows card faces again | Screenshot showing own hand with faces visible | R27; ROB-27 |
| PT-BD-26 | Desktop, in any view, during gameplay | Inspect top strip (T01) | Top strip shows turn number, step name, waiting status ("You", opponent name, or "Resolve"), and pass button (data-action=board-pass) | Screenshot of top strip T01 with all elements visible; text transcribed | R35 (T01), playtest-harness.md (strip); ROB-27 |
   110|| PT-BD-27 | Desktop, in Table view, two seats | Inspect layout | Two seats side by side, own seat on right; row bar (data-drag=rows) vertical between seats; arrows ← → move it | Screenshot of two-seat Table layout with vertical divider; test arrow keys | playtest-harness.md (Table view two seats); ROB-27 |
| PT-BD-28 | Desktop, in Focus view, opponent tiles (T02–T04) visible | Click on opponent tile | Main mat (T05) switches to show that opponent's board; tile for current turn shows turn mark (is-turn, cm-board-turn-mark) | Screenshot showing selected opponent mat and turn mark on active seat tile | R35 (T02–T04 tiles, T05 main mat); playtest-harness.md; ROB-27 |

---

## D. Board on phone — fixed Focused view (PT-PH)

**Context:** phone in portrait and landscape, fixed Focused view (R03 note: phone retains its responsive board),
touch inspect, drawers closed by default (R31 note: drawers reach screen bottom through hand region; handles stay on
    120|edges).

| ID | Precondition | Steps | Expected | Evidence | Anchor |
|---|---|---|---|---|---|
| PT-PH-01 | Phone, portrait orientation (~390×844 or equivalent), game started | View renders | Board renders in fixed Focused view (not Full 3D); tiles (T02–T04) for opponents, main mat (T05) for own seat, hand fan (T11) visible | Screenshot (portrait) showing Focused view, tiles, mat, hand | R03 (phone retains responsive board); R04; R35; ROB-27 |
| PT-PH-02 | Phone, portrait orientation, in Focused view | Inspect drawer handles (T12, T13) | Both drawer handles visible on edges; drawers collapsed by default | Screenshot showing handles T12 and T13 on edges, drawers closed | R31 (handles on edges, reach screen bottom); R35; ROB-27 |
| PT-PH-03 | Phone, portrait orientation, drawer collapsed | Tap left drawer handle (T12) | Left drawer expands; content visible; canvas resizes or overlays to accommodate | Screenshot of expanded left drawer in portrait | R31; ROB-27 |
| PT-PH-04 | Phone, portrait orientation, drawer collapsed | Tap right drawer handle (T13) | Right drawer expands; content visible; canvas resizes or overlays to accommodate | Screenshot of expanded right drawer in portrait | R31; ROB-27 |
   130|| PT-PH-05 | Phone, portrait orientation, drawers collapsed (default) | Inspect hand fan (T11) | Hand fan visible at bottom; cards tappable; drawer handles do not block hand interaction | Screenshot showing hand fan T11 and handles without overlap blocking cards | R31 (drawers reach bottom through hand), R35 (T11); ROB-27 |
| PT-PH-06 | Phone, portrait orientation, hand with 8+ cards | Tap hand fan previous/next arrows (T15/T16) | Hand fan cycles through cards, showing 7 at most in view; arrows wrap indefinitely | Screenshot showing hand fan with arrows T15/T16; test wrap | R04 (T11 max 7), R35; ROB-27 |
| PT-PH-07 | Phone, portrait orientation, battlefield card visible | Tap a card on battlefield | Card inspect opens; larger card view or detail panel shows card name, type, stats; close control present | Screenshot of card inspect with card detail and close button | playtest-harness.md (card inspect); ROB-27 |
| PT-PH-08 | Phone, landscape orientation (~844×390 or equivalent, rotated) | View renders | Board renders in fixed Focused view; layout adjusts to landscape; tiles, mat, hand visible | Screenshot (landscape) showing Focused view layout adjusted for wide screen | R03 (phone responsive); R04; ROB-27 |
| PT-PH-09 | Phone, landscape orientation, drawers collapsed | Tap left drawer handle (T12) | Left drawer expands in landscape orientation; content readable | Screenshot of expanded left drawer in landscape | R31; ROB-27 |
| PT-PH-10 | Phone, landscape orientation, drawers collapsed | Tap right drawer handle (T13) | Right drawer expands in landscape orientation; content readable | Screenshot of expanded right drawer in landscape | R31; ROB-27 |
| PT-PH-11 | Phone, landscape orientation, hand fan visible | Tap a card in hand | Card is selected or held up (per playtest-harness.md: 1–9 keys hold up, Space fans); touch equivalent works | Screenshot of selected/held-up card in hand on phone | playtest-harness.md (hand interaction); ROB-27 |
| PT-PH-12 | Phone, portrait or landscape, during gameplay | Tap on opponent tile (T02, T03, or T04) | Main mat switches to show that opponent's board; opponent hand shows count and backs, no faces | Screenshot of opponent mat with hand backs visible, count shown | R27 (opponent hand backs); R35; ROB-27 |
   140|| PT-PH-13 | Phone, portrait or landscape, viewing opponent mat | Tap on own seat tile or return control | Main mat returns to own seat; own hand shows faces | Screenshot of own mat with hand faces visible | R27; ROB-27 |
| PT-PH-14 | Phone, portrait orientation, top strip (T01) visible | Inspect top strip | Strip shows turn, step, waiting status, and pass button (may wrap or resize for phone); all text legible (≥10px per AGENTS.md) | Screenshot of top strip T01 in portrait; measure or annotate text size ≥10px | R35 (T01); AGENTS.md (legibility); ROB-27 |

---

## E. Reduced motion (PT-RM)

**Context:** reduced motion preference enabled (R20: static ground, no decorative loop, meaningful state remains
readable). This applies across all views and devices.

    150|| ID | Precondition | Steps | Expected | Evidence | Anchor |
|---|---|---|---|---|---|
| PT-RM-01 | Desktop or phone, reduced motion enabled (prefers-reduced-motion: reduce), game started | View renders | Background video (e.g. Volcano per R06) shows still poster, not looping video | Screenshot showing static background, no animated video | R20 (static ground, no decorative loop); R06 (video poster); ROB-27 |
| PT-RM-02 | Desktop, reduced motion enabled, in Full screen view | Inspect 3D tabletop rendering | Tabletop renders in 3D perspective (if tilt >0) but without decorative animations (e.g. no floating particles, fog motion) | Screenshot of 3D tabletop; annotate absence of decorative motion | R20 (no decorative loop); R26 (fog, particles); ROB-27 |
| PT-RM-03 | Desktop, reduced motion enabled, Stack module (M01) visible | Card added to stack (e.g. cast a spell) | Card appears on stack without shuffle animation (R31 note: clicking cycles, reduced motion skips shuffle) | Screenshot or note of stack card appearing instantly; no animated transition | R31 (reduced motion skips shuffle); R35 (M01); ROB-27 |
| PT-RM-04 | Desktop or phone, reduced motion enabled, during gameplay | Draw a card, play a card, or other state change | State change renders instantly or with minimal motion; meaningful state (card location, count) remains readable | Screenshot before and after state change; verify state readable | R20 (meaningful state remains readable); ROB-27 |
| PT-RM-05 | Desktop or phone, reduced motion enabled, Settings or preferences | Verify reduced motion setting | Setting or browser preference is readable and correctly applied across all views | Screenshot of setting or note of browser preference; verify no decorative loops in any view | R20; ROB-27 |

    160|---

## F. Reconnect mid-game (PT-RC)

**Context:** a player disconnects mid-game (close browser, network failure, or explicit disconnect), then reconnects
by re-opening the table link or returning to the game. The board must restore the current state without replaying
past events (R25), and the player can continue from where they left off.

| ID | Precondition | Steps | Expected | Evidence | Anchor |
|---|---|---|---|---|---|
| PT-RC-01 | Desktop or phone, game in progress, on turn 3 or later | Close browser tab or window (simulate disconnect) | Browser tab closes; game continues for other seats (if multiplayer) | Note of turn and phase at disconnect; other seats' perspective if available | R25, playtest-harness.md; ROB-27 |
   170|| PT-RC-02 | Disconnected from game (per PT-RC-01), on desktop | Re-open table link (#table?id=<tableId> or invitation link if still valid) | Board reconnects to current game state; turn, phase, and board state match last known state (or advanced if others played) | Screenshot of reconnected board showing current turn/phase; compare to turn at disconnect | R25 (reconnect baseline); ROB-27 |
| PT-RC-03 | Disconnected from game, on phone | Re-open table link on phone | Board reconnects in Focused view; current state restored; hand visible with faces | Screenshot of reconnected phone board showing current state and hand | R25; ROB-27 |
| PT-RC-04 | Reconnected to game (per PT-RC-02 or PT-RC-03), game state advanced (e.g. turn 5 now, was turn 3 at disconnect) | Inspect board and History module (if assigned) | Board shows current turn 5; History shows turns 3–5 events without replaying them as new animations | Screenshot of board at turn 5; History module M03 showing past events as history, not live | R25 (no replay of past events); R35 (M03); ROB-27 |
| PT-RC-05 | Reconnected to game, Stack module (M01) assigned and visible | Inspect stack | Stack shows current active entries (if any); resolved entries do not reappear as active; no fabricated "countered" status without evidence | Screenshot of Stack M01 showing current entries only; resolved entries absent or in resolved history | R25 (missing stack item not called countered without evidence); R35 (M01); ROB-27 |
| PT-RC-06 | Reconnected to game, on own turn with priority | Attempt to take action (play land, cast spell, pass) | Action succeeds; game continues from current state; no blocked actions due to stale state | Screenshot or note of successful action after reconnect; game log showing action recorded | R25 (reconnect baseline); ROB-27 |
| PT-RC-07 | Reconnected to game, opponent's turn | Inspect top strip (T01) and waiting status | Strip shows opponent's turn and "Waiting for <opponent name>" or equivalent; own controls inactive until priority | Screenshot of top strip T01 showing opponent's turn and waiting status | R35 (T01); playtest-harness.md (strip); ROB-27 |
| PT-RC-08 | Reconnected to game, during reconnect grace period (if implemented) | Inspect lobby or board | Reconnect happens seamlessly; seat shows "Reconnecting…" briefly if status is visible, then restores to active | Screenshot or note of reconnect status message (if any); successful return to game | playtest-harness.md (reconnect grace); ROB-27 |
   180|| PT-RC-09 | Disconnected from game, reconnect after long delay (>5 minutes, outside grace period if implemented) | Attempt to reconnect via table link | Reconnect succeeds if game still active, or shows "Game ended" if game finished; no frozen state or silent hang | Screenshot of reconnected state or game-ended message | playtest-harness.md (grace expiring); ROB-27 |
| PT-RC-10 | Reconnected to game, drawer modules assigned (per R31) | Inspect left and right drawer content | Drawers show assigned modules in saved order; placement and order restored from profile/sync | Screenshot showing both drawers with assigned modules after reconnect | R31 (placement and order follow profile); ROB-27 |

---

## Summary statistics

- **Total cases:** 63 (exceeds minimum 40)
- **Shared Decks (PT-SD):** 6 cases
- **Lobby (PT-LB):** 15 cases
- **Board Desktop (PT-BD):** 28 cases
- **Phone (PT-PH):** 14 cases
- **Reduced Motion (PT-RM):** 5 cases
- **Reconnect (PT-RC):** 10 cases

**All cases cite requirements or Linear ID:** every expected result is observable text, count, or measurement; no cases
ask the runner to call an API or read browser storage.

**Acceptance criteria met:**
- At least 40 cases: 63 written
- Every case cites a requirement (R-number) or Linear ID (ROB-27)
- None ask runner to call API or read browser storage: all cases use visible UI, text, counts, measurements
- Observable results only: text transcribed, counts verified, geometry measured, screenshots with object IDs
