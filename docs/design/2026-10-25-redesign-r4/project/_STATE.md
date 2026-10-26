# CrankMagic r4 design pack: state

## Next
Next session (Rob): new screenshots and wireframes for every page in the crankmagic-ux-walkthrough, built from this template and the reference image. Start from frames/, follow guidelines/warmth.html.
Land ../pr as one PR (apply-r4.mjs, then the token test). After it: the page-layer sweep in ../pr/CHANGELOG-tokens.md (font sizes under 12px, literal radii), the skin picker plus Dark/Light/System control in Settings, and building the Play drawers into crankmagic-stage.css.

## Decisions (2026-10-25)
- Governing skin: Sapphire & Obsidian, dark default plus a Parchment light register. Skins: Bronze & Basalt, Chalk & Coal (high contrast). Colors only.
- Palette rule (Rob, 2026-10-25): high fantasy, the five mana colors, saturated jewels not pastels, clean enough that nothing is confused. Five colors, five jobs: sapphire button, gold money and decisions, crimson missed or remove, emerald owned, obsidian ground. Ordered is aether teal.
- Rejected: Heather & Granite (purple and pastel, rejected by Rob), Gilt & Iron (gold button collides with to-buy and prices; moving money to blue breaks gold = treasure), Copper & Soot (accent and required merge for deuteranopes).
- Status, money and required keep one hue family each in every skin; status shows four families plus gray, with a glyph per rung.
- Name (Rob, 2026-10-26): the app stays CrankMagic with its own wordmark (Oxanium subset in aether, gear logo), unchanged. Cinzel never sets the app name.
- Faces (Rob, 2026-10-25, from his reference Concept B): Cinzel 600 for page titles and the deck title; Lato 400/700 for everything else. Barlow Condensed 800 only for the neon callout word. Satoshi and Young Serif retired.
- Warmth (Rob, 2026-10-25): capture the reference's principles in the template, not its palette. No green palette and no single mana color owning the chrome, because players associate with their commander's colors. guidelines/warmth.html holds the ten principles.
- Drawer with a collapse tab (Rob likes the reference's format): left holds the decision, right the stack and history; bottom sheet on a phone. The live Play screen does not have it yet.
- Radii 8/12/16/999; buttons 40, compact 32, inputs 42, checks 20; motion 160ms.
- Selection inverts to ink; the accent is only for the one primary.
- Deck page: the one primary (the next stage, today Lock list) sits in the hero action row on every tab; the Next band on Overview says why.
