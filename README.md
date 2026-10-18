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
`room-refused-answer` holds a person's answer the rules refuse (the live fuzz found one): refused, 422, in the rules'
words, with nothing changed -- storage key for key, the game, the view, no tape entry and no receipt -- and the same
question still pending; the valid answer after it taken, the room reopened playing on and its tape replaying; a priority
action the engine refuses likewise; an engine failure after an answer or a seat leaving undone with a 500 that says so;
the refused frame over the Durable Object; and `tools/fuzz-live.mjs`'s random person answering a refused question again.
`room-g1-terms` holds gate G1's other two terms on Rob's real decks (`tools/fuzz-live.mjs --replay --leaks`): what each
seat may know of a card read off the state -- a hand its owner's, a library no one's but a revealed or looked-at top, a
face-down card its controller's or its lookers', a name with a copy anywhere public no secret -- a name found only where
it names a card, a planted leak found, a whole game of four of the decks with nothing leaked and an identical replay, and
the checkpoints the replay found would not read back (an effect's `sublayer: undefined`, a copy's own values) now saved
and read back as the same game; and the harness's person going round a loop at most four times a turn, and none once its
seat controls a hundred permanents. `room-resolve-all` holds Resolve all (Rob, 2026-10-09): a run of the same trigger on
top of the stack read off it, offered as one decision in a game that asked for it and in no other, the room passing for
that seat through that run only -- asked again when another player's ability lands on top, no more passes than were
there, kept across a wake and replayed -- and the board's button beside the pass, with the run one line on the stack.
`room-untap-mana` holds Untap (Rob, 2026-10-11): a land tapped for mana, its mana unspent and nothing since, offered back
to its person -- any of a run of taps, the game then exactly as before the first, to its hash -- and never a tap that did
more (a pain land's damage), nor after a pass; kept with the room, replayed, and never taken by the fuzz harness's person.
`room-pooled-taps` holds floating mana and the sources left paying a cast together (`pooledTaps`; Rob's playtest,
2026-10-15): a table's new match offers the spell the pool and an untapped source pay between them, a match launched
before offers what it offered, the saved match keeps which, and a game with the key replays the same.
`room-yield-turn` and `engine-pass-stack` hold the stack passed for a person with no response, and Yield turn (Linear
ROB-13, the Oct 16 handoff): nobody asked over a spell they could do nothing about, but asked with an instant the mana
could pay, a mana ability that does more than add mana, any other ability, or having cast holding priority; a yielded
opponent's turn passing each priority of theirs while Declare blockers is still asked, ending with that turn (an extra
turn a new one) or its player, never carried, offered and shown in the seat's own view alone, kept across a wake, and
replayed -- and neither in a game launched before.
`room-draw-card` holds Draw card (Linear ROB-73, the Oct 15 playtest's P05): the draw step's draw one decision of its own,
`draw:<turn>`, its card the drawer's alone and another's hand a count; the same answer sent again, then or once the table
waits on someone else, its receipt and no second card; reopened while it waits, the same question; the first player's
first draw skipped only at two seats and only while the host keeps the rule; and an empty library drawn from, the game lost.
`room-events` holds the table's events (`events.v1`, Linear ROB-77): every view carrying what the action behind it did, each
event with the journal's id and the decision whose answer made it; a draw the drawer's alone, and only while the card is in
their hand, a move between two hidden zones no event, a face-down card unnamed; two views in a row sharing none; a reconnect
after an event it saw getting exactly what came since, or told to start over once that is older than the room keeps; and
reopened and replayed, the same events.
`table-basics` holds the table's basic lands as basic lands (Rob, 2026-10-11, Rampant Growth finding nothing): the table
plays the engine's own definitions, the room's own basics are Basic and of their land type, and every card's scenarios
pass played with the table's own lookup.
`coach` holds the Coach (X13): its brief, the person's own hand, the board as everyone sees it and their deck as a sorted
list, never another hand or a library's order; the table building it for the AI door alone; POST /api/ai/coach behind the
door's gates and its own switch, asking Haiku 5.5 in one to three sentences, aiming for one; an answer naming anything not
in the brief refused; and the board's panel showing the answer, Show me and Why?, and the AI door's sign-in.
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
pages' version and the seated identity, and what is wrong when Access refuses or the release is not the one expected; and, with `--agents`, the four agents' tokens (M8): four identities at staging, none admitted by production. `engine-cards-pb1` holds what the scenarios of Rob's
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
`engine-x11-permissions` holds what the scenarios of X11's permissions and control cards cannot reach: a card leaving a
graveyard counted per graveyard, cards only, from none each turn (Primary Research, Relic Retriever); Sower of Temptation's
control while it remains, control changes ending in timestamp order; a player leaving the game (CR 800.4a), each kind of
control change they had given back, what they still control exiled, what would return to them exiled (800.4c); Legion
Warboss's token required to attack this combat, mentor's lesser power as it resolves; four players, and the credits.
`engine-x11-leave` holds a player leaving the game (CR 800.4a): everything they own leaving every zone, the stack and
phasing, with nothing said of a hidden card; their spells leaving and abilities ceasing, a resolution of theirs cut short
and priority passed on; what they still control exiled; a permanent phased out under them phasing in after their turn
would have begun (702.26n); their delayed trigger never put on the stack, their "until this leaves" exile returning.
`engine-layer-prune` holds the dependency order made without the trials that cannot find one (CR 613.8a): a layer where no effect reads what another writes, and every shared write commutes, is in timestamp order with no pair tried; a real dependency is still found, and a one-way one with the one trial it needs; a sublayer of more than 64 effects loses none; and a whole seeded game of Rob's decks (the G1 game a person waited 20 seconds in) agrees with every skipped trial made.
`engine-x11-leave-questions` holds a player leaving the game while they are asked (CR 800.4f-h): their sacrifice, discard,
search, commander, Aura, attacking tokens and conniving left with them, the next player asked; an "unless" cost not paid;
any other choice -- a "may" of theirs, Fact or Fiction's piles, Gifts Ungiven's two -- made by another opponent, the
controller choosing which; the next defender blocking, the next player's triggers and targets, combat damage dealt to
nobody who has left (800.4e), priority to the next player (800.4j); and a fuzzed concession at every question of seeded
games, none stalling or leading to a refused answer.
`engine-x11-memory` holds the pieces the memory axis's last ten cards needed, at their edges and at four seats: discarding
"up to" two (Fable of the Mirror-Breaker); all of a kind of counter removed, counted, and a color asked for each mana
(Coalition Relic); "put into exile from your library and/or your graveyard" (Laelia); a reduction for spells cast from
anywhere but the hand (Advanced Reconstruction); copies cast (Mizzix's Mastery) and Overload credited; each creature card
exiled with it, a 1/1 Spirit in addition to its other types (Ghost Vacuum); Getaway Barrel, Settle the Wreckage and
Currency Converter at the edges the scenarios cannot reach; and an adventurer card's offer leaving the card as it was.
`engine-x11-counts-triggers` holds the counts and triggers of the effects axis's last cards: a creature dealt damage this
turn (Mirrodin Avenged), the other attackers sharing a creature type with one (Shared Animosity), the nontoken creatures
you controlled that were destroyed (Ceaseless Conflict), a mana value capped by a count (Venerable Warsinger), and a
preparation card cast. `engine-x11-turns-counters` holds extra turns (Ichormoon Gauntlet: the newest first, turn order
resumed after them, a departed player's dropped), counters moved and the kind asked, and "only once each turn" (Tidus).
`engine-x11-costs` holds the costs X11's costs worker built, each paid with what the player picks: Burn at the Stake's "tap
any number of untapped creatures you control" (one offer, asked once taken, never tapped for), Cathartic Reunion's two
discards, the mana abilities that tap another creature (Jaspera Sentinel, Saruli Caretaker) or exile a card from the
graveyard (Rubble Rouser, with its "when you do"), Lorehold Excavation's creature card exiled, and Squee, Dubious
Monarch's alternative cost from the graveyard, four other cards exiled (no escape); four players, both pilots' answers, the
refusals, and no payer ever choosing the creature or the card for the player.
`engine-x11-filters` holds the selector key X11's costs worker built for Hemlock Vial: "each equipped creature", an
Equipment attached and still there, not an Aura; only what the Vial's controller controls, its set fixed as it resolves.
`engine-x11-keep` holds the two ways X11's costs worker built to choose what is kept before the rest is sacrificed: Slaughter
the Strong's "creatures with total power 4 or less", each player asked in turn with the question's budget, refused past
it, all sacrificed at once; and Tragic Arrogance's caster choosing one of each type for every player, asked only where
there is a choice; four players, both pilots' answers, a planeswalker and an artifact land.
`engine-x11-finality` holds finality counters (CR 122.1h): a permanent with one exiled instead of put into a graveyard from
the battlefield, destroyed, sacrificed or dead to damage, any kind of permanent, beside another "exile it instead" without
a question, to a hand untouched; moveZone's "with a finality counter on it"; and Excava, the Risen Past at four players.
`engine-x11-pay-x` holds Halo Forager's "you may pay {X}. When you do, you may cast target instant or sorcery card with
mana value X from a graveyard without paying its mana cost. If that spell would be put into a graveyard, exile it
instead": every amount the payer could pay offered, which mana asked when it matters, the X carried to the reflexive
trigger's targets in every graveyard, the spell cast marked to be exiled, both pilots' answers, the schema.
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
`.claude/skills/crankmagic-refresh` is the judgment around it. There are 521 Node suites here, plus 36 CrankMagic Online suites in `game/tests/`; `runtests.sh` runs all of them:
`.claude/skills/crankmagic-refresh` is the judgment around it. There are 521 Node suites here, plus 36 CrankMagic Online suites in `game/tests/`; `runtests.sh` runs all of them:

- `architecture-page` — `tests/architecture-page.mjs`
- `asset-versions` — `tests/asset-versions.mjs`
- `assignment-model` — `tests/assignment-model.mjs`
- `browser-geometry` — `tests/browser-geometry.mjs`
- `card-classify` — `tests/card-classify.mjs`
- `card-records` — `tests/card-records.mjs`
- `card-images` — `tests/card-images.mjs`
- `card-link` — `tests/card-link.mjs`
- `cloud-sync` — `tests/cloud-sync.mjs`
- `commander-legality` — `tests/commander-legality.mjs`
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
- `deck-synergies` — `tests/deck-synergies.mjs`
- `deck-composition` — `tests/deck-composition.mjs`
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
- `readout-feeds` — `tests/readout-feeds.mjs`
- `script-encoding` — `tests/script-encoding.mjs`
- `wireframe-conformance` — `tests/wireframe-conformance.mjs`
- `deck-sources` — `tests/deck-sources.mjs`
- `docx-writer` — `tests/docx-writer.mjs`
- `edhrec-client` — `tests/edhrec-client.mjs`
- `engine-actions` — `tests/engine-actions.mjs`
- `engine-cast` — `tests/engine-cast.mjs`
- `engine-combat` — `tests/engine-combat.mjs`
- `engine-commander` — `tests/engine-commander.mjs`
- `engine-controller` — `tests/engine-controller.mjs`
- `engine-effects` — `tests/engine-effects.mjs`
- `engine-enters` — `tests/engine-enters.mjs`
- `engine-filter` — `tests/engine-filter.mjs`
- `engine-gate` — `tests/engine-gate.mjs`
- `engine-headers` — `tests/engine-headers.mjs`
- `engine-journal` — `tests/engine-journal.mjs`
- `engine-keywords` — `tests/engine-keywords.mjs`
- `engine-layers` — `tests/engine-layers.mjs`
- `engine-lki` — `tests/engine-lki.mjs`
- `engine-mana` — `tests/engine-mana.mjs`
- `engine-mulligan` — `tests/engine-mulligan.mjs`
- `engine-priority` — `tests/engine-priority.mjs`
- `engine-projection` — `tests/engine-projection.mjs`
- `engine-replacement` — `tests/engine-replacement.mjs`
- `engine-resolution` — `tests/engine-resolution.mjs`
- `engine-rng` — `tests/engine-rng.mjs`
- `engine-runtime` — `tests/engine-runtime.mjs`
- `engine-sba` — `tests/engine-sba.mjs`
- `engine-schema` — `tests/engine-schema.mjs`
- `engine-skeleton` — `tests/engine-skeleton.mjs`
- `engine-stack` — `tests/engine-stack.mjs`
- `engine-state` — `tests/engine-state.mjs`
- `engine-trigger` — `tests/engine-trigger.mjs`
- `engine-turn` — `tests/engine-turn.mjs`
- `engine-vocabulary` — `tests/engine-vocabulary.mjs`
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
- `agent-seat-table` — `tests/agent-seat-table.mjs` (an AI on Claude at the table: seated only through the AI door, asked on the table's alarm, held to its game's cap)
- `engine-scored-pilot` — `tests/engine-scored-pilot.mjs` (the house pilot's L1: draw odds, exact combat, its choices scored, Easy and Normal)
- `engine-ingest` — `tests/engine-ingest.mjs`
- `engine-learned` — `tests/engine-learned.mjs`
- `engine-mana-abilities` — `tests/engine-mana-abilities.mjs`
- `engine-exile-commanders` — `tests/engine-exile-commanders.mjs` (Quintorius and Maralen linked exile, free casting and owner choices)
- `engine-faerie-interactions` — `tests/engine-faerie-interactions.mjs` (second-card draws, Spellstutter's live Faerie count and Winnower's unequal power/toughness targets)
- `engine-chulane-completion` — `tests/engine-chulane-completion.mjs` (Guardian Project, Yavimaya Dryad, Claim Jumper)
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
- `table-shared-shell` — `tests/table-shared-shell.mjs`
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
- `room-seat-pilots` — `tests/room-seat-pilots.mjs` (an AI seat's Easy or Normal, from New table to the pilot; L1 games replay)
- `room-agent-seat` — `tests/room-agent-seat.mjs` (the LLM seat in the room: only its close calls offered to it, its answers on the tape)
- `room-refused-answer` — `tests/room-refused-answer.mjs`
- `room-g1-terms` — `tests/room-g1-terms.mjs`
- `game-table` — `tests/game-table.mjs`
- `game-leave` — `tests/game-leave.mjs`
- `table-lobby` — `tests/table-lobby.mjs`
- `table-board` — `tests/table-board.mjs`
- `board-callouts` — `tests/board-callouts.mjs` (the board's reading of a new view against the last, for the callouts over the table: your turn, attackers against you, hits and life, a seat out, countered and tokens, destroyed and exiled, a response on the stack, the game's end; a hidden card never named)
- `a11y-app` — `tests/a11y-app.mjs` (WCAG 2.1 1.4.3 across the app: every rule that sets words on the accent, and the Decks page's primary buttons, at 4.5:1 in all four themes)
- `a11y-board` — `tests/a11y-board.mjs` (WCAG 2.1 AA on the board and the lobby: every word's contrast from the screen's pixels over all the mats in both themes, the focus rings, Tab in reading order, the keys as bound in Help, every card's label with its state and nothing hidden, the questions announced)
- `room-beats` — `tests/room-beats.mjs`
- `room-resolve-all` — `tests/room-resolve-all.mjs`
- `room-untap-mana` — `tests/room-untap-mana.mjs`
- `room-pooled-taps` — `tests/room-pooled-taps.mjs`
- `room-yield-turn` — `tests/room-yield-turn.mjs`
- `room-draw-card` — `tests/room-draw-card.mjs`
- `room-events` — `tests/room-events.mjs`
- `engine-pass-stack` — `tests/engine-pass-stack.mjs`
- `table-basics` — `tests/table-basics.mjs`
- `coach` — `tests/coach.mjs`
- `board-choices` — `tests/board-choices.mjs`
- `crankmagic-audio` — `tests/crankmagic-audio.mjs`
- `advice-contract` — `tests/advice-contract.mjs` (preparation-only AI requests, evidence references and stale-result rejection)
- `advise-brief` — `tests/advise-brief.mjs`
- `advisor` — `tests/advisor.mjs` (the deck advisor through the AI door: the brief built from the person's own library in the cloud, grounded swaps only, on the day's caps)
- `ops-week` — `tests/ops-week.mjs` (M3's weekly check, `tools/ops-week.mjs`, against a stand-in for Cloudflare's API: it reads and changes nothing, counts the Worker's monitoring lines by kind and status, never reads an address, and names an incident; `docs/ops.md`)
- `advisor-page` — `tests/advisor-page.mjs` (Ask the AI advisor on a deck's page: offered only where the door would answer, swaps saved as upgrades)
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
- `playtest-triage` — `tests/playtest-triage.mjs`
- `playtest-harness` — `tests/playtest-harness.mjs`
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
- `engine-x11-permissions` - `tests/engine-x11-permissions.mjs`
- `engine-x11-leave` - `tests/engine-x11-leave.mjs`
- `engine-x11-leave-questions` - `tests/engine-x11-leave-questions.mjs`
- `engine-layer-prune` - `tests/engine-layer-prune.mjs`
- `engine-x11-memory` - `tests/engine-x11-memory.mjs`
- `engine-x11-counts-triggers` - `tests/engine-x11-counts-triggers.mjs`
- `engine-x11-turns-counters` - `tests/engine-x11-turns-counters.mjs`
- `engine-x11-costs` - `tests/engine-x11-costs.mjs`
- `engine-x11-filters` - `tests/engine-x11-filters.mjs`
- `engine-x11-keep` - `tests/engine-x11-keep.mjs`
- `engine-x11-finality` - `tests/engine-x11-finality.mjs`
- `engine-x11-pay-x` - `tests/engine-x11-pay-x.mjs`
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
- `engine-chosen-mode` - `tests/engine-chosen-mode.mjs`: a Siege's chosen mode (Outpost Siege), asked as its ability triggers -- as the Siege last was, for one that left with the creatures -- and never again as it resolves
- `engine-restricted-source` - `tests/engine-restricted-source.mjs`: mana for abilities of a kind of source (Woodland Weavemaster) pays for that object wherever it is, a card's cycling in a hand too; for abilities of creatures, a permanent only
- `engine-zone-costs` - `tests/engine-zone-costs.mjs`: an activated ability's costs offered, chosen and paid wherever it works from (Eldrazi Ravager's "Sacrifice two Eldrazi" from the graveyard; a discard from a hand; a creature to tap)
- `engine-adventure-targets` - `tests/engine-adventure-targets.mjs`: an Adventure's counted targets asked and answered as the Adventure's (Meager Meal's up to one creature, Gaze in Wonder's one or two, Gone Fishing's two of yours)
- `engine-dig-reveal` - `tests/engine-dig-reveal.mjs`: what a dig reveals shown to every player (Satyr Wayfinder's four, in the journal and in each seat's view while its controller chooses; Boughside Wanderers' card taken, alone)
- `engine-history-records` - `tests/engine-history-records.mjs`: what happened this turn and this game -- creatures that died (morbid), cards drawn, noncombat damage, a scry or surveil, opponents' life lost (spectacle), spells cast, by name -- a graveyard card from the battlefield this turn, and what has dealt damage
- `engine-attacked-recipient` - `tests/engine-attacked-recipient.mjs`: "the player or planeswalker that creature is attacking" (CR 506.3; Raid Bombardment, Myr Battlesphere), at four seats, with the planeswalker or the creature gone before the trigger resolves
- `engine-attacks-alone` - `tests/engine-attacks-alone.mjs`: "attacks alone" and "attacks a player alone" (CR 506.5; Thoughtweft Imbuer, Jiang Yanggu), the cards discarded this turn by every route, and "during combat, players can't cast spells or activate abilities that aren't mana abilities" (Yuriko, Blade of the Mighty)
- `engine-combat-moments` - `tests/engine-combat-moments.mjs`: delayed triggers at end of combat (Wall of Junk) and at the declare attackers step of your next turn (Meandering Towershell); a step that asks has begun for its triggers (the held draw too); an attack made of a creature put onto the battlefield attacking (CR 508.8), a planeswalker among what it may attack (CR 508.4); islandwalk
- `engine-lose-game` - `tests/engine-lose-game.mjs`: "that player loses the game" (CR 104.3e; Strixhaven Stadium, Triskaidekaphobia), at once and together, a draw when all who remain do, against "you can't lose the game", the loser's own spell gone with them; and combat damage "to you"
- `engine-combat-statics` - `tests/engine-combat-statics.mjs`: "attacking creatures you control get +1/+0" (Goblin Oriflamme), defender lifted while a Lesson is in your graveyard (Platypus-Bear), and negative power assigned as positive (CR 510.1a; Loot, the Anomaly)
- `engine-counters-replaced` - `tests/engine-counters-replaced.mjs`: counters put on, replaced -- that many plus one (Hardened Scales), half rounded down (Vorinclex), twice -- by whom, and the CR 616.1 order asked of the affected player where it changes how many
- `engine-lki-dies` - `tests/engine-lki-dies.mjs`: what a creature was as it died -- the counters it had, its keywords, its toughness -- for a dies trigger as it triggers and resolves, through a wipe, a checkpoint and a theft
- `engine-exile-if-dies` - `tests/engine-exile-if-dies.mjs`: "if that creature would die this turn, exile it instead" (Essence Burn) -- every way to die, never a death, a bounce and a new object not it, beside other exile-instead effects, this turn only
- `engine-life-doubled` - `tests/engine-life-doubled.mjs`: "you gain twice that much life instead" (Rhox Faithmender) -- an effect's gain, lifelink in and out of combat, an exchange; four times for two; can't gain life
- `engine-tokens-replaced` - `tests/engine-tokens-replaced.mjs`: tokens created, replaced -- twice that many (Anointed Procession), Dragons instead of artifact tokens (Draconic Visitor), a Soldier beside creature tokens (Queen Allenal of Ruadach; the order beside a doubler asked of the tokens' controller, CR 616.1) -- whose control, copies, the effect's own words on what is made instead
- `engine-draws-replaced` - `tests/engine-draws-replaced.mjs`: an opponent's two or more draws replaced, one each (Alms Collector), and whose of two players' asked of the drawing player before anything is drawn
- `engine-cant-be-sacrificed` - `tests/engine-cant-be-sacrificed.mjs`: "can't be sacrificed" (Alexios, Deimos of Kosmos) -- told to, nothing happens; never among the choices of an effect or a cost -- and whose control and counter "that player" is
- `engine-cost-targets` - `tests/engine-cost-targets.mjs`: a cost read from its targets (Magnificent End, Warrior's Blades, Dwarven Mauler), each way to choose them costed and offered on its own (CR 601.2c, 601.2f)
- `engine-cost-atoms` - `tests/engine-cost-atoms.mjs`: three cost atoms -- a +1/+1 counter from a creature you control (Bolrac-Clan Crusher), a discard in a flashback cost (Twinned Vision), and life counted as it is paid, unpayable without a commander (War Room; CR 903.4f)
- `engine-behold` - `tests/engine-behold.mjs`: behold as a cost (CR 701.4a; Lys Alana Dignitary, Kindle the Inner Flame), a permanent chosen or a card revealed from the hand, which ones asked once the cast is taken
- `engine-waterbend` - `tests/engine-waterbend.mjs`: waterbend as an activated ability's cost (CR 701.67; Giant Koi, Foggy Swamp Vinebender), artifacts and creatures tapped for its generic mana, never for an increase on it
- `engine-cant-cast-self` - `tests/engine-cant-cast-self.mjs`: a card's own "you can't cast this spell unless ..." (Proft, Sinister Mastermind's threshold), read wherever it would be cast from
- `engine-unless-tap` - `tests/engine-unless-tap.mjs`: "you may tap another untapped Merfolk you control. When you do, ..." (Meanders Guide; CR 118.12a, 603.12), each permanent its own option
- `engine-spell-x-cost` - `tests/engine-spell-x-cost.mjs`: a spell with {X} in its mana cost, as a selector (Frontline Medic; CR 107.3) -- on the stack whatever X was chosen, in a hand, on the battlefield; {Y} is not {X} -- and battalion as the attack as a whole
- `engine-shares-card-type` - `tests/engine-shares-card-type.mjs`: "each opponent may sacrifice a permanent that shares a card type with it; for each opponent who doesn't ..." (Braids, Arisen Nightmare) -- the card types of what was sacrificed as it last existed, a sacrifice that may be declined, and what follows each refusal, in turn order
- `engine-target-groups` - `tests/engine-target-groups.mjs`: a counted target's choices together -- "up to two target cards from a single graveyard" (Unlicensed Hearse), "two target creature cards that share a creature type" (Unbury) -- a way to aim it for each group, picked within it, held to it as cast and as it resolves (CR 601.2c, 608.2b)
- `engine-sacrifice-sparing` - `tests/engine-sacrifice-sparing.mjs`: "each player sacrifices all other creatures they control that don't share a creature type with the chosen creature they control" (Winnowing; CR 205.3m) -- the chosen creature's kin spared, its controller's only, through the layers, a changeling sharing every type
- `engine-cast-trigger-choice` - `tests/engine-cast-trigger-choice.mjs`: "whenever you cast an Equipment spell or a spell that targets a creature you control" (Danitha, Sword of Hope; CR 601.2c) -- a spell cast trigger's choice of spells, each a filter of the spell, of what it targets, or both
- `engine-player-extremes` - `tests/engine-player-extremes.mjs`: every player's, compared -- the fewest cards in hand among all players (Naktamun Lorespinner), the graveyards with seven or more cards (Master's Councillors), more life than another of your opponents and that attacking player (Breena, the Demagogue) -- players who have left aside (CR 800.4a)
- `engine-enters-or-leaves` - `tests/engine-enters-or-leaves.mjs`: "if a legendary permanent or an artifact entering or leaving the battlefield causes a triggered ability ... to trigger, that ability triggers an additional time" (Gandalf the White; CR 603.2d, 603.10a) -- every way to leave, as it last existed, a token, its own dies trigger, two at once
- `engine-mana-provenance` - `tests/engine-mana-provenance.mjs`: "if mana from a Treasure was spent to cast it" (Smaug, Wicked Worm; CR 106.3, 601.2h) -- a mana ability's mana remembered with its source when an ability asks, the spell keeping it, and which mana pays the caster's choice where it is read
- `engine-mana-withheld` - `tests/engine-mana-withheld.mjs`: "This mana can't be spent to cast spells from your hand" (Heartwood Crafter; CR 106.4, 106.6, 118.12) -- in the pool and remembered beside it: a spell cast from the hand sees the pool less it, anything else spends it first, and a spend the engine is not told of (an "unless" cost, a mana ability's own cost) is read as having spent it first, settled before mana is added again
- `engine-split-second` - `tests/engine-split-second.mjs`: split second (Siege Smash), nothing cast and no ability but a mana ability activated while it is on the stack; triggers and special actions go on
- `engine-riot` - `tests/engine-riot.mjs`: riot (Ghor-Clan Wrecker), a +1/+1 counter or haste, its controller's choice as it enters however it enters, each instance its own
- `engine-surge-freerunning` - `tests/engine-surge-freerunning.mjs`: surge (Reckless Bushwhacker) and freerunning (Monastery Raid), alternative costs after another spell or an Assassin's or commander's combat damage this turn, and "if its cost was paid"
- `engine-embalm` - `tests/engine-embalm.mjs`: embalm (Anointer Priest), from its owner's graveyard as a sorcery, the card exiled, a white Zombie token copy of it with no mana cost
- `engine-tiered` - `tests/engine-tiered.mjs`: tiered (Cloud's Limit Break), one mode with its own cost added, each mode its own cast, a mode's target controlled by different players
- `engine-suspend-hand` - `tests/engine-suspend-hand.mjs`: suspend from the hand (Knight of Old Benalia), a special action at the timing it could be cast, exiled with its time counters and suspended
- `engine-protection-multicolored` - `tests/engine-protection-multicolored.mjs`: protection from multicolored (Argentum Masticore), and "sacrifice it unless you discard a card; when you discard a card this way", about the card discarded
- `engine-hexproof-from` - `tests/engine-hexproof-from.mjs`: a color chosen as it resolves (Skrelv, Defector Mite), hexproof from that color and unblockable by creatures of it until end of turn
- `engine-partner-with` - `tests/engine-partner-with.mjs`: partner with [name] (for Pir, Imaginative Rascal), two commanders that name each other, and the trigger as it enters: its target player may search their library for the card it names
- `engine-firebending` - `tests/engine-firebending.mjs`: firebending (Fire Nation Cadets), whenever it attacks N {R} kept as combat's steps end, no more than is left, and lost as combat ends; each instance its own; the Cadets' only while a Lesson is in its controller's graveyard
- `engine-compleated` - `tests/engine-compleated.mjs`: compleated (Vraska, Betrayal's Sting), two fewer loyalty counters for each Phyrexian symbol its caster paid with life, never fewer than none; a creature made a Treasure artifact for good, and a target player's poison counters counted to nine
- `engine-disguise` - `tests/engine-disguise.mjs`: disguise (Arno Dorian, Bayek of Siwa), a card cast face down for {3}, a nameless 2/2 with ward {2} on the stack and the battlefield, never named to another seat; turned face up for its disguise cost alone, a special action
- `engine-adventure-asking` - `tests/engine-adventure-asking.mjs`: asking what an adventurer card may do changes nothing, the card shown as itself again with no empty subtypes, supertypes or colors kept
- `engine-counted-amounts` - `tests/engine-counted-amounts.mjs`: amounts counted as printed -- half and "for every seven", rounded down (Pox Plague, Dark Matter Manipulator), each player's own count for a discard or a sacrifice, a target player's hand (Borrowed Knowledge, Jeska's Will), a whole hand remembered, a remembered count filtered and carried into a reflexive trigger (Release to Memory, Augusta, Order Returned), converge (Sundering Archaic), planeswalker types and proliferate X times (Tam, the Possibility), your commanders' casts
- `engine-another-died` - `tests/engine-another-died.mjs`: "if another creature died this turn" (Chain Assassination), the deaths this turn less what the destroy killed, as a destroy remembers it -- not the indestructible, nor one exiled instead
- `engine-each-player-creates` - `tests/engine-each-player-creates.mjs`: "each opponent creates a 1/1 white Human creature token" (Slaughter Specialist; CR 111.2) -- a token made for "that player" of a repetition, theirs to control and own, in turn order, none for a player gone
- `engine-attach-target` - `tests/engine-attach-target.mjs`: "attach target Equipment you control to up to one target creature you control" (Iron Hills Stalwart; CR 701.3) -- the targeted Equipment moves, from where it was; nothing moves for an illegal target, none chosen, or protection
- `engine-counters-removed` - `tests/engine-counters-removed.mjs`: "remove up to three counters from another target creature or planeswalker" (Mabel, Bitter Recluse; CR 122.1, 608.2d) -- of any kinds, which ones its controller chooses as it resolves, counted after; unasked where there is no choice
- `engine-graveyard-abilities` - `tests/engine-graveyard-abilities.mjs`: "Thranduil has all activated abilities of all Elf cards in your graveyard" (CR 613.1f) -- its controller's graveyard as it now is, a changeling card among them, one ability each, "this creature" the holder
- `engine-copy-set` - `tests/engine-copy-set.mjs`: copies of a set and of a card from among those that left a graveyard (Mirrorform, Spirit of Resilience; CR 707.2, 611.2c, 400.7e) -- each matched as it begins; what that leaves attached unattached (CR 704.5p, 301.5c); a card where it is now
- `engine-roles` - `tests/engine-roles.mjs`: Role tokens (Royal Treatment; CR 303.7, 303.4i, 704.5z) -- a Royal Role created attached, not created for what it could not enchant, and one player's newest Role alone on a permanent
- `engine-warp-sneak` - `tests/engine-warp-sneak.mjs`: warp (All-Fates Stalker, Pinnacle Emissary; CR 702.185) from the hand alone, exiled at the next end step and castable by its owner from exile after that turn; void (Plasma Bolt) any player's, this turn's; sneak (Leonardo, Leader in Blue; CR 702.190) at an instant's timing in its caster's declare blockers step, attacking whom the returned creature attacked; Omnath, Locus of the Void's mana kept as {C}; a Drone that can block only flyers; and Tractor Beam's "you control enchanted permanent"
- `engine-counters-onto` - `tests/engine-counters-onto.mjs`: "move any number of +1/+1 counters from this creature onto other creatures" (Forgotten Ancient; CR 122.5) -- where each goes asked a counter at a time, then all moved at once, one placement on each; all or nothing
- `engine-counter-duration` - `tests/engine-counter-duration.mjs`: "for as long as that land has a blight counter on it, it loses all land types and abilities" (Ultima, Origin of Oblivion; CR 611.2b, 205.3i) -- applied while it has the counter, over for good once it does not; every land type lost, a land creature's creature types kept
- `engine-dig-by-type` - `tests/engine-dig-by-type.mjs`: a dig's cards to zones by card type (Zimone's Experiment; CR 701.20a) -- lands onto the battlefield tapped, creatures into hand, a land creature with the lands, the taken alone revealed
- `engine-search-steps` - `tests/engine-search-steps.mjs`: a search a card at a time (Krosan Verge, Myriad Landscape; CR 701.23b, 701.23h) -- a description for each card, or sharing a land type; found together, shuffled once
- `engine-unless-exile` - `tests/engine-unless-exile.mjs`: "you may exile this spell and four cards named Sphinx's Approach from your graveyard. If you do" (CR 118.12a, 707.10a) -- offered only when it can be paid, which four asked; and its deck rule (CR 100.2a)
- `engine-revealed-hand` - `tests/engine-revealed-hand.mjs`: a discard chosen from a revealed hand (CR 701.9b, 701.20a; Render Speechless, Stinging Vitriol, Dai Li Indoctrination, Auntie's Sentence) -- every card shown to every seat while it is chosen, named in the journal, discarded by its own player -- and "any number of cards, then draws that many" (Steal the Show)
- `engine-discard-triggers` - `tests/engine-discard-triggers.mjs`: "when you discard this card" (CR 113.6k; Titanbones, Towering Heart) from the zone it went to, its own discard alone -- at cleanup and as a cost -- and "whenever a player discards one or more cards" (CR 603.2c; Tinybones, Pocket Nuisance), once for each player each action
- `engine-graveyard-upkeep` - `tests/engine-graveyard-upkeep.mjs`: a triggered ability that works from its card's graveyard (CR 113.6m; Squee, Goblin Nabob) -- there alone, for its owner, once for each card, finding nothing once the card has left
- `engine-proliferated` - `tests/engine-proliferated.mjs`: "whenever you proliferate" (CR 701.34a; Ezuri, Stalker of Spheres) -- every proliferate said as it is done, counters given or none, by whom, twice when doubled (Tekuthal)
- `engine-crime` - `tests/engine-crime.mjs`: "whenever you commit a crime" (CR 700.13; Bandit's Haul) -- a spell cast, an ability activated or a trigger put on the stack aimed at an opponent, what they control, or a card in their graveyard, once for it, by whom
- `engine-state-trigger` - `tests/engine-state-trigger.mjs`: state triggers (CR 603.8; Darksteel Reactor) -- triggering the moment the state holds, not again while waiting or on the stack, again once resolved if it still holds, one for each permanent
- `engine-transformed` - `tests/engine-transformed.mjs`: "whenever this creature transforms into" a face (CR 701.27e; Ashling, Rekindled // Ashling, Rimebound), this permanent's own turning over and never entering transformed, and an ability's two mana of one color, kept for what it may pay for (CR 106.6)
- `engine-delayed-mana` - `tests/engine-delayed-mana.mjs`: a delayed triggered mana ability (CR 603.7, 605.1b; Molten Tide, Pyre Rhymer's prepared spell) -- added at once with the mana ability that triggers it, never on the stack, for what it names, its controller's, until it ends
- `engine-opening-hand` - `tests/engine-opening-hand.mjs`: an opening hand's actions (CR 103.6b; Chancellor of the Forge) asked once the mulligans are done, the starting player first, a card at a time -- revealed to everyone until the first turn begins -- and the delayed trigger at the first upkeep (CR 603.7g)
- `engine-attack-tax-answers` - `tests/engine-attack-tax-answers.mjs`: an attack tax the attacker can't pay (CR 508.1d, 508.1h): the declare-attackers record says what each attack takes from the mana there is, and L0, L1, the random pilot and the room's least answer declare only what can be paid for -- a required Goblin goes where it is free
- `engine-counter-exile-cast` - `tests/engine-counter-exile-cast.mjs`: a permanent spell countered and exiled instead, and cast free for as long as it remains exiled (Thranduil's Decree; CR 701.6a, 611.2b, 400.7): what the counter moved remembered, a permission only for a card in exile now
- `engine-ability-target` - `tests/engine-ability-target.mjs`: an ability on the stack as a target (Bolt Bend; CR 115.2, 115.5, 115.7a, 115.9a): chosen by its stack entry, by whose and "with a single target", gone once it leaves; an effect's stack entries; its new target held to the ability's own requirements; the room's offer and the pilots' aim read off the stack
- `engine-tempting-offer` - `tests/engine-tempting-offer.mjs`: a tempting offer (Tempt with Vengeance; CR 207.2c, 101.4, 800.4b, 800.4g): each opponent asked a "may" in turn order, those who did kept and counted (playersWhoDid, X for each with times X), one who leaves answered for, given nothing and not counted
- `engine-prevention-shields` - `tests/engine-prevention-shields.mjs`: a player's prevention shields (Inkshield, Deflecting Palm; CR 609.7a, 615.5, 615.8, 616.1): who they shield, a source chosen, used up once, what follows dealt by the card the spell became, ordered with the other effects by the player dealt the damage
- `engine-vote` - `tests/engine-vote.mjs`: voting (Fateful Tempest's council's dilemma; CR 701.38, 800.4a): each player from the caster in turn order, the votes so far in the question, one who has left casting none; the votes for a choice and the total mana value of what was milled counted
- `engine-unless-times` - `tests/engine-unless-times.mjs`: a cost paid any number of times and "that many" after it (Bloodthirsty Adversary; CR 118.12a, 601.2h, 603.12): each count the mana pays offered, the cost that many times over paid as one, the reflexive trigger's X and "up to X" targets
- `engine-pay-mana-play` - `tests/engine-pay-mana-play.mjs`: casting what this creature exiled as it attacks, its mana cost paid (Boiling Rock Rioter; CR 607.2a, 608.2g, 601.2g-h, 605.3a): an Ally exiled with this creature cast from the pool and its caster's plain sources, colored symbols and all, the ways to pay asked; an {X} or unpayable one not offered; a tap cost that may tap its own source unless it says another
- `engine-next-end-step` - `tests/engine-next-end-step.mjs`: "until your next end step, you may play those cards" (Shadow Urchin; CR 513.1, 611.2a) -- over as its controller's next end step begins: this turn's if made before it, the next if made during it, never another player's; "until the end of your next turn" lasting through it
- `engine-source-remains` - `tests/engine-source-remains.mjs`: "for as long as this Saga remains on the battlefield" (Old Fat Spider Can't See Me; CR 611.2b, 400.7) -- a layer's effect or a prevention kept with its source and over as it leaves, however it goes (its owner leaving the game among them), never back with it, never started without it
- `engine-was-attached` - `tests/engine-was-attached.mjs`: "put Zack Fair's counters on that creature and attach an Equipment that was attached to Zack Fair to that creature" (CR 608.2h, 400.7, 701.3a) -- what the sacrificed source had as it last existed, still the same objects on the battlefield, an Equipment and not an Aura, one chosen when several; nothing asked with none; the house pilot's answer
- `engine-unchosen-modes` - `tests/engine-unchosen-modes.mjs`: "as Gollum enters, choose odd or even" and "choose one that hasn't been chosen" (Gollum, Riddle Master; CR 614.12, 202.3, 603.3c, 700.2, 400.7) -- a spell's mana value of the chosen quality, zero even and X counted; each mode once, remembered on the permanent as it is chosen, a second trigger at once seeing the first's choice, the snapshot as it triggered when it has gone, a new object afresh, the last trigger removed when none is left
- `engine-face-down-play` - `tests/engine-face-down-play.mjs`: playing a card exiled face down (Gandalf, Goblins' Bane // Flameshape; CR 406.3, 406.3a-b, 601.2, 305.1) -- looked at and exiled face down, offered as the card it is (a land under the land drop's rules, a spell by its own cost and timing, an adventurer card as its Adventure) to the one player who may look at it, while "if you control a Wizard" holds and it remains exiled; turned face up and revealed as it is played, hidden from every other seat and from G1's leak judge until then; the table's words its modes and costs; asking changes nothing
- `fuzz-library` - `tests/fuzz-library.mjs`: G1 over Rob's whole library (`tools/fuzz-live.mjs --library`) -- each seed's four decks Commander decks of his library (a legendary creature the table plays, 99 cards of its color identity, none twice but basics), the same for the same seed; a game's exception said with its seed and the run going on; seed 229, the waterbend paid with rider mana that stalled a table, played clean through the real room
- `engine-counters-put` - `tests/engine-counters-put.mjs`: counters put on players and on a creature you control (Ezuri, Claw of Progress; Simic Ascendancy; CR 122.1, 122.6, 701.34a) -- "you get an experience counter", each player named, doubled as Innkeeper's Talent doubles them, counted as "the number of experience counters you have" for its controller alone; "whenever one or more +1/+1 counters are put on a creature you control", about the creature and that many, not another player's creature, a noncreature or another kind; the compiler refusing a player's counters of no kind, chosen, +1/+1 or poison
- `engine-ability-loss` - `tests/engine-ability-loss.mjs`: "loses all abilities" switching off a permanent's own static abilities and replacement effects (Song of the Dryads, Infinite Coursework, Oko, Thief of Crowns, Retro-Mutation; CR 613.1f, 613.6, 613.8a) -- an anthem and a grant gone from layers 6 and 7 whatever the timestamps, an effect begun in layer 4 carried on in 7b, Humility made a creature keeping its own one ability; every rule a static changes and every replacement effect, each reader before and after its permanent loses its abilities; a board's rules read with nothing derived when nothing takes abilities away; a layer-4 change of creature types only (CR 205.1a); control of two permanents exchanged, both or nothing (CR 701.12a-b)
- `engine-explore` - `tests/engine-explore.mjs`: explore (CR 701.44) and the Map token (CR 111.10s; Restless Anchorage) -- a land to its hand, a nonland's +1/+1 counter and the graveyard asked, an empty library, the exploring permanent's controller's library, one gone told by its last known information (701.44c), the revealed card in every seat's view while it is asked, a player who left
- `engine-different-opponents` - `tests/engine-different-opponents.mjs`: a different opponent for each permanent given away (Dack Fayden, Helping Hand) -- its controller asked permanent by permanent, the last forced, the rest kept when no opponent is left, the gone and the repeated left out, each for good, refused run directly; a goad for the rest of the game (CR 701.15a); the greatest power or mana value among what a player chooses, a tie theirs (End of the Hunt; CR 608.2d); and where the schema lets each be said
- `engine-train-e-f1` - `tests/engine-train-e-f1.mjs`: morph (Akroma, Angel of Fury; CR 702.37) cast face down for {3} as a 2/2 with no text and no ward, turned face up for its morph cost alone, a manifested card with morph either way, and the table's words for each; "behold a Goblin and exile it" (Champion of the Weird; CR 701.4a, 607.2q), the card exiled with the cost and linked to the permanent the spell becomes, only in a spell's own additional cost; "another instant or sorcery spell" cast this turn (Burrog Barrage), a copy's count; "that creature's power" with the creature gone (Arni, Renowned Champion; CR 608.2h); a target's power as it now is; and April O'Neil's blockers
- `engine-replicate-first-strike` - `tests/engine-replicate-first-strike.mjs`: replicate (Lose Focus; CR 702.56a) -- a mana cost on an instant or sorcery, once; each number of times paid its own cast, and no cast claiming more copies than it paid for -- and first strike read as the combat damage step begins (Interjection; CR 510.4): given after blocks, the first-strike step happens; in the second step, those that had neither as the first began, and double strikers; a first striker gone before it, not counted. Also a triggered ability's "for each opponent, up to one target ... that player controls" (Hapatra, the Desert Fang), the greatest mana value among cards (a land 0, a double-faced card its front face, CR 712.8a), and a card found "under your control" (Jhoira, Weatherlight Corsair)
- `engine-train-e-g4` - `tests/engine-train-e-g4.mjs`: "discard two cards unless you discard a creature card" (Thirst for Identity; CR 118.12), an unless cost's discard of a kind, only the cards in hand it describes ways to pay and the question saying which kind, ward's plain discard as before; "you may choose new targets for target instant or sorcery spell" (Wild Ricochet; CR 115.7d), each target kept or changed a question at a time, one with no other choice and a counted target's list not asked about, "change the target" as before, and the new target the spell's for ward; "no maximum hand size for the rest of the game" (Wisdom of Ages; CR 402.2, 611.2a) for the players it names, beside the statics; and the table playing all sixteen of the wave's cards
- `engine-train-e-g2` - `tests/engine-train-e-g2.mjs`: "whenever this creature blocks a creature with flying" (Skystinger; CR 509.3b), a blocks trigger's attacking creature described, once for each it blocks, said only with each attacker; "when you cast this spell while you control a creature" (Social Snub), a condition asked as the spell is cast and not again (no intervening if, CR 603.4), on a spell cast trigger alone; Snooping Page unblockable after a spell that targets a creature; Sleight of Hand's other card on the bottom (CR 401.4); and the sixteen cards at the table
- `engine-train-e-g3` - `tests/engine-train-e-g3.mjs`: incubate (Sunfall; CR 701.53), an Incubator token entering with its +1/+1 counters, a double-faced token (CR 111.10i) that transforms for {2} into a 0/0 Phyrexian artifact creature -- the same object with its counters (CR 712.18), once however many times it is told to (CR 701.27f), no counters when there are none to give; the first-strike damage step decided as the combat damage step begins (CR 510.4), first strike given after blocks and a first striker gone; Surveillance Phantasm attacking only after a scry or surveil this turn; counters moved as many as there are (Tester of the Tangential; CR 122.5, 609.3)
- `engine-monarch` - `tests/engine-monarch.mjs`: a creature whose controller changes removed from combat (CR 506.4) -- an attacker taken as attackers are declared or after blocks, a blocker taken (the attacker it blocked still blocked, CR 509.1h; through only with trample, 702.19d), an exchange in combat (Oko's -5), one given back as the effect or the Aura that held it ends -- and nothing dealt; the monarch (CR 725; Ginger, Queen of Sweets; Tamiyo, Upriser Crowned): one player's at a time, its two triggers the game's own with no source, the end-step draw and combat damage taking it (unblocked, trample, first strike, four players), noncombat damage not, a monarch who leaves the game on their own turn and on another's, with the active player leaving too and nobody left, the condition, "while you're the monarch", the view's `monarch` and the history's line
- `engine-train-e-g1` - `tests/engine-train-e-g1.mjs`: "each opponent can't draw more than one card each turn" (Narset, Parter of Veils; CR 121.2b) -- an effect's draws, the draw step's, no draw from an empty library, and a "you may draw" its chooser can't take (CR 121.3); "choose up to four, the same mode more than once" (Moment of Reckoning; CR 700.2d), none to four modes offered as picks, each target its own and picked once the offer is taken, and the table's words for no modes; "the first time this ability has resolved this turn" (Nissa, Leyline Tamer), counted by the object its ability came from -- that object gone, or a new one -- and a branch's too; and where the schema lets each be said
- `engine-wave4a-h3` - `tests/engine-wave4a-h3.mjs`: an object an effect remembers, referred to later by the same card (wave 4a, lane h3) -- Spark Double's copy and its counters by what it entered as, a planeswalker copied with its loyalty (CR 707.2, 306.5b; Clever Impersonator too); Hunter's Insight's delayed trigger waiting on a damage source; Koma's "its activated abilities can't be activated", mana abilities and unasked payments included (CR 602.5, 605.1a); the replacements a resolution remembers -- "that creature enters with an additional +1/+1 counter" (Summon: Fenrir), "it deals double that damage" to that player and what they control (Lightning, Army of One), each its own and ordered as any is (CR 614.5, 616.1); Ziatora's sacrificed creature's power as it last was (CR 608.2h); shadow (CR 702.28) and its counter; each player's chosen color (Selective Obliteration); Goblin Welder's "in that player's graveyard" and "if both targets are still legal" (CR 608.2b); the creature with the greatest power, a negative power as it is; and the table playing all nineteen of the lane's cards
- `engine-tokens-counters-4a` - `tests/engine-tokens-counters-4a.mjs`: replacements on creating tokens and putting counters (wave 4a; CR 614.1a, 614.12, 616.1, 122.6) -- the token event in groups, "one of each" (Academy Manufactor) by a token's subtype, the order among the effects that apply as the event stands (Divine Visitation and Queen Allenal, Manufactor, Xorn and Anointed Procession), each option saying what it makes when counts agree, every token made as the effect says (an Aura attached, a Food beside it not), a predefined token compiled in; counters on yourself alone, an effect's and not a cost's (Doubling Season), a permanent entering with counters not seeing its own effect at each place it enters; "whenever you put" told by the counters event; four seats; the schema; the credits; the table playing all nineteen
- `engine-play-from-zones` - `tests/engine-play-from-zones.mjs`: "you may play / cast that card" from another zone in the forms the most-played cards ask (wave 4a, lane h1) -- a permission kept by permanent type (Muldrotha, the Gravetide), one offer for each type a card has and a forged one refused, one land whatever the land drops; a permission's additional cost (Exploration Broodship), no additional cost of the spell's own; "mana of any type can be spent" (Tinybones, Bauble Burglar; CR 118.14) for colored and hybrid symbols, a Phyrexian one still its color or 2 life, and more than one way to pay asked; an effect's permission for a zone's cards (Chainer, Nightmare Adept), spent only when nothing unlimited would do, each permission that does something different its own offer; life for mana (Demon of Fate's Design) within its player's life; an effect on a spell that follows it onto the battlefield (CR 400.7a) and a rule about it that does not; "if you didn't cast it from your hand"; a Case's solved designation (CR 719.3b); the nontoken permanents sacrificed this turn; a card exiled with counters; what the schema lets each be said; and the scenario runner's blockers
- `engine-wave4b-j1` - `tests/engine-wave4b-j1.mjs`: remembered and moved objects, and the rules beside them that the lane's most-played cards needed (wave 4b, lane j1) -- Animate Dead's Aura attached to a creature card in a graveyard (CR 303.4a, 704.5m), chosen as it enters without being cast (CR 303.4f), its Enchant then that one creature alone and "that creature" kept for its leaving, moved off it or the creature no longer one; a land given a basic land type has that type's mana ability (CR 305.6; Urborg, Tomb of Yawgmoth), once, and lost with its abilities; protection from each color over the creatures a spell named and no player (Akroma's Will; CR 702.16, 611.2c); "if you cast it" (The One Ring); an additional mana of the chosen color (Utopia Sprawl; CR 605.1b), none with none chosen; "creatures your opponents control attack this turn if able" for every creature that is theirs this turn (Bident of Thassa; CR 508.1d, 611.2c); a move of all under its controller's control (Rise of the Dark Realms; CR 110.2a); what the schema lets each be said; and the table playing all twenty-six of the lane's cards
- `engine-rearrange-copies-4b` - `tests/engine-rearrange-copies-4b.mjs`: the top of a library looked at and put back in any order (rearrangeTop; Ponder, Sensei's Divining Top; wave 4b, lane j2) -- one question, an order of them all, a library of one card or none, another player's library, a card gone before the answer, a looker who left, and what each seat then sees; a spell's mana value on the stack with X as chosen (CR 202.3e; Mana Drain's amount); "lose hexproof" (Shadowspear) against a keyword counter put on since and a "hexproof from" given before; a basic land type given bringing its mana ability once (CR 305.7; Dryad of the Ilysian Grove), lost with all abilities; a token entering tapped by a replacement (CR 111.1, 614.12), not by its own for others; the catalog's credits
- `engine-wave4b-j3` - `tests/engine-wave4b-j3.mjs`: keywords not yet built, and the small rules the lane's most-played cards needed (wave 4b, lane j3) -- beginning the game with Gemstone Caverns on the battlefield from the opening hand (CR 103.6a), never the starting player's, its luck counter and a card exiled from the hand, the player's choice, and its mana "instead" while it has a luck counter; gift (CR 702.174), an offer for each opponent, what each of the six kinds gives the chosen player -- an instant's first, a permanent's as it enters -- a copy's gift (CR 707.10) and the words a player is offered; eternalize's black 4/4 Zombie token with no mana cost (CR 702.129a); extort's instances and {W/B} paid by a source (CR 702.101); a basic land type given and its mana ability (CR 305.7, Yavimaya) beside another and under Song of the Dryads; base power (CR 208.4b); the most any one player discarded (Windfall); two more land drops (Azusa); a player's hexproof for a turn (Dawn's Truce); a search of two zones at once (Finale of Devastation); what the schema and compiler refuse; and the table playing all thirty of the lane's cards
- `engine-costs-activations-4b` - `tests/engine-costs-activations-4b.mjs`: activations forbidden, costs raised and X paid in life (wave 4b, lane j4; CR 602.5, 605.1a, 601.2f, 119.4, 107.3a) -- "your opponents can't activate abilities of artifacts, creatures, or enchantments" (Grand Abolisher) of the permanents it names, their mana abilities too, always or during its controller's turn, while its condition holds; a spell's life raised for what it targets (Terror of the Peaks), each way to aim it costed with a Phyrexian symbol's life, a counted target refused in words and nothing paid; the house pilot paying the least X of life and never all of it; what the schema and the compiler let each new form say -- "choose one or more" for a triggered ability, all counters moved, the counters that card had, "from anywhere other than the battlefield", "a creature card leaves your graveyard", "except the first one they draw in each of their draw steps", "greater than each other creature's power", the creatures attacked with this turn; questions in words; the table playing the lane's twenty-eight cards
- `engine-breaks-anchors` - `tests/engine-breaks-anchors.mjs`: every break still breaks something -- each breaks file under `game/tools/batch` and `tools` read (`game/tools/batch/anchors.py`), each anchor found once and only once in the file it names, that file and each suite there, a replacement that changes something; a fixture of each problem reported, a sound break not
- `engine-wave4c-k3` - `tests/engine-wave4c-k3.mjs`: tokens and counters, Classes and dice (wave 4c, lane k3) -- a die rolled (CR 706; Ancient Copper Dragon), every face of a d20 reached from the game's random stream, its result kept for what follows and said in the history; "when this Class becomes level 2" (CR 716.2a), its own level from below and no other Class's; offspring's two offers and a cast claiming it unpaid refused (CR 702.175a); copies of what an effect moved, halved (Saw in Half); a mana ability with no {T} of its own tapping an artifact, its source among them (Urza, Lord High Artificer); +1/+1 and -1/-1 counters annihilating on a creature that lives (CR 704.5q); what the schema and the compiler refuse; and the table playing the lane's eighteen cards

- `engine-spells-draws-4c` - `tests/engine-spells-draws-4c.mjs`: spells, draws and discards (wave 4c, lane k4) -- the lane's twenty cards at a table and through their scenarios; affinity (CR 702.41a) as the spell's own reduction; a cast or a copy of an instant or sorcery making a trigger trigger again (Veyran, Voice of Duality; CR 603.2d); draws replaced (CR 614.11) -- "you win the game instead" from an empty library (Laboratory Maniac), "draw two cards instead" but the draw step's first (Teferi's Ageless Insight), two of them making four (CR 614.5), a draw Narset forbids no event to replace; a mana choice among some colors as a spell resolves (Culling Ritual); a hand looked at (Gitaxian Probe; CR 701.20e) shown to its looker alone, hand by hand in turn order, an empty hand or the looker's own not asked, a looker who concedes, a spectator; "each player who can't" after a sacrifice that must be made (Plaguecrafter); "pay 5 life or pay {2}" (Redirect Lightning; CR 119.4) beside Phyrexian mana, and an offer changed to skip the life refused; a sacrificed creature's power as it last was (CR 608.2h)
- `engine-wave4c-k2` - `tests/engine-wave4c-k2.mjs`: the graveyard and combat (wave 4c, lane k2) -- delve (CR 702.66a), the cards of the caster's graveyard picked once the cast is taken, never the spell itself, refused when too few or not the graveyard's, with flashback given, and the words a player is offered; dredge (CR 702.52a), each player of "each player draws a card" asked in turn, Alms Collector's single draws, never under Narset, the draw step's question never the beat's one button, and both pilots answering it; the rest on the bottom of a library in any order (CR 401.4), the order asked and kept; protection from the colors outside the commander's color identity (Commander's Plate), damage prevented and read for the Plate's controller as it now is; a flashback cost that sacrifices (Dread Return); fabricate's two modes; a creature tapped for mana without {T} (Relic of Legends); subtypes that go with a card type lost (CR 205.3d, Darksteel Mutation); a dig's card put on top (Thassa's Oracle); what the schema and compiler refuse; the credits; and the table playing the lane's nineteen cards

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

The `table-tabletop` suite checks the preview geometry and its browser interactions. Start the isolated recorded-game preview with `node tools/play-tabletop-preview.mjs` (requires the browser-suite Playwright dependency).

- `sharing` - `tests/sharing.mjs`: live deck/library permissions, public access, revocation, concurrent edits, privacy, notifications, owner-only invitations and verified email identity changes.
- `sharing-ui` - `tests/sharing-ui.mjs`: keyboard user selection, sharing menus, email controls, profile saving and mobile layout with labeled screenshots.
