# Grok live UAT — 2026-09-22 evening

| | |
|---|---|
| **Mandate** | Zero code. Independent of Claude’s morning log. |
| **Tip** | `claude/uat-r0-r1b` @ **`8b76c69`** on Personal-HP |
| **Pages** | `https://minorrob.github.io/mtg-deck-matrix/` (HTTP 200; box Chrome tunnel failed earlier; HP Chrome CDP succeeded) |
| **Host** | `serve-review.mjs` on `:8768` / gateway `:8769`; static app also on `:8790` |
| **Method** | Headless Chrome CDP on Personal-HP (hydration wait). No product edits. |

## Scoreboard (live DOM / UI)

| Result | Count | Notes |
|---|---:|---|
| Pass | 14 | XC routes Decks/Library/Explore/Play shell on Pages + local8790 + 8768/app; Explore entry; host `/review` setup; New deck control clickable |
| Fail | 2 | Pages/host `#game` Start enabled with empty table; `#game` not a live mirrored host (U-05) |
| Partial | 3 | New deck wizard depth not fully verified; Pages helper note intermittent by state; API session 403 blocked Forge path |
| Blocked | 3 | Remote guest tunnel; full Host+3AI→Forge→R3; Rob’s real library (UAT used empty profile) |
| Not run | — | Measure click-walk, LIB-06 want-list filter with real wants |

## Domain outcomes

### Cross-cutting
- `#decks` `#cards` `#discover` `#game` render non-empty content on Pages, `:8790`, and `:8768/app` after paint wait.
- US English spot-check: no UK forms in sampled chrome.

### Decks / Library / Explore
- Decks landing + **New deck** control: Pass (wizard full path Partial — click registered; modal not fully asserted).
- Library tabs + filters + List/Sheet/Table chrome: Pass (0 copies in UAT profile).
- Explore entry “31,830 cards” + chooser doors: Pass.

### Play
- **Pages `#game`:** seat mock; **Remote guests off**; **Start enabled** while “No one is seated yet”; Start click → no visible change. After seating AIs, helper copy appeared: “A game runs on the helper… Open http://127.0.0.1:8768/”. Did **not** see “Every seat is ready. Starting…” in the empty/AI-no-deck states exercised.
- **`8768/app/#game`:** same mock pattern as Pages (U-05).
- **`8768/review`:** real **GAME SETUP · COMMANDER**; Prepare decks clickable; Launch game present.
- **API:** `/api/setup` → **403 Invalid local session** from CDP fetch (expected without host session cookie dance); did not launch Forge this pass.
- **Tip source (read-only):** R0 still present (`engine-failed` re-readies AI). Live stranded-table retest **not** executed.

### Claude U-* live disposition (tonight)

| ID | Live tonight |
|---|---|
| U-05 mirror | **Still Fail** — `#game` ≠ live host table |
| U-02/U-04 honesty | **Improved vs morning claim on empty/AI states** — no “Starting…” / “board is not built” in exercised DOM; Start still wrongly enabled empty |
| U-12 stranded table | **Not live-retested** (Forge path blocked); tip source still has R0 |
| Remote guests | **Off** on table rules |

## Evidence
Personal-HP: `C:\Users\robmi\CrankMagic\workbench\uat-2026-09-22-grok\evidence\`
Box mirror: `/workspace/uat-2026-09-22-grok/`
