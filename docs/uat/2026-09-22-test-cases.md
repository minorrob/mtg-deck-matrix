# CrankMagic UAT — test case catalog, 2026-09-22

**Asked for by Rob, 2026-09-22:** *"a full UAT walk-through of the app, all pages, all pop-ups, all
buttons… run these test cases against both the local and the cloud based platforms… checking that
the lobby mirrors in both… the handoffs in the play experience… emulating me as though I was
creating a deck, tuning it, acquiring it, exploring it and then playing it… spin up some agents to
invite to seats… checking the local instance contains only those elements necessary for the
gameplay… and the communication from local back to cloud."*

This file is the **catalog**: what is to be tested and what "pass" means for each case. The run
lives in `2026-09-22-uat-log.md`; the findings and the plan live in `2026-09-22-remediation.md`.

---

## What this catalog is built on, and what it deliberately does not repeat

**It is not the first UAT.** A 76-case pass (Grok Bot, 2026-09-21) walked the **workshop** — Decks,
Library, Explore — and `docs/uat-grok-evaluation-2026-09-21.md` records which of its findings were
applied, rejected with evidence, or deferred. `docs/app-walkthrough-plan-2026-09-19.md` §9.5 holds
the open queue that came out of it (W.2 → C.6), and much of that queue is still open.

**So this catalog does not re-walk the workshop case by case.** Re-finding `M-11` or `B-13` would
add a second ID for a known defect and make the remediation plan look twice as full as it is.
Instead:

- The workshop is covered by **journey-level** cases (D, L, E) that follow Rob's own loop — build,
  tune, acquire, explore, play — and are written to catch what a queue of point defects would
  not: whether the loop *joins up*.
- Any point defect met on the way is recorded **against its existing ID** where one exists, and
  only given a new ID where none does.

**What has never been systematically walked is Play.** The lobby, the local host, the board, the
invitations, and the traffic between the two origins. That is where the weight of this catalog
sits, and it is the part Rob asked for by name.

### Existing conventions this follows rather than replaces

| | |
|---|---|
| **Severity** | `S1` blocks a game or loses data · `S2` wrong behavior a user will hit · `S3` visible defect with a workaround · `S4` polish. As used by the 2026-09-21 UAT. |
| **Existing IDs** | `A-`, `B-`, `M-`, `P-`, `D-`, `E-`, `CM-DS-`, `UAT-` belong to the earlier pass. **Not reused.** |
| **New IDs here** | `DECK-`, `LIB-`, `EXP-`, `LOB-`, `BRD-`, `MP-`, `HAND-`, `XC-` |
| **Verdict** | `PASS` · `FAIL` · `BLOCKED` (could not run, with the reason) · `N/A` (surface absent on that platform, which is itself a result) |

### The two platforms

| | |
|---|---|
| **Cloud** | `https://minorrob.github.io/mtg-deck-matrix/` — GitHub Pages from `main`. Rob's real library lives in this origin's storage. Driven in Rob's own Chrome, because the library is the point. |
| **Local** | `http://127.0.0.1:8768` — the host, serving the same app at `/app/` **plus** the board at `/review` and the guest gateway at `:8769`. |

**Every case states which platform it applies to.** A case that can only exist on one of them is
marked so, because *where the two differ* is a large part of what Rob asked to be measured.

### Method notes that cost time to learn

- **Settle before reading.** `#discover` read as an empty `<main>` on first inspection and is
  entirely fine; the read had fired before the view painted. Every automated read in this run
  waits first. A UAT that reports a race as a defect is worse than no UAT.
- **Rob's real data is in play.** Cases that write (new deck, buy list, log a game) name their
  artifacts `UAT-…` so they can be found and removed, and no case deletes anything of Rob's.
- **The local host is the one in use.** A pod started for a case ends whatever game was running.

---

## A. Cross-cutting (XC) — both platforms

Run once per platform, not per page.

| ID | Case | Expected | Anchor |
|---|---|---|---|
| XC-01 | Every top-level nav item loads its view | Decks, Library, Explore, Play each render content within 3s | — |
| XC-02 | Deep link by hash | Opening each `#route` directly renders the same view as clicking to it | — |
| XC-03 | Back and forward | Browser history moves between views without a blank frame | — |
| XC-04 | Reload holds position | Reloading on a view returns to that view, not to Decks | — |
| XC-05 | No console errors on any view | Zero `pageerror`, zero uncaught console errors across a full nav sweep | — |
| XC-06 | No 404s on any view | No failed asset or data request on a full sweep | app-sweep.md |
| XC-07 | US English everywhere on screen | No British forms in rendered text — the `-our`, `-ise`, `-re`, doubled-`l` and `-ogue` endings, and the usual irregulars. The list itself lives in `tests/feature-wiring.mjs`; **spelling the words out in a tracked file would raise that suite's own ratchet**, which is how this row was first written and why it is now phrased this way | Rob's standing rule; `tests/feature-wiring.mjs` ratchet |
| XC-08 | Theme switch | Light and dark both render every view legibly; no token falls back to Canvas | Track V |
| XC-09 | No horizontal scroll at 320/375/390/430/768/1400 | Geometry pass clean | `tests/uat/geometry.mjs` |
| XC-10 | No tap target under 32px | Geometry pass clean | `tests/uat/geometry.mjs` |
| XC-11 | Every `?` help button opens help for its own page | Content matches the page it was opened from | — |
| XC-12 | Every dialog closes by ✕, Escape and backdrop | And returns focus to what opened it | — |
| XC-13 | Every dialog is reachable and none opens empty | Enumerated from the modal inventory | — |
| XC-14 | Offline | Service worker serves the shell; the app says what is unavailable rather than failing blank | existing journey |
| XC-15 | **Nothing on screen is non-functional** | No control that does nothing, no placeholder | **Rob's standing rule, 2026-09-22** |

---

## B. Workshop — Decks (DECK)

Rob's loop, first leg: **create a deck and tune it.**

| ID | Case | Expected |
|---|---|---|
| DECK-01 | Decks list renders all decks with their commanders | 7 live decks (D1–D7) plus any drafts |
| DECK-02 | Subnav lists every deck and marks the current one | |
| DECK-03 | **New deck** end to end | Wizard opens, a commander can be chosen, a deck is created and appears in the list and subnav |
| DECK-04 | Deck page: header, primary action, counts | Primary action matches state (see `B-20`, known open) |
| DECK-05 | Deck options menu: every item opens something real | Enumerate and open each |
| DECK-06 | Compare two decks | Ticking two enables Compare; the dialog renders both |
| DECK-07 | Tune: swap a card | A replacement can be found and applied; the deck and library both reflect it |
| DECK-08 | Tune: the Lab | Opens from the deck, keeps its steps, can save back (`B-08`, `B-09` known) |
| DECK-09 | Measure / simulate a deck | A report is produced and reads as current, not "Historical" (`B-13`, known open) |
| DECK-10 | Log a game | Records against the deck; date is the local calendar day (`P-05`, known open) |
| DECK-11 | Game history dialog | Lists games, undo works, refreshes after undo (`M-08`, known) |
| DECK-12 | Deck export / print | Produces the list it claims to |
| DECK-13 | "How a deck comes together" | The explainer page renders and its links point at real places |

## C. Workshop — Library (LIB)

Second leg: **acquire it.**

| ID | Case | Expected |
|---|---|---|
| LIB-01 | Three tabs — Library, To buy, Orders — each render | |
| LIB-02 | Three views — List, Sheet, Table — each render the same records | |
| LIB-03 | Status filters (Reserved, Owned, Substitutes, Physical, Ordered, To Buy, Watched) | Each filters and each clears |
| LIB-04 | Text search by name, type and rules text | |
| LIB-05 | Filters and Columns dialogs | Open, apply, and Clear filters restores (see `M-06`, known) |
| LIB-06 | Group-by and the group selector | Including deck groups and Lab groups |
| LIB-07 | Add cards | A card can be added and appears |
| LIB-08 | Import list | Review import dialog; a known list becomes a deck, not only a group (`B-09`, known open) |
| LIB-09 | Set Paid and Quantity inline | Persists and re-renders |
| LIB-10 | Row Actions menu: every item | Enumerate and exercise |
| LIB-11 | To buy list: prices present | No `—` where the card dialog has a price (`A-01`/`B-04`, known open) |
| LIB-12 | Watched → Bought | Shows a catalog-sourced figure as "≈ (catalog)", never as paid (`M-02`, Rob decided) |
| LIB-13 | Bulk selection bar | Appears without shifting the page (`A-03`, known) |
| LIB-14 | One number per concept | The same count means the same thing in every place it appears (`M-01`, `W.4` open) |
| LIB-15 | Backup and restore | Export produces a file; restore reads it |
| LIB-16 | To Trade publish and its link/QR dialogs | |

## D. Workshop — Explore (EXP)

Third leg: **explore it.**

| ID | Case | Expected |
|---|---|---|
| EXP-01 | Explore landing renders all four entry points | Deck gap, commander, card, by role |
| EXP-02 | From a deck gap | Picking a deck and a role opens the graph scoped to it |
| EXP-03 | From a commander | By name and by EDHREC rank |
| EXP-04 | From a card | By name and by pasted Scryfall link |
| EXP-05 | By role — each of the seven | Removal, Board wipe, Protection, Loop, Tutor, Ramp, Draw |
| EXP-06 | Graph interaction | Nodes open, joins are named, loops are marked |
| EXP-07 | Card menu from the graph | Add to deck for drafts; swap into a finalized deck (`B-15`, known open) |
| EXP-08 | Pick up where you left off | Resumes the named scope; Clear empties it |
| EXP-09 | Card count claim is true | "31,830 cards" matches the catalog |

## E. Play — the lobby, on BOTH platforms (LOB)

**This is the mirroring check Rob named.** Every case is run twice and the two results compared;
a difference is the finding, whichever way it falls.

| ID | Case | Expected |
|---|---|---|
| LOB-01 | The lobby renders four seats in a 2×2 | Same structure on both |
| LOB-02 | Each seat shows name, status, commander, bracket and cost against the cap | Same fields, same order, same words |
| LOB-03 | Your own seat's controls | Change deck · Choose mat · Ready/Not ready · Leave seat — same set on both |
| LOB-04 | An AI seat's controls | Same set on both |
| LOB-05 | The Table rules panel | Same rows: bracket, cap, engine, remote guests, local host |
| LOB-06 | The local host address is shown and hyperlinked | Rob asked for this by name on 2026-09-21 |
| LOB-07 | **The primary action** | Local: starts a game. Cloud: **must not claim it is starting one it cannot start** |
| LOB-08 | Countdown behavior when every seat is ready | Compare both |
| LOB-09 | Change deck dialog | Lists the same decks on both |
| LOB-10 | Choose mat dialog | Same mats, same names |
| LOB-11 | Host tools menu | Table rules, End table, force-advance — host only |
| LOB-12 | Game history from the lobby | Opens and reads |
| LOB-13 | Bracket and cap are enforced | A deck over the cap is refused with a reason |
| LOB-14 | Create invitation | Link, QR, email draft, copy — each produces something usable |
| LOB-15 | Invitation when remote guests are off | Says so plainly rather than minting a dead link |
| LOB-16 | Lobby visual parity | Same layout, spacing and type at the same width on both |

## F. Play — the board, LOCAL only (BRD)

`/review` is served by the host and by the gateway. github.io has no board route at all, which is
itself a case.

| ID | Case | Expected |
|---|---|---|
| BRD-01 | The board is unreachable from the cloud | Confirm there is no board route on github.io |
| BRD-02 | Four identical 16:9 boards in a 2×2 | Measured equal |
| BRD-03 | The board and the hand fit one screen | `qa-pod.mjs` reports "hand fits above the fold" |
| BRD-04 | The center counter covers no name or control | And cycles life → commander damage → poison |
| BRD-05 | The step strip | `Turn N · You`, step chip, `n / 7`, `Next: …` |
| BRD-06 | Hand: drag a card to the mat to play it | The core interaction |
| BRD-07 | Take mana back | Present and working; a land is correctly **not** undoable (CR 305.1) |
| BRD-08 | Card inspect and the larger view | |
| BRD-09 | Focus board | Ribbon, left pane of the other three, Table view, collapse |
| BRD-10 | History pane | Filters All / My / Affecting me; entries clickable; `?` help |
| BRD-11 | Notices | Appear with an OK button, queue, and do not close too fast to read |
| BRD-12 | Combat: incoming damage and totals | Including double strike arithmetic and commander damage |
| BRD-13 | View options | Card size, compact, hide other boards, **Sound** |
| BRD-14 | Sound: sliders and mute | Audible, persists, unmute restores the chosen mix |
| BRD-15 | Panel slides over the mat | Mat width unchanged open or shut |
| BRD-16 | Onboarding your cards | Header and spinner when the engine cannot pilot cards |
| BRD-17 | End game and the match report | |
| BRD-18 | **Only what gameplay needs is on the local board** | Rob asked for this by name — enumerate every control and justify it |

## G. Play — multiplayer and invited seats (MP)

Rob: *"spin up some agents to then invite to seats and let them pretend to be a human player."*

**Prerequisite:** remote guests. The host must be launched with `-RemoteGuests`; as found on
2026-09-22 the previous tunnel is dead and `guestOrigin` is the local fallback.

| ID | Case | Expected |
|---|---|---|
| MP-01 | Host a table with a human seat | Lobby opens rather than launching straight into a game |
| MP-02 | Create an invitation for that seat | Link, and the seat shows "Waiting for invited player" |
| MP-03 | An agent opens the invitation | Reaches a lobby it can use |
| MP-04 | The agent picks a deck | From what that origin offers it |
| MP-05 | The agent presses Ready | The host sees it; the seat state changes |
| MP-06 | The table starts when every seat is ready | |
| MP-07 | The agent reaches a board | And sees only its own hand |
| MP-08 | The agent takes a turn | Play a land, pass priority |
| MP-09 | Two agents at once | Neither sees the other's hand; both see public events |
| MP-10 | An agent leaves mid-game | The table says what happened rather than hanging |
| MP-11 | Invitation is single-use and sealed to its table | Re-use is refused |
| MP-12 | The countdown and the start are visible to every seat | |

## H. The two origins talking to each other (HAND)

Rob: *"the handoffs in the play experience… and the communication from local back to cloud that
you had outlined works correctly."*

Anchored on `docs/plan-web-to-local-table-2026-09-21.md` and on `game/ui/handoff.mjs`, which
already implements the deck handoff and writes a `CrankMagicReturnChannel@1` nobody reads yet.

| ID | Case | Expected |
|---|---|---|
| HAND-01 | Deck handoff, cloud → local | A deck built on github.io reaches the host through `/handoff` and imports |
| HAND-02 | The origin allow-list is honored | A message from an origin not on the list is ignored |
| HAND-03 | The return channel is written | `CrankMagicReturnChannel@1` in `sessionStorage` with nonce, origin, source deck id |
| HAND-04 | **The return channel is read by something** | Expected to FAIL — nothing consumes it today. Piece 5 of the plan |
| HAND-05 | Results travel local → cloud after a game | Expected to FAIL — not built. The case exists to size it |
| HAND-06 | The cloud lobby learns the tunnel address | Piece 1 — not built |
| HAND-07 | **Send Local** | Piece 2 — not built. Today the cloud offers Start instead |
| HAND-08 | An invitation points at the web lobby | Piece 3 — not built; invitations point at the gateway's own guest page |
| HAND-09 | A guest's Ready packages their deck to the host | Piece 4 — not built |
| HAND-10 | The cloud says plainly when the host is unreachable | Rather than offering an action that cannot work |

**H is deliberately written to include cases that will fail.** Five of the ten are unbuilt pieces
of a plan Rob approved. Running them anyway is what turns "five pieces remain" into a measured
gap with evidence attached, and it is the difference between a remediation plan and a wish list.

---

## Order of execution

1. **XC on cloud**, then the workshop journeys **DECK → LIB → EXP** on cloud, in Rob's own loop order.
2. **XC on local**, and the same workshop journeys at `/app/` — the same code, so differences are
   the finding.
3. **LOB on both**, run back to back at the same window size so the comparison is fair.
4. **BRD** on local, with `game/tools/qa-pod.mjs` for anything needing cards on screen.
5. **Relaunch the host with `-RemoteGuests`**, then **MP** with agents on the seats.
6. **HAND** last, because it needs a live table and a guest.

Findings are written into the log as they are met, with the evidence beside them, and only then
sorted into the remediation plan.
