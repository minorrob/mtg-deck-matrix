# Phyrexian mana: the payment choice (ROB-326)

Status: written before the build, 2026-10-31. Lane: Claude · Engine (rules and the view). The board half is Codex · Play and
needs no new field (see *What the board does*).

Rob, 2026-10-29: *"Tezzeret's Gambit allows the player to pay 2 life instead of the island mana cost, bringing the mana cost
down from 4 to 3 + 2 life lost. That's not recognized in the game as an option."*

## What was wrong

Measured on main (3ca254f7), real engine, no UI. The payment code was right: `payments()` in `game/engine/rules/mana.mjs` offers
`{U}` and `2 life` for a `{U/P}` (CR 107.4f). What was missing was the cast that **taps for itself** (`castTapPlans`,
`fundingPlans` in `game/engine/rules/actions.mjs`): it left Phyrexian costs "to tapping by hand". So with three untapped Wastes,
or three Wastes and an Island, Tezzeret's Gambit was **not offered at all**; the life way existed only once the player had tapped
the three lands by hand. And Gitaxian Probe beside an untapped Island was offered for 2 life only: the pool's one way, with the
Island never weighed (life chosen for the player).

Not the cause: `data/engine/support.json` (a 2026-10-04 snapshot, every Phyrexian card `unsupported`; read only by the frozen
local host, not by the engine or the room), and the card script (`game/engine/cards/t/tezzerets-gambit.json` is right).

## The flag

`phyrexianTaps: true` in the pod (`game/room/table.mjs`, new matches only), carried into the state by `createState`, `startRoom`
and the scenario runner, as `xTaps` was. A match launched before has no key and offers and replays exactly what it did. The flag
also needs `pooledTaps`.

## The shape

Nothing new on the wire. The existing tap-to-cast shapes carry the life way.

**The offer** (`legalActions`): `{kind: "cast", autoTap: true, payment: {mana, life}, ...}`, one per cast, as for any cast that
taps for itself. `payment` is the first way, **the mana way when there is one** (`life: 0`), else the life way.
`offerDetails` (the table's words for the offer): `tapping what you choose` when more than one way; with one way,
`tapping Wastes, Wastes, Wastes, paying 2 life` (the life is named, never hidden) or `tapping Island, Wastes, Wastes, Wastes`.

**The question** (`awaitingChoice` once the offer is taken, only when more than one way exists), the same question and id as
today's "what to tap for it":

```
id:      choose-cost:<objectId>
title:   "<Card>: what to tap for it"
mode:    "one", min 1, max 1, cost: "mana"
options: [{index, label, taps: [{id, color}], payment: {mana: {W,U,B,R,G,C}, life}, decisionPath: [...]}]
```

* A **life way** is an option whose `payment.life > 0`. Its `label` is the sources then ` and N life`
  (`"Wastes, Wastes, Wastes and 2 life"`); with nothing to tap, `"2 life"` (Gitaxian Probe with an Island: `["Island", "2 life"]`).
* A **mana way** has `payment.life === 0` and `label` the sources (`"Island, Wastes, Wastes, Wastes"`).
* **Order**: every mana way first, then ways by increasing life. Inside a group the least flexible sources first (unchanged).
  So option 0 is never a life way while mana pays; the house pilot answers index 0.
* `decisionPath` ends in a `mana` node whose label is `paymentWords(payment)` (`"{C}{C}{C} and 2 life"`), the same node the
  pool's payment question ends in.
* Sources alike are one way, not several. Two Phyrexian symbols of one color are told apart by how many are paid in life.

**The answer**: `indices: [i]`, as today. The action then carries `tapPlan: <key>`; a life way's key ends in `|life:<colors>`
(`|life:U`). Nothing else changes in `CrankRoomView@1`.

## The rules the engine keeps

1. **Both ways are offered when both are legal.** A way is legal when its mana can be tapped for (sources that need only `{T}`,
   `tapUnits`) and its life is there to pay: a player can pay life only if their total is at least that much (CR 119.4).
2. **Life is never chosen for the player while mana pays.** Where the pool alone would pay a Phyrexian cost in life (nothing
   blue floating) but an untapped source also pays it, the cast taps for itself and asks. Where life is the only way, there is
   no question, and the offer says `paying 2 life`.
3. **Life too low** (below 2 for one symbol): the mana way alone, no question. **Neither** way: not offered, and the refusal
   (`whyNot`) says what is wrong and what to do:
   `Its {U/P} is paid with {U} or 2 life: you have 1 life and nothing untapped makes {U}. Tap a source of {U}, or gain life.`
   When the mana is short too: `It costs 4 mana ({U/P} is paid with {U} or 2 life, and you have 1 life), and you can make 3 now.`
   A cost that 2 life would bring within reach now counts the symbol as life (3 mana, not 4).
4. **Cancel/undo** are as for any cast: nothing is tapped or paid until the way is answered.
5. Cost shapes still left to tapping by hand: `{X}` beyond `xTaps`, `{2/W}`, snow, convoke and affinity with these costs,
   and sources that ask more than `{T}`. These are ROB-339 / ROB-315, not this contract.

## What the board does

The question is the existing "what to tap for it" question and its options already carry `payment` (with `life`) and a
`decisionPath`; the same `{G} or 2 life` pool question has always rendered life. So no board change is asked for. Rendering of the
new option labels in the browser was **not** inspected by this change (engine and room view only); if the cost UI hides the
`and 2 life` part of a label or path, that is a Play-lane defect to file against this contract.

## Proof

`tests/engine-phyrexian-taps.mjs` (engine: Tezzeret's Gambit in each of the four cases above, Gitaxian Probe, Mental Misstep,
Vraska, Betrayal's Sting, the variant maker, the refusals, the AI, a match without the key), `tests/room-phyrexian-payment.mjs`
(the room's view: the cast offered with no blue, the question with its life option, the match replaying), `tests/game-table.mjs`
(the table's pod carries the key).
