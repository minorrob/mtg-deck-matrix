# CrankMagic UAT — remediation log and plan of execution

**For Rob's review and sign-off.** Nothing in here is built yet. Evidence for every line is in
`2026-09-22-uat-log.md`; the cases are in `2026-09-22-test-cases.md`.

---

## The short version

**Eleven findings. Six of them are one finding.**

The two lobbies look identical because they are the same code, and they are not the same table.
The cloud copy is a local-storage mock with seats, costs, a countdown and a Start button, none of
it connected to anything. Everything else — the Start that cannot start, the "Starting…" that is
not starting, the duplicated host link, the tunnel the cloud cannot see — is that one fact showing
through in a different place.

**And the fix is much smaller than the plan assumed.** The gateway already implements CORS for one
named web lobby, carefully, with a validated origin and a proper preflight. Nothing ever switches
it on. That is a launcher flag, not a feature.

**Four capabilities were found today that are fully built and not reachable.** `webOrigin` on the
gateway (CORS for the cloud lobby, never switched on), `--table-viewport` on the board (the real
viewport height, posted and discarded), `CrankMagicReturnChannel@1` in the deck handoff (written
and never read), and the whole production journey suite (unrunnable on two hardcoded paths).

That is a pattern worth naming: **this repository's most common defect is not missing code, it is
code nobody wired to anything.** It is also good news — four of the items below are connections
rather than features, and each is marked as such.

---

## The findings, ranked

| ID | S | Finding | Nature |
|---|---|---|---|
| **U-05** | S1 | The two lobbies do not mirror — they are different tables | Design |
| **U-11** | S2 | The production release gate cannot run — two hardcoded container paths | **Connection** |
| **U-10** | S2 | Cloud cannot reach the gateway; the CORS mechanism is built and off | **Connection** |
| **U-02** | S2 | "Start the game" says in its own copy that it does not work, and is enabled | Standing rule |
| **U-04** | S2 | Cloud claims "Every seat is ready. Starting…" with no host | Design |
| **U-09** | S2 | Local self-starts on a 10s countdown; easy to start a game unintentionally | Behavior |
| **U-01** | S3 | `#new` is an href but not a route | Small |
| **U-03** | S3 | Cloud shows the local host link twice | Small |
| **U-06** | S3 | Disabled view toggles with no reason given | Small |
| **U-07** | S3 | Live board carries `Deck workshop ↗` and `Game setup` | **Rob's call** |
| **U-08** | S4 | A fresh table reports the previous table's phase | Small |

Plus the open queue from the 2026-09-21 UAT, untouched by this run and still live in
`docs/app-walkthrough-plan-2026-09-19.md` §9.5 (W.2 → C.6).

---

## Plan of execution

Six steps. Each is one PR with a test that was red first, in this repository's usual way. Sizes
are S (under an hour), M (a session), L (more than one).

### R1 · Stop both lobbies saying things that are not true — **S**

The smallest change with the largest honesty return, and it stands alone.

- **U-02** — remove the "Start the game" button, or disable it with its reason attached. It
  currently says "The board is not built yet. This button will deal the first hands once it is."
  while remaining clickable. Rob's standing rule of 2026-09-22 says it should not be there at all
  until it works.
- **U-04** — on a copy with no reachable host, the cloud must not print "Every seat is ready.
  Starting…" or offer `Start`. Interim copy until R4 lands: say the host is not reachable and what
  to do about it.
- **U-03** — one local host link, not two.

*Test:* a conformance check asserting the cloud build renders no enabled control whose own copy
says it does not work, and no countdown text when `probeHost()` is false.

### R1b · Make the release gate runnable — **S** · *connection, not new work* · **do this first**

`tests/uat/scryfall-stub.mjs:8-9` read `/home/user/mtg-deck-matrix/…`. Resolve both against the
repo root as every other suite does. Ten journeys and the seven-tour walk come back with it —
coverage that already exists and has been unrunnable on this machine.

It goes first because **every step after it should be verified by a gate that actually runs**, and
because it is minutes of work.

*Test:* the gate itself. `node tests/uat/journeys.mjs` reaching "All production browser journeys
passed" is the proof, and its failure today is the red-first.

### R2 · Switch on the gateway's web origin — **S** · *connection, not new work*

Add `-WebOrigin` to `start-crankmagic.ps1`, defaulting to `https://minorrob.github.io`, passed
through as `COMMANDER_WEB_ORIGIN`. The gateway already validates it and emits the headers.

*Test:* a red-first test asserting a request carrying that `Origin` gets `Access-Control-Allow-Origin`
back and an unknown origin does not. Then re-run the measurement from the real cloud page, which
today returns `TypeError: Failed to fetch` on every route including `/health`.

**This unblocks R3 and R4.** Until it lands, neither can be built at all.

### R3 · The cloud lobby learns where the tunnel is — **M** · *plan piece 1*

The local lobby knows `guestOrigin`; the cloud cannot discover it. A share link carries it, stored
per table so it expires with the table. The cloud must say plainly when the address it holds no
longer answers — which, as today proved, is the normal case: the previous tunnel had been dead for
a day while the host advertised it.

### R4 · Send Local — **M** · *plan piece 2*

On a cloud copy with a known, answering tunnel, the primary becomes **Send Local**: POST the table
to the gateway, which hands it to the host as `/api/prepare` would. This is what U-04's button
should have been all along, and it is the point at which the two lobbies stop being two tables.

### R5 · Invitations, decks and results — **L** · *plan pieces 3, 4, 5*

In order: an invitation points at the web lobby rather than the gateway's guest page; a guest's
Ready packages their resolved hundred to the host; results travel back after the game.

**Piece 5 is already half-built.** `game/ui/handoff.mjs` writes `CrankMagicReturnChannel@1` to
`sessionStorage` with the nonce, the origin and the source deck id, and nothing reads it. Extend
that path rather than inventing a second one.

### R6 · The small ones — **S**, one PR

U-01 (make `#new` a route or stop advertising it), U-06 (say why a view is unavailable, or do not
render the control), U-08 (report the new table's phase, not the previous one), U-09 (see below).

---

## Three things that are decisions, not defects

I have not assumed an answer to any of these.

1. **U-09 — the ten-second self-start.** Convenient for an all-AI table; risky with an invited
   human still choosing a deck. Options: leave it, lengthen it, or hold the countdown until every
   *human* seat is occupied. My recommendation is the third, but it is your call because it
   changes how you start every solo game.
2. **U-07 — `Deck workshop ↗` and `Game setup` on the live board.** You asked whether the local
   instance carries only what gameplay needs. These two do not, but they may be deliberate
   conveniences. Remove, hide during a live match, or keep.
3. **The cloud lobby's purpose.** R1 makes it honest; R3–R5 make it useful. If you would rather it
   simply said "open the local host to play" and did nothing else, that is a smaller and entirely
   defensible product, and it would retire U-02, U-03 and U-04 outright.

---

## What this run did not cover, stated plainly

- **The workshop was walked as a journey, not case by case.** A 76-case pass already covered it on
  2026-09-21 and its queue is still open. Re-finding those would have doubled the apparent size of
  this report without adding a fact.
- **MP-03 onward** — a guest agent is walking the invitation as this is written; results append to
  the log.
- **Deep board play** — `qa-pod.mjs` reaches turn two to four and no further, so the board wipe and
  token batch audio rules still have not fired in a live game (see `docs/plan-play-audio.md`).
- **Mobile and offline** were not re-run; they are covered by the existing journeys.

---

## Suggested order, if you want one

**R1 and R2 together, first.** They are both small, R1 removes every untrue statement on screen,
and R2 costs one launcher flag and unblocks everything after it. That is a single afternoon and it
turns the biggest finding from structural into scheduled.

Then **R6** while the context is warm, **R3**, **R4**, and **R5** last.

**Awaiting your sign-off before any of this is built.**
