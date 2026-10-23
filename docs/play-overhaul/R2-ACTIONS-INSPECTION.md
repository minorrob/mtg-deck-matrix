# R2: shared Actions and card inspection

Rob authorized starting this release on October 23, 2026. Branch: `codex/play-r2-actions-inspection`, from main `a0310037`.

## This slice

- One mandatory, collapsible Actions module and Boards navigation in the left drawer across Table, Focus and 3D. Optional modules retain saved placement; older Actions placement migrates to the left without losing optional modules.
- A pending-choice handle remains reachable with the drawer or Actions collapsed. New mandatory questions reopen Actions; ordinary priority updates do not repeatedly reopen a drawer the player closed. Draft selection remains on the same authoritative question across view changes.
- Read-only pinned inspection for projected cards, authorized reveal choices, stack references and structured recent-event references. Mouse hover and keyboard focus provide inspection in 3D even with Card Preview hidden. Right-click/long-press pins the same inspector in every view. Expired private reveals and identities redacted by a later seat projection are removed from the inspection surface. An authorized face-down identity remains inspectable.
- 3D replaces the Full screen label. The stored `full` value remains compatible. New or invalid desktop preferences use 3D; valid saved Table/Focus/3D preferences are restored. Phone remains Focus without overwriting the desktop choice. Choosing a view no longer enters browser full-screen or makes Escape change the saved view.
- Stale selections are refused after the game revision/question changes. The interim release below adds explicit review to card-play gestures; submission remains authoritative.
- Calm dark panels, restrained warm borders and the title font begin the mockup's visual language. The Actions drawer and pinned inspector reserve space beside the playable surface. The optional right module drawer retains its existing overlay behavior; wider HUD customization remains R4.

## Interim release: explicit review and the lounge

Rob authorized continuing through merge and Staging deployment on October 23. PR #842 includes the shared shell above plus this action-flow and pre-lobby slice.

- Clicking a card or a single-choice action stages a local selection. The left Actions pane shows the current offered choice and an explicit Confirm action / Confirm choice. Changing or clearing it sends nothing. Pass, Draw, Skip/Yield, and the existing double-click land take-back retain their explicit controls.
- A card with multiple legal uses opens those choices in Actions, replacing the centered chooser. Desktop inspection stays in the reserved right pane. Automatically opened action inspection closes when the game advances; manually pinned inspection stays open. Escape closes the foremost menu before the inspector. Source recovery for the existing choose-cost/choose-target question IDs uses only visible projected cards. Phone keeps its existing decision surface and explicit inspection rather than automatically covering it with a card.
- Target and payment options use the engine's exact labels, including strategic alternatives, additional costs, and self-targeting warnings. No rules or payment solver runs in the UI. One-of choices now require review and confirmation, like the existing multiple-choice, order, block, and amount drafts. A new revision clears an obsolete selection, even if the question ID is unchanged.
- This is confirmation of each authoritative step. An initial cast can lead to another target or payment question; the review says so. It does not promise that the whole sequence is one cancelable transaction or that a spell will resolve. Clear selection clears only the current local selection.
- The pre-lobby follows the supplied lounge wireframe: welcome/return, joining, table setup, Table talk area, personal record, and recent games. Table setup presents four seats around a table and an optional deck choice. Successful setup preferences are remembered per device and signed-in owner. Unsupported deck selections are cleared with the readiness explanation.
- The 3D battlefield and land rows scroll within their own zones when inspection narrows the surface; a mouse wheel traverses horizontal overflow, and redraws preserve the row position. The profile menu remains reachable above inspection. This addresses pane-induced overflow, not the entire R3 crowded-board package.
- The AI shortcut preselects an AI opponent for setup; it does not spend model credits, silently ready a deck, or skip the host's review. Invitations and Resume retain their existing APIs. No invented public tables, chat messages, or presence appear.

## Remaining first-final requirements

The interim release uses existing engine payment plans. ROB-74 is still Backlog in Linear: individually reversible source selection, remaining-cost feedback, a deterministic Auto-pay witness, and one final atomic Confirm cast require that contract. Full decision-catalog acceptance, complete double-faced-card inspection, all historical text/control references, chat/presence, physical-touch acceptance, and subjective joy acceptance remain open. This release does not close the whole encompassing R2 package or declare Play first-final. That still requires production release and verification.

## Release evidence

The final merge, Staging artifact, and authenticated readback are recorded on PR #842 and the downloadable status report after the release gate completes. Production is outside this request.

## First-slice proof (577aa8bf)

Local Chrome with `UAT_CHROME` and `GEOMETRY_REQUIRED=1`:

- `node tests/table-board.mjs`: 289 checks, a real game across two browsers over the room socket.
- `node tests/table-tabletop.mjs`: geometry, account-owned module preferences, camera, fan, stack, and 60/150-option decisions, including scrolling to and submitting the last option.
- `node tests/table-shared-shell.mjs`: all three views at 1024/1280/1400 widths, keyboard reach, docked Actions, and phone boundary.
- `node tests/board-babylon.mjs`: 74 renderer, recovery, and entry checks.
- `node tests/board-fullscreen-notes.mjs`: 43 existing gesture, preview-gap and compact-control checks.
- `node tests/board-commander-hand.mjs`: 88 commander and authorized revealed-hand checks across desktop and phone.
- `node tests/board-choices.mjs`: 42 room and UI choice checks.
- `node tests/feature-wiring.mjs`: 124 checks. `node tests/data-integrity.mjs` and `node tests/engine-breaks-anchors.mjs` pass.

- `node tests/a11y-board.mjs`: 298 checks across 30 mats and both themes, including pixel contrast, focus rings, Tab order and card-state announcements.
- `node tests/board-attack-all.mjs`: 33 checks. `node tests/board-callouts-place.mjs`: 24 checks.
- Three intentional regressions (new-player default, stale action guard, touch release guard) were caught by the R2 suite; source restored, then the suite passed again.
- `node tests/asset-versions.mjs`: all 125 assets have consistent pins and matching hashes.

`node tests/board-r2-actions-inspection.mjs`: 61 checks passed on that first-slice implementation. Visual review caught and fixed duplicate hover/pinned inspection; the suite now rejects that overlap in all three views. Screenshots in `work/r2-review/` show the shared Actions and pinned inspector with loaded card art in all three views; `work/r2-real-art/` has the wider shell proof; `work/r2-proof/` uses placeholder art and proves geometry only. Physical-touch testing and subjective visual acceptance are still required. The full repository CI is not claimed green.

## Interim verification, October 23

The final local browser pass used installed Chrome with `UAT_CHROME` and `GEOMETRY_REQUIRED=1`:

- `node tests/board-r2-actions-inspection.mjs`: 88 checks, including all-view private selection, exact target/payment review, stale revision invalidation, automatic versus pinned inspection, and Escape order.
- `node tests/table-board.mjs`: 289 real two-browser room checks. `node tests/table-lobby.mjs`: 138 host, invitation, phone, deck and countdown checks.
- `node tests/table-tabletop.mjs` and `node tests/table-shared-shell.mjs`: camera, saved modules, keyboard reach, stack geometry, and 60/150-option scrolling at 1024, 1280 and 1400 widths.
- `node tests/a11y-board.mjs`: 298 checks over 30 mats and both themes; lowest measured text contrast 4.69:1. `node tests/board-babylon.mjs`: 74 checks. `node tests/settings-r3.mjs`: 68 checks.
- `node tests/board-fullscreen-notes.mjs`: 48 checks, including wheel access to lands beside pinned inspection. `node tests/board-commander-hand.mjs`: 92 checks. `node tests/board-yield.mjs` passed; `node tests/room-resolve-all.mjs`: 59 checks. The real target/scry suite `tests/board-choices.mjs` passed 42 checks during this implementation.
- `python game/tools/batch/breaks.py tools/breaks-play-r2.py`: all four deliberate regressions caught (premature submission, stale selection, touch inspection selecting a card, and ignored row scrolling). Source restored, then the R2 suite passed again.
- Release-builder checks: 223. Feature wiring: 124. Readout feeds: 1,119. Data integrity passed. Break anchors: 135 files / 2,710 anchors. All 125 served asset pins and hashes match.

The layout pass found and fixed a profile menu hidden by inspection, 3D rows spilling beneath neighboring zones, automatic inspection retaining space after its action, and Escape closing the background inspector before a menu. One tabletop run hit a Node allocation error; the complete suite passed on rerun and again after the scrolling change. Browser tests were run sequentially.

Final real-art screenshots in the local `work/r2-interim-proof/` folder cover payment review in all three views at 1600x1000 and 1280x720, plus the lounge and setup at 1400 and 390 widths. No uncaught browser errors were recorded in that visual pass. These are isolated recorded projections; live release acceptance is recorded separately on PR #842 after CI, merge and Staging verification. Physical-touch and subjective joy acceptance remain open.
