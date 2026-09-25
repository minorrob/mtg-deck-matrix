# OUTCOMES — CrankMagic cloud workshop UAT 2026-09-24

| | |
|---|---|
| **Target** | https://crankmagic.com/ |
| **Tip / version** | `8e9ddfd · 2026-09-24` |
| **Meta** | play=`coming-soon` · accounts=`on` |
| **New deck E2E** | **Succeeded** — `UAT-CW-2026-09-24-Atraxa` (Atraxa, Praetors' Voice) on desktop and mobile |
| **Catalog** | `cases.csv` + `TEST-CASES.md` (CW-* IDs) |

## Scoreboard (unique CW-* IDs, worst viewport if split)

| Result | Count |
|---|---:|
| **Pass** | 37 |
| **Partial** | 15 |
| **Fail** | 1 |
| **Blocked** | 0 |
| **N/A** | 1 |
| **Total IDs** | 54 |

(Row-level including dual viewport geometry rows: Pass 38 · Partial 15 · Fail 1 · N/A 1 · total 55.)

## Defects (severity)

| Sev | ID | Defect |
|---|---|---|
| **S2** | CW-MOB-02 | Mobile deck detail sticky action bar **clips “Log a game”** (and risks other trailing actions) at ~390px — controls not fully tappable/visible. Evidence: `evidence/mobile/24e-deck-open.png`. |
| **S2** | CW-XC-15 / label | Empty Decks CTA **“Import a backup”** wired to `data-action=restore` (restore dialog), while true decklist import lives under New deck → Import. Misleading control label vs standing rule. |
| **S2** | CW-EXP-03/04 | Explore **co-play links ~20 MB** load can leave main blank for a long beat; scoped graph inspect not reliably confirmed if harness does not wait. |
| **S3** | CW-XC-05 | Cloudflare Access login CSP blocks a `data:` SVG image (console). Cosmetic on accounts gate. |
| **S4** | copy | Decks header **“One deck, no playable.”** — awkward / non-idiomatic American English. |
| **S4** | chrome | Sidebar deck name truncated (`UAT-CW-2026-09…`); NEXT helper grey-on-grey lower contrast. |

## Readability issues (called out separately)

1. **Mobile clipped actions** on deck detail sticky bar (S2 above) — primary readability/usability fail for this viewport.
2. **NEXT** strip on deck overview: medium grey on dark grey — harder to read than primary chrome.
3. **Commander / card art** on deck detail: **good** — Atraxa large and legible (desktop + mobile).
4. **Explore / Library** primary headings: high contrast; role chip labels readable when chooser settled.
5. **Account CF Access** page is light theme / third-party — fine, but CSP blocks decorative SVG.

## Domain roll-up

| Domain | Verdict | Notes |
|---|---|---|
| XC | Mostly Pass | Meta, nav, deep links, theme, US English, Play honesty OK; Partial standing-rule/CSP/geometry |
| DECK | Pass (E2E) | Create draft path solid; Measure/Lab/More depth Partial |
| LIB | Pass | Tabs/views/add copies/backup OK |
| EXP | Pass entry / Partial depth | Chooser + count Pass; graph depth lag |
| ACC | Pass observe | Gate present; **guest create works** |
| MOB | Mixed | Critical paths Pass; **overflow Fail** on deck actions |

## Evidence roots

- `evidence/desktop/*.png` (48 files)
- `evidence/mobile/*.png` (45 files)
