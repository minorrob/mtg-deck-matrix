# CrankMagic Cloud Workshop UAT — test case catalog, 2026-09-24

| | |
|---|---|
| **Target** | `https://crankmagic.com/` (also `#decks`) |
| **Deploy meta** | `crankmagic-version` = `8e9ddfd · 2026-09-24` · `crankmagic-play` = `coming-soon` · `crankmagic-accounts` = `on` |
| **Scope** | Full workshop: Decks, Library, Explore, New deck, Import, Lab, deck detail/tune, Measure/sim, Reports, Account/settings, help, theme, nav, deep links, empty states, filters, List/Sheet/Table, card popups, acquire/wanted |
| **Out of scope** | Play board / `#game` deep gameplay / Forge / multiplayer — one XC observation if Play says coming-soon |
| **Method** | Zero code. Fresh box browser profile. Artifacts named `UAT-…`. Screenshots + markdown + CSV only under this directory. |
| **Viewports** | Desktop ~1280×800 · Mobile ~390×844 |
| **Severity** | S1 blocks core workshop loop or loses data · S2 wrong behavior a user will hit · S3 visible defect with workaround · S4 polish |
| **Verdict** | Pass · Fail · Partial · Blocked · N/A |
| **IDs** | Prefixed `CW-` (Cloud Workshop 2026-09-24). Prior `XC-`/`DECK-`/`LIB-`/`EXP-` IDs are not reused. |

American English UI is required; UK spellings are Fail on CW-XC-07. Non-functional controls are Fail on CW-XC-15 (Rob standing rule).

---

## A. Cross-cutting (CW-XC)

| ID | Case | Expected | Pass criteria | Sev |
|---|---|---|---|---|
| CW-XC-01 | Every top-level nav item loads its view | Decks, Library, Explore, Play each render content within ~3s after settle | Non-empty main chrome for each; Play may be coming-soon shell | S1 |
| CW-XC-02 | Deep link by hash | `#decks` `#cards` `#discover` `#game` (and deck/lab hashes if present) render same view as click-nav | Hash match + content for that route | S2 |
| CW-XC-03 | Back and forward | History moves between workshop views without blank frame | Content restores; no stuck spinner | S2 |
| CW-XC-04 | Reload holds position | Reload on a view returns to that view | Hash preserved; content reappears after settle | S2 |
| CW-XC-05 | No pageerrors / console errors on workshop sweep | Zero `pageerror`; no uncaught workshop-breaking console errors | Logged in CONSOLE-NETWORK.md; benign third-party noise noted separately | S2 |
| CW-XC-06 | No failed critical requests | No 404 on app shell/CSS/JS/catalog needed to paint | Failed requests listed; Scryfall/CDN flakes noted | S2 |
| CW-XC-07 | US English on screen | No UK forms in rendered chrome (`colour`, `organise`, `centre`, `catalogue` as UI copy, etc.) | Spot-check chrome + dialogs | S4 |
| CW-XC-08 | Theme switch | Light and dark both legible if toggle exists | Toggle works; no Canvas fallback washout | S3 |
| CW-XC-09 | Geometry / no harmful horizontal scroll | Desktop 1280 and mobile 390: no clipped primary chrome; no forced page-wide H-scroll | Screenshot + measure | S2 |
| CW-XC-10 | Tap targets (esp. mobile) | Primary nav/actions ≥ ~32px hit area | Fail if tiny primary controls | S2 |
| CW-XC-11 | Help `?` opens page-relevant help | Content matches current page | Opens, readable, closable | S3 |
| CW-XC-12 | Dialogs close by ✕, Escape, backdrop | Focus returns reasonably | Each exercised dialog closes | S3 |
| CW-XC-13 | Dialogs reachable and non-empty | No empty modal shells | Opened dialogs have content | S2 |
| CW-XC-14 | Deploy meta matches mandate | HTML meta version / play / accounts | Exact match to tip | S2 |
| CW-XC-15 | Nothing on screen is non-functional | No dead controls / stubs presented as ready | Standing rule; Play coming-soon OK if labeled | S2 |
| CW-XC-16 | Play nav honesty | If Play present with coming-soon, labeled; do not walk board | One observation; no Forge/lobby gameplay | S2 |
| CW-XC-17 | Settle / paint race | Views not judged empty before paint | Wait past “Opening your library” | S3 |
| CW-XC-18 | Card images readable | Card art in popups/list large enough to read name/type | Note hard-to-read examples | S3 |

---

## B. Decks (CW-DECK)

| ID | Case | Expected | Pass criteria | Sev |
|---|---|---|---|---|
| CW-DECK-01 | Decks list / empty state | List or honest empty state with New deck / Import / Lab CTAs | Content after settle; empty copy not broken | S1 |
| CW-DECK-02 | Subnav / deck chrome | Deck-related chrome present when decks exist | After create, deck appears in list/subnav | S2 |
| CW-DECK-03 | **New deck E2E** | Wizard → pick commander → create named `UAT-…` | Deck created and visible on Decks | S1 |
| CW-DECK-04 | Deck detail page | Header, commander, counts, primary actions | Opens from list; not blank | S1 |
| CW-DECK-05 | Deck options menu | Each visible item opens something real | Enumerate; no silent no-ops | S2 |
| CW-DECK-06 | Type / color bars | Mana/type summary renders if present | Visible and consistent with list | S3 |
| CW-DECK-07 | Edit / tune path | Can open card add/swap or editor from deck | Control works or labeled unavailable | S2 |
| CW-DECK-08 | Import entry | Import opens review/flow | Reachable from decks chrome | S2 |
| CW-DECK-09 | Lab / Build from Commander | Lab opens, steps present, can start from commander | Reachable; not blank | S2 |
| CW-DECK-10 | Measure / sim if present | Report or sim UI produces current output | If absent = N/A; if present must work | S3 |
| CW-DECK-11 | Export / print if present | Produces claimed list/file | If absent = N/A | S3 |
| CW-DECK-12 | How-a-deck / explainers | Linked explainer pages render | Links not 404 | S4 |

---

## C. Library (CW-LIB)

| ID | Case | Expected | Pass criteria | Sev |
|---|---|---|---|---|
| CW-LIB-01 | Tabs (Library / To buy / Orders or equivalent) | Each tab renders | Non-empty chrome / honest empty | S1 |
| CW-LIB-02 | Views List / Sheet / Table | Each view renders same records conceptually | Switch works; no blank crash | S2 |
| CW-LIB-03 | Status filters | Reserved/Owned/To Buy/etc. filter and clear | Toggle changes set | S2 |
| CW-LIB-04 | Text search | Search by name (and type/rules if offered) | Results update | S2 |
| CW-LIB-05 | Filters / Columns dialogs | Open, apply, clear | Closable; Clear restores | S3 |
| CW-LIB-06 | Acquire / wanted / status flows | Mark wanted or status change persists in session | Observable change | S2 |
| CW-LIB-07 | Card popup from library | Card dialog readable (art + text) | Opens; close works | S2 |
| CW-LIB-08 | Empty library honesty | Fresh profile shows clear empty/add path | No fake inventory | S2 |
| CW-LIB-09 | Backup control | Back up now present and invokes download/dialog | Not a silent stub | S3 |

---

## D. Explore (CW-EXP)

| ID | Case | Expected | Pass criteria | Sev |
|---|---|---|---|---|
| CW-EXP-01 | Explore entry / chooser | Entry points render (deck/commander/card/role as offered) | Chooser or graph entry visible | S1 |
| CW-EXP-02 | Catalog count claim | Count matches live catalog order-of-magnitude | Plausible count shown | S3 |
| CW-EXP-03 | From commander / card entry | Can open scoped explore | Graph or result view paints | S2 |
| CW-EXP-04 | Graph hover/click inspect | Nodes/cards inspectable | Popup or detail appears | S2 |
| CW-EXP-05 | Filters / lens / roles if present | Filters change graph or list | Observable effect | S3 |
| CW-EXP-06 | Wanted / add from explore | Actions labeled and functional or gated honestly | No silent dead button | S2 |

---

## E. Accounts (CW-ACC)

| ID | Case | Expected | Pass criteria | Sev |
|---|---|---|---|---|
| CW-ACC-01 | Account / sign-in surface | If `accounts=on`, entry visible | Observe only; no invented credentials | S2 |
| CW-ACC-02 | Guest / local path | Deck create works without sign-in OR clear gate | Document gate; Blocked if create impossible | S1 |
| CW-ACC-03 | Settings if present | Opens and shows real options | Non-empty | S3 |

---

## F. Mobile-specific (CW-MOB)

| ID | Case | Expected | Pass criteria | Sev |
|---|---|---|---|---|
| CW-MOB-01 | Nav chrome at ~390×844 | Main pages reachable | Nav usable | S1 |
| CW-MOB-02 | No harmful overflow | Primary content not clipped off-screen | Screenshot | S2 |
| CW-MOB-03 | Tap targets | Primary actions tappable | ≥~32px or easy hit | S2 |
| CW-MOB-04 | Readability | Body/chrome text readable without zoom | Call out hard-to-read | S2 |
| CW-MOB-05 | New deck / library / explore critical paths | Same as desktop critical path | Deck create if possible | S1 |
| CW-MOB-06 | Dialogs fit viewport | Modals not cut off | Screenshot | S3 |

---

## Evidence naming

`evidence/desktop/*.png` and `evidence/mobile/*.png` — clear names e.g. `01-landing.png`, `02-nav-decks.png`, `10-new-deck-wizard.png`, `11-deck-created-UAT.png`.
