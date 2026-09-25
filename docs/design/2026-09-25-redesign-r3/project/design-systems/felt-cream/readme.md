# Felt & Cream — CrankMagic design system

Light-first: cream ground like a playmat, felt green action, terracotta for cost. Dark mode is the felt.

Source: the CrankMagic app, github.com/minorrob/mtg-deck-matrix (main). Logo, Satoshi webfonts and mana symbols are copied from its `assets/`. The palette was chosen from the Turn 3 palette study in this project (Palette Options.dc.html) and applied to the Gallery screens (Gallery Decks / Deck Page / Explore .dc.html).

## Content fundamentals
- Plain, declarative sentences in the owner's voice: "Buy the 13 cards still missing", "No games logged yet." No exclamation marks, no emoji.
- Every figure appears once and wears its status color; the figure is the legend.
- One primary action per view, named as a verb with its count ("Buy list · 13", "Add 2 now").
- Deck names drop the D-number prefix in headings ("Krenko Goblins"); the number rides as a small eyebrow.

## Visual foundations
- **Color.** Default theme is light; add `data-theme="dark"` on the root for dark mode. Ground → panel → raised control are three planes; the action accent is the only thing that asks to be pressed; the aether blue lives in the logo mist; money reads in its own hue. Each deck's surfaces take a tint from its commander's color identity (`--mana-*`). Status is one hue per rung everywhere (`--st-*`); substitutes are hatched over the bar.
- **Type.** Satoshi throughout. Headings and big figures in Satoshi Black (900, tracking -.035em, tabular numerals); body Satoshi 14px/1.5; labels 11px uppercase, .08em tracking. Young Serif is reserved for hero headlines 48px and up (landing hero, deck-page title, closing CTA) — nowhere else.
- **Shape.** Control radius 14px; cards 1.5×, tiles 1.8×; chips are pills. White card on cream, soft paper shadow. Art sits in a white card frame with a thin tint border, like a sleeved card on the mat.
- **Art.** Commander art is the hero: full-bleed on deck tiles behind a gradient toward the deck tint; the physical card, tilted, on the deck page; a square-clipped thumbnail beside the pane on Explore.
- **Motion.** Cards slide and settle (spring); nothing glows. Reduced-motion turns all of it off.
- **Aether mist.** Dusk blue on cream, behind the wordmark. (aether.js in the project root ports the app's canvas animation.)
- **Hover / press.** Hover lifts (translateY −1 to −6px) or fills with the raised plane; press returns to rest. Focus ring 2px in the aether color.

## Iconography
Mana symbols are the app's own SVGs (`assets/mana/*.svg`). Status is a dot; no icon font. Unicode glyphs only for carets and the ⋯ menu.

## Index
- `styles.css` → `tokens/colors.css`, `tokens/typography.css`, `tokens/shape.css`, `tokens/fonts.css`
- `guidelines/*.html` — specimen cards (Colors, Type, Components)
- Screens in this system: Gallery Decks.dc.html, Gallery Deck Page.dc.html, Gallery Explore.dc.html (project root)
