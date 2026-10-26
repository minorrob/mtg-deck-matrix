---
name: crankmagic-design-r4
description: Use this skill to design or build CrankMagic screens in the r4 system (Sapphire & Obsidian, with the Bronze & Basalt and Chalk & Coal skins). Holds the tokens for every skin and register, one component set with every state, the Play surfaces, and the generated contrast tables.
user-invocable: true
---

Read readme.md first, then guidelines/warmth.html (the ten principles from Rob's reference, reference/concept-b-table-companion.webp), guidelines/controls.html and guidelines/play-surfaces.html.

Rules that hold on every screen:
- Five colors, five jobs: sapphire --color-accent is the one button to press, gold --color-money is money and decisions, crimson --color-required is what you missed, emerald --st-inbox is what you own, obsidian --color-bg is the ground. Never borrow one color for another job.
- One accent per screen, and only for the next action. Selection inverts to ink; it is never the accent. Ordered is aether teal, never the button's blue.
- A filled danger button takes --color-on-required words, not --color-on-accent.
- Build on the three planes: --color-bg, --color-panel, --color-raised. A control is lighter than its panel; in the light register its --color-field-line carries the edge.
- Two voices of type: Cinzel 600 (--font-display) names things: every h1 and the deck title (--text-hero). The app name is always the CrankMagic wordmark (.cm-wordmark, the Oxanium mark in aether), never Cinzel. Lato (--font-body) does the work: h2, h3 and figures at 700, everything else at 400. Section titles in drawers and panel heads are .cm-section-title.
- Read sizes from the scale (--text-h1, --text-h2, --text-h3, --text-body-size, --text-small, --text-label). Nothing under 12px. Every h1 reads --text-h1, or --text-hero for the deck title and landing.
- Keep it warm and neutral: warmth comes from the Study (.cm-study, .cm-mat), brass, parchment and lamp light, never from tinting the chrome. No mana color owns the frame; players take their commander's colors as their own, so color arrives with the cards. Brass (--table-brass) is for fittings on the table, never a value.
- Show card art wherever a card is named (.cm-pick, tiles, .cm-history). Write a decision as a sentence, show the step (.cm-steps), say what happens (.cm-consequence), give two buttons.
- Side detail goes in a .cm-drawer that folds to its tab (left, right; bottom on a phone). A decision is never hidden.
- Every status shows its word and its glyph (glyphs.js) as well as its --st-* hue.
- Words over commander art or the table use the fixed poster pair and the HUD styles; they do not follow the skin.
- A skin is colors only. Never set radius, shadow, motion, face or size inside design-systems/<skin>/.

To change a color, edit ../build/spec.py and run ../build/build_all.sh; it rewrites the token files, the app blocks in ../pr/, the contrast pages and the readme numbers together. For throwaway mocks, copy frames/*.html and add ?skin= and ?theme= to switch.
