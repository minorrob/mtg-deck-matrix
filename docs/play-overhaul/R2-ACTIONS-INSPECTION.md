# R2: shared Actions and card inspection

Rob authorized starting this release on October 23, 2026. Branch: `codex/play-r2-actions-inspection`, from main `a0310037`.

## This slice

- One mandatory, collapsible Actions module and Boards navigation in the left drawer across Table, Focus and 3D. Optional modules retain saved placement; older Actions placement migrates to the left without losing optional modules.
- A pending-choice handle remains reachable with the drawer or Actions collapsed. New mandatory questions reopen Actions; ordinary priority updates do not repeatedly reopen a drawer the player closed. Draft selection remains on the same authoritative question across view changes.
- Read-only pinned inspection for projected cards, authorized reveal choices, stack references and structured recent-event references. Mouse hover and keyboard focus provide inspection in 3D even with Card Preview hidden. Right-click/long-press pins the same inspector in every view. Expired private reveals and identities redacted by a later seat projection are removed from the inspection surface. An authorized face-down identity remains inspectable.
- 3D replaces the Full screen label. The stored `full` value remains compatible. New or invalid desktop preferences use 3D; valid saved Table/Focus/3D preferences are restored. Phone remains Focus without overwriting the desktop choice. Choosing a view no longer enters browser full-screen or makes Escape change the saved view.
- Stale action dialogs refuse an option after the game revision/question changes. Existing explicit card-play gestures and authoritative submission remain intact.
- Calm dark panels, restrained warm borders and the title font begin the mockup's visual language. The Actions drawer and pinned inspector reserve space beside the playable surface. The optional right module drawer retains its existing overlay behavior; wider HUD customization remains R4.

## Acceptance and remaining R2 work

`tests/board-r2-actions-inspection.mjs` verifies new-device and saved preferences, all three views, one decision prompt, read-only inspection, pane geometry, collapsed-choice recovery, draft continuity and expired private reveals using isolated projected room frames. It does not prove engine rules.

The encompassing R2 package remains in progress. Full decision-catalog coverage, specialized direct-payment review (ROB-74), all historical text references, complete double-faced-card inspection, and physical-touch acceptance are not claimed by this slice. Plain historical sentences without structured card references are not parsed into invented identities. Read-only inspection does not provide transform actions. Existing typed control-provenance inspection remains available through its dedicated view until it can be merged without losing its explanation.

No deployment is part of this implementation. The separate engine release session reported that Rob lifted its staging hold and published main a0310037 as release artifact 49157517 on October 23. That release does not include this R2 branch. First-final completion still requires production release and verification, per Rob's confirmed report policy.

## Proof

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

`node tests/board-r2-actions-inspection.mjs`: 61 checks passed on the final implementation. Visual review caught and fixed duplicate hover/pinned inspection; the suite now rejects that overlap in all three views. Screenshots in `work/r2-review/` show the shared Actions and pinned inspector with loaded card art in all three views; `work/r2-real-art/` has the wider shell proof; `work/r2-proof/` uses placeholder art and proves geometry only. Physical-touch testing and subjective visual acceptance are still required. The full repository CI is not claimed green.
