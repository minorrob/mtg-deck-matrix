# CrankMagic Phase 1 — Summary (2026-09-16)

**Status:** Complete on GitHub `main` (workshop + Explore + Measure + Wanted slices).  
**Tonight isolation:** Local `commander-phase-c` Online path was never modified.

## What shipped (squash-merged)

| PR | Lane | Result |
|---|---|---|
| [#248](https://github.com/minorrob/mtg-deck-matrix/pull/248) | Measure | Lab fidelity banner + human protocol chip; refine 3×4k copy |
| [#247](https://github.com/minorrob/mtg-deck-matrix/pull/247) | Explore | Scoped entry chooser + deep links |
| [#251](https://github.com/minorrob/mtg-deck-matrix/pull/251) | Workshop IA | Chrome labels: Library / Explore / Measure |
| [#250](https://github.com/minorrob/mtg-deck-matrix/pull/250) | Collection | Design C Wanted |
| [#249](https://github.com/minorrob/mtg-deck-matrix/pull/249) | Explore | Progressive disclosure (Advanced Tools) |
| [#253](https://github.com/minorrob/mtg-deck-matrix/pull/253) | Workshop IA | Drop Build from top nav |
| [#254](https://github.com/minorrob/mtg-deck-matrix/pull/254) | Workshop IA | Unified New deck wizard |
| [#252](https://github.com/minorrob/mtg-deck-matrix/pull/252) | Explore | Scoped graph paint + IndexedDB (cold full download still noted) |
| [#255](https://github.com/minorrob/mtg-deck-matrix/pull/255) | Workshop IA | Deck hub tabs |
| [#256](https://github.com/minorrob/mtg-deck-matrix/pull/256) | Workshop IA | Sample-deck empty states |

## Product shape on main now
- Top nav: **Decks · Library · Explore · Play**
- New deck: create / import / lab in one wizard
- Deck hub: **Overview · The hundred · Upgrades · Explore · Acquire**
- Discover: chooser → loops-first; advanced tools collapsed; scoped load path
- Measure: honest fidelity language in Lab
- Wanted: Design C on To Buy group
- Brand locks preserved (logo + animation; readable cards; interactive graph)

## Follow-ups (not Phase 1 blockers)
- Explore: true cold-network shard / defer full graph download
- Collection: live-load To Buy emission
- Measure: any remaining deck-hub report parity polish
- Facelift visual implementation (Replit experiments / Astra mockup)
- Advisory designers: Workshop Design, Play Design (critique only)

## Phase 2 (next — planning only until you decide)
Accounts/sync per `docs/crankmagic-persistent-plan.md`: invite-only allowlist, guest mode kept, pause on domain / Vercel+Supabase signup / OpenAI caps / VM until you answer.
