# F7 · H1 holograms: silhouette figures by type and subtype

**Linear:** ROB-370 (Rob's call on look, asset source and cost before building) · **Wave 4** · **Lane:**
`crankmagic-holo.js` (figures), `assets/holo/**`, `data/holo-figures.json`, `assets/holo/LICENSES.md` · **Waits on:** F6,
and Rob's decisions · **Runs beside:** F5, F8.

Rob, 2026-11-01: *"general three-dimensional skeletons that are generic and can apply to almost every creature and object
... a holographic skin, perhaps based on their creature type ... creature, dragon, artifact, equipment ... type and
subtype."*

## Goal

Replace the H0 standee with a rigged silhouette figure where a mapping exists: humanoid, beast, dragon, serpent, spirit,
elemental, construct (artifact and equipment), vehicle, and an orb for the unknown; four clips each (idle, advance,
clash, dissolve); the holographic shader as the skin (tints and patterns, never a likeness). The standee stays the
fallback.

## Hard rules

I2, I10, I13, R17; **licenses**: only CC0 assets in the repository, each recorded in `assets/holo/LICENSES.md` (source
URL, license as read on the download page, date, file hash). Mixamo is not in the committed path (RESEARCH.md §2).
`AGENTS.md`, "Things no agent does": never commit another company's screens or images.

## The specification

- `data/holo-figures.json`:
  ```
  {"figures": {"humanoid": {"file": "assets/holo/humanoid.glb", "clips": {"idle": "Idle", "advance": "Walk", "clash": "Attack", "dissolve": "Death"}, "scale": 1.0}, …},
   "byType": {"Artifact": "construct", "Vehicle": "vehicle", "Equipment": "construct"},
   "bySubtype": {"Dragon": "dragon", "Drake": "dragon", "Snake": "serpent", "Spirit": "spirit", "Elemental": "elemental", "Beast": "beast", "Wolf": "beast", "Human": "humanoid", "Elf": "humanoid", "Soldier": "humanoid", …},
   "fallback": "orb"}
  ```
  Resolution: the first matching subtype in the card's type line, else the type, else the fallback. Locomotion: a
  creature with flying hovers (`advance` plays while the figure rides the arc); the rest use the figure's `advance`.
- Assets: glTF binary (`.glb`), one `AssetContainer` per figure, instantiated per card (`instantiateModelsToScene`),
  the four clips as `AnimationGroup`s renamed to the canonical names at load; same-skeleton packs preferred so one clip
  set serves many figures; retargeting only through Babylon's own API where the stage's Babylon version has it
  (RESEARCH.md §3).
- Skin: the F6 holographic shader applied to the figure's meshes, tint by the card's color identity (one of the five
  mana colors, gold for two or more, gray for colorless), pattern by figure.
- Caps and fallback as F6: 40 figures; a figure that fails to load falls back to the standee silently (a console note
  only).

## Build steps

1. Rob's decisions first (ROB-370): the look (a reference set via `design-reference-and-critique`), the asset source
   (CC0 packs from RESEARCH.md §2, or commissioned, or generated), any budget. Build nothing before.
2. One figure (humanoid) end to end: `LICENSES.md` entry, the `.glb`, the JSON mapping, the four clips on the timeline's
   hooks, the fallback path. A local session proves 60 fps at 40 instances.
3. Then one figure per PR, each with its mapping rows and license entry; `tests/holo-figures.mjs` (Node) checks that
   every figure in the JSON exists, every clip name exists in its file (read the glTF JSON chunk), and every mapping
   target is a defined figure or the fallback.
4. `breaks-holo-figures.py`: a mapping to an undefined figure accepted; a missing clip not falling back; a face-down card
   given a figure by its real type. All caught.

## Proof

`node tests/holo-figures.mjs`; `node tests/board-babylon.mjs` (extended for figures); the breaks runner; the local
session's walk.

## Done when

- [ ] Every committed asset is CC0 and listed; the Trust project (X3) has the list linked.
- [ ] The humanoid runs the four clips on events at 60 fps with 40 instances on Personal-HP.
- [ ] A missing mapping or asset falls back to the standee with no visible error.

## Risks and what to watch

- **A cheap-looking figure hurts more than no figure.** The standee is good; replace it only where the figure is better
  (Rob's look decision per figure).
- **Licenses drift.** The same pack shows different licenses on different sites; record the page you downloaded from.
- **Repository size.** Keep each `.glb` under 1 MB (Draco or meshopt compression where Babylon's loader supports it);
  total under 10 MB; load on demand, never on page load.
- **Face-down creatures** are 2/2 with no type: always the orb or the standee, never the real card's figure (I10).

## Choices you will face

- *A subtype with no figure (Sliver, Phyrexian)?* The fallback; add a mapping row later, never a special case in code.
- *Per-card figures (H2)?* A later issue, only if H1 earns it and only with a rights decision.
- *Generated assets?* Only with Rob's decision on source and license; record the generator and prompt in `LICENSES.md`.
