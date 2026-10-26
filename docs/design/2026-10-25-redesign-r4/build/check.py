from spec import *; from colormath import *
import itertools
def report(skin, reg, verbose=False):
    p = full(skin, reg); c = contrast; hc = skin == 'chalk-coal'; T = 7 if hc else 4.5
    rows = [('ink/bg', 'ink', 'bg', T), ('ink/panel', 'ink', 'panel', T), ('ink/raised', 'ink', 'raised', T), ('ink/accent_soft', 'ink', 'accent_soft', T),
      ('muted/bg', 'muted', 'bg', T), ('muted/panel', 'muted', 'panel', T), ('muted/raised', 'muted', 'raised', T),
      ('on_accent/accent', 'on_accent', 'accent', T), ('on_accent/accent_hover', 'on_accent', 'accent_hover', T), ('on_required/required', 'on_required', 'required', T),
      ('bg/ink', 'bg', 'ink', T), ('money/bg', 'money', 'bg', T), ('money/panel', 'money', 'panel', T), ('required/bg', 'required', 'bg', T), ('required/panel', 'required', 'panel', T),
      ('aether/bg', 'aether', 'bg', T), ('decision_ink/decision_bg', 'decision_ink', 'decision_bg', T),
      ('owned/panel', 'owned', 'panel', 3), ('coming/panel', 'coming', 'panel', 3), ('needed/panel', 'needed', 'panel', T), ('out/panel', 'out', 'panel', T),
      ('accent/bg', 'accent', 'bg', 3), ('accent/panel', 'accent', 'panel', 3), ('field_line/panel', 'field_line', 'panel', 3), ('field_line/raised', 'field_line', 'raised', 3),
      ('aether/panel', 'aether', 'panel', 3), ('owned2/panel', 'owned2', 'panel', 3), ('needed2/panel', 'needed2', 'panel', 3), ('faint/panel', 'faint', 'panel', 3),
      ('line_strong/panel', 'line_strong', 'panel', 2), ('line/bg', 'line', 'bg', 1.3), ('line/panel', 'line', 'panel', 1.3), ('panel/bg', 'panel', 'bg', 1.1)]
    if reg == 'dark': rows.append(('raised/panel', 'raised', 'panel', 1.3))
    fails = [(n, round(c(p[a], p[b]), 2), t) for n, a, b, t in rows if c(p[a], p[b]) < t]
    sep = []
    for a, b in [('accent', 'money'), ('accent', 'required'), ('money', 'required'), ('accent', 'coming'), ('owned', 'coming'), ('owned', 'out')]:
        v = min([delta_e(p[a], p[b])] + [delta_e(simulate(p[a], k), simulate(p[b], k)) for k in ('protan', 'deutan', 'tritan')])
        sep.append(f'{a[:4]}~{b[:4]} {v:.3f}')
    print(f'== {skin} {reg}: {len(rows)-len(fails)}/{len(rows)} pass', fails or '', '|', ', '.join(sep))
    if verbose: print('   ', ' '.join(f'{k}={v}' for k, v in p.items()))
for s in SKINS:
    for r in ('dark', 'light'): report(s, r, verbose=True)
for r in ('dark','light'):
    g = GILT[r]; print('gilt', r, 'on/acc %.2f' % contrast(g['on_accent'], g['accent']), 'acc~money %.3f' % delta_e(g['accent'], g['money']))
