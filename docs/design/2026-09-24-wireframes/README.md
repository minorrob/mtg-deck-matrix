# CrankMagic — Full wireframe pack (2026-09-24)

Structural gray-box wireframes for the **entire** CrankMagic workshop app, for designer Trey (Robert Minor).

## How to open

1. Open `index.html` in any browser (`file://` works; no server required).
2. Use the sticky **Screen:** switcher to jump between all **59** screens (grouped: Shell / Decks / Library / Explore / Play / Accounts / Dialogs).
3. Product top nav (Decks · Library · Explore · Play) updates highlight with the current screen.
4. Buttons with related jumps use `data-goto` to move between screens.
5. Hash URLs work (`#deck-overview`, `#play-coming-soon`, etc.).

**Important:** The Screen switcher is **designer-only tooling**. It is not end-user UI and must not ship as chrome.

## Live vs planned

| Tag | Meaning |
|---|---|
| **live** / **shipped** | Present on https://crankmagic.com/ tip `8e9ddfd · 2026-09-24` (or solidly represented in UAT) |
| **planned** | Design continues; not claimed ready on live (e.g. Play lobby/table, Measure depth, Lab depth, mobile sticky **fix**) |

- **Play** on live = **Coming Soon** (`crankmagic-play=coming-soon`). This pack includes both the honest Coming Soon shell **and** planned lobby / countdown / table sketches.
- **Accounts** = on (Menu → Account / Cloudflare Access). Guest local workshop still works.
- US English throughout.

## Style

Matches and expands `/workspace/crankmagic-replit-pack/wireframes/index.html`: gray boxes, region labels, black primary (= brass in live skin), italic annot notes, shipped/planned/live tags. Structure/content ideas absorbed from `/workspace/uat-gallery/Wireframes.dc.html` (deck tabs, Ready to add, Make the change, Play variants, dialogs 4a–4h) but output is **standalone HTML** (no React / dc-import).

## Layout locks called out

- Action buttons stay in a **row** (never stacked into empty columns).
- Mobile deck-detail sticky actions: wireframe shows **FIXED** horizontal row; annotates UAT **CW-MOB-02** clip as defect.
- Empty CTA honesty: Restore labeled **Restore backup…**, not “Import a backup” (CW-XC-15).
- Explore keeps interactive graph; card art regions sized large enough to read.

## Files

| File | Role |
|---|---|
| `index.html` | Full navigable pack (single file) |
| `SCREEN-INDEX.md` | Every screen ID, title, category, route, notes + counts |
| `README.md` | This file |

## Grounding

- Live: https://crankmagic.com/
- UAT: `/workspace/uat-2026-09-24-cloud-workshop/`
- Phase 0 pack: `/workspace/crankmagic-replit-pack/wireframes/`
- Gallery handoff IA: `/workspace/uat-gallery/`

Wireframes only — does not edit product source.

## Intentional omissions

- Hi-fi Brass/Slate skin, real Scryfall art, and live data — out of scope (structural gray-box only).
- Play table/board is a **high-level** chrome sketch only (per brief); no full combat/priority UI.
- Lab and Measure are sketched with **planned** depth, not certified E2E flows.
- Not every micro-state of every control (hover/disabled/loading variants) — representative screens + patterns.
- Overlay dialogs are full switcher screens (and modal demos on those screens), not every page-mounted portal.
