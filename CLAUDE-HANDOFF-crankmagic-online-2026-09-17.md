# Claude Code handoff — CrankMagic Online (2026-09-17 ~8:37pm ET)

**Owner now:** Claude Code on Personal-HP.  
**Grok Bot + all CrankMagic agents:** PAUSED — do not edit this tree until Trey unpauses.  
**Do not collide with:** Hosted Play / Grok Bot / other Grok agents editing `commander-phase-c`.

---

## Paths (Personal-HP = this Windows PC)

| What | Path |
|------|------|
| **Online work tree (source of truth tonight)** | `C:\Users\robmi\OneDrive\Documents\My Games\MtG\work\commander-phase-c` |
| **Desktop shortcut** | `C:\Users\robmi\OneDrive\Desktop\Magic the Gathering\CrankMagic Online - Start Game.lnk` |
| **Launch script** | `...\commander-phase-c\game\tools\launch-crankmagic-online.ps1` (`-RemoteGuests`) |
| **WorkingDirectory** | `commander-phase-c` |
| **Local host** | `http://127.0.0.1:8768` → `/app/#game` |
| **Deck .dek files (authoritative for Library)** | `C:\Users\robmi\OneDrive\Desktop\Magic the Gathering\Deck Files\` — `D1 Quintorius Spirits.dek` … `D6 Krenko Goblins.dek` + `CrankMagic-backup-2026-09-16.json` |
| **GitHub repo (Pages / tip)** | `https://github.com/minorrob/mtg-deck-matrix` |

**Personal-HP** is Grok Bot’s machine label for this PC — not a folder name.

---

## Pins last reported by Hosted Play (before pause)

- `game.js?v=37`
- `css?v=132`
- Earlier: `online.js?v=10`, `lobby.js?v=1`
- Ctrl+F5 `#game` / guest URL after changes

---

## Standing product rules (Trey)

1. **UAT before prod** — no merge to `main` / Pages without browser UAT.
2. **No stubs as ready** — temporary/half-baked/docs-only = first-look draft only; temporary branch only.
3. American English (Colors not Colours).
4. Concise UI copy; no large AI-flavored text blocks / em dashes.
5. Buttons in a **row**; group extras under one menu — don’t stack into empty space.
6. Seat content stays **inside** its seat container.
7. **Build from Commander** must use real **Deck Labs** / `CrankDraft.build` (singleton except basic lands).
8. Dual-track was: Track A = Personal-HP live game; Track B = GitHub `#267` for Decks-after-game on main (secondary tonight).

---

## What was done (Online / Personal-HP)

### Lobby UX (Hosted Play on `commander-phase-c`)
- Restored classic Game Setup lobby (not nested Loading / recorded table).
- Seats: Human / AI / Unused; Human = name/email/invite only (guest picks deck).
- Archidekt option **hidden** until working.
- Progressive deck source; Build from Commander + Define play style modal (Lab fields).
- WUBRG: **icons only**, ~15–20% larger (no W/U/B/R/G letters).
- Seat header: commander name on title line; AI/Human · Labs/traits as subtext; Ready Up top-right.
- Decked: art, GC, type bars, View Cards / Change / Deck Summary (in-lobby modal), Generate Simulation Report link, Clear deck contained, commander click 1.5× popup.
- Selectable invite URL field + Email Invite + Copy Link.
- Library: live `deck:live:D1–D6` then real Desktop `.dek` D1–D6 embedding (Sideboard=commander; pad to 100). `/api/desktop-deks` added (may need host restart when Forge idle).

### Start / Forge
- **Was:** `lobby-start` G0 **stub** (notice only).
- **Fixed:** Start → map seats → `/api/prepare` → `/api/start` → poll `/api/live` → Forge.
- Host+3AI reached `/api/live` **ready** (Forge pid up) in agent UAT — **PARTIAL** confidence only.
- Tabletop P0 earlier (tip PRs): mulligan/untap, green ack, View hand, Auto-pass, End Game, +20% inspector art, OpenAI model ids → `gpt-5-mini`/`gpt-5` (PRs #259–#263 still **draft**, chained, not all on main).

### Guest invite (critical)
- **Bug:** Email/Copy Link minted workshop `#seat=<uuid>` → guest hit `/table` → **“This table is not accepting players”** / expired-unavailable.
- **Fix claimed (v=37):** `ensureLiveInvite()` opens private lobby when humans≥2, issues real `#table=…&invite=…`; Human seats placeholders; `#seat=` alone no longer hits `/table`.
- **Trey still hitting expired/unavailable** after that — needs full reset + **fresh** invite (old links stay dead).

### Apply build-100 / GC
- Must use `CrankDraft.build` Lab-parity; refuse partial/illegal/non-basic dups.
- GC over cap: should **strip violators + backfill** legal cards, seat 100, notice **≤3s**, **flame spinner** while busy.
- Trey FAIL earlier: notice too long, no spinner, still “No deck yet” with GC error (Enlightened Tutor, Narset, Notion Thief). Hosted Play claimed fix in v=37 — **verify**.

### Invite email copy (v=34+)
Subject: `Join my Commander table on CrankMagic`  
Body pattern (match Trey draft): greeting → “Join my Commander table on CrankMagic:” → **https join URL** (auto-link) → Archidekt/Moxfield export + `[Count] [Card Name]` example with commander first, blank row, then 99 → “See you shortly!”

### Self-test capture list 1–9 (status)

| # | Issue | Claimed status |
|---|--------|----------------|
| 1 | Bracket + GC cap same font | Fixed (14px) |
| 2 | Library = real Desktop `.dek` D1–D6 | Fixed (embedded); API needs host restart later |
| 3 | Save play style reverts to “One of your decks” | Fixed (stay on Build) |
| 4 | Commander typeahead dropdown | Fixed |
| 5 | Seat subtext under name; Ready top-right | Fixed |
| 6 | Save play style clears commander | Fixed |
| 7 | Apply GC strip+backfill; notice ≤3s; spinner | Claimed in v=37 — **retest** |
| 8 | Invite email hyperlink + instructions | Fixed (v=34+) |
| 9 | Guest link → seat lobby not Decks home | Partially; then accepting-players bug; v=37 `#table&invite` — **Trey still blocked** |

---

## Full reset (for expired / unavailable guest)

1. Close all guest tabs with old links.
2. Stop host if stuck — was listening `:8768` on `node … serve-review.mjs` (example PID changed over time); also `cloudflared`.
3. Relaunch **CrankMagic Online - Start Game**.
4. Ctrl+F5 `#game`.
5. Seat host deck → Human seat → **new** Email Invite / Copy Link.
6. Guest must open URL with **`#table=` and `invite=`** — discard `#seat=`-only links.

---

## GitHub Track B (paused / secondary)

Draft UAT PR combining Collection + Measure + Build-from-Commander:  
https://github.com/minorrob/mtg-deck-matrix/pull/267  
Branch: `cursor/uat-8pm-decks-and-labs-a91e`  
Includes #264 `ensureLobbyDraft` / `attachDeckReport`, #265 `measurePublished`, #266 Labs build.  
Static UAT PASS; **not merged to main**. Online stack #259–#263 still separate drafts.

Live Pages: earlier hotfix #258 for boot hang / asset skew.

---

## Open / verify next (Claude priority)

1. **Guest join end-to-end** on Cloudflare tunnel after full reset — mint `#table=&invite=`, guest selecting/pick deck, no expired/unavailable.
2. **Apply build-100** with GC over-cap commander: spinner, strip+backfill, seated legal 100, notice ≤3s.
3. Host+AI Ready → Start → Forge → tabletop play (Auto-pass / End Game / Force End Turn backups).
4. Optional: Decks draft after Apply (`ensureLobbyDraft` / Collection module) for post-game Decks.
5. Do **not** merge tip/`main` without Trey UAT.

---

## Agent map (paused)

- **Hosted Play** — Online / Personal-HP owner (idle)
- Collection truth, Measure, Workshop IA, Explore, Play Design, Workshop Design, etc. — idle
- **Grok Bot** — coordinator; paused Online edits per Trey

When Claude is done, Trey can unpause Grok Bot / Hosted Play to resume.

