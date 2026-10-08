# CrankMagic

**An Intelligent MtG: Commander Deck Creator & Card Libary**

A private Commander deck workshop and card library. Plan a deck, review its composition
and commander, track exactly which prints you own, reserve copies, receive orders,
assemble physical decks, explore card relationships, and manage Sell / Trade records.

Dark blue/graphite, Satoshi, a local wand/gear logo and animated aether mist. Semantic
left-aligned tables support sorting, filtering, grouping, chosen columns and compact
Actions menus. Navigation remains reachable while scrolling and on a phone.

Plain HTML, CSS and JavaScript. No package.json, build step, runtime framework,
application server or account. User records live in transactional browser IndexedDB;
full JSON backups, reviewed CSV/text/XLSX imports and enriched Excel exports give the
user control of their data. Loading a plan never asserts ownership.

## Run

```sh
python3 -m http.server 8790
```

Open `http://localhost:8790/`. Serve the same files on HTTPS for production. Opening
application HTML as `file://` does not provide the required origin/fetch/storage behavior.
The approved standalone mockup remains under `design/crankmagic/` for design reference.

## Application

Every page opens on its name, with one primary action and at most three beside it; the
rest of a page's actions sit under **More**, and what the page does and how its figures are
counted sit behind its **?**. The nav reads **Decks · Cards · Build · Discover · Play**: Collection
and Shop are one page, **Cards**, with tabs *Library · To buy · Orders* and three views on the
tab row under *More* — **List · Sheet · Table** (the rows, the Master sheet, the tabletop; a
view a tab lacks shows disabled with the reason, and the switch keeps the tab it is on) —
over a row of count chips that filter (*Reserved · Owned · Substitutes · Physical deck ·
Ordered · To buy · Watched*; a click keeps the rows in that status, a second lets them back);
`#collection` and `#shop` still open it. The nav opens the page you are on:
under **Cards** its four sub-pages (Library · To buy · Orders · Sheet, with counts), under
**Decks** your decks and the How page, the current one marked. Glossary underlines in rules text are off until **Show term
definitions** (deck page More menu, card pop-up) turns them on for the library.

- **Decks** (`#decks`): plans and assembly status. A deck page is five tabs on the route
  (`#decks?deck=…&tab=cards|guide|upgrades|history`): **Overview** — the hero, the Progress and
  Cost card, one *Next:* line in the order the work happens, and *The hundred at a glance* —
  the curve and type counts, the hundred by card type and by Primary Purpose as two keyed
  bars, and the key strategy in the strategy vocabulary's own words, read off the commander's
  rules text and the deck's named mechanics (`CrankStrategies.describe`, deterministic, no
  model); **Cards** — the hundred by type
  with where each copy stands, the composition at its head; **Guide** — the commander, the
  strategy and structural SWOT; **Upgrades** — the working list and the Upgrade Path;
  **History** — the game record and every measured run. The hero row is the work (Ready to
  add, Buy list, Log a game, Measure, More); on a phone the three work actions are a fixed bar
  at the foot of the screen. Compare, finalize, lock and archive as before. Each
  tile wears its stage — Defining, Building, Playable, Complete — and one caption that says
  each figure once. A plain link on the page, **How a deck comes together** (`#how`), is a one-screen
  map: six steps as a flow (the first split between building one in Build and
  bringing a list you already have, meeting at Test), each title opening where that step
  begins, and the card status ladder in order with what each word means.
- **Cards → Library** (`#cards`): exact printing lots, requirements, groups and planned lists.
  **Status** is one column — *Physical deck · Substitute · Reserved · Bench* for owned copies,
  *Ordered*, *Watched*, *To buy*, *Draft list · Suggestion · Planned* for rows that are not
  copies yet — where Source and Allocation were two (both stay in the Columns dialog); the
  color is the state. Each row carries the one verb its status calls for (Bought, Arrived,
  Put in, To bench, Reserve…) and ⋯ for the rest. Purpose and physical location are separate. The counts row reads, in the order
  a deck is built and each under its state's color, *Reserved · Owned · Substitutes ·
  Physical Deck · Ordered · To Buy · Watched*; on every deck Reserved = Owned + Ordered + To
  Buy, Owned counts reserved copies, the Bench (owned copies no deck has reserved) is the
  table itself and the caption under the row, and Sell / Trade is a Bench flag, never a
  count held against a deck (the equation itself is behind the page's **?**). Five filters
  are in view — type, mana, color, status, deck — with search and group beside them, and **More filters** folds
  subtype, mechanic, flags, offers, mana value and price, opening itself whenever one of
  them is set. Clear filters leaves the deck
  flow and shows all collection records. Every row's **Actions → Status** fly-out carries
  the ladder a card climbs before it is in hand — *Watched* (considering it), *Ordered*
  (bought, or a trade arranged; the record carries the channel), *Owned* — with the current
  rung marked and *Delete* at the bottom. On a copy record it changes the source; on a
  deck's *To buy* requirement, a draft deck's *Draft list* row or a group's planned card it
  creates the copy at that rung, filed with the deck or group and reserved to its slot once
  the deck is finalized. Above Owned the ladder continues as placement: *Bench* (an owned
  copy's default), *Reserved* to a deck, and *Physical deck* once it is physically sleeved.
  Moving an owned copy back down clears its box and, below Ordered, its reservation, and
  asks first. Every row carries its one obvious verb as a button — *Bought* / *Ordered* on
  a To buy row, *Arrived* on an ordered copy, *Put in Dn* on an owned copy reserved but
  not in its box, *Reserve…* on an unassigned bench copy, nothing on a copy already in its
  box — and the menu behind *Actions* is four sections: Status, Where it is, Plan, Record,
  with Sell / Trade under the rule. Active filters show as removable chips under the search
  with *Clear all*; the Columns dialog also holds *One row per card* (the Shop's default: a
  card three decks want is one line, `×3 · D2, D3, D5`, and *Bought* on it buys for all
  three) and the page size (60 / 120 / All), remembered with the columns. Rows are 56 px
  with the purpose as an inline chip, the card art appears beside the name on hover instead
  of a thumbnail, and pagination repeats above any table longer than one page. The same ladder runs over ticked rows (*Set status*) and over a whole deck
  from its page (*Card status*). Every deck has a collection group, made with it; a deck
  saved from the Lab arrives as a draft whose cards sit in that group at *Draft list* until
  their status is set. Group-by band headers fold, and the toolbar filters by group. A deck card's row also carries the two slot flags: **Pin** keeps it whatever the Lab or a swap suggests; **Flag as option** marks it as the first to come out when a card has to leave the hundred (the row wears an *Option* chip, the deck page lists them under *Working list*, the Lab drops them first, and a filter finds them). Setting one clears the other; neither moves a copy. The filter panel's **Mana** select narrows rows to mana rocks, dorks, lands, basics or ramp spells, by the same reading Discover uses.
- **Cards → Library → Sheet** (`#cards?view=sheet`): the Master sheet read from the library. One row per card;
  Own, Ordered, Bench and To buy across it; for every deck a *T* column (how many the list
  wants) and an *A* column (how many are physically in its box, with a small *+n* where more
  are reserved than sleeved). Click a number and type the new one: a plain raise of Own or
  Ordered saves on the spot, and anything that takes a copy from somewhere goes through the
  review dialog first. A raised *T* reserves free copies and takes reserved ones from other
  decks (they stay in their boxes until pulled, and those decks' Ready to add lists say so); an *A*
  typed to 1 releases the copy from wherever it was, reserves it here and puts it in this
  box, recording a new owned copy when the library holds none. The copies rule holds
  throughout: one of a card per deck except basics and the cards whose text allows more.
  *T* is what the deck's list claims (Reserved), *A* is what is physically in the deck; a
  small *ˢn* on an *A* cell counts that card's substitutes there, Bench counts copies in no
  physical deck at all, and *Show → Substitutes in a physical deck* lists them. Enter commits and moves down,
  Tab moves right, Escape puts the number back, the arrow keys walk the cells, and *Export
  CSV* writes the rows in the Master's column order, *A* being what is physically in the box,
  substitutes included, like the Master's Actual.
- **Cards → Library or To buy → Table** (`#cards?view=tabletop`, `#cards?view=tabletop&tab=buy`): the same rows, under the same search and
  Status · Card type · Color · Deck filters, as piles on a slate sorting mat: the status piles
  down front in the model's order (`M.STATUS`, Bench excepted), the Bench fanned along a raised
  ledge at the back, and behind the status piles a semicircle of group piles under one grouping
  (card type, color, deck, collection group, mechanic, role, Primary Purpose, mana value, price
  band; the choice is remembered). Every pile is a stack whose height is its count, with its
  label and count on a paper placard; a slot stays where an emptied pile lived; every card
  shows its whole picture; ordered, watched, to-buy, draft and suggested copies are ghosts —
  the picture at full strength behind a gold dashed frame, the status on the corner. Only the
  six piles a card can be dropped on stand as piles; Draft list, Suggestion, Planned and
  Unassigned are readings of a plan and sit as chips under the status row, to lay out and look
  at. The Bench ledge folds to its placard (*Hide* / *Show*, remembered on the device). Click a
  pile and its cards lay out in rows and columns on the stage inside the arch (mana value then
  name; the Bench by name; Ordered by order date), the other group piles standing back as a
  shelf of placards, with a page strip (S · M · L card size, a page is what fits), a caption
  under each card and a tick in its corner; click a card and the rest slide back into their
  pile. One chosen card stands on the stage at the picture size you choose (Card · Larger ·
  Large · Full, Scryfall's full print, remembered on the device) with its facts beside it from
  the same record the inspector reads — mana, type line, rules text, price — *Inspect card* and
  *Explore connections*, and *Previous* / *Next* (or the arrow keys) through the pile it came
  from: pick a deck, pick a card, read it, file it, next. Several chosen cards fan on the center
  of the mat with name, status, price and deck beneath (shift-click or the ticks choose
  several); right-click a card for the list's row menu; Escape or a click on the mat puts the
  table back at rest. **Drag the selection onto a pile** and the pile says
  what the drop would do before you let go — a status pile is the Status fly-out's change (Bench
  ↔ Physical deck, Ordered, Watched, Reserved, Substitute, a reservation released to To buy), a
  collection group pile files the copies, a deck pile reserves them, and a card type, color or
  mechanic pile says it is a reading of the card, not a place; every drop that changes a deck or
  money goes through the same receipt the fly-out shows. A ghost dropped on Ordered becomes an
  ordered copy, on the Bench an owned one. *Move to…* lists the piles with the same answers for
  a phone. The arrows walk the piles and, in a laid-out pile, the cards (Space ticks, Enter
  chooses, PageUp and PageDown turn the page); the card size is remembered on the device, the
  status piles' order (workflow, or fullest first) with the library; *Print* puts the whole pile
  on paper as a numbered list (`crankmagic-tabletop.js` `accepts`, `printSheet`,
  `tests/crankmagic-tabletop.mjs`).
  **The table has two jobs, and which one it is doing is whether a deck is picked.** With a deck
  (`#cards?view=tabletop&deck=…`) the middle is that deck's play space — a draw pile of the cards
  in your hand, up to four trays, and a scoreboard reading where confirming would leave the deck;
  the band along the bottom is the six statuses. With no deck it is **shelf mode**: the band
  becomes your collection groups plus *New group…*, each tray is bound to a group it is filling,
  the scoreboard reads those groups' sizes, and every status that holds anything moves up to the
  line of chips — still one click from being laid out and still a place a card can be dropped,
  just no longer the job the table is doing. A card lifted into the middle in shelf mode stages
  nothing: with no deck to consider it for, it means nothing until you put it in a group, and
  putting it back is simply forgetting it. The catalog reaches the table from Discover: tick cards
  in the graph or the List tab and press **Send to the table**, and they arrive as rows marked
  *Sent from Discover* — ghosts, because nothing about them is held. One drop on a group can carry
  copies you hold and cards you do not: a copy is filed in the group, a card is planned in it.
- **Discover**: navigable metadata/co-play graph, mouse-wheel zoom, keyboard neighbors,
  pan, back trail, card inspection and supplemental catalog lookup. The pane beside the
  graph has two tabs: **Card Info** (the focused card, its terms, *Add/Buy*) and **List**
  — every card the focus reaches at the widest depth and breadth, whatever the sliders say,
  under the same filters; sortable by its headers, paged, a tick per row for *Add selected
  to a group* or a draft deck, *Add/Buy* on each row, and a row click opens the card in
  Card Info without moving the graph. In Inspect mode a tap on a node opens the **card
  pop-up** beside it: the picture at large size, type, cost, rarity, set and price, the
  Primary Purpose chip and *Joined to ‹focus› by* — its full term list is under **Inspect
  card** as *Terms the graph reads*. In Card Info, the pop-ups and a List row's detail, the
  term with the **gold ring** is the card's *Primary Purpose* — the one job it is in a deck
  for, decided by a fixed ladder in `card-classify.js` (`purposeOf`: finisher, extra turn,
  board wipe, multiplier, untap engine, copier, blink, team quality, tutor, sacrifice outlet,
  removal, draw, ramp, token maker, payoff, … body, tribe). The loop vocabulary — roles
  `untap`, `copy`, `blink`, `counter-removal`, `extra-turn`, `cost-reduction` and the
  `tap-ability` mechanic — is read from rules text like every other term and re-derived over
  the whole graph with `node tools/graph-amplifiers.mjs --all`. A filter dialog's counts are what the filters already applied leave
  (`CrankFacets.narrowedCounts`), the whole-graph figure on the hover; the **Yours** filters
  wear the owned green, picking a deck there puts its commander in focus, and dragging the
  divider grows the card picture up to 70 %. **Loops only** (on by default when a deck is
  picked under Yours) walks only the joins that continue or pay off a loop — an untap, copy or
  blink onto a tap ability worth another go, a repeatable supply into a demand, an event one card
  causes and another fires on — and **Loops this card is in** lists every cycle of four cards or
  fewer through the focus (`crankmagic-loops.js`), each step named, missing pieces dashed, with
  the cards that pay it off. Sol Ring is on no loop: a rock's tap makes mana and nothing a loop
  feeds on, and mana loops wait for cost accounting. The pane widens while List is open; in presentation
  mode the list keeps name, type and mana. The **Filters** bar groups the facets by what they ask about — Card (type, color, mana value, mana: rocks, dorks, lands, basics, ramp spells, rarity), Rules, Lands, Yours — and each opens its options in a dialog over the page, A to Z with a search box, so picking a filter never shifts the page; *Lands only* is a toggle in the bar; the badge on a facet counts its picks.
- **Build** (the Deck Lab, `#lab`): any legal catalog commander by name or mechanics/EDHREC commander rank;
  optional second commander; an existing list/group; separate Deck Definition; real
  initial construction under price/copy limits. The user reviews and finalizes the list.
- **Cards → To buy** (`#cards?tab=buy`): the buy list with money on it — price, cap (sheet price under $2, 110% above,
  local store first at $5 and over), vendor, deck and paid on every row at every width; a
  strip above the table with the count, the total at sheet prices, what is ordered and
  unpaid and what is left of the season's pool, then the three price bands; rows grouped
  by deck with a subtotal per band. A card moves *buy → ordered → arrived* from the row:
  **Bought** on a To buy row, **Arrived** on an ordered copy, one tap each (Ordered is in the
  row's Status ladder and the ticked-rows bar),
  stamping the sheet price as what was paid (marked *catalog* until a receipt says
  otherwise). Export carries price, cap, vendor and the subtotals; *Print buy list* prints
  it by deck. **Ready to add** opens a deck's Ready to add list. Tick rows and **Ordered…** takes
  one dialog (vendor, reference, shipping spread across the lines, expected date) for the
  whole order; **Bought in store** does the same with the store as vendor and the copies
  arriving at once; **Arrived** lands ticked ordered copies. The **Orders** tab
  (`#cards?tab=orders`) is one row per order — paid including shipping, arrived count, the
  house-rule markers (over $30, over the 110% cap, ≥ $5 not local) as counts — with
  *Arrived → bench* (one change, one undo, reservations kept), *Paste receipt* (an order
  confirmation or CSV, matched by name, applied to the lines it names and marked *receipt*;
  also Import list → *Order confirmation*), *Edit* and *Lines*.
- **Ready to add** (`#pull?deck=`): one deck's reserved copies grouped by where they are —
  pull from bench, move from another deck — plus the **substitutes** in this deck, color then
  name inside each, with *In box* / *Move here* / *To bench* per row, a tick that records
  the walk as it happens, *Select all* beside a group's count (the whole group in one
  revision), *Mark all added*, Print (black on white, boxes to tick) and
  Export. A substitute is any owned copy physically in a deck that the list does not call
  for: it fills a seat while the real card is bought or on its way, so the deck is playable
  before it is finished. Nothing marks it; being in the box without a reservation is what it
  is. The sheet says how many can come out now (a real copy is ready to take the seat, or the
  deck holds more substitutes than empty seats) and which fill seats until their cards arrive;
  *Mark all found* puts the ready copies in and takes exactly that many substitutes out. The
  Collection puts a copy in as a substitute from **Actions → Put in a physical deck as a substitute**
  (a copy the list does call for is reserved on the way in instead). Both substitute paths — that
  one and the table's drop — ask **which seat it is standing in for**, offering the cards the deck
  still lacks a copy of; naming it is optional and it is what turns the Change List's pairing from
  a guess into a record. The copy then reads *Purphoros · substitute for Sol Ring* wherever the
  Deck column appears, and the deck's own list marks that seat **held by** its substitute. Left
  blank, the Change List pairs as it always has: the option slot that names the seat, then the same
  primary type, then the nearest mana value. The *Allocation* filter
  has *Substitute*, tiles read *Playable · n substitutes* once the physical deck holds a
  hundred, and the readiness bar hatches the seats substitutes cover. Tiles wear their stage
  as a border: green while *Defining*, blue while *Building*, purple once *Playable*, gold
  when *Complete*. The deck page's Overview shows In
  physical deck · Substitutes · Ready to add · Ordered · To buy and $ to finish against the cap,
  with a readiness bar and the *Next:* line; *Ready to add (n)* leads the action row when there is
  anything ready to add. The **Upgrade Path** panel on the Upgrades tab lists the deck's linked upgrades
  as *Add · Replaces · Tier · Price · Why · Promote* with *Tuned only* and *Under $2*
  (D5–D6: $1.50) filters, `$X to Max` and `GC k / 2` in its header; *Promote* is the
  existing accept-option review, which asks first when it would be a third Game Changer.
  A **budget card** under the hero — `$ to finish (base)`, `Paid so far` (≈ when an owned copy has no
  recorded price and the list price stands in), `Market value · %
  of cap` with a bar (amber past 90 %, red past 100 %), `Game Changers k / 2`, lines paid
  over the 110 % cap — reads the same lots and prices as the Shop strip. Deck Definition
  shows the standing caps ($225 total, $30 a card) as placeholders and writes them when the
  field is left blank. **Log a game** records the date, finish in a pod of n, bracket, the
  card that won it and the dead card in hand (pickers limited to the deck); the **Record**
  card reads it back — W–L, win rate with its n, paid per win, the Wilson interval from
  `game-record.js` ("too few games to tell" under eight decided games) and the last ten
  games — and tiles carry `3–1` once games exist.
- **Make the change** (`#change?deck=`): the Change List for one physical deck — what to pull
  from the box and what to put in, one physical swap per row as *Remove this card → Put this
  card in*. A removal is a substitute the list does not call for; an addition is a reserved
  copy sitting on the Bench or in another deck's box (available now) or still ordered or to
  buy (waiting, listed but not tickable, saying what it waits for); a substitute is paired with
  the card whose seat it fills where one is on the way. A tick is one revision — the copy out
  to the Bench, the copy in placed here — so Undo takes it back; *Do all available* makes every
  ready row in one change. Four readings above the rows hold the box to the mana formula
  (start at 38 lands, sub one out for every two cheap ramp pieces, never below 33, one back
  for a high curve) and to the floors in `crankmagic-rules.js` (removal, wipes, ramp, draw,
  Game Changers) — the box now, after what can be done now, after everything arrives, and the
  list as written — amber where a reading breaks one. *Export Excel* writes the rows and the
  readings as a two-sheet workbook; *Print* gives boxes to tick. *Make the change (n)* sits in
  the deck page's hero for a final deck, under the Cards page's **More** menu for every final
  deck, and in the Discover trace pane. `crankmagic-change.js` is pure and held to the live
  library in `tests/crankmagic-change.mjs`.
- **User Functions**: backup/restore, Load Live, enriched workbook export, legacy
  reconciliation, history/undo, comparison reset, optional mirror file and explicit Clear all.
- **Simulation reports carry their hundred.** A report filed from the Lab or the deck page
  records the exact list it measured. In the Lab, a draft that started from an existing deck
  offers *File report with <deck>* after measuring: the report joins that deck's history and
  any measured card the deck neither lists nor holds physically becomes a planned card in the
  deck's group (Watched, nothing more). On the deck page, a report's *Spin off as a new deck*
  makes that hundred a finalized deck of its own with the same commander, the report copied
  with it; the original deck is untouched.
- **Share** (beside Take a Tour): *Subscribe to updates* opens a mail draft to the maintainer
  asking to be added to the update list, *Share by email* opens a draft with the subject and
  body written and the To line left blank, and *Show a QR code* draws the app link as a QR
  code in the page (`crankmagic-qr.js`, no network, checked module for module against segno
  in `tests/qr.mjs`) for a phone to scan at the table. **Publish your To Trade list** (the same
  menu) turns the copies marked Sell / Trade and whatever is filed in the To Trade group into
  one link that *is* the list — deflated into the hash, with your name, a way to reach you and
  a note — so anyone who opens it sees the cards with their pictures and can ask about one or
  several from their own mail client; nothing is stored on a server, a new list is a new
  link, and the QR code is offered when the link is short enough for the one the app draws
  (`crankmagic-trade.js`, `tests/crankmagic-trade.mjs`).
  **The role lens** (List tab, with a deck picked under Yours, or `#discover?lens=Removal&deck=<id>`
  from the deck page's More menu) reads one role — Removal, Board wipe, Protection, Loop, Tutor,
  Ramp or Draw — as two lists: the deck's cards that carry it, counted against the house
  minimum in `crankmagic-rules.js`, and the candidates that could join them (bench, buy list,
  linked upgrades, the commander's co-play neighbours) ranked by co-play, then owned before
  ordered before not owned; *Swap for…* links a candidate as an uncommitted upgrade option
  (`crankmagic-lens.js`, `tests/crankmagic-lens.mjs`).
  **Trace** (the pane's third tab, or *Trace* on the deck page, `#discover?deck=<id>&trace=1`)
  lights a deck from its commander outward over the joins that serve its strategies
  (`crankmagic-strategies.js`, sixteen tuples; `data/commander-strategies.json` for every legal
  commander), loop-backs in gold, the untouched cards ghosted; the pane plays the same list in
  order with the join that lit each card, the strategies as ticks saved with the deck (each
  tick says what it lights on its own; *Reset to the commander's own* clears them), three
  limits under them kept with the library — *Cards lit* (a hundred at most: a set of more than a
  hundred cannot be played), *Loop length* (two to six cards, four by default: a two-card
  engine wins games and a four-card loop is the longest a table follows) and *Chain depth*
  (one to three rings) — with no card drawing more than four loop-backs, a tick on
  every row that files the ticked cards in a Collection group, a cohesion score labeled a
  heuristic beside the measured score, and a second world — what the deck could be — over the
  library and the commander's co-play neighbours inside the definition
  (`crankmagic-trace.js`, `tests/crankmagic-trace.mjs`, `tests/commander-strategies.mjs`).
  The Deck Lab seeds a commander's 99 from the same trace (*Seed the draft from the trace*, on
  by default; `CrankTrace.seedFrom` into `draft-builder.js`), and *Watch the trace* opens the
  saved deck on the canvas.

### Load Live

`data/live-load.json` is the owner's collection written as a file a person can read: the
six deck targets, what is physically in each deck, the bench, orders in flight, the
outstanding buy list with prices, the Upgrade Path cards with the slot each replaces, and
per deck the two working lists — `options`, cards in the hundred flagged as the first to
swap out, and `planned`, cards meant to come in that are not in the hundred yet (double-faced
cards use their full `Front // Back` Scryfall name). It is **built from the Master
workbook**, not edited by hand: `node tools/build-live-load.mjs data/source/<Master>.xlsx`
reads the Master sheet by header name (`Own`, `Buy Count`, `Ordered`, `$ Each`, `D1-T…D6-T`,
`D1-A…D6-A`), the Deck Lists sheet for commanders, the Upgrade Path sheet, and an optional
`CrankMagic Plans` sheet (Deck, Kind, Card, Why) for the two working lists; names,
definitions, notes and the working lists are carried over from the committed file for any
deck the workbook does not restate. It prints the per-deck delta against the committed
file and refuses a workbook whose deck targets do not sum to 100 or whose names the
catalog cannot resolve. `data/source/CrankMagic-Load-Live-template.xlsx` is the same
layout with nothing else on it, for a collection kept somewhere other than the Master.

`node tools/build-live-state.mjs [--scryfall cache.json]` then turns the file into
`data/live-state.json`, a complete CrankMagic backup in the app's own format, built through
the collection model and validated: every deck owns a collection group, in-box copies are
reserved to their deck, bench and ordered copies are reserved to whichever deck still needs
them, options become slot flags, planned cards become entries in the deck's group (or file
a free copy there), upgrades are filed under an "Upgrade Path" group and attached to the
slot they replace with their tier, price and reason, the buy list is checked against the
shortfalls the model derives, and every price the committed state already held is kept.
`node tools/scryfall-cache.mjs` fetches the rules text, prices and images the bundled
catalog lacks for those cards. **Actions → Load Live** on GitHub runs all of it by hand on
the newest workbook under `data/source/` and commits both files. **User Functions → Load
Live** in the app asks for the load password (`treycmload1`, a latch against accidents, not
a lock: the file and the word are both public), fetches that file fresh, and runs the
normal restore path on it; Undo restores the previous library. The same file also restores
through **Restore from a backup file** with no password.

`index.html` is the main shell; `crankmagic.html` is the same compatibility entry.
`graph.html` opens Discover. Those three are the whole app.

The earlier measurement workspace — `matrix.html`, `legacy-decks.html` and
`legacy-graph.html`, with `app.js`, `viewer.js`, `graph-page.js` and `shop-page.js`
behind them — was retired once CrankMagic covered its ground; nothing linked to it and
it had stopped being tested against the live data. Its historical guide is
[docs/legacy-readme.md](docs/legacy-readme.md), and the browser records it left behind
are still folded into every backup by `user-state.js`, so an old library is not stranded.

## Simulator hold and evidence

**The simulator is being developed in another session. Its engine, policies, protocol,
inputs and baked measurements are unchanged by this application build.** The new Lab
creates an initial metadata-based draft; it does not claim optimized or simulated scores.
Later simulation steps visibly wait for integration. Bracket, playstyle, saltiness and
custom restrictions remain review targets during the hold; price/copy constraints are
applied to initial construction and price limits are checked again on final acceptance.

Reports can be imported for the current or a retained version of a deck. They keep exact
list/protocol/version provenance; comparison deltas require matching declared conditions.
Historical swap suggestions and structural alternatives are labeled with their evidence.
They are proposals, not a guarantee of improvement. Advice uses exported request/imported
response packs; no key, paid call or recurring token spend is required.

For the retained engine only, `node tests/sim-engine.mjs` checks its existing behavior.
Its batch runner is `tools/run-batch.mjs`; see the legacy README and simulator handover
for its invocation. Do not launch or change simulator development during the current hold.

## Data and reliability

Owned, ordered and incoming lots are distinct from derived To buy requirements. A physical
copy has one current allocation and one last-confirmed location. Accepting a replacement
can re-reserve the released owned copy to another deck, while still showing its old box.
Archive releases allocations but preserves the plan and physical history. Sell / Trade
membership does not dispose of a card. Explicit sale/trade-out does.

Multi-tab revisions, atomic writes/undo, import previews, duplicate-batch checks, checksummed
backups and a separate damaged-record recovery path protect against silent inventory drift.
A backup is still necessary: browser deletion/eviction is outside the app's control.
The app works offline after its public assets are cached; uncached lookups/images require
connectivity. The graph (about 37 MB: the card terms and the co-play pairs) is not part of the
install: Discover fetches it on its first visit behind a status line, and the worker keeps it. New installations of the offline cache wait for old tabs to close.

EDHREC commander ranks are a separately dated [Top Commanders](https://edhrec.com/commanders)
**Past 2 Years** snapshot, distinct from Scryfall card rank. `tools/commander-ranks.mjs`
refreshes it. The glossary has one authority: `data/commander-glossary.json`. Its
underlines are off by default (`preferences.terms`); the text is the same either way.
Public card requests go to Scryfall; private library records, backups and games are not
uploaded. See the [architecture and schema handover](docs/crankmagic-architecture.md)
for modules, invariants, services, formats, migrations, offline limits and provenance.

## Verify before pushing

The rules engine that will replace Forge (`docs/engine/PLAN.md`, `docs/engine/ADR-001-own-engine.md`)
is held by `engine-skeleton` — the entry point refuses loudly and the `CRANKMAGIC_ENGINE`
flag defaults to `forge` — and `engine-headers`, which fails on any engine file that does
not say whose it is or that carries another license.
Its kernel begins with determinism, because everything else rests on it: `engine-rng` holds that
one seed is one stream, that a shuffle is an unbiased permutation and that a checkpoint resumes it
exactly, and `engine-journal` holds that a state hash ignores key order while noticing everything
that matters, so a correct replay is never reported as a divergence. On top of those,
`engine-state` holds the two invariants the rest of the kernel will be built against: one object is
in exactly one zone, and a card that changes zones becomes a new object (CR 400.7), so a creature
that dies and returns remembers nothing of its old life. `engine-turn` holds the clock — the steps
of CR 500.1 in order, under the phase names already on disk, the draw rule that applies to two
players and not to a pod, and a turn that always reaches the next seat. `engine-stack` holds that
a spell's card is really in the stack zone rather than still in hand with a note on it, and that an
ability on the stack is not its source; `engine-priority` holds that passes count only when they
are consecutive, that the active player receives priority after something resolves, and that a
player who is out is never waited for — the difference between an engine that loses a game and one
that stops with nothing to report. `engine-controller` holds the decision envelope §12.1 pins: the
same choice record, action body and refusal messages `ForgeBrowserBridge` serves today, so the
board, the gateway and the API pilots do not change when the engine underneath does, and a retried
action is never a second decision. `engine-actions` holds that legality is enumerated rather than
asserted — the engine offers what a player may do and refuses what it did not offer — and plays a
forty-turn four-player game of lands with the `random-legal` pilot twice from the same seed, for
the same final state and a byte-identical journal. `engine-mana` holds that the three hybrids do
not pay alike (`{W/U}` either color, `{2/W}` two generic or one white and mana value 2 either way,
`{W/P}` white or two life and not mana at all), that `{C}` is a requirement rather than a generic
symbol, that X is zero off the stack, and that when more than one payment is legal the engine
offers the choice instead of guessing which color the player wanted to keep. `engine-cast` holds
that a mana ability never touches the stack (CR 605.3a — the alternative would make every land tap
a window for instants), that sorcery speed and instant speed are two different tests rather than
one, and that a game with spells in it terminates and replays to the same hash. `engine-combat`
holds the thing that cannot be retrofitted — every attacking creature chooses its own defender, so
two creatures at one seat and a third at another is an ordinary turn rather than an edge case —
along with summoning sickness as a question about control rather than about entering, attackers
tapping unless they have vigilance, and lethal damage coming before the damage moves on.
`engine-sba` carries across what the Java `RulesProbe` asserted, as claims about this engine: two
commanders' damage is not pooled, gaining life does not erase it, noncombat damage from a commander
does not count toward it, an empty library is not a loss until you draw from it, and a player who
is out takes their board with them. `engine-trigger` holds that a trigger waits for priority rather
than resolving where it happened, that the active player's goes on the stack first and therefore
resolves last, that a player with two orders their own, and that "whenever this creature dies" can
still see the creature — the look-back is the event envelope carrying the card as it was, not a
shadow copy of the board. `engine-projection` decides what a seat may see, once, inside the engine,
so a routing mistake in a host can lose a game but cannot leak one: an opponent's hand is a count,
a library is hidden from its owner too, and the property is checked by playing whole random games
and looking for any hidden card's name anywhere in any seat's view, under any key, at any depth —
a test that only checked the zones somebody thought of could not catch a leak through a field added
later, which is how that bug arrives. `engine-replacement` holds that a replaced event never
happens at all — a creature exiled instead of dying did not die, and nothing that watches for
deaths sees one — that each effect applies once to a given event so two of them cannot bounce it
back and forth forever, that the affected object's controller chooses which applies first because
the order decides the outcome, and that a prevention shield wears out. `engine-layers` keeps the
state holding printed values and derives current ones on demand, so an effect leaving costs
nothing: it holds that layers are categories rather than priorities, that an effect setting power
applies before one adding to it whichever was played first, that counters come after both, and that
dependency beats timestamp. Combat, state-based actions and the projection all read through it, so
an anthem, a counter and an animated land are the same creature to all three. `engine-lki` holds CR
113.7a, the last known information a dying permanent leaves behind: the snapshot runs the layers, so
a 2/2 with two +1/+1 counters under an anthem is recorded as the 5/5 it died as, with its counters,
its types and the controller it had rather than its owner. Without it "each opponent loses life
equal to its power" compiles, runs and quietly produces zero, because there is nothing left to read
a power from once CR 400.7 has made the card a new object. `engine-commander`
holds CR 903: color identity reads the rules text as well as the mana cost and ignores reminder
text, so a colorless artifact that makes black mana is a black card; the tax counts casts from the
command zone rather than casts, and is part of the cost, so a commander a player cannot afford is
never offered; the tax and the 21-damage tally follow the commander across every zone change; a
commander in a graveyard or exile is a question put to its OWNER as a state-based action, after
"dies" has seen it, because leaving it there is where a reanimation starts; and one bounced or
tucked is asked before it moves. `engine-rules-conformance` is the checklist an experienced player
would run: the commander, the state-based actions, combat, the stack, replacement effects and the
turn, each held to its rule by number through real cards, then invariants at every step of whole
house-pilot games (one object in one zone, no token off the battlefield, life moved only by
logged events, the commander tally equal to the combat damage dealt). `engine-room-games` plays
seeded four-seat games of the engine's own definitions through the cloud table's card source and
the real room, house pilots in every seat, each to its end with no exception inside a time budget, dealt from a pinned
pool of cards (`tests/fixtures/room-games-pool.json`) so a batch of new definitions does not change every seed's decks.
`room-refusals` holds the room's tally of refused AI answers to the whole match (the review of 2026-10-05, F-1): a
refusal at the opening hand of a game that outruns the history's 300-line window is still counted at its end, after
every reopening and in its replay, and `tools/fuzz-live.mjs`, the seeded-games harness for a library's decks, fails
any game with one. `room-slices` holds the room played in slices where a request's CPU is capped (a Durable Object's
30 s): the AI seats stop after a step budget with nobody asked and the object's alarm plays on, the sliced game the
same game as one played in one go and as its replay, leaving and ending refused with instructions until they stop.
`engine-derive-once` holds the layers' memo: each object derived once per question and guard level, the same answers as
without it on a board where the guard levels differ, a question that only reads changing nothing, and the work linear in
the board. `engine-targets-up-to`
holds a counted target ("up to two target creatures", "any number of target players"): offered once and picked as a
pick-several before anything moves, never the same object twice, none chosen still resolving. `engine-afterlife-tokens`
holds Afterlife's Spirits and "whenever you create one or more creature tokens": once for all made at once, never for
another player's. `engine-turn-records` holds what a player did this turn, counted and compared: life gained (lifelink in
combat too), tokens made and permanents gone (revolt), each player's, cleared as a turn begins; "an opponent controls more
lands than you"; a token leaving the battlefield; an opponent's second spell. `engine-escape`
holds escape: offered once from its owner's graveyard at its type's speed, the other cards it exiles picked before anything
moves, "escapes with" counters only when it escaped, never exiled afterward, and Underworld Breach's escape beside a card's
own. `engine-encore` holds encore: offered from its owner's graveyard at sorcery speed, the card exiled as its cost, a hasty
token copy for each opponent that must attack that opponent if able (a cost to attack lifts it), all sacrificed at the end
step. `engine-attack-restrictions` holds whom a creature can't attack (you, its owner, a player it attacked this turn,
anyone; unless a condition), before any requirement, and "whenever a player attacks one of your opponents": once per
opponent attacked, the attacking player's token tapped and attacking. `engine-modal-triggers` holds a modal triggered
ability's modes chosen as it goes on the stack, with their targets: a different player for each mode, none twice, or none
and it is gone, the chosen modes' targets checked again as it resolves. `engine-exile-until` holds "exile ... until this
leaves the battlefield": the card back at once under its owner's control as a new object however its source leaves (an
effect, an Aura falling off, a death, its controller leaving the game), nothing exiled if the source left first, a token or
a card gone elsewhere not back. `engine-mdfc` holds a modal double-faced card: its front face everywhere but the
battlefield and the stack, played as its land face and entering that face up, its front again when it leaves, kept
where it is when told to enter as an instant. `engine-planeswalkers` holds planeswalkers: entering with their loyalty
however they enter, a loyalty ability once a turn at sorcery speed with its cost paid in counters at once, damage taking
loyalty (infect's too) and none left putting one into its owner's graveyard; attacked, defended by its controller, its
loyalty taking the combat damage, nothing dealt when it is gone, and attacking it not attacking its controller -- for
restrictions, taxes and triggers unless they say "or planeswalkers you control". `engine-tap-to-cast` holds a spell
the pool cannot pay cast in one action by tapping its caster's plain sources: without asking when there is one way, asked
when there are more, the least flexible first; mana already in the pool, {X} and Phyrexian costs, a painland, a source of
two mana and a summoning-sick creature left to tapping by hand. `engine-pay-choice` holds a cast or an ability the pool
pays more than one way offered and asking which way (X8b): two colors for generic, a Phyrexian symbol's mana or life, a
hybrid; one way asks nothing, a way gone from the pool is refused, and the house pilot pays with mana. `staging-check`
holds `tools/staging-check.mjs`, a session reading staging back through its Access service token: the release, both
pages' version and the seated identity, and what is wrong when Access refuses or the release is not the one expected. `engine-cards-pb1` holds what the scenarios of Rob's
priority list's first cards cannot reach: a creature that can't block never offered as a blocker (on itself, on a
selector, for a turn), "destroy all other creatures" sparing only what the spell made, every counter removed, and "choose
one or both"; `engine-cards-pb2`, the next slice's: exhaust once per object (a new object may again), an ability of a
card in its owner's graveyard, and "discard a creature card" as a cost. `engine-modes-up-front` holds modes
chosen as a spell is cast and as a trigger goes on the stack, never as it resolves, whether or not they name targets
(CR 700.2). `engine-cards-pb9` holds the ninth slice's: a creature an effect says can't attack this turn
(Endbringer) never offered as an attacker that turn and offered again the next, and Freyalise's "can be your commander"
(CR 903.3a) read from the static ability that claims the line. `engine-amass` holds amass (CR 701.47): the 0/0 black
Army token made when there is none, the Army chosen when there are two or more, its new creature type kept for as long as
the creature stays, a changeling counted as an Army, and the amassed Army an Equipment attaches itself to. `engine-convoke`
holds convoke (CR 702.51): offered beside the cast the pool pays, the creatures picked once it is taken (summoning-sick ones
too), a commander's tax among what they pay, and a pick that cannot pay or leaves the pool more than one way to pay the
rest refused before anything moves. `engine-storied` holds storied (CR 702.195): an enduring story for three artifacts,
Sagas or legendaries, its controller's alone and for the rest of the game; the condition a static, an attack tax and
"doesn't untap" read; and a layer's either-or ("artifacts and creatures you control") giving an artifact creature ward once.
`engine-evoke` holds evoke (CR 702.74): the keyword compiled to an alternative cost and "when it enters, if its evoke cost
was paid, its controller sacrifices it"; offered beside the mana cost, paid with mana or a card exiled from the hand (never
itself); the spell and its permanent marked evoked, a new object not; and the house pilot casting for the mana cost when
it can. `engine-mana-spent` holds the mana spent to cast an object (CR 601.2h): recorded by color as a spell is cast,
kept by the permanent it becomes and remembered by its triggers, so "if {G}{G} was spent to cast it" is still read once
an evoked creature has been sacrificed (CR 608.2h); a creature that convoked it spends none (CR 702.51a), nor a card never
cast; and adamant read by a spell of its own. `engine-investigate` holds investigate (CR 701.16): a Clue token (CR 111.10f),
as many as it says, its controller's or the player the effect names ("its controller investigates"), and the Clue
cracked for {2}. `engine-may-play` holds "you may play that card" until a time: its controller's alone, ending at the
cleanup step of this turn or of their next turn (made on another player's turn too), a land as the land for the turn and a
spell at its type's speed, "you may cast" a spell only, and a card that moved away and back no longer named.
`engine-cards-pb25` holds a creature's toughness as an amount (Condemn's "equal to its toughness"): its own, on the
battlefield and as it last was, and a target's, read as the spell begins to resolve. `engine-cant-gain-life` holds "can't
gain life" (CR 119.7) for the players a permanent names, under its condition: no gain, no event, nothing counted; a loss
still taken; lifelink outside combat gaining nothing; over when the permanent leaves. `engine-cycle-triggers` holds
cycling's triggers (CR 702.29c): "when you cycle this card" from where the card went, "whenever you cycle a card" for its
controller, an opponent or anyone; a discard that pays a cost but is not a cycle; "cycles or discards" once (702.29d);
typecycling as cycling (702.29f); the X paid; and every cycling ability saying so. `engine-partner-keywords` holds the
partner abilities as keywords (CR 702.124): Partner, a named Partner and Choose a Background compiled as deck rules the
card's own words must say, the table pairing the real cards and refusing mixed ones, the catalog crediting both (not
Partner with, which is also a trigger), and the Mutagen token (CR 111.10v). `engine-combat-damaged` holds the players
dealt combat damage this turn (Tymna the Weaver): infect included and noncombat damage not, cleared as a turn begins,
counted for the controller's opponents or anyone and a player who has left not; and "pay X life" counted like any
amount, 0 life still asked as life (CR 119.4b). `engine-dig-until-count` holds cards from the top until that many fit
(Mass Polymorph): all of them found, none wanted and none revealed, a library run out, the rest shuffled in; and a
delayed trigger's "that many" counted as it is made. `engine-card-types-among` holds the card types among what an
effect remembered (Occult Epiphany): an artifact creature two, nothing none, and bound as a delayed trigger is made.
`engine-cost-exile-counter` holds two costs: "exile this creature", paid as the ability goes on the stack and the
source read as it was, and "remove a counter from this creature", one offer for each kind of counter on it.
`engine-spend-only-effect` holds mana an effect adds that may pay for only some things (Abstract Paintmage, Resonating
Lute): beside the pool, for what it admits, gone with the pool; every addMana's restriction read once, and a triggered
mana ability that carries one refused. `engine-graveyard-triggers` holds cards put into a graveyard from anywhere and
cards leaving one (Moonshadow, Garrison Excavator, the two Quintorius cards): a card and not a token, its owner's
graveyard, a filter, "one or more" once an action, and a card cast from a graveyard.
`engine-cleanup-step` holds the cleanup step in its order (CR 514): the discard to hand size first and "this turn" after
it, what the discard triggers on the stack with the active player holding priority, and another cleanup step after,
which ends what was made "until end of turn" in between.
`engine-animate-colors` holds the colors an animation gives (Restless Spire): set in their own layer for as long as it
lasts, read by selectors, gone with the turn; an animation that names none gives none.
`engine-blight-cost` holds "blight N" as a cost (Gristle Glutton, Spiral into Solitude): one offer for each creature of
its controller's, paid as the ability goes on the stack, annihilating with +1/+1 counters; and an Aura's "enchanted
creature" read as it last was when its own cost sacrificed it.
`engine-blight-additional` holds blight as a spell's additional cost (Cinder Strike, Burning Curiosity): one offer for
each creature of the caster's, "you may" the offer that pays nothing too, paid as it is cast; and "if this spell's
additional cost was paid", read as it was cast.
`engine-mana-spent-on` holds the mana spent to cast that spell (Expressive Firedancer, Mica): every kind of it, as the
cast recorded it, or a spell's own; its schema; and four mana that is not five.
`engine-chosen-color` holds a choice made as a permanent enters (Night Market, Dawn-Blessed Pennant): one mana of the
chosen color, none before a choice; and a permanent's activated abilities read with its choice as they are offered,
asked for and activated.
`engine-spell-cast-filters` holds three things a spell cast is asked (Zaffai and the Tempests, Mage Tower Referee, Rehearsed
Debater): a free cast's own condition, once during each of your turns and none during another's; a multicolored spell,
two colors or more; and a spell that targets a creature, one of its targets enough, a player or a card in a graveyard not.
`engine-entered-this-turn` holds what entered the battlefield this turn (Kinbinding, Wary Farmer): kept for the player
it entered under the control of, as it then was, so one destroyed since still counts; "another"; cleared as a turn
begins; and the count's schema.
`engine-stun-and-tap-three` holds stun counters and "tap three untapped creatures you control" (Rime Chill, Kithkeeper):
a stun counter removed instead of an untap, by the untap step or an effect, one at a time; each set of three untapped
creatures, the source among them, at most sixty-four, each tapped as it is paid; and the room's words for a set tapped,
a blight and a counter removed.
`engine-owner-chooses-library` holds a choice the target's owner makes as a spell resolves (Temporal Cleansing): the
owner asked, its controller aside, and no mode chosen as the spell is cast; and a card put second from the top of a
library, on top, or on the bottom.
`engine-blight-or-pay` holds a choice between additional costs and a color a mana ability gives (Bogslither's Embrace,
Foraging Wickermaw): blight 1 or pay {3}, each its own cast, its mana part of the offer, tapped for and spent, said by
the table; its compiler; and "becomes that color until end of turn", the color of the mana added.
`engine-reveal-until-creature` holds "reveal cards until you reveal a creature or planeswalker card" (Jace, Multiverse
Architect's -3): the card found onto the battlefield, a planeswalker with its loyalty, the rest under what was not
revealed in a random order, a library with neither put back whole, and nothing revealed once the target is gone.
`engine-cant-attack-jaces` holds "they may pay {2}; if they don't, creatures they control can't attack Jaces you control
this turn" (Jace, Multiverse Architect), at a table of four: the player whose turn it is asked, their creatures held as
they are, toward its controller's Jaces only, for the turn.
`engine-granted-loyalty` holds "planeswalkers you control have '[-8]: ...'" (Kiora of Salt and Sand): a loyalty ability
granted in layer 6 to its controller's planeswalkers only, paid in loyalty, once a turn among their own, gone with its
source; and Kiora's attack trigger, an attacking creature untapped and unblockable.
`engine-loyalty-activated` holds "whenever you activate a loyalty ability" (Ajani Unrelenting), any permanent's, yours
only, and "if you removed two or more loyalty counters"; "if you've activated a loyalty ability this turn", kept by the
player for the turn; and "discard your hand", nobody asked.
`engine-opponents-lands` holds "this land enters tapped unless your opponents control eight or more lands" (the
Turbulent lands): what every opponent of the player who plays it controls, counted together, at least and at most, a
land of the player's own or an opponent's creature never one; and "unless you control a planeswalker", the player's own.
`engine-empower-jace` holds "empower Jace N": a blue Jace planeswalker token made when its controller has none, the one
there is, or the controller's choice of two; a Jace card and another player's token aside; a loyalty ability that adds
mana, on the stack; and a resolution-time choice by a target's owner in a triggered ability, with "up to one".
`engine-destroyed-and-walker-damage` holds a board wipe that remembers what it destroyed (Ob Nixilis, the Ascended's
"1 life for each creature destroyed this way"), the indestructible never among them; and "whenever this creature deals
combat damage to a player or planeswalker" (Grateful Apparition): combat damage to a planeswalker triggers it, about its
controller, while damage to a creature and noncombat damage do not.
`engine-excess-and-next-spell` holds excess damage (Violent Echoes): past lethal to a creature, marked damage and
deathtouch counted, past loyalty to a planeswalker, the greater for both; "the next spell you cast this turn can't be
countered" (Theorist's Proxy), its caster's, used up, for the turn; and a spell returned to its owner's hand.
`engine-counters-doubled` holds "double the number of each kind of counter" (Deepglow Skate), on permanents and a
player's own; "twice that many +1/+1 counters instead" (Branching Evolution), for its controller's creatures and that kind,
as they enter too, four times for two; and "whenever you scry or surveil" (Proft), its controller's, once it is done.
`engine-piles-and-modes` holds two piles (Fact or Fiction), separated by an opponent the controller picks; increment
(Berta), by the lesser of power and toughness; "whenever counters are put on this"; an activated ability's modes chosen
as it is activated when they name targets (Aetheric Amplifier); "until your next turn, whenever a creature attacks you or
a planeswalker you control" (Jace, Reality Sculptor); and "all but the bottom card".
`engine-linked-exile` holds Oblivion Ring's two linked triggers: the card it exiled returned by its leaves trigger, under
its owner, once, each Ring its own; nothing once that card has left exile.
`engine-protection` holds protection from a card type (Serra's Emissary): damage prevented, not enchanted or equipped,
not blocked, not targeted, for permanents and their controller; nothing before the choice.
`engine-cant-lose` holds "you can't lose the game and your opponents can't win the game" (Darksteel Angel): no loss to
life, poison or an empty library, conceding aside, and no win by an effect; no -1/-1 counters on its controller's
creatures; and an emblem (Ajani Resolute), an effect with no source and no end, and its Pridemate token.
`engine-impending` holds impending (Overlord of the Mistmoors): time counters, not a creature while it has one and was
cast so, one removed at its controller's end step, and none of it when cast for its mana cost; and "cards with
different names" (Gifts Ungiven), one of each name offered.
`engine-overload` holds overload (Winds of Abandon): offered beside the mana cost, with no target; a repetition that
asks, each player in turn; and each search by the creature's controller as it left the battlefield. The keyword is
credited as built, with Mizzium Mortars and Vandalblast (Train B X11).
`engine-discover` holds discover (Quintorius Kand), written with what was built: past what doesn't fit, the rest under,
cast free from exile or put into hand; each opponent dealt 2 for a spell cast from exile; and mana for each card exiled.
`engine-eminence` holds eminence (The Ur-Sphinx), from the command zone and its owner's other Sphinxes only; "that many"
for the Sphinxes attacking; and, for each player, a card that player milled, cast free.
`engine-no-legend-rule` holds "the legend rule doesn't apply to permanents you control this turn" (Hall of Echoes): for
that player, for the turn; another player's legends still under it.
`engine-loyalty-x` holds a loyalty cost of -X (Kasmina, Enigma Sage): from none to its loyalty, each its own offer,
and said as -X; and a card that shares a color with its source.
`engine-multikicker` holds multikicker (Everflowing Chalice): kicked any number of times it can be paid, each its own
cast, and the permanent entering with what it was kicked.
`engine-set-subtypes` holds subtypes through the layers: set in layer 4 and read as they now are, by selectors, statics
and last known information; Song of the Dryads's colorless Forest land.
`engine-suspend` holds suspend (Delay): a countered card exiled with time counters and suspended; one removed at its
owner's upkeep only; cast free with haste when the last goes, or left in exile.
`engine-phasing` holds phasing (Teferi's Reproach): permanents phase out with what is attached, out of combat and of
every selector, and back in, the same objects, at their controller's untap; a player's protection from everything and a
life total that can't change, until that player's next turn.
`engine-exigent` holds Emrakul, the Exigent Doom's pieces: a spell's own cast trigger; a card exiled from hand as a cost,
cast from exile for as long as it remains there, and an effect that lasts until that cast; ward of three sacrifices.
AI 1's exile and flicker cards (Chulane, after the live game of 2026-10-04) have nine:
`engine-name-lock` holds Reflector Mage's lock: its owner can't cast spells of that creature's name until your next turn,
from any zone and as an effect casts, and it ends as that turn begins or would have (CR 800.4m).
`engine-linked-token` holds Skyclave Apparition's token: each owner of the exiled cards creates an X/X of all their mana
values together, none once nothing is in exile; a linked exile done twice has exiled both.
`engine-same-name-exile` holds Deputy of Detention's exile of every nonland permanent of the target's name that player
controls, hexproof or not, until it leaves; nothing when the target is illegal.
`engine-exiled-trigger` holds "whenever a creature is exiled from the battlefield" (Soulherder), looking back at each one.
`engine-came-from` holds Fblthp, the Lost: entered from, or cast from, your library, kept with its trigger; any spell's target.
`engine-rebound` holds rebound (Ephemerate): cast from hand and resolved, exiled and cast free at its caster's next upkeep.
`engine-echo` holds echo (Karmic Guide) and "unless" a mana cost with colors, paid the way the payer chooses.
`engine-protection-color` holds protection from a color, as the source now is: no damage, block, target or Aura.
`engine-unless-either-way` holds Divert Disaster's "unless its controller pays; if they do, you ...", an outcome either way.
`engine-adventure` holds adventures (CR 715; Bofur, Reliable Guardian // Concerted Care): an adventurer card cast as itself
or as its Adventure, each weighed by its own characteristics; exiled as the Adventure resolves and cast as itself from there,
by the Adventure's controller; countered or copied, from the command zone, by an effect, and a land adventurer.
`engine-wanderer` holds The Eternal Wanderer's pieces: no more than one creature attacking it, refused with what to do and
kept by the pilots; a return at the beginning of its owner's next end step; a creature chosen for each player, the rest
sacrificed.
`engine-counts-among` holds Fell the Mighty's power greater than a target's, read as it resolves; Faeburrow Elder's mana of
every color among your permanents; Loot, the Nexus's count of different powers.
`engine-paradigm` holds paradigm (Germination Practicum): the spell exiled as it resolves, and the first time one of its
name resolves for a player -- a copy's counting -- a copy cast free from exile at each of that player's precombat main
phases, in a four-player game; a countered one nothing, a declined copy gone.
`engine-class` holds a Class (Innkeeper's Talent): each level gained as a sorcery from the level below, its abilities had
from that level, no copy or new object with a level; ward {1} on what has counters; every counter its controller puts --
entering, as a loyalty cost, by infect, by proliferate -- doubled, and no other player's.
`engine-transform` holds a card that transforms (Venat, Heart of Hydaelyn // Hydaelyn, the Mothercrystal): its front face
everywhere but the battlefield, never cast as its back; turned over, the same object with its back face's characteristics
and its front face's mana value, and a new timestamp; ignored once it has transformed since its ability went on the stack;
never a copy; until its controller's next turn in four seats.
`engine-manifest` holds manifest (Reality Shift): a face-down 2/2 with no name, the card its controller's alone to see --
no other seat's projection, no event and no line of the history names it -- turned face up for its mana cost as a special
action, the same object, or revealed as it leaves.
`engine-ability-tax` holds Tithe Taker's "during your turn, spells your opponents cast and abilities they activate cost {1}
more": each opponent's, in three players, never its controller's, never on another's turn; a {T} ability, a card's in hand,
X; the increase before a reduction; and mana abilities untouched.
`engine-mill-cost` holds a mill in a mana ability's cost (Millikin): offered only with the cards to mill, milled before the
mana is added, off the stack, and never tapped by a cast for itself.
`engine-corrupted` holds Skrelv's Hive's corrupted -- an opponent still in the game with three poison counters -- and "with
toxic" in a layer's affects, ordered behind an effect that gives the keyword (CR 613.8a); its Mite that can't block.
`engine-next-upkeep` holds "at the beginning of your next upkeep" (Rally the Ancestors): its controller's own, past every
other player's in four, one made in that upkeep waiting for the next; and "mana value X or less".
`engine-dig-total` holds "any number of cards with total mana value 4 or less" (Ao, the Dawn Sky): one card a question,
only what still fits, "No more", the rest under in a random order; and "each permanent that's a creature or Vehicle" once.
`engine-vow` holds Promise of Loyalty: each player keeps exactly one creature, asked in turn order in four players, a vow
counter on it, the rest sacrificed at once; and those can't attack its caster or their planeswalkers while the counter stays.
`engine-play-permission` holds which permanent's permission a card is played through when they differ (Serra Paragon,
Crucible of Worlds, Bolas's Citadel, Thundermane Dragon): each its own offer; Paragon's grant on the permanent while it is
that object; the Citadel's life rather than mana, X as 0, a card with no mana cost for 0.
`engine-sacrifice-many` holds Bolas's Citadel's "sacrifice ten nonland permanents": listed while the sets are few, asked once
taken past that, checked again as paid; each opponent still in the game losing 10.
`engine-mana-riders` holds mana that triggers when spent (Path of Ancestry, Study Hall): paid with it or without as the player
chooses, the plain mana first where it does nothing, which rider when one must go, gone with its pool; "shares a creature
type with your commander" with partners and changelings; the times a commander was cast from the command zone.
`engine-proliferate-twice` holds Tekuthal, Inquiry Dominus: each one doubling its controller's proliferates, each its own
choice; and three counters from among its controller's other permanents, picked once taken and checked as removed.
`engine-cards-x11-b2` holds what the scenarios of X11's second batch cannot reach: Topiary Stomper can't attack or block
unless its controller has seven lands, at six and at seven ("can't block" on a condition, now compiled); Plaza of Heroes'
two ways to make {W}, one only for a legendary spell; Purphoros an attacker only at devotion five.
`engine-mulligan` holds the
London rule: every mulligan draws seven, the bottoming happens when you keep and over the hand you
kept, the player chooses which cards go, and they go to the bottom.

`engine-gate` is the one that asks whether the rules together produce a game. It plays **a thousand
whole four-player Commander games** — mulligan to finish, driven end to end by the random-legal
pilot — and holds all three clauses of the phase 1 gate at once: every game runs to completion with
no exception, the same seed replays to the same state hash and a byte-identical journal, and no
seat's projection ever contains a card it may not see. It takes about ten seconds, which is why it
runs in full rather than on a sample; a fraction of a gate is not a gate. It found two real defects
on its first two runs that no single-rule suite would have.

Phase 2 opens with `engine-vocabulary`, which turns §12.2's primitive catalog from a prose list into
data — the compiler is handed it as an input, and the card schema has to refuse a name that is not
in it, or an unsupported construct arrives silently. It also holds the seam between the engine's
vocabulary and `card-classify.js`'s: the classifier's terms are checked against its real output over
all 2,367 cards, so a typo in one of its regexes cannot emit a term that six reading files silently
fail to match. Measuring that seam moved it — roles turn out to be strategic judgments no primitive
derives, and it is the triggers and keywords that describe the same things and disagree.
`engine-filter` is the selector grammar — the sentence "another target creature you control" as
data, and the construct the compiler will emit most often. It holds that "another" means other than
the source rather than other than the last one picked, that "you" is the ability's controller and
not the card's owner, that `target` enforces hexproof and shroud (and that the two differ in
exactly whom they stop), and that a key the grammar does not have is refused rather than ignored.
`engine-schema` is `CrankCardScript@1` itself. Thirty-one thousand definitions will be written by a
model, so it is not documentation — it is what stands between a plausible-looking generated
document and a game that plays it wrong. Every effect must name a primitive from the catalog
(`destroyCreature` is not one, reads perfectly, and would otherwise compile, validate, ship and do
nothing); every ability carries the oracle sentence it implements, so it can be re-checked when the
text changes; each ability kind is held to what its engine module actually needs, since a schema
that agreed with itself and not with the engine would pass documents the engine then refused; and
validation returns every problem at once, because the compiler retries against them. `engine-effects`
is where a definition stops being a document: the twenty-five most-used primitives are **measured**
rather than chosen — `game/docs/engine-inventory.json` counted 64 distinct Forge APIs and 821 uses
across Rob's seven decks, and the top 25 are 90.9% of them. Twenty-one are built; the four that ask
a player something need a resolution that can stop and resume, and are absent rather than stubbed.
Damage goes through prevention, a pump is a continuous effect rather than a number written into the
card so it wears off with nothing to undo, and indestructible cannot be destroyed.
`engine-resolution` is the other four, and the machinery they need: a resolution that stops half
way through and carries on, so "scry 2, then draw a card" asks between the two and the draw still
happens. It is a queue rather than a call stack, which is what makes a modal containing a scry work
with an effect still waiting behind the whole modal — and it is plain data, so a game saved in the
middle of an effect resumes in the middle of that effect. `engine-keywords` is the family combat
already half-knew: flying is 52 of the keyword uses in Rob's seven decks and until this the engine
knew the word and did nothing with it. Menace is checked against the whole set of blockers rather
than one at a time, because "except by two or more creatures" cannot be expressed per blocker and
silently does nothing if you try; deathtouch changes what lethal means for the assignment and
destroys as a state-based action; trample pushes the excess through and without it the excess is
simply lost; and first strike finally makes `COMBAT_FIRST_STRIKE_DAMAGE` happen, which the turn
table has carried as a conditional step since 1.2. `engine-enters` is the other half of the largest
construct in Rob's collection: effects that change HOW a permanent arrives rather than where a card
goes. A land that enters tapped says so with its own ability, and CR 614.12 means that ability has
to be read while the land is still a card in a hand — every other replacement in the engine is
found by scanning the battlefield and this one cannot be. It is also one event and not two: a
permanent that enters tapped was never untapped, so nothing that watches for tapping sees anything,
and a 0/0 that enters with counters is never a 0/0 on the battlefield to die to state-based
actions. `engine-runtime` is the piece that replaces
Forge: the same seven exports `serve-review.mjs` imports from the launcher, compared function for
function and arity for arity, because a runtime that is "mostly the same shape" fails on the call
nobody exercised until a real game was in progress. Underneath there is no child process, no port
and nothing to go stale; resume reads a checkpoint rather than hoping a JVM is still alive; and a
pod containing cards the engine has no definition for is refused **before the game starts, with the
cards named** — which is what makes the flag worth flipping today.

`runtests.sh` covers both trees: the website suites in `tests/` and the CrankMagic Online
suites in `game/tests/`. It exits non-zero when any of them fails. `tools/run-suites.mjs` runs
them for it, several at a time (`SUITE_JOBS`, the cores less one, at most four), then the
browser suites each alone, and stops and fails a suite still running after
`SUITE_TIMEOUT_MINUTES` (20).

`tools/local-ci.sh [commit] [runs]` is the Tests workflow on this machine, for when GitHub
Actions cannot run it (the repository is private on the free plan, and a spent month of
minutes stops every job): a clean checkout of the commit, merged with `main` if `main` has
moved, the workflow's toolchain checked, both of its steps run twice, and what the commit adds
scanned for secrets and personal addresses. AGENTS.md, "Merging to `main`", says when it stands
in for CI.

While Actions can run, `tools/quick-check.sh <suite.mjs>...` is the check before a push:
`tools/local-ci.sh HEAD 0` (the scan and the merge with `main`), then only the suites the
change touches. `tools/release-staging.sh` builds `origin/main` for staging, walks it, and only
then pushes `release/cloud-staging`; production is never released without Rob's go. A card
batch for the engine (M4 phase 3) is built with the helpers in `game/tools/batch/`, whose
README is the batch's procedure.

```sh
bash runtests.sh -q
node tools/check-glossary.mjs
node tools/build-live-load.mjs --check    # newest data/source/*Master*.xlsx → live-load, report only
node tools/build-live-state.mjs --check   # live-load → live-state, report only
# With the server above still running and Playwright available:
node tests/uat/journeys.mjs
```

`UAT_PLAYWRIGHT` can point to Playwright's index.js; `UAT_CHROMIUM` can select a browser
binary. The browser runner executes the production assembly/recovery journeys and the
retained 459-check legacy suite at desktop and phone widths. `tests/page-budget.mjs` holds
every page to a word, control and explainer budget before its first table or list, on the
committed live library at 1400 and 390 (`PAGE_BUDGET_REPORT=1` prints the measurements). It fails rather than
reporting a pass when a browser or server is missing. Node tests need no runtime package
installation. Workbook tests optionally use `XLSX_PYTHON` with openpyxl for independent
spreadsheet verification. See [tests/uat/README.md](tests/uat/README.md).

`data/cards.json` is the Card record set — one entry per card with its identity, printed facts, shown
printing, one dated price and the classifier's terms — and `tools/build-card-records.mjs` is its one
producer (`--add "Name"` fetches a card from Scryfall; `--check` proves the committed files are what a
rebuild would write); `data/card-facts.json` and the graph's card block derive from it. The library
(schema 3) references the record: a card the record set carries is stored as its identity alone and
read through the catalog, so a change to the record reaches every library; a card the record set
does not carry is kept whole, because the library is the only copy.
Every data file under `data/` and `sim/` opens with `{schema, stamp, generator, count}`;
`schema/index.mjs` registers each one with its producer and the tool whose `--check` vouches for
it, `schema/*.json` describes its shape, and readers pass what they fetch through
`CrankAssets.expect()`. Changed assets require a new `?v=` everywhere referenced, then
`node tests/asset-versions.mjs --update`. **Refreshing the data** — a set released, prices
stale, EDHREC moved — is `node tools/refresh.mjs`: the generators the registry names, in the
order `docs/crankmagic-refresh.md` requires, then the `?v=` cascade for the files that
changed, then the proof (every producer's `--check`, the asset manifest, the suite count,
`runtests.sh`); `--plan` prints the steps, `--check` runs only the proofs, and the Claude skill
`.claude/skills/crankmagic-refresh` is the judgment around it. There are 370 Node suites here, plus 36 CrankMagic Online suites in `game/tests/`; `runtests.sh` runs all of them:

- `architecture-page` — `tests/architecture-page.mjs`
- `asset-versions` — `tests/asset-versions.mjs`
- `assignment-model` — `tests/assignment-model.mjs`
- `browser-geometry` — `tests/browser-geometry.mjs`
- `card-classify` — `tests/card-classify.mjs`
- `card-records` — `tests/card-records.mjs`
- `card-images` — `tests/card-images.mjs`
- `card-link` — `tests/card-link.mjs`
- `cloud-sync` — `tests/cloud-sync.mjs`
- `cloud-worker` — `tests/cloud-worker.mjs`
- `collection-exchange` — `tests/collection-exchange.mjs`
- `collection-lobby-draft` — `tests/collection-lobby-draft.mjs`
- `collection-model` — `tests/collection-model.mjs`
- `combat` — `tests/combat.mjs`
- `commander-pilots` — `tests/commander-pilots.mjs`
- `commander-snapshots` — `tests/commander-snapshots.mjs`
- `compliance-model` — `tests/compliance-model.mjs`
- `copy-merge` — `tests/copy-merge.mjs`
- `crankmagic-core` — `tests/crankmagic-core.mjs`
- `crankmagic-facets` — `tests/crankmagic-facets.mjs`
- `crankmagic-graph` — `tests/crankmagic-graph.mjs`
- `crankmagic-graph-scoped` — `tests/crankmagic-graph-scoped.mjs`
- `explore-scope` — `tests/explore-scope.mjs`
- `feature-wiring` — `tests/feature-wiring.mjs`
- `explore-progressive-disclosure` — `tests/explore-progressive-disclosure.mjs`
- `crankmagic-loops` — `tests/crankmagic-loops.mjs`
- `crankmagic-lens` — `tests/crankmagic-lens.mjs`
- `commander-strategies` — `tests/commander-strategies.mjs`
- `crankmagic-trace` — `tests/crankmagic-trace.mjs`
- `crankmagic-rules` — `tests/crankmagic-rules.mjs`
- `crankmagic-sim` — `tests/crankmagic-sim.mjs`
- `crankmagic-change` — `tests/crankmagic-change.mjs`
- `crankmagic-sandbox` — `tests/crankmagic-sandbox.mjs`
- `crankmagic-lobby` — `tests/crankmagic-lobby.mjs`
- `crankmagic-tabletop` — `tests/crankmagic-tabletop.mjs`
- `crankmagic-trade` — `tests/crankmagic-trade.mjs`
- `crankmagic-workbook` — `tests/crankmagic-workbook.mjs`
- `data-integrity` — `tests/data-integrity.mjs`
- `data-manifest` — `tests/data-manifest.mjs`
- `deck-generator` — `tests/deck-generator.mjs`
- `deck-import` — `tests/deck-import.mjs`
- `deck-measure` — `tests/deck-measure.mjs`
- `design-tokens` — `tests/design-tokens.mjs`
- `first-draw-check` — `tests/first-draw-check.mjs`
- `play-audio-pack` — `tests/play-audio-pack.mjs`
- `script-encoding` — `tests/script-encoding.mjs`
- `wireframe-conformance` — `tests/wireframe-conformance.mjs`
- `deck-sources` — `tests/deck-sources.mjs`
- `docx-writer` — `tests/docx-writer.mjs`
- `edhrec-client` — `tests/edhrec-client.mjs`
- `engine-cards` — `tests/engine-cards.mjs`
- `engine-catalog` — `tests/engine-catalog.mjs`
- `engine-deaths` — `tests/engine-deaths.mjs`
- `engine-compile` — `tests/engine-compile.mjs`
- `engine-costs` — `tests/engine-costs.mjs`
- `engine-amounts` — `tests/engine-amounts.mjs`
- `engine-conditions` — `tests/engine-conditions.mjs`
- `engine-auras` — `tests/engine-auras.mjs`
- `engine-copies` — `tests/engine-copies.mjs`
- `engine-unless` — `tests/engine-unless.mjs`
- `engine-flicker` — `tests/engine-flicker.mjs`
- `engine-other-zones` — `tests/engine-other-zones.mjs`
- `engine-remembered` — `tests/engine-remembered.mjs`
- `engine-once` — `tests/engine-once.mjs`
- `engine-unblockable` — `tests/engine-unblockable.mjs`
- `engine-surveil` — `tests/engine-surveil.mjs`
- `engine-enters-with` — `tests/engine-enters-with.mjs`
- `engine-uncounterable` — `tests/engine-uncounterable.mjs`
- `engine-attack-triggers` — `tests/engine-attack-triggers.mjs`
- `engine-damage-all` — `tests/engine-damage-all.mjs`
- `engine-free-cast` — `tests/engine-free-cast.mjs`
- `engine-that-many` — `tests/engine-that-many.mjs`
- `engine-discard` — `tests/engine-discard.mjs`
- `engine-regenerate` — `tests/engine-regenerate.mjs`
- `engine-life-gained` — `tests/engine-life-gained.mjs`
- `engine-copy-spell` — `tests/engine-copy-spell.mjs`
- `engine-flashback` — `tests/engine-flashback.mjs`
- `engine-ward` — `tests/engine-ward.mjs`
- `engine-phases` — `tests/engine-phases.mjs`
- `engine-triggers-again` — `tests/engine-triggers-again.mjs`
- `engine-modes` — `tests/engine-modes.mjs`
- `engine-repeat` — `tests/engine-repeat.mjs`
- `engine-present` — `tests/engine-present.mjs`
- `engine-static-conditions` — `tests/engine-static-conditions.mjs`
- `engine-alternative-cost` — `tests/engine-alternative-cost.mjs`
- `engine-control` — `tests/engine-control.mjs`
- `engine-effect-conditions` — `tests/engine-effect-conditions.mjs`
- `engine-damage-once` — `tests/engine-damage-once.mjs`
- `engine-sacrificed` — `tests/engine-sacrificed.mjs`
- `engine-condition-compare` — `tests/engine-condition-compare.mjs`
- `engine-play-from` — `tests/engine-play-from.mjs`
- `engine-damage-amount` — `tests/engine-damage-amount.mjs`
- `engine-damage-replaced` — `tests/engine-damage-replaced.mjs`
- `engine-remembered-moved` — `tests/engine-remembered-moved.mjs`
- `engine-flash-sacrifice` — `tests/engine-flash-sacrifice.mjs`
- `engine-cost-more` — `tests/engine-cost-more.mjs`
- `engine-tapped-for-mana` — `tests/engine-tapped-for-mana.mjs`
- `engine-storm-fight` — `tests/engine-storm-fight.mjs`
- `engine-untap-choose-type` — `tests/engine-untap-choose-type.mjs`
- `engine-ninjutsu` — `tests/engine-ninjutsu.mjs`
- `engine-crew` — `tests/engine-crew.mjs`
- `engine-chosen` — `tests/engine-chosen.mjs`
- `engine-restricted-mana` — `tests/engine-restricted-mana.mjs`
- `engine-become-copy` — `tests/engine-become-copy.mjs`
- `engine-station` — `tests/engine-station.mjs`
- `engine-enter-copy` — `tests/engine-enter-copy.mjs`
- `engine-saga` — `tests/engine-saga.mjs`
- `engine-play` — `tests/engine-play.mjs`
- `engine-dig-until` — `tests/engine-dig-until.mjs`
- `engine-cant-cast` — `tests/engine-cant-cast.mjs`
- `engine-poison` — `tests/engine-poison.mjs`
- `engine-earthbend` — `tests/engine-earthbend.mjs`
- `engine-attack-tax` — `tests/engine-attack-tax.mjs`
- `engine-token-attacking` — `tests/engine-token-attacking.mjs`
- `engine-win-game` — `tests/engine-win-game.mjs`
- `engine-goad` — `tests/engine-goad.mjs`
- `engine-named-object` — `tests/engine-named-object.mjs`
- `engine-damage-redirect` — `tests/engine-damage-redirect.mjs`
- `engine-branch-reflexive` — `tests/engine-branch-reflexive.mjs`
- `engine-peek` — `tests/engine-peek.mjs`
- `engine-changeling` — `tests/engine-changeling.mjs`
- `engine-attacker-untap` — `tests/engine-attacker-untap.mjs`
- `engine-grants` — `tests/engine-grants.mjs`
- `engine-prowess-toxic` — `tests/engine-prowess-toxic.mjs`
- `engine-life-lost-infect` — `tests/engine-life-lost-infect.mjs`
- `engine-moved-this-way` — `tests/engine-moved-this-way.mjs`
- `engine-random-stream` — `tests/engine-random-stream.mjs`
- `engine-entering` — `tests/engine-entering.mjs`
- `engine-equip` — `tests/engine-equip.mjs`
- `engine-event-triggers` — `tests/engine-event-triggers.mjs`
- `engine-house-pilot` — `tests/engine-house-pilot.mjs`
- `engine-ingest` — `tests/engine-ingest.mjs`
- `engine-learned` — `tests/engine-learned.mjs`
- `engine-mana-abilities` — `tests/engine-mana-abilities.mjs`
- `engine-search` — `tests/engine-search.mjs`
- `engine-storage` — `tests/engine-storage.mjs`
- `engine-targets` — `tests/engine-targets.mjs`
- `engine-trigger-targets` — `tests/engine-trigger-targets.mjs`
- `game-record` — `tests/game-record.mjs`
- `generators` — `tests/generators.mjs`
- `graph-payload` — `tests/graph-payload.mjs`
- `guide-agent` — `tests/guide-agent.mjs`
- `guide-measured` — `tests/guide-measured.mjs`
- `lab-report` — `tests/lab-report.mjs`
- `library-references` — `tests/library-references.mjs`
- `lineup-compliance` — `tests/lineup-compliance.mjs`
- `live-load` — `tests/live-load.mjs`
- `manual-rung` — `tests/manual-rung.mjs`
- `master-regenerates` — `tests/master-regenerates.mjs`
- `page-budget` — `tests/page-budget.mjs`
- `pilot-policy` — `tests/pilot-policy.mjs`
- `qr` — `tests/qr.mjs`
- `refresh` — `tests/refresh.mjs`
- `release-pages` — `tests/release-pages.mjs`
- `scryfall-timeout` — `tests/scryfall-timeout.mjs`
- `schemas` — `tests/schemas.mjs`
- `service-worker` — `tests/service-worker.mjs`
- `shop-export` — `tests/shop-export.mjs`
- `sim-engine` — `tests/sim-engine.mjs`
- `status-and-groupings` — `tests/status-and-groupings.mjs`
- `slot-model` — `tests/slot-model.mjs`
- `tour` — `tests/tour.mjs`
- `type-final` — `tests/type-final.mjs`
- `shell-r3` — `tests/shell-r3.mjs`
- `settings-r3` — `tests/settings-r3.mjs`
- `reset-all` — `tests/reset-all.mjs`
- `decks-hub` — `tests/decks-hub.mjs`
- `deck-page-r3` — `tests/deck-page-r3.mjs`
- `library-r3` — `tests/library-r3.mjs`
- `explore-r3` — `tests/explore-r3.mjs`
- `card-states` — `tests/card-states.mjs`
- `card-states-screens` — `tests/card-states-screens.mjs`
- `landing-r3` — `tests/landing-r3.mjs`
- `cards-57` — `tests/cards-57.mjs`
- `card-size` — `tests/card-size.mjs`
- `import-link` — `tests/import-link.mjs`
- `precons` — `tests/precons.mjs`
- `build-wizard` — `tests/build-wizard.mjs`
- `mobile-r3` — `tests/mobile-r3.mjs`
- `ai-door` — `tests/ai-door.mjs`
- `game-room` — `tests/game-room.mjs`
- `room-refusals` — `tests/room-refusals.mjs`
- `room-slices` — `tests/room-slices.mjs`
- `game-table` — `tests/game-table.mjs`
- `game-leave` — `tests/game-leave.mjs`
- `table-lobby` — `tests/table-lobby.mjs`
- `table-board` — `tests/table-board.mjs`
- `room-beats` — `tests/room-beats.mjs`
- `board-choices` — `tests/board-choices.mjs`
- `crankmagic-audio` — `tests/crankmagic-audio.mjs`
- `advise-brief` — `tests/advise-brief.mjs`
- `import-flow` — `tests/import-flow.mjs`
- `deck-holds-cards` — `tests/deck-holds-cards.mjs`
- `group-templates` — `tests/group-templates.mjs`
- `move-to-group` — `tests/move-to-group.mjs`
- `import-by-group` — `tests/import-by-group.mjs`
- `table-by-group` — `tests/table-by-group.mjs`
- `table-sorting` — `tests/table-sorting.mjs`
- `drafts-reserve` — `tests/drafts-reserve.mjs`
- `game-replay` — `tests/game-replay.mjs`
- `table-record` — `tests/table-record.mjs`
- `slow-start` — `tests/slow-start.mjs`
- `menu-help` — `tests/menu-help.mjs`
- `playtest-findings` — `tests/playtest-findings.mjs`
- `migrate-dry-run` — `tests/migrate-dry-run.mjs`
- `sw-update` — `tests/sw-update.mjs`
- `game-history` — `tests/game-history.mjs`
- `user-state` — `tests/user-state.mjs`
- `xlsx-writer` — `tests/xlsx-writer.mjs`
- `engine-rules-conformance` — `tests/engine-rules-conformance.mjs`
- `engine-room-games` — `tests/engine-room-games.mjs`
- `engine-targets-up-to` — `tests/engine-targets-up-to.mjs`
- `engine-afterlife-tokens` — `tests/engine-afterlife-tokens.mjs`
- `engine-turn-records` — `tests/engine-turn-records.mjs`
- `engine-escape` — `tests/engine-escape.mjs`
- `engine-encore` — `tests/engine-encore.mjs`
- `engine-attack-restrictions` — `tests/engine-attack-restrictions.mjs`
- `engine-derive-once` — `tests/engine-derive-once.mjs`
- `engine-modal-triggers` — `tests/engine-modal-triggers.mjs`
- `engine-exile-until` — `tests/engine-exile-until.mjs`
- `engine-mdfc` — `tests/engine-mdfc.mjs`
- `engine-planeswalkers` — `tests/engine-planeswalkers.mjs`
- `engine-tap-to-cast` — `tests/engine-tap-to-cast.mjs`
- `engine-pay-choice` — `tests/engine-pay-choice.mjs`
- `staging-check` — `tests/staging-check.mjs`
- `engine-cards-pb1` — `tests/engine-cards-pb1.mjs`
- `engine-cards-pb2` — `tests/engine-cards-pb2.mjs`
- `engine-modes-up-front` — `tests/engine-modes-up-front.mjs`
- `engine-cards-pb9` — `tests/engine-cards-pb9.mjs`
- `engine-amass` — `tests/engine-amass.mjs`
- `engine-convoke` — `tests/engine-convoke.mjs`
- `engine-storied` — `tests/engine-storied.mjs`
- `engine-evoke` — `tests/engine-evoke.mjs`
- `engine-mana-spent` — `tests/engine-mana-spent.mjs`
- `engine-investigate` — `tests/engine-investigate.mjs`
- `engine-may-play` — `tests/engine-may-play.mjs`
- `engine-cards-pb25` — `tests/engine-cards-pb25.mjs`
- `engine-cant-gain-life` — `tests/engine-cant-gain-life.mjs`
- `engine-cycle-triggers` — `tests/engine-cycle-triggers.mjs`
- `engine-partner-keywords` — `tests/engine-partner-keywords.mjs`
- `engine-combat-damaged` — `tests/engine-combat-damaged.mjs`
- `engine-dig-until-count` — `tests/engine-dig-until-count.mjs`
- `engine-card-types-among` — `tests/engine-card-types-among.mjs`
- `engine-cost-exile-counter` — `tests/engine-cost-exile-counter.mjs`
- `engine-spend-only-effect` — `tests/engine-spend-only-effect.mjs`
- `engine-graveyard-triggers` — `tests/engine-graveyard-triggers.mjs`
- `engine-cleanup-step` — `tests/engine-cleanup-step.mjs`
- `engine-animate-colors` — `tests/engine-animate-colors.mjs`
- `engine-blight-cost` — `tests/engine-blight-cost.mjs`
- `engine-blight-additional` — `tests/engine-blight-additional.mjs`
- `engine-mana-spent-on` — `tests/engine-mana-spent-on.mjs`
- `engine-chosen-color` — `tests/engine-chosen-color.mjs`
- `engine-spell-cast-filters` — `tests/engine-spell-cast-filters.mjs`
- `engine-entered-this-turn` — `tests/engine-entered-this-turn.mjs`
- `engine-stun-and-tap-three` — `tests/engine-stun-and-tap-three.mjs`
- `engine-owner-chooses-library` — `tests/engine-owner-chooses-library.mjs`
- `engine-blight-or-pay` — `tests/engine-blight-or-pay.mjs`
- `engine-reveal-until-creature` — `tests/engine-reveal-until-creature.mjs`
- `engine-cant-attack-jaces` — `tests/engine-cant-attack-jaces.mjs`
- `engine-granted-loyalty` — `tests/engine-granted-loyalty.mjs`
- `engine-loyalty-activated` — `tests/engine-loyalty-activated.mjs`
- `engine-opponents-lands` — `tests/engine-opponents-lands.mjs`
- `engine-empower-jace` — `tests/engine-empower-jace.mjs`
- `engine-destroyed-and-walker-damage` — `tests/engine-destroyed-and-walker-damage.mjs`
- `engine-excess-and-next-spell` — `tests/engine-excess-and-next-spell.mjs`
- `engine-counters-doubled` — `tests/engine-counters-doubled.mjs`
- `engine-piles-and-modes` — `tests/engine-piles-and-modes.mjs`
- `engine-linked-exile` — `tests/engine-linked-exile.mjs`
- `engine-protection` — `tests/engine-protection.mjs`
- `engine-cant-lose` — `tests/engine-cant-lose.mjs`
- `engine-impending` — `tests/engine-impending.mjs`
- `engine-overload` — `tests/engine-overload.mjs`
- `engine-discover` — `tests/engine-discover.mjs`
- `engine-eminence` — `tests/engine-eminence.mjs`
- `engine-no-legend-rule` — `tests/engine-no-legend-rule.mjs`
- `engine-loyalty-x` — `tests/engine-loyalty-x.mjs`
- `engine-multikicker` — `tests/engine-multikicker.mjs`
- `engine-set-subtypes` — `tests/engine-set-subtypes.mjs`
- `engine-suspend` — `tests/engine-suspend.mjs`
- `engine-phasing` — `tests/engine-phasing.mjs`
- `engine-exigent` — `tests/engine-exigent.mjs`
- `engine-name-lock` — `tests/engine-name-lock.mjs`
- `engine-linked-token` — `tests/engine-linked-token.mjs`
- `engine-same-name-exile` — `tests/engine-same-name-exile.mjs`
- `engine-exiled-trigger` — `tests/engine-exiled-trigger.mjs`
- `engine-came-from` — `tests/engine-came-from.mjs`
- `engine-rebound` — `tests/engine-rebound.mjs`
- `engine-echo` — `tests/engine-echo.mjs`
- `engine-protection-color` — `tests/engine-protection-color.mjs`
- `engine-unless-either-way` — `tests/engine-unless-either-way.mjs`
- `engine-adventure` — `tests/engine-adventure.mjs`
- `engine-wanderer` — `tests/engine-wanderer.mjs`
- `engine-counts-among` — `tests/engine-counts-among.mjs`
- `engine-paradigm` — `tests/engine-paradigm.mjs`
- `engine-class` — `tests/engine-class.mjs`
- `engine-transform` — `tests/engine-transform.mjs`
- `engine-manifest` — `tests/engine-manifest.mjs`
- `engine-ability-tax` — `tests/engine-ability-tax.mjs`
- `engine-mill-cost` — `tests/engine-mill-cost.mjs`
- `engine-corrupted` — `tests/engine-corrupted.mjs`
- `engine-next-upkeep` — `tests/engine-next-upkeep.mjs`
- `engine-dig-total` — `tests/engine-dig-total.mjs`
- `engine-vow` — `tests/engine-vow.mjs`
- `engine-play-permission` — `tests/engine-play-permission.mjs`
- `engine-sacrifice-many` — `tests/engine-sacrifice-many.mjs`
- `engine-mana-riders` — `tests/engine-mana-riders.mjs`
- `engine-proliferate-twice` — `tests/engine-proliferate-twice.mjs`
- `engine-cards-x11-b2` — `tests/engine-cards-x11-b2.mjs`

- `engine-attack-requirements` - `tests/engine-attack-requirements.mjs`
- `engine-defender-permission` - `tests/engine-defender-permission.mjs`
- `engine-ability-haste` - `tests/engine-ability-haste.mjs`
- `engine-unless-return` - `tests/engine-unless-return.mjs`
- `engine-sacrificed-amounts` - `tests/engine-sacrificed-amounts.mjs`
- `engine-top-card-abilities` - `tests/engine-top-card-abilities.mjs`
- `engine-exchange-life` - `tests/engine-exchange-life.mjs`
- `engine-damage-each` - `tests/engine-damage-each.mjs`
- `engine-designations` - `tests/engine-designations.mjs`
- `engine-prepare` - `tests/engine-prepare.mjs`
- `engine-connive-memory` - `tests/engine-connive-memory.mjs`
- `engine-block-designation-triggers` - `tests/engine-block-designation-triggers.mjs`
- `engine-target-constraints` - `tests/engine-target-constraints.mjs`
- `engine-mana-value-count-cap` - `tests/engine-mana-value-count-cap.mjs`
- `engine-linked-memory` - `tests/engine-linked-memory.mjs`
- `engine-hidden-exile` - `tests/engine-hidden-exile.mjs`
- `engine-moved-memory` - `tests/engine-moved-memory.mjs`
- `engine-copy-memory` - `tests/engine-copy-memory.mjs`
- `engine-source-memory` - `tests/engine-source-memory.mjs`
- `engine-card-choice-memory` - `tests/engine-card-choice-memory.mjs`
- `engine-enter-transformed` - `tests/engine-enter-transformed.mjs`
- `engine-power-comparison` - `tests/engine-power-comparison.mjs`
- `engine-x11-flanking` - `tests/engine-x11-flanking.mjs`: flanking (Sidar Kondo of Jamuraa), once per blocker without it, and a selector's "without" a keyword
- `engine-x11-umbra-armor` - `tests/engine-x11-umbra-armor.mjs`: umbra armor (Treefolk Umbra) wherever a permanent would be destroyed, and the CR 616.1 choice between two ways out
- `engine-x11-living-weapon` - `tests/engine-x11-living-weapon.mjs`: living weapon (Bitterthorn, Nissa's Animus), the Germ made and equipped, its controller's
- `engine-x11-evolve` - `tests/engine-x11-evolve.mjs`: evolve (Fathom Mage), its comparison as it triggers and resolves, and a trigger for each counter, entered with or put on
- `engine-x11-backup` - `tests/engine-x11-backup.mjs`: backup (Guardian Scalelord), its counter, and the abilities printed below it given to another creature until end of turn
- `engine-x11-cumulative-upkeep` - `tests/engine-x11-cumulative-upkeep.mjs`: cumulative upkeep (Mystic Remora), an age counter each upkeep and its cost for every one, or sacrificed
- `engine-x11-prowl` - `tests/engine-x11-prowl.mjs`: prowl (Latchkey Faerie), after combat damage by a source of the caster's sharing a creature type, this turn
- `engine-x11-escalate` - `tests/engine-x11-escalate.mjs`: escalate (Collective Effort), its cost for each mode beyond the first, the creatures to tap asked of the caster
- `engine-x11-unearth` - `tests/engine-x11-unearth.mjs`: unearth (Salvation Colossus), from the graveyard at sorcery speed for mana or energy, and exiled at the end step or instead of leaving any other way
- `engine-x11-ascend` - `tests/engine-x11-ascend.mjs`: ascend (Wayward Swordtooth), the city's blessing at ten permanents for the rest of the game, a permanent's and a spell's, and "unless you have the city's blessing"

## Design and execution record

- [Commander companion: current plan](docs/commander-simulator-plan-2026-09-15.md) — accepted local-first successor to the game and fidelity plans, including the central four-player counter, independent AI difficulty, exact deck snapshots, rules-engine reuse, and the play/refine/replay loop. [Run the engine proof and table preview](game/README.md); [C0 evidence and remaining gates](game/docs/c0-evidence.md). The current preview replays a real game; human play and API pilots are still pending.
- [Current implementation status](docs/crankmagic-build-status.md)
- [The Table as a play space](docs/crankmagic-playspace-plan.md) — the sandbox (moves are proposals until Confirm, one overlay all three lenses read through, the sitting persisting across a reload), the three zones, the draw pile and trays, the table's two jobs (calibrate a deck · sort the shelf into groups), Watched redefined to cover a card you own and are considering, canvases, and the speed budget; plan only, six PRs, decisions recorded in §6
- [The app inventory plan](docs/crankmagic-inventory-plan.md) — wireframes of every page and the feature register (every feature group and feature, where it lives, how it is reached, what it commits, what covers it), generated so it cannot drift; plan only, for a separate session to execute before any streamlining
- [Original game plan](docs/crankmagic-game-plan.md) — historical G0 lobby design and earlier engine proposals. The accepted Commander companion plan above supersedes its referee, API-cost assumptions, and remaining build sequence. The implemented lobby still supplies library, Archidekt, pasted, and generated deck sources.
- [The persistent-app plan](docs/crankmagic-persistent-plan.md) — accounts, per-user sync and crankmagic.com on a hosted runtime; plan only, not started
- [The Discover / loop plan](docs/crankmagic-discover-loop-plan.md) — Primary Purpose, loop vocabulary, loop edges and loop-mode depth, the role lens; PR A and B shipped, C–D planned
- [Loop patterns](docs/crankmagic-loop-patterns.md) — the combo, loop, stacking and blink shapes the graph should recognize, in the classifier's vocabulary
- [Architecture](docs/crankmagic-architecture.md)
- [Keeping the catalog current](docs/crankmagic-refresh.md) — what a periodic refresh regenerates, in what order, and what it must never do
- [Approved plan and standalone mock](design/crankmagic/README.md)
- [Astra's simulator/application evaluations](design/crankmagic/evaluations.md)
- [Held simulator improvement plan](design/crankmagic/simulation-fidelity-plan.md)
- [Original project map and design history](docs/handover-index.md)

Work stays on a branch. Release review uses a draft pull request; nothing merges into main
automatically. Application test success is not a claim of human-calibrated simulation.

## License, fan content and third-party material

**CrankMagic is source-available, not open source.** The repository is public so the work can be
seen; all commercial rights are reserved. You may read it, run your own copy for personal
non-commercial use, and fork it to experiment. Hosting it as a service, putting any part of it in
a product, or any other commercial use needs written permission — see [LICENSE](LICENSE) §2, and
§3 for commercial and acquisition enquiries.

`game/engine-adapter/` is the exception: it links Forge and is **GPL-3.0-or-later**, kept in its
own directory with nothing in CrankMagic depending on it so the boundary stays clean.

**CrankMagic is unofficial Fan Content permitted under the Wizards of the Coast Fan Content Policy.
Not approved or endorsed by Wizards. Portions of the materials used are property of Wizards of the
Coast. ©Wizards of the Coast LLC.** Card data and images come from Scryfall, commander ranks from
EDHREC; neither is affiliated with this project. Card art, playmat images and the Satoshi typeface
are **not** redistributable with a fork.

Read [DISCLAIMER.md](DISCLAIMER.md) for the warranty, liability, trademark and indemnity terms, and
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for every third-party source and what is known
about its terms.
