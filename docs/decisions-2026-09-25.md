# The road to 100%, ordered and decided — 2026-09-25

After M11 shipped (#375), the cloud session recommended an order for M1–M10 and put every open
decision in one table. Rob answered in two messages: *"approved"*, then *"And you're approved for
M1-1 downloading it."* **This file is the record.** It reads "approved" as approving the recommended
order and each recommended answer in that table. Decisions that need Rob's own hands (a dashboard,
a secret, a purchase, an invitation, a file only he has) stay his, and the table says so.

## 1. The order

`docs/plan-to-100.md` "The order" stands, with these changes, all drawn from the architecture map
(`docs/architecture/README.md`):

1. **M2's R2 step first, alongside M1.** R2 is the one missing piece that M2's refresh, M3's backups,
   M5's card definitions and M7's compiled cards all land in. R3.10 (Archidekt links and precons)
   comes after R2 and `current.json` exist. The first M2 work moves outside reads out of the browser
   and tightens the security policy, because production still lets the browser reach
   `json.edhrec.com` and `archidekt.com` (checked live, 2026-09-25), which §0 of
   `docs/plan-data-sync.md` rules out. github.io housekeeping rides with it.
2. **M1, R3.0–R3.9**, as `docs/design/2026-09-25-redesign-r3/INTAKE.md` §5 orders them. Delete account
   ships inside R3.3.
3. **M4 reordered.** The storage adapter (PLAN 4.1b) and the house pilot (4.2) come before
   hand-authoring the 477 cards of phase 3. CME already has the game's state, journal, checkpoints and
   seat projections; a game room needs those two pieces, not the card library, to start.
4. **M3 alongside M2**: rate limits and monitoring now, backups once R2 is on.
5. **M6 after M3.** It depends on neither M5 nor M4.
6. **M5, M8, M7, M9, M10** in the plan's order, with the plan's gates.

## 2. The decisions

| For | Decision | Answer | Whose move |
| --- | --- | --- | --- |
| M1 · 1 | Type | **Satoshi Black 900 for headings; Young Serif only on heroes of 48px and up** | Done by the session |
| M1 · 1 | `satoshi-900.woff2` | **The session downloads it from Fontshare** (Rob, "approved for M1-1 downloading it") | Done by the session |
| M1 · 2 | The landing page's audience | **Invite-only.** The page says Sign in and "Start without an account" | — |
| M1 · 3 | Where the landing page lives | **`/` for a signed-out visitor with no library in the browser**; anyone else goes to Decks | — |
| M1 · 4 | The three new ways in | **Paste and CSV with the landing page; Archidekt links and precons in R3.10** | — |
| M1 · 5 | "Get notified" | **A switch stored with the account**, shown when Play ships; no mailing list | — |
| M1 · 6 | Sign in | **Google plus the emailed code (library only); no Apple** | — |
| M1 · 7 | The Menu entries the design does not draw | **As INTAKE §4.7 lists them** | — |
| M1 · 8 | EUR and Delete account | **Delete account: built (#384). EUR: dropped.** Rob, 2026-09-25: *"Why would I want EUR? I live in the US. I NEVER WANT ANYTHING, grammar, currency, etc. from anywhere except The US."* The rule is AGENTS.md, "The United States, always" | — |
| M1 · 9 | Merge on restore | **Replace only now; Merge later, with its own tests** | — |
| M1 · 10 | The land icon | Rob supplies it; the placeholder stays until then | **Rob** |
| M2 | Turn on R2 | **Yes, the free plan** | **Rob**, in the dashboard |
| M2 | The R2 token | *R2 Storage: Edit*, into the GitHub secret `CLOUDFLARE_R2_TOKEN` | **Rob** enters it |
| M2 | The schedule | **Prices and records daily; the graph and EDHREC weekly** | — |
| M3 | The alert email; how the workbook reaches Rob's library | Open | **Rob** |
| M4 | Forge's role | **PLAN phase 5, the Forge comparison, is dropped**; CR adjudication and the M8 playtests replace it | — |
| M4 | A deck with unsupported cards in Play v1 | **Refused by name; compiled once M7 lands** | — |
| M4 | The storage adapter and house pilot before phase 3 | **Yes** | — |
| M5 | Who plays v1 | **The accounts' invite list** | — |
| M5 | Workers Paid ($5 a month) | **Buy it when the engine's CPU per request passes the free plan's 10 ms** | **Rob** buys |
| M5 | A table invite to someone not on the accounts' invite list | **Rob, 2026-09-26: refused with instructions.** They are told to ask Rob to add them; the table's link never adds anyone to the list | — |
| M5 | Where "End current game" lives during a live match, and who may use it | **Rob, 2026-09-26: in the Tools menu, and any human at the table can end the game for everyone** (not host-only, no vote). Concede stays beside it for leaving alone | — |
| M5 | A human who drops mid-game and does not come back | **Rob, 2026-09-26: auto-concede after a timeout.** The game pauses at their next required decision, shows everyone the clock, and restores their seat if they return in time | — |
| M5 | Guest and host journeys | **Rob, 2026-09-26: approved** as drafted on the "Table Journeys" page. The seats, the join flow and what each person may see and do follow them | — |
| M5 | The three details under them | **Rob, 2026-09-26:** a dropped player concedes after **5 minutes**; End game takes a **second tap to confirm** ("End for everyone · keep the record"); a timeout concession is recorded as **not finished**, never as a loss | — |
| M6 | The AI allowlist, the key, spend caps, the privacy wording | Open | **Rob** |
| M7 | The 200-card sample's spend and the provider's terms | Open | **Rob** |
| M8 | The agents' access | **Four Access service tokens, staging only** | **Rob** creates them |
| M8 | Exit criteria | **50 games** with zero engine exceptions and zero leaks | — |
| M8 | The game night | Open | **Rob** |
| M9 | Deleting `forge`, `runtime` and the two variables | **At cutover** | **Rob** |
| R3.7 / cards | One card-state taxonomy (`docs/card-states.md`): stage (Watching, To buy, Ordered, Owned), deck and role (Target, Substitute, Upgrade), in the box, for trade | **Approved 2026-09-26**: the To Buy list is To buy; in the box stays; Ordered is bought-not-in-hand. **Revised the same day:** roles outside a box are Upgrade (replaces a card in the box) and Reserved (an empty seat); a deck is playable when nothing is Reserved; the Upgrade Path entries record their substitutes' seats and go; no short/long-term flags; the backup is rebuilt, not migrated in place | — |
| R3.9 / sizes | How a reader picks a size (card size, picture size, anywhere) | **Rob, 2026-09-26: a continuous slider, never S / M / L or named steps.** The minimum stays legible and the maximum fits; the range may differ between a phone and a desktop. The rule is AGENTS.md, "Sizes are sliders, never steps". The Settings card size and the Table view's two size pickers are built this way in R3.9b | — |
| Any time | The cloud's Cloudflare token expires **2026-10-25** | **Renew it before then** | **Rob** |
| Any time | www, SPF/DKIM/DMARC, GitHub Pro, the Cloudflare MCP, the 15 kept branches, sharing the architecture page | Open | **Rob** |

## 3. What this unblocks now

- M1 from R3.0, including R3.1's type (the font download is approved).
- M2's work that needs no R2: outside reads out of the browser, the tighter security policy, and the
  reader's IndexedDB cache.
- M4's storage adapter and house pilot.
- M3's rate limits.

R2 itself waits on Rob turning it on and entering the token.
