# CrankMagic Phase 0 — Summary (2026-09-16)

**Status:** Complete on GitHub `main` (squash-merged [PR #246](https://github.com/minorrob/mtg-deck-matrix/pull/246) @ `cc594c1`).  
**Tonight isolation:** Your local `commander-phase-c` / Desktop Online shortcut is **unchanged**. Do not pull `main` into that checkout for tonight’s friends game.

## What Phase 0 delivered

### Locked product decisions
- Canonical loop: **Build → Measure → Refine → Acquire → Assemble → Play**
- Top nav target: **Decks · Library · Explore · Play** (Lab demoted out of top nav)
- Deck hub target tabs: **Overview · The hundred · Upgrades · Explore · Acquire**
- Play amendment: **lobby owns `#game`**; Online = host health + invites + post-Start table
- Countdown target on `main`: **5 seconds**; guest **Ready** gates Start
- Wanted = Design C (To Buy group); Watched kept ~1 month
- Brand: keep logo mark + helix animation; compact header; readable card images; interactive Explore graph
- OpenAI Astra package cited as Phase 1+ authority (collection-workflow, journeys, facelift mockup); Phase 0 IA wins naming conflicts

### Shipped in #246
- `docs/phase-0-alignment.md` (alignment + Astra reconciliation)
- `crankmagic-online.js` compose pattern (lobby no longer overwritten)
- Online bridge moved to `#online`
- Host-offline banner into lobby
- Game countdown docs/contracts/tests: 10s → 5s on this branch set
- README Play nav note; asset version bump
- Agent-reported: 62 test suites pass

### Explicitly deferred from Phase 0 (now Phase 1+)
- UI renames Cards→Library, Discover→Explore
- New deck wizard unification
- Deck hub tab restructure
- Full glossary enforcement
- Design C Wanted code (draft #250)
- Explore scoped entry (draft #247+)
- Measure fidelity copy (draft #248)
- Accounts/sync, hosted Play VM, facelift implementation

## Parallel draft PRs (not Phase 0 merge scope)
| PR | Lane | Topic |
|---|---|---|
| [#247](https://github.com/minorrob/mtg-deck-matrix/pull/247) | Explore | Scope chooser + deep links |
| [#248](https://github.com/minorrob/mtg-deck-matrix/pull/248) | Measure | Lab fidelity banner + protocol chip |
| [#250](https://github.com/minorrob/mtg-deck-matrix/pull/250) | Collection | Design C Wanted |

These move under Phase 1 execution (rebase onto post-#246 `main` as needed).

## Review ask
Confirm Phase 0 summary looks right. Phase 1 is pre-approved to proceed on GitHub only.
