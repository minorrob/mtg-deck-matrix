# The web lobby, the tunnel, and one table — plan

**Asked for by Rob, 2026-09-21:**

> "The local and github.io versions of the lobby should look identical (and when I fill in the
> info in github.io, perhaps then we change the button from 'Start' to 'Send Local', then send my
> seat selections with the command to local. I want all users that I'm playing with to, when they
> receive their invite, that it has a link that sends them into the github.io lobby, where they
> select their deck (or build it), then when they press ready that also packages their deck and
> it's all sent to the local host startup. Then we display the local host address in the Github.io
> lobby that every player presses to join the pre-game lobby."

This is achievable, and the piece that makes it achievable was already in the repository.

---

## The wall, and the way round it

Two independent things stop `https://minorrob.github.io` talking to `http://127.0.0.1:8768`, and
both were measured rather than assumed:

1. **Chrome's Local Network Access permission.** Real Chrome: *"Permission was denied for this
   request to access the `loopback` address."* Not mixed content — `http://127.0.0.1` is a
   potentially-trustworthy origin — a permission, and denied by default.
2. **The host itself.** A preflight from that origin gets `204` on `/api/health` and **`403` on
   `/api/setup` and `/api/prepare`**. The host trusts only same-origin requests for anything
   touching decks or spawning processes. That is a deliberate posture and worth keeping.

**The way round is neither.** `game/tools/start-crankmagic.ps1 -RemoteGuests` runs **cloudflared**,
which publishes the guest gateway at a public `https://…` address:

```
github.io (https)  →  cloudflared tunnel (https)  →  guest gateway :8769  →  host :8768
```

https to https. No loopback, no mixed content, no permission prompt, and no CORS hole punched in
the local host — the tunnel is a front door that already exists, is token-guarded, and is exactly
what remote guests use today. Grok's re-UAT confirmed it works: https `guestOrigin`, an invite
minted, `guest.mjs` 200.

**It is off unless the host is started with `-RemoteGuests`.** Right now `guestOrigin` reads
`http://127.0.0.1:8769`, which is the local fallback.

---

## What is already true

- **The two lobbies are the same code.** Same `crankmagic-game.js`, same stylesheet. The
  differences Rob has seen are behavioural, not visual: a copy that cannot reach a host refuses to
  count down and says so. Under this plan that refusal becomes **Send Local**, which is a better
  answer than refusing.
- The host already mints invitations as `${guestOrigin}/#table=…&invite=…` and seals each one to
  the table id it was issued against.
- The board is `/review`, and it already links back to `/app/#decks`.
- **A deck already crosses from `github.io` to the host, and pieces 4 and 5 should build on it
  rather than invent a second path.** `game/ui/handoff.mjs` is the receiving half: the web copy
  opens `/handoff#handoff=<uuid>`, the two windows shake hands by `postMessage` against an origin
  allow-list of exactly `http://127.0.0.1:8768` and `https://minorrob.github.io`, the host imports
  the deck through `/api/import-deck` and writes a **return channel** into `sessionStorage`
  (`CrankMagicReturnChannel@1`, carrying the nonce, the origin and the source deck id). That
  return channel is most of piece 5's "results come back" already sitting there unused. The
  allow-list is also the thing to update first when the host's port or the web origin changes,
  because a mismatch there fails silently — the message is simply ignored.

## What has to be built

In the order I would build it, each its own PR with a test that was red first.

### 1. The lobby learns where the tunnel is
The web copy cannot discover the tunnel by itself. The local lobby knows it (`/api/setup` returns
`guestOrigin`), so the local lobby offers a **share link**: `…github.io/…#game?host=<tunnel>`.
Opening that link teaches the web copy the address, and it is the same link an invited player
gets. Stored per table, not per browser, so it expires with the table.

### 2. Send Local
On a copy with a known tunnel, the launch button reads **Send Local**. It POSTs the table — seats,
roles, decks, bracket, cap — to a new gateway endpoint. The gateway hands it to the host exactly
as `/api/prepare` would, so nothing about the host's trust model changes: the request arrives at
the gateway, which is already the thing outsiders talk to.

### 3. The invitation goes to the web lobby
Today an invitation points at the gateway's own guest page. It points at the github.io lobby
instead, carrying the tunnel and the invite token. A guest lands in the lobby he already knows,
picks or builds a deck, and presses Ready.

### 4. Ready packages the deck
A guest pressing Ready sends their resolved hundred to the gateway against their invite token.
The host validates it the way it validates any seat — Forge card resolution included — and refuses
it there rather than at engine load.

### 5. The address to join
Once every seat is in, the web lobby shows the local address to open. That page is the same lobby,
served locally, already holding everyone's selections.

---

## What this does not do, and should not pretend to

- **It does not make the two libraries one.** A deck built on `github.io` lives in that origin's
  storage. Step 4 sends a *resolved* deck to the host; it does not sync a library. If the same
  deck should exist in both places, that is a separate piece of work and should be named as one.
- **It does not remove the need for the host to be running.** Nothing in a browser can start a
  process on a machine it has never been allowed to reach. `-RemoteGuests` has to be on before any
  of this works, and the web lobby should say so plainly when the tunnel is unreachable.
- **It does not open the local host to the web.** Everything arrives through the gateway, which is
  the component designed to face outward.

---

## Confirmed on Personal-HP, 2026-09-21

Rob ran the launcher with remote guests and the tunnel came up:

```
Ready: http://127.0.0.1:8768/app/#game
Remote guest invitations: https://medium-linking-replies-take.trycloudflare.com
```

Measured from here:

| Check | Result |
|---|---|
| `GET /api/setup` → `guestOrigin` | `https://medium-linking-replies-take.trycloudflare.com` |
| That origin reachable from the public internet | **200** |
| `OPTIONS /` with `Origin: https://minorrob.github.io` | **404** |

So the **transport is proven** and the remaining work is exactly what this plan said it was: the
gateway has no endpoint for a table and no CORS for the web lobby's origin. That is piece 2, and
it is now a measured starting point rather than an assumption.

**Allowing that origin on the GATEWAY is not the same decision as allowing it on the host.** The
gateway is already public, already token-guarded, and already the component outsiders talk to; the
host keeps refusing every cross-origin request, which is the posture worth keeping.

### One consequence for piece 1

A `trycloudflare.com` address is **ephemeral** — a new one every time the host starts with
`-RemoteGuests`. So the web lobby cannot be taught the tunnel once and remember it. The share link
has to carry the current address, and the web lobby has to say plainly when the address it holds
no longer answers, rather than failing quietly. That is why piece 1 stores it per table and lets
it expire with the table.

---

## What starting a game will feel like, once this is built

Written in Rob's own numbering so it can be walked as a UAT script. **Each step says whether it
works today, is delivered by this plan, or is engine behavior nobody here has verified yet** —
because a script that does not distinguish those is a script that fails and nobody knows why.

### Once per session, on the machine that will host

**0.** You start the host with remote guests. It prints two addresses: the local one for you, and
a public one for everybody else.

```
Ready: http://127.0.0.1:8768/app/#game
Remote guest invitations: https://<something>.trycloudflare.com
```

*Works today.* The second address is new each time — see "One consequence for piece 1".

### What you do

**1.** You go to `https://minorrob.github.io/mtg-deck-matrix/#decks` and build a deck.
*Works today.* It lives in that copy's library; it is not on your machine yet.

**2.** You go to `#game`. The lobby already knows the tunnel, because you opened it from the share
link the local lobby gave you. You seat two AIs and put your new deck in seat 1.
*Piece 1.* Without the share link the lobby has no idea your machine exists and says so.

**3.** You press **Send Local** — the same button, reading differently because this copy cannot
start a game itself. Your seats, your deck and the table's rules go to the tunnel.
*Piece 2.*

**4.** The web lobby confirms the table arrived and shows you the address to open on your own
machine. **Nothing has been closed or launched yet** — Forge starts when the table starts, and the
table starts from the machine it will run on.
*Piece 2.*

**5.** You open `http://127.0.0.1:8768/app/#game`. It is the same lobby, already holding your
seats, your deck and the AI seats you configured.
*Piece 2, on the host's side.*

**6.** You press **Start**. Any engine still running is closed — including one orphaned by an
earlier host — a fresh Forge spins up, and a new tab opens on the live board at `/review`, which
carries a link back to the full site.
*Works today* (closing and restarting shipped in batch 9; the board tab in #318).

### What your friends do

**7.** Each invited player gets a link into the **web** lobby, carrying the tunnel and their own
invite token.
*Piece 3.*

**8.** They pick a deck or build one, then press **Ready**. That packages their resolved hundred
and sends it to your machine, where it is checked against Forge's card database — so a card Forge
does not have is refused there, in front of them, and not at engine load with everyone waiting.
*Piece 4.*

**9.** When every seat is in, each player is shown the address to join. **Not the same address for
everybody:** you join at `127.0.0.1`, they join at the tunnel. `127.0.0.1` on a friend's computer
is their own computer, so handing everyone the local address would send them nowhere.
*Piece 5. This is a correction to the flow as originally described.*

### What happens in the game

**10 onwards** — who won the roll, seven cards each, mulligans, a player's steps advancing in
order, the force-advance lever when a seat hangs, and skipping to end on your own turn.

**Not verified by anyone here.** Forge is the rules engine and those behaviors are its. The
force-advance lever exists (`/api/table/force-advance`) and was exercised by the run-book; the
mulligan and untap paths are what the old #259/#260 work was about, and that work is merged but
has never been watched end to end. **This is the part of the flow to test first and trust least**,
and nothing in this plan changes it.

---

## Pieces 3–5, made concrete: a guest's own decks

**Rob, 2026-09-21:** *"imagine if I invite a human player… the invite should include a link to the
CrankMagic main page. They may go ahead and create their deck there and save it… Then they click
their unique link to join the seat. In the game, they would want… to see the decks that I have
created in CrankMagic now available to them. These would be stored in their browser cache. Is there
a way for their link to my local host… to then also read the deck cache files?"*

### The one thing that cannot work

**A page on the tunnel origin cannot read storage belonging to `minorrob.github.io`.** Different
origins; the same-origin policy is the foundation of the browser security model, and no header,
flag or permission opens it. So "the local host link reads their decks" is out, permanently.

**And it is not cache.** Cache is HTTP-level and evictable. Their decks are in IndexedDB under the
github.io origin. The distinction carries a consequence worth stating plainly: **that storage is
per-browser and per-device, and it can be cleared.** A guest who builds a deck on their phone and
joins from their laptop has nothing there. That is inherent to a design with no accounts, not a
defect — and it is the strongest argument for accounts if CrankMagic ever wants them.

### What works instead: the page that owns the storage sends it

This repository already does exactly this for the host — `game/ui/handoff.mjs` plus
`crankmagic-online.js`, with a nonce, an origin allowlist, a 120-second expiry and single use.
Neither side reads the other's storage; the owner reads its own and posts it.

For a guest there is a better version, and the endpoints already exist:

| Step | Endpoint | State |
|---|---|---|
| Invite lands them on **github.io** carrying the tunnel address and their token | — | piece 3 |
| They choose a deck **on github.io**, where their storage lives | — | small, new |
| Ready sends the resolved hundred | **`POST /table/deck`** | **exists** |
| Gateway accepts one named web origin | `webOrigin` | **shipped, #320** |
| After the game, the result comes back | **`GET /match/report`** | **exists** |
| Written into their library | `attachMatchReport` | **exists**, for the host |

**Prefer this over the postMessage handoff.** The guest never leaves github.io to pick a deck, so
their storage is read by the page that owns it and only the resolved list crosses the wire. No
popup, so no popup blocker. And the handoff machinery is currently pinned to loopback anyway —
`handoff.mjs` allowlists exactly two origins and `crankmagic-online.js` hard-codes
`http://127.0.0.1:8768` in four places, so the postMessage route would need both ends
parameterised first.

### The host needs no changes

A guest's deck arrives as `source:'upload'` and goes through the same `importWorkshopDeck()` the
host's own handoff uses: exactly 100 cards, one or two commanders, no commander duplicated, every
name resolved against the card database. Same road, already paved.

`prepareGuestDeck` refuses `source:'library'` for guests unless the host sets `shareLibrary` — that
is about **the host's** saved decks, correctly, and does not affect a guest's own.

### The two things that will bite

1. **The tunnel address is ephemeral.** A guest invited on Monday and playing on Friday gets a
   different `trycloudflare` address. The invite has to carry the current one and the web lobby has
   to say plainly when the address it holds no longer answers, or it fails silently and looks like
   the host's machine is down.
2. **The return path has no opener.** The host's match report rides `window.opener`; a guest on
   github.io has none. `GET /match/report` with the invite token is the answer, over the same CORS
   the deck used.
