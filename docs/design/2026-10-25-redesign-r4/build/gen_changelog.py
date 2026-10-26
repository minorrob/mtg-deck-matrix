import os as _os
from pathlib import Path as _P
PACK = str(_P(__file__).resolve().parents[1]) + '/'
REPO = _os.environ.get('CM_REPO', str(_P(__file__).resolve().parents[4])) + '/'
SCRATCH = _os.environ.get('CM_SCRATCH', '/tmp/cm-r4') + '/'
import re, os
OLD = open(REPO + 'crankmagic-design.css').read()
NEW = open(SCRATCH + 'sandbox/crankmagic-design.css').read()
def blocks(css):
    bare = re.sub(r'/\*[\s\S]*?\*/', '', css); out = {}
    for m in re.finditer(r'([^{}]+)\{([^{}]*)\}', bare):
        sel = m.group(1).strip(); d = dict((k, v.strip()) for k, v in re.findall(r'(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);?', m.group(2)))
        if d: out.setdefault(sel, {}).update(d)
    return out
def pick(bs, pat):
    r = {}
    for sel, d in bs.items():
        if re.search(pat, sel): r.update(d)
    return r
ob, nb = blocks(OLD), blocks(NEW)
o_dark = pick(ob, r'(^|,)\s*#matrix-v2\s*$'); o_light = pick(ob, r'#matrix-v2\[data-theme="light"\]\s*$')
o_moss = pick(ob, r'#matrix-v2\[data-palette="moss-iron"\]\s*$'); o_steel = pick(ob, r'#matrix-v2\[data-palette="steel-cobalt"\]\s*$')
n_dark = pick(nb, r'(^|,)\s*#matrix-v2\s*$'); n_light = pick(nb, r'#matrix-v2\[data-theme="light"\]\s*$')
n_vd = pick(nb, r'#matrix-v2\[data-palette="bronze-basalt"\]\s*$'); n_vl = pick(nb, r'#matrix-v2\[data-palette="bronze-basalt"\]\[data-theme="light"\]\s*$')
n_cd = pick(nb, r'#matrix-v2\[data-palette="chalk-coal"\]\s*$'); n_cl = pick(nb, r'#matrix-v2\[data-palette="chalk-coal"\]\[data-theme="light"\]\s*$')
from spec import full
from colormath import contrast as _c
_d, _l = full('sapphire-obsidian','dark'), full('sapphire-obsidian','light')
R = lambda a,b,p: f"{_c(p[a],p[b]):.2f}:1"
NOTES = {
 '--color-accent': f"Sapphire replaces brass. Carries its own on-accent ink at {R('on_accent','accent',_d)} dark, {R('on_accent','accent',_l)} light, so --accent-fill no longer darkens it.",
 '--color-on-accent': 'White on the accent in both registers (dark ink on the Chalk & Coal dark accent).',
 '--color-on-required': f"New. Words on the danger fill: {R('on_required','required',_d)} dark, {R('on_required','required',_l)} light. The dark crimson is bright enough to be text on the ground, so its fill takes dark words.",
 '--st-ordered': 'Blue to aether teal, so ordered can never be read as the sapphire button.',
 '--color-money': f"Same gold family; light register now {R('money','bg',_l)} on ground (was 3.41:1).",
 '--color-aether': f"Light register now {R('aether','bg',_l)} on ground (was 2.39:1).",
 '--color-raised': f"Dark: {R('raised','panel',_d)} on panel (was 1.12:1). Light: white; its {R('field_line','raised',_l)} field line carries the plane.",
 '--color-line': f"{R('line','bg',_d)} on ground dark, {R('line','bg',_l)} light (was 1.44:1 and 1.35:1).",
 '--text-h1': 'One token holds the clamp; every screen h1 reads it (apply-r4.mjs edits the five rules).',
 '--text-small': '12 to 13: nothing under 12 in the scale.', '--text-label': '11 to 12.',
 '--radius-control': 'One radius set for every skin; skins no longer override.', '--radius-card': '', '--radius-tile': '',
 '--motion-fast': 'One motion for every skin.', '--motion-ease': '',
 '--shadow-card': 'Neutral; skins no longer override.',
 '--v-field-line': f"Was a light-dark() literal shared by every theme; now each skin's own --color-field-line ({R('field_line','panel',_d)} dark, {R('field_line','panel',_l)} light on panel).",
 '--v-line-strong': 'Was a light-dark() literal; now --color-line-strong.',
 '--v-decision-bg': 'Literal to --color-decision-bg', '--v-decision-line': 'Literal to --color-decision-line', '--v-decision-ink': 'Literal to --color-decision-ink', '--v-decision-field': 'Literal to --color-decision-field',
 '--v-required': 'Now --color-required (was --st-remove).', '--v-soft': 'color-mix() to the precomputed --color-accent-soft.',
 '--accent-fill': 'The darkening override for Felt & Cream and Steel & Cobalt is gone; every r4 accent carries its own ink.',
 '--st-watch': 'Moved from a light-dark() literal into each skin\'s color block.', '--st-draft': 'Same.', '--st-reserved': 'Same; now the owned family\'s light step.', '--st-physical': 'Same; now the owned family\'s base.',
 '--poster-ground': 'Warm black to obsidian black, to sit on the new ground.',
 '--font-display': 'Cinzel 600, from Rob\'s reference: page titles, the deck title and the CrankMagic wordmark. Moss & Iron\'s Barlow override is gone.', '--display-case': 'Moss & Iron\'s uppercase override is gone; Cinzel makes its own capitals.', '--font-body': 'Lato 400 and 700, from Rob\'s reference, for everything read.', '--display-weight': '600: Cinzel\'s weight in the reference.', '--display-tracking': '.04em: roman capitals want air.',
 '--font-hero': 'The display face at hero size (var(--font-display)); Young Serif is retired.',
}
names = sorted(set(o_dark) | set(o_light) | set(n_dark) | set(n_light), key=lambda k: (not k.startswith('--color'), not k.startswith('--mana'), not k.startswith('--st'), k.startswith('--v-'), k))
def cell(v): return f'`{v}`' if v else '·'
lines = ['| Token | r3 dark (Brass & Slate) | r3 light (Felt & Cream) | r3 Moss & Iron | r3 Steel & Cobalt | r4 dark (Sapphire & Obsidian) | r4 light | Note |', '|---|---|---|---|---|---|---|---|']
counts = {'changed': 0, 'new': 0, 'same': 0, 'gone': 0}
for k in names:
    od, ol, nd, nl = o_dark.get(k), o_light.get(k), n_dark.get(k), n_light.get(k)
    if od is None and ol is None: status = 'new'
    elif nd is None and nl is None: status = 'gone'
    elif (od, ol) == (nd, nl) or (od == nd and ol is None and nl is None): status = 'same'
    else: status = 'changed'
    counts[status] += 1
    note = NOTES.get(k, '')
    if status == 'new' and not note: note = 'New in r4.'
    lines.append(f'| `{k}` | {cell(od)} | {cell(ol)} | {cell(o_moss.get(k))} | {cell(o_steel.get(k))} | {cell(nd)} | {cell(nl)} | {status}{". " + note if note else ""} |')
skin_lines = ['| Token | Bronze & Basalt dark | light | Chalk & Coal dark | light |', '|---|---|---|---|---|']
for k in [k for k in n_vd]:
    skin_lines.append(f'| `{k}` | `{n_vd.get(k)}` | `{n_vl.get(k)}` | `{n_cd.get(k)}` | `{n_cl.get(k)}` |')
open(PACK + 'pr/token-map.md', 'w').write('\n'.join(lines) + '\n')
open(PACK + 'pr/skin-map.md', 'w').write('\n'.join(skin_lines) + '\n')
print(counts, len(names), len(n_vd))
