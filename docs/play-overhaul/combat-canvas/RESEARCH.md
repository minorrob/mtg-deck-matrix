# Research for the heavy parts (2026-11-01)

Rob, 2026-11-01: *"Perform research where needed to ensure we leverage the best practices and any open-source options
that have already done holographic rendering or the type of art that we will need, but only in those areas where the
build work would be heavy on our side, token-heavy, and work-heavy."* Four areas qualified: the holographic shader,
rigged creature libraries and their licenses, particle presets, and the morph mechanism. Everything else in the plan
is ordinary DOM, SVG and CSS work the repository already does. Each finding names its source and its license status;
a session that relies on one re-checks the license on the download page before committing a byte of it.

## 1. The holographic shader (F6, H0)

**Finding.** No ready-made Babylon.js hologram material exists as open source. The closest open reference is a
**Three.js holographic material by Anderson Mancini (ektogamat), MIT**: Fresnel rim, scanlines (default size 8.0),
signal flicker, a brightness control, recommended with bloom. Its GLSL is small and portable. Babylon provides every
building block: `NodeMaterial` (and its visual editor) or a `ShaderMaterial`, `FresnelParameters` on standard
materials, and `GlowLayer` for the bloom.

**Decision for F6.** Port the ektogamat shader's three ideas (rim, scanlines, flicker) into one Babylon
`ShaderMaterial` on a plane, textured with the card's art crop; bloom via `GlowLayer`. Keep the port in
`crankmagic-holo.js` with the MIT notice for the ported logic. Do not depend on the Three.js package.

Sources: [threejs-vanilla-holographic-material (MIT)](https://github.com/ektogamat/threejs-vanilla-holographic-material),
[its scanline gist](https://gist.github.com/ektogamat/b149d9154f86c128c9fea52c974dda1a),
[Babylon NodeMaterial](https://doc.babylonjs.com/features/featuresDeepDive/materials/node_material),
[Babylon FresnelParameters](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/fresnelParameters/),
[a Babylon forum thread on layering a transparent shader over an existing material](https://forum.babylonjs.com/t/fresnel-effect-to-the-model/37429).

## 2. Rigged creature libraries (F7, H1) and licenses

| Library | What | License as read | Formats | Caveat |
| --- | --- | --- | --- | --- |
| **Quaternius · Ultimate Monsters** | about 50 animated low-poly monsters | **CC0** on Poly Pizza and the author's pages | glTF, FBX, OBJ | Sketchfab's listing of the same pack shows a CC-BY label while its description says CC0: read the license on the page you download from, record it in `assets/holo/LICENSES.md` |
| **Quaternius · Animated Monsters, Animals, Fish** | smaller animated packs (idle, walk, run, attack, death) | CC0 | FBX, OBJ, Blend (glTF conversion needed) | convert with Blender to glTF; keep the clip names |
| **KayKit (Kay Lousberg) · Skeletons, Adventurers** | rigged, animated stylized characters | **CC0** | FBX, glTF | humanoid only; good for the humanoid figure |
| **Mixamo (Adobe)** | auto-rigging and a large animation library | community posts say free commercial use with no redistribution of raw files; **no current official text found**; a 2026 question on paid cosmetics unanswered | FBX | **Not in the committed path.** Licensing is unsettled enough that a public repository should not carry its files. Rob's call if ever wanted |

**Decision for F7.** CC0 only in the repository, each asset listed in `assets/holo/LICENSES.md` with source URL,
license, date read and file hash. Prefer packs whose figures share one skeleton (Quaternius's monsters mostly do), so
one set of clips serves many figures without retargeting.

Sources: [Quaternius Ultimate Monsters on Poly Pizza (CC0)](https://poly.pizza/bundle/Ultimate-Monsters-Bundle-5oyGWAmOB6),
[the same pack on Sketchfab (label caveat)](https://sketchfab.com/3d-models/ultimate-monsters-pack-fd72e114d119488da71fe3a16f216c4f),
[Quaternius animated monsters](https://quaternius.itch.io/lowpoly-animated-monsters),
[Quaternius animated animals](https://quaternius.itch.io/lowpoly-animated-animals),
[KayKit Skeletons (CC0)](https://kaylousberg.itch.io/kaykit-skeletons),
[KayKit Adventurers on GitHub](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0),
[Mixamo licensing FAQ thread (Adobe community)](https://community.adobe.com/t5/mixamo-discussions/mixamo-faq-licensing-royalties-ownership-eula-and-tos/m-p/13234775),
[Mixamo for commercial games (Adobe community)](https://community.adobe.com/t5/mixamo-discussions/mixamo-characters-for-commercial-games/td-p/11815020).

## 3. Animation retargeting (F7)

Babylon v9 added `AnimatorAvatar.retargetAnimationGroup`, which remaps bone transforms from a source skeleton to a
target one, accounting for reference pose and bone length; older Babylon retargets only between identical skeletons by
cloning an `AnimationGroup` and remapping targets. Forum experience: different rigs are not simple; same-skeleton
packs avoid the problem.

**Decision.** Check the Babylon version the stage loads before relying on `AnimatorAvatar`. Prefer same-skeleton packs;
retarget only the humanoid clips if a pack lacks a clip.

Sources: [Babylon animation retargeting](https://doc.babylonjs.com/features/featuresDeepDive/animation/animationRetargeting),
[forum: multiple glTF animations on one rig](https://forum.babylonjs.com/t/targeting-multiple-gltf-animations-to-a-single-rig/27171).

## 4. Particles (F6)

`ParticleHelper.CreateAsync(name, scene)` ships presets **smoke, rain, fire, explosion**; `BaseAssetsUrl` points it at
our own folder; `ExportSet` writes a configured set to JSON so a look is **data, not code**. `GPUParticleSystem` runs
on WebGL2 and falls back to `ParticleSystem` by itself.

**Decision for F6.** Start from the smoke and explosion presets, tune, export to `assets/particles/*.json`, load from
there, and cap live particles per fight (section F6). Textures are our own or CC0, listed in `LICENSES.md`.

Sources: [ParticleHelper](https://doc.babylonjs.com/features/featuresDeepDive/particles/particle_system/particleHelper),
[Particle systems](https://doc.babylonjs.com/features/featuresDeepDive/particles/particle_system).

## 5. The morph mechanism (F2): why not the View Transitions API

Same-document View Transitions are now Baseline (Chrome 111, Edge 111, Safari 18, Firefox 144, per Chrome's 2025
update; third-party guides disagree on Firefox's history). They morph **snapshots** between two DOM states. The
combat canvas needs the **same element** to keep moving while the camera moves and while the timeline plays, to be
interruptible by input, and to run inside Babylon's projected surfaces in 3D. Snapshots cannot do that.

**Decision.** The morph is a FLIP on the same elements with the Web Animations API (the board's existing pattern),
with `draw()` deferred while it runs. View Transitions may be used for the **summary card** alone, behind
`document.startViewTransition` feature detection, with the plain fade as the fallback.

Sources: [Chrome: what's new in view transitions (2025)](https://developer.chrome.com/blog/view-transitions-in-2025),
[Chrome: View Transition API](https://developer.chrome.com/docs/web-platform/view-transitions).
