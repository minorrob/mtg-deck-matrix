# Play UX requests: intake for reconciliation with the UX Audit, 2026-10-26

**From:** a Claude cloud session, `claude/quirky-hopper-4zq8fk`, capturing Rob's requests of 2026-10-26 (with
screenshots). **Nothing here is built.** Rob's "go" starts the work; RQ-01 is gated on a wireframe Rob approves.

**Read against:** `main` f72d857a (#885). Production serves 9ca99e5, which does **not** carry #875, #877, #878, #884 or
#885, so a screenshot from production can show a behavior `main` has already changed (see RQ-10).

**For:** the UX Audit session, to reconcile with its findings, remediations and wireframes, and attach wireframe object
IDs. IDs here (`RQ-nn.n`) are stable: cite them, never renumber them.

---

## 0. How to consume this

1. **Match.** For every `RQ` sub-item, find the audit findings on the same surface and the same problem.
2. **Classify** each match:

   | Class | Meaning | Action |
   | --- | --- | --- |
   | `NEW` | No finding covers it | Add a finding, cite the RQ |
   | `EXTENDS` | A finding covers part of it | Update the finding with the RQ's specifics, cite the RQ |
   | `DUPLICATE` | A finding covers all of it | Link both; Rob's wording wins where it is more specific |
   | `CONFLICT` | A remediation contradicts the RQ | Rob's direct instruction wins by default; keep the audit's alternative as an open question for Rob, never drop it silently |
   | `SUPERSEDES` | The RQ makes a finding moot | Mark the finding superseded, cite the RQ |

3. **Wireframes.** Per sub-item, list the wireframe object IDs that depict the surface (`wireframe_ids`). Where the
   RQ needs a frame or state the audit lacks, set `wireframe_gap: yes` and name what to draw. Items marked
   **Wireframe: required** must not be built without one.
4. **Keep provenance.** Lines marked *Rob* are his requirement. Lines marked *Proposed* are this session's
   recommendation and are not decided; if the audit recommends otherwise, show both.
5. **Return** the reconciliation in the format of section 8.

## 1. Constraints every item inherits

- **American English** in every label, comment and doc (`AGENTS.md`); `tests/feature-wiring.mjs` fails on UK spellings.
- **Symbols first, words last** (`AGENTS.md`, "Symbols first, words last").
- **Lanes.** Most items are the **Codex · Play** lane (`crankmagic-board.js`, `crankmagic-stage.css`,
  `crankmagic-table.js`, …). The UI reads `CrankRoomView@1` and never edits `game/` or `cloud/`; an engine need goes
  in the Requests table of `docs/ACTIVE.md` and the **Claude · Engine** lane lands it first.
- **Every view.** Each board item states its behavior in **Full, Table and Focus**, and on the phone layout.
- **Hidden information stays hidden** (face-down cards, libraries, hands); the privacy checks must pass.
- **A test that cannot fail is a comment.** Each item ships with a suite and a breaks script that turns it red.

## 2. What already exists (anchor the audit to these)

| Existing behavior | Where | Bears on |
| --- | --- | --- |
| Combat strip "Combat · confirmed assignments": grouped defenders, private drafts, draft blocks checked before Confirm (`legalBlocks`) | ROB-26, #799, #874 | RQ-05 |
| Same-named creatures numbered in combat words ("Goblin 1/1 #2"); public object IDs shown ("Dream Stalker #475") | ROB-168 `combatWords`; ROB-26 | RQ-05.4f (conflict, section 5) |
| Identical options in a question are one ×N button; a table card is "the same" only in the same state | #878, `board-choice-stacks` | RQ-10 (the battlefield itself is the gap) |
| Lands last, in a folded **Lands** group, in target questions | #885, `board-target-lands` | RQ-07 |
| The card acted on is drawn at the top of the Actions desk (`deskCard`) | #884 | RQ-01, RQ-08 |
| The hover never locks; an option naming a card pops it up (`data-peek-card`) | #884 | RQ-05.4g, RQ-07 |
| Unspent mana untapped (`untapMana`, `game/engine/rules/untap-mana.mjs`); a land just played taken back by its **double-click** (`takeBackLand`; a single click waits 300 ms for it) | #832, #835 | RQ-06.2, RQ-02, RQ-10 |
| Table and Focus drawers resize by drag or keyboard | Play shell | RQ-03.1, RQ-11 |
| Camera menu: views, zoom, card size | #874 | RQ-09 |
| **Queued, not started:** a double left click on a land taps it outside a payment; Actions grouped Hand / Board / Other with type color; the mana-payment panel | `docs/ACTIVE.md`, 2026-10-25 | RQ-02, RQ-10, RQ-06.1 (section 5) |

## 3. Index

| ID | Title | Surface | Type | Lane | Wireframe | Depends on |
| --- | --- | --- | --- | --- | --- | --- |
| RQ-01 | Target confirmation: source → effect → target | Actions desk | Feature | Play | **Required, Rob approves first** | RQ-08 |
| RQ-02 | Double-click an opponent's board to focus it | Table, all views | Feature | Play | Optional | RQ-10 |
| RQ-03 | Side-pane modules: resize, compact Coach header, collapse | Side panes, AI Coach | Feature + polish | Play | Recommended | RQ-11 (shared handle) |
| RQ-04 | Prepared: cast a copy of the spell half | Engine + Actions | **Bug** | Engine, then Play | No | RQ-01 |
| RQ-05 | Blocker assignment redesign | Combat strip, Actions desk | Redesign | Play (engine for any field) | Required | RQ-07, RQ-08 |
| RQ-06 | Single-action confirm; Undo (house rule) | Actions desk, battlefield | Feature | Play + Engine | Recommended | — |
| RQ-07 | Player name with every target | Actions desk | Feature | Play | Recommended | — |
| RQ-08 | Affected card and the question; final confirm removed | Actions desk | Redesign | Play | Required (with RQ-01) | RQ-07 |
| RQ-09 | Card spacing on the battlefield, in Camera | Battlefield, Camera | Feature | Play | Optional | — |
| RQ-10 | Identical lands always stacked, tap one at a time | Battlefield | Feature (possible regression) | Play (engine for a field) | Recommended | — |
| RQ-11 | Drag the lands / battlefield divider | Battlefield, all views | Feature | Play | Optional | RQ-03.1 |

## 4. Items

### RQ-01 Target confirmation: source → effect → target

*Rob:* "On confirm page for after selecting targets, I want to see a picture of the card doing the targeting about
1/4-1/3 the size Oath of Teferi card is in the action pane ... with a directional arrow, the effect/action as subtext
to the arrow, then the same sized card as the target." Mock it up as a wireframe first.

- **RQ-01.1 One target.** Source thumbnail (¼–⅓ of today's desk card) → arrow with the effect under it → target
  thumbnail of the same size. *Superseded in part by RQ-08:* see section 5, C1.
- **RQ-01.2 Many targets.** The container has four quadrants: the source in one, targets in the other three, an arrow
  and its effect caption from the source to each. Targets receiving the **same** effect share a quadrant as a stack.
  Each quadrant holds up to 4 cards. Clicking a stack's top card cycles it to the bottom, **with motion**, showing the
  next.
- **RQ-01.3 Wireframe first.** No build until Rob approves.
- **Acceptance:** sizes within ¼–⅓ of the current desk card; each arrow's caption is the engine's effect verb; a stack
  cycles on click and on Enter/Space with visible motion (reduced-motion: a crossfade); every target shows its
  controller (RQ-07); no hidden card revealed.
- *Proposed:* the source sits **centered**, targets around it, when there are 3 effect groups; more than 3 groups
  scroll or page (to be drawn). A stack over 4 cards keeps cycling and carries a ×N badge.
- **Open:** source fixed top-left or centered; behavior past 3 effect groups; "up to 4" read as 4 cards per quadrant
  (confirm).
- **Wireframe: required.** Frames: 1 target; 3 targets, one effect; 3 targets, three effects; 5+ targets in one group
  (stack and cycle states); RQ-08's single-target layout beside it.

### RQ-02 Double-click an opponent's board to focus it

*Rob:* "Double-left clicking on an opponents board on the table should change the focus to their board for me."

- **Acceptance:** a double click on the empty area of an opponent's board, in Full, Table and Focus, makes that
  board the focused one; a double click on a card does what a double click on that card does, never a focus change.
- *Proposed:* the same focus from a single click on the player in the left **Boards** list; back to your own board by
  **My board**, a double click on your own board, or Esc. While targets are being chosen, the focus may change but the
  selection is kept.
- **Open:** does any existing double-click on a board (the queued "double left click on a land taps it", the
  take-back of a land) reach the empty board area? (section 5, C3).
- **Wireframe:** optional (a state note on the table frame).

### RQ-03 Side-pane modules

*Rob:* resize each module by dragging; the Coach banner is "about 4x too tall"; questions hidden behind "Questions to
Ask"; the six-dot drag handle does not work well; click a header to collapse.

- **RQ-03.1 Resize.** Drag a module's lower edge up or down to set its height, in both side panes.
  *Proposed:* minimum the header plus one row, maximum the pane; heights kept per person with the pane's layout;
  double-click the handle resets; arrow keys nudge when focused. One shared handle with RQ-11.
- **RQ-03.2 Coach header.** About ¼ of today's height; only **CrankMagic Coach**, one line, a smaller font; the
  subtext ("Sees your board, hand and the table · turn 1") removed. On a narrow pane the font shrinks rather than wraps,
  keeping the padding to the "…" and the close ×. *Proposed:* `clamp()` with container units and `white-space: nowrap`;
  an ellipsis only below the floor size.
- **RQ-03.3 Questions to Ask.** The suggested questions are hidden. One line, **Questions to Ask**, sits where "Explain
  the stack" is today; a click expands the questions **upward**, in a smaller font; a click again collapses. *Proposed:*
  the list overlays the conversation so the input never moves; `aria-expanded` on the line.
- **RQ-03.4 Drag to reorder.** The up/down arrows in edit mode are fine. Fix the six-dot handle only if it is small;
  otherwise remove it from every header.
- **RQ-03.5 Collapse.** A left click on a module's header collapses it to the header bar; again, it expands.
  *Proposed:* the header's buttons (↑ ↓ ×, ⚙, "…") keep their own actions; a press that moves more than a few pixels
  is a drag, not a click; a chevron shows the state; Enter/Space toggle; collapsed state and height kept per person; a
  collapsed module's space goes to the modules below.
- **Acceptance:** each sub-item in both panes, at 1280x720 and 1920x1080 and on the phone; keyboard equivalents.
- **Wireframe:** recommended (Coach header at two widths; Questions to Ask shut and open; a collapsed module).

### RQ-04 Prepared: cast a copy of the spell half (bug)

*Rob:* "Studious First-Year, a card with both a creature and a sorcery option. I cast as a creature. It's prepared. I
should have the option to cast a copy of it, which I currently don't." The copy should be castable as its spell, and
he raised the copy coming out as a creature again.

- **Acceptance:** for every card with Prepared in the card data, after the creature half resolves prepared, the
  person is offered to cast the copy exactly as the Oracle text allows (timing, cost, how often); the copy is a spell,
  never a permanent, unless the rules say otherwise; it uses RQ-01/RQ-08 if it targets.
- *Proposed:* confirm the rule from the repo's Oracle text, not memory; find whether the fault is the card model
  (halves not separate), the room (no option offered) or the board (option hidden by timing); an engine test of each
  step and a breaks script.
- **Lane:** Claude · Engine first (rules and the room's option), then Play for the action.
- **Wireframe:** none.

### RQ-05 Blocker assignment redesign

*Rob (two screenshots):* the attacker tile is chosen in the combat strip and opens in Actions; the person assigns a
blocker or none, presses **Confirm** or **Don't block**, which updates the tile; once every attacker is settled,
**Send blockers**.

- **RQ-05.1 Flow.** Select an attacker tile in "Combat · confirmed assignments" → it opens in Actions → assign blockers
  → **Confirm** (saves that attacker's blocks only, sends nothing) or **Don't block** → the tile updates → **Send
  blockers** once all are settled.
- **RQ-05.2 The strip.** **Send blockers** at the far right of the strip, its tooltip "stays private until sent"; "The
  table accepts this draft" moves into the strip, for the whole set. Attacker tiles wrap and scroll when one row cannot
  hold them. Between the attacker and defender thumbnails, three rows: the action ("Attacking"), the arrow, the target
  player's name.
- **RQ-05.3 States.** An unsettled attacker has a distinct border and a soft glow; a settled one a "ready" border.
- **RQ-05.4 Actions desk.**
  - a. **Don't block** (was "No blocks") and **Confirm** in one row.
  - b. Remove "stays private until confirmed" (it becomes the Send tooltip).
  - c. Remove selecting the attacker inside the desk: it is already chosen.
  - d. Remove **Clear this blocker**; a second click on a chosen blocker clears it.
  - e. Remove "Attackers for [card] · select again to remove".
  - f. Remove the number from card names ("#486").
  - g. Hover pop-up on every attacker and blocker thumbnail.
- *Proposed:* several blockers on one attacker are allowed; a creature already blocking another attacker is moved
  here and that attacker's tile turns unsettled; menace and other limits come from `legalBlocks`. Twins (RQ-05.4f) are
  told apart by position or a small mark, not a number (section 5, C4).
- **Acceptance:** Send blockers is disabled until every attacker is settled, and its tooltip says why; a draft the
  table refuses names the attacker on its tile; every view and the phone.
- **Wireframe: required.** Strip with 2 and with 9 attackers (wrap, scroll), the tile's three rows, the three states
  (unsettled, ready, refused), the desk with one blocker, two blockers, none.

### RQ-06 Single-action confirm; Undo

- **RQ-06.1 One action.** When a card has only one action (Rob's screenshot: Seachrome Coast), remove that action's
  button and rename **Confirm** to the action: **Play Card**. *Proposed:* the label follows the action type (Play Card,
  Cast Spell, Activate).
- **RQ-06.2 Undo.** An Undo icon on a card played in the current step rewinds its play and untaps the mana tapped for
  it; once the player moves to the next step, Undo is gone. A **house rule**, built in now, switchable when house rules
  arrive. *Proposed:* offered only while undoing reveals nothing and reverses nothing another player has seen or
  answered: no other player has had priority, nothing else went on the stack (its own triggers included), no card was
  drawn or revealed, no random outcome; a land restores the land drop; the log shows "undone" to every seat. Build on
  `takeBackLand` and `untapMana` (a game restored from a copy, checked by hash).
- **Lane:** Engine (the room's undo window and the house-rule key), then Play (the icon).
- **Wireframe:** recommended (the single-action desk; the Undo icon on a battlefield card and on a stack).

### RQ-07 Player name with every target

*Rob:* "When I can destroy or exile something, in the Actions I want to see the player Name along with the target card
names."

- **Acceptance:** each target option shows its controller.
- *Proposed:* group targets under a header per player, **You** last; the existing folded **Lands** group (#885) nests
  inside each player; the same for every targeted permanent (bounce, tap, gain control), not only destroy and exile;
  hover pops the card up.
- **Wireframe:** recommended (Reclamation Sage's list, grouped).

### RQ-08 The affected card and its question; the final confirm removed

*Rob:* "The subsequent screen should show the picture of the card being affected, not the card doing the affecting.
Above the card image, remove 'Choose targets for [card name]'. Under the card image ... ask the question: [Action]
target player name then target card name, e.g. Exile Keith's Smuggler's Copter?" And: the screen after that, which
asks to confirm the answer, is satisfied by this one and can be removed, once it is confirmed nothing else of value is
in it.

- **RQ-08.1** The desk's large image is the **affected** card.
- **RQ-08.2** "Choose targets for [card]" removed from above the image.
- **RQ-08.3** Under the image, in that header's style: `[Action] [Player]'s [Card]?`.
- **RQ-08.4** The final confirm screen removed, after an audit of what it holds.
- *Proposed wording:* your own card reads "Destroy **your** Sol Ring?"; a name ending in s takes 's ("Charles's");
  the verb is the engine's (Destroy, Exile, Return, Tap, Gain control of); a "may" effect's buttons are the verb and
  its negation (**Destroy** / **Don't destroy**); a face-down card is "face-down creature".
- *Proposed audit for RQ-08.4:* back out (the spell stays on the stack, targets reopen); whether opponents' responses
  hang on that screen (the engine's, must survive); choices recorded there (order, division, mode, X, the "may"); a
  re-check that targets are still legal; the log, the Coach's context, analytics and test selectors; whether other
  flows (no targets, other players) share it. Anything of value moves onto the question screen; the PR lists what
  moved and what was deleted.
- **Wireframe: required,** drawn with RQ-01 (section 5, C1).

### RQ-09 Card spacing on the battlefield

*Rob:* "The spacing between cards on the board is too much. It's ok that the edges of cards clip under/over cards
next to it. Let's make the spacing another adjustment option. You can put it in Camera for now."

- **Acceptance:** a spacing slider in Camera, from today's gaps through flush to overlap; a tighter default.
- *Proposed:* overlap left to right so name and mana cost stay visible; the hovered or selected card rises; P/T stays
  readable on the right-most card at the tightest setting; one value for rows and columns; kept per person with the
  camera's settings; applies to opponents' boards; moves to the settings screen when house rules arrive.
- **Wireframe:** optional (Camera menu with the slider; the board at three settings).

### RQ-10 Identical lands always stacked

*Rob:* "Land cards that are identical should always be stacked and follow the instructions I provided in other
sessions on stacking identical cards ... an xn on the top card saying how many cards are in the stack, tapped and
untapped (small subtext font). When I click on the stack, I'm only activating the top copy. If it's tapped, I'm
activating the next in the stack until there are no untapped cards in the stack. But they always stay as a stack."

- **RQ-10.1** Identical lands are always one stack on the battlefield.
- **RQ-10.2** The top card shows ×N with tapped and untapped counts, in small text (*Proposed:* "×4 · 3 untapped").
- **RQ-10.3** A click activates one copy, the next untapped one each time, until none is untapped.
- **RQ-10.4** The stack never splits for tapping; the tapped copies show as tapped within it.
- **RQ-10.5** "The instructions in other sessions": #878 (Rob, 2026-10-25: *"stack cards that are identical and have
  an x# on them ... If I can select more than one, I should have a small numeric tick up/down value to choose how many
  in that stack"*). #878 built it for the options of a question; **the battlefield itself is the gap**. Rob's
  screenshot may be from production, which lacks #878.
- *Proposed:* identical = same name and same state; different printings of a basic stack together; a copy with an
  Aura, counters, animated, or a token beside non-tokens sits beside the stack until the difference ends; one card in
  the stack turns sideways when any is tapped; a dual land asks its color at each tap; the whole stack untaps in the
  untap step; applies to every seat's board.
- **Open:** the click semantics against the take-back double-click and the queued "double left click taps a land"
  (section 5, C3).
- **Wireframe:** recommended (a stack untapped, partly tapped, all tapped; a copy set apart).

### RQ-11 Drag the lands / battlefield divider

*Rob:* "The divider between lands and battlefield should have a grab-n-drag up or down functionality to resize the
divide in amount of space each is given. This should be the case on all 3 views."

- **Acceptance:** in Full, Table and Focus, the divider drags up and down, and the lands and battlefield areas follow.
- *Proposed:* the shared handle of RQ-03.1 (cursor, keys, double-click reset); each side keeps at least one row; kept
  per person, per view; applies when viewing an opponent's board (RQ-02); the 3D perspective maps the drag so the line
  stays under the pointer.
- **Wireframe:** optional.

## 5. Conflicts and their proposed resolutions

| # | Between | Conflict | Proposed resolution |
| --- | --- | --- | --- |
| C1 | RQ-01.1 vs RQ-08 | RQ-01 shows source → target thumbnails; RQ-08 shows the affected card large with a question | **One target:** RQ-08 (affected card large, question under it) with one compact row above it: source thumbnail → effect → controller. **Many targets:** RQ-01.2's quadrants, with a summary question ("Destroy 3 artifacts of 2 players?"). Rob approves both in RQ-01's wireframe. |
| C2 | RQ-08.4 vs the engine | The removed screen may carry a response window or a choice | Audit before removal (RQ-08.4); anything of the engine's stays the engine's. |
| C3 | RQ-02, RQ-10 vs existing and queued clicks | A land's double-click takes back a land just played (`takeBackLand`); the queue says a double left click taps a land; a single click waits 300 ms for a double | RQ-02 acts only on empty board area. RQ-10's click on a stack taps the next untapped copy; the take-back double-click stays on a land just played; the queued "double-click taps" becomes moot under RQ-10 (a single click taps). Rob decides. |
| C4 | RQ-05.4f vs ROB-168, ROB-26 | Rob removes "#486"; ROB-168 numbered same-named creatures so twins can be told apart | Remove the visible number; tell twins apart by position on the board, a small mark on the thumbnail, or a hover that lights the card on the table. The engine's ids stay underneath. |
| C5 | RQ-06.1 vs queued "Actions grouped Hand / Board / Other" | Both change the desk's buttons | RQ-06.1 applies inside any grouping: a card with one action has no option button and the primary button names it. |
| C6 | RQ-03.1, RQ-11 vs the existing drawer resize | Three resize gestures | One shared handle component and one saved-layout store. |

## 6. Proposed execution grouping

| Workstream | Items | Lane | Session plan |
| --- | --- | --- | --- |
| **A. Actions desk** | RQ-01, RQ-05, RQ-06.1, RQ-07, RQ-08 | Play | One session (one file family, `crankmagic-board.js`); RQ-01's wireframe first, then build |
| **B. Board display** | RQ-02, RQ-09, RQ-10, RQ-11 | Play | One session, after or beside A on separate files where possible |
| **C. Side panes** | RQ-03 | Play (Coach markup may be Workshop's) | Parallel to A and B if its files are separate |
| **D. Engine** | RQ-04, RQ-06.2's room half, any field A or B requests | Claude · Engine | Parallel; merged first, the UI builds against `main` |

## 7. Out of scope here

- The mana-payment panel and the Hand / Board / Other grouping (queued 2026-10-25, separate requests).
- The house-rules settings screen itself (RQ-06.2 and RQ-09 only reserve a place in it).
- Drag-to-reorder, if RQ-03.4's investigation finds it is not small.

## 8. Return format

Return one table, one row per sub-item (or per whole item where it has none), then the conflicts and any new
questions for Rob:

```
| RQ | Class | Audit finding(s) | wireframe_ids | wireframe_gap | Change made to the audit | Open question for Rob |
| --- | --- | --- | --- | --- | --- | --- |
| RQ-01.1 | CONFLICT | F-12 | WF-07, WF-07.b | yes: 3-effect quadrant frame | F-12 rewritten per C1 | Source fixed or centered? |
```

Then: the audit's findings no RQ touches (unchanged), the wireframes added or changed (IDs), and the decisions Rob
must make before the build (C1–C5 and each item's **Open** lines), each with the audit's recommendation beside this
document's.
