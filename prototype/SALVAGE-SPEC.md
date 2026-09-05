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

---

## Addition 3 — replace the "no current role" subtext with the deck and rung

Today every Bench tile reads the same dead sentence:

    Owned, unassigned — no current role in the six live decks.

That is only true for cards in no ladder at all, and it wastes the line for every
card that *is* part of one. Replace it with where the card sits in the ladders:

| Case | Subtext |
|---|---|
| Card is a rung candidate in one deck | `D1 · Fun` |
| Candidate in several decks | `D1 · Fun · D3 · Max` |
| Currently slotted somewhere | `D1 · Enhance · in deck` |
| Genuinely in no ladder | `No role in any of the six decks` |

Resolve by matching the card name against every plan's ladder via
`SlotModel.deckSlots(...).rungs[]`. Keep the dead sentence only for the true
no-match case, where it is actually informative.

## Addition 4 — rarity as a mild outline on every card tile

Applies everywhere a card tile is drawn: Bench, the rung rail, the Shop gallery.

**Correction to the brief:** "legendary" is not a rarity in Magic, it is a supertype.
A mythic can be non-legendary and a common can be legendary, so it cannot share the
scale. Scryfall's `rarity` field is `common | uncommon | rare | special | mythic | bonus`.
The requested escalation maps onto it as:

| Rarity | Outline | Note |
|---|---|---|
| `common` | `#d8cfba` | the current neutral outline, unchanged |
| `uncommon` | `#7f9c85` | muted sage |
| `rare` | `#6f8fa8` | muted slate blue |
| `special` | `#8d7fa6` | muted lavender — Timeshifted, Mystical Archive |
| `mythic` | `#c19a4e` | muted gold |
| `bonus` | `#d9b45c` | brighter gold — Masterpiece / Expedition / Invocation |

Deliberately desaturated: these sit behind card art on a parchment surface and are
meant to read as a hint, not a highlight. Outline only — never a fill, never text color.

Legendary gets its own small marker (a crown glyph on the tile corner) rather than
taking a rarity color, since for a Commander player it is worth seeing separately.

`data/cards.json` currently carries `rare 740 · uncommon 446 · common 297 · mythic 202`
and 69 nulls; a null rarity falls back to the common outline.
