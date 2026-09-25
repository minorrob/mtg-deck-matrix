# UAT-LOG — CrankMagic cloud workshop · 2026-09-24

| | |
|---|---|
| **Target** | https://crankmagic.com/ |
| **Tip** | `8e9ddfd · 2026-09-24` |
| **Meta** | `crankmagic-play=coming-soon` · `crankmagic-accounts=on` |
| **Harness** | Playwright + system Chrome headless on box (fresh profile per viewport). Zero product code edits. |
| **Artifacts** | Decks named `UAT-CW-2026-09-24-Atraxa` |
| **Operator** | Grok Bot executor · America/New_York |

Chronological walk notes. Screenshots under `evidence/desktop/` and `evidence/mobile/`.

---

## Desktop ~1280×800

1. **Load** `https://crankmagic.com/` — waited past “Opening your library”. Landing / empty Decks hero: “Build it. Make it yours.” Meta tip confirmed in HTML. Shot: `01-landing.png`.
2. **Nav sweep** Decks → Library → Explore → Play. All paint. Explore shows **31,830 cards** + three doors + role chips. Play = **Coming Soon** with “Go to your decks”. Shots: `02`–`05`, `05c-play.png`.
3. **Deep links** `#decks` `#cards` `#discover` `#game` — OK. History back/forward OK. Reload on `#discover` holds. Shots: `06`–`08`.
4. **Theme** toggle via Menu/theme control — clicked. Shot: `09-theme.png`.
5. **Account** via Menu → Cloudflare Access “Log in to CrankMagic Accounts” (Google / Email code). Observed only; no credentials. Shot: `11c-account.png`. CSP console noise on that login page (data: SVG blocked).
6. **Backup** “Back up now” → download `CrankMagic-backup-2026-09-24.json`. Shot: `12-backup.png`.
7. **New deck E2E**  
   - Open New deck → path chooser Create / Import / Load (`20c-wizard-paths.png`).  
   - Create → commander picker (popular list includes Atraxa) (`20d`/`20e`).  
   - Name step → **Create draft** (`20f`/`20g`).  
   - Deck appears: **`UAT-CW-2026-09-24-Atraxa`** / Atraxa, Praetors' Voice / Defining / B2 (`24b-decks-after-create.png`, `24e-deck-open.png`).  
   - Detail actions: Edit card list, Finalize & reserve, Log a game, Measure, More. Tabs: Overview, The hundred (1), Upgrades, Explore, Acquire. NEXT: finish the list (1 of 100).
8. **Copy note** empty/one-deck header: **“One deck, no playable.”** — awkward/ungrammatical.
9. **Import** via New deck → Import path: ownership kinds (planned / owned / ordered / trade / order confirmation / sheet) + group targets. Shot: `30c-import-path.png`. (Empty-state button labeled “Import a backup” is actually `data-action=restore` — restore dialog.)
10. **Lab** `#lab` reachable (`31-lab.png`); deep steps not fully walked.
11. **Library** tabs Library/To buy/Orders; views List/Sheet/Table; **Add cards** → Sol Ring → Add copies (Owned). Shots: `50d`–`57c`, `51c-*`, `52b-*`.
12. **Explore** chooser solid when settled; on a later revisit saw long **“Loading the co-play links — about 20 MB…”** blank main (`60c-explore.png`) — settle hazard.
13. **US English** spot-check — no UK forms. Geometry scrollWidth=1280.

## Mobile ~390×844

1. Same load + nav sweep; top chrome Decks/Library/Explore/Play + ☰. Shots: `01`–`05c`.
2. **New deck E2E succeeded** same path; deck card + detail (`24b`, `24e-deck-open.png`). Commander art large/readable.
3. **Overflow defect:** deck detail bottom sticky action bar **clips “Log a game”** at the right edge (horizontal clip of controls). Fail CW-MOB-02.
4. Library tabs/views + Add cards path exercised; Explore chooser when settled; Play Coming Soon.
5. Account Menu → same Cloudflare Access gate. Backup click on mobile did not always fire download event (Partial vs desktop Pass).
6. Geometry document scrollWidth=390; no page-wide H-scroll, but clipped sticky bar remains.

## Blockers / coverage gaps

- Did **not** invent Account credentials; guest/local create worked — Accounts not a hard gate for workshop create.
- Explore **scoped graph inspect** Partial under co-play payload load lag.
- Lab deep steps, Measure report contents, full More-menu enumeration Partial.
- Play board/lobby/Forge **out of scope** (Coming Soon recorded once).

## Method note

Mandate asked for computerUse subagent; this executor had no Task/computerUse tool in-catalogue, so walks used Playwright + Chrome on the box with real screenshots of chrome (same evidence standard).
