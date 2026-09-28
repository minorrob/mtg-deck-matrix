# Appearance: four themes, and a new hero for Decks — the plan

Rob, 2026-09-28: planned here. **A1, the four themes, is built** (Rob said "Execute A1" the same day). **A2, the
hero image, is set aside**: Rob, 2026-09-28, "Forget the image for now. Not important." Section 1 stays as the plan for
when it comes back. The design source is Rob's
`DELTA-appearance-palettes.md` (kept beside this plan in `docs/design/2026-09-28-appearance/`).
Where the two differ, **Rob's words of 2026-09-28 win**: there is no light/dark mode and no
"Match system", only four themes to pick from.

## 1. The Decks hero image

**Today:** the Decks page's hero shows three commander cards fanned (the first three decks' art, or
Krenko, Shadrix and Atraxa when there are no decks; `crankmagic-decks.js`, `fanDecks`).

**New:** Rob's picture replaces them: three leather-bound cards (green leaf, blue compass, red skull)
with a golden burst behind them and rings of colored light around them.

- **Placement:** right-aligned in the hero, in line with the hero's title, text and buttons.
  - Vertically, it is centered on the text block.
  - It is never taller than the hero's text column, so it never pushes the buttons down.
  - On a phone (below 700px) it sits above the title at a smaller size, or it is hidden if it would
    crowd the buttons. That is decided with screenshots at 390px.
- **Size:** about 320px wide on a desktop (roughly a third of the hero), down to 220px on a tablet.
  Aspect ratio is kept, never stretched.
- **Crop:** to the cards, the burst and the rings, dropping the reflection under the rings. That is
  about 700×540 px from Rob's 1280×720, enough for 2x displays at 320px.
- **Transparency — needed from Rob.** Both files Rob sent (`decks-hero-cards.png` 384×214 and
  `decks-hero-cards-1280.webp` 1280×720) have **no transparency**: the gray checkerboard is painted
  into the pixels, so on any theme it would show as a checkered rectangle.
  - **Best:** a re-export with a real transparent background (PNG with alpha).
  - **Fallback:** key out the painted checkerboard. The cards cut cleanly, but the soft glow and
    rings are approximated. Screenshots on all four themes go to Rob before it ships.
- **Delivery:** WebP with alpha, with a PNG fallback; `width`/`height` attributes set so nothing shifts
  while it loads; `alt=""` because it is decoration; a `?v=` pin like every asset.
- **Motion:** none by default. A slow shimmer on the rings is an option only if Rob wants it, and
  never when reduced motion is on.

## 2. Four themes, saved with the profile

**Today:** Settings › Appearance offers Dark · Brass & Slate, Light · Felt & Cream and Match system
(`crankmagic-settings.js`, `THEMES`). The Menu has a light/dark entry. The choice is saved in
`preferences.theme` as 'dark', 'light' or 'system'.

**New:**
- **Four themes, no modes:**

  | Theme | Look | From |
  |---|---|---|
  | **Moss & Iron** | The armory: dark moss and iron, green accent, condensed capitals | the DELTA's Moss & Iron dark tokens (**default for new and unset accounts**) |
  | **Brass & Slate** | Warm graphite, brass accent | today's dark theme |
  | **Felt & Cream** | Card-table felt, cream panels | today's light theme |
  | **Steel & Cobalt** | The forge: steel, cobalt accent, cyan mist | the DELTA's Steel & Cobalt dark tokens |

  - The DELTA's light faces for Moss & Iron and Steel & Cobalt are not used.
  - Felt & Cream is its own theme, not the "light mode" of Brass & Slate.
- **The Menu:** "Switch Light/Dark theme" becomes **"Switch Theme"**, listing the four by name with
  the current one marked.
- **Settings › Appearance:** the four as swatch cards (the DELTA's 140×88 cards: five color bands,
  the accent dot, and the name in the theme's own display face). The current one is ringed.
  Choosing one applies at once: no Save and no reload.
- **Saved with the profile:** `preferences.theme` becomes one of `moss-iron`, `brass-slate`,
  `felt-cream` or `steel-cobalt`. Preferences already live in the library, which syncs with the
  account, so the theme follows Rob to any device.
- **Migration from today's values (decision A1):**
  - `dark` → `brass-slate` and `light` → `felt-cream`, so nobody's look changes under them.
  - Unset → `moss-iron`.
  - `system` → recommend `moss-iron`.
- **What each theme changes, from the DELTA:**
  - the color tokens and the status colors;
  - the corner radius (Moss & Iron 6px, Brass & Slate as today, Steel & Cobalt 4px, "machined");
  - the display face: Moss & Iron uses Barlow Condensed capitals, the others Satoshi Black and
    Young Serif on heroes;
  - card shadow and motion timing;
  - the aether mist color, re-read when the theme changes.
- **Fonts:** Barlow Condensed is needed by the default theme. It is **self-hosted** like Satoshi,
  not loaded from Google Fonts: the security policy stays closed, and it works offline. That
  replaces the DELTA's Google Fonts link (decision A2).
- **Done when:**
  - a new account renders Moss & Iron;
  - switching recolors every page, dialog, menu, toast, the Play board and the mist, with no reload;
  - no stray literal color is left outside the theme blocks (the design-tokens test's hex ceiling
    goes down, not up);
  - each theme's radius, type and motion visibly differ;
  - old values migrate silently;
  - every page is screenshot in all four themes for Rob.

## 3. The user profile page — backlog

Rob wants a profile page later. It is in `BACKLOG.md`, not built now. The theme stays in Settings
› Appearance until then, and moves (or is linked) there when the page exists.

## 4. The PRs

| PR | What | State |
|---|---|---|
| A1 | The four themes: tokens, the migration, Settings swatches, Menu › Switch Theme, self-hosted Barlow Condensed, screenshots in all four | built |
| A2 | The Decks hero image, once the transparent file is in, or with the keyed-out fallback after Rob sees it | set aside (Rob, 2026-09-28) |

**How A1 landed.** The tokens stay the app's own names (`--color-*`, `--radius-*`, `--font-display`, `--display-case`), with
the DELTA's values translated onto them. Brass & Slate is the base block and Felt & Cream its light face, exactly as
before; Moss & Iron and Steel & Cobalt are `data-palette` blocks, set on `<html>` and `#matrix-v2`, and `index.html` carries
Moss & Iron before any script runs. Saved values are read, never rewritten: `dark` is Brass & Slate, `light` Felt & Cream,
`system` or nothing Moss & Iron. Headings, heroes and big figures read `--display-case` and `--hero-weight`, so Moss &
Iron's are Barlow Condensed capitals. The mist re-reads its colors when the palette changes. Test checks that compare
a heading's words read its text, not its rendered capitals.

## 5. Decisions for Rob

| # | Question | Recommendation |
|---|---|---|
| A1 | A saved "Match system" becomes which theme? | **Moss & Iron**, the new default |
| A2 | Barlow Condensed from Google Fonts, as the DELTA says, or self-hosted? | **Self-hosted**: no third-party request, works offline, and the security policy stays as it is |
| A3 | The hero on a phone: smaller above the title, or hidden? | **Decide from screenshots at 390px** |
| A4 | The image: a transparent re-export, or the keyed-out fallback? | **A transparent re-export** |
