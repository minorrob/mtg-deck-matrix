# Bench (was Salvage) — destination chooser spec

Deferred out of the prototype; build this in the app. It inherits the existing
salvage card-detail layout (card image left, chooser right) and adds two things.

## Existing behavior to keep

- Card image, price/ceiling, "Already owned · this option costs nothing to test"
- **Best compatible destination per deck** as a `<select>`, one option per deck
- Deterministic reason chips: Commander legality + colors, role match, card type,
  mana value delta, physical availability, whether the swap covers an unowned card
- `Assign · replace <card>` action

## Addition 1 — rung tagging on each destination

If the card is already a known rung candidate for the target slot, the option must say so.

    Deck 1 · S21 · slots as ENHANCE · replace Carven Caryatid · Strong fit 82
    Deck 3 · T15 · ad-hoc transfer · replace Llanowar Scout · Strong fit 87

Rung is resolved by matching the card name against `plan[arrayKey][].name` for the
slot's ladder. No match = `ad-hoc transfer`, which is a real distinction: a rung
assignment is part of the deck's designed ladder, a transfer is a loan.

Render as a chip alongside the other reason chips, `.tag.rung`.

## Addition 2 — status of the card being replaced

The single most important missing fact: am I displacing a card I already own, or
covering one I still have to buy? Show the replaced card's state and the consequence.

| Replaced card | Chip | Consequence line |
|---|---|---|
| `● In hand` (sleeved) | In hand | Frees a physical card — it moves to the Bench |
| `⧖ Ordered` | Ordered | Already paid for; it will arrive with no slot |
| `○ To buy` | To buy | **Saves $X.XX** — you no longer need to buy it |

The third case is what the existing fit score already rewards as "Covers an unowned
active card"; this surfaces the money instead of burying it in a score.

Also show the destination deck's remaining buy count so the trade is in context
("35 target purchase items still needed").
