# CrankMagic design system, r4

One system, three skins. Sapphire & Obsidian is the governing skin, dark by default with a light register. Bronze & Basalt and Chalk & Coal are skins of the same system: they change colors and nothing else.

Source: the live app on 2026-10-25 (crankmagic-design.css v26, crankmagic.css v299), the UX walkthrough's design system inventory, and the UX guidebook (G1 to G12). Every hex in `tokens/` and `design-systems/` is generated from `../build/spec.py`. Edit the spec and run `build/build_all.sh`, never the CSS.

## Why r4

The r3 skin had four themes that were really four brands. Moss & Iron, Brass & Slate, Felt & Cream and Steel & Cobalt each changed the corner radius, the shadow, the motion and, for Moss & Iron, the display face and its case. A component could not look the same twice.

The palettes also spent the accent on a hue the app already used for something else. Brass sat next to the money gold. Moss and Felt used the same green as "in the box". Cobalt sat next to "ordered" blue. So "press this" could be read as a status, and the buy list's 46 green Bought buttons looked like 46 cards in the box.

And the values did not deliver the three planes the comments describe. Raised controls sat at 1.12 to 1.23:1 on their panels, dividers at 1.35 to 1.51:1, two accents could not carry their own text (3.86:1 and 3.98:1), and the type scale said 14px while the page set 11, 12 and 13.

## What stays

- Three planes: ground, panel, raised control. A control is lighter than its panel.
- One primary per screen. Accent means press this, money means answer this, required means you missed this. Three hues, never one.
- The ten status rungs and what they mean, each with a word and a glyph as well as a hue (G9).
- Self-hosted faces only. No font CDN at runtime.
- The token names (`--color-*`, `--st-*`, `--radius-*`, `--space-*`, `--text-*`, `--font-*`, `--display-*`, `--motion-*`), so the swap is a token change.
- Mana symbols at their Scryfall hues.

## The palette: Sapphire & Obsidian

A wizard's table at night: obsidian and iron, a sapphire set in the hilt, gold on the scales, parchment by day. It takes its colors from the five mana colors and gives each one exactly one job, so nothing on the screen can be mistaken for anything else:

| Color | Mana | Job |
|---|---|---|
| Sapphire | blue | Press this. The one primary button per screen, and nothing else. |
| Gold | (treasure) | Money and decisions: prices, budgets, to buy, a choice the app is waiting on. |
| Crimson | red | You missed this: required fields, remove, danger, errors. |
| Emerald | green | You own it: in box, physical, pull, reserved. |
| Obsidian | black | The ground the table sits on. |

White mana is the ink and the light register's parchment. "Ordered" takes an aether teal and the focus ring takes a lighter aether, so neither can be read as the blue button. The fills are saturated jewels with white words on them, never pastel tints.

| | Dark | Light |
|---|---|---|
| Ground, panel, raised | `#090c12` `#15181f` `#2b2f36` | `#f2ece1` `#fffaee` `#ffffff` |
| Line, strong line, field line | `#373b42` `#4e535a` `#7c8089` | `#cfcabf` `#b3ada3` `#858076` |
| Ink, muted, faint | `#f3f0e9` `#b1b6bf` `#82868f` | `#11161f` `#5f5a51` `#858076` |
| Accent, on-accent | `#3066d1` `#ffffff` | `#1043a8` `#ffffff` |
| Money, required, aether | `#f2bb3b` `#ed4546` `#69d6ef` | `#905c00` `#8b000b` `#006c97` |
| Owned, ordered, on-required | `#4ed275` `#00a4b1` `#090b0f` | `#007f38` `#0698a4` `#ffffff` |

The measured results, all generated (see `contrast/sapphire-obsidian.html`):

- White on the sapphire button: 5.32:1 dark, 8.79:1 light. The `--accent-fill` darkening patch is retired.
- Words on the crimson danger fill: 5.20:1 dark, 9.99:1 light. `--color-on-required` is new: the dark register's crimson is bright enough to be read as text on the ground, so its fill takes dark words.
- Muted text: 8.72:1 on the dark panel, 6.57:1 on the light panel, and 4.5:1 or better on ground, panel and raised in both registers.
- Dividers: 1.74:1 on the dark ground, 1.39:1 on the light ground. The strong line is 2:1 or better.
- Raised controls: 1.32:1 on the dark panel. In the light register a white control on a near-white panel cannot reach 1.3:1 by fill without graying the page, so the control's field line carries the plane at 3:1 or better.
- Every pair in the table passes, 74 of 74, across both registers.

`palette-directions.html` shows the three directions that were measured: Sapphire & Obsidian (picked), Bronze & Basalt (kept as a skin) and Gilt & Iron (rejected: a gold button shares its hue with the to-buy rung and every price, and moving money to blue to fix that breaks the one meaning every fantasy player already knows, gold is treasure).

## Skins

A skin is one `colors.css` with a dark block and a light block. It defines every `--color-*`, `--mana-*` and `--st-*` token, and nothing else. Status, money and required keep their hues in every skin, so green means the same thing whichever skin is on.

- **Sapphire & Obsidian** (`tokens/colors.css`). The default. Cold black stone by night, parchment by day.
- **Bronze & Basalt** (`design-systems/bronze-basalt/`). A dwarven hall: warm basalt neutrals and bronze-tinted lines, the same five jobs on the same hues. Vellum by day.
- **Chalk & Coal** (`design-systems/chalk-coal/`). The high-contrast skin: every text pair at 7:1 or better, lines at 2:1 or better. For a TV across the room and for anyone who wants XAG 102's high-contrast mode.

## The warm table

On 2026-10-25 Rob shared a concept of the Play screen, "Concept B · Table Companion" (`reference/concept-b-table-companion.webp`), and said he likes how it feels to imagine using the app if it looked like that. The template takes the reasons it feels warm and leaves its colors, because players take their commander's colors as their own and the frame should not pick one. `guidelines/warmth.html` has the reference annotated and the ten principles:

1. **A place, not a page.** Play sits on the Study: walnut under a lamp, shadowed at the edges, each seat on charcoal felt.
2. **Warm light, neutral chrome.** Warmth comes from wood, brass, parchment and light. No mana color owns the frame; color arrives with the cards.
3. **The name stays ours; brass is the table's metal.** CrankMagic keeps its own wordmark and gear logo, unchanged. The reference's gold lives on as brass rings on the table, never as a value.
4. **Two voices of type.** Roman capitals name things; a warm sans does the work.
5. **People at the table.** A portrait in a brass ring, a name, a big life total. The portrait is the commander's art.
6. **The cards carry the color.** Show art wherever a card is named.
7. **Say what happens before it happens.** The task as a sentence, the step, the pick, the consequence, two buttons.
8. **The table can always be reclaimed.** Drawers fold to a labeled tab; a decision is never hidden.
9. **Soft depth, few lines.** Soft shadows, 1px light lines, 12 to 16px corners, generous padding.
10. **Quiet status in the margins.** Seats, settings and the clock sit small at the edges.

## Type

One display face and one body face for every skin, both from the reference, both SIL OFL 1.1 and self-hosted. Four weights in all.

- **Display**: Cinzel 600 at .04em: roman capitals that name places and things. Every page title, the deck title and the landing hero. Sentence-case text sets as capitals and small capitals.
- **Body**: Lato 400 and 700. Everything that is read, chosen or counted: body, h2 and h3 (700), section titles (700, spaced capitals with an icon), controls, figures, the HUD.
- **Callout**: Barlow Condensed 800 italic, only for the neon callout word over the table. It is the table's one expressive face, never page type.

- **Wordmark**: the app's own CrankMagic mark, unchanged: the Oxanium subset in aether with its sheen, beside the gear logo. It sets the app name and nothing else. Cinzel is a typeface in the system, never the name on the app.

Satoshi and Young Serif are retired, and so are Barlow Condensed's 600 and 700 faces.

The scale, as tokens:

| Token | Value | Use |
|---|---|---|
| `--text-hero` | clamp(36px, 24px + 3vw, 56px) | Cinzel hero: the deck title, the landing |
| `--text-h1` | clamp(30px, 22px + 1.25vw, 40px) | every page title, in Cinzel |
| `--text-h2` | 24px | section titles, Lato 700 |
| `--text-h3` | 18px | panel titles |
| `--text-figure` | 32px | cost to finish and other big numbers |
| `--text-reading` | 16px | deck guide, help, how it plays |
| `--text-body-size` | 14px | UI body and controls |
| `--text-small` | 13px | captions |
| `--text-label` | 12px | uppercase labels at .12em; the smallest size anywhere |
| `--text-hud-vital` | 28px x HUD scale | life, poison, turn |
| `--text-hud` | 18px x HUD scale | HUD text |
| `--text-hud-caption` | 15px x HUD scale | zone captions on the board |

The h1 contradiction is fixed in one place: `--text-h1` holds its own clamp, and every screen h1 rule reads it (the token test now fails on any h1 with a literal size). The body size is named `--text-body-size` in the handoff too, so `--text-body` is only the body color alias.

## Shape

Stated once. Skins never override it.

- Radii: control 8px, card 12px, tile 16px, pill 999px.
- Lines: 1px `--color-line` between rows and around panels; 1px `--color-line-strong` for a section break and the secondary button edge; `--color-field-line` around anything you type into or tick. No hairline under 1px.
- Heights: buttons 40px (44 for the touch primary), compact 32px, inputs 42px, checkboxes and radios 20px.
- Focus: a 2px aether ring, 2px out, on every focusable thing.
- Motion: 160ms on `cubic-bezier(.2,.8,.2,1)`. Tiles lift 3px on hover, no rotation. Reduced motion turns it off.

## Components

Every component is drawn in every state: rest, hover, focus visible, active, disabled, selected and danger, in both registers.

- `guidelines/controls.html`: primary, secondary, quiet, danger and compact buttons; pills and status chips; the stage chips (All, Boxed, Defined, Building, Playable, Shared); inputs, checkboxes, radios, the segmented control and the select.
- `guidelines/components-navigation.html`: tabs.
- `guidelines/components-tile-row.html`: the deck tile and the table row with trailing actions.
- `guidelines/components-surfaces.html`: the 900px dialog with a sticky title and its one primary bottom right, the side sheet, the toasts (success with Undo, error with dismiss) and the account menu with its groups and its danger group.
- `guidelines/play-surfaces.html`: the table companion (both drawers around the table), the Study, the drawer with its collapse tab in every state (left, right, bottom; open, hover, focus, collapsed with its name and count), the seat header, the center decision slot, the HUD text scale, the Camera menu and the neon callout.
- `guidelines/warmth.html`: the reference, annotated, and the ten principles with the template's answer to each.

Two rules hold across all of them:

1. **Selection is not the accent.** A selected chip, tab, segment or checkbox inverts to ink. The accent stays the only press-this on the screen.
2. **Over art, the poster pair.** Words and chips over commander art or the table use fixed values that do not change with the skin, because the art does not.

## Play

The 3D, Table and Focus views share one seat header, one decision, one HUD text scale (100, 125, 150, 200 percent) and one Camera menu, all set on the Study. The Actions drawer on the left holds the decision: the spell, the task as a sentence, the step, the pick, what happens if it resolves, one primary and one way back, then the seats and what the decision can do at each. The Stack drawer on the right holds what is waiting and the history, each line with its card's art. Both fold to a tab at the screen edge; with Actions folded the decision shows in the center slot, so it is never hidden. On a phone the drawers become bottom sheets with the same tab. The neon callout stays the one expressive element. Whose turn it is shows as an aether ring on the seat's portrait; who has priority shows as an aether-dot chip. Low life turns the vital to harm red and keeps the word.

## Status

The ten rungs keep their names and meanings. The screen shows four hue families and a gray:

| Family | Rungs | Hue |
|---|---|---|
| Owned | in box, physical, pull, reserved | emerald, two lightness steps |
| Coming | ordered | aether teal |
| Needed | to buy, stand-in (hatched) | the money gold, two steps |
| Out | remove | the required crimson |
| Intent | watch, draft | gray, two steps |

Each rung has its own glyph: filled disc, filled square, ring with a dot, ring with a bar, arrow, hollow ring, hatched square, cross, dashed ring, dotted ring. Emerald and crimson sit at different lightness, but for a deuteranope the glyph and the word still carry "in box" against "remove", and in Chalk & Coal's dark register emerald and teal come close for a tritanope (ΔE 0.055). That is by design under G9 and is checked in `guidelines/colors-status.html` in grayscale.

## Files

- `styles.css` imports `tokens/fonts.css`, `tokens/colors.css`, `tokens/typography.css`, `tokens/shape.css`, `tokens/table.css`.
- `design-systems/<skin>/styles.css` swaps in that skin's `tokens/colors.css`.
- `components.css` holds every component; `glyphs.js` the status glyphs and icons; `skin.js` reads `?skin=` and `?theme=` for the frames.
- `guidelines/*.html` are the specimen cards, `frames/*.html` the five frames, `contrast/<skin>.html` and `.csv` the generated tables.
- `../renders/` holds every frame in every skin and register at 1440 and 390, and the Decks hub before and after.
- `reference/` holds Rob's concept image.
- `../pr/` is the change for the app: `apply-r4.mjs`, `fonts/` (Cinzel and Lato, copied into `assets/crankmagic/`), the new `tests/design-tokens.mjs` and `tests/type-final.mjs`, the review diffs and `CHANGELOG-tokens.md`.

## Open after this PR

- The page layer still sets 152 font sizes under 12px and about 110 literal radii. The tokens are right; a sweep that maps them to `--text-label` and the four radii is the next PR (`../pr/CHANGELOG-tokens.md` has the mapping).
- The settings page lists six theme cards (three skins in two registers). A skin picker plus a Dark, Light, System control is the better shape and needs a small UI change.
- The live Play screen does not have the drawers yet. The components and the table companion specimen are the spec; building them into `crankmagic-stage.css` is its own change.
