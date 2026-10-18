# Play screens review, October 17, 2026

By the Claude cloud session temporarily holding Codex's lane (Linear ROB-11, ROB-14). Rob, October 17: *"review the Play screens
and let's reorganize around the improvements/enhancements that need to be done leveraging Linear to capture the features."*
This is that review and the reorganization it led to. Rob's latest decisions (`REQUIREMENTS.md`, *Current user decisions*;
`docs/HANDOFF-OPUS-2026-10-17.md`, *Latest requirements to preserve*) are the yardstick; older prototypes are not.

## Method

The board was rendered from the recorded preview (`tools/play-tabletop-preview.mjs`, frame 14 of 42, a nine-card hand), with
`crankmagic-audio-muted` and reduced motion, in Chromium 1194 through Playwright 1.56, twice:

| Source | Commit | What it is |
| --- | --- | --- |
| **main** | `1990ad1d` | what staging serves today (release `eed2f1a4`) |
| **the broad UI draft** | `bdd3d45e`, `codex/ui-playtest-plan-oct15`, PR #735 | Codex's unfinished shell, camera and commander work; conflicts with `main` |

Screenshots are `screenshots/review-1017-{main,draft}-*.png`, with the R35 object IDs overlaid where the object exists
(`T05` front mat, `T06` command, `T07` library, `T08` lands, `T10` Camera, `T11` hand, `T12/T13` drawer handles, `T17`–`T19` the
Camera's selects and the Cards slider, `T20` profile, `T21` life list, `M01`–`M04` modules, `H` the header). An ID that is missing
from a shot means the object is not in that view's DOM. Nothing here was measured on a phone; the 390×844 and 844×390 shots are
emulation.

## What `main` serves (staging today)

| View | Shot | What is there |
| --- | --- | --- |
| Desktop **Full** 1400×900 | `review-1017-main-01-desktop-full.png`, `-02-…-camera.png` | The 3D stage: Volcano video, three rear mini-mats (T02–T04, about 390×95 px each), the front mat with battlefield, lands, command and library, the life list (T21), the hand fan of seven with carousel arrows (T11), the Camera menu (T10) with Tilt, Zoom, Cards and the Background/Table selects (T17/T18/T19), the profile avatar (T20), drawer handles at both edges (T12/T13). Header: name, the seven-step ribbon, "You can also", Next step, Skip to end. |
| Desktop **Table** | `-03-desktop-table.png` | A different shell: the old header (Turn 25 · You, step ribbon, Next step, Skip, You can also, view icons, History, Tools, Panel). Four seat boards in a 2×2 with a life dial in the middle, a *Board cards* slider, the hand as a strip with a Hand cards slider. No Camera. |
| Desktop **Focus** | `-04-desktop-focus.png` | A third shell: a left seat list (Boards), the big mat with Creatures / Artifacts & Enchantments / Lands sections, History inside the mat, the hand strip. No Camera. |
| Phone **portrait** 390×844 | `-06-mobile-portrait.png` | The board is drawn **rotated 90°** (the old fixed rotation): the step pill, the "You can also" panel and the seat bar all read sideways. |
| Phone **landscape** 844×390 | `-07-mobile-landscape.png` | Upright: icon rail at the left, the mat, seats at the right, "You can also" at the bottom. |

So on `main` the three desktop views are three products, the view switch lives in the Table and Focus headers but not in Full,
and the phone in portrait is unusable without turning the phone.

## What the broad draft holds (PR #735, not on `main`)

| View | Shot | What changed |
| --- | --- | --- |
| Desktop Full | `review-1017-draft-01-desktop-full.png` | As `main`, plus the commander cast badge on the rear mats (`+{0}`). |
| Desktop Table | `-03-desktop-table.png` | **The Full header** (ribbon, You can also, Next step, Skip, profile) and **the Camera menu** now in Table; drawer handles at both edges; seat boards with Focus buttons; the Board cards slider still beside the life dial. |
| Desktop Focus | `-04-desktop-focus.png` | The same shared header and Camera; the big mat; History docked right; the hand strip with its slider. |
| Phone portrait | `-06-mobile-portrait.png` | **Upright fixed Focused view**: icon rail and Camera at the top, the seat bar (You · Deciding, Friend, AI 2, AI 3) under it, the step and Next step, the mat, "You can also" at the bottom. |
| Phone landscape | `-07-mobile-landscape.png` | Upright, the same structure. |

That is Rob's October 15 decision set (one header, Camera in every view with Tilt only in Full, one fixed Focused phone view)
implemented, on a branch that also carries unfinished commander/engine edits, stale board-suite assertions, and conflicts with
`main` in the board, the stage stylesheet, `docs/ACTIVE.md` and the asset hashes (`docs/HANDOFF-OPUS-2026-10-17.md`, *Local
checkout caution*). It is not mergeable as it is, and Rob said not to merge it wholesale.

## Findings

Each finding names the shot, the object IDs, the decision it fails, and the Linear issue that owns it. *New* means the issue was
created by this review.

| # | Finding | Evidence | Decision | Linear |
| --- | --- | --- | --- | --- |
| F01 | Three different shells on desktop: the Full header differs from the Table/Focus header; Camera exists only in Full; the view switch exists only outside Full | main-01 vs -03 vs -04 | "desktop shares header, profile, drawers and modules across Full/Table/Focus; switching belongs in Camera in all views, Tilt only in Full" | ROB-19 (the draft implements it; port as slice 1) |
| F02 | Phone portrait is rotated 90° | main-06 | "Mobile: one fixed Focused view, no view switch; usable portrait and landscape" | ROB-18 (the draft implements it; port as slice 2) |
| F03 | Rear seats in Full are 390×95 px mini-mats; their cards are about 30 px wide and unreadable at 1400×900; the commander name is 10 px | main-01 T02–T04 | "readable cards, correct shared card/mat perspective" | ROB-20 (sliders), ROB-52 (the renderer) |
| F04 | The hand fan covers the lower third of the lands row (T08) at Zoom 100 / Cards 100; a land has to be reached under a card | main-01 T08/T11 | the hand "overlaps board front" is wanted, but lands are what a player taps most (ROB-25) | **New** ROB-98 |
| F05 | The *Board cards* slider sits on the center life dial in Table view, in both sources | main-03, draft-03 | sliders must "fit properly within the design" | **New** ROB-97 |
| F06 | Full on `main` has no way to leave Full except the Screen View module in a drawer; the draft puts the switch in Camera | main-02 T10 | as F01 | ROB-19 |
| F07 | No central decision prompt; "You can also" is the only priority surface; the stack is a drawer module | main-01, main-07 | "clear stack/decision interactions and authoritative game actions" | ROB-23, blocked by engine ROB-13 |
| F08 | Battlefield sections carry headers (CREATURES · 3, ARTIFACTS & ENCHANTMENTS · 2) in Table and Focus | main-03, -04 | "Battlefield: creatures, then artifacts/enchantments, then lands; remove section headers" | ROB-22 |
| F09 | Zoom and Cards sliders exist only in Full; Table and Focus have their own Board cards / Hand cards sliders with different ranges | main-02 vs -03 | "Camera sliders reach both ends... keep camera stable" | ROB-20 |
| F10 | Prototype taps in the Babylon lab do not pay mana or send actions; the live board has no direct pickup/move/tap at all | `screenshots/babylon-desktop.png` vs main-01 | "Direct 3D pickup, inspect, move and tap interactions"; "engine state authoritative" | ROB-52, with ROB-74 (payment drafts) and ROB-77 (events) from the engine lane |
| F11 | Life totals in Full read from a 77×98 px caption at the top left; the opponents' life is not on their mats | main-01 T21 | "Opponent name/commander share a bar; life uses a small top-left 80%-transparent black backdrop" | ROB-49 |
| F12 | The two red suites on `main` (`a11y-board`, `engine-breaks-anchors`) mean the board has no green accessibility or anchor gate; every slice above lands on a red baseline | CI 39044154055 | AGENTS: a one-time exception, not a waiver | ROB-15, ROB-16 (Grok G2, G1 under ROB-96) |

Not findings, but noted: the preview's own control bar (Previous state / Next state) sits over the bottom right; it is the
preview, not the product. The draft's Full view is `main`'s Full view plus the commander badge, which waits on ROB-12.

## The reorganization

The 55 children of ROB-14 were one flat list with In Progress / Backlog and High / Medium. They are now in six **project
milestones**, in the order the work can actually land, with the engine dependencies made explicit. An issue's milestone says
when it is in play; its priority says its order inside the milestone.

| Milestone | What lands | Issues |
| --- | --- | --- |
| **M1 · Shell on main** (slices of #735, each a PR against `main`) | one header and Camera everywhere (slice 1), the upright fixed Focused phone view (slice 2), the sliders and section headers (slice 3), the two red suites green | ROB-99 (the slicing plan, new), ROB-19, ROB-18, ROB-20, ROB-22, ROB-97, ROB-98, ROB-15, ROB-16 |
| **M2 · From invitation to a seat** | the invitation works (ROB-72); now the shared decks, permissions, profiles, the lobby and Play's entry | ROB-30, ROB-36, ROB-37, ROB-38, ROB-39, ROB-32, ROB-33, ROB-34, ROB-35, ROB-40, ROB-41, ROB-42 |
| **M3 · Decisions and game flow** (each blocked by its engine contract) | priority prompt and stack, Draw card, payment and Confirm cast, combat, Yield turn, commander badge, round/turn and events | ROB-23 ← ROB-13; ROB-24 ← ROB-73; ROB-25 ← ROB-74; ROB-26 ← ROB-75; ROB-28 ← ROB-13; ROB-29 ← ROB-12; ROB-49 ← ROB-78; ROB-50 ← ROB-77; ROB-53 ← ROB-76; ROB-17 |
| **M4 · Direct 3D interaction** | the Babylon lab wired to the live room, card angle, table and environment art | ROB-52, ROB-21, ROB-60, ROB-59, ROB-51, ROB-57, ROB-43 |
| **M5 · Around the table** | logs, chat, voice, Coach drawer, Counter-Intel, Report game issue, audio | ROB-31, ROB-54, ROB-55, ROB-56, ROB-48, ROB-63, ROB-45, ROB-46, ROB-47, ROB-44 |
| **M6 · Proof, tools and operations** | validation, benchmarks, references, analytics, flags, mail operations, Supabase evaluation | ROB-27, ROB-67, ROB-58, ROB-61, ROB-62, ROB-64, ROB-65, ROB-66, ROB-68, ROB-69 |

**Order:** M1 first, because every later screen change lands on it and because the phone is unusable in portrait today. M2 in
parallel from this lane (it is accounts and lobby code, not the board). M3 as each engine contract merges (the engine lane's
order in ROB-71 is ROB-12, ROB-81, ROB-13, ROB-73, then ROB-74–ROB-78). M4 after M1's slice 1, because the renderer needs the
shared header and Camera to live in. M5 and M6 behind those, except ROB-27 (validation) and ROB-61 (references), which run
alongside everything and are in the Grok package (ROB-96).

**Superseded, explicitly:** the 3D switch and the seven-step strip of the October 12 pass; the fixed portrait rotation; S/M/L
size steps anywhere; the HTML UAT document; the seven-deck snapshot (six current decks). Issues that still cite them say so in
their first line.

## What is next in this lane

1. M1 slice 1: the shared header and the Camera menu with the view switch, ported from the draft onto `main` as one PR, with
   `tests/table-tabletop.mjs` and `tests/table-board.mjs` green and ID screenshots H.1/T10 in all three views.
2. M1 slice 2: the upright fixed Focused phone view, ported the same way, with portrait and landscape shots at 390×844 and 844×390.
3. In parallel, M2: ROB-30 (the six shared decks chosen by an invitee), finishing ROB-10's acceptance.

Each slice goes to staging on its own after Rob's look at the screenshots; nothing from the draft is merged wholesale.
