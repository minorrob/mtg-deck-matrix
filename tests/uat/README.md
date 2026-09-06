# User journeys, in a browser

The twenty-three suites in `tests/` check that the modules are right. Nothing in
them opens a page. This does: three people, eleven journeys, two screen sizes, in a
real Chromium.

## Why it exists as its own thing

Every browser check written for this app before now seeded
`data/active-state.json` into `localStorage` before it started. That is a
returning user with a full collection, and it is the wrong persona to test an
empty app with — it is why none of these were ever seen:

- Deck and Shop were a dead end on a first visit: one sentence in a box styled
  as *loading*, telling the reader to go to Compare without taking them there.
- Loading the six built decks warned a first-time visitor that it would replace
  "every selection, buy, Shop mark, and Decks change currently saved on this
  device" — work they had not done.
- The Tour is in the header, and the header starts folded on a phone, so the one
  affordance built for a first visit was invisible on the device most likely to
  be somebody's first.
- Three of the eleven Compare tour steps spotlighted a 6×6 pixel box, because
  every deck row is collapsed until somebody opens one.
- Compare, Deck, Shop, the Game Log and the Tour are all on `matrix.html`, and
  the only route there was a footer link — 1.0 screens below the fold on a
  desktop and 2.9 on a phone. A first-time visitor saw six decks and no sign the
  rest of the app existed, including the tour built to show them around.
- The last Compare tour step collapsed its spotlight to a single pixel: it
  latched onto the "Loading the card catalog…" box, which was replaced a moment
  later, and measured a node no longer in the document.

None of that is visible if the app is full of decks before the test begins.

The same blindness ran the other way. "Continued use" was tested as *leave and
come back*, always with the same six decks and no collection behind them, so
none of this was seen either:

- With a collection uploaded, the bench was 1,940 spare cards in one list: 126
  screens on a desktop and 156 on a phone. Nothing errored and nothing was slow.
- It was sorted A to Z, so the top of it was whatever began with A rather than
  the Rhystic Study sitting spare.
- The buy list's group-by was written by a `save()` that never stored it, so
  choosing "By color" lasted until the next visit and no further.
- An upload too big for the browser's storage warned about it in a toast that
  the success message overwrote in the same tick — the one case where the
  warning matters is the one where it was invisible.
- **The export did not carry any of it.** Ten added decks and 3,200 collection
  cards were in localStorage keys the Matrix's export never read, and the button
  that wrote the file said *"Exported your full state"*. Back up, move browser,
  load the file, and both are gone — having been told in as many words that they
  were not.

None of THAT is visible if the collection behind the app is always empty.

## The three people

| | who they are | what they have | what they need |
|---|---|---|---|
| **First** | has never seen this | empty `localStorage` | to understand what it is and get one useful thing out of it |
| **Continued** | uses it between games | six picked decks, a game log, ten added decks, 3,200 cards | their work where they left it, and to change something |
| **Exit** | wants their data, or a clean slate | a full collection | to take it with them, wipe it, and put it back |

## The eleven journeys

**First · lands** — `index.html` shows six decks and two ways to add one, and
says where the rest of the app is without anybody scrolling. Nothing is required
before it makes sense.

**First · hits an empty tab** — Deck before picking anything. Asserts a real
screen: what the tab is for, why it is empty, and three ways out (Compare, load
the six, take the tour). This is the journey that had a dead end.

**First · opens the card graph** — 7,710 cards. Asserts the first look is a
page somebody scrolls rather than seventeen screens of it (fifty-six on a
phone), that the legend says how much of the catalog is on screen, and that
asking for more leaves the card under the reader's eye exactly where it was.
Driven with a wheel and a real click: a programmatic `scrollTo` on this page
lands past the end of a document whose height `content-visibility` has only
estimated, and the browser then satisfies that request as the real heights
arrive — which this harness twice read as the app scrolling itself.

**First · takes the tour** — from the empty Deck page, not from the header,
because on a phone the header is folded. Asserts the tour opens by saying
nothing is picked, and that its spotlight lands on something at least 24px
across. A spotlight smaller than that is pointing at nothing; that threshold is
what caught three separate bugs.

**First · accepts the offer** — loads the six built decks. Asserts no
replace-everything dialog (there is nothing to replace), that the six arrive,
and that it stays on the tab the button was pressed from.

**Continued · leaves and returns** — the work is still there.

**Continued · a shopping trip** — Shop with the six decks loaded. It has four
views, and a phone used to land on the table: every card any selected deck wants,
each row stacked into a 195px card, 414 of them — 105 screens at 390px wide.
Store is the same trip in 23 and is the view built for it, with a search box, the
seller's own letter groups and one Buy button per row. Asserts a narrow screen
lands somewhere it can actually shop, and that all four views stay one tap away
from wherever that is — the Store toolbar offered only three, so landing there
would have put the bench out of reach.

**Continued · records a game** — the log had been read back at 250 games and
never once *written* to by a test. Fills the form the way somebody does at the
table, saves, and asserts the entry keeps what was typed, that the two fun scales
are not crossed, and that it appears in the list underneath. It also asserts the
form is usable without looking at it: the two scales are the same five words
twice — Rough, Meh, Fine, Good, Great — so without a group name they are ten
identical buttons in a row, and being chosen was a CSS class on all seventeen
chips, which says nothing at all.

**Continued · a season of games** — 250 logged games, about two years of weekly
Commander. Asserts the log does not render all of them at once, does not become
a page nobody reads, and can be narrowed. Before this, 250 games made the Game
Log 18 screens tall on a desktop and 47 on a phone, with no filter and no
ceiling — everything worked, and nothing was usable.

**Continued · a collection that grew** — ten decks added by hand on top of the
workbook's six, and a real collection uploaded: 3,200 distinct names, which is a
shoebox rather than a hoard. Built from the repo's own card graph, so the names,
types and prices are real, and built deterministically, so a number in a failure
message means the same thing next run. Asserts the bench is a page somebody
would open twice, that the cap says what it is holding back, that the top of it
is sorted by what a spare card is worth, that everything is still one button
away, and that reaching it does not move the row under the reader's thumb. The
buy list is asserted to be *un*capped: it is worked through in a shop rather than
browsed, and a shopping list that hides its last forty cards behind a tap is a
shopping list you get home without. It also presses Load Active, which somebody
does out of habit, and asserts the ten decks are still there afterwards: a
payload with no My Decks block means "this file has no opinion", never "delete
them".

**Exit · export, reset, import** — run with the collection behind it, not just
the six picks. The export carries the picks, a date, the ten added decks and the
3,200 collection cards; Reset All really resets; and re-importing brings back
both the Deck page *and* My Decks. If any leg of that breaks, this is a place
work goes in and does not come out of.

## What every journey is held to

Beyond what each one asserts, every step of every journey checks the view it is
looking at for four things: no horizontal overflow, nothing under the 9.5px type
floor, **no control without an accessible name**, and **nothing that looks
selected without saying so**. The last two are properties of every screen rather
than of any one journey, so a journey that visits a screen is the cheapest place
to check them — which is how they came to cover the first-run empty states and
the tour as well.

## Running it

Needs a static server on `:8790` and Playwright's Chromium — found under
`/opt/pw-browsers` by looking rather than by a pinned build number, so a
container image bump does not quietly turn "the browser moved" into "the app is
fine". Neither is a
dependency of this repo — there is no `package.json`, and the twenty-three Node
suites deliberately need nothing but Node. So this script **skips cleanly** when
either is missing rather than failing: a missing browser is not a failing app.

```sh
npm install playwright               # not a dependency of this repo
npx playwright install chromium

python3 -m http.server 8790 &        # or any static server at the repo root
node tests/uat/journeys.mjs          # add --headed to watch it
```

Already have Playwright somewhere else? Point at it instead of installing again:

```sh
UAT_PLAYWRIGHT=/path/to/node_modules/playwright/index.js node tests/uat/journeys.mjs
```

`UAT_BASE` overrides the server URL and `UAT_CHROMIUM` the browser binary.

Exit code is 0 when every journey passes or when it skipped, and 1 when a
journey failed. Screenshots of each step land in `tests/uat/shots/`, which is
git-ignored.

## What it does not cover

Anything needing the network: importing an Archidekt deck, generating one from
Scryfall, EDHREC synergy. Those are covered by the Node suites against recorded
fixtures, which is the right place for them — a journey test that fails because
somebody else's site is down teaches nothing about this one.
