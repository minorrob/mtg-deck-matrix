CrankMagic is a Commander workshop: plan a hundred, own the cards, bring the deck to the table. This system is one set of tokens and components with three skins. Sapphire & Obsidian is the default; Bronze & Basalt and Chalk & Coal change colors only. Pick a skin and register with the theme switch: `dark`, `light`, `bronze-dark`, `bronze-light`, `chalk-dark`, `chalk-light`.

## Content fundamentals

- Write plain, declarative sentences in the owner's voice: "Buy the 13 cards still missing." "No games logged yet." "Lock the list when it is settled."
- Name actions as verbs, with the count when there is one: "Buy list · 13", "Put it in the box", "Log a game".
- Use sentence case everywhere, headings and buttons included. Uppercase only in `label` eyebrows and drawer section titles; Cinzel makes its own capitals.
- Say what happens before it happens: name a decision as a sentence ("Choose up to two players to mill"), show the step, and write the consequence out ("If it resolves: each target player mills three cards.").
- One word per thing on every surface: deck, list, box, table, seat. Deck names drop the D-number in headings ("Krenko, Mob Boss"); the number rides in the eyebrow ("D6 · Krenko").
- No exclamation marks, no emoji, no instructional paragraphs where a label or a default would do. A `?` button only where CrankMagic is distinct.
- American spelling.

## The warm table

The template is built to feel like sitting down at a table, from Rob's reference "Concept B · Table Companion". Ten principles hold on every screen:

1. A place, not a page: Play sits on the Study, walnut under a lamp, each seat on charcoal felt.
2. Warm light, neutral chrome: warmth comes from wood, brass, parchment and light. No mana color owns the frame; color arrives with the cards.
3. The name stays ours: the CrankMagic wordmark and gear logo, unchanged. Brass is the table's metal, never a value.
4. Two voices of type: Cinzel names things, Lato does the work.
5. People at the table: a portrait in a brass ring, a name, a big life total.
6. The cards carry the color: show art wherever a card is named.
7. Say what happens before it happens: task, step, pick, consequence, two buttons.
8. The table can always be reclaimed: drawers fold to a labeled tab; a decision is never hidden.
9. Soft depth, few lines: soft shadows, 1px light lines, 12 to 16px corners.
10. Quiet status in the margins.

## Color

**Three planes.** Put the page on `color-bg`, groups on `color-panel`, and anything you press or type into on `color-raised`. A control is always lighter than its panel. In the light registers a white control cannot step off a near-white panel by fill, so give it its `color-field-line` edge.

**Five colors, five jobs.** The palette comes from the five mana colors, and each color has exactly one job. Sapphire (blue) is the button, gold is money and decisions, crimson (red) is what you missed, emerald (green) is what you own, obsidian (black) is the ground. White mana is the ink.

**Three signals, three hues.**
- `color-accent` means press this. Use it for one primary action per screen, the next stage of the journey, with `color-on-accent` words. Never for a status, a selection or a decoration.
- `color-money` means answer this, and money. Prices, budgets, and a panel the app is waiting on (`color-decision-bg`, `color-decision-line`, `color-decision-ink`).
- `color-required` means you missed this. Required fields, errors, destructive actions. A filled danger button takes `color-on-required` words.

**Selection is ink.** A selected chip, tab, segment or checkbox inverts to `color-ink` with `color-bg` words. That keeps the accent the only press-this on the screen.

**Lines.** `color-line` between rows and around panels, `color-line-strong` for a section break and the secondary button's edge, `color-field-line` around inputs and checkboxes. Every line is 1px.

**Status.** Ten rungs in four hue families and a gray: owned (`st-inbox`, `st-physical`, `st-pull`, `st-reserved`), coming (`st-ordered`, aether teal, never the button's sapphire), needed (`st-buy`, `st-standin`), out (`st-remove`), intent (`st-watch`, `st-draft`). Every status shows its word and its glyph; the hue is the third channel, not the only one.

**Mana.** The `mana-*` tints color a deck's surfaces from its commander's identity, mixed about 22% into `color-panel`. The symbols themselves are the app's SVGs in the Mana group, at their own hues in every skin.

**The table and the poster.** Words over commander art use `poster-ink` on a gradient that ends at `poster-ground`. The board uses `mat-scrim`, `mat-ink` and the `callout-*` lights. These do not change with the skin, because the art and the table do not.

**Skins.** Each skin sets every color token and nothing else.

{{SKIN_TABLE}}

Every text pair in every theme meets 4.5:1 (7:1 in the Chalk & Coal themes); edges, the focus ring and status marks meet 3:1; `color-line` meets 1.3:1 on ground and panel.

## Type

- Two voices. `display` is Cinzel 600 at .04em, roman capitals that name places and things: page titles (`h1`), the deck title and the landing headline (`hero`). `body` is Lato: section titles (`h2`) and panel titles (`h3`) at 700, everything else at 400.
- In a drawer or panel head, title the section in spaced capitals with an icon (`cm-section-title`: Lato 700, 14px, .14em).
- Set UI text in `body` (14px), reading surfaces in `reading` (16px), captions in `small` (13px, `color-muted`), eyebrows in `label` (12px uppercase, .12em). Nothing goes under 12px.
- Set big figures in `figure` (Lato 700, tabular), in `color-money` when they are money.
- On the board use `hud-vital`, `hud` and `hud-caption`, each times `--hud-scale` (1, 1.25, 1.5, 2). The `callout` face (Barlow Condensed 800 italic) is for the neon callout word only.
- The CrankMagic wordmark is the app's own mark, unchanged: the Oxanium subset (`wordmark`) in `color-aether` with a light sheen (`cm-wordmark`), beside the gear logo. Do not set other words in it, and never set the app name in Cinzel.

## Shape, space and motion

- Radii: `radius-control` (8px) for buttons, inputs and menu items; `radius-card` (12px) for panels, dialogs and menus; `radius-tile` (16px) for deck tiles; `radius-pill` for chips and the seat header.
- Heights: `control-height` 40px, `control-height-lg` 44px for the touch primary, `control-height-compact` 32px, `field-height` 42px, `check-size` 20px.
- Space in steps of 4: `space-1` to `space-12`. Panels pad `space-5`; dialog bodies `space-6`; page gutters `space-8` at 1440 and 16px at 390.
- Focus: a 2px `color-aether` ring, 2px out, on everything focusable. Never remove it.
- Motion: 160ms on `cubic-bezier(.2,.8,.2,1)`. Buttons change fill, tiles lift 3px. No rotation, no bounce. Reduced motion turns it all off.
- Shadows: `shadow-card` under panels, `shadow-pop` under menus, dialogs, sheets and toasts. Dark themes rely on the fill steps, not the shadow.

## Imagery

- Commander art is the hero of a deck tile: full bleed, 3:4, under a gradient to `poster-ground`. The Art group holds sample art crops for previews; in the app they come from Scryfall.
- The physical card, tilted a few degrees, heads the deck page.
- The default table is the Study: `table-wood` with `table-grain`, lit by `table-light` and falling into `table-shade`, each seat on `table-felt` (`cm-study`, `cm-mat`). It is drawn from noise, so there is no file. The felt is charcoal on purpose: no mana color owns the table, because players take their commander's colors as their own.
- Playmats are Rob's own artwork (the Mats group); a player can choose one in place of the Study. Words that cross them sit on `mat-scrim`.
- A seat's portrait is its commander's art in a `table-brass` ring (`cm-portrait`).

## Iconography

- Mana symbols: the app's own SVGs (Mana group), never redrawn.
- Status glyphs, one shape per rung: filled disc (in box), filled square (physical), ring with a dot (pull), ring with a bar (reserved), arrow (ordered), hollow ring (to buy), hatched square (stand-in), cross (remove), dashed ring (watch), dotted ring (draft).
- UI icons: 16px on a 16-unit grid, 1.75 stroke, round caps, `currentColor`. An icon sits beside a word; an icon alone has an accessible name and a tooltip.
- No icon font and no emoji.

## Play

The 3D, Table and Focus views share `SeatHeader`, `DecisionSlot`, `HudScale` and `CameraMenu`, on the Study. `Drawer` holds the decision on the left (the spell, the task as a sentence, the step, the pick, what happens if it resolves, one primary and one way back, then the seats) and the stack and history on the right. Each drawer folds to its tab at the screen edge and keeps its name and a count; with the Actions drawer folded the decision shows in `DecisionSlot`, so it is never hidden. On a phone a drawer is a bottom sheet with the same tab. `NeonCallout` stays the one expressive element. Whose turn it is shows as an aether ring on the seat's portrait; priority as an aether dot. Selection on the table is ink: a white ring and a check.
