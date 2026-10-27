# Acceptance and observed findings

The unit of acceptance is a player task on the combined tree, not a CSS class or a source assertion.
The main PR remains draft until these checks and the required CI gate are satisfied.

## Behavioral checks

- Create: invalid input makes no deck; the error is next to the field and focus reaches it. Successful
  creation updates the grid count without reload. Counts and stage truth retain their existing meanings.
- Measure to Explore: the handoff names the saved report and its weakest existing component. Query text
  cannot inject an invented score or manufacture a role-lens recommendation.
- Share: opening the action opens a dialog immediately; loading, error and retry remain in that dialog.
  Copying a link does not silently publish the deck or broaden an existing permission.
- Admin: an ordinary signed-in person, a forged header and a service seat cannot read administrator data.
  V1 cannot write feature switches. Access admission and actual invitation delivery remain distinct.
- Play: every legal action remains available with mouse, keyboard and touch; a single click followed by a
  double click cannot accidentally submit a second action. Existing stale-revision checks remain in place.
- Decisions: folding the drawer leaves the actual pending decision usable in the slot. Back/Cancel only
  change an unsent draft; declining an optional effect uses a real legal engine answer.
- Undo: a server snapshot restores the play and reversible mana only during its verified window. New
  information, priority moving away, a trigger, randomness or another action closes it. Reopening the room
  and replaying the tape preserve the same result. Existing saved games retain their rules.
- Results: a finished match files exactly once per human seat and source deck version, including after a
  reconnect; the record leads back to the appropriate deck. No private library is written by the engine.

## Visual and access checks

Capture desktop and phone states, all Play views, and both ends of size sliders. All six skin/register
combinations need contrast checks; representative dark, light and alternate-skin journey screenshots are
compared with the supplied reference and W01-W18. Card-art raster text is not measured as DOM UI type.
Game-state HUD captions use the 15px scaled floor; Coach and Camera form text retain their explicit
component sizes above the general 12px minimum (EX-14). Measure actual descendants, not only parent tokens.

Reject clipping, overlapping headings, inaccessible scroll content, missing focus, lost input drafts,
duplicate primary actions, broken portrait placeholders, or a tap-only/double-click-only action without
its equivalent input path. Check normal and reduced motion. A screenshot is inspected, not merely saved.
EX-17 expressly permits a tapped card's rotated corners to tuck under adjacent cards while every slot
and neighbor stays fixed; do not mistake that approved overlap for an untapped-card fit failure.

Combined incoming source is recorded in INCOMING-1026.md (merged PR #894). The later native Coach check
failed when a received room view blurred the connected composer; c50d78e3 preserves that live focus,
selection and same-match/same-view drawer scroll. board-r4-views passes 106 checks, including native
composer viewport/hit access, retained draft/caret/node and delayed capability entry. The full real-table
continuation and final CI remain separate gates; this targeted result does not claim either passed.

Initial D1 review found phone battlefield labels overlapping at 200%, small desktop chrome, broken-image
portrait glyphs and a misplaced Table menu. Corrected D1 screenshots and assertions cover those cases.
The combined board-r4-shell suite now passes 111 checks, with genuine rear-row clipping repaired and
EX-17's approved tapped corners preserved. The coordinator inspected its Full, Table and Focus HUD200
captures and phone390 lands/HUD200 capture under workbench/r4-play-evidence-20261026/combined-rear-coach/.
Those are bounded fixture captures with placeholder card art; final CI and staging are separate gates.

The five migrated legacy baselines pass: table-camera-layout (three widths, phone and persistence),
board-r4-shell111, board-hand-table109, board-3d-camera106 and board-babylon90. The wheel tests now point
at an actual unobstructed table plane rather than a card row reserved for scrolling. Menu assertions
retain zero pre-binding sends and one exact binding send. Current r4 Account/Table/Camera routes, native
Questions dismissal and the approved readable sizing offset replace older setup assumptions. No failed
native input is replaced with a forced click.

Later Coach repairs 991ccc29 and 9ce2148d preserve async disclosure focus and return Clear's keyboard
focus to More after clearing. The final Focus component run passes 42 native checks, including pending
replies with More/Clear/Questions focused, the Clear-to-summary handoff, draft/caret and drawer scroll.
The browser's Menu-key event is suppressed within the custom card menu (0fff1f12), with editing menus
elsewhere preserved; the existing native 3D regression failed before that repair and passed afterward.

## Workshop and shared-menu local evidence

- `tests/uat/r4-workshop-journey.mjs`: 77 checks, 20 full rendered page/dialog primary sweeps,
  three rendered graph color cases and both Define/New table inline errors in dark/light/Bronze.
  Actual composited error contrast is 4.686 / 9.588 / 4.687 respectively. Six deliberate joined
  regressions were caught and restored. The same isolated saved deck crosses the screens; its
  Measure report is a precomputed fixture, not an executed simulation or provider result.
- `tests/table-lobby.mjs`: 155 checks; `tests/table-setup.mjs`: 46; 17 pure flow regressions caught.
  Includes configured rules before auto-ready AI seats, canonical local chooser names, exact-content
  shared-snapshot deduplication, retained distinct shared versions, public precons and permission
  rechecks. Only table-legal defaults on; final server admission remains authoritative. Leave
  disconnects locally and preserves the saved rejoin shortcut; it does not claim to release a seat.
- `tests/account-menu-r4.mjs`: 85 checks and five caught regressions. Signed-out desktop dark,
  signed-in phone 390×844/Bronze dark and administrator desktop light exercise the same native
  popover, verified gates, ordered groups, one Settings, Skin/register controls and exact reset
  confirmation. Escape restores a replacement data-action invoker without reaching the draft
  sentinel; native outside dismissal preserves the clicked control's focus. Careful label/action
  contrast is measured on the actual group background and the action uses actual required ink.
- Existing Help 14, Settings 73, reset 43 and Landing 55 pass after the shared-menu adaptation.
  The shell baseline and a deliberate duplicate-receipt regression prove native revision-bound
  deletion Undo from hub and detail navigation, including persisted restoration after an intervening
  error. Preference receipts are ordinary success; no arbitrary later action receives a generic Undo.

Detailed source commits, screenshots and per-finding limits are in `WORKSHOP-AUDIT-EVIDENCE.md`.
The final Invite/Admin left alignment is a scoped cosmetic refinement after the inspected capture;
it does not change gates or actions and requires no separate browser slot. Final combined review
should use the integrated source. Global alternate-anchor/menu proof does not establish the actual
Play avatar's draft/hotkey boundary or Side Drawer Modules matrix by itself. Subsequent Play Settings70 verifies F-114's honest Actions explanation and real None/save/arrow controls; exact limits are in findings.json.
F-074 repeated unavailable notices and F-109 budget dominance remain follow-ups. Historical price
snapshots, generic Settings Undo order, live Admin/mail delivery and a full fresh finished-match/account
sync journey retain their documented partial limits. Do not convert a CH mapping into audit closure.

## Execution environment

Targeted checks use the installed Node 24.19.0 and Chrome on this machine. CI's required runtime is Node 22
and Playwright Chromium. The sandbox blocks browser localhost navigation and temporary Git initialization,
so those checks require the approved external execution context. A skipped test is not a pass.

The release-builder suite passed 226 checks after its sandbox-only failure was retried outside the sandbox.
Service worker passed 9, cloud sync 18 and readout feeds 1121. These do not replace full combined CI,
release acceptance or a real staging play journey.

Final scoped acceptance repairs include phone Camera layering, physical stacked-land Undo hover/focus,
Full49px action targets and EX-27 preview clearance from drawer bodies and their actual spine controls.
Fullscreen49 passes; native preview/spine hits failed before repair and pass afterward. The same existing
light Focus200 fixture measures drawer facts16.95:1 and avatar initial12.98:1 after the themed-ink repair.

Real-table phone diagnostics showed a101px battlefield viewport with626px content and uncanceled wheel
events that could not reach Library. The nested grid's scroll containment intercepted the native chain.
2e8320b2 makes only the phone grid overflow visible and permits chaining to the outer frame. The same
844×390 fixture fails before repair and passes all6 checks afterward (offset0→475, Library hit, fixed
turn pill), plus the existing portrait folded case14. Frame sizing and JavaScript gestures are unchanged.
Evidence: workbench/r4-play-evidence-20261026/phone-wheel-fix/. Physical phone hardware is still unproven.

The complete local real-room/native table-board run39 passes321 checks on 83aab1d2 after current-main
reconciliation. It verifies canonical per-owner result filing, private downloads/hidden-hand privacy,
reconnect/newest-wins, idempotency and native Review-to-deck-Record navigation. The physical hand may
overlap the board under EX-28; tabletop records allowed hand interceptions separately from uncovered
card hits and unrelated blockers. No hand-clearance geometry or overlap-driven zoom limit was kept.
