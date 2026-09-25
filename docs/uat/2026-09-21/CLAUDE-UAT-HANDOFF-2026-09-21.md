# Claude Code handoff — CrankMagic UAT (2026-09-21)

**From:** Grok Bot + domain agents (Workshop IA, Collection truth, Explore, Hosted Play, Measure, Play Design, Workshop Design)  
**Mandate:** Zero code from Grok/agents. This file + the companion workbook are **recommendations only**.  
**Companion workbook:** `CrankMagic-UAT-2026-09-21.xlsx` (sheets: Summary · Test Cases · Open remediations · Session notes)

---

## Baseline

| Item | Value |
|------|--------|
| Local app | `C:\Users\robmi\CrankMagic\repo` |
| Design | `C:\Users\robmi\CrankMagic\Deck page redesign project\design_handoff_crankmagic_gallery` |
| GitHub tip used | Through **#311** (`claude/uat-lobby-batch6`). **#312 was not found** on `minorrob/mtg-deck-matrix` at UAT start — retarget if you have an unpushed #312. |
| Play | **IN FLUX** — you own Play → Lobby → Game; new merges expected. Do not treat Play rows as frozen. |
| Desktop Online | `CrankMagic Online - Start Game.lnk` (may still point at a different tree than `CrankMagic\repo` — see DR-P09 / UAT-START-02). |

**North star:** Gallery Brass & Slate (Felt & Cream light), Design C To buy / Wanted product rules, Online Forge↔web, joyful Commander workshop loop (Build → Manage → Acquire → Explore → Play).

---

## Scoreboard (this pass)

| Result | Count |
|--------|------:|
| Pass | 36 |
| Partial | 15 |
| Fail | 14 |
| Not run | 11 |
| **Total cases** | **76** |

Open remediations skew **S1/S2** toward Play ops + Library Design C + design-system debt. Full ranked list is in the xlsx **Open remediations** sheet.

---

## Priority stack for Claude (recommended order)

### P0 — Unblock Play / live table (ops + path)
1. **UAT-START-02 (S1)** — `Start` → Forge fails: `javac.exe` ENOENT under missing `C:\Users\robmi\CrankMagic\commander-runtime\...`. Restore runtime or retarget to existing JDK under `CrankMagic\runtime\`.  
2. **UAT-GUEST-01/02 (S1)** — Remote guests unavailable: `guestOrigin=http://127.0.0.1:8769`, cloudflared not running. Relaunch Desktop Start Game with Remote Guests so https `guestOrigin` exists.  
3. **DR-P09 (S2)** — Dual path: Desktop shortcut vs `C:\Users\robmi\CrankMagic\repo`. Unify WorkingDirectory / launch script to one tree.

### P0 — Design C / Library product
4. **LIB-06 (S2)** — Want-list / To-buy **entries** excluded from To buy shop filter & buy badge; counted as **Watched**. Fix filters/counts. **Do not rename UI to “Wanted” for Gallery** — Gallery copy is **To buy / Buy list** only.

### P1 — Design-system / Gallery reconciliation (shell & Decks)
5. **CM-DS-004 / CM-DS-001** — Remove dead Deep-Field / `v-*` navy CSS (150px rail remnant, navy covers) from `crankmagic-design.css`.  
6. **CM-DS-005** — Focus ring → `--color-aether` (not brass).  
7. **CM-DS-009 / CM-DS-012** — Library head/row `.compact` 32px → Gallery **42px**.  
8. **CM-DS-010** — Decks grid lock **3 columns** (not `auto-fill minmax(260px)`).  
9. **CM-DS-011** — Kill leftover global `h1 36/700` fighting deck hero 56px.  
10. **W-DECKS-03/05 / W-DECKS-02** — Empty Decks marketing hero ≠ Gallery poster grid; Compare CTA hierarchy (Gallery head Compare vs checkbox-gated / missing on empty).  
11. **W-DECKS-04 (S3)** — Rail truncates “How a deck comes to…”.  
12. **W-PAGE-02** — Overview bento OK; **commander art broken** on brand-new Create draft.  
13. **LIB-01** — Library head order: Gallery Import · More · **Add cards** (primary right).  
14. **LIB-04** — Card column pips = **color identity** (Gallery), not mana **cost**.

### P1 — Play product vs DELTA (after ops)
15. **DR-P05 / UAT-DELTA-01** — Host tools: End table / force-advance missing; DELTA “no Launch / auto countdown” vs live **Start + countdown** — **Trey product lock** then update DELTA or UI.  
16. **DR-P06** — Change deck wireframe **2d** (Saved / Lab / Bring + Use-at-Seat).  
17. **DR-P03 / DR-P07** — Seat chrome / Choose mat depth (IN FLUX).

### P2 — Measure / fidelity
Measure domain largely **Pass** (fidelity banner, 120k chip, deck Measure CTA tokens, `measurePublished` contract, unit tests). Optional: **M-LIVE-1** full browser Measure click-walk.

### Blocked / Not run
- **Explore live sampling** — first walk could not reach Personal-HP; re-dispatch in flight. Treat Explore as incomplete until amend.  
- **Table 2e/2f / R3 four-agent** — blocked on Forge JDK + guests.  
- **LIB-11** Gallery HTML render on box Chrome — infra (unpkg tunnel), not a product fail.

---

## Domain summaries

### Decks / Build (Workshop IA)
Rail IA Pass; New deck Create/Import/Lab Pass; deck tabs match Gallery (Overview · Hundred · Upgrades · Explore · Acquire; Measure = button). Gaps: empty Decks ≠ poster grid; Compare hierarchy; rail truncation; draft commander art; CSS token sweep.

### Library / Acquire (Collection truth)
Tabs/KPI/verbs largely Pass. Critical: **LIB-06** Design C To buy vs want-list entries. Also head order + identity pips.

### Design system (Workshop Design)
Shell 216px + logo/helix held. Dead navy CSS, focus color, control heights, Decks 3-col grid, global h1 race.

### Play (Hosted Play + Play Design)
API prepare Pass; wireframe-conformance **38/38** Pass; Start→Forge Fail (JDK); guests Fail (cloudflared); dual path Fail. Design 2b slice present in repo but IN FLUX vs older under-bars artifacts.

### Measure
Pass on honesty/CTA/API/tests; live click walk Partial.

### Explore
Not completed live this cut — see E-BLOCK-01.

---

## What Claude should **not** do from this handoff
- Do not treat Grok agents as implementers of these remediations (they are paused for code).  
- Do not merge Gallery “Wanted” wording into the product vocabulary.  
- Do not fight mid-merge Play commits without checking Trey’s latest Lobby/Game intent.  
- Do not assume #312 exists until it appears on GitHub or Trey names the branch.

---

## Evidence locations
- Box: `/workspace/uat-2026-09-21/` (xlsx, this md, `findings/`)  
- Workshop shots: `/workspace/uat/findings/*.png`  
- Personal-HP (also copy target): `C:\Users\robmi\CrankMagic\workbench\uat-2026-09-21\`

When ops unblocks JDK + cloudflared, ask Grok Bot to re-UAT Play Start→Forge + guest invite + Explore samples only (still zero product code from Grok unless Trey unpauses).


---

## Amendment — Decks/Library executor batch (same day)

Additional **19** cases from seeded Load Live walk (box mirror #311, 37 PNGs under `evidence/`).

**New / reinforced for Claude:**
- **L-02 (S2)** — Library **Sheet** lacks in-place editable numeric cells (Gallery requires them).
- **E-01b (S2)** — `#discover` can show **Discover** + heavy 20 MB graph cold load instead of Gallery **Explore entry**.
- **D-03b (S3)** — **Ready to add** / **Make the change** not listed in the rail under the open deck (Gallery/IMPLEMENTATION-GUIDE subnav).

Scoreboard in the companion xlsx is the amended total (merged IDs).


---

## Amendment — Explore live UAT (Personal-HP :8790)

Interactive graph + readable inspect art **Pass**. Chooser doors, card deep-link, Advanced Tools, Add/Buy on inspect **Pass**.

**Open for Claude:**
- **EXP-J4-01 (S2)** — No To buy / want-list handoff on Discover inspect (Add/Buy only). Align with Design C without Gallery “Wanted” rename.
- **EXP-J2-01 (S3)** — Facet bar clicks fail while Advanced Tools collapsed (DOM present, not visible).
- **EXP-J1-01 (Not run)** — Decks→deck-scoped Explore needs a seeded deck in the UAT profile.
- **EXP-J3-02 (Partial)** — Lens Swap absent on non-deck graph (document deck-scope requirement; expose when scoped).

Screenshots: `C:\Users\robmi\AppData\Local\Temp\cm-explore-uat\v3-*.png`
