# Babylon tabletop interaction prototype

Isolated browser prototype built from the same `CrankRoomView@1` recording used by the existing tabletop preview (`docs/reference/replit-sample-views.json`, initially frame 14 of 42). This is a renderer experiment, not a live game client. It never writes to a match, profile, library, or cloud service. Tapping rotates a mesh locally; it does not activate a mana ability, pay a cost, or change priority. Reset, changing seats, and changing recorded frames discard local arrangements.

## Run

From the repository root, with Node 22+ and `tar` available:

```powershell
node ui-prototypes/babylon/setup.mjs
node ui-prototypes/babylon/server.mjs
```

Open http://127.0.0.1:4391/. Setup installs the Apache-2.0 Babylon.js 9.30.0 UMD engine and its license into an ignored local dependency directory. The package archive is SHA-512 checked against a pinned digest. No package install scripts execute. The standalone bundle avoids introducing a build system into the existing app; a production migration should use modular imports and bundling.

For a phone on the same trusted local network, start with `$env:BABYLON_HOST='0.0.0.0'` and use the computer's LAN IP with port 4391. Device isolation or the Windows firewall may prevent access. The preview server serves an explicit asset allowlist and sanitized recorded views, accepts GET only, and has no credentials or account routes. Do not expose this development server to the internet.

Card art is fetched from Scryfall only for card names in the visible recorded projections. Cache misses are serialized and spaced by 125 milliseconds, then saved under ignored `node_modules/.card-art`. A cold cache can take time to fill; failures retain a named fallback card. Existing playmat artwork and the muted Volcano video are reused. The wood material is a procedural prototype surface, not final photorealistic art.

## Interactions

- Drag your cards: lift, move within their existing section, then settle onto a quarter-unit grid. Cards share the mat's physical camera perspective.
- Select a battlefield card, then Tap/Untap. A click alone never taps it.
- Inspect: button, desktop double-click, or mobile long press. Close returns the card to its current table position.
- Return restores the selected card's original recorded position. Reset restores all local changes.
- Drag empty table space to pan. Wheel, two-finger pinch, and the Camera zoom slider zoom the scene.
- Desktop Camera includes 0–60-degree tilt. Touch devices have one fixed Focused view, in portrait and landscape.
- Cards on this mat provides a keyboard-accessible list. With the canvas focused: arrow keys move the selection; Space lifts/sets down; T taps; Enter inspects; Escape restores its recorded position.
- Other players' public cards can be inspected. They cannot be moved or tapped. Other players' hands remain backs when switching seats. Hidden cards cannot be inspected.
- IDs are on by default: K plus the existing card ID, B01–B04 for mats, H01 header, C01 Camera, I01 selected-card controls, I02 inspection, F01 status. The IDs button hides them.

## Verification

```powershell
$env:UAT_PLAYWRIGHT='path/to/playwright/index.js'
$env:UAT_CHROME='path/to/chrome.exe'
$env:GEOMETRY_REQUIRED='1'
node ui-prototypes/babylon/interaction-checks.mjs
```

The standalone suite starts its own read-only server and checks mouse/keyboard input, real Chromium touch events, lift/settle geometry, section bounds, tapping, inspection/return, recorded-state integrity, hidden hands, view-only opponents, camera endpoints, frame changes, mobile portrait/landscape, pinch, cancellation, reduced motion, and server access boundaries. It deliberately disables movement in a separate browser page and verifies that the movement assertion fails. Screenshots are written to `docs/play-overhaul/screenshots/babylon-*.png` with object IDs.

Physical Android/iPhone testing, Safari, hardware performance/battery measurements, live room synchronization, production accessibility, artwork polish, and production integration remain unproven. This prototype is not added to the existing app's asset manifest, service worker, or staging release. The wider playtest plan and its existing regression blockers remain separate work.
