# Slot Ladder — collapse prototype

Interactive shell for collapsing **Calibrate + Shop + Decks + Cards** into two pages:
**Deck** (keyed by deck + slot) and **Shop** (keyed by card name, merged across decks).

Open `slot-ladder.html` directly in a browser. Fake data, real interactions. Nothing here
is wired to `app.js` yet — this is the sign-off artifact for the redesign.

## The model

A deck is ~100 **slots**. Each slot is a ladder of candidates chained by `replaces`
(already how `lineup-model.js` works). A slot narrows:

| Stage | Slot #72 is | Cardinality |
|---|---|---|
| Deck defined | any card from any of its 5 variants × 5 rungs | 1 of 25 |
| Variant chosen | Base · Tuned · Enhance · Fun · Max | 1 of 5 |
| Calibrated | one card, the other four still one click away | 1 |

## What the shell demonstrates

- **Drill sideways** — a slot expands in place into its rungs *plus* owned cards that fit,
  each badged with where the physical copy is. The rail stays open after a pick.
- **Five location states**, carried by glyph shape, not hue:
  `● In deck · ◆ In D3 · ◇ Bench · ⧖ Ordered · ○ To buy`
- **Cross-deck pull** — taking a card from another deck really punches a hole there.
- **Bench round-trip** — sending a pick back drops the slot to its predecessor rung (or an
  explicit hole); the Bench panel lists every unassigned owned card and the slots it fits.
- **Per-rung rationale** — the Base thesis ("what this slot does") is always shown, plus
  why the selected rung beats the other four.
- **Shop** — Table ⇄ Gallery, group-by applied in both, sortable columns with group bands,
  multi-select filters on Status / Color / Type / Price band / Rarity / Where / Deck,
  and a three-state `Need · Ordered · In hand` control per row.
- **Price bands are vendor drawers**: `<$1 · $1 · $2 · $3 · $4 · $5 · $6 · $7–15 · $15+`,
  always listed whether or not anything is in them.

## Known model changes this implies

- `found` + `boughtQuantities` → `owned[key] = {inHand, ordered}`
- `liveSalvage` → `bench`, promoted to a first-class panel
- One filter engine for both views (retires `shop-filters.js` and its separate storage)
- `Load Active` must gain a **Merge purchases** sibling that unions ownership only —
  today a full replace silently wipes in-person marks.
