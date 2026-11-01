# F6 · 3D: the camera into the fight, H0 card-art standees, smoke and glow

**Linear:** ROB-369 · **Wave 3** · **Lane:** `crankmagic-holo.js` (new), the camera preset in `crankmagic-stage.js`,
`assets/particles/**`, the Effects switch in `crankmagic-settings-play.js`, `tests/board-3d-camera.mjs`,
`tests/board-babylon.mjs` (extended) · **Waits on:** F2 · **Runs beside:** F3, F4. The shader may be prototyped earlier
under `ui-prototypes/holo/` (no board files) in parallel with F2.

Rob, 2026-11-01: *"I would want to put this into a tiltable three-dimensional experience on the 3D view."* *"A
hologram ... rises up out of the card when the card is tapped and stands on the card ... they would all run, fly,
slither ... forward ... poof into smoke at their collision point ... the Star Wars game board on board the Millennium
Falcon."*

## Goal

In the 3D view: the camera eases down and toward the fight at the morph and back at the end; each declared attacker
and blocker raises a **standee**, the card's own art as a holographic plane standing on the card, which travels the
arrows on the timeline's events and dissolves where the card dies; smoke and glow as a style layer with its own
setting. Everything renders from the same events (I2); nothing carries a fact a glyph does not (R17).

## Hard rules

I2, I3 (the camera's motion is part of the eye test: the card's projected box follows an eased path while the camera
moves), I8, I10 (a face-down card's standee is the card back, not art), I13 (3D is a local session's acceptance), I14
(the Effects intensity is a slider), README constants and `BENCH`.

## The specification

### The camera

A preset `combat` in `crankmagic-stage.js`: tilt +8° from the player's current tilt (clamped to `TILT_LIMIT`), zoom
×1.1 (clamped to the camera's range), pan to the center of the fight (the midpoint between the muster and the
attacked fronts), eased over `MORPH_MS` with `EASE` through the existing `steer`/`look` machinery; the player's wheel,
drag and Camera sliders still work during combat and are respected (the preset moves relative to where the player is,
and does not fight the player: a player input during the ease cancels the ease). `leave` eases back to the pre-combat
camera unless the player moved it, in which case it stays.

### H0 · the card-art standee

- One plane per fighting card, in `crankmagic-holo.js`, created at `enter` for declared attackers and at each `block`
  event for blockers; positioned at the card's table position from `CrankCombat.anchors()` (plane coordinates →
  world via the stage's geometry), standing perpendicular to the table, billboarded around Y toward the camera,
  height `1.3 × card height`, base at the card's center.
- Texture: the card image already shown (`pictureOf(name, card)`), cropped to the art box: x 7.5% to 92.5%, y 11% to
  57% of the full card image (the normal frame's art window; a fixed crop so every card reads the same). A face-down
  card uses the back image uncropped (I10). Images load with the same `referrerpolicy` the board uses.
- Material: one `ShaderMaterial` porting the three ideas of the MIT Three.js holographic material (RESEARCH.md §1):
  Fresnel rim (power 2.0, strength 0.6), horizontal scanlines (8 per unit height, 30% depth, scrolling at 0.2 units
  per second), signal flicker (±5% alpha at 9 to 13 Hz noise); tint `#5ad3ff` multiplied over the art; base alpha
  0.75; additive blend; `GlowLayer` intensity 0.6 for bloom. The MIT notice for the ported logic sits in the file
  header.
- Motion, on `CrankTimeline` hooks only: rise from the card over 300 ms at `enter`/`block`; on `step
  COMBAT_DECLARE_BLOCKERS` the attackers' standees advance to the approach positions already drawn in 2D (they ride
  the same arrows); on each `damage` event the attacking standee lunges toward its target over `EVENT_MS.lunge` and
  returns; an unblocked attacker's standee travels to the badge; on a `move` to the graveyard the standee dissolves
  (alpha to 0 over `EVENT_MS.dissolve`) with a smoke burst at its position; at `leave` all remaining standees sink into
  their cards over 300 ms. Flying creatures (keyword from the view) travel on an arc 0.3 × distance high; the rest slide.
- Cap: 40 standees; beyond that, only attackers and blockers in the current damage wave have standees.

### Smoke and glow (the style layer)

- `assets/particles/smoke.json` and `assets/particles/clash.json`, exported with `ParticleHelper.ExportSet` from tuned
  smoke and explosion presets (RESEARCH.md §4), loaded through `ParticleHelper.BaseAssetsUrl`; textures our own or CC0,
  listed in `assets/particles/LICENSES.md`. `GPUParticleSystem` where WebGL2 allows, the fallback is automatic.
- Fired on the same events as the standees' motion: a clash puff at the lunge's contact point (`damage` to a card), a
  dissolve smoke at a death, a glow pulse under a standee while its card is the source of a `damage` event. Live
  particles capped at 2,000; emitters pooled.
- Settings › Play: **Effects**, a slider 0 to 100 (`preferences.play.effects`, default 60 on desktop, 0 on phones),
  where 0 is off and the value scales particle counts and glow intensity; `CrankMotion.reduced()` forces 0. Holograms
  (standees) are on when the 3D view is on and Effects > 0.

## Build steps

1. Prototype the shader and the crop under `ui-prototypes/holo/` (a standalone page with Babylon and three sample
   cards); screenshot for Rob's look (`design-reference-and-critique`: references cited, never copied). This step may
   run beside F2.
2. The camera preset and its test (`tests/board-3d-camera.mjs` extended: the preset applied at `enter`, relative to the
   player's camera, canceled by input, restored at `leave`).
3. `crankmagic-holo.js`: standees, motion on hooks, dissolve, caps; particles from JSON; the Effects setting.
4. `tests/board-babylon.mjs` extended: standee count equals fighting cards (synthetic views), a face-down card's standee
   uses the back, Effects 0 creates no particle systems, reduced motion creates none, caps hold at 40 and 2,000.
5. A benchmark: 40 creatures, the morph and one damage wave; record frame times; assert no frame over 100 ms in the
   container; the 60 fps claim is a local session's.
6. `breaks-holo.py`: a standee drawn with art for a face-down card; a standee moving on a view instead of an event;
   particles created at Effects 0. All caught.
7. Pins; both pages and the service worker; `visual-acceptance` by a local session with screenshots at the three camera
   presets and Effects at 0, 60, 100.

## Proof

`GEOMETRY_REQUIRED=1 node tests/board-3d-camera.mjs`; `node tests/board-babylon.mjs`; the breaks runner; the local
session's walk of `node tests/uat/solo-vs-ai.mjs` in 3D.

## Done when

- [ ] The camera eases in and out and never fights the player.
- [ ] Standees rise, travel, lunge and dissolve only on events, and a face-down card shows a back.
- [ ] Effects is a slider; 0 and reduced motion produce nothing; the caps hold.
- [ ] "Unproven until a local session proves it" is written for 3D until that session reports.

## Risks and what to watch

- **The eye test under camera motion.** The card's projected box moves because the camera does; the test compares
  against the eased path of the projected box, which is the composition of two eases. Sample the real projection.
- **Textures and CORS.** Card images come from the card image host with the board's `referrerpolicy`; a texture that
  fails to load falls back to the back image, never to a blank plane.
- **Frame budget on integrated graphics.** Standees are planes (cheap); particles are the risk. Keep counts data-driven
  so a local session can tune the JSON without code.
- **Babylon's version.** Read what the stage loads before using any API newer than it (RESEARCH.md §3).

## Choices you will face

- *Start from a creature mesh instead of the card art?* No; H0 is the committed hologram (ROB-357 §4). Meshes are F7.
- *Animate standees for the 2D views too?* No; a CSS tilted art cutout may come later as its own issue if Rob asks.
- *A card's art crop looks wrong (an alternate frame, a saga)?* Keep the fixed crop; a per-frame crop table is a later
  data issue, not a code branch now.
- *Particles on phones?* Off by default (Effects 0); the slider remains available.
