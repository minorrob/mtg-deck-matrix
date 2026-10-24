# Babylon and Play lounge integration

Branch: `codex/play-engine-lounge`, based on main `20e30f27`. Authorized by Rob on October 22 after the historical master reference. The encompassing completion plan is [PLAY-FIRST-FINAL-2026-10-22.md](PLAY-FIRST-FINAL-2026-10-22.md).

## Delivered scope

The live Full-screen table now uses the prototype's pinned Babylon.js 9.30.0 engine and procedural table geometry. It keeps all seven table designs and legacy preference mappings. The custom camera and accessible DOM mats/cards share the same perspective, including pitch, zoom and rotation. Rotation has a keyboard-operable slider and an empty-ground drag gesture; card/hand/module gestures remain separate. This is a renderer port, not an embedded fixture or a second game client.

The room still decides every game action. The prototype's fake local tapping, recorded-state loader and private data are not brought into production. Cards remain DOM controls; rigid mesh-card pickup and independent card angles remain in ROB-52's broader scope. A failed graphics download or lost context leaves those controls usable. Restoring graphics clears its failure message; leaving the game disposes the engine and its listeners. Table-design changes dispose replaced materials/textures. The standalone engine is 8.62 MB raw and lazily loaded on Full-screen entry. Its cached prototype archive's SHA-512 and shipped engine byte identity were verified.

Website Play now opens the pre-game lounge. It shows an authenticated, verified Resume card, explicit New table, invitation entry and actual recent games. Opening the lounge preserves the current socket and seat. Direct invitations retain their table route; New table is explicitly reachable even with a live game. The invitation form rejects unrelated origins, preserves staging/production destinations and handles keyboard submission without putting the token in a query string. Existing New table, seat/deck/readiness and invitation workflows are reused.

There is no fake discovery or chat feed. ROB-54's real service contract is still needed; chat and presence remain required for first-final. The integration does not certify full Commander conformance or change old-match policy. Standard/variant separation and the meaningful-choice gaps remain explicit plan dependencies.

The inherited Full-screen hand had a negative bottom offset, which cropped card bottoms. It now has clearance for the rotated card bounds. The additional upward hover lift is removed so the hand does not cover lands. Tests verify both complete cards and reachable lands.

## Proof and limitations

Run browser checks on this Windows host with `GEOMETRY_REQUIRED=1`, `UAT_CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe`, and `NODE_PATH` pointing to the repository's existing `node_modules`. Localhost browser access requires the test process outside the restricted network sandbox. No account secrets or real email sends are used.

Confirmed during this integration:

* `node tests/table-lobby.mjs`: 132 checks, two-browser host/invite/deck/readiness/countdown/game flow.
* `node tests/table-board.mjs`: 288 checks, actual room/socket decisions, private hands, draw/cast/pass, reconnect and ending; lounge Resume preserves the socket.
* `node tests/release-pages.mjs`: 223 checks, including Babylon/geometry/license in Play profiles and omitted from non-Play profiles. The test's isolated Git fixture requires normal local filesystem permissions.
* `node tests/board-babylon.mjs`: 90 checks, including actual `WEBGL_lose_context` loss/restoration, failed library download, shared mesh/DOM projection, ground dragging, bounded resources, lounge navigation and viewport fit.
* `node tests/a11y-board.mjs`: 298 checks, including pixel contrast over all 30 mats in both themes, focus rings and keyboard order. Babylon's own scene input handling is detached; its canvas is not a tab stop before or after pointer movement.
* `node tests/table-camera-layout.mjs`, `node tests/table-shared-shell.mjs`, and `node tests/table-tabletop.mjs`: pass. `node tests/board-fullscreen-notes.mjs`: 31 checks. `node tests/settings-r3.mjs`: 68 checks.
* `node tests/feature-wiring.mjs`: 124 checks. `node tests/data-integrity.mjs`: passes. JavaScript syntax and whitespace checks pass.
* `python game/tools/batch/anchors.py .`: no stale anchors. The old Pixi disposal mutation is superseded by a Babylon engine-disposal assertion.
* `python game/tools/batch/breaks.py game/tools/batch/breaks-play-adoption.py`: unbroken baseline passes; all six regressions caught (projection, routing, materials, hand clipping, engine disposal and canvas focus). The re-anchored shared-shell Tilt and tabletop Camera persistence mutations are also caught, with their baselines green.

The pre-push scan and remote CI status belong to the final Git/PR record. Screenshots from the integration fixture live in the local `design-review-2026-10-22/integration` review folder; they are explicitly recorded-game images. Oak/obsidian and phone lounge screenshots were inspected. This is not a live staging or production release. Physical phone input/GPU performance, broad card-angle/pickup behavior and complete multiplayer end-to-end acceptance remain unproven by this slice.

The first GitHub run on `a3daaa32` passed 596 suites and failed only `tests/asset-versions.mjs`: five local files had CRLF bytes when their hashes were recorded, while Git's canonical files had LF bytes. The follow-up normalizes those working files to LF, advances their pins with the repository helper, and regenerates the manifest. Validation must compare the manifest against Git's committed blobs as well as the working files so Windows checkout bytes cannot hide this mismatch again.

Cloudflare's separate checks failed before deployment: their feature-branch triggers ran `npx wrangler preview` without generating a release or its Wrangler configuration. On October 23 Rob chose to disable branch previews and preserve the release workflow. Removing the generated triggers through the API was insufficient: the next push recreated them. The dashboard's underlying **Builds for Preview branches** switch was then turned off and saved for both `crankmagic` and `crankmagic-staging`. Their release branches remain `release/pages` and `release/cloud-staging`, with the existing pinned deploy commands. No deployed Worker or release artifact was changed; checks from earlier attempts remain historical results.

For the merge handoff, `baae9ef0` contains the canonical asset-record correction. All 125 manifest hashes match Git's index blobs, `tests/asset-versions.mjs` and `tests/feature-wiring.mjs` pass, `tests/release-pages.mjs` passes 223 checks, and its exact-head pre-push scan is clean. Rob authorized merging PR #836 once all checks pass. The final head's CI and merge result are recorded on the PR; this document does not claim a pending run passed.

## October 23 staging verification

PR #836 merged as `35018161ea062810e113796a1b5230247b204c24` under Rob's explicit instruction to skip the pending suites and merge. Release artifact `bc28e2084a92c6a6c29ba9d6b6acd5b811b1379f` was then pushed on Rob's instruction to publish staging. `tools/staging-check.mjs --expect 35018161` verified the source/profile, both entry pages and the service identity. Authenticated live reads matched the app, cloud table, stage, geometry and Babylon engine against the artifact's SHA-256 bytes. Chrome rendered the new Commander lounge and opened New table from it. The local-host `crankmagic-lobby.js` is intentionally omitted from the cloud profile; its lounge lives in `crankmagic-table.js`.

The original acceptance failure was a stale expectation of New table directly at `#game`. The updated walk proves the lounge followed by its explicit New table action and passes all 23 checks against this artifact. The staging script now honors an installed Chrome path instead of clearing the caller's browser override.

A separate live game under the service test identity exposed a real integration defect before turn one: opening hands carry `state.phase: null`, so the unguarded combat-prefix check stopped Full screen before mounting Babylon. The follow-up handles a missing phase as noncombat. The Babylon fixture now begins on a recorded opening-hand frame before its populated-board interactions; the release Worker walk also enters Full screen before turn one. This correction does not change rules or player decisions.

Follow-up validation: `node tests/board-babylon.mjs` passes 93 checks; restoring the old unguarded expression makes its opening-hand case fail. `node tests/uat/play-e2e.mjs` passes 44 checks, including the real local Worker, opening-hand Babylon scene, shared-deck invitation, multiplayer reload, full-record replay and solo concession. `node tests/uat/release-acceptance.mjs` passes 23 checks against the published artifact. Feature wiring (124), asset versions (125), JavaScript syntax and whitespace checks pass. The follow-up PR records its source/merge and final staging release; full CI suites are skipped under Rob's instruction for this Play release, not claimed passed.

## Preserved work

The original dirty priority-card checkout was preserved, including untracked files, in the named Git stash `codex-preserve-priority-cards-before-play-engine-oct22` on `codex/play-priority-cards`. It has not been applied over newer main or deleted. The new branch contains only this integration and its plan/tests.
