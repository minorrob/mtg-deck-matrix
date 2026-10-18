# ROB-52 / ROB-100: live Babylon surface slice

Branch: `codex/play-babylon-surface`, based on main's merged shared shell (`73f55b35`) and the Table camera fix in #765. The phone proposal remains separately reviewable in #766.

This slice replaces the Full view's ground renderer with the approved Babylon table catalog. The selected table remains `cm-stage-table`, with medieval-banded the default and the existing legacy aliases. Existing DOM cards, counters, attachments, keyboard controls and room-authorized actions remain in place. The shared camera geometry must align the meshes and DOM at every existing Tilt/Zoom endpoint; no new controls or defaults are introduced.

Proof required before ready: actual three-dimensional table parts for all seven designs, projection agreement, selected design persistence, context-loss/readable fallback and recovery, repeated Full/Table transitions without leaks, browser suites with geometry required, deliberate regressions and 1280x720/390x844 screenshots with stable IDs. Production packaging must include the pinned engine and its license under the existing CSP. No live result is claimed by this planning commit.

Remaining ROB-52 work after this slice: rigid card meshes, pickup/inspect/return and section-bounded drag, authoritative live tap actions, touch and accessible equivalents. Physical-phone and hardware WebGL validation remain unproven.


## Implementation and evidence in progress

The surface loads a local Babylon.js 9.30.0 UMD build, then the ported procedural table catalog and renderer adapter. Its projection reproduces `CrankStage.geometry`; actual mesh vertices agree with the DOM camera within 0.15 pixels at 27 width/Tilt/Zoom combinations. The DOM retains every card action, counter, attachment, hand and keyboard target. The renderer reads presentation options only.

The existing Volcano video policy remains. Forest and cloud artwork and peripheral motion use a separate decorative canvas; reduced motion and hidden tabs stop it. A single graphics context is retained across Full visits; leaving disposes the scene. Native WebGL context loss hides graphics and supplies a readable mat backing, and restoration rebuilds the surface. A failed engine request leaves the DOM board available and can retry when Full is selected again. Failed or pending mat artwork keeps its green backing.

Two review findings were reproduced and corrected: the felt table's rail originally intersected the mat plane; the table now sits below its highest trim. Failed artwork originally lost its readable backing; an image-independent backing now remains. The focused suite ray-tests the mat coverage of every design and samples a real fallback pixel. This is browser proof, not hardware qualification.

Dependency provenance: `ui-prototypes/babylon/setup.mjs` pins the npm archive for Babylon.js 9.30.0 with SHA-512 verification. The copied `vendor/babylon.min.js` is 8,619,713 bytes, SHA-256 `ff331103574d58a94e68353087721260628a4a6dd5521aa98949127bde73bbff`. Apache-2.0 redistribution text is `vendor/BABYLON-LICENSE.txt`, referenced by the adapter for the release file walk. Scripts load from this origin under the existing CSP. The [Babylon context-loss documentation](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/scene/optimize_your_scene.md) describes the restoration observables used here.

Screenshots: [desktop, H01/TB01/T05/T08/T11](screenshots/rob-52-babylon-1280x720.png), [graphics interruption, H01/T05](screenshots/rob-52-context-fallback.png), [unchanged phone baseline, P01](screenshots/rob-52-phone-baseline.png). The upright phone proposal is separately reviewable in #766.


## Release blocker: ROB-144

`node tests/release-pages.mjs` fails because the cloud-staging verifier still requires `vendor/pixi.min.js`, `vendor/pixi-csp.min.js` and `vendor/PIXI-LICENSE.txt`. Engine owns `tools/release-pages.mjs`. [ROB-144](https://linear.app/robs-build/issue/ROB-144/make-play-release-verification-support-the-babylon-renderer-transition), mirrored in ROB-11 and ACTIVE Requests row 10, asks for backward-compatible active-renderer verification before this branch is ready: keep current main's Pixi release valid, require the Babylon adapter/catalog/runtime/license for the new stage, and exclude both renderer families from profiles without Play. No release-tooling workaround or deployment was made here.


## Known startup race, separate from this renderer

One final `table-tabletop` run failed its unchanged saved-arrangement assertion after reload. A diagnostic rerun passed, and forcing `/api/me` to take two seconds reproduced the loss with **both** the Babylon candidate and main's Pixi stage: the saved per-account order remains `[529,461]`, while the first board draw uses `[461,529]` before identity settles. [ROB-145](https://linear.app/robs-build/issue/ROB-145/expose-settled-account-identity-so-play-restores-saved-arrangements-at) requests a Workshop-owned readiness signal; ACTIVE row 11 and ROB-11 record the seam. No account-module edit, weakened assertion or polling workaround is included here.


## Local proof checkpoint

With `GEOMETRY_REQUIRED=1` and installed Chrome: `node tests/table-babylon-surface.mjs` passes the camera/design/clearance/lifecycle/fallback checks plus Forest motion and reduced motion; `node tests/table-board.mjs` passes 277; `node tests/settings-r3.mjs` passes 63; `node tests/table-tabletop.mjs` and `node tests/table-shared-shell.mjs` pass. The ordinary tabletop rerun was run alone after diagnosing the ROB-145 failure above; that known delayed-identity race is not claimed fixed.

`python game/tools/batch/breaks.py game/tools/batch/breaks-babylon-surface.py` caught the original eight regressions, and a baseline plus the added `Forest loses its peripheral motion` mutation caught the ninth. `python game/tools/batch/breaks.py game/tools/batch/breaks-a11y-tabletop.py "the renderer destroyed on leaving Full screen"` passes the full accessibility baseline and catches the re-anchored retained-context break. Ten regressions total, `missed: []`. The accessibility suite initially caught Babylon's unwanted canvas Tab stop; the surface now sets `canvasTabIndex = -1` and detaches scene controls. A targeted static re-review found no remaining defects in the three repairs.

Shared checks pass: feature wiring 124, data integrity (50 variants), service worker 9, 126 asset hashes, and 1,930 anchors across 81 breaks files. README names 530 root suites. Cache pins: board 55, stage 7, stage CSS 19, adapter/catalog 1, vendored engine cache pin 9 (library 9.30.0), service worker 485, app 501.

The release dependency walk includes all four new renderer assets, including the license. Release verification **fails** on the three obsolete Pixi requirements (ROB-144); no complete release-package or CI pass is claimed. The PR remains draft. Physical phones, hardware WebGL, staging and rigid live card interactions remain unproven/outstanding.
