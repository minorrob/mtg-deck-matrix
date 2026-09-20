# CrankMagic — comprehensive scope from Trey’s prompts (2026-09-17)

Synthesized for Claude Code / any implementer. This is **what Trey asked for today**, not a changelog of agent claims.

**Work tree:** `C:\Users\robmi\OneDrive\Documents\My Games\MtG\work\commander-phase-c`  
**Launch:** Desktop → Magic the Gathering → **CrankMagic Online - Start Game**  
**Decks on disk:** `C:\Users\robmi\OneDrive\Desktop\Magic the Gathering\Deck Files\` (D1–D6 `*.dek` + backup JSON)

---

## 1. Mission for tonight

Deliver a **joyful, low-friction local Online session** Trey can trust:

- He starts from the Desktop shortcut.
- Seats humans and/or AI any mix (him + 3 AI; him + humans; mixed).
- Guests join via invite, pick their own decks, Ready Up.
- Start launches Forge and the web tabletop stays in sync.
- Play proceeds without hangs; recovery controls always available.
- Decks created/applied in lobby should show up under **Decks** afterward with real metadata.

**Hard process rules he locked:**

1. **UAT before prod** — always test on a UAT path before merging to `main` / live Pages.
2. **No stubs as “ready for review”** — temporary, half-baked, stubbed, or docs-only work is first-look only; merge only to temporary branches unless real.
3. Verify the way **he** sees it (browser chrome, screenshots), not API/health alone.
4. Capture bugs → plan → execute when he says; don’t invent ready claims.

---

## 2. Product vision (standing, from his framing)

CrankMagic is one app with four pillars, aimed at a streamlined professional cloud experience later, but **tonight is local Online**:

1. **Deck & card management** — purpose/allocation/wanted/bought states; Decks as home for drafts and reports.
2. **Deck building / import** — paste lists, Archidekt (when working), Library, Build from Commander (Deck Labs), backups.
3. **Simulator / Measure** — 120k Monte Carlo; reports attached to decks.
4. **CrankMagic Online** — local Forge + tunnel + AI seats; lobby → Ready → Start → play.

**Canonical user loop:** define/refine 100 → simulate/explore → play Online → iterate decks.

**UX standing rules:** American English; avoid large text blocks except real descriptions; no AI artifacts (em dashes, rhetorical filler); progressive disclosure; buttons in rows / menus, not stacked into empty space; seat UI fully contained; keep CrankMagic logo mark + helix animation; Explore keeps interactive graph + readable card art (facelift can wait if playability needs it).

---

## 3. Online acceptance loop (what “done” means)

From his 8pm-critical prompts:

### 3.1 Entry
1. Double-click Desktop shortcut → loader/tests → local host opens.
2. Auto-open **Lobby** (`#game`), four seat containers (not collapsed / not nested “Loading” / not recorded-table chrome).

### 3.2 Seating
Each seat: **Human / AI / Unused**.

**Human (host side):**
- Name, email.
- **Email Invite** (native mail) + **Copy Link** + **selectable URL field** (manual copy).
- Host does **not** pick the guest’s deck.
- Guest sees deck source / paste / build / resolve unknowns, then Ready Up in their seat.

**AI:**
- Host (or flow) chooses deck source and seats a legal 100.

**Invite email content (exact intent):**
- Subject like “Join my Commander table on CrankMagic”.
- Real **hyperlinked** join URL.
- Instructions: Archidekt/Moxfield → export → paste as `[Count] [Card Name]` (e.g. `1 Soul Stone`); commander first on the list; blank row; then other 99.
- Closing “See you shortly!” style as in his draft screenshot.

**Guest link behavior:**
- Clean browser must land on **seat / pick-deck lobby**, not Decks home (“Build it. Make it yours.”).
- Must not show “table not accepting players” / expired / unavailable on a fresh invite.
- Join URL format must be whatever the **live** gateway accepts (not dead workshop `#seat=`-only links).

### 3.3 Deck sources (every seat / modal)
Show only fields for the chosen source. Archidekt **hidden** until fixed.

Required methods he cares about:

| Source | Behavior |
|--------|----------|
| **One of your decks / Library** | Real decks from his Desktop `.dek` files (D1–D6 / backup) — not wrong/placeholder lists. |
| **Paste my deck** | `qty name` lines; commander first or last; validate cards map 1:1 to catalog + Forge; unknown-card resolve UI (type + searchable name + hover art) → OK → Ready enabled. |
| **Build from Commander** | Typeahead commander search (dropdown on focus/type, low fuzziness, WUBRG filters). **Define play style** (Lab definition: mechanic/playStyle/speed/competitiveness/saltiness/brackets/caps/restrictions). **Apply build-100** must call **real Deck Labs / `CrankDraft.build`** — legal Commander singleton (only basic lands may duplicate). |

**Apply build-100 quality bar:**
- Visible **working** state: spinning flame (mountain/mana-style) while building.
- Soft notice **≤ ~3 seconds** (not 10–15s stuck banners).
- If result violates table rules (e.g. GC over cap): **remove violators**, **backfill** next-best legal cards, **finalize and seat** the 100 — do not stop on “No deck yet” with only an error.
- Save play style must **not** revert source to “One of your decks” or clear the selected commander.

**After any apply:**
- Ready Up only when all 100 map cleanly to catalog/Forge (bracket/GC fit secondary to mapping).
- Seat shows commander art (readable, unclipped; click → ~1.5× popup), GC counts, **type bars** with real type metadata (not fake “Other”), Colors (American spelling), Deck Fit, View Cards, Change Deck / Deck Summary (in-lobby popup, don’t leave lobby), Generate Simulation Report (120k) linked to deck for later Decks/Reports.
- Applying a deck must create a **real Decks draft** via existing create mechanics (full metadata for bars / later Decks screen).

### 3.4 Lobby chrome / rules
- Table rules: concise; Confirm or dynamic text — not a stale long paragraph.
- No Reshuffle seating / Seating Seed.
- Bracket + Game Changer Cap controls: **same font size**.
- Ready Up top-right on title row with commander name; subtext (You/Host or AI/Human · traits) left-aligned **under the name**, not under the seat number; tighten vertical gap; content shifts up.

### 3.5 Start → play
1. All relevant seats Ready → Start (real Start — not a stub notice).
2. Random who-goes-first.
3. Launch Forge; app verifies Forge↔web sync before relying on play.
4. Mulligan/keep once per seat; **green check** when system acknowledges a decision.
5. R1: every player starts with Draw; ≥1 land playable in a turn (acceptance intent).
6. Always-on: **View hand**, **Auto-pass** (skip remaining → pass turn), **End Game**, **Force End Turn**.
7. Card inspector art larger (~+20% when he asked).
8. AI seats must not stall forever; invalid OpenAI models fixed; backups = Auto-pass / Prompt AI in host UI / End Game — not chat “prompt krenko”.

### 3.6 After game
- Rematch / return to lobby without full machine restart when possible.
- Simulation + after-action reports attach to the deck; viewable from Decks.

---

## 4. Dual release track (same day)

**Track A — Personal-HP (gate for the live table):** keep local Online green; iterate lobby/start/guest/play here.

**Track B — GitHub `main` / Pages (goal by evening if UAT holds):** so guests can use Decks and the rest of CrankMagic after the game. Consolidate helpers (lobby draft, measure publish, Labs build) via UAT PR then merge — **not** at the expense of Track A.

Tonight’s game does **not** require Pages; it requires the Desktop host.

---

## 5. Confidence / test mandate (his words)

After lobby polish: agent-driven (or human) tests of:

- Four seats; **each** deck-add method.
- Agents as human and as AI.
- Start game; play through.
- On every error: identify → fix → reset → rerun until confident.

Confidence bar: he can launch from the shortcut, set any seat mix, and expect a **happy-path joyful experience with no surprises**. Only then tell him he’s good to launch.

**Self-test capture he filed before Start (must still be true):**

1. Bracket text + GC cap same font size.  
2. Library decks = real Desktop `.dek` set.  
3. Build → Define play style → Save keeps Build path.  
4. Commander search shows typeahead dropdown.  
5. Seat header alignment (name / subtext / Ready).  
6. Save play style does not clear commander.  
7. Apply: short notice + strip GC violators + backfill + seat 100; flame spinner while working.  
8. Invite email hyperlink + paste instructions.  
9. Guest link → seat lobby, not Decks home; later: not “not accepting” / expired — **fresh live invite**.

---

## 6. Explicitly deferred (backlog)

- Full cloud re-platform / signup (later).
- Facelift / shell polish if it risks playability.
- Coaching, draw-odds, rival tips, learning UX.
- Archidekt re-enable until fixed.
- Merging Online hang PR stack to main without UAT.

---

## 7. Process note for Claude

Grok Bot + CrankMagic agents were **paused** so Claude can own `commander-phase-c` without collisions.  

Companion technical state file:  
`CLAUDE-HANDOFF-crankmagic-online-2026-09-17.md` (same folder).

When done, Trey can unpause Grok Bot / Hosted Play.

