# MTGO Product Requirements Research
**Audience:** CrankMagic founder — Wizards of the Coast partnership/acquisition prep  
**Product:** Magic: The Gathering Online (MTGO) — Daybreak Game Company LLC under license from Wizards of the Coast LLC  
**Research date:** 2026-09-22 (EDT)  
**Method:** Official primary sources preferred (mtgo.com, help.mtgo.com, daybreakgames.com, magic.wizards.com); reputable secondary labeled. Items not verified in a live client marked **Unverified**.

---

## A) Feature inventory by domain

### 1. Account / auth / age / ToS / region

- **Operator:** Daybreak Game Company LLC operates MTGO under license from Wizards of the Coast LLC (EULA copyright notice).
- **Client auth:** Username/password MTGO Account; created in-client (“Create New Account”). Daybreak account ecosystem also exists (account.daybreakgames.com).
- **Account tiers:**
  - **Basic (free):** ~3,000 cards / 2× recent commons + 5 starter decks (Modern, Pioneer, Pauper, Legacy, Commander per Basic Account FAQ); Open Play; New Player events; **no** Trade, Chat, Challenge, Store.
  - **Full (~$4.99–$5 one-time Account Upgrade):** Trade, Chat, buddy challenge, Store, prize events / Premier path, larger starter kit (~9,000+ cards total).
- **Basic inactivity:** After 3 months inactivity, Basic Account closes; username freed; earned product lost (Basic Account FAQ).
- **Age (MTGO EULA §3.1):** Available to 18+; ages 13–17 require parent/guardian to complete registration and accept responsibility. Accounts personal; not transferable/sold; parent may permit one child to use instead of adult.
- **Daybreak ToS:** 18 or majority, or 13+ with parental consent; no selling/transferring accounts.
- **Governing docs:** MTGO EULA (updated May 31, 2022), Daybreak ToS (updated July 13, 2026), Daybreak Privacy Policy; Delaware governing law; arbitration / class waiver (ToS/EULA).
- **Region / export:** U.S. export controls; embargoed countries listed in EULA. **Premier Play (from MOCS 2026 Season 2):** Scheduled Events limited to an explicit allowlist of countries (US, Canada, many EU/Asia/LatAm/etc.). Prize restrictions for sanctioned/embargoed regions (Belarus, Crimea, Cuba, Iran, North Korea, Russia, Syria, Ukraine, Venezuela, etc.). Cash prizes / invitations: 18+ for Showcase / Championships; under-18 invitations pass down.
- **Taxes:** Form 1099 for >$600 USD annual winnings (EULA); player responsible for taxes.
- **Payments:** Third-party processors (PayPal, Adyen cited in EULA); fees generally non-refundable except technical issues/fraud at Daybreak sole discretion.

### 2. Collection ownership model

- **Legal model (MUST-read):** Digital cards are **“Digital Objects”** — **limited license to use solely for playing the Game**; player **does not acquire ownership** of Accounts or Digital Objects; all rights remain with Daybreak (and WotC IP) (EULA §§1, 6, 10–11).
- **In-client collection:** Persistent digital inventory (cards, tickets, play points, avatars, chests, boosters, etc.) tradable **inside** the client (Full accounts).
- **Physical Redemption (historical + current):**
  - Voluntary termination of license for a **complete main-set** of digital cards → physical set shipped to address on file.
  - Requires Redemption Request purchase from Store; account good standing; shipping address same country as billing; Store-supported countries only.
  - Handling ~$45/set (≥Bloomburrow) or $35 (pre-Bloomburrow); shipping $10 US / $35 international; intl 3+ sets get 25% shipping discount.
  - **As of Bloomburrow (2024):** Foil physical redemption sets discontinued; digital foil sets redeem for **regular** physical sets where foil-for-regular tokens apply; older foil stock while supplies last.
  - Only main-set collector numbers; bonus sheets not redeemable; all-regular or all-premium digital; while supplies last; Daybreak may change/cancel program.
  - Redemption page snapshot (updated July 20, 2026): many products Out of Stock; stock in Store supersedes schedule table.
  - **Non-redeemable products (policy / announcement pattern):** Supplemental products (e.g., Modern Horizons 3 officially “will not be redeemable”); Masters-style / many Universes Beyond — confirm per release (**Unverified** exact current non-redeemable list beyond live Store/redemption page).
- **Termination:** Account termination → forfeit right to use Digital Objects (EULA §16).

### 3. Economy: tickets, play points, bots, trading, RMT

- **Event Tickets (“tix”):** Sold in Store (~$1 USD each historically / still the unit of account); primary tradable medium of exchange among players; official use = event entry (and trade).
- **Play Points (PP):** Non-tradable; earned as prizes (constructed events etc.); event entry typically **10 PP = 1 Ticket** equivalence for entry; cannot mix tickets+PP for same entry (secondary consensus; **Unverified** in official help article fetched).
- **New Player Points:** Separate entry currency for onboarding events (Gauntlets, Jumpstart, etc.).
- **Treasure Chests:** Prize / store-adjacent loot objects; open for cards/PP value; major secondary-market EV discussion (secondary).
- **In-client Trade:** Trade scene + binders (Full Trade List, Wish List, custom binders); post/search; buddy trade; confirm/modify/cancel flow; chat during trade (Full accounts).
- **Store:** Tickets, boosters, draft bundles, Commander decks, redemption tokens, account upgrade, etc.
- **Bots / marketplace norms (mixed source types):**
  - **Official:** EULA forbids bots/macros for unattended play or impacting gameplay; forbids selling Digital Objects/tickets for real-world currency **outside** the Software; Daybreak does not recognize off-platform transfers.
  - **De facto (secondary — Cardhoarder, community):** Automated **trading bots** (buy/sell/rent) dominate liquidity; tix ≈ soft currency; cash-out via third parties. Longstanding gray-area practice; not a Daybreak-operated marketplace.
- **RMT / account sales posture:** Strict prohibition on off-client RMT and account sale/transfer; enforcement can include suspension/termination and loss of Digital Objects (EULA §§12–12.3; Daybreak ToS Cheating/RMT section).
- **Bribery / prize split (events):** Bribery banned; limited prize-splitting only in defined “final round” situations; splits not enforced by Daybreak (EULA §3.3).

### 4. Constructed + Limited: leagues, queues, Momir (MoV), Premier, Phantom, Cubes

*Note: “MoV” interpreted as **Momir** (Momir Basic / Momir Vig Specialty). If a different acronym was intended, flag in Open Questions.*

**Constructed (official constructed-events page):**
- **Leagues (5 matches):** Standard, Pioneer, Modern, Legacy, Vintage, Pauper — entry 10 tix **or** 100 PP; prizes PP + Treasure Chests + QPs by wins.
- **2-player queues:** Same formats + **Momir Basic** + Pioneer; 2 tix / 20 PP; Bo3 single elim; 50-min rounds.
- **Gauntlets (new player / phantom):** Modern Gauntlet; Commander Gauntlet (1v1, 40 life, starter decks).
- **Also live in Challenges / secondary league reports:** **Premodern**, **Duel Commander** Challenges; Premodern/Duel Commander leagues appear in decklist aggregators — treat client availability as **current but verify in-client** (not fully enumerated on constructed-events hub).
- **Gold Single Elimination Queues (new):** 8-player constructed; 15 tix / 150 PP; replace Constructed Prelims for QP grinding; formats = season MOCS formats + Pauper.

**Limited (official limited-events page, updated Nov 18, 2025 + Pack Wars):**
- Draft League (3 matches); Best-of-One Draft League (set release windows); Competitive Sealed League (5); Friendly Sealed multi-stage.
- Swiss Draft / Single-Elim Draft 8-man queues.
- **Phantom:** Cubes, Flashbacks, Jumpstart, Gauntlets, Phantom Pack Wars, Phantom Sealed Trials — cards **not** added to collection.
- **Cubes:** Vintage Cube Swiss League; Vintage Cube always-on SE queue; Regular Cube SE; Cube 64-player SE; card pools linked from MTGO.com.
- **Pack Wars** (Keeper league keeps cards; Phantom 2P queue).
- Flashback limited with booster+ticket entry options.

**Premier Play / MOCS:**
- Seasonal QP economy (~17-week seasons); ~40 QP typical Premier entry.
- Paths: Leagues/Queues → Prelims/Challenges/Trials → Qualifiers / Super Qualifiers (RC invites) → Showcase Challenges/Opens/Last Chance → Champions Showcase ($50k pools cited; World Championship invites for top 2).
- Digital Event Coordinators (DEC) chat channel for some covered events.
- **Only digital qualifying path** to tabletop Regional Championships emphasized on getting-started path page.

### 5. Formats supported (current MTGO accuracy)

| Format | Competitive on MTGO (as of research) | Notes |
|--------|--------------------------------------|-------|
| Standard | Yes — leagues, queues, Challenges, Showcase | Follows tabletop B&R; MTGO effective next day noon PT |
| Pioneer | Yes — leagues, queues, Challenges | |
| Modern | Yes — leagues, queues, Challenges, Showcase core | |
| Legacy | Yes — leagues, queues, Challenges | |
| Vintage | Yes — leagues, queues, Challenges | Restricted list tabletop |
| Pauper | Yes — leagues, queues, Challenges, Showcase Qualifiers | Strong MTGO identity |
| Premodern | Challenges (+ leagues per secondary decklists) | Verify league box in client |
| Commander (multiplayer EDH) | Open Play / casual; Commander Gauntlet 1v1 | **Yes, Commander is on MTGO**; not Arena-style only |
| Duel Commander | Challenges (+ leagues secondary) | 1v1 Commander competitive |
| Momir Basic | Specialty queue + open play | “MoV” candidate |
| Brawl | Mentioned in multiplayer UI docs | Competitive events **Unverified** / likely casual |
| Cubes / Flashbacks | Rotating limited products | Vintage Cube signature |
| Jumpstart | Phantom league | |
| Pack Wars | Limited | |

**Not MTGO’s focus vs Arena:** Alchemy, Historic, Timeless, digital-only balance changes — primarily Arena. MTGO aims at near-paper card pool / eternal formats.

**B&R sync:** Tabletop announcements Monday → MTGO noon PT next day; mid-league illegal decks removed with entry returned (wizards.com B&R policy).

### 6. Deck building / collection UI

- Collection tab: inventory top / deck bottom; decks grouped by format.
- Filters: Format, Set, Color, type/mana/rarity (**Unverified** full filter list beyond official deckbuilding page), search by name/rules text.
- Views: Versions (art/foil/promo), Display (images vs table), Quantity (incl. 0 to design wish decks).
- Add deck / import text or `.dek`; clipboard import; export text or `.dek`; server-side auto-save.
- Sideboard; Companion must be in sideboard; Commander pane drives color identity.
- Illegal/missing cards marked; same physical Digital Object can be assigned to multiple decks; Update with version(s) in collection.
- Mana curve / sample hands / settings gear.
- Trade binders + Wish List; Add Missing Cards to Wish List.
- Deck limit: Basic accounts 20 decks (FAQ); Full account limit **Unverified**.
- Draft logs can be saved to disk (Tips & Tricks).

### 7. Matchmaking, ratings, leagues structure

- **Leagues:** Asynchronous courses; play matches on your schedule until course complete (e.g., 5 constructed / 3 draft).
- **League matchmaking (official Tumblr, 2018 — still cited):** Matches on (1) course score = wins−losses, (2) wait time, (3) rematch bias. **Not** Elo, trophies, deck, or outside-course record. Tolerance widens over wait; rematches not absolute-banned.
- **Queues:** Fire on demand when min players reached (2 or 8 typical).
- **Scheduled:** Swiss + Top 8 (Challenges) or fixed rounds (Prelims, Phantom Trials); standings/tiebreakers in Event Details.
- **No public global ladder Elo** as primary constructed progression — QP / Leaderboard Points for Premier instead. (**Unverified:** whether any hidden rating exists.)
- **Open Play:** Free casual; Play Now / Quick Play / Format lobbies / Buddy Challenge.
- **Commander Brackets (2025+):** Honor-system notes + planned programmatic validation (Game Changers, MLD examples); beta/evolving.

### 8. Rules enforcement / game engine

- Full Comprehensive Rules digital adjudication (priority, stack, layers, etc.) — product differentiator vs casual webcam.
- **Phase stops:** Per-phase/step stops on your turn / opponent’s turn; lock/unlock Phase Bar; Yield Until Here; default common stops.
- **Priority hold:** Ctrl while casting/activating.
- **Shortcuts (official Tips & Tricks):** 1 pass/OK; 2 pass until can respond this turn; 6 yield through turn; 8 yield when no possible play; 5 clear auto-yields; 7 stack identical triggers; 3/4 yes/no; W auto-tap mana; Ctrl+Z undo mana; Q zoom; E face-down; Esc cancel. Many rebindable except Ctrl hold-priority.
- **Auto-yields:** Yield to effect EOT / always; Always yes/no; energy yields; combination sacrifice yields; etc.
- **Timers:** Per-player chess clock while holding priority; hit 0 → lose match; typical round caps ~50 minutes (match-dependent); Jumpstart 15 min/player; Pack Wars 20 min.
- **Disconnect/reconnect (community consensus — Unverified official timer text):** Disconnect announced; grace ~ remaining clock or ~10 min inactivity (whichever shorter); clock does not freeze; reconnect does not restore lost time. Daybreak not responsible for player connectivity (Premier rules).
- **Adjudication rights:** Daybreak may adjudicate any match/event result (EULA).

### 9. Spectator, replay, chat, friends, tournament software

- **Buddies / friends:** Home scene buddies; challenge, trade, chat (Full).
- **Ignore / block:** Client supports ignoring players (**Unverified** exact UI path from official pages fetched).
- **Chat:** Room/game chat; monitored/recorded per EULA §14; Basic accounts cannot chat.
- **Spectator:** Open Play / casual matches can be watched if host allows (**secondary**); competitive leagues/Challenges generally not live-spectatable (**secondary**).
- **Replay:** Feature exists and has returned with chat in periods (secondary / weekly blogs) — **verify current availability in client**.
- **Tournament software:** Event Details, standings, round timers, Top 8 brackets, DEC channel, invitation email workflows, QP/Leaderboard tracking, Showcase streaming requirements for invitees.
- **Streaming:** Encouraged with constraints (EULA §5); freely accessible; no competing games promo; streamer risk disclaimer.

### 10. Accessibility, performance, client tech

- **Platform:** Windows desktop only (min Windows 10, recommended Windows 11) — official system requirements on mtgo.com/home.
- **Specs (official):** Min 1 GHz / 8 GB RAM / 1 GB integrated / 1280×1024 / 16 GB disk / broadband Wi‑Fi; Recommended dual-core / 16 GB / 4 GB dedicated / 32 GB / wired.
- **Tech stack (secondary — Daybreak job postings + ClickOnce manifest):** C# / **WPF/XAML**; distributed via **Microsoft ClickOnce** (`MTGO.application` on Daybreak patch CDN). Historical long-lived ClickOnce client.
- **Accessibility:** Official first-class a11y (screen reader, WCAG) **not documented**. Community: limited NVDA utility; card symbols hard (secondary). Zoom (Q) and card size settings exist. Epilepsy / seizure warning in EULA.
- **Performance criticisms (secondary):** Large updates, lag/crashes, aging UI — persistent community complaint theme.

### 11. Anti-cheat / botting / ToS enforcement (high level)

- Prohibited: cheats, hacks, mods, macros, bots for unattended/impacted gameplay; protocol emulation; reverse engineering; unauthorized third-party programs; collusion; defect exploitation (EULA §12; Daybreak ToS §§7, 10).
- Client may collect hardware/profile/network data; monitor for unauthorized concurrent programs; auto-patch (EULA §14).
- Remedies: feature restriction, suspension, deactivation, forfeit Digital Objects; no refunds.
- Multi-accounting in Showcase/Qualifiers prohibited; one Scheduled Event entry per person; account sharing banned (Premier rules).
- Trading bots: legally gray vs “bots” language — **gameplay bots** clearly banned; **trade automation** historically tolerated in practice but **not formally authorized** in fetched official policy text.

### 12. Customer support / refunds / compensation patterns

- Help: help.mtgo.com (Submit a Request); feedback site for non-reimbursement bugs; Game Support for redemption issues.
- **Reimbursement (official mtgo.com/en/mtgo/reimbursement):** Event bug → may refund entry; League → nullify match or refund entry; ~48h processing; one reimbursement per event/course; Premier handled specially; **not** for player ISP/hardware, ToS suspensions, or unverifiable reports; fraud on reimbursement process → discipline.
- Store purchases: generally non-refundable (EULA); redemption requests non-refundable after May 23, 2023 policy note.
- Challenge min-prize guarantee: underpaid 2-loss finishers topped up in PP via CS within ~2 business days (Challenges page).
- Digital Event Coordinators for some Premier coverage issues.

### 13. Known product criticisms WotC may treat as non-negotiable / sensitive

*(Secondary + inferred from official legal posture — label carefully)*

1. **Digital ownership expectations vs license reality** — Players treat collections as property with cash value; EULA says limited license, revocable, no ownership; redemption is the historical bridge to paper. Any successor product that strips redeemability or “kills” collections without migration plan is politically explosive.
2. **Economy / liquidity** — Ticket + bot marketplace is the product; sudden RMT crackdowns or bot bans without a first-party marketplace would destroy liquidity.
3. **Eternal format completeness** — Legacy/Vintage/Pauper/Premodern/Cube depth is MTGO’s reason to exist vs Arena; cutting card pool or formats is existential.
4. **Rules fidelity / engine correctness** — Competitive players expect Comprehensive Rules correctness; shortcuts/timers are skill elements.
5. **Ladder / event integrity** — Multi-account, collusion, botting, bribery rules; Premier → RC/Pro Tour/Worlds path.
6. **Client modernity** — Aging WPF/ClickOnce Windows-only client; performance; lack of Mac/mobile — acquisition conversation almost certainly includes rewrite vs maintain.
7. **Support / bug compensation norms** — Entry refunds / league nullifies set expectations.
8. **Regional / legal prize eligibility** — Geofencing Scheduled Events and prize countries is now explicit.
9. **Commander as social digital product** — Multiplayer Commander + brackets is a growth surface Arena under-serves for true multiplayer EDH.

---

## B) Candidate MUST vs SHOULD/COULD

### MUST (platform / IP / rules / legal / economy integrity)

| Candidate MUST | Rationale |
|----------------|-----------|
| License-not-ownership digital object model + clear ToS | Core Hasbro/WotC/Daybreak legal posture; consumer-protection and bankruptcy/acquisition continuity |
| Ban off-platform RMT & account sales (or replace with regulated first-party cash-out) | Fraud, AML, tax, ToS consistency; if replaced, needs deliberate product redesign |
| Comprehensive Rules–faithful rules engine (priority, stack, layers, replacement effects) | Competitive legitimacy; differentiates from casual tools |
| Format legality sync with WotC B&R (timing policy) | Single IP owner control of competitive environment |
| Anti-cheat / no gameplay bots / no collusion / bribery rules | Event integrity feeding RC / Pro Tour / Worlds |
| Age gates + parental consent (COPPA-adjacent 13+) | Legal compliance |
| Regional prize/event eligibility controls | Sanctions, gambling-adjacent regulations, Premier Invite Policy |
| Persistent collection + in-client trade (or equivalent liquidity mechanism) | Without this, MTGO is not MTGO; Arena-like soft currency alone fails eternal players |
| Physical redemption **or** an explicit successor value-bridge | Historically unique MTGO value prop; ending it without migration is a trust crisis (even though EULA allows cancellation) |
| Premier path integrity (QP, invitations, identity verification) | Feeds tabletop organized play — WotC strategic asset |
| Disconnect/timer fairness model that cannot be trivially abused | Competitive fairness |
| Windows client availability with published min specs until multi-platform parity | Current installed base |

### SHOULD (strong product expectations)

| SHOULD | Rationale |
|--------|-----------|
| Keep eternal constructed suite: Modern, Legacy, Vintage, Pioneer, Pauper (+ Premodern/Duel Commander if population supports) | Core differentiator vs Arena |
| League + on-demand queue + weekly Challenge structures | Proven engagement pattern |
| Phantom Limited / Cube (esp. Vintage Cube) | High engagement, low inventory drain |
| Multiplayer Commander Open Play (+ bracket tooling) | Large casual segment |
| Shortcut/auto-yield/stop system depth | Power-user speed; paper-pro training tool |
| Ticket + Play Points dual currency (or careful successor) | Separates tradable value from play subsidy |
| Reimbursement/nullify patterns for vendor-side bugs | Trust / support load |
| Spectator/replay for coverage & learning | Content ecosystem / Showcase |
| Chat, buddies, ignore, trade UX | Social layer for eternal community |

### COULD (product choices / negotiable design)

| COULD | Rationale |
|-------|-----------|
| Exact league prize tables, QP thresholds, Showcase prize pools | Tunable economy knobs |
| Basic vs Full $5 gate details / starter kit composition | Acquisition funnel choice |
| Foil redemption discontinued posture | Already productized as cost adaptation |
| Which supplemental sets are non-redeemable | Per-SKU decision (MH3 precedent) |
| Trading-bot tolerance vs first-party marketplace | Strategic: regulate, replace, or continue gray market |
| Client rewrite (non-WPF), Mac/Linux, cloud streaming | Tech debt vs CAPEX |
| Full WCAG accessibility suite | Ethical/legal pressure growing; currently thin |
| Momir / Pack Wars / Jumpstart / Gauntlet mix | Flavored engagement modes |
| Honor-system Commander brackets vs hard validation | Design maturity |
| Constructed Gold SE queues replacing Prelims | Recent scheduling experiment |
| Treasure Chest EV design | Soft sink/faucet |

---

## C) Open questions / verify-with-running-client

1. **MoV acronym:** Assumed = **Momir Basic**. Confirm intent.
2. Exact **current redeemable set list / stock** (Store icons override schedule; page showed Secrets of Strixhaven OOS).
3. Complete **non-redeemable** catalog (UB, Masters, Horizons, remastered) for 2025–2026 releases.
4. Whether **Premodern** and **Duel Commander** have always-on **leagues** in Constructed lobby (Challenges confirmed official).
5. **Brawl** event presence beyond open play / UI mentions.
6. **Replay** feature current on/off state and whether chat included.
7. **Spectator** rules matrix (Open Play vs League vs Challenge vs Showcase).
8. Full **deck slot limits** for Full accounts; binder limits.
9. Official **disconnect grace** timer documentation (community ~10 min).
10. Whether any **hidden MMR/Elo** exists alongside QP.
11. Daybreak’s **current enforcement posture** on trading bots (CS statements vs lived practice).
12. **Accessibility** settings inventory (colorblind modes, font scaling beyond card zoom).
13. **Ignore/block** and report flows exact UI.
14. Payment methods / Store country list 2026.
15. ClickOnce vs any newer launcher migration status.
16. Whether **Two-Headed Giant**, **Oathbreaker**, or other niche formats appear in client.
17. Current **Account Safety FAQ** content (help.mtgo.com Cloudflare-blocked during research).

---

## D) Source list (URLs)

### Official — MTGO / Daybreak
- https://www.mtgo.com/home
- https://www.mtgo.com/getting-started
- https://www.mtgo.com/eula
- https://www.mtgo.com/redemption
- https://www.mtgo.com/news/mtgo-eofr-0302024 (end of foil redemption)
- https://www.mtgo.com/constructed-events
- https://www.mtgo.com/limited-events
- https://www.mtgo.com/premier-play
- https://www.mtgo.com/premier-play-prelims-and-format-challenges
- https://www.mtgo.com/getting-started/getting-started-path-to-pro-tour
- https://www.mtgo.com/getting-started/getting-started-tips-tricks
- https://www.mtgo.com/getting-started/getting-started-gameplay
- https://www.mtgo.com/getting-started/getting-started-deckbuilding
- https://www.mtgo.com/getting-started/getting-started-collect-trade
- https://www.mtgo.com/getting-started/getting-started-find-casual-games
- https://www.mtgo.com/getting-started/getting-started-multiplayer
- https://www.mtgo.com/news/commander-brackets-02112025
- https://www.mtgo.com/en/mtgo/reimbursement
- https://www.daybreakgames.com/terms-of-service?locale=en_US
- https://www.daybreakgames.com/privacy?locale=en_US
- https://help.mtgo.com/hc/en-us/articles/6046341084059-Magic-Online-Basic-Account-FAQ
- https://wizardsmtgo.tumblr.com/post/170597075169/league-matchmaking (official historical matchmaking explanation)
- MH3 non-redeemable note: https://www.daybreakgames.com/news/modern-horizons-3-on-mtgo-05302024

### Official — Wizards of the Coast
- https://magic.wizards.com/en/banned-restricted-list (incl. Magic Online B&R timing policy)
- https://magic.wizards.com/en/formats/commander
- https://magic.wizards.com/en/news/announcements/banned-and-restricted-february-9-2026

### Secondary (labeled; use cautiously)
- Cardhoarder beginner / economy guides: https://www.cardhoarder.com/mtgo-beginner-guide
- Cardhoarder bots help: https://help.cardhoarder.com/en/articles/8792589-our-automated-trading-bots
- Daybreak MTGO client job listings citing C#/WPF (client tech): gamejobs.co / remoteotter postings
- ClickOnce manifest: http://mtgo.patch.daybreakgames.com/patch/mtg/live/client/MTGO.application
- MTG Wiki Redemption overview: https://mtg.fandom.com/wiki/Redemption
- Community: r/MTGO, r/mtgoecon (disconnect timers, client complaints, PP economics) — anecdotal
- MTGGoldfish tournament pages (evidence of Premodern / Duel Commander leagues)

---

*End of research memo. Prefer re-verification against live client + latest Weekly Announcements blog before partnership materials are finalized.*
