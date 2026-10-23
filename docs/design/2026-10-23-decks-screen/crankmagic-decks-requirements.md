# CrankMagic Decks screen and New deck flow: requirements

**Status:** Ready for kickoff (Rob, 2026-10-23).
**Captures:** 1 and 2 (Rob's feedback, Friday 2026-10-23). Part A is the Decks screen, Part B the New deck flow, Part C one change to the deck page. Appendix A holds the deck write-ups.
**Read against:** `minorrob/mtg-deck-matrix` main @ `a031003` (2026-10-23 10:25 ET).
**Card words:** `docs/card-states.md` (Rob, 2026-10-18) is the definition. This doc uses its words on screen.

---

## 0. How to use this doc

- This is the instruction set for the Decks work. The system that picks it up turns it into a plan at kickoff and shows Rob the plan before building. There is no plan in here on purpose.
- Suggested order: Part C first (small, self-contained, and it fixes what Rob sees on every deck today), then Part A (the stage reader in §2 comes before the chips and the Box dialog), then Part B.
- Every requirement has an ID and a "Done when". New feedback adds rows and IDs. Nothing gets renumbered.
- The **From** column says where a line came from: **Rob** (his words or decision), **Filled in** (a gap closed so the doc stands alone) or **Proposed** (an addition Rob asked for ideas on; build only if he keeps it). Rob can overrule any Filled in or Proposed line.
- Open questions are in §16. Each has a default. If Rob hasn't answered one by kickoff, build the default and say so in the PR.
- Claude's own recommendations are in §17, all marked Proposed. Build one only if Rob keeps it.
- Repo rules apply: read `AGENTS.md` and `docs/ACTIVE.md` first. Part A is Codex · Workshop lane work. Parts B and C span Workshop and Claude · Deck intelligence (§19).

---

# Part A: Decks screen (capture 1)

---

## 1. Words: Rob's shorthand and the app's terms

Rob's feedback uses a few words that mean something else in the app. On screen, the app's words win.

| Rob said | App term | Means |
| --- | --- | --- |
| seat, slot | **seat** | One of the hundred: the commander(s) plus 99. |
| assigned | **on the list** | The seat has a committed card: the deck's own card (Final or Loading) or a Reserved card. |
| reserved (an owned card committed to this deck) | **Final** (in the box) or **Loading** (owned, not in the box yet) | The list's own card. Rob's "reserved" is not the app's Reserved. |
| substitute | **Substitute** | An owned stand-in holding a Reserved card's seat. Today a Substitute only exists once it is in the box (see Q1). |
| to buy, buy | **Reserved · To buy** or **Reserved · Ordered** | Committed to take a seat, not in hand. |
| other owned but used | **Reserved · in Dn** | The copy this deck wants is sitting in another deck's box. |
| boxed | **in the box** | Physically in the deck's box: Final + Substitute. |
| engine load = yes | **known at the table** | Play can play every card (`crankmagic-table.js`, readiness). |
| lock (in Box option 3) | **assigned as Final** | The copy becomes this deck's own card. It does not run Lock list on the deck. |

---

## 2. Deck stages (a new deck-level reading)

Today the chips read the Play status (To load, Loading, Playable) plus Boxed Decks and Complete. They get replaced by these:

| Stage | Test | From |
| --- | --- | --- |
| **Building** | Fewer than 100 seats on the list. Ownership doesn't matter. | Rob |
| **Defined** | All 100 seats on the list. To buy and Ordered cards count. | Rob |
| **Boxed** | The box holds the hundred: Final + Substitute = 100, all owned. | Rob |
| **Playable** | Defined, and Play knows every one of the 100. | Rob |

How they relate:

- Every deck you own is exactly one of **Building** or **Defined**.
- **Boxed** and **Playable** are both subsets of Defined. A deck can be both.
- **Shared** is not a stage. It says whose deck it is.
- The seat count is the same set Play reads: the commander(s) plus the main list (`deckForTable`). (Filled in)
- **One reader.** The model works out the stage (`deckStatus` in `collection-model.js` gains `stage: building | defined` and a `boxed` flag). The chips, the tile badge, the help text and the About page all read it. No screen works it out itself, the same rule `card-states.md` sets for card status. Playable needs the table's answer, so it is the model's Defined plus the table's check. (Filled in)
- Card-level words (Final, Loading, Substitute, Reserved, Upgrade, Bench) don't change, except possibly Q1.

---

## 3. Left nav, Decks section (NAV)

| ID | Requirement | Done when | From |
| --- | --- | --- | --- |
| NAV-1 | The Decks section lists, in this order: **My Decks**, **Favorites**, **Create**, **Shared**, **About Deck Building**. | Those five entries and nothing else sit under Decks. | Rob |
| NAV-2 | No deck names in the nav. | The deck links (up to 12 today) are gone. Opening a deck doesn't add or mark one. | Rob |
| NAV-3 | My Decks opens the Decks page on the All chip with Favorites off. | Clicking it from anywhere lands on `#decks`. | Filled in |
| NAV-4 | Favorites opens the Decks page filtered to favorites (FAV-4). | The entry shows as current while the filter is on. | Rob |
| NAV-5 | Create opens the New deck entry screen (NEW-1). | Same screen as the New deck button and `#new`. | Filled in |
| NAV-6 | Shared opens the Decks page on the Shared chip (FLT-6). | A shared deck still opens on its own page (`#shared?item=…`). | Filled in |
| NAV-7 | About Deck Building opens the renamed page (§8). | Old `#how` links still work. | Rob |
| NAV-8 | One place builds this nav. | Today `crankmagic-decks.js` builds the deck list and `crankmagic-sharing.js` wraps it to add My Decks and Shared Decks. After: one function owns all five entries. | Filled in |

---

## 4. Favorites (FAV)

| ID | Requirement | Done when | From |
| --- | --- | --- | --- |
| FAV-1 | A star button on every deck tile, in the hover tools next to ⋯. Left to right: select checkbox, star, ⋯. | Hovering any tile shows all three. | Rob |
| FAV-2 | Clicking the star toggles the favorite. Outline star = not a favorite, filled star = favorite. No confirm. | One click favorites, a second click unfavorites. | Rob |
| FAV-3 | A favorite's filled star stays visible without hover. | Favorites are visible at a glance across the grid. | Filled in |
| FAV-4 | The Favorites filter shows only favorited decks. It combines with the chips (Favorites + Boxed shows boxed favorites). | Page head reads Favorites. Empty state: "No favorites yet. Star a deck to see it here." | Rob (filter), Filled in (rest) |
| FAV-5 | Favorites are stored per person with the account, as a list of deck ids. | Favorites survive a reload and show on another device. Favoriting a shared deck doesn't touch the owner's deck. A deleted deck drops out of the list. | Filled in |
| FAV-6 | The star is a real button with `aria-pressed` and a label ("Favorite D1 Atraxa", "Unfavorite D1 Atraxa"). | Keyboard and screen reader can toggle it. | Filled in |
| FAV-7 | Bulk favorite is in Bulk actions (SEL-6). | | Rob |

---

## 5. Selection and Bulk actions (SEL)

| ID | Requirement | Done when | From |
| --- | --- | --- | --- |
| SEL-1 | The tile checkbox selects a deck for any bulk action, not only Compare. | Tooltip and label read "Select {deck}". | Rob |
| SEL-2 | The header button "Compare (n)" becomes **Bulk actions (n)**, a menu button left of New deck. | Disabled with nothing selected. Active from 1 selected. | Rob |
| SEL-3 | Menu items, in order: **Compare decks**, **Box deck(s)…**, **Add to group…**, **Favorite**, **Remove deck(s)…** | Labels follow the count ("Box deck…" for one, "Box decks…" for more). Rob's "Mark as boxed" and "Box Deck(s)" are this one item. | Rob (items), Filled in (labels) |
| SEL-4 | Compare decks is greyed below 2 selected, with the tooltip "Select at least two decks to compare." | Same comparison as today once 2+ are selected. | Rob |
| SEL-5 | Box deck(s) opens the Box dialog (§6). | Works with one deck selected. | Rob |
| SEL-6 | Favorite favorites every selected deck. When every selected deck is already a favorite, the item reads **Unfavorite**. | | Rob (Favorite), Filled in (Unfavorite) |
| SEL-7 | Add to group: see Q3. | | Rob |
| SEL-8 | Remove deck(s): a confirm naming the decks. What "remove" does: see Q4. | | Rob |
| SEL-9 | When the selection includes a deck shared with you, only Compare and Favorite apply. Box, Add to group and Remove are greyed with "You can only box, group or remove your own decks." | | Filled in |
| SEL-10 | Changing the chip or the Favorites filter clears the selection. After any action a notice says what happened and the selection clears. | No action ever applies to a deck you can't see. | Filled in |

---

## 6. Box decks (BOX)

**What boxing means.** Boxing records that owned cards are physically in the deck's box. A deck can be boxed bit by bit long before it reaches 100. Having 30 of 100 in the box while building is a normal state. Only owned, available cards are ever boxed. Unowned cards never are.

| ID | Requirement | Done when | From |
| --- | --- | --- | --- |
| BOX-1 | One dialog for every selected deck, and it works with one deck. No questions: one choice of what to box, then **Box**. | | Rob |
| BOX-2 | Three choices. Each includes the one before it. | See the choices table below. | Rob |
| BOX-3 | Each choice shows its count for each selected deck before the user presses Box. | Counts match the deck page and Ready to add. | Rob |
| BOX-4 | Choice 3 lists every deck that gives up a card, which cards, and what happens there (Q2 default: that seat goes back to Reserved · To buy). It shows any stage change (for example "D2: Boxed → Defined"). | Nothing leaves another deck without being named in the dialog. | Rob (release), Filled in (listing) |
| BOX-5 | Each move uses the same command Ready to add uses (`place`). | The change journal records each move. The deck page, the Library and Ready to add agree afterward. | Filled in |
| BOX-6 | Cards already in the box are left alone. A choice that adds nothing to any selected deck is greyed. | | Filled in |
| BOX-7 | When two selected decks want the same copy, it goes to the deck that comes first on the grid. The dialog says which deck keeps waiting. | No copy is boxed twice. | Filled in |
| BOX-8 | A result notice per deck: cards boxed, box total, stage now. | Example: "D1: 65 boxed · 65 in the box · Defined." | Filled in |
| BOX-9 | Boxing doesn't run Lock list and doesn't buy or order anything. | | Filled in |

**The three choices**

| # | Rob called it | On screen | What it boxes (app terms) |
| --- | --- | --- | --- |
| 1 | Box reserved | **The deck's own cards** | Its **Loading** cards: owned, the list's own, not in the box yet. They become Final, in the box. |
| 2 | Option 1 plus substitutes | **Own cards and substitutes** | Choice 1, plus owned stand-ins for seats still waiting on a Reserved card. They go in as Substitutes holding those seats. Where the stand-ins come from: Q1. |
| 3 | Option 2 plus other owned but used | **Own cards, substitutes and cards from other decks** | Choice 2, plus copies this deck has Reserved that sit in another deck's box. Each is released from that deck, assigned here as Final and boxed. |

**Worked example (Rob's)**

A deck with 100 seats on the list: 65 owned (10 of them substitutes) and 35 to buy (5 of those are copies in other decks).

| Choice | Cards boxed | Box total | Seats with nothing in the box |
| --- | --- | --- | --- |
| 1 | 55 | 55 | 45 |
| 2 | 65 | 65 | 35 |
| 3 | 70 | 70 | 30 (all To buy or Ordered) |

The deck stays **Defined** throughout, because all 100 seats are on the list. It becomes **Boxed** only when 100 are in the box. After choice 3, five seats in the donor decks go back to Reserved · To buy (Q2).

---

## 7. Filter chips (FLT)

| ID | Requirement | Done when | From |
| --- | --- | --- | --- |
| FLT-1 | Chips, in order: **All · Boxed · Defined · Building · Playable · Shared**. | Replaces All · To load · Loading · Playable · Boxed Decks · Complete. | Rob |
| FLT-2 | Each chip uses the definition in the table below. | Chip counts match the stage on each tile. | Rob |
| FLT-3 | Chips are tests, not exclusive buckets: a Boxed deck also shows under Defined (Q6). | | Filled in |
| FLT-4 | Playable shows only where Play is available, as today. Its test now also needs Defined. Today it only checks that the table knows the cards, at any count. | A 92-seat deck the table knows is not Playable. | Rob (definition), Filled in (availability) |
| FLT-5 | The tile badge is the stage word: Building, Defined or Boxed. The "Playable at the table" line on the tile stays. The To load, Loading and Complete badges retire. | | Filled in |
| FLT-6 | Shared shows decks other people shared with you, as tiles in the same grid with the owner's name. A toggle, **Include public decks**, is off by default (private shares only). | Needs the sharing API to say whether access is a private grant or public. Today `/shares` returns both mixed, with only the role. | Rob (toggle), Filled in (default, API) |
| FLT-7 | Sort and Show archived stay. Archived decks appear only with Show archived ticked. | | Filled in |
| FLT-8 | The address carries the view: `#decks?stage=boxed\|defined\|building\|playable\|shared`, plus `&fav=1` and `&public=1`. | Back undoes a chip and a link reopens the same view. Old values (`toload`, `loading`, `complete`) open All. | Filled in |
| FLT-9 | The Decks help text (the page's ? button) is rewritten to these definitions. | | Filled in |
| FLT-10 | Complete retires as a chip and badge. The model keeps computing it. | | Filled in |

**Chip definitions**

| Chip | Shows | From |
| --- | --- | --- |
| All | Every deck of yours (Q5). | Rob |
| Boxed | Box holds the hundred: 100 owned, Final + Substitute. | Rob |
| Defined | All 100 seats on the list (Final, Loading, Substitute-held seats, Reserved To buy or Ordered or in another box). | Rob |
| Building | Fewer than 100 seats on the list. | Rob |
| Playable | Defined, and the table knows every card. | Rob |
| Shared | Decks shared with you by other people. Include public decks toggle. | Rob |

---

## 8. About Deck Building (ABT)

| ID | Requirement | Done when | From |
| --- | --- | --- | --- |
| ABT-1 | Rename "How a deck comes together" to **About Deck Building** everywhere: nav, page title, the link on the Decks page and its empty state. | The old name appears nowhere on screen. | Rob |
| ABT-2 | New address `#about-deck-building`. `#how` still opens it. | | Filled in |
| ABT-3 | Rewrite the page to the app's current flow and words (outline below). | Every term on the page matches `card-states.md` and §2. | Rob |
| ABT-4 | The card status ladder reads its words from the model's vocabulary instead of a copy kept in the page. | Changing a label in the model changes the page. | Filled in |
| ABT-5 | Keep today's voice: few words, no game jargon, each step links to where it happens. | | Filled in |

**Outline for the rewrite**

1. **Start:** build one in the Lab, bring a list, or create one. Name it, set the bracket and budget.
2. **Building:** fill the seats. Test in the Lab and swap what underperforms.
3. **Defined:** all 100 seats are on the list. Lock list when it's right; that puts what's missing on the buy list.
4. **Acquire:** buy or order what's Reserved · To buy, inside the budget.
5. **Box:** put owned cards in the physical box, one by one in Ready to add or a whole deck at once with Box deck. Substitutes hold seats until the real cards arrive.
6. **Boxed and Playable:** Boxed when 100 are in the box. Playable when the table knows every card. Log your games.
7. **Deck stages:** Building, Defined, Boxed, Playable, with the §2 definitions.
8. **A card's status:** the ladder from `card-states.md` (Watch, To buy, Ordered, Own, Upgrade, Reserved, Loading, Substitute, Final), plus the Bench line.
9. **Across decks:** Bulk actions and Favorites, one line each.

---

# Part B: New deck flow (capture 2)

**Rob's goal:** a new deck starts as an empty shell and gets defined after that. For a Commander deck, the commander comes first, before any other card.

## 9. Deck shell and format (SHL, FMT)

| ID | Requirement | Done when | From |
| --- | --- | --- | --- |
| SHL-1 | Creating a deck creates a shell: the deck plus its own collection group, named after the deck. | Today's `createDeck` already makes that group. The new flow always uses it. | Rob |
| SHL-2 | A shell is valid with no commander and no cards. It is a fully undefined deck. | It saves, shows on Decks as Building with "Choose a commander" on its tile, and opens without errors. | Rob |
| SHL-3 | The shell is saved when Start from opens. Closing Start from without choosing keeps it. | Close at any point and the deck is still on the Decks page, under any name already typed. | Rob (keep), Filled in (when) |
| SHL-4 | Opening an undefined deck offers Start from again. | One click from its tile or its deck page reopens it. | Filled in |
| FMT-1 | Every deck has a format. Commander is the only one for now. | Existing decks read as Commander with no data lost. | Rob |
| FMT-2 | Each format's rules live in one registry entry: deck size, singleton or not, whether a commander is required, the color identity rule, the legality list. A new format is a new entry. | Nothing outside the registry asks "is this Commander". | Rob (goal), Filled in (shape) |
| FMT-3 | Commander: no other card can be added before a commander is assigned, from any door (Library, import, Lab, Merge in a Group). | Adding a card to a Commander deck with no commander is refused with "Choose a commander first" and a button that opens Start from. | Rob |
| FMT-4 | Future non-commander formats (60-card and others) skip the commander step and take cards right away. | Built later. The registry already carries the switch. | Rob |
| FMT-5 | No format picker on screen while Commander is the only format. | | Filled in |

## 10. Commander-driven recommendations (REC)

| ID | Requirement | Done when | From |
| --- | --- | --- | --- |
| REC-1 | Assigning a commander writes its key mechanics and capabilities into the deck's definition, marked as from the commander. | Gameplay and Mechanics open with them shown. | Rob |
| REC-2 | Recommendations come from the Explore graph model: synergies (`CrankGraph.relate`), chains (`CrankLoops`) and card relationships (`deck-synergies.js`), scored against the deck's definition. | Each recommended card can say which relation put it there. | Rob |
| REC-3 | No AI. Recommendations are computed in the app's own code and give the same answer every time for the same inputs. | No model call anywhere in this flow. | Rob |
| REC-4 | Assigning a commander never fills the 99. | After Start from, the deck holds its commander and nothing else. | Rob |
| REC-5 | Recommendations feed the build of the 99: Auto-create uses them, and Library scoped to the deck can sort by them when cards are added by hand. | | Rob (feed), Filled in (where) |
| REC-6 | They recompute when the commander or the definition changes. | | Filled in |

## 11. New deck entry screen (NEW)

| ID | Requirement | Done when | From |
| --- | --- | --- | --- |
| NEW-1 | Keep Decks › New deck as it is. | Rob listed Create, Import from a link, From a precon and Load. Today the screen also has Import (upload or paste) as its own path. It stays. | Rob (keep), Filled in (Import) |
| NEW-2 | Create opens Start from (§13). It replaces both today's "Create a deck from a commander" pop-up and the four-step Build wizard (Commander, Strategy, Budget, Review). | Neither old pop-up can be reached. | Rob |
| NEW-3 | Today's Create pop-up can also start a deck from the cards in a collection group. That road moves to Cards › Merge in a Group (CRD-3). | | Filled in |

## 12. The pop-up frame (DLG)

Start from and Define the Deck share one frame.

| ID | Requirement | Done when | From |
| --- | --- | --- | --- |
| DLG-1 | Compact and narrow: about 720px at most on desktop, full screen on a phone. | Nothing scrolls sideways at 390px. | Rob (compact), Filled in (sizes) |
| DLG-2 | A vertical nav on the left with one button per method or section, and a canvas on the right with that item's controls. On a phone the nav becomes a row across the top. | | Rob (layout), Filled in (phone) |
| DLG-3 | One primary button, bottom right. | | Rob |
| DLG-4 | No explanatory copy. Good design and clear choices carry it. A ? button appears only where an idea is distinct to CrankMagic or hard to read cold. | "Continue opens the commander picker. A collection group is made with the deck and named after it." and every line like it is gone. | Rob |

## 13. Start from (STF)

| ID | Requirement | Done when | From |
| --- | --- | --- | --- |
| STF-1 | Title "Start from". The deck name is one small field at the top. Left empty, it becomes "{commander} deck" once a commander is picked. | | Rob (field), Filled in (default) |
| STF-2 | The left nav holds four methods: **Pick a commander**, **Choose colors**, **Choose play style**, **Choose mechanics**. | | Rob |
| STF-3 | Every method ends the same way: one commander selected, then **Next** assigns it to the deck and opens Define the Deck. | Next is disabled until a commander is selected. The selection survives switching methods. | Rob (ending), Filled in (survives) |
| STF-4 | Pick a commander: a "Commander name" type-ahead. Matches update as the user types. Only commander-eligible cards appear. | Same eligibility rule as `commander-legality.js`. | Rob |
| STF-5 | Choose colors: the five color icons (W, U, B, R, G). One or any combination, then a dropdown of matching commanders to pick one from. | Matching rule: Q10. Colorless: Q11. | Rob |
| STF-6 | Choose play style: one or more play style characteristics, then a dropdown of matching commanders. | The list and its source: Q12. | Rob |
| STF-7 | Choose mechanics: one or more mechanics (proliferate, blink, aristocrats…), then matching commanders. | The list and its source: Q13. | Rob |
| STF-8 | Matching lists show owned commanders first, then by popularity (EDHREC rank), with the number that match. | | Filled in |
| STF-9 | A second commander when the first allows one (Partner, Partner with, Friends forever, Choose a Background, a Doctor and companion): Q14. | | Rob (open item) |
| STF-10 | Closing Start from keeps the shell (SHL-3). | | Rob |

## 14. Define the Deck (DEF)

| ID | Requirement | Done when | From |
| --- | --- | --- | --- |
| DEF-1 | Same frame as Start from. Title "Define the Deck". | | Rob |
| DEF-2 | Two choices at the top: **Define the deck** or **Leave undefined**. | | Rob |
| DEF-3 | Leave undefined makes **Create deck** active right away. It saves the deck with only its commander (two cards with a partner) and closes. | | Rob |
| DEF-4 | Define the deck shows four sections in the left nav, in this order: **General**, **Gameplay**, **Mechanics**, **Cards**. | | Rob |
| DEF-5 | Every field is optional unless Auto-create needs it (CRD-7). | Create deck is active as soon as a choice is made at the top. | Rob |
| DEF-6 | The final button reads **Create deck**. | | Rob |
| DEF-7 | Back returns to Start from with the commander still selected. Choosing a different commander recomputes what came from the commander (REC-1 and the filtered options) and keeps what the user typed in General. | | Filled in |

**Where a user can end up (Rob: every one of these is a valid outcome)**

| Path | Result |
| --- | --- |
| Close Start from | A shell: no commander, no cards. |
| Pick a commander, Leave undefined | A 1-card deck, undefined. |
| Define the deck, Cards › Define later | A 1-card deck, fully defined. |
| Define the deck, Auto-create, keep part of the review | A partly built deck. The rest is added later in Library. |
| Define the deck, Auto-create, keep it all | The full 100. |

### 14.1 General (GEN)

All optional (Rob).

| ID | Requirement | Done when | From |
| --- | --- | --- | --- |
| GEN-1 | Deck name: the same value as Start from's field. | | Rob |
| GEN-2 | Bracket, 1 to 5. Left empty, the model's default applies (today B2). | | Rob |
| GEN-3 | Card sources, three cumulative choices with the same compounding as Box (§6): **Bench only** · **Bench and cards to buy** · **Bench, cards to buy and cards in other decks**. | Auto-create and Merge in a Group draw only from what is chosen. | Rob |
| GEN-4 | Untouched, card sources reads Bench and cards to buy. | | Filled in |
| GEN-5 | Budget: the deck's total, in dollars. | | Rob |
| GEN-6 | Restrictions: what the deck must avoid. A few switches from the bracket rules (no mass land destruction, no chained extra turns, two-card infinites only as late finishers, the bracket's Game Changer cap) plus one free-text line. Today the definition keeps restrictions as free text only. | | Rob (restrictions), Filled in (placement, switches) |
| GEN-7 | **Always include** and **Never include**: two short card lists that Auto-create honors. | | Proposed |
| GEN-8 | **Use cards offered for Sell or Trade**, on or off. The model already has this (`reuse.includeSellTrade`, on by default). | | Proposed |
| GEN-9 | **Deck set** (S0, G1, TB5…), once Q3 is settled. | | Proposed |
| GEN-10 | Later: a maximum card cost, and a cost distribution set with a histogram and sliders across price brackets. The model already has a per-card cap (`perCardCap`). This flow doesn't show it yet. | | Rob (later) |

### 14.2 Gameplay (GPL)

| ID | Requirement | Done when | From |
| --- | --- | --- | --- |
| GPL-1 | Two parts: **Experience** and **Composition**. | | Rob |
| GPL-2 | Experience uses the measures players commonly use. The model already holds Saltiness, Speed and Competitiveness, 1 to 5 each. What Rob's "Experience" adds: Q15. | | Rob (measures), Filled in (fields) |
| GPL-3 | Composition uses the archetype names players know: Walls, Blink, Aristocrats, Tribal and the rest of the list (Q12). | | Rob |
| GPL-4 | Only options that fit the commander are offered. | A mono-red commander is never offered Blink if its colors can't support it. | Rob |
| GPL-5 | An option with sub-options (Tribal → Dragons, Angels…) lets the user pick one, or **Let CrankMagic choose**: the sub-option with the most cards around the commander's colors, the chosen mechanics and the other filters. Sub-options are filtered to the commander too. | | Rob |
| GPL-6 | One primary composition and one optional second (Q17). | | Filled in |

### 14.3 Mechanics (MEC)

| ID | Requirement | Done when | From |
| --- | --- | --- | --- |
| MEC-1 | Preferred mechanics, one or more (proliferate, trample, flying…). | | Rob |
| MEC-2 | The commander's own mechanics open preselected and marked as from the commander. The user can remove them. | | Filled in |
| MEC-3 | A chosen mechanic gets a noticeable, reinforced presence in the 99 but doesn't define the deck. Composition does that. Default bar: at least 8 cards that carry or reward it, until tested in use. | | Rob (rule), Filled in (number) |
| MEC-4 | A mechanic whose card pool is too thin after every filter (colors, bracket, card sources, budget, restrictions) is flagged, not blocked, and shows its count ("11 cards fit"). Default: flag below 16. | | Rob (flag), Filled in (number) |
| MEC-5 | The list comes from the same source as Start from's mechanics (Q13). | | Filled in |

### 14.4 Cards (CRD)

Rob's "Choose cards", renamed **Cards**, is the last section of Define the Deck.

| ID | Requirement | Done when | From |
| --- | --- | --- | --- |
| CRD-1 | Three choices: **Auto-create**, **Merge in a Group**, **Define later**. One per run. | | Rob (choices), Filled in (one per run) |
| CRD-2 | Define later adds no cards beyond the commander. | | Rob |
| CRD-3 | Merge in a Group: pick another collection group and its cards are assigned to this deck's group. The source group is left as it is. What merging does to the list: Q16. | Also covers today's "start from the cards in a collection group" road. | Rob (merge), Filled in (copy, road) |
| CRD-4 | Auto-create first asks how to weight the skeleton of the 99: **Balanced**, **Offense**, **Defense**, **Response**, **Value**, **Combo**. | The model's weightings (`data/composition-targets.json` playStyles) map as Balanced = Balanced, Offense = Aggressive, Response = Reactive, Value = Value engine, Combo = Combo. Defense is new. | Rob (first four), Filled in (Value and Combo exist already) |
| CRD-5 | If the definition isn't done, Auto-create sends the user to finish it, with the missing sections marked. | | Rob |
| CRD-6 | Required for Auto-create: a composition (Let CrankMagic choose counts). Everything else falls back to its default. At most 3 preferred mechanics, and only combinations whose pool can build a sound 99 (MEC-4's count applied to the combination). | | Rob (may require, restrict), Filled in (which, how many) |
| CRD-7 | The engine is the app's own deck builder and simulator (`deck-generator.js` and the simulator), fed the whole definition, the weighting and the recommendations (REC). No AI. | | Rob |
| CRD-8 | Every one of the 99 seats gets a slot definition: a role plus conditions (for example "ramp, 2-3 mana", "removal, instant speed", "payoff, Aristocrats", "proliferate"). A card fills a slot because it meets them. Slot definitions are saved with the deck so later swaps can use them. | | Rob (slot definition), Filled in (saved) |
| CRD-9 | Auto-create ends on a review screen before anything is saved. | | Rob |

**Review screen (RVW)**

| ID | Requirement | Done when | From |
| --- | --- | --- | --- |
| RVW-1 | The 99 minus basic lands as card thumbnails. Hover enlarges a card. | | Rob |
| RVW-2 | Clicking a card shows up to 5 alternatives that meet the same slot definition. Click one, press **Confirm**, and it replaces the card in that slot. | | Rob |
| RVW-3 | Batch: tick cards' checkboxes and press **Remove**. Their seats stay empty for the user to fill later in Library. | Keeping 50 and building the rest by hand works. | Rob |
| RVW-4 | Thumbnails grouped by slot role, with counts. A short summary bar: seats filled, lands, the To buy cost against the budget, cards by source (Bench, To buy, other decks), mechanic flags. | | Filled in |
| RVW-5 | The review is a larger screen than the pop-up. Its footer has **Back** (to the definition) and **Create deck**. | | Filled in |
| RVW-6 | On Create deck, each card enters by its source: a Bench copy as the deck's own card (Loading, not in the box), a card to buy as Reserved · To buy, a copy in another deck as Reserved · in Dn. Nothing is boxed or bought. The deck starts as a draft, as today. | | Filled in |
| RVW-7 | The Lab's "Draft the 99" preview stops being how a new deck starts. The Lab stays for testing decks. | | Filled in |

---

# Part C: Deck page, one change

## 15. Description and How to play (DPG)

**Rob's ask:** replace the text carried in from Excel on every deck in the backup with a short description and a step-by-step play guide. Today the backup builder writes each deck's Deck Reference row into `notes` (`tools/build-live-load.mjs`, `referenceText`), and the deck header prints all of it (`cm-deck-strategy`). That runs from 700 to 2,200 characters per deck. The new text for all 34 decks is in Appendix A.

| ID | Requirement | Done when | From |
| --- | --- | --- | --- |
| DPG-1 | The deck model gains two fields: `description` (300 characters at most) and `howToPlay` (4 to 6 steps, 150 characters each at most). `editDeck` accepts them and the model validates them. | A backup with the fields restores. One over the limits is refused with a plain message. | Rob (content), Filled in (fields) |
| DPG-2 | The deck header shows `description` where the notes paragraph sits today. | No deck header shows more than the description. | Rob |
| DPG-3 | Overview opens with **How to play**, a numbered list of the steps. | | Rob |
| DPG-4 | `notes` goes back to being the owner's own notes: shown only under "Your notes" in the Strategy dialog and in the edit form. | | Filled in |
| DPG-5 | A one-time **Apply deck write-ups** action (Settings › Data) reads `data/deck-writeups-2026-10-23.json`. It matches each entry to a deck by id (`deck:live:<ID>`), then by name starting with "<ID> ". It previews the matched and unmatched decks, then commits one `editDeck` per deck, recorded in the change journal so it can be undone. | All 34 decks match on Rob's restored library. Nothing changes before he confirms. | Filled in |
| DPG-6 | While applying, a deck's notes are cleared only if they still equal the Deck Reference text the backup wrote. Notes the owner has edited stay, and the preview lists them. | | Filled in |
| DPG-7 | `tools/build-live-load.mjs` stops writing the Deck Reference text into `notes`. It writes `description` and `howToPlay` from the write-ups file when the deck is in it. The reference row stays in `reference` as data. | A rebuilt backup shows the new text and no Excel prose. `tests/live-load.mjs` is updated to match. | Filled in |
| DPG-8 | The deck edit form gets **Description** and **How to play** fields (one step per line). | The owner can rewrite either one. | Filled in |
| DPG-9 | The write-ups file is Appendix B, the same content as Appendix A, keyed by the backup's deck ids. | 34 entries. A test checks that every card in each entry's `named` is in that deck's list. | Rob |

---

# Shared: questions, recommendations, references

## 16. Open questions

Defaults get built if Rob hasn't answered by kickoff. Q1 to Q3 change Part A the most. Q12, Q13 and Q16 change Part B the most.

| # | Question | Why it matters | Default |
| --- | --- | --- | --- |
| Q1 | **Where do substitutes come from before they're boxed?** In the app a Substitute only exists once it's in the box. Box choice 2 needs owned stand-ins already picked for seats that wait on a Reserved card. | Either the model gets a new card state or Box has to recommend cards. | Add **Substitute · Loading** to the model (a stand-in chosen for a seat, owned, not in the box yet), mirroring Final · Loading. Stand-ins get chosen on the deck page; Box choice 2 boxes them. This changes `card-states.md`, so Rob approves the wording. The alternative is for the dialog to propose stand-ins from the Bench at box time. |
| Q2 | **In Box choice 3, what happens to the seat in the deck that gives up the card?** | Decides the donor deck's stage after a move. | The donor deck keeps the card on its list. Its seat goes back to **Reserved · To buy**, so a Boxed donor drops to Defined and stays Defined. The alternative is to empty the seat, which drops the donor to Building. |
| Q3 | **What is the group in "Add to group"?** The app's groups today are card collections, one per deck. Your workbook's are deck sets (Series S0, Group G0, TB, CJ, HJ). | Card groups exist already. Deck sets would be a new object. | Deck sets: a named set (S0, G1, TB5…), pick one or create one, and a deck can be in more than one. The set shows as a tag on the tile. Filtering by set waits for a later capture. |
| Q4 | **Does Remove archive or delete?** | Archive keeps history and can be undone. Delete can't. | A confirm with **Archive** as the main button and **Delete permanently** as a second, red button. |
| Q5 | **Does All include decks shared with you?** | My Decks and All would differ if it did. | No. All is your own decks. Shared decks live under the Shared chip. |
| Q6 | **Do chips overlap or not?** Boxed decks also meet Defined. | Overlap shows a deck under several chips. Exclusive needs "Defined, not boxed" wording. | Overlap, matching your definitions. Each tile's badge shows its furthest stage. |
| Q7 | **Does Defined need Lock list?** Today a deck reads To load until its list is locked. | A draft with 100 seats would or wouldn't count. | No. The seat count decides. "Locked" stays a tag on the tile. |
| Q8 | **Include public decks: on or off by default?** | | Off: private shares only. The choice is remembered per person. |
| Q9 | **Where do Shared Libraries go?** Today they sit beside Shared Decks on the `#shared` page, which these chips replace. | Without a home they become unreachable. | Under the Library nav as **Shared Libraries**. |
| Q10 | **Color matching: exact color identity, or commanders that include the selected colors?** (Rob) | W + U exact gives Azorius commanders only. "Includes" also gives Esper, Bant and five-color ones. | Exact identity, with an **Include more colors** toggle that widens it to commanders containing the picked colors. |
| Q11 | **How are colorless commanders reached from the color picker?** (Rob) | | A sixth icon, **C**, that can't be combined with the five. |
| Q12 | **What is the play style list, and where does it come from?** (Rob) Start from's play style and Gameplay's Composition read like the same idea. | Two lists would drift apart. | One list for both: the app's strategy vocabulary (16 strategies already mapped to 2,746 commanders in `data/commander-strategies.json`) shown under community names (sacrifice supply and death payoff → Aristocrats, blink loop and enter-the-battlefield payoff → Blink, tribal payoff → Tribal, counters → +1/+1 counters, spellslinger, landfall, recursion loop → Reanimator), plus the archetypes it lacks (Walls and Defenders, Voltron, Superfriends, Go wide), which the classifier then learns. |
| Q13 | **Mechanics options: from the graph model, or a curated list?** (Rob) | The graph holds 817 mechanic terms. Most sit on a handful of cards. | The graph's mechanics and roles, kept to terms on at least 50 cards (about 63, plus roles such as blink and sacrifice outlet), with display names cleaned up by a short alias list. The same list serves Start from and the Mechanics section. |
| Q14 | **Partner and Background pairs: how is a second commander assigned?** (Rob) | | When the chosen commander allows a second one, a **Second commander** slot appears under the selection with its own type-ahead, limited to legal pairs (`commander-legality.js`). Optional. Next works with one. |
| Q15 | **What does "Experience" mean in Gameplay?** | The model has Saltiness, Speed and Competitiveness. "Experience" isn't one of them. | How hard the deck is to pilot: Beginner, Intermediate or Advanced (the tiers the deck guides already use), added beside the other three. |
| Q16 | **Does Merge in a Group put the group's cards on the list, or only file them as candidates?** | Rob called it "Assign Cards". On the list fills seats. Candidates fill none. | On the list, within General's card sources. Cards outside the commander's colors, or past the hundred, are listed and left out. |
| Q17 | **One composition or several?** | Composition defines the deck. Several dilute it. | One primary and one optional second. |

---

## 17. Claude's recommendations (PRO)

Rob asked what else I'd change in these areas. Each one is a single call, ranked by how much it helps. All are **Proposed**: build one only if Rob keeps it.

| ID | Change | Why |
| --- | --- | --- |
| PRO-1 | **Show the stage on the tile as two numbers.** The bar and caption become "86 on the list · 64 in the box", with the stage word as the badge. Today's caption ("4 to buy · 2 ordered · 3 loading · 1 in another box · 5 subs") goes. | The stages are counts of the hundred, so the tile can show the two counts that decide them. A reader gets Building, Defined and Boxed without help text. |
| PRO-2 | **Counts on the chips** ("Boxed 7 · Defined 27 · Building 0"). | The chips answer "how many decks are where" before anyone clicks. |
| PRO-3 | **Group by set** on the Decks page, once Q3 lands: a Sort choice that puts the grid under set headers (Live, S1, S2, G0, G1, Crown Jewels, Hidden Gems). | 34 tiles in one grid is a long scroll, and the sets are how the decks are thought about. |
| PRO-4 | **Undo on every bulk result.** The notice after Box, Favorite, Add to group or Remove carries Undo, through the change journal. | Box and Remove move many cards at once. Undo makes that safe to try. |
| PRO-5 | **Single-deck actions on the ⋯ menu too.** The tile and deck page menus get Box deck…, Favorite and Add to group…, opening the same dialogs. | Boxing one deck shouldn't need its checkbox ticked first. |
| PRO-6 | **Swap To buy for owned** on the Auto-create review: one button that replaces each To buy card with its best owned alternative for the same slot, where one exists. | It's how these decks get built (owned first, buy little), and the slot definitions (CRD-8) make it a one-click job. |
| PRO-7 | **A commander preview on Start from.** Once a commander is selected, the canvas shows its card image, color pips and whether it's owned. | The image confirms the choice, so no copy is needed. |
| PRO-8 | **Owned commanders as the empty state** of Pick a commander: the commanders you own that lead no deck yet. | The most likely next deck is one you already have the commander for. |
| PRO-9 | **A pool meter in the Define the Deck footer:** how many cards fit the definition and card sources so far. | It explains MEC-4's flags and Auto-create's limits without a sentence of copy. |
| PRO-10 | **Every ? in the Decks section links to its part of About Deck Building** instead of opening a paragraph in a modal. | One place to explain, kept current (ABT-4). |

---

## 18. Not in this capture

- The execution plan (made at kickoff).
- The rest of the deck page work (§15 is one change only).
- Select all, or select everything on a chip.
- Filtering by group (until Q3 is settled).
- Any card-state change other than Q1.
- A maximum card cost and the cost distribution histogram (GEN-10).
- Non-commander formats (FMT-4).

---

## 19. Where this lands in the code (context for kickoff)

Line numbers drift. These are where things sat on `a031003`.

| File | What's there now |
| --- | --- |
| `crankmagic-decks.js` | The Decks subnav (near line 10), help text (near 15), the Compare button (near 185), the chips `STAGES` and `stageOf` (near 218-224), the tile and its hover tools (near 266), the ⋯ menu `deck-menu` (near 1020). |
| `crankmagic-sharing.js` | Wraps the Decks subnav to add My Decks and Shared Decks. `views.shared` draws the Shared Decks and Shared Libraries lists. |
| `cloud/sharing.mjs` | `/shares` returns public and granted items together and says only the role. |
| `collection-model.js` | `deckStatus` (near 338) is where the stage belongs. `cardState` (near 75) is the card status reader. |
| `crankmagic-table.js` | `C.play.tiles` and `readiness` check that the table knows each card. Play lane file: read it, don't edit it. |
| `crankmagic-pull.js` | Ready to add, the one-card-at-a-time boxing that uses `place`. |
| `crankmagic-how.js` | The About page today, with `STEPS` and `LADDER` written into the page. |
| `docs/card-states.md`, `tests/card-states.mjs` | The card status definition and the test that holds code to it. Both change if Q1's default is taken. |
| `crankmagic-decks.js` (Part B) | `actions['new-deck']` the entry screen (near 614), `actions['wizard-create']` the Create pop-up with the copy to remove (near 788), `commanderDeck` and `groupDeck` (near 572-600). |
| `crankmagic-build.js` | The four-step Build wizard (Commander, Strategy, Budget, Review) that NEW-2 replaces. |
| `crankmagic-app.js` | `cardPicker` (near 402): today's commander type-ahead. |
| `collection-model.js` (Part B, C) | `createDeck` (near 689) already makes the deck's own group. `defaultDefinition` (near 492) holds bracket, budget, perCardCap, mechanics, playStyle, speed, competitiveness, saltiness, restrictions and reuse. |
| `commander-legality.js` | Commander eligibility and every legal pair (Partner, Partner with, Friends forever, Background, Doctor). |
| `data/commander-strategies.json`, `crankmagic-strategies.js` | The 16-strategy vocabulary and each of 2,746 commanders' strategies (Q12). |
| `data/graph.json` facets | 817 mechanic terms, 304 tribes, 21 roles (Q13, GPL-5). |
| `data/composition-targets.json` | Role ranges by bracket and the play style weightings (CRD-4). |
| `deck-generator.js`, `deck-synergies.js`, `crankmagic-graph.js`, `crankmagic-loops.js` | The builder, the synergy pairs and chains, the graph's `relate`, the loop finder (REC, CRD-7). |
| `crankmagic-decks.js` (Part C) | The deck header's notes paragraph `cm-deck-strategy` (near 356), the Strategy dialog's "Your notes" (near 334), the edit form's Deck notes (near 911). |
| `tools/build-live-load.mjs` | `referenceText` and `importMasterTable` write the Deck Reference into `notes` (DPG-7). |

**Lanes:**
- Parts A and C screens, and Part B's dialogs, are Codex · Workshop (`codex/workshop-<topic>`).
- REC, slot definitions (CRD-8) and Auto-create's engine work are Claude · Deck intelligence (`claude/deck-<topic>`), as are `tools/build-live-load.mjs` and the write-ups data file.
- `crankmagic-table.js` is Codex · Play: read it, don't edit it.
- Check `docs/ACTIVE.md` for who holds each lane.

---

## 20. Feedback log

| Date | Capture | Covered |
| --- | --- | --- |
| 2026-10-23 | 1 | Left nav, Favorites, Selection and Bulk actions, Box decks, filter chips and deck stages, About Deck Building. |
| 2026-10-23 | 2 | New deck flow: deck shell and format, commander-driven recommendations, Start from, Define the Deck (General, Gameplay, Mechanics, Cards), Auto-create review. Rob's correction the same day: Cards sits inside Define the Deck, after General, Gameplay and Mechanics, and the final button reads Create deck. |
| 2026-10-23 | 2 | Deck page: description and How to play for the 34 backup decks (Appendix A). Claude's recommendations (§17). |
---

# Appendix A: Deck write-ups

The description and How to play for each of the 34 decks in the backup (DPG-9). Each was written from the deck's own list, then checked by a second reader against every card's full rules text. Appendix B is the same content as the data file.

## Live decks

### D1 Atraxa

Atraxa superfriends built on the Jace token: Way enchantments and empower spells stack loyalty on Jace, then Atraxa and Inexorable Tide proliferate every walker, twice with Tekuthal. It wins with Jace, Reality Sculptor's library exile, walker ultimates, or Elspeth's army.

1. Keep three lands and a mana rock like Arcane Signet or Chromatic Lantern.
2. Make the Jace token early with a Way enchantment or Theorist's Proxy, then add a walker every turn.
3. Cast Atraxa once two walkers are out: she proliferates them all at your end step, and Tekuthal makes it twice.
4. Use Oath of Teferi and Carth the Lion to get more from each walker, and hold Dovin's Veto or Countersculpt for removal aimed at your walkers.
5. Guard walkers with Elspeth and Grist tokens and The Wandering Emperor; Farewell or Promise of Loyalty resets a board that turns on you.
6. Close with Jace, Reality Sculptor's 0 at 25 Jace loyalty, or an ultimate from Vraska, Relic Seeker or Teferi, Hero of Dominaria.

### D2 Chulane

Chulane draws a card and lets you drop a land from hand each time you cast a creature, and cheap self-bouncers like Shrieking Drake and Kor Skyfisher keep that going. It wins by filling the board and swinging with Moonshaker Cavalry, with Emrakul, the Exigent Doom as a late threat.

1. Keep three lands and early mana like Llanowar Elves, Avacyn's Pilgrim or Sol Ring so Chulane comes down on turn three or four.
2. Ramp with Wood Elves, Farhaven Elf and Coiling Oracle, and hold your cheap creatures until Chulane is out so every cast draws.
3. Recast Shrieking Drake and Kor Skyfisher off their own bounce: each cast draws, drops a land from hand, and draws again with Beast Whisperer.
4. Add Seedborn Muse so Chulane's bounce and Roon work every turn, and reuse Reflector Mage and Man-o'-War with Ephemerate or Restoration Angel.
5. Hold Counterspell or Negate for wipes, cover Chulane with Teyo or Vigorbloom Charm, and cast Sunfall with Eerie Interlude ready to save your side.
6. Swing with Moonshaker Cavalry's flying team pump; late, Freed from the Real on Faeburrow Elder makes endless mana for Temur Sabertooth recasts.

### D3 Ezuri

Ezuri gives you an experience counter each time a creature you control with power 2 or less enters, then at combat on your turn puts that many +1/+1 counters on another creature. Branching Evolution doubles them, and the deck wins with a big trampler, Leyline Axe double strike, or Simic Ascendancy.

1. Keep three lands and a cheap creature like Noxious Newt or Great Forest Druid; a Leyline Axe in your opening hand starts on the battlefield.
2. Cast Ezuri early, since only creatures that enter after it count, then follow with Sylvan Ranger, Wood Elves, Satyr Wayfinder and Dream Stalker.
3. Play Branching Evolution or level Innkeeper's Talent to 3 to double counters, and aim Ezuri at Fathom Mage to draw a card per counter.
4. Protect the big creature with Tamiyo's Safekeeping or Blossoming Defense, and hold Essence Scatter or Refute; experience counters survive wipes.
5. Close with one giant attacker: Ghalta the Unstoppable or Leyline Axe gives it trample, and Elvenking's Harper can make it unblockable.
6. Or race Simic Ascendancy to 20 growth counters; once Germination Practicum resolves, its free copy on each of your turns adds counters to the team.

### D4 Felothar

Felothar lets walls attack and deal combat damage equal to their toughness, so defenders like Axebane Guardian and Overgrown Battlement are your mana and your army. It wins with wall attacks, Blight Pile drains, or Tree of Perdition attacking after it swaps toughness with an opponent's life.

1. Keep three lands with Sylvan Caryatid, Overgrown Battlement or Sol Ring, since the walls are also your ramp.
2. Play a defender every turn: Carven Caryatid draws a card, and Axebane Guardian and Overgrown Battlement tap for a mana per defender.
3. Cast Felothar so walls attack for their toughness, then pay 3 and tap it to sacrifice a 0-power wall like Wall of Mulch and draw its toughness.
4. Add Drumbellower to untap your creatures on each opponent's turn, so Felothar, Blight Pile and the mana walls work every turn.
5. Hold Flawless Maneuver, free while Felothar is out, or Heroic Intervention; Fell the Mighty on a 0-power wall spares Felothar and every 0-power wall.
6. Swing and drain with Blight Pile; late, Umbral Mantle on Axebane Guardian with four or more defenders makes endless mana for Assault Formation pumps.

### D5 Teysa Karlov

Teysa Karlov makes your death triggers fire twice, so sacrificing creatures to Viscera Seer drains each opponent twice through Zulaport Cutthroat and Bastion of Remembrance. It grinds with tokens and recursion, then wins with a big Bolas's Citadel or Living Death turn.

1. Keep three lands with a sacrifice outlet like Viscera Seer and a cheap rock like Sol Ring or Arcane Signet.
2. Set up with Zulaport Cutthroat, Cruel Celebrant and Skullclamp, which draws two when the equipped creature dies and four once Teysa is out.
3. Cast Teysa, then feed tokens from Woe Strider, Staff of the Storyteller and Requiem Angel into Viscera Seer: each death drains twice.
4. Bring creatures back with Reveillark, Karmic Guide and Sun Titan; Reveillark dying under Teysa returns up to four power 2 or less creatures.
5. Keep Teysa alive with Selfless Spirit, Teyo or Grand Crescendo, and answer threats with Path to Exile, Despark or Ruthless Lawbringer.
6. Close with Bolas's Citadel's ten-permanent sacrifice, Living Death or Rally the Ancestors, while Archfiend of Despair doubles each opponent's loss.

### D6 Krenko

Krenko, Mob Boss doubles your Goblins each time he taps, and Goblin Warchief gives him haste so he can tap the turn he lands. Impact Tremors and Purphoros turn every new token into damage, and Eldrazi Monument sends the horde in flying.

1. Keep three or four lands, a rock like Sol Ring or Arcane Signet, and a cheap Goblin such as Goblin Instigator or Skirk Prospector.
2. Go wide early with Mogg War Marshal and Legion Warboss, and equip Skullclamp to 1/1 tokens: each one dies and draws you two cards.
3. Cast Krenko, Mob Boss with haste from Goblin Warchief, Samut or Lightning Greaves and tap him at once; Thousand-Year Elixir untaps him to go again.
4. Get Impact Tremors, Purphoros or Witty Roastmaster out before a big Mob Boss turn so every token that enters damages each opponent.
5. Shield Mob Boss with Swiftfoot Boots or Goblin Chirurgeon, redirect removal with Ricochet Trap, and stop blue spells with Red Elemental Blast.
6. Win with a wide attack under Eldrazi Monument or Shared Animosity; late, Thornbite Staff on Mob Boss plus Skirk Prospector makes endless Goblins.

### D7 Queza

Queza, Augur of Agonies makes a target opponent lose 1 life every time you draw, and Vito or Sanguine Bond turns the life you gain into more loss. Counterspells like Absorb answer whatever is aimed at you, and Approach of the Second Sun closes the game.

1. Keep three lands with a blue source, a rock like Arcane Signet or Talisman of Hierarchy, and a cheap counter such as Counterspell or Mana Leak.
2. Play Blood Artist, Vito or Nyx-Fleece Ram early, then pass with mana up and cast Brainstorm at an end step if nothing needs countering.
3. Cast Queza by turn four and point each draw at whoever is pressuring you; Vito or Sanguine Bond adds a point for the life Queza gains.
4. Counter removal aimed at your board with Rebuff the Wicked or Absorb, and let Vito make that caster lose the 3 life Absorb gains you.
5. If a board turns on you, cast Supreme Verdict: Blood Artist drains for every death, then flash in Liliana's Standard Bearer to draw for yours.
6. Cast Approach of the Second Sun, then redraw it and cast it from hand to win; late, Niv-Mizzet, Ghost Counsel turns each Queza life gain into a draw.

## Series 1

### S1-D1 Roon

Roon blinks a creature every turn, so creatures that do something when they enter, like Reflector Mage and Cloudblazer, keep paying out. Seedborn Muse lets Roon blink on every opponent's turn too, and Eldrazi Monument turns the board into a flying, indestructible army.

1. Keep three lands plus Sol Ring, Arcane Signet or a mana creature like Great Forest Druid.
2. Play cheap creatures like Charming Prince, Coiling Oracle and Fblthp early; Mentor of the Meek draws for {1} each, Welcoming Vampire once a turn.
3. Cast Roon, then pay {2} and tap it each turn to blink Reflector Mage, Man-o'-War or Cloudblazer; the creature returns at the next end step.
4. Add Seedborn Muse to blink with Roon on every opponent's turn, Soulherder to blink one at your end step, and Sun Titan to bring back cheap permanents.
5. Answer threats with Swords to Plowshares or Deputy of Detention, and hold Ephemerate, Teyo or Memory Lapse to protect Roon and your best creature.
6. Close with Eldrazi Monument for a flying swing, feeding it a creature on your upkeep, or Serra's Emissary choosing creature so nothing can block.

### S1-D2 Freyalise

Freyalise makes a mana Elf with each +2, and Elves and land ramp carry the deck into big counter turns. Branching Evolution doubles the counters from Germination Practicum and Canopy Gargantuan, then Ghalta the Unstoppable gives the grown team trample.

1. Keep three lands and a cheap mana creature like Llanowar Elves, Great Forest Druid or Sylvan Caryatid.
2. Ramp with Nature's Lore, Wood Elves and Farhaven Elf, then cast Freyalise and +2 each turn for a 1/1 Elf that taps for {G}.
3. Put Skullclamp on a 1/1 Elf token to draw two cards when it dies, and refill with Harmonize or Shamanic Revelation once the board is wide.
4. Get Branching Evolution out or level Innkeeper's Talent to three, then cast Germination Practicum; a free copy follows on each of your turns.
5. Answer threats with Beast Within, Troll Negotiations or Freyalise's -2, and hold Inspiring Call to make creatures with counters indestructible.
6. Cast Ghalta the Unstoppable cheaply off your biggest creature for team trample; Omnipresence frees spells with mana value up to your creature count.

### S1-D3 Quintorius

At your end step, Quintorius, Loremaster exiles a noncreature, nonland card from your graveyard for a 3/2 Spirit; sacrificing a Spirit lets you cast one of those cards free. Garrison Excavator and Quintorius, Field Historian add Spirits, and Hofri Ghostforge or Moonshaker Cavalry make them lethal.

1. Keep three lands with a discard-and-draw spell like Faithless Looting or Thrill of Possibility, or an early Sol Ring.
2. Play Relic Retriever or Containment Construct early, then discard extras to Cathartic Reunion and Big Score to stock the graveyard with spells.
3. Cast Quintorius, Loremaster so your end step exiles a spell for a 3/2 Spirit; Garrison Excavator adds a 2/2 Spirit when cards leave your graveyard.
4. Pay {1}{R}{W}, tap Loremaster and sacrifice a Spirit to cast an exiled spell free; Quintorius Kand then deals 2 to each opponent and gains you 2.
5. Answer threats with Swords to Plowshares, Path to Exile or Skyclave Apparition, and flash in Guardian of Faith when a wipe is coming.
6. Pump Spirits with Hofri Ghostforge, Intangible Virtue or Balefire Liege, then cast Moonshaker Cavalry or use History Chaser's -4 and attack.

### S1-D4 Nissa

Nissa draws a card for each land that enters under your control, and her first landfall each turn puts the next creature in your library onto the battlefield. Ramp into her, then let landfall, Mass Polymorph and Proteus Staff pull monsters like Emrakul and Zetalpa off the top.

1. Keep three lands and a mana rock like Arcane Signet, Mind Stone or Talisman of Progress, since Nissa costs seven.
2. Hit every land drop with Thrór's Map, Pilgrim's Eye and Troop of Ponies, and add Chromatic Lantern to fix all four colors.
3. Cast Nissa and play a land each turn: you draw a card, and the first landfall each turn puts your next creature onto the battlefield.
4. Crack Evolving Wilds or Contaminated Landscape on an opponent's turn for another free creature; Sword of the Animist adds a land on each attack.
5. Give Nissa Swiftfoot Boots, hold Negate or Delay for removal aimed at her, and answer threats with Despark, Mortify or Cast Out.
6. Aim Proteus Staff or Jace, Multiverse Architect's -3 at Bitterthorn's Germ token to dig out a monster, then attack with Emrakul or Zetalpa.

### S1-D5 Shadrix Silverquill

At the start of your combat, Shadrix Silverquill can put a +1/+1 counter on each of your creatures while an opponent gets a card or an Inkling. Flying token makers go wide, Cathars' Crusade grows them, and Teysa Karlov doubles Zulaport Cutthroat and Bastion of Remembrance drains as tokens die.

1. Keep three lands with Sol Ring, Arcane Signet or Mind Stone and an early token maker like Raise the Alarm or Lingering Souls.
2. Go wide early with Lingering Souls, Hop to It and Skrelv's Hive, and draw off the tokens with Welcoming Vampire or Tocasia's Welcome.
3. Cast Shadrix and at the start of your combat take the counters while an opponent gets the card or an Inkling; Kambal copies that Inkling for you.
4. Add Cathars' Crusade so every new token grows the team, and Teysa Karlov so Zulaport Cutthroat and Bastion of Remembrance drain twice per death.
5. Remove threats with Swords to Plowshares, Vindicate or Anguished Unmaking, and cast Grand Crescendo in response to a wipe.
6. Close with a flying swing pumped by An Unexpected Party choosing Spirit, or Elspeth, Sun's Champion's emblem for +2/+2 and flying.

### S1-D6 Ashling

Ashling discards a card to draw one, then transforms into Rimebound for two mana on each of your turns, spent on spells with mana value 4 or more. That pays for token bursts like Goblin Rally, which Impact Tremors and Purphoros, God of the Forge turn into damage to each opponent.

1. Keep three lands with both colors and a cheap play like Brainstorm, Faithless Looting or Flamebraider.
2. Cast Ashling on turn two to discard and draw, then pay {U} as next turn's first main phase starts to transform her for two mana toward a four-drop.
3. Leave her as Rimebound for two extra mana on each of your turns, or pay {R} to transform back and discard and draw again when you need a card.
4. Set up Impact Tremors, Purphoros or Witty Roastmaster, then cast Goblin Rally, Hordeling Outburst or Siege-Gang Commander to hit every opponent.
5. Hold Counterspell, Mana Leak or Negate to protect the engine, and clear threats with Fulminous Forte or Chaos Warp.
6. Finish with a big Tempt with Vengeance or Massive Raid, and Warstorm Surge so each new creature deals damage equal to its power.

## Series 2

### S2-D1 Tam

Tam, the Possibility runs five-color superfriends, making walkers cheaper and proliferating once per walker type. Way enchantments grow the Jace token, Tekuthal doubles every proliferate, and Jace, Reality Sculptor's library exile or Emrakul, the Exigent Doom wins the game.

1. Keep three lands and a fixer like Great Forest Druid or Chromatic Lantern, since Tam's proliferate ability costs all five colors.
2. Start the Jace token early with Way of the Pyromancer, Theorist's Proxy or Mindseeker Oculus, then cast Tam on turn three.
3. Add a walker each turn at Tam's discount; Kasmina gives them all +2: Scry 1, and Tam's tap proliferates once per walker type.
4. Cast Tekuthal so every proliferate happens twice, and fill the gaps with Contagion Clasp, Throne of Geth and Steady Progress.
5. Hold Countersculpt, Negate or Fuel for the Cause for wipes, flash in Teyo to shield a walker, and reset a bad board with Tragic Arrogance.
6. Win with Jace, Reality Sculptor's 0 at 25 Jace loyalty; Jace's Machinations adds eight and lets you fire it at instant speed, or cast Emrakul.

### S2-D2 Thorin Oakenshield

Thorin Oakenshield leads a go-wide Dwarf company, and once you control three artifacts, legends or Sagas, his enduring story gives your creatures and artifacts ward {1}. It wins with one big swing behind Shared Animosity, Windcrag Siege and Bayek of Siwa's double strike.

1. Keep three lands and a cheap artifact like Sol Ring, Arcane Signet or Tome of Legends.
2. Cast Thorin on turn two, then add Dáin, Óin or Arbaaz Mir to reach three artifacts and legends, turning on his ward {1} for your team.
3. Go wide with At the Door and Dwarven Shortsword, then cast An Unexpected Party from exile naming Dwarf for +2/+2.
4. Draw off small creatures with Welcoming Vampire and Mentor of the Meek, and off legendary spells with Venat, Heart of Hydaelyn.
5. Save Selfless Spirit for wipes and Bofur's Concerted Care for spot removal; Hofri Ghostforge turns fallen nontoken creatures into hasty Spirit copies.
6. Close with Windcrag Siege on Mardu so Shared Animosity triggers twice per attacker, and Bayek of Siwa giving your other legends double strike.

### S2-D3 Tidus

Tidus, Yuna's Guardian moves a counter onto a flier like Thrummingbird at the start of your combat, and the first hit each turn from a creature with counters draws a card and proliferates. Cathars' Crusade and Branching Evolution grow the team fast, and Simic Ascendancy is a second way to win.

1. Keep three lands with cheap ramp like Llanowar Elves or Sylvan Caryatid and a flier like Merfolk Skydiver or Thrummingbird.
2. Cast Tidus on turn three, with Merfolk Skydiver, Graft Surgeon or Innkeeper's Talent supplying counters to move.
3. At the start of your combat, have Tidus move a counter onto a flier; its hit draws a card and proliferates, and Thrummingbird proliferates again.
4. Grow the team with Cathars' Crusade, Branching Evolution and Yoshimaru, and cast Germination Practicum for a free copy on each of your later turns.
5. Protect the board with Shalai or Innkeeper's Talent at level 2, and hold Counterspell, Vigorbloom Charm or Inspiring Call for removal.
6. Win in the air with a stacked flier, or win on your upkeep once +1/+1 counters and proliferate give Simic Ascendancy 20 growth counters.

### S2-D4 Lyra

Lyra, Archangel of Dawn puts a +1/+1 counter on each of your Angels whenever you gain life. Impassioned Orator and Anointer Priest turn every new creature or token into a life trigger, and Moonshaker Cavalry flies the whole team in for the win.

1. Keep three lands, a rock like Sol Ring or Arcane Signet, and a cheap lifegain card like Impassioned Orator or Nyx-Fleece Ram.
2. Cast Lyra on turn three next to Impassioned Orator or Liliana the Faultless, so each creature that enters gains life and grows your Angels.
3. With Orator or Anointer Priest out, each token from Hop to It, Raise the Alarm or Elspeth, Sun's Champion triggers Lyra on its own.
4. Add Angels like Restoration Angel, Serra Paragon and Angel of Indemnity, and draw off tokens with Welcoming Vampire or Tocasia's Welcome.
5. Protect the board with Flawless Maneuver, free while Lyra is out, or Selfless Spirit, and rebuild with Karmic Guide or Sun Titan.
6. Close with Moonshaker Cavalry, giving every creature flying and +X/+X for your creature count, or Odric, Lunarch Marshal sharing flying.

### S2-D5 Gandalf

Gandalf, Goblins' Bane deals 1 damage to each opponent whenever you cast a noncreature spell, and cheap looting keeps those spells coming. Goblin token spells with Impact Tremors and Purphoros, God of the Forge add burst, and an Underworld Breach turn recasts the graveyard to finish.

1. Keep three lands, a rock like Sol Ring or Arcane Signet, and a cheap spell like Faithless Looting.
2. Cast Flameshape on turn two and leave the card in exile, then cast Gandalf from there so you can play the two cards it exiled.
3. Chain cheap noncreature spells like Tome Blast so Gandalf pings each opponent and Chandra's Emberling and Boar-q-pine grow.
4. Set up Impact Tremors, Witty Roastmaster or Purphoros, then cast Hordeling Outburst or Krenko's Command so each Goblin hits every opponent.
5. Answer threats with Abrade, Fulminous Forte or Wrath of the Bloodmane, and save Blasphemous Act for a board that outgrows yours.
6. To finish, Gamble for Underworld Breach, recast cheap spells and token makers from the graveyard, and sacrifice Goblins to Goblin Bombardment.

### S2-D6 Braids

Braids, Cabal Minion makes each player sacrifice an artifact, creature or land every upkeep, so this deck brings tokens and Treasures to feed her. Zulaport Cutthroat drains whenever one of your creatures dies, and Bolas's Citadel or Tree of Perdition with Triskaidekaphobia finishes.

1. Keep three lands, Sol Ring or Arcane Signet, and an early token maker like Dreadhorde Invasion or Woe Strider.
2. Build fodder before Braids with Bastion of Remembrance, Boggart Mischief and Pitiless Plunderer, whose Treasures can be your upkeep sacrifice.
3. Cast Braids once tokens are flowing, sacrifice a token or Treasure on your upkeep, and let Zulaport Cutthroat and Nadier's Nightblade drain.
4. Put Skullclamp on 1/1 tokens for two cards each, and answer threats with Go for the Throat, Long Goodbye or Lethal Scheme.
5. Cast Bolas's Citadel to cast spells off the top by paying life, then sacrifice ten nonland permanents to it so each opponent loses 10.
6. Late, tap Tree of Perdition in response to Triskaidekaphobia's upkeep trigger to set an opponent's life to 13, while you stay off 13 yourself.

## Group 0

### G0-D1 Niv-Mizzet

Niv-Mizzet, Parun draws you a card whenever any player casts an instant or sorcery, and each card you draw deals 1 damage. Saheeli and Shark Typhoon add a flier for each noncreature spell you cast, Draconic Visitor turns Thopters and Treasures into 5/5 Dragons, and the pings burn out the table.

1. Keep three or four lands and a mana rock like Sol Ring, Arcane Signet or Izzet Signet, plus a cheap draw spell such as Brainstorm.
2. Play Geist of Saint Thalia, Gandalf or Saheeli early, and dig with Faithless Looting and Thrill of Possibility for Niv's three blue and three red.
3. Cast Niv-Mizzet, then chain cheap spells: Brainstorm alone draws four and deals 4 damage, and Draconic Visitor makes Saheeli's Thopters 5/5 Dragons.
4. Hold Counterspell or Negate on other turns, save Octopus Form for Niv, and cast Old Fat Spider Can't See Me after Niv so it gives him hexproof.
5. For a big turn, cast Underworld Breach and recast Brainstorm and other cheap spells from your graveyard that turn, so each one draws and pings again.
6. Finish with pings while Gandalf and Purphoros burn each opponent; Kiki-Jiki copying Pestermite, which untaps Kiki-Jiki, is a late-game finisher.

### G0-D2 Kaalia

Kaalia of the Vast attacks and puts Angels, Demons and Dragons from your hand into play attacking, two at a time with Windcrag Siege. Avacyn returns your nontoken creatures that die, Teysa doubles death triggers, and Archfiend of Despair turns a big swing into a finish.

1. Keep three lands, a two-mana rock like Talisman of Conviction or Orzhov Signet, and at least one Angel, Demon or Dragon for Kaalia to drop.
2. Play Swiftfoot Boots or Crashing Drawbridge before Kaalia so she attacks the turn she lands, and hold your big fliers in hand instead of casting them.
3. Attack with Kaalia to put Avacyn, Akroma or Archfiend of Despair in tapped and attacking; Windcrag Siege set to Mardu drops two per attack.
4. Add Teysa Karlov so Pitiless Plunderer makes two Treasures when another creature of yours dies; Draconic Visitor makes them 5/5 flying Dragons.
5. Protect Kaalia with Teyo, Selfless Spirit or Valorous Stance, and answer threats with Swords to Plowshares, Vindicate or Mortify.
6. Close with a big swing and Archfiend's end step drain, or feed Goblin Bombardment while Avacyn brings the nontoken ones back at end step.

### G0-D3 Rhys

Rhys the Redeemed makes Elf Warriors, then copies every creature token you control. Queen Allenal and Cathars' Crusade grow each batch, Seedborn Muse lets Rhys go again on each opponent's turn, and Kinbinding turns the army into a lethal swing.

1. Keep two or three lands with Llanowar Elves, Noxious Newt or Sol Ring so Rhys can start making Elf Warriors by turn three.
2. Make an Elf with Rhys each turn; Woodland Weavemaster taps for mana that pays for Rhys, and Queen Allenal adds a Soldier to every batch.
3. Set up Cathars' Crusade to grow the team with each batch and Welcoming Vampire or Tocasia's Welcome to draw once a turn; Skullclamp a 1/1 to draw two.
4. Double your tokens with Rhys, then untap him with Thousand-Year Elixir or Village Bell-Ringer; Seedborn Muse lets him go again each opponent's turn.
5. Hold Flawless Maneuver, free while Rhys is out, or Grand Crescendo for a wipe, and answer threats with Swords to Plowshares or Path to Exile.
6. Before the final attack, double with Rhys: new tokens can't attack, but Kinbinding gives the rest +1/+1 for each, and Eldrazi Monument adds flying.

### G0-D4 Kynaios and Tiro

Kynaios and Tiro draw you a card at your end step and let each player put a land into play; opponents who pass on the land draw a card instead. Zendikar's Roil and Tatyova give you a 2/2 and a card for each land you put down, and the deck wins with a Moonshaker Cavalry swing or Simic Ascendancy.

1. Keep three lands across your colors plus a fixer like Arcane Signet, Farseek or Sylvan Caryatid, since Kynaios costs white, blue, red and green.
2. Ramp with Nature's Lore, Cultivate and Tireless Provisioner, and save spare lands in hand to put down at Kynaios's end step.
3. Cast Zendikar's Roil, Tatyova and Valakut Exploration: each land makes a 2/2, draws a card and exiles one to play, twice with Ancient Greenwarden.
4. Add land drops with Wayward Swordtooth and Way of the Paradox, which makes a Jace token and grants an extra land each time you use a loyalty ability.
5. Use Wilderness Reclamation to untap your lands at end step, then hold Negate, Essence Scatter or Fuel for the Cause on other turns.
6. Win with Moonshaker Cavalry over a Zendikar's Roil army, or reach 20 growth counters on Simic Ascendancy with Ezuri's combat counters.

## Group 1

### G1-D1 Saheeli

Saheeli, Jewel of Avishkar makes a hasty flying Thopter each time you cast a noncreature spell, and the deck is full of cheap artifacts. Impact Tremors and Purphoros turn each Thopter into damage, Skullclamp turns them into cards, and Eldrazi Monument or Goblin Bombardment finishes.

1. Keep three lands and a cheap rock like Sol Ring, Arcane Signet or Talisman of Creativity so Saheeli can come down by turn three.
2. Hold cheap artifacts like Ichor Wellspring and Thrór's Map until Saheeli is out, since every noncreature spell after that makes a Thopter.
3. Add Impact Tremors, Purphoros or Witty Roastmaster next: each Thopter that enters then deals damage to every opponent.
4. Equip Skullclamp to a Thopter to draw two cards for 1 mana, and use Trinket Mage to find Skullclamp or Sol Ring.
5. Put Swiftfoot Boots on Saheeli, hold Counterspell or Divert Disaster for a wipe, and answer threats with Abrade or Fulminous Forte.
6. Close with hasty Thopters under Eldrazi Monument, Myr Battlesphere with Warstorm Surge out, or Goblin Bombardment sacrificing the swarm.

### G1-D2 Tatyova

Tatyova, Benthic Druid draws a card and gains 1 life each time a land enters under your control, and the deck plays lands fast with ramp, fetch lands and extra land drops. Ancient Greenwarden doubles each landfall trigger, Zendikar's Roil builds an army, and Canopy Gargantuan or Emrakul closes.

1. Keep three or four lands plus a ramp piece like Farseek, Nature's Lore or Arcane Signet.
2. Ramp with Cultivate, Wood Elves or Farhaven Elf so Tatyova lands by turn four; pay 3 to exile Emrakul from hand and make a land tap for two.
3. Once Tatyova is out, play fetch lands like Evolving Wilds and Fabled Passage for two draws each, and use Wayward Swordtooth for an extra land a turn.
4. Cast Ancient Greenwarden to replay fetch lands from your graveyard and trigger Tatyova, Zendikar's Roil and Tireless Provisioner twice per land.
5. Hold Mana Leak or Memory Lapse for wipes and Beast Within for threats; Seedborn Muse untaps your lands on each opponent's turn.
6. Close with Canopy Gargantuan growing the Roil army at your upkeep and Ghalta giving it trample, or Emrakul, which untaps your lands as you cast it.

### G1-D3 Arcades

Arcades, the Strategist lets defenders attack for their toughness and draws a card whenever one enters, so the deck runs seventeen defenders that ramp, draw and hit hard. Tetsuko Umezawa, Fugitive makes 0-power defenders unblockable, and Tower Defense or Moonshaker Cavalry turns a swing lethal.

1. Keep three lands and an early defender like Sylvan Caryatid, Overgrown Battlement or Axebane Guardian to ramp into Arcades.
2. Cast Arcades on turn three or four, then play Carven Caryatid and Jungle Barrier after it so each draws its own card plus one from Arcades.
3. Stack more draw with Mentor of the Meek, Welcoming Vampire and Tocasia's Welcome, and add Wingmantle Chaplain for a flying Bird per defender.
4. Attack with defenders under Arcades; Tetsuko makes 0-power ones like Tree of Redemption unblockable, and Crashing Drawbridge grants haste.
5. Hold Flawless Maneuver, free while Arcades is out, or Selfless Spirit for wipes, and answer threats with Swords to Plowshares or Path to Exile.
6. Finish with Tower Defense after blocks for 5 more damage per defender, or Moonshaker Cavalry blinked by Ephemerate or Restoration Angel to pump twice.

### G1-D4 Arbaaz Mir

Arbaaz Mir deals 1 damage to each opponent and gains you 1 life whenever a nontoken artifact, legend or Saga enters under your control, and most of the deck qualifies. Teshar, Sun Titan and Serra Paragon replay cheap pieces for more pings, and Bayek of Siwa or Zetalpa, Primal Dawn wins in combat.

1. Keep three lands and cheap historic plays like Sol Ring, Mind Stone or Dori, Bearer of Friends to follow Arbaaz.
2. Cast Arbaaz on turn two, then add legends like Venat, Heart of Hydaelyn, which draws a card the first time you cast a legendary spell each turn.
3. Add Teshar, Ancestor's Apostle or Sun Titan to replay cheap pieces from your graveyard, and loop Squee, Goblin Nabob with Skullclamp for cards.
4. Cast adventures like Spew Flame first and the creature later from exile; Quintorius Kand deals 2 to each opponent per spell cast from exile.
5. Protect Arbaaz with Teyo, Bofur's Concerted Care or Plaza of Heroes, and answer threats with Swords to Plowshares or Wrath of the Bloodmane.
6. Swing with Bayek's double strike or Odric sharing Zetalpa's keywords; late, Kiki-Jiki, Mirror Breaker copying Bell-Ringer makes endless hasty copies.

## Crown Jewels

### CJ1 Tam

Tam superfriends that proliferates every walker at once: Tam proliferates once per walker type, Tekuthal doubles each proliferate, and Ichormoon Gauntlet turns loyalty into extra turns. It wins with Jace, Reality Sculptor's library exile or Simic Ascendancy at 20 growth counters.

1. Keep three lands and a rock like Sol Ring, Arcane Signet or Chromatic Lantern, since Tam's ability needs all five colors.
2. Cast Tam early so walkers cost one less, then add Narset, Oko or Kasmina, or a Way enchantment to make the Jace token.
3. Pay WUBRG and tap Tam to proliferate once per walker type you control; Tekuthal makes each of those proliferates happen twice.
4. Cast Ichormoon Gauntlet to give each walker 0: Proliferate and -12: extra turn, and add Seedborn Muse so Tam untaps on each opponent's turn.
5. Hold Counterspell, Fuel for the Cause or Negate for wipes; Shalai gives your walkers hexproof, and Teyo can flash in to save one.
6. Close with Jace, Reality Sculptor's 0 at 25 Jace loyalty, or push Simic Ascendancy to 20 growth counters with proliferate and Aetheric Amplifier.

### CJ2 Chulane

Chulane draws a card and can drop a land each time you cast a creature, and creatures that return themselves to hand let you trigger it again and again. Omnipresence makes those recasts free, and Freed from the Real on Faeburrow Elder makes endless mana for a huge Moonshaker Cavalry attack.

1. Keep two or three lands with a mana creature like Llanowar Elves, Noxious Newt or Great Forest Druid so Chulane lands by turn four.
2. Cast Chulane as early as you can, then chain cheap creatures: each one draws a card and can put a land from your hand onto the battlefield.
3. Recast Shrieking Drake, Kor Skyfisher and Dream Stalker by having them return themselves, and blink Peregrine Drake with Ephemerate for mana.
4. Cast Omnipresence with a wide board so cheap spells are free; each free Shrieking Drake loop draws a card, so stop before your library runs out.
5. Hold Counterspell or Glen Elendra Guardian for a wipe, and save the board with Selfless Spirit or a free Flawless Maneuver.
6. Close with Freed from the Real on Faeburrow Elder for endless mana, then bounce and recast Moonshaker Cavalry with Temur Sabertooth and attack.

### CJ3 Krenko

Krenko, Mob Boss doubles your Goblins every time he taps, and Impact Tremors and Purphoros turn each new token into damage. With Thornbite Staff on Krenko, Goblin Bombardment ends it: each Goblin you sacrifice deals 1 damage and untaps Krenko to make more.

1. Keep two or three Mountains with Sol Ring or a cheap Goblin like Skirk Prospector, aiming to cast Krenko on turn three or four.
2. Go wide early with Goblin Instigator, Krenko's Command and Mogg War Marshal, and play Goblin Warchief so Krenko has haste.
3. Tap Krenko every turn: each tap doubles your Goblins, and Impact Tremors, Purphoros and Witty Roastmaster turn each token into damage.
4. Find missing pieces with Goblin Matron and Gamble, or stack Goblins on top with Goblin Recruiter and cast them with Conspicuous Snoop.
5. Keep Swiftfoot Boots on Krenko for hexproof, and save Abrade or Chaos Warp for the blocker or artifact that stops your attack.
6. Close with Thornbite Staff on Krenko and Goblin Bombardment for unlimited damage, or Kiki-Jiki copying Zealous Conscripts for endless hasty attackers.

### CJ4 Tymna + Kraum

The combo build of Tymna and Kraum, made to win fast. Kiki-Jiki, Mirror Breaker or Splinter Twin with Pestermite or Deceiver Exarch makes endless hasty copies, while Tymna and Kraum draw into the pieces and counters guard the combo turn.

1. Keep two or three lands, Sol Ring or Arcane Signet, and a combo piece or a tutor.
2. Cast Tymna early and attack open players with Kraum or Selfless Spirit: she draws a card per opponent dealt combat damage, for 1 life each.
3. Find the missing piece with Gamble, Diabolic Tutor, Recruiter of the Guard, or Drift of Phantasms transmuting for Pestermite or Deceiver Exarch.
4. Flash Pestermite or Deceiver Exarch in at an opponent's end step, then add Kiki-Jiki, Mirror Breaker or Splinter Twin on your turn to go infinite.
5. Win with one attack of hasty copies or through Goblin Bombardment, and protect the combo turn with Teyo, Lightshield Expert or Swiftfoot Boots.
6. If the combo is answered, play control: Counterspell, Memory Lapse, Swords to Plowshares and Despark hold the table until the next piece.

### CJ5 Dragonlord Dromoka

Dragonlord Dromoka can't be countered and stops opponents from casting spells on your turn, so your main phases are safe. Haystack hides her on other turns, a deep set of answers clears the way, and she wins with lifelink commander damage, doubled by Yuriko, or a Moonshaker Cavalry swing.

1. Keep three lands and a ramp piece like Llanowar Elves, Sylvan Caryatid or Sol Ring, so the six-mana Dromoka arrives by turn four or five.
2. Spend early turns on value creatures like Wood Elves, Tireless Provisioner and Welcoming Vampire, and exile real threats with Swords to Plowshares.
3. Cast Dromoka as soon as you can: she can't be countered, and while she is out opponents can't cast spells during your turn.
4. Activate Haystack at your end step to phase Dromoka out until your next turn, so removal and wipes on other turns miss her.
5. Cast Wilderness Reclamation or Seedborn Muse so you untap for other turns, and hold up Settle the Wreckage, Guardian of Faith or Restoration Angel.
6. Close with Dromoka's lifelink swings; Yuriko gives her double strike when she attacks a player alone, or Moonshaker Cavalry pumps the whole team.

## Hidden Gems

### HG1 Denzilore Fatehold

Denzilore Fatehold puts a +1/+1 counter on each creature you control whenever you scry or surveil. The Jace token surveils on each of your turns, Yoshimaru adds an extra counter each time, Proft pays 2 to draw off each look, and a wide team of fliers wins with Moonshaker Cavalry.

1. Keep three lands and a rock like Sol Ring or Azorius Signet, plus a cheap scry or surveil card like Foraging Wickermaw or Eye of Jace.
2. Play cheap fliers like Fatehold Chronologist, Glider Kids and Unwelcome Sprite so Denzilore has a team to grow.
3. Flash in Denzilore on an opponent's end step, then make the Jace token with Theorist's Proxy or a Way enchantment to surveil on each of your turns.
4. Add Yoshimaru for an extra counter each time, Proft to pay 2 and draw on each scry or surveil, and Saheeli for a Thopter once a turn.
5. Hold Counterspell or Countersculpt for a wipe, and save the team with Selfless Spirit or a free Flawless Maneuver while Denzilore is out.
6. Close with Moonshaker Cavalry for a team-wide +X/+X flying swing, or fill the board with Elspeth's Soldiers and let each surveil grow them.

### HG2 Tymna + Kraum

The Dragon-token build of Tymna and Kraum: Draconic Visitor turns every Treasure, Thopter and Clue you make into a 5/5 flying Dragon. Impact Tremors, Purphoros and Warstorm Surge turn each new Dragon into damage, and the fliers feed Tymna's draws.

1. Keep three lands with Sol Ring, Arcane Signet or Chromatic Lantern and a Treasure maker like Goblin Glasswright or Dori, Bearer of Friends.
2. Ramp on Treasures from Long-Bodied Grey Dog and The Misty Mountains Cold, then attack with fliers: Tymna draws one per opponent hit, for 1 life each.
3. Land Draconic Visitor, then make artifact tokens: Saheeli's Thopters, Skrelv's Hive Mites and Myr Battlesphere's four Myr all arrive as 5/5 Dragons.
4. Get Impact Tremors, Purphoros or Corpse Knight out first so each Dragon that enters hits every opponent; Warstorm Surge has each deal 5 to any target.
5. Answer threats with Swords to Plowshares, Path to Exile or Counterspell; after a wipe, Karmic Guide returns Draconic Visitor to the battlefield.
6. Late, pair Ganax with Draconic Visitor for endless Dragons; the loop is mandatory, so first have a payoff out or Viscera Seer to sacrifice Ganax.

---

# Appendix B: `data/deck-writeups-2026-10-23.json`

Commit this as `data/deck-writeups-2026-10-23.json` (DPG-5, DPG-7). `named` lists every card a write-up names, for the check in DPG-9.

<details><summary>Show the JSON</summary>

```json
{
 "schema": "deck-writeups@1",
 "written": "2026-10-23",
 "source": "The 34 decks in the backup built from data/source/Backup_Load_-_CrankMagic_-_2026-10-21.xlsx (PR #816). Keyed by the backup's deck id; the app's id is deck:live:<ID>.",
 "decks": {
  "D1": {
   "name": "D1 Atraxa",
   "commanders": [
    "Atraxa, Praetors' Voice"
   ],
   "description": "Atraxa superfriends built on the Jace token: Way enchantments and empower spells stack loyalty on Jace, then Atraxa and Inexorable Tide proliferate every walker, twice with Tekuthal. It wins with Jace, Reality Sculptor's library exile, walker ultimates, or Elspeth's army.",
   "howToPlay": [
    "Keep three lands and a mana rock like Arcane Signet or Chromatic Lantern.",
    "Make the Jace token early with a Way enchantment or Theorist's Proxy, then add a walker every turn.",
    "Cast Atraxa once two walkers are out: she proliferates them all at your end step, and Tekuthal makes it twice.",
    "Use Oath of Teferi and Carth the Lion to get more from each walker, and hold Dovin's Veto or Countersculpt for removal aimed at your walkers.",
    "Guard walkers with Elspeth and Grist tokens and The Wandering Emperor; Farewell or Promise of Loyalty resets a board that turns on you.",
    "Close with Jace, Reality Sculptor's 0 at 25 Jace loyalty, or an ultimate from Vraska, Relic Seeker or Teferi, Hero of Dominaria."
   ],
   "named": [
    "Atraxa, Praetors' Voice",
    "Tekuthal, Inquiry Dominus",
    "Inexorable Tide",
    "Jace, Reality Sculptor",
    "Elspeth, Sun's Champion",
    "Arcane Signet",
    "Chromatic Lantern",
    "Theorist's Proxy",
    "Oath of Teferi",
    "Carth the Lion",
    "Dovin's Veto",
    "Countersculpt",
    "Grist, the Hunger Tide",
    "The Wandering Emperor",
    "Farewell",
    "Promise of Loyalty",
    "Vraska, Relic Seeker",
    "Teferi, Hero of Dominaria"
   ]
  },
  "D2": {
   "name": "D2 Chulane",
   "commanders": [
    "Chulane, Teller of Tales"
   ],
   "description": "Chulane draws a card and lets you drop a land from hand each time you cast a creature, and cheap self-bouncers like Shrieking Drake and Kor Skyfisher keep that going. It wins by filling the board and swinging with Moonshaker Cavalry, with Emrakul, the Exigent Doom as a late threat.",
   "howToPlay": [
    "Keep three lands and early mana like Llanowar Elves, Avacyn's Pilgrim or Sol Ring so Chulane comes down on turn three or four.",
    "Ramp with Wood Elves, Farhaven Elf and Coiling Oracle, and hold your cheap creatures until Chulane is out so every cast draws.",
    "Recast Shrieking Drake and Kor Skyfisher off their own bounce: each cast draws, drops a land from hand, and draws again with Beast Whisperer.",
    "Add Seedborn Muse so Chulane's bounce and Roon work every turn, and reuse Reflector Mage and Man-o'-War with Ephemerate or Restoration Angel.",
    "Hold Counterspell or Negate for wipes, cover Chulane with Teyo or Vigorbloom Charm, and cast Sunfall with Eerie Interlude ready to save your side.",
    "Swing with Moonshaker Cavalry's flying team pump; late, Freed from the Real on Faeburrow Elder makes endless mana for Temur Sabertooth recasts."
   ],
   "named": [
    "Chulane, Teller of Tales",
    "Shrieking Drake",
    "Kor Skyfisher",
    "Moonshaker Cavalry",
    "Emrakul, the Exigent Doom",
    "Llanowar Elves",
    "Avacyn's Pilgrim",
    "Sol Ring",
    "Wood Elves",
    "Farhaven Elf",
    "Coiling Oracle",
    "Beast Whisperer",
    "Seedborn Muse",
    "Roon of the Hidden Realm",
    "Reflector Mage",
    "Man-o'-War",
    "Ephemerate",
    "Restoration Angel",
    "Counterspell",
    "Negate",
    "Teyo, Lightshield Expert",
    "Vigorbloom Charm",
    "Sunfall",
    "Eerie Interlude",
    "Freed from the Real",
    "Faeburrow Elder",
    "Temur Sabertooth"
   ]
  },
  "D3": {
   "name": "D3 Ezuri",
   "commanders": [
    "Ezuri, Claw of Progress"
   ],
   "description": "Ezuri gives you an experience counter each time a creature you control with power 2 or less enters, then at combat on your turn puts that many +1/+1 counters on another creature. Branching Evolution doubles them, and the deck wins with a big trampler, Leyline Axe double strike, or Simic Ascendancy.",
   "howToPlay": [
    "Keep three lands and a cheap creature like Noxious Newt or Great Forest Druid; a Leyline Axe in your opening hand starts on the battlefield.",
    "Cast Ezuri early, since only creatures that enter after it count, then follow with Sylvan Ranger, Wood Elves, Satyr Wayfinder and Dream Stalker.",
    "Play Branching Evolution or level Innkeeper's Talent to 3 to double counters, and aim Ezuri at Fathom Mage to draw a card per counter.",
    "Protect the big creature with Tamiyo's Safekeeping or Blossoming Defense, and hold Essence Scatter or Refute; experience counters survive wipes.",
    "Close with one giant attacker: Ghalta the Unstoppable or Leyline Axe gives it trample, and Elvenking's Harper can make it unblockable.",
    "Or race Simic Ascendancy to 20 growth counters; once Germination Practicum resolves, its free copy on each of your turns adds counters to the team."
   ],
   "named": [
    "Ezuri, Claw of Progress",
    "Branching Evolution",
    "Leyline Axe",
    "Simic Ascendancy",
    "Noxious Newt",
    "Great Forest Druid",
    "Sylvan Ranger",
    "Wood Elves",
    "Satyr Wayfinder",
    "Dream Stalker",
    "Innkeeper's Talent",
    "Fathom Mage",
    "Tamiyo's Safekeeping",
    "Blossoming Defense",
    "Essence Scatter",
    "Refute",
    "Ghalta the Unstoppable",
    "Elvenking's Harper",
    "Germination Practicum"
   ]
  },
  "D4": {
   "name": "D4 Felothar",
   "commanders": [
    "Felothar the Steadfast"
   ],
   "description": "Felothar lets walls attack and deal combat damage equal to their toughness, so defenders like Axebane Guardian and Overgrown Battlement are your mana and your army. It wins with wall attacks, Blight Pile drains, or Tree of Perdition attacking after it swaps toughness with an opponent's life.",
   "howToPlay": [
    "Keep three lands with Sylvan Caryatid, Overgrown Battlement or Sol Ring, since the walls are also your ramp.",
    "Play a defender every turn: Carven Caryatid draws a card, and Axebane Guardian and Overgrown Battlement tap for a mana per defender.",
    "Cast Felothar so walls attack for their toughness, then pay 3 and tap it to sacrifice a 0-power wall like Wall of Mulch and draw its toughness.",
    "Add Drumbellower to untap your creatures on each opponent's turn, so Felothar, Blight Pile and the mana walls work every turn.",
    "Hold Flawless Maneuver, free while Felothar is out, or Heroic Intervention; Fell the Mighty on a 0-power wall spares Felothar and every 0-power wall.",
    "Swing and drain with Blight Pile; late, Umbral Mantle on Axebane Guardian with four or more defenders makes endless mana for Assault Formation pumps."
   ],
   "named": [
    "Felothar the Steadfast",
    "Axebane Guardian",
    "Overgrown Battlement",
    "Blight Pile",
    "Tree of Perdition",
    "Sylvan Caryatid",
    "Sol Ring",
    "Carven Caryatid",
    "Wall of Mulch",
    "Drumbellower",
    "Flawless Maneuver",
    "Heroic Intervention",
    "Fell the Mighty",
    "Umbral Mantle",
    "Assault Formation"
   ]
  },
  "D5": {
   "name": "D5 Teysa Karlov",
   "commanders": [
    "Teysa Karlov"
   ],
   "description": "Teysa Karlov makes your death triggers fire twice, so sacrificing creatures to Viscera Seer drains each opponent twice through Zulaport Cutthroat and Bastion of Remembrance. It grinds with tokens and recursion, then wins with a big Bolas's Citadel or Living Death turn.",
   "howToPlay": [
    "Keep three lands with a sacrifice outlet like Viscera Seer and a cheap rock like Sol Ring or Arcane Signet.",
    "Set up with Zulaport Cutthroat, Cruel Celebrant and Skullclamp, which draws two when the equipped creature dies and four once Teysa is out.",
    "Cast Teysa, then feed tokens from Woe Strider, Staff of the Storyteller and Requiem Angel into Viscera Seer: each death drains twice.",
    "Bring creatures back with Reveillark, Karmic Guide and Sun Titan; Reveillark dying under Teysa returns up to four power 2 or less creatures.",
    "Keep Teysa alive with Selfless Spirit, Teyo or Grand Crescendo, and answer threats with Path to Exile, Despark or Ruthless Lawbringer.",
    "Close with Bolas's Citadel's ten-permanent sacrifice, Living Death or Rally the Ancestors, while Archfiend of Despair doubles each opponent's loss."
   ],
   "named": [
    "Teysa Karlov",
    "Viscera Seer",
    "Zulaport Cutthroat",
    "Bastion of Remembrance",
    "Bolas's Citadel",
    "Living Death",
    "Sol Ring",
    "Arcane Signet",
    "Cruel Celebrant",
    "Skullclamp",
    "Woe Strider",
    "Staff of the Storyteller",
    "Requiem Angel",
    "Reveillark",
    "Karmic Guide",
    "Sun Titan",
    "Selfless Spirit",
    "Teyo, Lightshield Expert",
    "Grand Crescendo",
    "Path to Exile",
    "Despark",
    "Ruthless Lawbringer",
    "Rally the Ancestors",
    "Archfiend of Despair"
   ]
  },
  "D6": {
   "name": "D6 Krenko",
   "commanders": [
    "Krenko, Mob Boss"
   ],
   "description": "Krenko, Mob Boss doubles your Goblins each time he taps, and Goblin Warchief gives him haste so he can tap the turn he lands. Impact Tremors and Purphoros turn every new token into damage, and Eldrazi Monument sends the horde in flying.",
   "howToPlay": [
    "Keep three or four lands, a rock like Sol Ring or Arcane Signet, and a cheap Goblin such as Goblin Instigator or Skirk Prospector.",
    "Go wide early with Mogg War Marshal and Legion Warboss, and equip Skullclamp to 1/1 tokens: each one dies and draws you two cards.",
    "Cast Krenko, Mob Boss with haste from Goblin Warchief, Samut or Lightning Greaves and tap him at once; Thousand-Year Elixir untaps him to go again.",
    "Get Impact Tremors, Purphoros or Witty Roastmaster out before a big Mob Boss turn so every token that enters damages each opponent.",
    "Shield Mob Boss with Swiftfoot Boots or Goblin Chirurgeon, redirect removal with Ricochet Trap, and stop blue spells with Red Elemental Blast.",
    "Win with a wide attack under Eldrazi Monument or Shared Animosity; late, Thornbite Staff on Mob Boss plus Skirk Prospector makes endless Goblins."
   ],
   "named": [
    "Krenko, Mob Boss",
    "Goblin Warchief",
    "Impact Tremors",
    "Purphoros, God of the Forge",
    "Eldrazi Monument",
    "Sol Ring",
    "Arcane Signet",
    "Goblin Instigator",
    "Skirk Prospector",
    "Mogg War Marshal",
    "Legion Warboss",
    "Skullclamp",
    "Samut, Hazoret's Champion",
    "Lightning Greaves",
    "Thousand-Year Elixir",
    "Witty Roastmaster",
    "Swiftfoot Boots",
    "Goblin Chirurgeon",
    "Ricochet Trap",
    "Red Elemental Blast",
    "Shared Animosity",
    "Thornbite Staff"
   ]
  },
  "D7": {
   "name": "D7 Queza",
   "commanders": [
    "Queza, Augur of Agonies"
   ],
   "description": "Queza, Augur of Agonies makes a target opponent lose 1 life every time you draw, and Vito or Sanguine Bond turns the life you gain into more loss. Counterspells like Absorb answer whatever is aimed at you, and Approach of the Second Sun closes the game.",
   "howToPlay": [
    "Keep three lands with a blue source, a rock like Arcane Signet or Talisman of Hierarchy, and a cheap counter such as Counterspell or Mana Leak.",
    "Play Blood Artist, Vito or Nyx-Fleece Ram early, then pass with mana up and cast Brainstorm at an end step if nothing needs countering.",
    "Cast Queza by turn four and point each draw at whoever is pressuring you; Vito or Sanguine Bond adds a point for the life Queza gains.",
    "Counter removal aimed at your board with Rebuff the Wicked or Absorb, and let Vito make that caster lose the 3 life Absorb gains you.",
    "If a board turns on you, cast Supreme Verdict: Blood Artist drains for every death, then flash in Liliana's Standard Bearer to draw for yours.",
    "Cast Approach of the Second Sun, then redraw it and cast it from hand to win; late, Niv-Mizzet, Ghost Counsel turns each Queza life gain into a draw."
   ],
   "named": [
    "Queza, Augur of Agonies",
    "Vito, Thorn of the Dusk Rose",
    "Sanguine Bond",
    "Absorb",
    "Approach of the Second Sun",
    "Arcane Signet",
    "Talisman of Hierarchy",
    "Counterspell",
    "Mana Leak",
    "Blood Artist",
    "Nyx-Fleece Ram",
    "Brainstorm",
    "Rebuff the Wicked",
    "Supreme Verdict",
    "Liliana's Standard Bearer",
    "Niv-Mizzet, Ghost Counsel"
   ]
  },
  "S1-D1": {
   "name": "S1-D1 Roon",
   "commanders": [
    "Roon of the Hidden Realm"
   ],
   "description": "Roon blinks a creature every turn, so creatures that do something when they enter, like Reflector Mage and Cloudblazer, keep paying out. Seedborn Muse lets Roon blink on every opponent's turn too, and Eldrazi Monument turns the board into a flying, indestructible army.",
   "howToPlay": [
    "Keep three lands plus Sol Ring, Arcane Signet or a mana creature like Great Forest Druid.",
    "Play cheap creatures like Charming Prince, Coiling Oracle and Fblthp early; Mentor of the Meek draws for {1} each, Welcoming Vampire once a turn.",
    "Cast Roon, then pay {2} and tap it each turn to blink Reflector Mage, Man-o'-War or Cloudblazer; the creature returns at the next end step.",
    "Add Seedborn Muse to blink with Roon on every opponent's turn, Soulherder to blink one at your end step, and Sun Titan to bring back cheap permanents.",
    "Answer threats with Swords to Plowshares or Deputy of Detention, and hold Ephemerate, Teyo or Memory Lapse to protect Roon and your best creature.",
    "Close with Eldrazi Monument for a flying swing, feeding it a creature on your upkeep, or Serra's Emissary choosing creature so nothing can block."
   ],
   "named": [
    "Roon of the Hidden Realm",
    "Reflector Mage",
    "Cloudblazer",
    "Seedborn Muse",
    "Eldrazi Monument",
    "Sol Ring",
    "Arcane Signet",
    "Great Forest Druid",
    "Charming Prince",
    "Coiling Oracle",
    "Fblthp, the Lost",
    "Mentor of the Meek",
    "Welcoming Vampire",
    "Man-o'-War",
    "Soulherder",
    "Sun Titan",
    "Swords to Plowshares",
    "Deputy of Detention",
    "Ephemerate",
    "Teyo, Lightshield Expert",
    "Memory Lapse",
    "Serra's Emissary"
   ]
  },
  "S1-D2": {
   "name": "S1-D2 Freyalise",
   "commanders": [
    "Freyalise, Llanowar's Fury"
   ],
   "description": "Freyalise makes a mana Elf with each +2, and Elves and land ramp carry the deck into big counter turns. Branching Evolution doubles the counters from Germination Practicum and Canopy Gargantuan, then Ghalta the Unstoppable gives the grown team trample.",
   "howToPlay": [
    "Keep three lands and a cheap mana creature like Llanowar Elves, Great Forest Druid or Sylvan Caryatid.",
    "Ramp with Nature's Lore, Wood Elves and Farhaven Elf, then cast Freyalise and +2 each turn for a 1/1 Elf that taps for {G}.",
    "Put Skullclamp on a 1/1 Elf token to draw two cards when it dies, and refill with Harmonize or Shamanic Revelation once the board is wide.",
    "Get Branching Evolution out or level Innkeeper's Talent to three, then cast Germination Practicum; a free copy follows on each of your turns.",
    "Answer threats with Beast Within, Troll Negotiations or Freyalise's -2, and hold Inspiring Call to make creatures with counters indestructible.",
    "Cast Ghalta the Unstoppable cheaply off your biggest creature for team trample; Omnipresence frees spells with mana value up to your creature count."
   ],
   "named": [
    "Freyalise, Llanowar's Fury",
    "Branching Evolution",
    "Germination Practicum",
    "Canopy Gargantuan",
    "Ghalta the Unstoppable",
    "Llanowar Elves",
    "Great Forest Druid",
    "Sylvan Caryatid",
    "Nature's Lore",
    "Wood Elves",
    "Farhaven Elf",
    "Skullclamp",
    "Harmonize",
    "Shamanic Revelation",
    "Innkeeper's Talent",
    "Beast Within",
    "Troll Negotiations",
    "Inspiring Call",
    "Omnipresence"
   ]
  },
  "S1-D3": {
   "name": "S1-D3 Quintorius",
   "commanders": [
    "Quintorius, Loremaster"
   ],
   "description": "At your end step, Quintorius, Loremaster exiles a noncreature, nonland card from your graveyard for a 3/2 Spirit; sacrificing a Spirit lets you cast one of those cards free. Garrison Excavator and Quintorius, Field Historian add Spirits, and Hofri Ghostforge or Moonshaker Cavalry make them lethal.",
   "howToPlay": [
    "Keep three lands with a discard-and-draw spell like Faithless Looting or Thrill of Possibility, or an early Sol Ring.",
    "Play Relic Retriever or Containment Construct early, then discard extras to Cathartic Reunion and Big Score to stock the graveyard with spells.",
    "Cast Quintorius, Loremaster so your end step exiles a spell for a 3/2 Spirit; Garrison Excavator adds a 2/2 Spirit when cards leave your graveyard.",
    "Pay {1}{R}{W}, tap Loremaster and sacrifice a Spirit to cast an exiled spell free; Quintorius Kand then deals 2 to each opponent and gains you 2.",
    "Answer threats with Swords to Plowshares, Path to Exile or Skyclave Apparition, and flash in Guardian of Faith when a wipe is coming.",
    "Pump Spirits with Hofri Ghostforge, Intangible Virtue or Balefire Liege, then cast Moonshaker Cavalry or use History Chaser's -4 and attack."
   ],
   "named": [
    "Quintorius, Loremaster",
    "Garrison Excavator",
    "Quintorius, Field Historian",
    "Hofri Ghostforge",
    "Moonshaker Cavalry",
    "Faithless Looting",
    "Thrill of Possibility",
    "Sol Ring",
    "Relic Retriever",
    "Containment Construct",
    "Cathartic Reunion",
    "Big Score",
    "Quintorius Kand",
    "Swords to Plowshares",
    "Path to Exile",
    "Skyclave Apparition",
    "Guardian of Faith",
    "Intangible Virtue",
    "Balefire Liege",
    "Quintorius, History Chaser"
   ]
  },
  "S1-D4": {
   "name": "S1-D4 Nissa",
   "commanders": [
    "Nissa, Leyline Tamer"
   ],
   "description": "Nissa draws a card for each land that enters under your control, and her first landfall each turn puts the next creature in your library onto the battlefield. Ramp into her, then let landfall, Mass Polymorph and Proteus Staff pull monsters like Emrakul and Zetalpa off the top.",
   "howToPlay": [
    "Keep three lands and a mana rock like Arcane Signet, Mind Stone or Talisman of Progress, since Nissa costs seven.",
    "Hit every land drop with Thrór's Map, Pilgrim's Eye and Troop of Ponies, and add Chromatic Lantern to fix all four colors.",
    "Cast Nissa and play a land each turn: you draw a card, and the first landfall each turn puts your next creature onto the battlefield.",
    "Crack Evolving Wilds or Contaminated Landscape on an opponent's turn for another free creature; Sword of the Animist adds a land on each attack.",
    "Give Nissa Swiftfoot Boots, hold Negate or Delay for removal aimed at her, and answer threats with Despark, Mortify or Cast Out.",
    "Aim Proteus Staff or Jace, Multiverse Architect's -3 at Bitterthorn's Germ token to dig out a monster, then attack with Emrakul or Zetalpa."
   ],
   "named": [
    "Nissa, Leyline Tamer",
    "Mass Polymorph",
    "Proteus Staff",
    "Emrakul, the Exigent Doom",
    "Zetalpa, Primal Dawn",
    "Arcane Signet",
    "Mind Stone",
    "Talisman of Progress",
    "Thrór's Map",
    "Pilgrim's Eye",
    "Troop of Ponies",
    "Chromatic Lantern",
    "Evolving Wilds",
    "Contaminated Landscape",
    "Sword of the Animist",
    "Swiftfoot Boots",
    "Negate",
    "Delay",
    "Despark",
    "Mortify",
    "Cast Out",
    "Jace, Multiverse Architect",
    "Bitterthorn, Nissa's Animus"
   ]
  },
  "S1-D5": {
   "name": "S1-D5 Shadrix Silverquill",
   "commanders": [
    "Shadrix Silverquill"
   ],
   "description": "At the start of your combat, Shadrix Silverquill can put a +1/+1 counter on each of your creatures while an opponent gets a card or an Inkling. Flying token makers go wide, Cathars' Crusade grows them, and Teysa Karlov doubles Zulaport Cutthroat and Bastion of Remembrance drains as tokens die.",
   "howToPlay": [
    "Keep three lands with Sol Ring, Arcane Signet or Mind Stone and an early token maker like Raise the Alarm or Lingering Souls.",
    "Go wide early with Lingering Souls, Hop to It and Skrelv's Hive, and draw off the tokens with Welcoming Vampire or Tocasia's Welcome.",
    "Cast Shadrix and at the start of your combat take the counters while an opponent gets the card or an Inkling; Kambal copies that Inkling for you.",
    "Add Cathars' Crusade so every new token grows the team, and Teysa Karlov so Zulaport Cutthroat and Bastion of Remembrance drain twice per death.",
    "Remove threats with Swords to Plowshares, Vindicate or Anguished Unmaking, and cast Grand Crescendo in response to a wipe.",
    "Close with a flying swing pumped by An Unexpected Party choosing Spirit, or Elspeth, Sun's Champion's emblem for +2/+2 and flying."
   ],
   "named": [
    "Shadrix Silverquill",
    "Cathars' Crusade",
    "Teysa Karlov",
    "Zulaport Cutthroat",
    "Bastion of Remembrance",
    "Sol Ring",
    "Arcane Signet",
    "Mind Stone",
    "Raise the Alarm",
    "Lingering Souls",
    "Hop to It",
    "Skrelv's Hive",
    "Welcoming Vampire",
    "Tocasia's Welcome",
    "Kambal, Profiteering Mayor",
    "Swords to Plowshares",
    "Vindicate",
    "Anguished Unmaking",
    "Grand Crescendo",
    "An Unexpected Party // At the Door",
    "Elspeth, Sun's Champion"
   ]
  },
  "S1-D6": {
   "name": "S1-D6 Ashling",
   "commanders": [
    "Ashling, Rekindled // Ashling, Rimebound"
   ],
   "description": "Ashling discards a card to draw one, then transforms into Rimebound for two mana on each of your turns, spent on spells with mana value 4 or more. That pays for token bursts like Goblin Rally, which Impact Tremors and Purphoros, God of the Forge turn into damage to each opponent.",
   "howToPlay": [
    "Keep three lands with both colors and a cheap play like Brainstorm, Faithless Looting or Flamebraider.",
    "Cast Ashling on turn two to discard and draw, then pay {U} as next turn's first main phase starts to transform her for two mana toward a four-drop.",
    "Leave her as Rimebound for two extra mana on each of your turns, or pay {R} to transform back and discard and draw again when you need a card.",
    "Set up Impact Tremors, Purphoros or Witty Roastmaster, then cast Goblin Rally, Hordeling Outburst or Siege-Gang Commander to hit every opponent.",
    "Hold Counterspell, Mana Leak or Negate to protect the engine, and clear threats with Fulminous Forte or Chaos Warp.",
    "Finish with a big Tempt with Vengeance or Massive Raid, and Warstorm Surge so each new creature deals damage equal to its power."
   ],
   "named": [
    "Ashling, Rekindled // Ashling, Rimebound",
    "Goblin Rally",
    "Tempt with Vengeance",
    "Impact Tremors",
    "Purphoros, God of the Forge",
    "Brainstorm",
    "Faithless Looting",
    "Flamebraider",
    "Witty Roastmaster",
    "Hordeling Outburst",
    "Siege-Gang Commander",
    "Counterspell",
    "Mana Leak",
    "Negate",
    "Fulminous Forte",
    "Chaos Warp",
    "Massive Raid",
    "Warstorm Surge"
   ]
  },
  "S2-D1": {
   "name": "S2-D1 Tam",
   "commanders": [
    "Tam, the Possibility"
   ],
   "description": "Tam, the Possibility runs five-color superfriends, making walkers cheaper and proliferating once per walker type. Way enchantments grow the Jace token, Tekuthal doubles every proliferate, and Jace, Reality Sculptor's library exile or Emrakul, the Exigent Doom wins the game.",
   "howToPlay": [
    "Keep three lands and a fixer like Great Forest Druid or Chromatic Lantern, since Tam's proliferate ability costs all five colors.",
    "Start the Jace token early with Way of the Pyromancer, Theorist's Proxy or Mindseeker Oculus, then cast Tam on turn three.",
    "Add a walker each turn at Tam's discount; Kasmina gives them all +2: Scry 1, and Tam's tap proliferates once per walker type.",
    "Cast Tekuthal so every proliferate happens twice, and fill the gaps with Contagion Clasp, Throne of Geth and Steady Progress.",
    "Hold Countersculpt, Negate or Fuel for the Cause for wipes, flash in Teyo to shield a walker, and reset a bad board with Tragic Arrogance.",
    "Win with Jace, Reality Sculptor's 0 at 25 Jace loyalty; Jace's Machinations adds eight and lets you fire it at instant speed, or cast Emrakul."
   ],
   "named": [
    "Tam, the Possibility",
    "Tekuthal, Inquiry Dominus",
    "Jace, Reality Sculptor",
    "Emrakul, the Exigent Doom",
    "Great Forest Druid",
    "Chromatic Lantern",
    "Way of the Pyromancer",
    "Theorist's Proxy",
    "Mindseeker Oculus",
    "Kasmina, Enigma Sage",
    "Contagion Clasp",
    "Throne of Geth",
    "Steady Progress",
    "Countersculpt",
    "Negate",
    "Fuel for the Cause",
    "Teyo, Lightshield Expert",
    "Tragic Arrogance",
    "Jace's Machinations"
   ]
  },
  "S2-D2": {
   "name": "S2-D2 Thorin Oakenshield",
   "commanders": [
    "Thorin Oakenshield"
   ],
   "description": "Thorin Oakenshield leads a go-wide Dwarf company, and once you control three artifacts, legends or Sagas, his enduring story gives your creatures and artifacts ward {1}. It wins with one big swing behind Shared Animosity, Windcrag Siege and Bayek of Siwa's double strike.",
   "howToPlay": [
    "Keep three lands and a cheap artifact like Sol Ring, Arcane Signet or Tome of Legends.",
    "Cast Thorin on turn two, then add Dáin, Óin or Arbaaz Mir to reach three artifacts and legends, turning on his ward {1} for your team.",
    "Go wide with At the Door and Dwarven Shortsword, then cast An Unexpected Party from exile naming Dwarf for +2/+2.",
    "Draw off small creatures with Welcoming Vampire and Mentor of the Meek, and off legendary spells with Venat, Heart of Hydaelyn.",
    "Save Selfless Spirit for wipes and Bofur's Concerted Care for spot removal; Hofri Ghostforge turns fallen nontoken creatures into hasty Spirit copies.",
    "Close with Windcrag Siege on Mardu so Shared Animosity triggers twice per attacker, and Bayek of Siwa giving your other legends double strike."
   ],
   "named": [
    "Thorin Oakenshield",
    "Shared Animosity",
    "Windcrag Siege",
    "Bayek of Siwa",
    "Sol Ring",
    "Arcane Signet",
    "Tome of Legends",
    "Bofur, Reliable Guardian // Concerted Care",
    "Dáin, Lord of the Iron Hills",
    "Óin the Brave",
    "Arbaaz Mir",
    "An Unexpected Party // At the Door",
    "Dwarven Shortsword",
    "Welcoming Vampire",
    "Mentor of the Meek",
    "Venat, Heart of Hydaelyn // Hydaelyn, the Mothercrystal",
    "Selfless Spirit",
    "Hofri Ghostforge"
   ]
  },
  "S2-D3": {
   "name": "S2-D3 Tidus",
   "commanders": [
    "Tidus, Yuna's Guardian"
   ],
   "description": "Tidus, Yuna's Guardian moves a counter onto a flier like Thrummingbird at the start of your combat, and the first hit each turn from a creature with counters draws a card and proliferates. Cathars' Crusade and Branching Evolution grow the team fast, and Simic Ascendancy is a second way to win.",
   "howToPlay": [
    "Keep three lands with cheap ramp like Llanowar Elves or Sylvan Caryatid and a flier like Merfolk Skydiver or Thrummingbird.",
    "Cast Tidus on turn three, with Merfolk Skydiver, Graft Surgeon or Innkeeper's Talent supplying counters to move.",
    "At the start of your combat, have Tidus move a counter onto a flier; its hit draws a card and proliferates, and Thrummingbird proliferates again.",
    "Grow the team with Cathars' Crusade, Branching Evolution and Yoshimaru, and cast Germination Practicum for a free copy on each of your later turns.",
    "Protect the board with Shalai or Innkeeper's Talent at level 2, and hold Counterspell, Vigorbloom Charm or Inspiring Call for removal.",
    "Win in the air with a stacked flier, or win on your upkeep once +1/+1 counters and proliferate give Simic Ascendancy 20 growth counters."
   ],
   "named": [
    "Tidus, Yuna's Guardian",
    "Thrummingbird",
    "Cathars' Crusade",
    "Branching Evolution",
    "Simic Ascendancy",
    "Llanowar Elves",
    "Sylvan Caryatid",
    "Merfolk Skydiver",
    "Graft Surgeon",
    "Innkeeper's Talent",
    "Yoshimaru, Beloved Companion",
    "Germination Practicum",
    "Shalai, Voice of Plenty",
    "Counterspell",
    "Vigorbloom Charm",
    "Inspiring Call"
   ]
  },
  "S2-D4": {
   "name": "S2-D4 Lyra",
   "commanders": [
    "Lyra, Archangel of Dawn"
   ],
   "description": "Lyra, Archangel of Dawn puts a +1/+1 counter on each of your Angels whenever you gain life. Impassioned Orator and Anointer Priest turn every new creature or token into a life trigger, and Moonshaker Cavalry flies the whole team in for the win.",
   "howToPlay": [
    "Keep three lands, a rock like Sol Ring or Arcane Signet, and a cheap lifegain card like Impassioned Orator or Nyx-Fleece Ram.",
    "Cast Lyra on turn three next to Impassioned Orator or Liliana the Faultless, so each creature that enters gains life and grows your Angels.",
    "With Orator or Anointer Priest out, each token from Hop to It, Raise the Alarm or Elspeth, Sun's Champion triggers Lyra on its own.",
    "Add Angels like Restoration Angel, Serra Paragon and Angel of Indemnity, and draw off tokens with Welcoming Vampire or Tocasia's Welcome.",
    "Protect the board with Flawless Maneuver, free while Lyra is out, or Selfless Spirit, and rebuild with Karmic Guide or Sun Titan.",
    "Close with Moonshaker Cavalry, giving every creature flying and +X/+X for your creature count, or Odric, Lunarch Marshal sharing flying."
   ],
   "named": [
    "Lyra, Archangel of Dawn",
    "Impassioned Orator",
    "Anointer Priest",
    "Moonshaker Cavalry",
    "Sol Ring",
    "Arcane Signet",
    "Nyx-Fleece Ram",
    "Liliana the Faultless",
    "Hop to It",
    "Raise the Alarm",
    "Elspeth, Sun's Champion",
    "Restoration Angel",
    "Serra Paragon",
    "Angel of Indemnity",
    "Welcoming Vampire",
    "Tocasia's Welcome",
    "Flawless Maneuver",
    "Selfless Spirit",
    "Karmic Guide",
    "Sun Titan",
    "Odric, Lunarch Marshal"
   ]
  },
  "S2-D5": {
   "name": "S2-D5 Gandalf",
   "commanders": [
    "Gandalf, Goblins' Bane // Flameshape"
   ],
   "description": "Gandalf, Goblins' Bane deals 1 damage to each opponent whenever you cast a noncreature spell, and cheap looting keeps those spells coming. Goblin token spells with Impact Tremors and Purphoros, God of the Forge add burst, and an Underworld Breach turn recasts the graveyard to finish.",
   "howToPlay": [
    "Keep three lands, a rock like Sol Ring or Arcane Signet, and a cheap spell like Faithless Looting.",
    "Cast Flameshape on turn two and leave the card in exile, then cast Gandalf from there so you can play the two cards it exiled.",
    "Chain cheap noncreature spells like Tome Blast so Gandalf pings each opponent and Chandra's Emberling and Boar-q-pine grow.",
    "Set up Impact Tremors, Witty Roastmaster or Purphoros, then cast Hordeling Outburst or Krenko's Command so each Goblin hits every opponent.",
    "Answer threats with Abrade, Fulminous Forte or Wrath of the Bloodmane, and save Blasphemous Act for a board that outgrows yours.",
    "To finish, Gamble for Underworld Breach, recast cheap spells and token makers from the graveyard, and sacrifice Goblins to Goblin Bombardment."
   ],
   "named": [
    "Gandalf, Goblins' Bane // Flameshape",
    "Impact Tremors",
    "Purphoros, God of the Forge",
    "Underworld Breach",
    "Sol Ring",
    "Arcane Signet",
    "Faithless Looting",
    "Tome Blast",
    "Chandra's Emberling",
    "Boar-q-pine",
    "Witty Roastmaster",
    "Hordeling Outburst",
    "Krenko's Command",
    "Abrade",
    "Fulminous Forte",
    "Wrath of the Bloodmane",
    "Blasphemous Act",
    "Gamble",
    "Goblin Bombardment"
   ]
  },
  "S2-D6": {
   "name": "S2-D6 Braids",
   "commanders": [
    "Braids, Cabal Minion"
   ],
   "description": "Braids, Cabal Minion makes each player sacrifice an artifact, creature or land every upkeep, so this deck brings tokens and Treasures to feed her. Zulaport Cutthroat drains whenever one of your creatures dies, and Bolas's Citadel or Tree of Perdition with Triskaidekaphobia finishes.",
   "howToPlay": [
    "Keep three lands, Sol Ring or Arcane Signet, and an early token maker like Dreadhorde Invasion or Woe Strider.",
    "Build fodder before Braids with Bastion of Remembrance, Boggart Mischief and Pitiless Plunderer, whose Treasures can be your upkeep sacrifice.",
    "Cast Braids once tokens are flowing, sacrifice a token or Treasure on your upkeep, and let Zulaport Cutthroat and Nadier's Nightblade drain.",
    "Put Skullclamp on 1/1 tokens for two cards each, and answer threats with Go for the Throat, Long Goodbye or Lethal Scheme.",
    "Cast Bolas's Citadel to cast spells off the top by paying life, then sacrifice ten nonland permanents to it so each opponent loses 10.",
    "Late, tap Tree of Perdition in response to Triskaidekaphobia's upkeep trigger to set an opponent's life to 13, while you stay off 13 yourself."
   ],
   "named": [
    "Braids, Cabal Minion",
    "Zulaport Cutthroat",
    "Bastion of Remembrance",
    "Bolas's Citadel",
    "Tree of Perdition",
    "Triskaidekaphobia",
    "Sol Ring",
    "Arcane Signet",
    "Dreadhorde Invasion",
    "Woe Strider",
    "Boggart Mischief",
    "Pitiless Plunderer",
    "Nadier's Nightblade",
    "Skullclamp",
    "Go for the Throat",
    "Long Goodbye",
    "Lethal Scheme"
   ]
  },
  "G0-D1": {
   "name": "G0-D1 Niv-Mizzet",
   "commanders": [
    "Niv-Mizzet, Parun"
   ],
   "description": "Niv-Mizzet, Parun draws you a card whenever any player casts an instant or sorcery, and each card you draw deals 1 damage. Saheeli and Shark Typhoon add a flier for each noncreature spell you cast, Draconic Visitor turns Thopters and Treasures into 5/5 Dragons, and the pings burn out the table.",
   "howToPlay": [
    "Keep three or four lands and a mana rock like Sol Ring, Arcane Signet or Izzet Signet, plus a cheap draw spell such as Brainstorm.",
    "Play Geist of Saint Thalia, Gandalf or Saheeli early, and dig with Faithless Looting and Thrill of Possibility for Niv's three blue and three red.",
    "Cast Niv-Mizzet, then chain cheap spells: Brainstorm alone draws four and deals 4 damage, and Draconic Visitor makes Saheeli's Thopters 5/5 Dragons.",
    "Hold Counterspell or Negate on other turns, save Octopus Form for Niv, and cast Old Fat Spider Can't See Me after Niv so it gives him hexproof.",
    "For a big turn, cast Underworld Breach and recast Brainstorm and other cheap spells from your graveyard that turn, so each one draws and pings again.",
    "Finish with pings while Gandalf and Purphoros burn each opponent; Kiki-Jiki copying Pestermite, which untaps Kiki-Jiki, is a late-game finisher."
   ],
   "named": [
    "Niv-Mizzet, Parun",
    "Saheeli, Jewel of Avishkar",
    "Shark Typhoon",
    "Draconic Visitor",
    "Sol Ring",
    "Arcane Signet",
    "Izzet Signet",
    "Brainstorm",
    "Geist of Saint Thalia",
    "Gandalf, Goblins' Bane // Flameshape",
    "Faithless Looting",
    "Thrill of Possibility",
    "Counterspell",
    "Negate",
    "Octopus Form",
    "Old Fat Spider Can't See Me",
    "Underworld Breach",
    "Purphoros, God of the Forge",
    "Kiki-Jiki, Mirror Breaker",
    "Pestermite"
   ]
  },
  "G0-D2": {
   "name": "G0-D2 Kaalia",
   "commanders": [
    "Kaalia of the Vast"
   ],
   "description": "Kaalia of the Vast attacks and puts Angels, Demons and Dragons from your hand into play attacking, two at a time with Windcrag Siege. Avacyn returns your nontoken creatures that die, Teysa doubles death triggers, and Archfiend of Despair turns a big swing into a finish.",
   "howToPlay": [
    "Keep three lands, a two-mana rock like Talisman of Conviction or Orzhov Signet, and at least one Angel, Demon or Dragon for Kaalia to drop.",
    "Play Swiftfoot Boots or Crashing Drawbridge before Kaalia so she attacks the turn she lands, and hold your big fliers in hand instead of casting them.",
    "Attack with Kaalia to put Avacyn, Akroma or Archfiend of Despair in tapped and attacking; Windcrag Siege set to Mardu drops two per attack.",
    "Add Teysa Karlov so Pitiless Plunderer makes two Treasures when another creature of yours dies; Draconic Visitor makes them 5/5 flying Dragons.",
    "Protect Kaalia with Teyo, Selfless Spirit or Valorous Stance, and answer threats with Swords to Plowshares, Vindicate or Mortify.",
    "Close with a big swing and Archfiend's end step drain, or feed Goblin Bombardment while Avacyn brings the nontoken ones back at end step."
   ],
   "named": [
    "Kaalia of the Vast",
    "Windcrag Siege",
    "Avacyn, Angel of Horror",
    "Teysa Karlov",
    "Archfiend of Despair",
    "Talisman of Conviction",
    "Orzhov Signet",
    "Swiftfoot Boots",
    "Crashing Drawbridge",
    "Akroma, Angel of Fury",
    "Pitiless Plunderer",
    "Draconic Visitor",
    "Teyo, Lightshield Expert",
    "Selfless Spirit",
    "Valorous Stance",
    "Swords to Plowshares",
    "Vindicate",
    "Mortify",
    "Goblin Bombardment"
   ]
  },
  "G0-D3": {
   "name": "G0-D3 Rhys",
   "commanders": [
    "Rhys the Redeemed"
   ],
   "description": "Rhys the Redeemed makes Elf Warriors, then copies every creature token you control. Queen Allenal and Cathars' Crusade grow each batch, Seedborn Muse lets Rhys go again on each opponent's turn, and Kinbinding turns the army into a lethal swing.",
   "howToPlay": [
    "Keep two or three lands with Llanowar Elves, Noxious Newt or Sol Ring so Rhys can start making Elf Warriors by turn three.",
    "Make an Elf with Rhys each turn; Woodland Weavemaster taps for mana that pays for Rhys, and Queen Allenal adds a Soldier to every batch.",
    "Set up Cathars' Crusade to grow the team with each batch and Welcoming Vampire or Tocasia's Welcome to draw once a turn; Skullclamp a 1/1 to draw two.",
    "Double your tokens with Rhys, then untap him with Thousand-Year Elixir or Village Bell-Ringer; Seedborn Muse lets him go again each opponent's turn.",
    "Hold Flawless Maneuver, free while Rhys is out, or Grand Crescendo for a wipe, and answer threats with Swords to Plowshares or Path to Exile.",
    "Before the final attack, double with Rhys: new tokens can't attack, but Kinbinding gives the rest +1/+1 for each, and Eldrazi Monument adds flying."
   ],
   "named": [
    "Rhys the Redeemed",
    "Queen Allenal of Ruadach",
    "Cathars' Crusade",
    "Seedborn Muse",
    "Kinbinding",
    "Llanowar Elves",
    "Noxious Newt",
    "Sol Ring",
    "Woodland Weavemaster",
    "Welcoming Vampire",
    "Tocasia's Welcome",
    "Skullclamp",
    "Thousand-Year Elixir",
    "Village Bell-Ringer",
    "Flawless Maneuver",
    "Grand Crescendo",
    "Swords to Plowshares",
    "Path to Exile",
    "Eldrazi Monument"
   ]
  },
  "G0-D4": {
   "name": "G0-D4 Kynaios and Tiro",
   "commanders": [
    "Kynaios and Tiro of Meletis"
   ],
   "description": "Kynaios and Tiro draw you a card at your end step and let each player put a land into play; opponents who pass on the land draw a card instead. Zendikar's Roil and Tatyova give you a 2/2 and a card for each land you put down, and the deck wins with a Moonshaker Cavalry swing or Simic Ascendancy.",
   "howToPlay": [
    "Keep three lands across your colors plus a fixer like Arcane Signet, Farseek or Sylvan Caryatid, since Kynaios costs white, blue, red and green.",
    "Ramp with Nature's Lore, Cultivate and Tireless Provisioner, and save spare lands in hand to put down at Kynaios's end step.",
    "Cast Zendikar's Roil, Tatyova and Valakut Exploration: each land makes a 2/2, draws a card and exiles one to play, twice with Ancient Greenwarden.",
    "Add land drops with Wayward Swordtooth and Way of the Paradox, which makes a Jace token and grants an extra land each time you use a loyalty ability.",
    "Use Wilderness Reclamation to untap your lands at end step, then hold Negate, Essence Scatter or Fuel for the Cause on other turns.",
    "Win with Moonshaker Cavalry over a Zendikar's Roil army, or reach 20 growth counters on Simic Ascendancy with Ezuri's combat counters."
   ],
   "named": [
    "Kynaios and Tiro of Meletis",
    "Zendikar's Roil",
    "Tatyova, Benthic Druid",
    "Moonshaker Cavalry",
    "Simic Ascendancy",
    "Arcane Signet",
    "Farseek",
    "Sylvan Caryatid",
    "Nature's Lore",
    "Cultivate",
    "Tireless Provisioner",
    "Valakut Exploration",
    "Ancient Greenwarden",
    "Wayward Swordtooth",
    "Way of the Paradox",
    "Wilderness Reclamation",
    "Negate",
    "Essence Scatter",
    "Fuel for the Cause",
    "Ezuri, Claw of Progress"
   ]
  },
  "G1-D1": {
   "name": "G1-D1 Saheeli",
   "commanders": [
    "Saheeli, Jewel of Avishkar"
   ],
   "description": "Saheeli, Jewel of Avishkar makes a hasty flying Thopter each time you cast a noncreature spell, and the deck is full of cheap artifacts. Impact Tremors and Purphoros turn each Thopter into damage, Skullclamp turns them into cards, and Eldrazi Monument or Goblin Bombardment finishes.",
   "howToPlay": [
    "Keep three lands and a cheap rock like Sol Ring, Arcane Signet or Talisman of Creativity so Saheeli can come down by turn three.",
    "Hold cheap artifacts like Ichor Wellspring and Thrór's Map until Saheeli is out, since every noncreature spell after that makes a Thopter.",
    "Add Impact Tremors, Purphoros or Witty Roastmaster next: each Thopter that enters then deals damage to every opponent.",
    "Equip Skullclamp to a Thopter to draw two cards for 1 mana, and use Trinket Mage to find Skullclamp or Sol Ring.",
    "Put Swiftfoot Boots on Saheeli, hold Counterspell or Divert Disaster for a wipe, and answer threats with Abrade or Fulminous Forte.",
    "Close with hasty Thopters under Eldrazi Monument, Myr Battlesphere with Warstorm Surge out, or Goblin Bombardment sacrificing the swarm."
   ],
   "named": [
    "Saheeli, Jewel of Avishkar",
    "Impact Tremors",
    "Purphoros, God of the Forge",
    "Skullclamp",
    "Eldrazi Monument",
    "Goblin Bombardment",
    "Sol Ring",
    "Arcane Signet",
    "Talisman of Creativity",
    "Ichor Wellspring",
    "Thrór's Map",
    "Witty Roastmaster",
    "Trinket Mage",
    "Swiftfoot Boots",
    "Counterspell",
    "Divert Disaster",
    "Abrade",
    "Fulminous Forte",
    "Myr Battlesphere",
    "Warstorm Surge"
   ]
  },
  "G1-D2": {
   "name": "G1-D2 Tatyova",
   "commanders": [
    "Tatyova, Benthic Druid"
   ],
   "description": "Tatyova, Benthic Druid draws a card and gains 1 life each time a land enters under your control, and the deck plays lands fast with ramp, fetch lands and extra land drops. Ancient Greenwarden doubles each landfall trigger, Zendikar's Roil builds an army, and Canopy Gargantuan or Emrakul closes.",
   "howToPlay": [
    "Keep three or four lands plus a ramp piece like Farseek, Nature's Lore or Arcane Signet.",
    "Ramp with Cultivate, Wood Elves or Farhaven Elf so Tatyova lands by turn four; pay 3 to exile Emrakul from hand and make a land tap for two.",
    "Once Tatyova is out, play fetch lands like Evolving Wilds and Fabled Passage for two draws each, and use Wayward Swordtooth for an extra land a turn.",
    "Cast Ancient Greenwarden to replay fetch lands from your graveyard and trigger Tatyova, Zendikar's Roil and Tireless Provisioner twice per land.",
    "Hold Mana Leak or Memory Lapse for wipes and Beast Within for threats; Seedborn Muse untaps your lands on each opponent's turn.",
    "Close with Canopy Gargantuan growing the Roil army at your upkeep and Ghalta giving it trample, or Emrakul, which untaps your lands as you cast it."
   ],
   "named": [
    "Tatyova, Benthic Druid",
    "Ancient Greenwarden",
    "Zendikar's Roil",
    "Canopy Gargantuan",
    "Emrakul, the Exigent Doom",
    "Farseek",
    "Nature's Lore",
    "Arcane Signet",
    "Cultivate",
    "Wood Elves",
    "Farhaven Elf",
    "Evolving Wilds",
    "Fabled Passage",
    "Wayward Swordtooth",
    "Tireless Provisioner",
    "Mana Leak",
    "Memory Lapse",
    "Beast Within",
    "Seedborn Muse",
    "Ghalta the Unstoppable"
   ]
  },
  "G1-D3": {
   "name": "G1-D3 Arcades",
   "commanders": [
    "Arcades, the Strategist"
   ],
   "description": "Arcades, the Strategist lets defenders attack for their toughness and draws a card whenever one enters, so the deck runs seventeen defenders that ramp, draw and hit hard. Tetsuko Umezawa, Fugitive makes 0-power defenders unblockable, and Tower Defense or Moonshaker Cavalry turns a swing lethal.",
   "howToPlay": [
    "Keep three lands and an early defender like Sylvan Caryatid, Overgrown Battlement or Axebane Guardian to ramp into Arcades.",
    "Cast Arcades on turn three or four, then play Carven Caryatid and Jungle Barrier after it so each draws its own card plus one from Arcades.",
    "Stack more draw with Mentor of the Meek, Welcoming Vampire and Tocasia's Welcome, and add Wingmantle Chaplain for a flying Bird per defender.",
    "Attack with defenders under Arcades; Tetsuko makes 0-power ones like Tree of Redemption unblockable, and Crashing Drawbridge grants haste.",
    "Hold Flawless Maneuver, free while Arcades is out, or Selfless Spirit for wipes, and answer threats with Swords to Plowshares or Path to Exile.",
    "Finish with Tower Defense after blocks for 5 more damage per defender, or Moonshaker Cavalry blinked by Ephemerate or Restoration Angel to pump twice."
   ],
   "named": [
    "Arcades, the Strategist",
    "Tetsuko Umezawa, Fugitive",
    "Tower Defense",
    "Moonshaker Cavalry",
    "Sylvan Caryatid",
    "Overgrown Battlement",
    "Axebane Guardian",
    "Carven Caryatid",
    "Jungle Barrier",
    "Mentor of the Meek",
    "Welcoming Vampire",
    "Tocasia's Welcome",
    "Wingmantle Chaplain",
    "Tree of Redemption",
    "Crashing Drawbridge",
    "Flawless Maneuver",
    "Selfless Spirit",
    "Swords to Plowshares",
    "Path to Exile",
    "Ephemerate",
    "Restoration Angel"
   ]
  },
  "G1-D4": {
   "name": "G1-D4 Arbaaz Mir",
   "commanders": [
    "Arbaaz Mir"
   ],
   "description": "Arbaaz Mir deals 1 damage to each opponent and gains you 1 life whenever a nontoken artifact, legend or Saga enters under your control, and most of the deck qualifies. Teshar, Sun Titan and Serra Paragon replay cheap pieces for more pings, and Bayek of Siwa or Zetalpa, Primal Dawn wins in combat.",
   "howToPlay": [
    "Keep three lands and cheap historic plays like Sol Ring, Mind Stone or Dori, Bearer of Friends to follow Arbaaz.",
    "Cast Arbaaz on turn two, then add legends like Venat, Heart of Hydaelyn, which draws a card the first time you cast a legendary spell each turn.",
    "Add Teshar, Ancestor's Apostle or Sun Titan to replay cheap pieces from your graveyard, and loop Squee, Goblin Nabob with Skullclamp for cards.",
    "Cast adventures like Spew Flame first and the creature later from exile; Quintorius Kand deals 2 to each opponent per spell cast from exile.",
    "Protect Arbaaz with Teyo, Bofur's Concerted Care or Plaza of Heroes, and answer threats with Swords to Plowshares or Wrath of the Bloodmane.",
    "Swing with Bayek's double strike or Odric sharing Zetalpa's keywords; late, Kiki-Jiki, Mirror Breaker copying Bell-Ringer makes endless hasty copies."
   ],
   "named": [
    "Arbaaz Mir",
    "Teshar, Ancestor's Apostle",
    "Sun Titan",
    "Serra Paragon",
    "Bayek of Siwa",
    "Zetalpa, Primal Dawn",
    "Sol Ring",
    "Mind Stone",
    "Dori, Bearer of Friends",
    "Venat, Heart of Hydaelyn // Hydaelyn, the Mothercrystal",
    "Squee, Goblin Nabob",
    "Skullclamp",
    "Smaug, the Great Calamity // Spew Flame",
    "Quintorius Kand",
    "Teyo, Lightshield Expert",
    "Bofur, Reliable Guardian // Concerted Care",
    "Plaza of Heroes",
    "Swords to Plowshares",
    "Wrath of the Bloodmane",
    "Odric, Lunarch Marshal",
    "Kiki-Jiki, Mirror Breaker",
    "Village Bell-Ringer"
   ]
  },
  "CJ1": {
   "name": "CJ1 Tam",
   "commanders": [
    "Tam, the Possibility"
   ],
   "description": "Tam superfriends that proliferates every walker at once: Tam proliferates once per walker type, Tekuthal doubles each proliferate, and Ichormoon Gauntlet turns loyalty into extra turns. It wins with Jace, Reality Sculptor's library exile or Simic Ascendancy at 20 growth counters.",
   "howToPlay": [
    "Keep three lands and a rock like Sol Ring, Arcane Signet or Chromatic Lantern, since Tam's ability needs all five colors.",
    "Cast Tam early so walkers cost one less, then add Narset, Oko or Kasmina, or a Way enchantment to make the Jace token.",
    "Pay WUBRG and tap Tam to proliferate once per walker type you control; Tekuthal makes each of those proliferates happen twice.",
    "Cast Ichormoon Gauntlet to give each walker 0: Proliferate and -12: extra turn, and add Seedborn Muse so Tam untaps on each opponent's turn.",
    "Hold Counterspell, Fuel for the Cause or Negate for wipes; Shalai gives your walkers hexproof, and Teyo can flash in to save one.",
    "Close with Jace, Reality Sculptor's 0 at 25 Jace loyalty, or push Simic Ascendancy to 20 growth counters with proliferate and Aetheric Amplifier."
   ],
   "named": [
    "Tam, the Possibility",
    "Tekuthal, Inquiry Dominus",
    "Ichormoon Gauntlet",
    "Jace, Reality Sculptor",
    "Simic Ascendancy",
    "Sol Ring",
    "Arcane Signet",
    "Chromatic Lantern",
    "Narset, Parter of Veils",
    "Oko, Thief of Crowns",
    "Kasmina, Enigma Sage",
    "Seedborn Muse",
    "Counterspell",
    "Fuel for the Cause",
    "Negate",
    "Shalai, Voice of Plenty",
    "Teyo, Lightshield Expert",
    "Aetheric Amplifier"
   ]
  },
  "CJ2": {
   "name": "CJ2 Chulane",
   "commanders": [
    "Chulane, Teller of Tales"
   ],
   "description": "Chulane draws a card and can drop a land each time you cast a creature, and creatures that return themselves to hand let you trigger it again and again. Omnipresence makes those recasts free, and Freed from the Real on Faeburrow Elder makes endless mana for a huge Moonshaker Cavalry attack.",
   "howToPlay": [
    "Keep two or three lands with a mana creature like Llanowar Elves, Noxious Newt or Great Forest Druid so Chulane lands by turn four.",
    "Cast Chulane as early as you can, then chain cheap creatures: each one draws a card and can put a land from your hand onto the battlefield.",
    "Recast Shrieking Drake, Kor Skyfisher and Dream Stalker by having them return themselves, and blink Peregrine Drake with Ephemerate for mana.",
    "Cast Omnipresence with a wide board so cheap spells are free; each free Shrieking Drake loop draws a card, so stop before your library runs out.",
    "Hold Counterspell or Glen Elendra Guardian for a wipe, and save the board with Selfless Spirit or a free Flawless Maneuver.",
    "Close with Freed from the Real on Faeburrow Elder for endless mana, then bounce and recast Moonshaker Cavalry with Temur Sabertooth and attack."
   ],
   "named": [
    "Chulane, Teller of Tales",
    "Omnipresence",
    "Freed from the Real",
    "Faeburrow Elder",
    "Moonshaker Cavalry",
    "Llanowar Elves",
    "Noxious Newt",
    "Great Forest Druid",
    "Shrieking Drake",
    "Kor Skyfisher",
    "Dream Stalker",
    "Peregrine Drake",
    "Ephemerate",
    "Counterspell",
    "Glen Elendra Guardian",
    "Selfless Spirit",
    "Flawless Maneuver",
    "Temur Sabertooth"
   ]
  },
  "CJ3": {
   "name": "CJ3 Krenko",
   "commanders": [
    "Krenko, Mob Boss"
   ],
   "description": "Krenko, Mob Boss doubles your Goblins every time he taps, and Impact Tremors and Purphoros turn each new token into damage. With Thornbite Staff on Krenko, Goblin Bombardment ends it: each Goblin you sacrifice deals 1 damage and untaps Krenko to make more.",
   "howToPlay": [
    "Keep two or three Mountains with Sol Ring or a cheap Goblin like Skirk Prospector, aiming to cast Krenko on turn three or four.",
    "Go wide early with Goblin Instigator, Krenko's Command and Mogg War Marshal, and play Goblin Warchief so Krenko has haste.",
    "Tap Krenko every turn: each tap doubles your Goblins, and Impact Tremors, Purphoros and Witty Roastmaster turn each token into damage.",
    "Find missing pieces with Goblin Matron and Gamble, or stack Goblins on top with Goblin Recruiter and cast them with Conspicuous Snoop.",
    "Keep Swiftfoot Boots on Krenko for hexproof, and save Abrade or Chaos Warp for the blocker or artifact that stops your attack.",
    "Close with Thornbite Staff on Krenko and Goblin Bombardment for unlimited damage, or Kiki-Jiki copying Zealous Conscripts for endless hasty attackers."
   ],
   "named": [
    "Krenko, Mob Boss",
    "Impact Tremors",
    "Purphoros, God of the Forge",
    "Thornbite Staff",
    "Goblin Bombardment",
    "Sol Ring",
    "Skirk Prospector",
    "Goblin Instigator",
    "Krenko's Command",
    "Mogg War Marshal",
    "Goblin Warchief",
    "Witty Roastmaster",
    "Goblin Matron",
    "Gamble",
    "Goblin Recruiter",
    "Conspicuous Snoop",
    "Swiftfoot Boots",
    "Abrade",
    "Chaos Warp",
    "Kiki-Jiki, Mirror Breaker",
    "Zealous Conscripts"
   ]
  },
  "CJ4": {
   "name": "CJ4 Tymna + Kraum",
   "commanders": [
    "Tymna the Weaver",
    "Kraum, Ludevic's Opus"
   ],
   "description": "The combo build of Tymna and Kraum, made to win fast. Kiki-Jiki, Mirror Breaker or Splinter Twin with Pestermite or Deceiver Exarch makes endless hasty copies, while Tymna and Kraum draw into the pieces and counters guard the combo turn.",
   "howToPlay": [
    "Keep two or three lands, Sol Ring or Arcane Signet, and a combo piece or a tutor.",
    "Cast Tymna early and attack open players with Kraum or Selfless Spirit: she draws a card per opponent dealt combat damage, for 1 life each.",
    "Find the missing piece with Gamble, Diabolic Tutor, Recruiter of the Guard, or Drift of Phantasms transmuting for Pestermite or Deceiver Exarch.",
    "Flash Pestermite or Deceiver Exarch in at an opponent's end step, then add Kiki-Jiki, Mirror Breaker or Splinter Twin on your turn to go infinite.",
    "Win with one attack of hasty copies or through Goblin Bombardment, and protect the combo turn with Teyo, Lightshield Expert or Swiftfoot Boots.",
    "If the combo is answered, play control: Counterspell, Memory Lapse, Swords to Plowshares and Despark hold the table until the next piece."
   ],
   "named": [
    "Tymna the Weaver",
    "Kraum, Ludevic's Opus",
    "Kiki-Jiki, Mirror Breaker",
    "Splinter Twin",
    "Pestermite",
    "Deceiver Exarch",
    "Sol Ring",
    "Arcane Signet",
    "Selfless Spirit",
    "Gamble",
    "Diabolic Tutor",
    "Recruiter of the Guard",
    "Drift of Phantasms",
    "Goblin Bombardment",
    "Teyo, Lightshield Expert",
    "Swiftfoot Boots",
    "Counterspell",
    "Memory Lapse",
    "Swords to Plowshares",
    "Despark"
   ]
  },
  "CJ5": {
   "name": "CJ5 Dragonlord Dromoka",
   "commanders": [
    "Dragonlord Dromoka"
   ],
   "description": "Dragonlord Dromoka can't be countered and stops opponents from casting spells on your turn, so your main phases are safe. Haystack hides her on other turns, a deep set of answers clears the way, and she wins with lifelink commander damage, doubled by Yuriko, or a Moonshaker Cavalry swing.",
   "howToPlay": [
    "Keep three lands and a ramp piece like Llanowar Elves, Sylvan Caryatid or Sol Ring, so the six-mana Dromoka arrives by turn four or five.",
    "Spend early turns on value creatures like Wood Elves, Tireless Provisioner and Welcoming Vampire, and exile real threats with Swords to Plowshares.",
    "Cast Dromoka as soon as you can: she can't be countered, and while she is out opponents can't cast spells during your turn.",
    "Activate Haystack at your end step to phase Dromoka out until your next turn, so removal and wipes on other turns miss her.",
    "Cast Wilderness Reclamation or Seedborn Muse so you untap for other turns, and hold up Settle the Wreckage, Guardian of Faith or Restoration Angel.",
    "Close with Dromoka's lifelink swings; Yuriko gives her double strike when she attacks a player alone, or Moonshaker Cavalry pumps the whole team."
   ],
   "named": [
    "Dragonlord Dromoka",
    "Haystack",
    "Yuriko, Blade of the Mighty",
    "Moonshaker Cavalry",
    "Llanowar Elves",
    "Sylvan Caryatid",
    "Sol Ring",
    "Wood Elves",
    "Tireless Provisioner",
    "Welcoming Vampire",
    "Swords to Plowshares",
    "Wilderness Reclamation",
    "Seedborn Muse",
    "Settle the Wreckage",
    "Guardian of Faith",
    "Restoration Angel"
   ]
  },
  "HG1": {
   "name": "HG1 Denzilore Fatehold",
   "commanders": [
    "Denzilore Fatehold"
   ],
   "description": "Denzilore Fatehold puts a +1/+1 counter on each creature you control whenever you scry or surveil. The Jace token surveils on each of your turns, Yoshimaru adds an extra counter each time, Proft pays 2 to draw off each look, and a wide team of fliers wins with Moonshaker Cavalry.",
   "howToPlay": [
    "Keep three lands and a rock like Sol Ring or Azorius Signet, plus a cheap scry or surveil card like Foraging Wickermaw or Eye of Jace.",
    "Play cheap fliers like Fatehold Chronologist, Glider Kids and Unwelcome Sprite so Denzilore has a team to grow.",
    "Flash in Denzilore on an opponent's end step, then make the Jace token with Theorist's Proxy or a Way enchantment to surveil on each of your turns.",
    "Add Yoshimaru for an extra counter each time, Proft to pay 2 and draw on each scry or surveil, and Saheeli for a Thopter once a turn.",
    "Hold Counterspell or Countersculpt for a wipe, and save the team with Selfless Spirit or a free Flawless Maneuver while Denzilore is out.",
    "Close with Moonshaker Cavalry for a team-wide +X/+X flying swing, or fill the board with Elspeth's Soldiers and let each surveil grow them."
   ],
   "named": [
    "Denzilore Fatehold",
    "Yoshimaru, Beloved Companion",
    "Proft, Consulting Detective",
    "Saheeli, Consul of Oversight",
    "Moonshaker Cavalry",
    "Sol Ring",
    "Azorius Signet",
    "Foraging Wickermaw",
    "Eye of Jace",
    "Fatehold Chronologist // Peer Review",
    "Glider Kids",
    "Unwelcome Sprite",
    "Theorist's Proxy",
    "Counterspell",
    "Countersculpt",
    "Selfless Spirit",
    "Flawless Maneuver",
    "Elspeth, Sun's Champion"
   ]
  },
  "HG2": {
   "name": "HG2 Tymna + Kraum",
   "commanders": [
    "Tymna the Weaver",
    "Kraum, Ludevic's Opus"
   ],
   "description": "The Dragon-token build of Tymna and Kraum: Draconic Visitor turns every Treasure, Thopter and Clue you make into a 5/5 flying Dragon. Impact Tremors, Purphoros and Warstorm Surge turn each new Dragon into damage, and the fliers feed Tymna's draws.",
   "howToPlay": [
    "Keep three lands with Sol Ring, Arcane Signet or Chromatic Lantern and a Treasure maker like Goblin Glasswright or Dori, Bearer of Friends.",
    "Ramp on Treasures from Long-Bodied Grey Dog and The Misty Mountains Cold, then attack with fliers: Tymna draws one per opponent hit, for 1 life each.",
    "Land Draconic Visitor, then make artifact tokens: Saheeli's Thopters, Skrelv's Hive Mites and Myr Battlesphere's four Myr all arrive as 5/5 Dragons.",
    "Get Impact Tremors, Purphoros or Corpse Knight out first so each Dragon that enters hits every opponent; Warstorm Surge has each deal 5 to any target.",
    "Answer threats with Swords to Plowshares, Path to Exile or Counterspell; after a wipe, Karmic Guide returns Draconic Visitor to the battlefield.",
    "Late, pair Ganax with Draconic Visitor for endless Dragons; the loop is mandatory, so first have a payoff out or Viscera Seer to sacrifice Ganax."
   ],
   "named": [
    "Tymna the Weaver",
    "Kraum, Ludevic's Opus",
    "Draconic Visitor",
    "Impact Tremors",
    "Purphoros, God of the Forge",
    "Warstorm Surge",
    "Sol Ring",
    "Arcane Signet",
    "Chromatic Lantern",
    "Goblin Glasswright // Craft with Pride",
    "Dori, Bearer of Friends",
    "Long-Bodied Grey Dog",
    "The Misty Mountains Cold",
    "Saheeli, Jewel of Avishkar",
    "Skrelv's Hive",
    "Myr Battlesphere",
    "Corpse Knight",
    "Swords to Plowshares",
    "Path to Exile",
    "Counterspell",
    "Karmic Guide",
    "Ganax, Astral Hunter",
    "Viscera Seer"
   ]
  }
 }
}
```

</details>
