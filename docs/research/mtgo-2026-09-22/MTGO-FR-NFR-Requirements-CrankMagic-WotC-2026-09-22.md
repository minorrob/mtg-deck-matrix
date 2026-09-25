# Magic: The Gathering Online — Functional & Non-Functional Requirements
**Prepared for:** Robert "Trey" Minor / CrankMagic  
**Purpose:** Inform a possible Wizards of the Coast (WotC) sale or partnership conversation regarding Magic: The Gathering Online (MTGO)  
**Operator context:** Daybreak Game Company LLC under license from Wizards of the Coast LLC  
**Document date:** 2026-09-22 (EDT)  
**Classification key:** MUST | SHOULD | COULD | GAP  
**Companion:** `MTGO-Requirements-Traceability.csv`

---

## 1. Executive summary

CrankMagic needs a requirements baseline that separates what WotC (or a licensed operator) would treat as non-negotiable from what MTGO merely does today. This document turns the 2026-09-22 research memo and a verified on-disk ClickOnce install inventory into testable Functional Requirements (FR) and Non-Functional Requirements (NFR), each tagged:

| Tag | Meaning for negotiation |
|-----|-------------------------|
| **MUST** | Platform, IP, legal, rules integrity, economic integrity, or competitive integrity WotC / a licensed operator would likely insist on |
| **SHOULD** | Strong product expectation on MTGO today; form is negotiable, spirit usually is not |
| **COULD** | MTGO design choice CrankMagic may deliberately do differently (be ready to defend) |
| **GAP** | Observed weak or missing on MTGO; opportunity for CrankMagic |

**How to read this.** Lead with MUST items in any WotC conversation. Treat SHOULD as "players will notice if gone." Treat COULD as redesign space. Treat GAP as differentiation, not license risk.

**Method & caveats.** Primary sources are official MTGO / Daybreak / WotC pages summarized in `MTGO_PRD_Research_2026-09-22.md`, plus a verified ClickOnce install on Personal-HP (client **v3.4.158.4700**): 11 Scene DLLs, `Card.dll` (~216 MB), model assemblies, Audio (98 WAVs), Policies/EULA RTF, native SQLite/p4 bridges. Live UI exploration was blocked: remote shell launch fails with `FileLoadException` on `Shiny.Converters.FormatColorConverter` / `XamlParseException` because **Shiny\*.dll is absent** from the inventory (`shiny: []`). help.mtgo.com was Cloudflare-walled during research. Items not confirmed in a running UI are marked Unverified / Low confidence. Do not treat this draft as a substitute for live client walkthrough before final partnership materials.

**CrankMagic lens (one line).** Commander-first product with Forge-local rules, collection/graph/sim tooling, and hosted play — map every MUST to what CrankMagic already covers, partially covers, or still lacks.

---

## 2. Scope and out of scope

### In scope
- MTGO digital client and supporting services as operated for play, collection, trade, store, events, Premier / MOCS path, redemption, support, and admin.
- Legal / ToS posture of Digital Objects, age/region controls, anti-cheat, and prize eligibility as they bind a successor operator.
- Client architecture evidence from install inventory (scenes, models, audio, policies) as product surface area.

### Out of scope
- Magic: The Gathering Arena (Alchemy / Historic / Timeless / digital-only balance) except contrast notes.
- Paper Organized Play operations except where MTGO is an explicit digital qualifying path to Regional Championships / Pro Tour / Worlds.
- Paper product SKU design, Universes Beyond IP deals, or Hasbro corporate finance.
- Speculative CrankMagic product roadmap beyond implication one-liners.

### Install-aligned product surfaces (verified on disk)
| Scene / module | Role (inferred from name + research) |
|----------------|--------------------------------------|
| LoginScene | Account create / auth |
| HomeScene | Hub, buddies, navigation |
| PlayScene | Event / lobby / open play entry |
| CollectionAndDeckEditorScene | Inventory + deckbuilding |
| DuelScene (~1.51 MB, largest UI) | In-match rules UI |
| DraftScene | Limited draft UX |
| TradeScene | Peer / binder trade |
| StoreScene | Tickets, boosters, upgrade, redemption tokens |
| SettingsScene (~0.81 MB) | Client preferences |
| HelpScene | In-client help / Conduct / guide |
| AdminScene | Operator / DEC tooling surface |
| Chat.dll + Chat model | Social messaging |
| Card.dll + CardManager | Card data / rendering payload |
| FlsClient | Client platform / licensing plumbing (name-level) |
| WotC.MtGO.Client.Model.\* | Play, Core, Chat, Trade, Store, Settings, Session, Reference, Home, Help, Admin, Data |
| Audio/ (98 WAV) | Event feedback pack |
| Policies/, EULA/, Resources/ | Embedded legal & conduct |

---

## 3. Stakeholder goals

| Stakeholder | Goals this document protects |
|-------------|------------------------------|
| **Player** | Persistent collection value (as license), fair timers, Comprehensive Rules correctness, eternal formats, trade liquidity, Premier path clarity, bug reimbursement norms |
| **WotC IP** | License-not-ownership model; B&R authority; brand safety; Organized Play invitation integrity; sanctions / age / privacy compliance |
| **Daybreak operator (or successor)** | Enforceable ToS; anti-cheat; payment / tax posture; operable Windows client; support cost controls; ClickOnce / dependency integrity |
| **Competitive ecosystem** | QP / Challenge / Showcase integrity; multi-account bans; bribery rules; RC / Worlds feed; content (stream / Showcase) constraints |

---

## 4. Functional requirements

Requirements use "The system shall…" and are testable. Classifications appear in **bold**. CrankMagic implications are italic one-liners where useful.

### 4.1 Account / authentication / age / region (LoginScene, Session model)

**FR-001** The system shall authenticate players with a dedicated MTGO account (username/password) created in-client or via the operator account ecosystem. **MUST** — Identity binds collection, prizes, and bans. *CrankMagic: hosted accounts must map 1:1 to competitive identity if Premier is in scope.*

**FR-002** The system shall enforce age eligibility: 18+ unrestricted; ages 13–17 only with parent/guardian registration and acceptance of responsibility; accounts personal and non-transferable. **MUST** — COPPA-adjacent and EULA posture.

**FR-003** The system shall support a free Basic tier with restricted features (no Trade, Chat, Challenge, Store per current FAQ) and a one-time paid Full upgrade unlocking those features. **COULD** — Funnel economics; spirit of free-onboarding + paid social/economy is SHOULD. *CrankMagic may use different gates but should preserve free try-play.*

**FR-004** The system shall reclaim Basic accounts after prolonged inactivity (current policy: ~3 months), freeing the username and forfeiting earned Basic product. **COULD** — Retention policy knob.

**FR-005** The system shall apply U.S. export / embargo controls and refuse service or prizes for sanctioned regions per published policy. **MUST**

**FR-006** The system shall restrict Scheduled / Premier event participation and cash / invitation prizes to allowlisted countries and 18+ where required (under-18 invitations pass down). **MUST** — Sanctions and gambling-adjacent risk. *Evidence: Policies/PrizeEligibility.rtf, PlayerRewardsEligibility.rtf on disk.*

**FR-007** The system shall bind the player to EULA, operator ToS, Privacy Policy, arbitration/class waiver, and Delaware governing law at account creation and material updates. **MUST** — *EULA_en.rtf (~4.7 MB) ships in client.*

**FR-008** The system shall issue tax reporting (e.g., Form 1099) for annual winnings above the applicable USD threshold and inform players they are responsible for taxes. **MUST** (where U.S. tax rules apply)

**FR-009** The system shall process Store payments via approved third-party processors and treat fees as generally non-refundable except technical issues or fraud at operator discretion. **SHOULD**

### 4.2 Collection & Digital Objects license (Collection scene, Card.dll)

**FR-010** The system shall treat all digital cards and related inventory as **Digital Objects**: a limited license to use solely for playing the Game; players do not acquire ownership of Accounts or Digital Objects. **MUST** — Core Hasbro/WotC/Daybreak legal posture.

**FR-011** The system shall persist a player inventory of cards, tickets, play points, avatars, chests, boosters, and related objects across sessions. **MUST** — Without persistence MTGO ceases to be MTGO. *CrankMagic collection/graph already models inventory; license terms must match.*

**FR-012** The system shall allow the same Digital Object instance to be assigned to multiple decks concurrently. **SHOULD**

**FR-013** The system shall forfeit the player's right to use Digital Objects upon account termination per EULA. **MUST**

**FR-014** The system shall ship and update a complete card data / art payload sufficient for eternal formats (install evidence: `Card.dll` ~216 MB). **MUST** for competitive parity with paper pool. *CrankMagic: Forge-local + card DB must stay B&R-synced.*

### 4.3 Economy, trade, store, RMT (TradeScene, StoreScene)

**FR-020** The system shall sell Event Tickets ("tix") in the Store as the primary tradable unit of account for event entry and peer trade. **SHOULD** — Form negotiable; a tradable medium of exchange is closer to MUST for eternal liquidity.

**FR-021** The system shall provide non-tradable Play Points (PP) earned as prizes, usable for event entry at a published equivalence (commonly 10 PP = 1 Ticket), without mixing tickets and PP on the same entry. **SHOULD** (mix rule Unverified in official help fetch — Med confidence)

**FR-022** The system shall provide New Player Points (or equivalent) for onboarding / phantom events. **COULD**

**FR-023** The system shall provide an in-client Trade scene with binders (Full Trade List, Wish List, custom), post/search, buddy trade, confirm/modify/cancel, and trade chat for Full accounts. **MUST** (in-client liquidity mechanism) — *Absent a first-party cash-out marketplace, peer trade is the product.*

**FR-024** The system shall provide a Store for tickets, boosters, draft bundles, Commander decks, redemption-related SKUs, and account upgrade. **SHOULD** — *StoreScene.dll present.*

**FR-025** The system shall prohibit selling Digital Objects, tickets, or accounts for real-world currency **outside** the Software, and shall not recognize off-platform transfers. **MUST** — Fraud, AML, tax, ToS. If replaced, requires deliberate regulated cash-out redesign.

**FR-026** The system shall prohibit gameplay bots, macros for unattended play, protocol emulation, and unauthorized third-party programs that impact gameplay. **MUST**

**FR-027** The system shall treat automated trading bots as **not formally authorized** even if historically tolerated; any first-party marketplace or formal bot API is a product decision. **COULD** (strategic) / enforcement posture **GAP** vs lived practice. *CrankMagic should decide authorize / replace / ban before WotC diligence.*

**FR-028** The system shall ban bribery; allow limited prize-splitting only in defined final-round situations without operator enforcement of splits. **MUST** (ban) / **COULD** (split nuance)

**FR-029** The system shall offer Treasure Chests or equivalent prize sinks/faucets as tunable economy objects. **COULD**

### 4.4 Formats & event types (PlayScene, DraftScene)

**FR-040** The system shall support competitive constructed formats: Standard, Pioneer, Modern, Legacy, Vintage, Pauper, with B&R synced to WotC tabletop policy (MTGO effective next day noon PT). **MUST** (B&R sync + eternal suite spirit) — exact format roster **SHOULD**.

**FR-041** The system shall support Premodern and Duel Commander at least via Challenges (leagues Unverified — verify in client). **SHOULD**

**FR-042** The system shall support multiplayer Commander Open Play and 1v1 Commander Gauntlet (40 life, starter decks). **SHOULD** — *CrankMagic Commander-first: strengthen brackets and multiplayer hosting beyond MTGO.*

**FR-043** The system shall support Momir Basic, Cubes (incl. Vintage Cube), Jumpstart, Pack Wars, Flashbacks, and Phantom variants where cards are not added to collection. **COULD** (mix) / Phantom Limited **SHOULD**

**FR-044** The system shall provide Constructed Leagues (e.g., 5 matches), 2-player queues, Gold Single-Elim 8-player queues, Draft/Sealed leagues and 8-man queues. **SHOULD**

**FR-045** The system shall provide Open Play: Play Now / Quick Play / format lobbies / Buddy Challenge. **SHOULD**

**FR-046** The system shall not rely on Arena-style Alchemy / digital-only balance as the primary competitive card pool. **MUST** for MTGO identity vs Arena. *CrankMagic: keep paper-faithful pool for eternal.*

**FR-047** The system shall remove mid-league illegal decks after B&R changes and return entry. **MUST**

**FR-048** The system shall expose a Play lobby surface (`PlayScene`) distinct from Duel and Draft scenes. **SHOULD** — install-aligned.

### 4.5 Deckbuilding & collection UI (CollectionAndDeckEditorScene)

**FR-060** The system shall provide collection inventory and deck editor with format grouping, filters (format, set, color, type/mana/rarity — full list Med confidence), name/rules-text search, versions (art/foil/promo), image vs table display, and quantity including zero for wish design. **SHOULD**

**FR-061** The system shall support deck import/export as text and `.dek`, clipboard import, and server-side auto-save. **SHOULD**

**FR-062** The system shall enforce sideboard rules, Companion-in-sideboard, and Commander pane color identity. **MUST** for format legality.

**FR-063** The system shall mark illegal/missing cards and allow Update with versions in collection. **SHOULD**

**FR-064** The system shall provide mana curve, sample hands, and deck settings. **COULD**

**FR-065** The system shall enforce Basic account deck slot limits (20 per FAQ); Full account limits Unverified. **COULD**

**FR-066** The system shall allow saving draft logs to disk. **COULD**

### 4.6 Matchmaking & progression (Play model)

**FR-080** The system shall match league opponents primarily on course score (wins−losses), wait time, and rematch bias — not Elo, trophies, or outside-course record (official 2018 explanation still cited). **SHOULD** — algorithm form COULD.

**FR-081** The system shall fire on-demand queues when minimum players are reached (typically 2 or 8). **SHOULD**

**FR-082** The system shall support scheduled Swiss + Top 8 (Challenges) and fixed-round Prelims / Trials with standings and tiebreakers in Event Details. **SHOULD**

**FR-083** The system shall progress Premier players via Qualifier Points (QP) / Leaderboard Points rather than a public global Elo ladder. **SHOULD** (hidden MMR Unverified)

**FR-084** The system shall support Commander Brackets notes with path to programmatic validation (Game Changers, MLD examples) as evolving design. **COULD** / validation completeness **GAP**. *CrankMagic opportunity: hard bracket validation.*

### 4.7 Rules engine, timers, disconnect (DuelScene)

**FR-100** The system shall digitally adjudicate matches under the Magic Comprehensive Rules (priority, stack, layers, replacement effects, etc.). **MUST** — Competitive legitimacy vs webcam. *CrankMagic: Forge-local engine is a core asset; prove CR fidelity.*

**FR-101** The system shall provide phase/step stops (own and opponent turn), lockable Phase Bar, Yield Until Here, and sensible defaults. **SHOULD**

**FR-102** The system shall support priority hold (Ctrl while casting/activating) and a deep shortcut / auto-yield system (pass, yield through turn, stack identical triggers, auto-tap, undo mana, etc.), mostly rebindable. **SHOULD**

**FR-103** The system shall run a per-player chess clock while holding priority; at 0 the player loses the match; round caps apply by event type. **MUST** (fair clock) — exact durations **COULD**.

**FR-104** The system shall announce disconnects; apply a grace window (community: remaining clock or ~10 min inactivity, whichever shorter — **Unverified** official text); clock does not freeze; reconnect does not restore lost time; operator not responsible for player connectivity in Premier. **MUST** (abuse-resistant disconnect model) — exact numbers Med/Low until official doc verified.

**FR-105** The system shall allow the operator to adjudicate any match or event result. **MUST**

**FR-106** The system shall provide duel audio feedback for combat, damage, destroy, discard, exile, life change, planeswalker loyalty, priority, phase, win/lose, and related events (verified Audio/Duel + Alerts set). **SHOULD** — *CrankMagic audio pack alignment opportunity.*

### 4.8 Social, chat, spectate, replay (Chat, HomeScene)

**FR-120** The system shall provide buddies list, challenge, trade, and chat for Full accounts. **SHOULD**

**FR-121** The system shall support ignoring / blocking players. **SHOULD** (exact UI Unverified)

**FR-122** The system shall provide room and game chat that may be monitored and recorded; Basic accounts cannot chat. **SHOULD** (monitoring **MUST** for safety/ToS)

**FR-123** The system shall allow spectating Open Play / casual matches when host permits; competitive leagues/Challenges generally not live-spectatable (secondary — verify). **COULD** matrix / coverage needs **SHOULD** for Showcase.

**FR-124** The system shall provide match replay (availability and chat-in-replay Unverified currently). **SHOULD** when on; state is **GAP**/Unverified. *Verify in client.*

**FR-125** The system shall embed Player Code of Conduct and Game Guide resources in-client. **SHOULD** — *Resources RTF present on disk.*

### 4.9 Premier / MOCS (PlayScene, AdminScene, DEC)

**FR-140** The system shall operate a seasonal QP economy feeding Prelims / Challenges / Trials → Qualifiers / Super Qualifiers → Showcase / Opens / Last Chance → Champions Showcase, including World Championship invites for top finishers per published path. **MUST** — Feeds tabletop OP; WotC strategic asset.

**FR-141** The system shall treat MTGO as a digital qualifying path to tabletop Regional Championships per WotC path documentation. **MUST**

**FR-142** The system shall prohibit multi-accounting in Showcase/Qualifiers, enforce one Scheduled Event entry per person, and ban account sharing. **MUST**

**FR-143** The system shall provide Digital Event Coordinator (DEC) chat / admin tooling for covered events. **SHOULD** — *AdminScene.dll present.*

**FR-144** The system shall support Showcase streaming requirements and constraints for invitees (freely accessible streams; no competing-game promo; streamer risk disclaimer). **SHOULD**

**FR-145** Exact QP thresholds, prize pools, and Gold SE vs Prelim scheduling are tunable. **COULD**

### 4.10 Redemption bridge (StoreScene + redemption service)

**FR-160** The system shall offer Physical Redemption: voluntary termination of license for a complete main-set of digital cards in exchange for a physical set shipped to the address on file, subject to good standing, billing/shipping country match, supported countries, handling/shipping fees, and while-supplies-last. **MUST** as value-bridge **or** an explicit successor migration that preserves player trust. EULA allows cancellation; ending without a bridge is a trust crisis.

**FR-161** The system shall allow Daybreak/operator to designate non-redeemable products (e.g., MH3, many Masters / UB — confirm per SKU). **COULD** per release / **MUST** to communicate clearly.

**FR-162** The system shall reflect current foil redemption posture (foil physical sets discontinued as of Bloomburrow; digital foil may redeem for regular physical where tokens apply). **COULD**

**FR-163** The system shall make Store stock authoritative over schedule tables when stock is exhausted. **SHOULD**

### 4.11 Support / admin (HelpScene, AdminScene)

**FR-180** The system shall provide help submission, feedback for non-reimbursement bugs, and Game Support for redemption issues. **SHOULD**

**FR-181** The system shall reimburse or nullify for vendor-side event/league bugs per published policy (~48h, one per event/course, Premier special-cased); not for player ISP/hardware, ToS suspensions, or unverifiable reports. **SHOULD**

**FR-182** The system shall top up Challenge minimum-prize shortfalls in PP via CS within published SLA. **COULD** / trust **SHOULD**

**FR-183** The system shall provide an in-client Report Issue path. **SHOULD** — *Resources/Report Issue.rtf.*

**FR-184** The system shall provide operator Admin scene capabilities for contested events / account actions (exact toolset Unverified). **MUST** for integrity operations at high level; feature depth Med confidence.

---

## 5. Non-functional requirements

### 5.1 Performance

**NFR-001** The system shall meet or publish minimum client hardware requirements (current: Windows 10+, 1 GHz / 8 GB RAM / 1 GB GPU / 1280×1024 / 16 GB disk / broadband; recommended higher / Windows 11). **SHOULD**

**NFR-002** The system shall keep duel input-to-feedback latency acceptable for competitive play under recommended specs (quantitative SLA Unverified — treat as product target). **SHOULD** / measured SLA **GAP**.

**NFR-003** The system shall manage large card payload updates (`Card.dll` scale) without routinely corrupting the install. **SHOULD** — community cites large updates / lag as pain. **GAP** vs player expectation of modernity.

### 5.2 Reliability

**NFR-010** The system shall support reconnect after disconnect within the grace model without corrupting match state. **MUST**

**NFR-011** The system shall auto-patch the client (ClickOnce or successor) to a consistent dependency set. **MUST**

**NFR-012** The system shall maintain ClickOnce / installer **dependency integrity**: all assemblies referenced by XAML converters and scenes (e.g., Shiny.\*) must be present or the client must fail closed with a clear repair path. **MUST** — *Verified gap: Shiny\*.dll absent → FileLoadException / XamlParseException on incomplete launch paths.* Observation is install hygiene, not a player-facing feature.

**NFR-013** Store and redemption workflows shall be idempotent under retry (exact behavior Unverified). **SHOULD**

### 5.3 Security / anti-cheat

**NFR-020** The system shall detect or deter cheats, hacks, mods, gameplay bots, collusion, and defect exploitation; remedies include restriction, suspension, deactivation, and forfeit of Digital Objects without refund. **MUST**

**NFR-021** The client may collect hardware / profile / network signals and monitor for unauthorized concurrent programs as disclosed in EULA. **MUST** (capability + disclosure)

**NFR-022** The system shall protect account credentials and session tokens in transit and at rest per operator security baseline. **MUST** (baseline assumed; details not in public research — Med)

### 5.4 Compliance / legal

**NFR-030** The system shall enforce age gates, parental consent, privacy policy, export controls, and prize geofencing. **MUST**

**NFR-031** The system shall retain and present EULA / Prize Eligibility / Player Rewards Eligibility / Code of Conduct artifacts. **MUST** — *Present under EULA/, Policies/, Resources/.*

**NFR-032** The system shall support tax information collection for prize winners as required. **MUST**

### 5.5 Accessibility

**NFR-040** The system shall provide basic visual aids (card zoom, card size settings). **SHOULD**

**NFR-041** The system shall pursue WCAG-aligned screen reader and colorblind support. **GAP** on MTGO today (not first-class documented); growing ethical/legal pressure — CrankMagic differentiation. **COULD** for parity with current MTGO; **SHOULD** for any greenfield rewrite.

### 5.6 Client platform

**NFR-050** The system shall ship a Windows desktop client with published minimum specs until multi-platform parity exists for the active player base. **MUST** (continuity) 

**NFR-051** Mac / Linux / mobile / cloud-stream clients. **COULD** — rewrite CAPEX conversation.

**NFR-052** Client tech may remain C# / WPF / XAML / ClickOnce or move to a successor stack. **COULD** — *Install confirms WPF/XAML scene model; Shiny absence shows fragility of partial deploys.*

**NFR-053** Native interop (x64/x86 `SQLite.Interop`, `p4bridge`) shall be packaged for both architectures as required by the runtime. **SHOULD** — verified on disk.

### 5.7 Observability

**NFR-060** The client shall write operational logs sufficient for support triage (`Logs/mtgo.log` evidence). **SHOULD**

**NFR-061** The operator shall have telemetry for match outcomes, disconnects, trade anomalies, and Premier integrity signals. **MUST** at capability level (details proprietary — Med)

### 5.8 Scalability

**NFR-070** The system shall scale matchmaking and duel services for peak Premier / set-release load without dropping competitive integrity. **MUST** (intent) — capacity numbers not public (**Low** quantitative)

**NFR-071** Trade and Store services shall remain available during peak liquidity events. **SHOULD**

### 5.9 Localization

**NFR-080** The system shall ship English client legal and help resources at minimum (`EULA_en.rtf`). **MUST** for current market

**NFR-081** Additional UI languages. **COULD** / coverage **GAP** relative to global paper Magic.

### 5.10 Fairness

**NFR-090** Timer and disconnect rules shall not be trivially abusable to force wins or stalls. **MUST**

**NFR-091** League matchmaking shall prefer fair course-score pairing over smurf-friendly open Elo. **SHOULD**

**NFR-092** Randomization (shuffles, packs) shall be cryptographically adequate for competitive trust. **MUST** (intent; algorithm Unverified — Med)

### 5.11 Audio / UX feedback

**NFR-100** The system shall provide an event-driven audio pack covering startup, tournament/game begin/end, draft begin, timer alerts, card manipulation, duel verbs (cast, combat, damage, destroy, discard, exile, fight, reveal, mana, life, planeswalker loyalty, win/lose), product grant/open, and common UI chrome. **SHOULD** — *98 WAVs verified under Audio/{Alerts,Card,Duel,General}; CrankMagic audio pack alignment opportunity.*

**NFR-101** Audio shall be user-toggleable / volume-scoped in Settings. **SHOULD** (SettingsScene large; exact audio toggles Unverified — Med)

---

## 6. Decision register

| WotC may say is required | CrankMagic posture | Alternative that still protects MUST intent |
|--------------------------|--------------------|-----------------------------------------------|
| License-not-ownership Digital Objects | **Agree** | Keep EULA model; never market "own your cards" |
| Ban off-platform RMT / account sales | **Agree** (or challenge form) | First-party regulated cash-out + KYC/AML instead of gray bots |
| Comprehensive Rules engine fidelity | **Agree** | Forge-proven engine with audit harness vs CR suite |
| B&R sync timing under WotC control | **Agree** | Same noon-PT policy; automated legality pipeline |
| Persistent collection + in-client trade | **Agree** | Trade UX may differ; liquidity mechanism required |
| Physical redemption program | **Challenge form** | Successor value-bridge (migration credits, paper vouchers, escrowed buyback) announced before any sunset |
| Trading-bot gray market | **Challenge** | Official API marketplace or clear ban + first-party liquidity |
| Windows-only WPF/ClickOnce client | **Challenge** | Multi-platform rewrite with Windows parity window and dependency-complete installers |
| Basic $5 Full gate details | **Challenge** | Different funnel; keep free try-play + paid economy |
| Exact QP / Showcase prize tables | **Challenge** | Retune; keep Premier → RC/Worlds integrity |
| Foil redemption discontinued | **Agree** (cost adaptation) | Communicate SKU policy clearly |
| Honor-system Commander brackets | **Challenge** | Programmatic bracket validation (CrankMagic strength) |
| Full WCAG suite day-one | **Partial challenge** | Phased a11y roadmap exceeding MTGO baseline |
| Treasure Chest EV design | **Challenge** | Cleaner sinks/faucets without loot ambiguity |
| Disconnect grace exact minutes | **Challenge numbers** | Publish abuse-tested grace; clock must not freeze |

---

## 7. CrankMagic gap matrix (MUST-focused)

| MUST theme | CrankMagic today | Status |
|------------|------------------|--------|
| Digital Objects license-not-ownership ToS | Needs counsel-ready terms if hosting collections | **Missing** (legal wrapping) |
| Off-platform RMT ban / regulated alternative | Policy design not productized | **Missing** |
| Comprehensive Rules engine | Forge-local | **Covers** (validate with CR test corpus) |
| B&R / format legality sync | Collection/graph/sim can encode; ops pipeline needed | **Partial** |
| Anti-cheat / collusion / bribery | Hosted play nascent | **Partial / Missing** at Premier grade |
| Age / region / prize geofencing | Not MTGO-grade | **Missing** |
| Persistent collection + trade liquidity | Collection/graph strong; trade/economy weak | **Partial** |
| Redemption or successor value-bridge | Not applicable yet; design required for WotC deal | **Missing** (design) |
| Premier / QP / identity verification | Not built | **Missing** |
| Abuse-resistant timers / disconnect | Forge/local play ≠ networked competitive clocks | **Partial** |
| Windows client continuity / install integrity | Different stack likely | **N/A → plan** |
| Operator adjudication & admin tooling | Limited | **Missing** |
| Chat monitoring / Conduct enforcement | Limited | **Partial** |
| Audio duel feedback pack | Opportunity to align / exceed MTGO 98-WAV set | **Partial** (opportunity) |
| Commander multiplayer + brackets | Commander-first product | **Covers / exceeds** (validation GAP→opportunity) |

---

## 8. Open questions & verify-in-client checklist

1. Confirm "MoV" = Momir Basic (research assumption).
2. Current redeemable set list / Store stock vs schedule (Secrets of Strixhaven OOS noted in research).
3. Complete 2025–2026 non-redeemable catalog (UB, Masters, Horizons, remasters).
4. Premodern / Duel Commander always-on leagues in Constructed lobby.
5. Brawl beyond open play / UI mentions.
6. Replay on/off and whether chat is included.
7. Spectator rules matrix: Open Play vs League vs Challenge vs Showcase.
8. Full account deck slot and binder limits.
9. Official disconnect grace documentation (community ~10 min).
10. Any hidden MMR/Elo alongside QP.
11. Current enforcement posture on trading bots (CS vs practice).
12. Accessibility settings inventory (colorblind, font scaling beyond zoom).
13. Ignore/block and report UI paths.
14. Payment methods / Store country list 2026.
15. ClickOnce vs newer launcher migration; **repair path when Shiny\* missing**.
16. Two-Headed Giant, Oathbreaker, other niche formats in client.
17. Account Safety FAQ (help.mtgo.com Cloudflare-blocked).
18. SettingsScene audio / a11y toggles (large DLL — inspect when UI runs).
19. AdminScene exact capabilities (DEC vs CS vs antifraud).
20. Whether GameDetails remains a separate module in v3.4.158.4700 majors list vs folded into Play/Duel.

**Blocked until:** complete ClickOnce dependency set (restore Shiny or equivalent) so live UI explore can validate Unverified rows; or authenticated non-remote launch on Personal-HP with UI automation under user supervision.

---

## 9. Sources

### Primary research
- `/workspace/research/MTGO_PRD_Research_2026-09-22.md` (authoritative narrative for this draft)
- `/workspace/research/mtgo-install-inventory.json` — Personal-HP ClickOnce root, version **3.4.158.4700**; scenes, majors, `shiny: []`, folders Audio/Images/Resources/Policies/EULA/Logs/x64/x86

### Official (from research memo)
- mtgo.com: home, getting-started, EULA, redemption, constructed-events, limited-events, premier-play, reimbursement, tips/tricks, deckbuilding, multiplayer, commander brackets news
- daybreakgames.com: Terms of Service, Privacy, MH3 non-redeemable note
- help.mtgo.com Basic Account FAQ
- wizardsmtgo.tumblr.com league matchmaking (2018, still cited)
- magic.wizards.com Banned & Restricted (+ MTGO timing policy)

### Install observations (not product requirements)
- Remote shell launch: `FileLoadException` `Shiny.Converters.FormatColorConverter` / `XamlParseException` correlated with **zero** Shiny assemblies in inventory
- `Card.dll` ~226,137,088 bytes; `DuelScene.dll` ~1.58 MB; `SettingsScene.dll` ~0.85 MB; `MTGO.exe` ~14.7 MB; Audio ~34.7 MB / 98 files; EULA_en.rtf ~4.7 MB; mtgo.log ~7.5 MB

### Secondary (labeled; low weight)
- Cardhoarder economy / bots articles; community Reddit; MTGGoldfish league evidence; Daybreak job posts (C#/WPF); MTG Wiki redemption overview

---

*End of requirements document. Re-verify against a dependency-complete live client and latest Weekly Announcements before locking partnership materials.*
