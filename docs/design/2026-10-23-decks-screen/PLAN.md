# Decks screen and New deck flow: the plan

**Status:** waiting for Rob's go. Nothing is built yet. Written at kickoff, 2026-10-23, from
`crankmagic-decks-requirements.md` (this folder), read against main `a031003`.
**Order:** Part C, then Part A, then Part B (§0 of the requirements).
**Left out:** §17 (PRO-1 to PRO-10), until Rob says which to keep. The other **Proposed** lines (GEN-7, GEN-8, GEN-9) are
left out under the same rule (§0: "build only if he keeps it").

---

## 1. Where the work goes

**Branch:** `claude/vibrant-turing-50yl3r`, this session's assigned branch, one draft PR. It is not merged here: the merge
session merges it after the other six sessions' engine and card-load work. Commits go in phase order (C, A, B) so each
phase can be read, and reverted, on its own.

**Lanes (requirements §19, `AGENTS.md`).** Rob has named this session for both lanes the Decks work spans. Both were
free in `docs/ACTIVE.md` (Workshop: "free for the next session Rob names"; Deck intelligence: closed October 18).

| Lane | Files this work edits |
| --- | --- |
| **Codex · Workshop** | `crankmagic-decks.js`, `crankmagic-sharing.js`, `crankmagic-how.js`, `crankmagic-build.js` (retired), `crankmagic-app.js` (the shell: nav, `cardPicker`, routes), `crankmagic-pull.js`, `crankmagic-settings.js` (Settings › Data), `crankmagic-collection.js` (Library: its sort, Shared Libraries), `collection-model.js`, `collection-exchange.js`, `cloud/sharing.mjs`, `crankmagic.css`, `docs/card-states.md`, `docs/design/**`, and their suites |
| **Claude · Deck intelligence** | `tools/build-live-load.mjs`, `tests/live-load.mjs`, `data/deck-writeups-2026-10-23.json`, new vocabulary data and its tool, `deck-generator.js`, `deck-synergies.js`, `crankmagic-strategies.js`, `data/commander-strategies.json`, `data/composition-targets.json`, a new `deck-recommend.js`, and their suites |
| **Read, never edited** | `crankmagic-table.js`, `crankmagic-lobby.js` (Codex · Play); `game/**`, `cloud/worker.mjs` (Claude · Engine) |

**Against the six engine sessions.** They work in `game/**`, `data/engine/**` and the card loads; none of those files is
above. What the merge session reconciles is only the shared files the rules already name: the `?v=` asset versions
(`node tests/asset-versions.mjs --update`), the README's suite count, and `docs/ACTIVE.md` (this session writes only its
own section).

---

## 2. Part C: Description and How to play (DPG-1 to DPG-9)

| Step | What | IDs | Files |
| --- | --- | --- | --- |
| C1 | The deck gains `description` (300 characters at most) and `howToPlay` (4 to 6 steps, 150 characters each). `editDeck` takes both; the model refuses an over-limit value with a plain message ("A description is 300 characters at most."). A backup carrying them restores; the exchange format carries them. | DPG-1 | `collection-model.js`, `collection-exchange.js` |
| C2 | The deck header shows `description` where `cm-deck-strategy` prints the notes today. Overview opens with **How to play**, a numbered list. `notes` shows only under "Your notes" in the Strategy dialog and in the edit form. | DPG-2, 3, 4 | `crankmagic-decks.js`, `crankmagic.css` |
| C3 | The edit form gains **Description** and **How to play** (one step per line). | DPG-8 | `crankmagic-decks.js` |
| C4 | The backup builder stops writing the Deck Reference text into `notes`, writes `description` and `howToPlay` from the write-ups file, and keeps the row in `reference`. | DPG-7 | `tools/build-live-load.mjs`, `tests/live-load.mjs` |
| C5 | **Apply deck write-ups** in Settings › Data: reads `data/deck-writeups-2026-10-23.json`, matches by `deck:live:<ID>` then by a name starting "<ID> ", previews matched, unmatched and kept notes, and on confirm commits one `editDeck` per deck through the change journal. Notes are cleared only where they still equal the text the backup wrote. | DPG-5, 6 | `crankmagic-settings.js`, a small sidecar (below) |
| C6 | The write-ups file is committed (done, this commit) and checked: 34 entries, the limits, and every `named` card in its deck's list. | DPG-9 | `tests/live-load.mjs`, new `tests/deck-writeups.mjs` |

**Already checked at kickoff:** the committed JSON is byte-for-byte Appendix B; all 34 descriptions are within 300
characters and every deck has 6 steps within 150; built from the 10-21 workbook, all 34 decks are found by id with the
same name, and every one of the 34 entries' `named` cards is in that deck's list (0 missing).

**Proof:** `tests/live-load.mjs` (updated), `tests/deck-writeups.mjs` (new, needs no workbook), `tests/deck-page-r3.mjs`
(header, Overview, edit form), a browser check of Apply's preview, commit and undo, and a break for each new check.

---

## 3. Part A: Decks screen (capture 1)

| Step | What | IDs | Files |
| --- | --- | --- | --- |
| A1 | **The stage reader.** `deckStatus` gains `stage: 'building' \| 'defined'`, a `boxed` flag, and the two counts that decide them (seats on the list, cards in the box), over the same seats Play reads (`deckForTable`). Playable = Defined plus the table's own check, read, not copied. Every screen reads this; none works it out. | §2 | `collection-model.js`, new `tests/deck-stages.mjs` |
| A2 | **Substitute · Loading** (Q1's default): a stand-in chosen for a Reserved seat, owned, not in the box yet. Chosen on the deck page from a Reserved row; listed in Ready to add; boxed by Box choice 2. The wording waits for Rob's approval of `card-states.md`. | Q1, BOX choice 2 | `collection-model.js`, `docs/card-states.md`, `tests/card-states.mjs`, `crankmagic-decks.js`, `crankmagic-pull.js` |
| A3 | **The nav.** One function builds the five entries (My Decks, Favorites, Create, Shared, About Deck Building); no deck names. The sharing wrapper goes. Shared Libraries move under Library (Q9). | NAV-1 to 8, Q9 | `crankmagic-decks.js`, `crankmagic-sharing.js`, `crankmagic-app.js`, `crankmagic-collection.js` |
| A4 | **The chips.** All · Boxed · Defined · Building · Playable · Shared; they overlap; the tile badge is the stage word; the address carries the view (`?stage=…&fav=1&public=1`), old values open All; help text rewritten; Complete retires from screen. The Shared chip draws shared decks as tiles with the owner's name and an **Include public decks** toggle, which needs `/shares` to say whether access is a private grant or public. | FLT-1 to 10, Q5 to Q8 | `crankmagic-decks.js`, `crankmagic-sharing.js`, `cloud/sharing.mjs`, `tests/sharing.mjs` |
| A5 | **Favorites.** A star between the checkbox and ⋯, a real toggle button with `aria-pressed`; a favorite's star stays visible; the Favorites filter combines with the chips; stored with the account (`preferences.favoriteDecks`), a deleted deck drops out. | FAV-1 to 7 | `collection-model.js`, `crankmagic-decks.js`, `crankmagic.css` |
| A6 | **Selection and Bulk actions.** "Compare (n)" becomes **Bulk actions (n)**: Compare decks, Box deck(s)…, Add to group…, Favorite/Unfavorite, Remove deck(s)…. A shared deck in the selection greys Box, group and Remove. A chip change clears the selection; every action ends in a notice. Add to group uses deck sets (Q3); Remove offers Archive or Delete permanently (Q4). | SEL-1 to 10, Q3, Q4 | `crankmagic-decks.js`, `collection-model.js` |
| A7 | **Box decks.** One dialog for one or many decks; three cumulative choices with each deck's count before Box; choice 3 names every donor deck, its cards and any stage change; each move is `place`; a copy two decks want goes to the first on the grid; a result notice per deck. Nothing is locked, bought or ordered. | BOX-1 to 9, Q2 | `crankmagic-decks.js`, `collection-model.js` |
| A8 | **About Deck Building.** Renamed everywhere, at `#about-deck-building` with `#how` still opening it, rewritten to the outline, its ladder read from the model's vocabulary. | ABT-1 to 5 | `crankmagic-how.js`, `collection-model.js` (vocabulary export) |

**Proof:** `tests/deck-stages.mjs` (new: the four stages at their edges, 99 and 100 seats, Rob's worked example as a
fixture giving 55, 65 and 70); `tests/card-states.mjs` (Q1); `tests/decks-hub.mjs` (chips, badges, nav, favorites,
address); a new browser suite for Bulk actions and the Box dialog at 1400 and 390 wide; `tests/sharing.mjs` (the
grant/public field); `tests/feature-wiring.mjs` (the old names gone from screen); a break for each.

---

## 4. Part B: New deck flow (capture 2)

The engine comes before the screens that show it, so each screen is built on real answers.

| Step | Lane | What | IDs |
| --- | --- | --- | --- |
| B1 | Workshop | **Format registry and the shell.** One registry entry per format (size, singleton, commander required, color identity rule, legality list); every deck reads as Commander. A deck may be a shell with no commander and no cards. Adding any card to a Commander deck with no commander is refused in the model, so every door is covered, with "Choose a commander first" and a button that opens Start from. | FMT-1 to 5, SHL-1 to 4 |
| B2 | Deck intelligence | **One vocabulary for play styles and one for mechanics**, built by a tool into `data/`: the 16 strategies under community names plus Walls and Defenders, Voltron, Superfriends and Go wide (the classifier learns these four), with Tribal's sub-options; and the graph's mechanics and roles on at least 50 cards, with an alias list for display names. A commander index answers color (exact, or including), play style and mechanic matches, owned first, then EDHREC rank. | Q12, Q13, Q10, Q11, STF-8 |
| B3 | Deck intelligence | **Recommendations** (`deck-recommend.js`), no AI: the commander's mechanics written into the definition marked "from the commander"; candidates from `CrankGraph.relate`, `CrankLoops` and `deck-synergies.js`, scored against the definition, each carrying the relation that put it there; one pool counter behind GPL-4's fit, GPL-5's "Let CrankMagic choose" and MEC-4's flags. Same inputs, same answer. | REC-1 to 6, GPL-4, GPL-5, MEC-3, MEC-4 |
| B4 | Deck intelligence | **Auto-create's engine.** The six weightings (Defense is new in `composition-targets.json`); a slot definition for each of the 99, saved with the deck; the generator fed the definition, weighting, card sources, restriction switches and recommendations; at least 8 cards per chosen mechanic, at most 3 mechanics; up to 5 alternatives per slot. | CRD-4, 6, 7, 8, GEN-3, GEN-6, RVW-2 |
| B5 | Workshop | **The frame and Start from.** The shared pop-up frame (about 720px, left nav, one primary button bottom right, no explanatory copy; a row across the top at 390px). Start from's four methods, the name field, the second commander slot, Next. New deck's Create opens it; the old Create pop-up and the four-step Build wizard are removed; their collection-group road moves to Merge in a Group. | DLG-1 to 4, STF-1 to 10, NEW-1 to 3, Q14 |
| B6 | Workshop | **Define the Deck.** Define or Leave undefined; General, Gameplay (Experience and Composition), Mechanics, Cards; Back keeps the commander; a different commander recomputes only what came from it. Merge in a Group puts the group's cards on the list (Q16). | DEF-1 to 7, GEN-1 to 6, GPL-1 to 6, MEC-1 to 5, CRD-1 to 3, 5, 6, 9, Q15 to Q17 |
| B7 | Workshop | **The review screen.** The 99 without basics as thumbnails by slot role, alternatives on click, batch Remove, the summary bar; Create deck enters each card by its source (Bench as Loading, to buy as Reserved · To buy, another deck's as Reserved · in Dn), as a draft. The Lab's "Draft the 99" stops being a way to start a deck. | RVW-1 to 7, CRD-9 |
| B8 | Workshop | Library, scoped to a deck, sorts by the deck's recommendations. | REC-5 |

**Proof:** node suites for the registry and shell refusals at every door, the vocabulary (counts and aliases), the
recommender (run twice, the same answer; each card names its relation), and the generator (slot definitions, the
mechanic bar, sources honored); browser suites for Start from, Define the Deck and the review at 1400 and 390 wide; a
check that nothing in the flow calls a model (REC-3); a break for each.

---

## 5. The open questions (§16): the defaults I will build

Rob has answered none of these yet, so each default is built and the PR says so.

| # | Default to build |
| --- | --- |
| Q1 | Add **Substitute · Loading** to the model: a stand-in chosen for a Reserved seat, owned, not in the box. Chosen on the deck page; Box choice 2 boxes them. **Needs Rob's approval of the wording in `card-states.md`.** |
| Q2 | The donor deck keeps the card on its list and that seat goes back to **Reserved · To buy**, so a Boxed donor drops to Defined. |
| Q3 | **Deck sets** (S0, G1, TB5…): pick one or create one, a deck may be in several, shown as a tag on the tile. No filtering by set yet. |
| Q4 | Remove confirms with **Archive** as the main button and **Delete permanently** as a second, red one. |
| Q5 | All is your own decks only. Shared decks live under Shared. |
| Q6 | Chips overlap; each tile's badge shows its furthest stage. |
| Q7 | Defined does not need Lock list; the seat count decides. "Locked" stays a tag. |
| Q8 | Include public decks is off by default and remembered per person. |
| Q9 | Shared Libraries move under the Library nav. |
| Q10 | Exact color identity, with an **Include more colors** toggle. |
| Q11 | A sixth icon, **C**, that can't be combined with the five. |
| Q12 | One list for play style and Composition: the 16 strategies under community names, plus Walls and Defenders, Voltron, Superfriends and Go wide, which the classifier learns. |
| Q13 | The graph's mechanics and roles on at least 50 cards (about 63, plus roles), display names cleaned by an alias list; one list for Start from and Mechanics. |
| Q14 | A **Second commander** slot appears when the first allows one, limited to legal pairs; optional. |
| Q15 | Experience adds pilot difficulty: Beginner, Intermediate or Advanced, beside Saltiness, Speed and Competitiveness. |
| Q16 | Merge in a Group puts the cards on the list, within the card sources; cards outside the colors or past the hundred are listed and left out. |
| Q17 | One primary composition and one optional second. |

---

## 6. Calls I made where the doc is silent (say no to any)

1. **One branch, not two.** The work spans two lanes, but the harness assigns this session one branch; the lanes stay
   separate by file. Lane-named branches (`codex/workshop-decks`, `claude/deck-writeups`) are possible if Rob prefers.
2. **A deck without a write-up has no steps.** `howToPlay` is empty or 4 to 6 steps; 1 to 3 are refused.
3. **DPG-6 needs the backup's own text to compare against.** The app's decks don't keep the Deck Reference row, so the
   builder writes a small sidecar, `data/deck-reference-2026-10-21.json`, with a SHA-256 of each deck's notes as the
   backup wrote them (no prose). Apply clears notes only on a match. The write-ups file stays exactly as Rob gave it.
4. **The deck page's stage badge reads the same stage word.** Today it says "Building" for any deck not yet playable,
   which would contradict a Defined deck's tile.
5. **Deck sets are names on the deck** (`deck.sets`), the list to pick from being the names in use; not a separate
   object with ids. It is enough for pick, create, several per deck and a tag; a rename would need the object later.
6. **Favorites and the public toggle live in the account's preferences**, which already sync with the library.
7. **The lobby's deck chooser** (Codex · Play) shows a deck's notes today. Once notes are the owner's own, it should
   show the description; that is asked of Play in the Requests table, not edited here.
8. **Defense** gets a first weighting (more removal, protection and blockers, fewer threats). The numbers are named in
   the PR for Rob to tune.
9. **Rob's own library isn't reachable from this container.** DPG-5's "all 34 match" is proved on a library built from
   the 10-21 workbook, the same one his backup came from; the match on his restored library is his to see.

---

## 7. Risks

- **Part B is most of the work.** B2 (the classifier learning four archetypes, and regenerating
  `data/commander-strategies.json`) and B4 (slot definitions in the generator) are the deepest changes.
- **Q1 changes the card ladder Rob approved on October 18.** If he picks the alternative (the dialog proposes stand-ins
  at box time), A2 shrinks and the card ladder stays as it is.
- **FMT-3 refuses adds, never loads.** A stored deck with no commander still opens; only adding a card to it is refused.
- **Browser suites in this container:** they run on the installed Chromium; `table-tabletop` runs out of memory here on
  main too (recorded October 21) and isn't one this work touches.

---

## 8. What the merge session gets

At each phase's end, a status in `docs/ACTIVE.md` (this session's section) and on the PR, in `AGENTS.md`'s four parts:
the branch and commit, what is proved and what is assumed, the command that proves each claim, and what is outstanding.
The merge session merges `main` in, regenerates the asset versions, sets the README's suite count, runs the full suites
and merges.
