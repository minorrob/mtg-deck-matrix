"""Writes every token file of the r4 pack from spec.py. Run: python3 gen_tokens.py <out_root>"""
import os as _os
from pathlib import Path as _P
PACK = str(_P(__file__).resolve().parents[1]) + '/'
REPO = _os.environ.get('CM_REPO', str(_P(__file__).resolve().parents[4])) + '/'
SCRATCH = _os.environ.get('CM_SCRATCH', '/tmp/cm-r4') + '/'
import json, os, sys
from spec import SKINS, full
from colormath import hex_to_oklch

OUT = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[0].endswith("gen_ds.py") else PACK
SKIN_ORDER = ['sapphire-obsidian', 'bronze-basalt', 'chalk-coal']

# token name -> (palette key, usage)
COLOR_TOKENS = [
  ('--color-bg', 'bg', 'Ground: the page behind everything. Plane 1 of 3.'),
  ('--color-panel', 'panel', 'Panel: a card or section on the ground. Plane 2 of 3.'),
  ('--color-raised', 'raised', 'Raised control on a panel: buttons, inputs, chips. Plane 3 of 3, always lighter than its panel.'),
  ('--color-line', 'line', 'The 1px divider between rows and around panels. At least 1.3:1 on ground and panel.'),
  ('--color-line-strong', 'line_strong', 'The 1px section break and the secondary button edge. At least 2:1 on panel.'),
  ('--color-field-line', 'field_line', 'The edge of anything you type into or tick: inputs, checkboxes, radios. At least 3:1 on panel and raised.'),
  ('--color-ink', 'ink', 'Body text and icons on ground, panel and raised.'),
  ('--color-muted', 'muted', 'Secondary text, labels and captions on ground, panel and raised. At least 4.5:1 on all three.'),
  ('--color-faint', 'faint', 'Disabled text and the draft rung. Never for text a player must read.'),
  ('--color-hover', 'hover', 'Fill under the pointer for quiet buttons, menu items, chips and rows. Ink reads on it.'),
  ('--color-accent', 'accent', 'Press this: the one primary action per screen. Never a status, never a selection.'),
  ('--color-accent-hover', 'accent_hover', 'The primary button under the pointer.'),
  ('--color-accent-soft', 'accent_soft', 'Tint behind the row or tile the primary acts on. Ink reads on it.'),
  ('--color-on-accent', 'on_accent', 'Words and icons on the accent.'),
  ('--color-aether', 'aether', 'The focus ring, the Explore graph, the wordmark mist, whose turn it is.'),
  ('--color-money', 'money', 'Answer this, and money: prices, budgets, a choice the app is waiting on.'),
  ('--color-required', 'required', 'You missed this: required fields, destructive actions, errors.'),
  ('--color-on-required', 'on_required', 'Words and icons on the required fill: the danger button and the error toast.'),
  ('--color-decision-bg', 'decision_bg', 'Ground of a panel that is waiting on your answer.'),
  ('--color-decision-line', 'decision_line', 'Edge of that panel.'),
  ('--color-decision-ink', 'decision_ink', 'Words on the decision ground.'),
  ('--color-decision-field', 'decision_field', 'An input inside the decision panel.'),
]
MANA = {
  'dark':  {'W': '#e9d79a', 'U': '#74b5f7', 'B': '#a897bf', 'R': '#f0805f', 'G': '#77c58f'},
  'light': {'W': '#c9a52e', 'U': '#2b7fd8', 'B': '#6f5c8e', 'R': '#d0603c', 'G': '#2f8f5b'},
}
STATUS = [  # token, palette key, family, word, usage
  ('--st-inbox', 'owned', 'owned', 'In box', 'Owned and physically in this deck\'s box. Glyph: filled disc.'),
  ('--st-physical', 'owned', 'owned', 'Physical', 'Owned and sleeved in some deck (library views). Glyph: filled square.'),
  ('--st-pull', 'owned2', 'owned', 'Pull', 'Owned, has to be pulled from the library or another deck. Glyph: ring with a dot.'),
  ('--st-reserved', 'owned2', 'owned', 'Reserved', 'An owned copy set aside for this deck. Glyph: ring with a bar.'),
  ('--st-ordered', 'coming', 'coming', 'Ordered', 'Bought and on its way. Glyph: right arrow.'),
  ('--st-buy', 'needed', 'needed', 'To buy', 'Still to buy; it costs money, so it wears the money hue. Glyph: hollow ring.'),
  ('--st-standin', 'needed2', 'needed', 'Stand-in', 'A substitute holds the slot until the real card comes. Drawn hatched. Glyph: hatched square.'),
  ('--st-remove', 'out', 'out', 'Remove', 'In the box but no longer in the list. Glyph: cross.'),
  ('--st-watch', 'watch', 'intent', 'Watch', 'An intention, not a copy: watching a price. Glyph: dashed ring.'),
  ('--st-draft', 'draft', 'intent', 'Draft', 'An intention, not a copy: on a draft list. Glyph: dotted ring.'),
]
ALIASES = [('--surface-page', 'var(--color-bg)'), ('--surface-card', 'var(--color-panel)'), ('--surface-control', 'var(--color-raised)'),
           ('--border-default', 'var(--color-line)'), ('--text-body', 'var(--color-ink)'), ('--text-muted', 'var(--color-muted)'),
           ('--action-primary', 'var(--color-accent)'), ('--action-primary-text', 'var(--color-on-accent)')]

def color_decls(skin, reg, aliases=True):
    p = full(skin, reg)
    lines = [f"color-scheme:{reg}"]
    lines += [f"{t}:{p[k]}" for t, k, _ in COLOR_TOKENS]
    lines += [f"--mana-{m}:{v}" for m, v in MANA[reg].items()]
    lines += [f"{t}:{p[k]}" for t, k, *_ in STATUS]
    if aliases: lines += [f"{t}:{v}" for t, v in ALIASES]
    return lines

TYPE = [
  ('--font-display', "Cinzel,'Trajan Pro',Georgia,serif", 'Roman capitals that name places and things: page titles, the deck title, the landing hero. Weight 600. Sentence-case text sets as capitals and small capitals. The app name keeps its own CrankMagic mark.'),
  ('--font-hero', 'var(--font-display)', 'The hero is the display face at hero size: the deck title and the landing headline.'),
  ('--font-body', "Lato,system-ui,sans-serif", 'Everything that is read, chosen or counted: body, h2 and h3, labels, controls, figures, the HUD. 400 and 700.'),
  ('--display-weight', '600', ''), ('--display-tracking', '.04em', ''), ('--display-case', 'none', ''),
  ('--hero-weight', '600', ''), ('--hero-case', 'none', ''),
  ('--heading-weight', '700', 'h2, h3, deck tile names and big figures: the body face at 700.'), ('--heading-tracking', '-.005em', ''),
  ('--text-hero', 'clamp(36px, 24px + 3vw, 56px)', 'Cinzel hero: 56 at 1440, 36 at 390.'),
  ('--text-h1', 'clamp(30px, 22px + 1.25vw, 40px)', 'Every page title, one rule: 40 at 1440, 30 at 390.'),
  ('--text-h2', '24px', 'Section titles.'),
  ('--text-h3', '18px', 'Panel titles.'),
  ('--text-figure', '32px', 'Big figures: cost to finish, life in the lobby.'),
  ('--text-reading', '16px', 'Reading surfaces: deck guide, help, how it plays.'),
  ('--text-body-size', '14px', 'UI body and controls. The floor for anything a player reads. Named -size because --text-body is the body color alias.'),
  ('--text-small', '13px', 'Captions and meta lines.'),
  ('--text-label', '12px', 'Uppercase labels and eyebrows. The smallest size in the app.'),
  ('--label-tracking', '.12em', 'Spaced capitals, as on the drawer titles.'),
  ('--leading-body', '1.5', ''), ('--leading-reading', '1.6', ''), ('--leading-tight', '1.05', ''),
  ('--text-hud', '18px', 'Play HUD text at 100%. Multiplied by --hud-scale where it is used.'),
  ('--text-hud-vital', '28px', 'Life, poison, turn at 100%.'),
  ('--text-hud-caption', '15px', 'Zone captions on the board at 100%.'),
  ('--hud-scale', '1', 'Set on the board root from the HUD text setting: 1, 1.25, 1.5 or 2.'),
]
SHAPE = [
  ('--radius-control', '8px'), ('--radius-card', '12px'), ('--radius-tile', '16px'), ('--radius-pill', '999px'),
  ('--space-1', '4px'), ('--space-2', '8px'), ('--space-3', '12px'), ('--space-4', '16px'), ('--space-5', '20px'),
  ('--space-6', '24px'), ('--space-8', '32px'), ('--space-10', '40px'), ('--space-12', '48px'),
  ('--line-width', '1px'), ('--control-height', '40px'), ('--control-height-lg', '44px'), ('--control-height-compact', '32px'),
  ('--field-height', '42px'), ('--check-size', '20px'), ('--focus-width', '2px'), ('--focus-offset', '2px'),
  ('--shadow-card', '0 1px 2px rgb(0 0 0 / .10), 0 8px 24px -16px rgb(0 0 0 / .30)'),
  ('--shadow-pop', '0 0 0 1px var(--color-line), 0 18px 48px -20px rgb(0 0 0 / .55)'),
  ('--motion-fast', '160ms'), ('--motion-slow', '280ms'), ('--motion-ease', 'cubic-bezier(.2,.8,.2,1)'),
  ('--card-ratio', '5/7'),
]

def block(sel, decls, indent='  '):
    return sel + '{\n' + ''.join(f"{indent}{d};\n" for d in decls) + '}\n'

def write(path, text):
    full_path = os.path.join(OUT, path); os.makedirs(os.path.dirname(full_path), exist_ok=True)
    open(full_path, 'w').write(text)

HEAD = "/* Generated by build/gen_tokens.py from build/spec.py. Edit the spec, not this file. */\n"
# governing colors
g = SKINS['sapphire-obsidian']
write('project/tokens/colors.css', HEAD + f"/* {g['name']}: dark is the default; [data-theme=\"light\"] flips it. {g['place']} */\n"
      + block(':root', color_decls('sapphire-obsidian', 'dark')) + block('[data-theme="light"]', color_decls('sapphire-obsidian', 'light')))
for skin in SKIN_ORDER[1:]:
    s = SKINS[skin]
    write(f'project/design-systems/{skin}/tokens/colors.css', HEAD + f"/* {s['name']}: colors only. Type, shape and components are the governing system's. {s['place']} */\n"
          + block(':root', color_decls(skin, 'dark')) + block('[data-theme="light"]', color_decls(skin, 'light')))
    write(f'project/design-systems/{skin}/styles.css', '@import url("../../tokens/fonts.css");\n@import url("tokens/colors.css");\n@import url("../../tokens/typography.css");\n@import url("../../tokens/shape.css");\n')
write('project/tokens/typography.css', HEAD + "/* One type system for every skin. Skins never override this file. */\n" + block(':root', [f"{t}:{v}" for t, v, _ in TYPE]))
write('project/tokens/shape.css', HEAD + "/* One shape system for every skin: four radii, one divider width, one motion. Skins never override this file. */\n" + block(':root', [f"{t}:{v}" for t, v in SHAPE]))
FACES = [('Cinzel', 600, 'cinzel-600'), ('Lato', 400, 'lato-400'), ('Lato', 700, 'lato-700'), ("'Barlow Condensed'", 800, 'barlowcondensed-800')]
UR_LATIN = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
UR_EXT = "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF"
def font_faces(prefix):
    out = ''
    for fam, w, stem in FACES:
        out += f"@font-face{{font-family:{fam};font-weight:{w};font-style:normal;font-display:swap;src:url(\"{prefix}{stem}.woff2\") format(\"woff2\");unicode-range:{UR_LATIN}}}\n"
        out += f"@font-face{{font-family:{fam};font-weight:{w};font-style:normal;font-display:swap;src:url(\"{prefix}{stem}-ext.woff2\") format(\"woff2\");unicode-range:{UR_EXT}}}\n"
    return out
write('project/tokens/fonts.css', HEAD + "/* Self-hosted only (CSP): no font CDN at runtime. Four text weights, every one SIL OFL 1.1: Cinzel 600 for roman-capital names (page titles, the deck title); Lato 400 and 700 for everything read, chosen or counted; Barlow Condensed 800 for the table's neon callout word only. The CrankMagic wordmark keeps its own Oxanium subset (SIL OFL 1.1), as live; it sets the app name and nothing else. */\n" + font_faces('../assets/fonts/')
      + "@font-face{font-family:CrankOxanium;font-weight:700;font-style:normal;font-display:swap;src:url(\"../assets/fonts/crank-oxanium-wordmark.ttf\") format(\"truetype\")}\n")
write('project/styles.css', '@import url("tokens/fonts.css");\n@import url("tokens/colors.css");\n@import url("tokens/typography.css");\n@import url("tokens/shape.css");\n')

# palette data for pages (json)
data = {'skins': {}, 'order': SKIN_ORDER}
for skin in SKIN_ORDER:
    data['skins'][skin] = {'name': SKINS[skin]['name'], 'place': SKINS[skin]['place'], 'dark': full(skin, 'dark'), 'light': full(skin, 'light')}
data['color_tokens'] = COLOR_TOKENS; data['status'] = STATUS; data['mana'] = MANA; data['type'] = TYPE; data['shape'] = SHAPE
os.makedirs(os.path.join(OUT, 'build'), exist_ok=True)
json.dump(data, open(os.path.join(OUT, 'build', 'palette.json'), 'w'), indent=1)
print('ok')

# The table: fixed in every skin and both registers, because the art, the felt and the cards do not change.
TABLE = [
  ('--font-callout', "'Barlow Condensed',Lato,system-ui,sans-serif", 'The neon callout word over the table, italic 800. The table\'s one expressive face; never page type.'),
  ('--poster-ground', '#0c0c10', 'Where a deck tile\'s gradient ends under the commander art. Obsidian black; fixed.'),
  ('--poster-ink', '#f3f1ee', 'Words over commander art; fixed.'),
  ('--table-panel', '#fbfaf7', 'The lobby\'s center card over the table; fixed.'),
  ('--table-ink', '#1f1c18', 'Words on the table panel; fixed.'),
  ('--mat-felt', '#2b3a2c', ''), ('--mat-felt-edge', '#141812', ''), ('--mat-ink', '#f3efe6', 'Words on the board.'),
  ('--mat-scrim', 'rgb(0 0 0 / .8)', 'Pill behind words on the board.'),
  ('--tray', 'color-mix(in srgb,var(--table-ink) 84%,transparent)', ''),
  ('--focus-halo', 'var(--table-ink)', ''), ('--focus-ring', 'color-mix(in srgb,var(--color-aether) 45%,white)', 'The board\'s two-ring focus: halo inside ring.'),
  ('--card-face', '#ece5d6', ''), ('--card-face-edge', '#cfc5b0', ''), ('--card-back', '#3a2f22', ''), ('--card-back-edge', '#2c231a', ''),
  ('--vital-danger', '#b3261e', ''), ('--on-accent', '#1a1611', ''),
  ('--callout-harm', '#ff5c4d', 'Neon callout: harm.'), ('--callout-answer', '#5fd3ff', 'Neon callout: an answer, your turn.'),
  ('--callout-growth', '#6ff06a', 'Neon callout: growth.'), ('--callout-value', '#ffd34d', 'Neon callout: value.'), ('--callout-fade', '#c99bff', 'Neon callout: what fades.'),
  ('--mat-forge', '#3b2113', ''), ('--mat-forge-edge', '#120a06', ''), ('--mat-forge-glow', '#d9772f', ''),
  ('--mat-cavern', '#30363c', ''), ('--mat-cavern-edge', '#0f1215', ''),
  ('--mat-sea', '#0f3d48', ''), ('--mat-sea-edge', '#06161b', ''), ('--mat-sea-foam', '#9fd8e0', ''),
  ('--mat-night', '#1d1b3d', ''), ('--mat-night-edge', '#07071a', ''),
  ('--table-wood', '#3a2414', 'The Study: a walnut table under a warm lamp. The default table; the mats above are a player\'s choice on top of it.'),
  ('--table-grain', 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%271600%27 height=%271000%27%3E%3Cfilter id=%27g%27 x=%270%27 y=%270%27 width=%27100%25%27 height=%27100%25%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%27.0016 .026%27 numOctaves=%274%27 seed=%2711%27 stitchTiles=%27stitch%27/%3E%3CfeColorMatrix values=%270 0 0 0 .06  0 0 0 0 .03  0 0 0 0 .012  1.5 0 0 0 -.5%27/%3E%3C/filter%3E%3Cfilter id=%27h%27 x=%270%27 y=%270%27 width=%27100%25%27 height=%27100%25%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%27.003 .09%27 numOctaves=%273%27 seed=%274%27 stitchTiles=%27stitch%27/%3E%3CfeColorMatrix values=%270 0 0 0 .55  0 0 0 0 .36  0 0 0 0 .21  0 .9 0 0 -.45%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 fill=%27%234a2d19%27/%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23g)%27/%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23h)%27/%3E%3C/svg%3E")', 'Walnut grain, drawn by the browser from noise. No image file. Tile 1600x1000.'),
  ('--table-light', 'rgb(255 184 108 / .20)', 'The lamp: a warm pool of light over the middle of the table.'),
  ('--table-shade', 'rgb(12 6 2 / .88)', 'The table falls into shadow at its edges.'),
  ('--table-felt', '#292724', 'A seat\'s mat on the Study: charcoal felt. Warm, but no mana color, so every commander sits on it equally.'),
  ('--table-felt-nap', 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27240%27 height=%27240%27%3E%3Cfilter id=%27n%27 x=%270%27 y=%270%27 width=%27100%25%27 height=%27100%25%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%27.85%27 numOctaves=%272%27 seed=%273%27 stitchTiles=%27stitch%27/%3E%3CfeColorMatrix values=%270 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .08 0%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23n)%27/%3E%3C/svg%3E")', 'Felt nap, drawn from noise. Tile 240x240.'),
  ('--table-brass', '#b8925a', 'Brass fittings on the table: the ring around a seat portrait, the emblem.'),
]
write('project/tokens/table.css', HEAD + "/* The table: the Study (wood, lamp light, charcoal felt), the poster pair, the lobby panel, the mats, the cards and the callout lights. Fixed in every skin and both registers. */\n" + block(':root', [f"{t}:{v}" for t, v, _ in TABLE]))
write('project/styles.css', '@import url("tokens/fonts.css");\n@import url("tokens/colors.css");\n@import url("tokens/typography.css");\n@import url("tokens/shape.css");\n@import url("tokens/table.css");\n')
for skin in SKIN_ORDER[1:]:
    write(f'project/design-systems/{skin}/styles.css', '@import url("../../tokens/fonts.css");\n@import url("tokens/colors.css");\n@import url("../../tokens/typography.css");\n@import url("../../tokens/shape.css");\n@import url("../../tokens/table.css");\n')
data['table'] = TABLE
json.dump(data, open(os.path.join(OUT, 'build', 'palette.json'), 'w'), indent=1)
print('table ok')
