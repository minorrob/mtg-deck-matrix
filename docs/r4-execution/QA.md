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

Initial D1 review found phone battlefield labels overlapping at 200%, small desktop chrome, broken-image
portrait glyphs and a misplaced Table menu. Corrected D1 screenshots and assertions now cover those cases (111 shell checks). The first 67 passing interaction checks did not establish visual acceptance. The actual Study Babylon table was inspected, and the actionBar primary contrast was subsequently corrected in A. Final combined screenshots remain required.

## Execution environment

Targeted checks use the installed Node 24.19.0 and Chrome on this machine. CI's required runtime is Node 22
and Playwright Chromium. The sandbox blocks browser localhost navigation and temporary Git initialization,
so those checks require the approved external execution context. A skipped test is not a pass.

The release-builder suite passed 224 checks after its sandbox-only failure was retried outside the sandbox.
Service worker passed 9, cloud sync 18 and readout feeds 1121. These do not replace full combined CI,
release acceptance or a real staging play journey.
