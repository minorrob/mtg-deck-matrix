# The board does not tell you what happened — plan

**Rob, playing a four-player pod, 2026-09-21.** Six findings in a row, and they are one finding:

> "I would like to see the actions the other players take, specifically the cards they play by
> having the card image included in the History log when a card is played."

> "I'm missing key notifications because of how we've laid things out."

> "You already have pop-ups when other players play cards, which is great, but they should have an
> 'Ok' button to close them as they pop-up and close too fast to read or inspect the card."

> "The history pane needs a lot more information, and entries should be clickable to see more
> detail. For example, I just had a creature eliminated from my board. I don't know why. I don't
> know what dealt damage to me."

> "In this instance, I'd like to see the card attacking me and know the total damage and type of
> damage coming."

> "The game screen is still not the new design (and triple check all of your work against the
> design standards)."

---

## What I got wrong

`docs/plan-board-onto-the-design-system.md` defined Stage A as "a game you can actually play
through" and then listed only four things: the lag, the untap stall, the duplicate controls, and
the skipped-draw explanation. **That list was too short.** Every item above is playability — a game
you cannot follow is not one you can play — and none of them were on it.

So Stage A is not finished. These are **Stage A.6**, and they come before the redesign for the same
reason the others did: a surface whose interaction model is still wrong gets redesigned twice.

---

## Measured first

| | |
|---|---|
| Design tokens referenced by the board's four stylesheets | **0** |
| Raw hex literals in them | **463** across every `.css` in `game/ui` (`review.css` 96, `mats.css` 72, `online.css` 144, `setup.css` 90, and `guest.css` the rest) |
| `:root` blocks in `crankmagic-design.css` | **0** — every token is defined on `#matrix-v2` |
| `matrix-v2` anywhere in `review.html` | **0** |
| The "pop-up" that closes too fast | `review.mjs:83` — a text-only toast on a **6500ms** auto-hide, no button, no card |

So "still not the new design" is structural, not drift: the board cannot read a single token,
because the tokens are scoped to an id the board does not carry.

---

## B.0 — give the board the palette, and nothing else

Two ways, and only one is small.

**Put `#matrix-v2` on the board root.** It would pull in every element rule in the design sheet —
`h1`, `h2`, `button`, the lot — and restyle the board wholesale on the spot. That is not a
preparatory step, that *is* Stage B, and it would break the layout the same afternoon.

**Lift the token definitions to `:root`.** Custom properties inherit; the board reads them; the
workshop keeps its own identical definitions inside `#matrix-v2` and is untouched, because a value
redefined in an id block still wins there. The light-theme block needs the same treatment.

**B.0 is the second one.** It is genuinely small, it changes nothing visually on either surface, and
after it every component built below is on the design system from birth and survives Stage B.
Guard: `game/ui` enters the raw-hex ratchet at whatever the count is, so 463 can only fall.

---

## A.6 — the information layer

Built on tokens, so Stage B moves these rather than rewrites them.

### 1. A notice you can actually read
The toast becomes a real notice: **card art, what happened, who did it, and an OK button.** It does
not auto-hide. The card art is clickable and opens the existing large card view, which closes on a
click inside or outside — the behavior Rob already asked for on the lobby's card pop-up, so it
should be the same component.

### 2. Alerts that reach the affected player
Rob's list, verbatim, plus the ones that belong with them:

| | |
|---|---|
| Life | lost, gained |
| Cards | drawn, lost, discarded, milled |
| Damage | combat damage taken, **commander damage** (and the running total per commander), poison counters |
| Permanents | destroyed, exiled, **exiled with a return condition**, sacrificed, countered |
| Other players | a card played whose mechanic triggers off what other players do |

Also worth adding, on the same grounds: **your commander changing zone**, a **counter placed on
something you control**, an **attack declared against you**, and **a spell of yours countered**.

Shown as an overlay centered on the affected player's own mat, during the offending player's turn,
with **Acknowledge**. Some are untargeted and go to everyone; the rule is that an alert goes to the
players the event *happened to*.

**The open question is queueing**, not display: several of these fire in one turn, and four
overlays stacking is worse than none. They coalesce into one notice per event batch, in order, with
the count visible.

### 3. History that answers "why"
Every entry carries the card's art. Every entry is clickable and opens the detail behind it — for a
creature that died, *what dealt the damage, how much, and from whom*. The journal already holds
this: `GameEventCardDamaged`, `GameEventCardDestroyed` and `GameEventCardChangeZone` all carry the
source, and `match-telemetry.mjs` already reads that shape. **The data exists; the board throws it
away.**

### 4. Combat you can read
At declare-blockers, the prompt names the attacker and nothing else. It should show **the attacking
card, its power, the damage type (first strike, double strike, deathtouch, trample, infect) and the
total incoming** — per attacker and summed.

---

## A separate track: the AI learns a card the first time it meets one

> "when AI can't play a card well, we should build in a card harvesting loop where the AI processes
> cards that it can't play well to understand the mechanic the card executes, when and how it would
> be beneficial, it's cost, both mana and any penalties, and saves that information back into the
> graph model so that the card is then playable by AI for that game and all games in the future.
> This enables processing cards using AI tokens only when the cards become a used card the first
> time."

This is a good design and it is **not board work** — it is the engine and the graph, and it must not
block play. Recorded here so it is not lost, with the three things to settle before building it:

1. **Where the knowledge lives.** `data/graph.json` is the card graph, but `data/deck-ratings.json`,
   `data/simulation-summary.json`, `sim/` and `data/deck-guides.json` are off limits by standing
   rule. A new file, keyed by oracle id, is the likely answer.
2. **Settled by Rob, 2026-09-21.** I had this down as the question that decides the feature's
   value — whether anything can consume a harvested note, given Forge's own "can't play these
   cards well" list comes from card *scripts*. His answer:

   > "we need to write a card extraction skill that the AI API executes as part of the API pilot.
   > I don't want to rely on Forge except where absolutely necessary."

   So the consumer is the **API pilot**, which reasons in text and needs no Forge card script. The
   harvested knowledge is produced and read by a skill the pilot runs when it first meets a card,
   and the native Forge AI is not in the path at all. That removes the dependency the question was
   about, and it points the same way as the engine plan.
3. **Cost control.** "Only when a card is used the first time" is the right trigger. It needs a
   cache that is checked before any token is spent, and a record of what was spent.

---

## Order

1. **B.0** — tokens to `:root`. Small, invisible, unblocks everything.
2. **A.6.1** — the notice with an OK button and a clickable card. This is the one Rob hit most.
3. **A.6.3** — history with art and a "why" behind each entry.
4. **A.6.4** — combat totals.
5. **A.6.2** — the alert set, once queueing is settled.
6. **Stage B** — the full conversion, with `game/ui` in the ratchet.
7. **The harvesting track**, after question 2 above is answered.

**What I would not do:** build any of A.6 before B.0. It is an hour's difference and it is the
difference between building these once and building them twice.

---

## A.6.2, checked against what the data can actually support

Rob's alert list, each against the feed rather than against a guess.

| He asked for | State |
|---|---|
| Lose life / gain life | **Shipped A.6.1.** `Life 40 → 37`, reported as "lost 3". |
| Lose a card, card destroyed, card exiled | **Shipped A.6.1.** `Died · battlefield → graveyard`, `Left battlefield → Exile`. |
| Commander damage | **Shipped A.6.1.** `match-telemetry.mjs` appends `· commander damage` when the source is a commander. |
| **Poisoned** | **Was in the feed and could never be announced.** `GameEventPlayerPoisoned` produces `Poison 0 → 3`, but the row was pushed without its `kind`, and the notice rule keys on `kind`. Fixed by sending `kind` and `phase` on that push — which also stops the history detail line calling every one of those rows "table event". |
| **Draw a card** | **Was deliberately dropped.** `if(from==='Library'&&to==='Hand')continue;` kept an opponent's card secret and hid *your own* draw from you. Now kept for the viewer only; an opponent's drawn card is not in `known`, so it cannot be named by accident. |
| Attack declared against you | **Covered better by A.6.4.** The declare-blockers panel now shows the attacking cards and the damage. A separate notice on top of it would be noise. |
| **Card exiled with a return condition** | **Cannot be done yet — needs the card's text.** Nothing in the event stream says an exile is conditional; that lives in the exiling card's oracle text. |
| **A card whose mechanic triggers off other players** | **Cannot be done yet — same reason.** Knowing a card triggers on what other players do means reading its triggered abilities. |

### The last two are the harvesting track's first customer

Both need a machine-readable answer to *"what does this card actually do"* — which is exactly what
Rob's card extraction skill produces:

> "we need to write a card extraction skill that the AI API executes as part of the API pilot."

So the two alerts that cannot be built today are not blocked on the board at all. They are the
first thing the extracted card knowledge would be **read** by, rather than only written to. Worth
knowing when that track is specified: it has a consumer on this side already waiting.

---

## What today's limits actually are, against PR #305

**Rob, 2026-09-21:** *"Take note of PR #305 when you articulate what we can't do today, but what we
can do when we build and change engines."*

[#305](https://github.com/minorrob/mtg-deck-matrix/pull/305) is the merged plan to deprecate Forge
for CrankMagic's own Commander rules engine (`docs/engine/PLAN.md`). Read against it, **every limit
this board work hit is a property of the Forge adapter, not of the product** — and each one has a
named answer in that plan.

| Can't do today | Why | What #305 changes |
|---|---|---|
| Report more than **nine keywords** | `ForgeProbe.java:241` hand-lists flying, reach, trample, first strike, double strike, deathtouch, lifelink, infect, wither. Menace, protection, indestructible, shadow and fear never leave the engine. Widening it is a Java change and a rebuild. | §3.4: `CrankCardScript@1` carries `abilities[]` of kind `keyword` **per card**. There is no hand-maintained list to fall behind, because keywords are card data rather than adapter data. |
| Alert on a **card exiled with a return condition** | Nothing in the event stream says an exile is conditional. That lives in the exiling card's oracle text. | §3.4: `effects[]` are named primitives with typed parameters and `until` durations. A conditional exile is *expressed*, so it can be read. |
| Alert on **a card whose mechanic triggers off other players** | Same: knowing an ability watches other players means reading its triggered abilities. | §3.4: `abilities[]` includes `triggered`, each with `condition` and the `text` it implements. |
| Know **what a card exposes to whom** | The projection's hidden-information rules are enforced by hand and checked by `HiddenSelectionCheck`. | §3.4: `reveals` states what each card's effects expose, "so the projection can be checked". |

### The card extraction skill and #305's compiler are the same thing

Rob asked for *"a card extraction skill that the AI API executes as part of the API pilot"*. §3.4
already specifies that mechanism:

> **Model compiler** (`game/tools/engine-compile.mjs`), the default. It calls the Claude API with
> the schema as a tool definition, the oracle text, the parser's pre-pass result and the primitive
> catalog, and receives a script.

**So the extraction skill should emit `CrankCardScript@1`, not a format of its own.** Building a
separate representation of "what this card does" for the pilot would create a second vocabulary
that the engine work then has to reconcile — and reconciling two card-semantics formats across a
30,000-card pool is exactly the kind of debt this plan exists to avoid.

Written as a subset of the engine's schema instead, the same artifact serves three consumers:

1. **Today** — the API pilot reads it to play a card Forge cannot pilot well.
2. **Today** — the board reads it for the two alerts above.
3. **Later** — the engine executes it, with no migration.

That also fits the order Rob set: #305 starts only once Track V is live and games are fully
operational (§1.1), and Rob confirmed on 2026-09-21 that the board redesign belongs *after* the
engine work. The extraction skill can begin before either, provided it writes the engine's schema.

**One caveat worth keeping honest:** §3.4's compiler is validated, smoke-tested and
differential-checked against Forge before its output is trusted. A skill that writes the same
schema without those gates is producing unverified card semantics. Whatever the pilot consumes
first should carry the same validation, or be explicit that it is advisory only.
