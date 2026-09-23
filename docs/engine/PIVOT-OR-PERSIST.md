# Persist on Forge, or pivot to our own engine — the two plans and what each costs

**Asked for by Rob, 2026-09-22:** *"Create an alternative plan that works in the existing plan to
build our own engine and move off Forge… include how this eliminates certain steps such as the
communication between local and cloud… then an estimate on the amount of potential token cost to
successfully build each, so we can compare whether it is worthwhile to continue in the Forge
direction to reach a playable state, or whether it makes more sense to begin now pivoting off
Forge as we continue the development plan."*

Nothing here is a recommendation to start. It is the comparison, with its arithmetic shown.

---

## 0. The finding that changes the question

**The engine plan already contains the pivot.** `docs/engine/PLAN.md` §1.1 says it outright:

> *"This plan and the cloud-host migration are **one major product release**. The engine is built
> for the local host first and must not assume it stays there (section 3.8)."*

And §3.8 holds the engine to cloud-readiness **from the first commit** — no filesystem assumption,
no Windows path, a match as a copyable value, seat visibility enforced inside the engine so a cloud
host serving many tables cannot leak a hand by a routing mistake. Phase 11 then ends at *"a game on
GitHub Pages with no host running."*

So the two plans do not differ in what the engine is. They differ in **when it starts**, and
therefore in **how much Forge-shaped work gets built and thrown away first**.

---

## 1. Where the finish lines actually are

The plans do not reach the same place, and comparing their totals without saying so would be
dishonest.

| | Plan A — persist on Forge | Plan B — pivot now |
|---|---|---|
| **Destination** | You and three friends play a full game. Decks carried across, results recorded. | The same — **plus** no local host, no tunnel, no Java, no Forge. |
| **Where a game runs** | Your machine, always. A friend reaches it through a throwaway tunnel. | A cloud host, or eventually the browser itself. |
| **What a friend needs** | Your PC on, the host launched with remote guests, and a tunnel that is up. | A link. |
| **Card coverage** | Whatever Forge pilots, minus the cards it admits it plays badly. | A published ledger saying exactly how far each card is proven. |
| **Ownership** | The GPL adapter stays in the product. | Removed — §12.5 of the plan. |

**Plan A's finish line is not "playable".** It is already playable, today, solo and against AI. What
A buys is *multiplayer with real people over a tunnel*.

---

## 2. Work that is needed either way

This is the honest common denominator. It is not a saving under either plan.

| Item | Est. sessions |
|---|---:|
| The UAT tail — prove the cloud chain after deploy, run **MP-07 to MP-09** (can a guest see their own hand and not anyone else's), the journey-drift tail | 1–2 |
| Stage B close-out — the history band and the light mat, once you decide them | 1 |
| The September workshop defect queue (W.2 → W.6, roughly 40 open items) | 3–5 |
| **Common total** | **5–8** |

---

## 3. Plan A — persist on Forge

Everything remaining on the current road, after the common work above.

| Item | Est. sessions | Survives a later pivot? |
|---|---:|---|
| Piece 1 — the cloud lobby learns the tunnel address | 1 | **No** |
| Piece 2 — Send Local | 1–2 | **No** |
| Piece 3 — invitations point at the web lobby | 1 | **No** |
| Piece 4 — a guest's Ready packages their deck to the host | 1–2 | Partly — the packaging survives, the transport does not |
| Piece 5 — results travel back after the game | 1–2 | Partly — same |
| `CrankCardScript@1` for the cards Forge cannot pilot, plus the two blocked board alerts and the equip/crew sounds | 2–3 | **Absorbed** by the engine's own card work |
| **Plan A total (excluding common)** | **7–11** | |

### What Plan A never removes

- **The launch is a process on your machine.** Today's S1 — a failed launch stranding the table —
  was one instance of a class: a four-minute Forge boot, a JDK on the PATH, an adapter recompiled
  at every game start, and a whole failure mode that only exists because a game is a subprocess.
- **The tunnel.** A `trycloudflare` address is new every session and was measured flapping —
  nothing, then a 530, then a 200, on three consecutive tries. The previous one had been dead for a
  full day while the host advertised it.
- **The card gap.** Forge itself tells you which cards it plays badly; that dialog is a permanent
  feature of Plan A.
- **The license.** The GPL adapter stays in the product.

---

## 4. Plan B — pivot now, folded into the existing plan

Plan B is `docs/engine/PLAN.md` with **one change: the start condition is removed.** The plan says
*"nothing here starts until Track V is fully live."* Plan B starts phase 0 now and runs Track V
alongside it.

Its phases are unchanged and already estimated by the plan itself:

| Phase | Gate | Est. sessions |
|---|---|---:|
| 0 · Decisions and scaffolding | suites green with the new ones | 1–2 |
| 1 · Kernel without cards — priority, stack, mana, combat, SBAs, triggers, replacements, **layers**, commander rules | 1,000 seeds of a four-player vanilla game, same hash on replay, no hidden card in any projection | 4–6 |
| 2 · Card script and compiler | the primitives your seven decks need, each with a unit test | 2–3 |
| 3 · **Tier 0 — your seven decks** | **G1**: all seven load; 100 seeded games per deck against three pilots, zero exceptions | 4–8 |
| 4 · Host integration behind a flag | **G2**: one human plus three pilots to a finished game in the browser | 2–3 |
| 5 · Differential verification against Forge | **G3**: 30 seeded games per deck, every divergence adjudicated against the rules | 2–3 |
| 6 · Tier 1 — your whole library | **G4a**: every library card verified or compiled | 4–7 |
| 7 · Go-live vocabulary over the pool | **G4**: ~27,200 cards in vocabulary; the rest refused at prepare, by name | 5–10 |
| 8 · Cutover — Forge leaves | **G5**: no Forge or Java in the repository | 1–2 |
| **To go-live** | | **24–43** |
| 11 · Static-site play — a game on GitHub Pages, no host | | 2–3 |
| **Plan B total (excluding common)** | | **26–46** |

Phases 9 and 10 (7–14 more) widen card coverage after go-live and are not needed to play.

### What Plan B deletes outright

**The entire web-to-local track.** `docs/plan-web-to-local-table-2026-09-21.md` exists for one
reason: a game runs on your machine and the workshop does not. Remove that and:

- **No tunnel discovery** (piece 1). There is nothing to discover.
- **No Send Local** (piece 2). There is no "local" to send to.
- **No invitation retargeting** (piece 3). One origin, one lobby.
- **No cross-origin deck handoff.** Today's `handoff.mjs` — the nonce, the origin allow-list, the
  return channel nobody reads — becomes an ordinary function call.
- **No CORS, no CSP allowance, no `-WebOrigin` flag.** Today's R2 work becomes moot. (It was still
  worth doing: it is what proved the wall was real and measurable.)
- **No cloudflared, and no flapping address.**
- **No "AI can't play these cards well" dialog.** The support ledger names what is missing, at
  prepare, before the game starts.

### What Plan B does *not* delete

**Forge stays as the oracle until phase 8.** Phases 5, 6 and 7 verify the engine differentially
against it — same pod, same seed, decisions replayed, state compared. So a pivot is not a cliff and
nothing is deleted on day one. Investment stops; the oracle keeps earning its place until G5.

**The lobby, the seats, the invitations, the table lifecycle, the board, the sound** — all
engine-agnostic and all survive. Today's fix that makes a table wait for an invited guest is worth
the same under either plan.

---

## 5. The cost, in the plan's own unit and in tokens

`PLAN.md` §6 states its unit: *"agent sessions ending at the 95% usage pivot."* A session is
therefore **≈950,000 context tokens** against a 1M window. This session is a fair sample of one: at
the time of writing it stands at **821,535 tokens (82%)** after one compaction, having produced
twelve pull requests including the whole audio track, a board rebuild and a two-platform UAT.

| | Sessions | ≈ Context tokens |
|---|---:|---:|
| Common work (either plan) | 5–8 | 4.8M – 7.6M |
| **Plan A** — persist, reach multiplayer on Forge | **12–19** | **11.4M – 18.1M** |
| **Plan B** — pivot now, reach go-live and static play | **31–54** | **29.5M – 51.3M** |
| **A then B** — finish A, pivot later | **38–65** | **36.1M – 61.8M** |

**The number that decides it is not any of those totals. It is the difference between the last two
rows:**

> **Doing A first and pivoting later costs 3–5 sessions (≈3M–5M tokens) of work that is thrown
> away** — pieces 1, 2 and 3 are pure cross-origin transport and have no meaning once there is one
> origin. Pieces 4 and 5 survive in modified form, so they are not counted as waste.

That is the entire measurable penalty for choosing A first. Everything else in A either survives a
pivot or is common work.

### Read the estimate with its own warning

`PLAN.md` says it plainly: *"Phase 7 is the widest range because it depends on the parser's share
and the compiler's pass rate, both of which phase 6 measures before phase 7 starts. That measurement
is the first point at which this estimate should be replaced by a better one."*

So **24–43 is the plan's honest guess, not a measurement.** The 3–5 session waste figure is far
firmer than either total, because it is counted from a scoped, written plan rather than estimated
from unknown work.

---

## 6. What actually makes this decision, and it is not the tokens

The token gap between "pivot now" and "pivot later" is small — 3 to 5 sessions. The costs that are
not in the table are larger:

**Arguments for persisting on Forge**

- Multiplayer with real friends arrives in **12–19 sessions** instead of **31–54**. If the point is
  a game night this season, A is the only plan that gets there.
- The engine's hardest parts — layers, replacement effects, the priority loop — are where rules
  engines go wrong, and the plan's own §8 says correctness over a large pool is reached
  asymptotically.
- Forge works today. Your seven decks play.

**Arguments for pivoting now**

- **The waste is real and it is in front of us.** Pieces 1–3 are the next thing on the road, and
  they are the part a pivot deletes. Choosing later means paying for them first.
- **Every Plan A session is spent on scaffolding for a host that Plan B removes.** The tunnel, the
  CORS, the two-origin dance — none of it is product; all of it is consequence.
- **The measured scope is smaller than it looks.** The inventory (2026-09-20) counted it: your
  seven decks need **64 distinct APIs**, and **the top 30 cover 90% of those 477 cards**. Your whole
  library needs 112, with the top 50 covering 92% of 2,365. That is the difference between "write
  Magic" and "write the Magic your decks actually use".
- **Ownership.** The GPL adapter is the one part of CrankMagic that is not yours. Plan B removes it;
  Plan A keeps it indefinitely.

**The shape of a third option**

Run phase 0 and phase 1 of Plan B — **5 to 8 sessions** — and stop at its gate: a four-player game
of vanilla creatures and lands that runs 1,000 seeds without an exception and replays to the same
hash. That gate is the cheapest honest answer to "can we actually build this", and it is reached
before a single card script is written. Pieces 1–3 stay unbuilt while it runs, so nothing is wasted
either way.

---

## 7. What this document does not settle

- Whether Track V's remaining work changes either estimate. The engine plan's start condition exists
  for a reason and removing it is Rob's call, not this document's.
- The phase 6 measurement, which the plan itself names as the point where its estimate should be
  replaced.
- Whether a game night this season matters more than the destination. That is the real question, and
  it is not a technical one.

---

## 8. Independent corroboration, 2026-09-22

Grok Bot ran a parallel UAT the same evening against tip `8b76c69` and **undeployed** Pages, with
its own test cases rather than these. Its scoreboard: **14 pass, 2 fail, 3 partial, 3 blocked.**
Where the two reviews overlap they agree, and they were derived independently:

| Finding | This review | Grok's review |
|---|---|---|
| The cloud lobby is not the host's table | U-05 — *"a local-storage mock with seats, costs, a countdown and a Start button, none of it connected"* | *"still a seat mock, not a mirrored host table"* |
| Remote guests | Off; the previous tunnel had been dead a day | *"Remote guests off; no verified tunnel tonight"* |
| The cloud Start control | U-02/U-04 — enabled, and claiming a launch it cannot perform | *"stays enabled with nobody seated; click did nothing visible"* |

Its own caveat matters and is correct: **Pages does not yet carry the R0/R1 fixes.** Those are in
`#352`, unmerged and undeployed, so Grok was testing the pre-fix build. Its "Start does nothing" is
the behavior this review fixed hours earlier; neither observation contradicts the other.

It also reports a path this review did not reach — *"Host+3AI → Forge → mid-game sign-off: API
session 403 blocked that path"* — which is a fourth independent hit on the same theme: **the parts
that need two components to talk are the parts that fail.** That is the thesis of this whole
document, arrived at twice.

---

## 9. What the cloud actually costs, per month

Plan A's running cost is **£0 and your PC**. That is a real advantage and it should be stated
first. Plan B trades it for a monthly bill, and the bill is small — but it is not zero, and it is
forever.

### The asymmetry worth understanding before reading the numbers

**Forge cannot follow you to the cloud cheaply.** It is a JVM, and a game is a subprocess holding
1–2 GB. Hosting it means renting a real machine per concurrent table, and it scales by memory.
**The JS engine is the opposite**: a match is a value — pod, seed, decision tape, checkpoint — of a
few tens of kilobytes, and Commander turns are slow, so it needs almost nothing.

So the monthly cost below is a **Plan B cost**. There is no equivalent Plan A line, because Plan A
in the cloud is the expensive option nobody has costed.

### What you would actually be buying

| What | Why you need it | Do you already have it |
|---|---|---|
| Static hosting for the app | Serving the pages | **Yes** — GitHub Pages, free, keep it |
| A small server-side runtime | One authoritative table per game: seats, turn order, the engine run | No |
| Durable per-table state | The journal and checkpoint while a game is live | No |
| Object storage | Card index, finished match journals | No |
| A domain | Friends need a stable address, not a throwaway tunnel | No |
| Auth | **Nothing to buy** — seats already use single-use signed invitations | Yes |
| An AI vendor | **Nothing to buy** — the house pilots are deterministic code | Yes |

### Recommendation: Cloudflare

Not for price — the prices are similar everywhere — but because **Durable Objects are the exact
primitive this product needs**: one addressable, single-threaded object per table, with storage
attached and WebSockets built in. A Commander table *is* a durable object. It removes the
coordination problem rather than solving it, and §3.8's "a match is a value" was written as if for
this.

| Line item | Typical | Note |
|---|---:|---|
| Cloudflare Workers Paid (includes Durable Objects) | **$5/mo** | The floor. Includes far more requests than a handful of tables will use |
| Durable Objects + storage usage | **$0–3/mo** | Usage-based; a few tables a week rounds to noise |
| R2 object storage (card index, journals) | **$0–1/mo** | No egress fees, which is why R2 rather than S3 |
| Cloudflare Pages | **$0** | Keeps the current deployment |
| Domain via Cloudflare Registrar | **~$1/mo** | Sold at cost, ~$10–15/yr |
| **Expected total** | **$6–10/mo** | |

You already use `cloudflared`, so this is the vendor you are partly on.

### Alternative: Fly.io — the lift-and-shift

If the engineering cost of learning Workers is the thing to avoid, Fly runs the Node host you
already have, almost unchanged.

| Line item | Typical |
|---|---:|
| One shared-CPU machine, 256–512 MB | **$2–5/mo** |
| A small persistent volume | **$1–2/mo** |
| Domain | **~$1/mo** |
| **Expected total** | **$4–8/mo** |

**Simplest path, worst fit long term**: an always-on machine is a thing to patch and watch, and it
does not scale to several tables without thought. Choose it if shipping sooner matters more than
the shape being right.

### Not recommended

- **Render / Railway** — fine, but free tiers spin down, and a lobby that sleeps mid-game is a bug
  you would then have to design around. Paid tiers land near the others with no advantage.
- **AWS / GCP / Azure** — correct at a hundred times this scale and a billing surface you do not
  want for a game night.
- **A dedicated game-server host** — Commander turns take seconds, not milliseconds. You are not
  building a shooter.

### Verify before committing

These are the shapes of the pricing, not a quote. Every vendor changes tiers, and the figures above
should be confirmed on the day a card is entered. The conclusion is robust to the detail: **this is
a sub-$15/month product**, and the decision does not turn on it.

### So how does the bill change the comparison?

Barely. Over three years, $10/month is **$360** against a build gap already measured in millions of
tokens. **It is not a reason to choose either plan.** The reasons remain: how soon you want a game
night, whether the GPL adapter stays in the product, and whether you are willing to keep paying the
Forge tax — a JVM boot, a flaky tunnel, and a class of failure that only exists because a game is a
subprocess on your own machine.
