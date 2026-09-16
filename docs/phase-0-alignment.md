# Phase 0 UX Alignment (LOCKED)

**Status:** Locked as of September 16, 2026  
**Purpose:** Canonical record of Phase 0 decisions for future agents and implementation  
**OpenAI Package Reconciliation:** September 16, 2026 — incorporated as supporting authority and Phase 1+ guidance

---

## OpenAI Astra Review Package (Supporting Authority)

On September 7, 2026, Robert Minor commissioned an OpenAI Astra review package assessing the application and proposing a complete redesign. This package is **incorporated as supporting authority and Phase 1+ guidance**, with Phase 0 locked decisions taking precedence on conflicts.

### Primary Documents (design/crankmagic/)

- **`improvement-plan.md`** — Complete implementation proposal with visual redesign, collection integrity, ownership invariants, and delivery sequence
- **`collection-workflow.md`** — Detailed domain contract for Source, Purpose, Allocation, Physical placement; the authoritative specification for copy accounting and acquisition paths
- **`end-to-end-plan.md`** — Journey acceptance gates and complete feature verification matrix
- **`simulation-fidelity-plan.md`** — Simulator correctness boundaries, human validation gates, coverage assessment (deferred to later phase per Phase 0)
- **`mtg-facelift-mockup.html`** — Visual design study (Satoshi, dark-only, wand mark, sticky rail) serving as design reference for Phase 1 facelift

### Reconciliation with Phase 0 Locked Decisions

**Where Phase 0 and OpenAI package conflict, Phase 0 wins:**

| Aspect | OpenAI Package | Phase 0 (LOCKED) |
|--------|----------------|------------------|
| **Top Nav** | My Decks · Collection · Play Lab · Discover · Shop | **Decks · Library · Explore · Play** (Lab not top-nav peer) |
| **Play Structure** | Not specified | **Lobby-first on #game** (Online = host gate + post-Start) |
| **Wanted Design** | Not specified | **Design C** (To Buy group labeled "Wanted"; watched = 1 month) |
| **Terminology** | Various | Phase 0 copy glossary (see below) |

**Where OpenAI package extends or aligns with Phase 0, adopt as Phase 1+ guidance:**

1. **Ownership invariants** — Never infer Owned from decklist/auto-build; planned ≠ owned; explicit acquisition path required
2. **Dimensional separation** — Source (Owned/Ordered/To buy) vs Purpose vs Allocation/Reserved vs Physical In deck are independent facts tracked separately
3. **Journey matrix** — End-to-end acceptance criteria become Phase 1 implementation gates when surfaces exist
4. **Visual direction** — Satoshi typography, dark-only, wand mark, sticky rail, graphite surfaces, blue accents remain Phase 1 facelift reference
5. **Collection workflow detail** — OpenAI `collection-workflow.md` is the authoritative domain contract for copy accounting, released-copy reuse, protected donor transfers, and acquisition state machines

### Naming Drift Resolved

OpenAI package uses: My Decks / Collection / Play Lab / Discover / Shop  
Phase 0 renames to: **Decks / Library / Explore / Play** (Lab folded into New deck wizard)

Phase 0 terminology is **locked**. OpenAI package principles apply with Phase 0 names.

### Deferred: Simulation Fidelity Human Calibration

OpenAI `simulation-fidelity-plan.md` proposes staged human dataset collection, prospective validation, and calibrated uncertainty. This work remains **explicitly deferred** to a later phase. Application tests passing does not constitute human calibration; the simulator's current approximate model (profile-based opponents, not four actual decks) is acknowledged.

Phase 0 documents the UX decisions. Simulation correctness improvements follow the gates in `simulation-fidelity-plan.md` when resourced.

---

## Canonical Loop

The product is built around a six-stage loop that reflects how Commander decks come together:

**Build → Measure → Refine → Acquire → Assemble → Play**

Every feature should serve one or more stages of this loop. The nav, labels and flows respect this order.

---

## Information Architecture & Top Navigation

The top navigation presents four peer entries:

1. **Decks** (`#decks`) — Home and deck hub; "New deck" wizard lives here
2. **Library** (`#cards`) — Renamed from "Cards" in UI; where you manage your collection
3. **Explore** (`#discover`) — Renamed from "Discover" in UI; the graph and card relationships
4. **Play** (`#game`) — Lobby-first experience (see Play Amendment below)

**Removed from top nav:** Build / Lab is no longer a peer. The Lab becomes:
- A path inside the "New deck" wizard
- A deck action available from within a deck

---

## Deck Hub Tabs (when a deck is open)

When viewing a deck, five tabs organize the information:

1. **Overview** — Hero, progress, cost card, next actions, "the hundred at a glance"
2. **The hundred** — Full card list by type with copy status
3. **Upgrades** — Working list and Upgrade Path
4. **Explore** — Card relationships and discovery for this deck
5. **Acquire** — Buy list, orders, acquisition tracking

**History** is folded under Overview (not a separate tab).  
**Guide** content is folded into Overview.

---

## Subflows (Not Top Nav)

These are entered contextually, not from the main navigation:

- **`#how`** — "How a deck comes together" guide (linked from various contexts)
- **`#pull`** (Assemble) — "Ready to add" flow, entered from deck Acquire/Assemble actions
- **`#change`** — "Make the change" flow for physical deck updates

---

## Feature Decisions: KEEP / MERGE / DEMOTE / KILL

### MERGE
- **Create + Build + Import → New deck wizard**  
  All deck creation paths unified into one wizard that offers:
  - Build from scratch in Lab
  - Import from Archidekt/paste
  - Start from a commander

### DEMOTE (still accessible, not top-level)
- **Sheet view** — Available but not default; accessed via view switcher
- **Tabletop view** — Entry point for Assemble flow
- **Discover advanced filters** — Collapsible/secondary in the filters UI
- **Lab pipeline chrome** — Simplified until commander is chosen

### Wanted Design = Design C
- **"To Buy" group** — Labeled "Wanted" 
- **"To buy" tab** — Shows shortfalls + wanted cards
- **"Watched"** — Keep for one month, then review
- Label is "Wanted" in the interface

---

## Copy Glossary (Canonical Terms)

Use these exact terms consistently throughout the app:

- **The hundred** — The 100 cards that make up a Commander deck (not "the 99" or "decklist")
- **In the hundred** — A card that's part of the current decklist
- **On the bench** — An owned copy not reserved to any deck
- **Standing in** — A substitute card temporarily filling a slot
- **Saved for later** — Planned cards not yet in the hundred
- **Wanted** — Cards identified for acquisition
- **Ordered** — Cards purchased but not yet received
- **Owned** — Cards in your collection
- **Measure** — Run simulation/testing on a deck
- **Explore** — Discover card relationships and connections
- **Library** — Your collection management (replaces "Cards" in UI)
- **Assemble** — The physical process of putting cards into a deck
- **New deck** — Creating a new deck (replaces "Create")
- **Play** — The game lobby and table

---

## Play Amendment (LOCKED)

**Critical decision:** The lobby IS the Play product. Do not park the lobby behind or separate from Play.

### Lobby-First Architecture

When the user navigates to **Play** (`#game`), they see the **lobby UI** as the primary experience:

1. **Host flow:**
   - Start local helper (PowerShell script)
   - Define game parameters (bracket, rules, seats)
   - Select host deck
   - Configure 1–3 seats as human or AI
   - For human seats: enter email and send invite link
   - Wait in lobby for guests to join and ready up
   - Press "Start Game"
   - **5 second countdown** (not 10)
   - All players enter game from lobby

2. **Guest flow:**
   - Open invite link in browser
   - Accept invitation
   - Pick deck from library or upload
   - Click "Ready"
   - Wait in lobby
   - See countdown when host starts
   - Enter game after countdown

### Technical Implementation

**Problem identified:** `crankmagic-online.js` loads after `crankmagic-game.js` and overwrites `C.views.game`, making the lobby unreachable. The online module replaces the lobby with only a sparse bridge UI.

**Target architecture:**
- **`crankmagic-game.js`** (lobby) owns `#game` and the seating UX
- **`crankmagic-online.js`** provides:
  - Host health/status gate
  - Invite transport mechanisms
  - Post-Start game table/iframe loading
  - NOT a replacement Play page

**Integration approach:**
- Online module should integrate host status check into lobby
  - Show gate or banner when host is offline: "How to start helper"
  - Do not destroy or replace seating UI
- Compose views rather than last-writer-wins override
- Preserve existing Forge adapter boundaries (GPL-3.0)

### Ready Behavior

**Guest Ready mechanics:**
- Guest "Ready" button must exist and be functional
- Host cannot start until all human seats that have joined are marked Ready
- AI seats auto-ready (use existing patterns if any)
- Ready state must be visible to all participants
- Unreadying or leaving cancels countdown

### Countdown

**Locked value:** **5 seconds** (changed from 10 seconds)

The countdown timer appears when host presses "Start Game" (all requirements met). During countdown:
- Show clear timer to all participants
- Allow cancellation if anyone unreadies or leaves
- Automatically proceed to game when countdown completes

### Integration Integrity

The following must be preserved:
- Email invite → guest browser → lobby → Start → enter table flow
- Forge/online host APIs remain functional
- No regression in online multiplayer capabilities
- Existing asset versioning (`?v=`) and service worker patterns
- GPL Forge adapter boundary (in `game/engine-adapter/`)

### Deferred (Future Work)

- Hosted multi-tenant Play service
- Supabase integration
- Additional online infrastructure

---

## Phase 1 Build Order (Reference)

For context, the Phase 1 work following Phase 0 includes:

1. **Nav label renames** (if not included in Phase 0)
   - Cards → Library in UI
   - Discover → Explore in UI
   - May be deferred if it creates a massive diff

2. **New deck wizard** unification
   - Merge Create/Build/Import paths
   - Integrate Lab as a wizard option

3. **Deck hub tab reorganization**
   - Implement Overview tab with folded History
   - Restructure tabs per spec above

4. **Subflow polish**
   - Refine #how guide
   - Polish #pull and #change flows

5. **Glossary enforcement**
   - Audit and update all copy to match canonical terms
   - Update help text and documentation

---

## Phase 1+ Guidance from OpenAI Package

The following principles from the OpenAI Astra review extend Phase 0 decisions and guide future implementation:

### Ownership Invariants (Never Violate)

From `improvement-plan.md` §1 and `collection-workflow.md`:

1. **Never infer Owned from a decklist** — Auto-build, import, or generation creates a **planned deck**, not owned cards
2. **Explicit acquisition path required** — Only "these are physical cards I own" workflow creates holdings, after preview
3. **Planned ≠ Owned** — A deck list proves intent; receipt/purchase proves possession
4. **Orders stay orders until received** — Ordered copy cannot be treated as available bench inventory
5. **Physical location persists** — Last confirmed location remains until explicitly moved
6. **One copy cannot occupy two physical decks** — Reservations may create shortfalls; they don't duplicate copies

### Dimensional Model (Separate Independent Facts)

From `collection-workflow.md` §1 — the authoritative domain contract:

| Dimension | Values | Independence |
|-----------|--------|--------------|
| **Source** | Owned, Ordered, To buy, (Incoming trade) | Acquisition state |
| **Purpose** | Main deck, Upgrade (linked to slot), Bracket bump (with base/target) | Why committed |
| **Allocation** | Reserved to deck + purpose, or Bench | Where committed |
| **Physical placement** | In deck (named), Storage box, Bench, (none for non-owned) | Actual location |
| **List state** | Draft, Finalized, Archived (with version history) | Deck lifecycle |
| **Collection membership** | User groups, Sell/Trade designation | Organization |
| **Reuse policy** | Visibility (all owned visible) vs Eligibility (optimizer pool) | Protection |

**Key principle:** A card can be **Owned + Reserved while on bench**, or **Owned + In deck**. Source and Physical placement are NOT mutually exclusive. The Actions menu may combine acquisition and placement actions (grouped/labeled), but the data model must never collapse these dimensions into one status field.

### Released-Copy Reuse (Automatic Fulfillment)

From `collection-workflow.md` §2:

When accepting a replacement that releases an owned copy:
1. Find still-unfulfilled committed To buy requirements in other decks (not draft suggestions)
2. Match card identity + destination printing requirements (Unknown metadata cannot satisfy specific constraints)
3. For one compatible need: auto-reserve, change fulfillment Owned, remove from purchase queue
4. For multiple compatible needs: visible priority (user deck priority → main deck before upgrades → oldest commitment)
5. With no compatible need: assign to Bench (physical location persists as "move pending from [deck]")
6. Present one receipt; one Undo reverses entire transaction

**Exception handling:** Sell/Trade-designated copies cannot be auto-consumed. Locked donor requires explicit per-copy override after hard warning (doesn't unlock entire deck).

### Journey Acceptance Matrix

From `end-to-end-plan.md` — use these as Phase 1 implementation gates:

**Critical journeys requiring new surfaces:**
- First use with empty storage → Zero owned until explicit record
- Select Commander → Auto-build 99 → Zero owned; explicit finalize creates reservations + To buy requirements
- Import owned cards → Preview, validate, commit workflow (idempotent repeated import)
- Finalize plan → Link owned/ordered; create only unmet To buy requirements
- Incremental acquisition → Ordered/Received/In deck as separate state transitions
- Replacement → release → Automatic fulfillment or Bench (as specified above)
- Protected donor choice → All owned visible; hard warning on locked; per-copy override

**Verification invariants (must hold):**
- Physical copies conserved across reservations/transfers
- Received and disposed quantities account for ownership changes
- Plans never assert receipt
- One copy cannot occupy two physical decks simultaneously
- Reserved order ≠ available stock
- Archived destinations cannot receive allocations
- All page projections agree at same revision

### Visual Design Direction (Phase 1 Facelift Reference)

From `improvement-plan.md` §2 and `mtg-facelift-mockup.html`:

- **Typography:** Satoshi (interface), Oxanium 700 (wordmark)
- **Color:** Dark-only (no light mode, theme selector, or system inheritance)
- **Palette:** Graphite surfaces, clear blue accents, small amber highlights
- **Brand mark:** Transparent wand variant (blue C-shaped gear, five mana glyphs, wand crossing cards)
- **Aether animation:** Fuzzy diffuse helix around subline; translucent front/rear layers; pause control; reduced-motion still
- **Status indicators:** Six stable labels, blue flame (active), green Forest orbs (complete), neutral (pending)
- **Sticky rail:** Navigation remains reachable while scrolling (on desktop and phone)

**Do not re-litigate brand in future PRs** — these decisions are locked by OpenAI package acceptance.

### Simulation Boundaries (Acknowledged, Deferred)

From `simulation-fidelity-plan.md`:

Current model limitations:
- Profile-based opponents (not four actual lists)
- No full legal-action/priority stack
- Zero human game data in committed history
- Partial held-answer correction
- Resource/information-access gaps

**Gates for human calibration (deferred):**
- Staged human dataset collection
- Prospective validation (not retroactive fitting)
- Calibrated uncertainty quantification
- Cohort failure analysis
- No universal realism percentage claim

Passing application tests ≠ proven human calibration. The current approximate model remains useful for relative deck comparison within its coverage boundary.

---

## Implementation Constraints

When implementing Phase 0 decisions:

1. **Respect existing patterns:**
   - Asset versioning (`?v=` parameters)
   - Service worker behavior
   - GPL Forge adapter boundary

2. **Scope discipline:**
   - No unrelated refactors
   - Focus on Play lobby fix + alignment doc
   - Full Phase 1 nav rename can be follow-up if risky

3. **Testing requirements:**
   - Ensure lobby is reachable at `#game`
   - Verify host status integration doesn't break seating
   - Confirm countdown is 5 seconds
   - Test guest Ready behavior
   - Fix/update journeys that expected Online-only Play
   - Check for `.cm-lobby-rules` selector timeouts

4. **Documentation updates:**
   - Update README nav if it contradicts Phase 0
   - Update any help text mentioning Play structure

---

## Acceptance Criteria

Phase 0 implementation is complete when:

- [ ] This alignment document exists and is committed
- [ ] Opening `#game` shows lobby (or clear host-offline gate into lobby)
- [ ] Lobby seating flow is functional and not replaced by Online bridge
- [ ] Countdown duration is 5 seconds (not 10)
- [ ] Guest Ready button exists and gates host Start
- [ ] All existing invite/multiplayer flows remain functional
- [ ] Tests and journeys pass (or are updated appropriately)
- [ ] README accurately reflects Phase 0 nav structure

---

## Notes for Future Agents

**Why this document exists:** Phase 0 decisions were hard-fought and represent careful product thinking. Before changing anything captured here, understand the reasoning behind the locked decision.

**OpenAI package reconciliation (2026-09-16):** The OpenAI Astra review package (`design/crankmagic/`) was incorporated AFTER Phase 0 lock as supporting authority and Phase 1+ guidance. On conflicts, Phase 0 wins (top nav structure, Play lobby-first, Wanted design, terminology). The OpenAI package provides:
- Authoritative domain contract for ownership/acquisition (`collection-workflow.md`)
- Journey acceptance gates for Phase 1 (`end-to-end-plan.md`)
- Visual design reference for facelift (`mtg-facelift-mockup.html`)
- Simulation fidelity gates (deferred to later phase)

**The Play amendment specifically** reflects that the lobby is not "setup for the real thing" — it IS the thing. The online/multiplayer infrastructure enhances the lobby; it doesn't replace it.

**Terminology matters:** The glossary terms are chosen deliberately. "The hundred" emphasizes the full deck including commander. "Library" better communicates collection management than "Cards." The OpenAI package used different names (My Decks/Collection/Play Lab/Discover); Phase 0 renames won and are locked.

**Ownership invariants are sacred:** Never infer Owned from a decklist. Planned ≠ owned. Explicit acquisition path required. Orders stay orders until received. See "Phase 1+ Guidance from OpenAI Package" section for the complete dimensional model.

**When in doubt:** If a decision seems arbitrary, it probably isn't. Check related docs (including OpenAI package in `design/crankmagic/`), ask in context, or flag for review before deviating from Phase 0 alignment.
