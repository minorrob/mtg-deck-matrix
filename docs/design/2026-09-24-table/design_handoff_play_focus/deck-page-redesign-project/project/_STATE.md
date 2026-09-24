# CrankMagic redesign — session state

## Next
Handoff pack complete + DELTA-play-and-implementation.md and IMPLEMENTATION-GUIDE.md (README with extrapolation guide + Play 2b summary; screens; wireframes turns 1–4; design system; table-sea.js). Open items: a real land icon; which wireframes to take hi-fi next (2b Play lobby is the obvious first).

## Decisions (locked)
- Play lobby: 2b table-first is the working direction; centre disc = table state + Launch; mat background cycles randomly through all six elements (table-sea.js).
- Direction: Gallery (1a). Bench retired.
- Dark = Brass & Slate, Light = Felt & Cream. Display face Young Serif (400), body Satoshi. Radius 12px controls.
- Aether mist stays on the wordmark (aether.js).
- Every card row shows mana symbols; colorless uses Scryfall {C}; lands wear a land mark (placeholder "L" disc until Rob supplies an icon).
- Design systems saved: root (CrankMagic), design-systems/felt-cream, moss-iron (Barlow Condensed), steel-cobalt (Young Serif).

## Source map
See github.md. Repo minorrob/mtg-deck-matrix@main; deck page = crankmagic-decks.js, library = crankmagic-collection.js, explore = crankmagic-discover.js, shell = index.html + crankmagic.css.
