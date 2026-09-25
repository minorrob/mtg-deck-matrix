# CrankMagic UAT test matrix — 2026-09-21

**Mandate:** Zero code. Test + document + recommend for Claude.
**App under test:** `C:\Users\robmi\CrankMagic\repo` (local). GitHub tip through **#311**; **#312 not found** on remote (retarget if Claude names a branch).
**Design north star:** `Deck page redesign project/design_handoff_crankmagic_gallery` (Brass & Slate / Felt & Cream tokens; Gallery Decks, Deck page, Library, Explore, Explore Entry; wireframes turn 1–4; DELTA-play).
**Play:** Claude-active (Lobby→Game) — mark **IN FLUX**; Forge required for live table.
**Result vocab:** Pass | Pass after fix | Partial | Fail | Not run
**Severity:** S1 blocks core/corrupts | S2 wrong data / can't complete intended way | S3 friction | S4 cosmetic/copy
**Columns (xlsx Test Cases):** ID | Core function | Use case | Steps | Expected behavior | Experienced behavior | Result | Severity | Evidence | Recommended remediation | Code location | Status

## Core functions
Build | Acquire | Manage | Play | Design (reconciliation)

## Domain cases (define then execute)

### Decks / Build (D-*)
- D-01 Rail + Decks landing vs Gallery Decks (tint tiles, New deck primary, Compare)
- D-02 New deck Create / Import / Lab doors
- D-03 Deck page Overview vs Gallery Deck Page (hero, tabs, bento, primary-from-state)
- D-04 The hundred / Upgrades / Explore / Acquire tabs
- D-05 Ready to add + Make the change subnav
- D-06 Measure from deck page + report labeling
- D-07 Upgrade promote + substitutes
- D-08 Compare decks
- D-09 Lab build→measure→save journey

### Library / Acquire / Manage (L-*)
- L-01 Library head + status KPI tiles vs Gallery Library
- L-02 List/Sheet/Table views + filters (sample)
- L-03 To buy + Orders flows
- L-04 Status change / Bought / Wanted
- L-05 Replacement / substitute journey
- L-06 Cross-surface count vocabulary
- L-07 Tabletop drag sample
- L-08 Export / History / Undo sample

### Explore (E-*)
- E-01 Explore entry vs Gallery Explore Entry
- E-02 Graph scoped to deck (sample filters/chains/cards — random sample)
- E-03 List tab ownership/in-deck chips
- E-04 Add/Buy / Swap into deck from graph
- E-05 Wanted add keeps focus

### Play (P-*) — IN FLUX
- P-01 Lobby open via Desktop Start Game / #game
- P-02 Seat mixes (Host+3AI; Host+1H+2AI; Unused)
- P-03 Deck load Library / Paste / Build from Commander
- P-04 Guest invite live link
- P-05 Ready→Start→Forge sync
- P-06 Tabletop through R3 (4 agents) — if Forge available; else Not run + blocker

### Admin / shell (A-*)
- A-01 User Functions / Menu / Share / Feedback
- A-02 Theme tokens applied (accent brass, rail 216px, Young Serif display)
- A-03 Encoding / SW cache after reload
- A-04 Tour sample

## Journeys (end-to-end)
- J-01 Build new deck: Decks→Lab/Create→Library acquire→Explore swap→Measure
- J-02 Manage existing: Overview→Upgrades→Ready to add→Buy list
- J-03 Play setup: Lobby decks→table combo→Start (stop before deep play if Claude mid-merge)
