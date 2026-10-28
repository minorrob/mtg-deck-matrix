"""Shared helpers for the pack's generated HTML pages."""
import os as _os
from pathlib import Path as _P
PACK = str(_P(__file__).resolve().parents[1]) + '/'
REPO = _os.environ.get('CM_REPO', str(_P(__file__).resolve().parents[4])) + '/'
SCRATCH = _os.environ.get('CM_SCRATCH', '/tmp/cm-r4') + '/'
import json, os
from colormath import contrast, simulate, delta_e, hex_to_oklch
from glyphs import svg
R4 = PACK
PAL = json.load(open(os.path.join(R4, 'build', 'palette.json')))

def head(title, root='..', extra='', theme='dark', skin_switch=True, doc=True):
    sw = f'<script src="{root}/skin.js" data-root="{root}"></script>' if skin_switch else ''
    return (f'<!doctype html><html lang="en" data-theme="{theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{title}</title><link rel="stylesheet" href="{root}/styles.css">{sw}'
            f'<link rel="stylesheet" href="{root}/components.css">' + (f'<link rel="stylesheet" href="{root}/doc.css">' if doc else '') + f'{extra}</head>')

def write(rel, html):
    p = os.path.join(R4, rel); os.makedirs(os.path.dirname(p), exist_ok=True); open(p, 'w').write(html)

def vars_for(p):
    """Inline custom properties for a palette dict (spec keys) so one page can show several palettes."""
    m = {'bg': 'color-bg', 'panel': 'color-panel', 'raised': 'color-raised', 'line': 'color-line', 'line_strong': 'color-line-strong',
         'field_line': 'color-field-line', 'ink': 'color-ink', 'muted': 'color-muted', 'faint': 'color-faint', 'accent': 'color-accent',
         'accent_hover': 'color-accent-hover', 'accent_soft': 'color-accent-soft', 'on_accent': 'color-on-accent', 'aether': 'color-aether',
         'money': 'color-money', 'required': 'color-required', 'owned': 'st-inbox', 'owned2': 'st-pull', 'coming': 'st-ordered',
         'needed': 'st-buy', 'needed2': 'st-standin', 'out': 'st-remove'}
    return ';'.join(f'--{v}:{p[k]}' for k, v in m.items() if k in p)

def ratio(a, b): return contrast(a, b)
def fmt(r): return f'{r:.2f}:1'
def cvd_min(a, b):
    vals = [delta_e(a, b)] + [delta_e(simulate(a, k), simulate(b, k)) for k in ('protan', 'deutan', 'tritan')]
    return min(vals)
