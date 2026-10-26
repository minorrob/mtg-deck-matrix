"""The r4 palette spec, in OKLCH. Every hex in the token files is generated from here.

Five colors, five jobs, the same in every skin:
  sapphire (blue mana)  press this: the one primary per screen
  gold (treasure)       answer this, and money; to buy
  crimson (red mana)    you missed this; remove; danger
  emerald (green mana)  owned; in the box
  obsidian (black mana) the ground the table sits on
plus aether teal for "ordered" and the focus ring, and pearl (white mana) for ink.
"""
from colormath import oklch_to_hex as H, contrast

# Shared semantic hues: identical in every skin, tuned in lightness per register. Saturated jewels, not tints.
SEM = {
  'dark': {
    'money':    (0.820, 0.150, 84),
    'required': (0.635, 0.205, 25),
    'owned':    (0.770, 0.175, 150),
    'owned2':   (0.890, 0.100, 152),   # pull, reserved: owned, not in the box yet
    'coming':   (0.655, 0.115, 205),   # ordered: aether teal, never the sapphire of the button
    'needed':   (0.820, 0.150, 84),    # = money: to buy costs money
    'needed2':  (0.910, 0.085, 90),    # stand-in, drawn hatched
    'out':      (0.635, 0.205, 25),    # = required
  },
  'light': {
    'money':    (0.520, 0.120, 72),
    'required': (0.400, 0.170, 27),
    'owned':    (0.520, 0.145, 150),
    'owned2':   (0.630, 0.130, 152),
    'coming':   (0.620, 0.105, 205),
    'needed':   (0.520, 0.120, 72),
    'needed2':  (0.640, 0.130, 80),
    'out':      (0.400, 0.170, 27),
  },
}

SKINS = {
  'sapphire-obsidian': {
    'name': 'Sapphire & Obsidian',
    'place': 'A wizard\'s table at night: obsidian and iron, a sapphire set in the hilt, gold on the scales, parchment by day.',
    'dark': {
      'neutral': (262, 0.014), 'ink_tint': (85, 0.010),
      'L': {'bg': .155, 'panel': .210, 'raised': .305, 'line': .35, 'line_strong': .44, 'field_line': .60,
            'ink': .955, 'muted': .775, 'faint': .62},
      'accent': (0.535, 0.175, 262), 'on_accent_L': 1.0,
      'aether': (0.820, 0.105, 215),
    },
    'light': {   # Parchment: the card's own paper
      'neutral': (85, 0.016), 'ink_tint': (262, 0.020),
      'L': {'bg': .945, 'panel': .985, 'raised': 1.0, 'line': .84, 'line_strong': .75, 'field_line': .60,
            'ink': .20, 'muted': .47, 'faint': .60},
      'accent': (0.420, 0.170, 262), 'on_accent_L': 1.0,
      'aether': (0.500, 0.120, 235),
    },
  },
  'bronze-basalt': {
    'name': 'Bronze & Basalt',
    'place': 'A dwarven hall: warm basalt, bronze-bound edges, the same sapphire, gold and crimson; vellum by day.',
    'dark': {
      'neutral': (55, 0.010), 'lines': (70, 0.040), 'ink_tint': (85, 0.014),
      'L': {'bg': .155, 'panel': .210, 'raised': .305, 'line': .37, 'line_strong': .46, 'field_line': .62,
            'ink': .955, 'muted': .78, 'faint': .62},
      'accent': (0.535, 0.175, 262), 'on_accent_L': 1.0,
      'aether': (0.820, 0.105, 215),
    },
    'light': {   # Vellum
      'neutral': (75, 0.024), 'lines': (70, 0.045), 'ink_tint': (55, 0.020),
      'L': {'bg': .935, 'panel': .978, 'raised': 1.0, 'line': .83, 'line_strong': .73, 'field_line': .58,
            'ink': .20, 'muted': .465, 'faint': .60},
      'accent': (0.420, 0.170, 262), 'on_accent_L': 1.0,
      'aether': (0.500, 0.120, 235),
    },
  },
  'chalk-coal': {
    'name': 'Chalk & Coal',
    'place': 'Coal-black slate and white chalk: the high-contrast skin, built for 7:1 and a TV across the room.',
    'dark': {
      'neutral': (262, 0.006),
      'L': {'bg': .12, 'panel': .20, 'raised': .30, 'line': .42, 'line_strong': .55, 'field_line': .70,
            'ink': 1.0, 'muted': .87, 'faint': .76},
      'accent': (0.695, 0.160, 258), 'on_accent_L': .12,
      'aether': (0.880, 0.090, 210),
    },
    'light': {
      'neutral': (262, 0.004),
      'L': {'bg': .955, 'panel': 1.0, 'raised': 1.0, 'line': .62, 'line_strong': .45, 'field_line': .40,
            'ink': .12, 'muted': .32, 'faint': .45},
      'accent': (0.400, 0.170, 262), 'on_accent_L': 1.0,
      'aether': (0.420, 0.120, 235),
    },
  },
}
# Chalk & Coal pushes the semantic hues to 7:1 too.
SEM_HC = {
  'dark': {k: (min(.93, v[0] + (.16 if k == 'coming' else .10)), v[1], v[2]) for k, v in SEM['dark'].items()},
  'light': {k: (max(.30, v[0] - (.12 if k in ('required', 'out') else .09)), v[1], v[2]) for k, v in SEM['light'].items()},
}

def build(skin, reg):
    s = SKINS[skin][reg]; nh, nc = s['neutral']
    lh, lc = s.get('lines', (nh, nc)); ih, ic = s.get('ink_tint', (nh, nc * .6))
    out = {}
    for k, L in s['L'].items():
        if k in ('line', 'line_strong', 'field_line'): h, c = lh, lc
        elif k == 'ink': h, c = ih, ic
        else: h, c = nh, nc
        out[k] = H(L, c if L < .999 else 0, h)
    out['accent'] = H(*s['accent'])
    out['on_accent'] = H(s['on_accent_L'], nc if s['on_accent_L'] < .999 else 0, nh)
    out['aether'] = H(*s['aether'])
    sem = (SEM_HC if skin == 'chalk-coal' else SEM)[reg]
    for k, v in sem.items(): out[k] = H(*v)
    # neutral status steps: watch = muted, draft = faint
    out['watch'] = out['muted']; out['draft'] = out['faint']
    return out


# Derived tokens: decision family (money hue), the words on the required fill, accent hover and soft tint.
from colormath import mix, hex_to_oklch
DECISION = {
  'dark':  {'decision_bg': (.25, .035, 84), 'decision_line': (.52, .085, 84), 'decision_ink': (.93, .050, 84), 'decision_field': (.30, .040, 84)},
  'light': {'decision_bg': (.968, .032, 84), 'decision_line': (.72, .085, 80), 'decision_ink': (.33, .075, 70), 'decision_field': (.952, .040, 84)},
}
DECISION_HC = {
  'dark':  {'decision_bg': (.22, .032, 84), 'decision_line': (.68, .090, 84), 'decision_ink': (.97, .030, 84), 'decision_field': (.27, .036, 84)},
  'light': {'decision_bg': (.975, .030, 84), 'decision_line': (.46, .085, 75), 'decision_ink': (.24, .065, 70), 'decision_field': (.96, .032, 84)},
}
def full(skin, reg):
    p = build(skin, reg)
    d = (DECISION_HC if skin == 'chalk-coal' else DECISION)[reg]
    for k, v in d.items(): p[k] = H(*v)
    L, C, Hh = SKINS[skin][reg]['accent']
    white_on = SKINS[skin][reg]['on_accent_L'] >= .999
    # hover moves away from the words on it, so the words never lose contrast
    p['accent_hover'] = H(L + (-.05 if white_on else .05), C, Hh)
    p['accent_soft'] = mix(p['panel'], p['accent'], .20 if reg == 'dark' else .10)
    p['hover'] = mix(p['panel'], p['ink'], .08 if reg == 'dark' else .055)
    dark_ink = H(.15, .01, 262)
    p['on_required'] = '#ffffff' if contrast('#ffffff', p['required']) >= contrast(dark_ink, p['required']) else dark_ink
    return p

# The rejected direction, for the swatch board only: gold on the button forces money onto another hue.
GILT = {
  'name': 'Gilt & Iron',
  'place': 'The arena look: iron gray, a gilded button, and money and decisions pushed onto sapphire.',
  'dark': {'bg': H(.155, .008, 250), 'panel': H(.210, .009, 250), 'raised': H(.305, .010, 250), 'line': H(.35, .010, 250),
           'ink': H(.955, .008, 85), 'muted': H(.775, .010, 250), 'accent': H(.80, .150, 80), 'on_accent': H(.15, .010, 250),
           'aether': H(.82, .105, 215), 'money': H(.72, .130, 255), 'required': H(.665, .200, 25)},
  'light': {'bg': H(.945, .006, 250), 'panel': H(.985, .004, 250), 'raised': '#ffffff', 'line': H(.84, .008, 250),
           'ink': H(.20, .010, 250), 'muted': H(.47, .010, 250), 'accent': H(.52, .120, 72), 'on_accent': '#ffffff',
           'aether': H(.50, .120, 235), 'money': H(.48, .160, 262), 'required': H(.48, .190, 27)},
}
