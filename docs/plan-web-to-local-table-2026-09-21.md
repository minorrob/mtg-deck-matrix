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
