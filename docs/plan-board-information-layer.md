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
2. **What Forge does with it.** Forge's own "AI can't play these cards well" list comes from the
   card's script. Our harvested note only helps if something consumes it — the API pilot can, since
   it reasons in text; the native Forge AI cannot without a script. **That distinction decides the
   whole feature's value and should be settled first.**
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
