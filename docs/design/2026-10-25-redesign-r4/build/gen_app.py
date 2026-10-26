"""Builds the r4 token blocks for crankmagic-design.css and the PR kit, from the same spec as the handoff."""
import os, sys
from gen_tokens import color_decls, TYPE, SHAPE, TABLE, SKINS, SKIN_ORDER, OUT
PR = os.path.join(OUT, 'pr'); os.makedirs(os.path.join(PR, 'tests'), exist_ok=True)

def decls(lines): return ';'.join(lines) + ';'
type_decls = [f"{t}:{v}" for t, v, _ in TYPE]
shape_decls = [f"{t}:{v}" for t, v in SHAPE]

A = []
A.append("""/* THE r4 TYPE (docs/design/2026-10-25-redesign-r4, Rob 2026-10-25). One display face and one body face for every skin,
   both from Rob's reference (Concept B, Table Companion): Cinzel 600 for page titles and the deck title; Lato
   400/700 for everything read, chosen or counted, h2 and h3 and figures included. Barlow Condensed 800 is the callout word
   only. The CrankMagic wordmark keeps its own Oxanium subset. No skin changes the face, the case or the scale. Page
   headings read --text-h1, --text-h2, --text-h3 and --text-hero; the floor is --text-label, 12px. */

/* THE r4 TOKENS. The values are the designer's, from docs/design/2026-10-25-redesign-r4/project/tokens/*.css, generated
   there from build/spec.py, and tests/design-tokens.mjs holds this block equal to those files in both registers.
   Sapphire & Obsidian is the governing skin: dark here, light under data-theme="light". Shape, type and motion are stated
   once, in this block, and no skin overrides them. */""")
A.append('.cm-theme-swatch[data-palette="sapphire-obsidian"],:root,#matrix-v2{' + decls(color_decls('sapphire-obsidian', 'dark')) + decls(shape_decls) + decls(type_decls) + '}')
A.append('.cm-theme-swatch[data-palette="sapphire-obsidian"][data-theme="light"],:root[data-theme="light"],#matrix-v2[data-theme="light"]{' + decls(color_decls('sapphire-obsidian', 'light')) + '}')
A.append("""/* THE SKINS (r4). A skin is colors only: the same --color-*, --mana-* and --st-* names in a dark and a light register,
   and nothing else. Status, money and required keep their hues in every skin, so a color means the same thing whichever
   skin is on. The app sets data-palette and data-theme on <html> and #matrix-v2 (crankmagic-app.js, THEME_FACE). */""")
for skin in SKIN_ORDER[1:]:
    s = f'[data-palette="{skin}"]'
    A.append(f'.cm-theme-swatch{s},:root{s},#matrix-v2{s}{{' + decls(color_decls(skin, 'dark', aliases=False)) + '}')
    A.append(f'.cm-theme-swatch{s}[data-theme="light"],:root{s}[data-theme="light"],#matrix-v2{s}[data-theme="light"]{{' + decls(color_decls(skin, 'light', aliases=False)) + '}')
block_a = '\n'.join(A) + '\n'

V = """/* THE PAGE'S NAMES FOR THE TOKENS (the --v-* layer). Every one resolves to a token above; none carries a literal. They are
   :root's as well as #matrix-v2's, because menus, tooltips and toasts are popovers on <body> (Rob, 24 September).
   Three planes and three signals: --v-bg ground, --v-panel a card on it, --v-raised a control on the card, lighter
   always; --v-accent press this, --v-decision answer this, --v-required you missed this. Three hues, never one. */
:root,#matrix-v2{
  --v-bg:var(--color-bg);--v-panel:var(--color-panel);--v-raised:var(--color-raised);
  --v-ink:var(--color-ink);--v-muted:var(--color-muted);
  --v-line:var(--color-line);--v-line-strong:var(--color-line-strong);
  --v-field:var(--color-raised);--v-field-line:var(--color-field-line);
  --v-accent:var(--color-accent);--v-on:var(--color-on-accent);--v-soft:var(--color-accent-soft);
  /* "Brass = the one primary" survives as a name: it is the accent. */
  --v-brass:var(--color-accent);
  /* r4's accents carry their own ink at 4.5:1 or better in every skin and register, so the darkened fill is retired. */
  --accent-fill:var(--color-accent);
  --v-warm:var(--color-money);--v-money:var(--color-money);
  --v-decision:var(--color-money);--v-decision-bg:var(--color-decision-bg);--v-decision-line:var(--color-decision-line);
  --v-decision-ink:var(--color-decision-ink);--v-decision-field:var(--color-decision-field);
  --v-required:var(--color-required);
  --v-aether:var(--color-aether);
  --v-radius:var(--radius-control);--v-radius-card:var(--radius-card);--v-radius-tile:var(--radius-tile);
  --v-display:var(--font-display);--v-body:var(--font-body);
  /* THE TABLE. The poster pair under commander art, the lobby's center card, the felt, the cards and the callout lights
     are the table's, not the page's, and keep their values in every skin and both registers. */
""" + ''.join(f"  {t}:{v};\n" for t, v, _ in TABLE).rstrip('\n').rstrip(';') + ";}\n"
block_b = V

open(os.path.join(PR, 'crankmagic-design.r4-blocks.css'), 'w').write("/* r4 BLOCK A: replaces crankmagic-design.css from the comment 'THE TYPE IS r3' through the --accent-fill override. */\n" + block_a + "\n/* r4 BLOCK B: replaces the DEEP FIELD comment and block, through --mat-night-edge. */\n" + block_b)
open(os.path.join(PR, 'block-a.css'), 'w').write(block_a)
open(os.path.join(PR, 'block-b.css'), 'w').write(block_b)
print('blocks', len(block_a), len(block_b))
