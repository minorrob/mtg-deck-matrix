"""Generates one contrast page per skin from the same palette the token files come from. Nothing here is typed by hand."""
import json, csv, io
from pagekit import *
from spec import full
TXT = [('Ink on ground','ink','bg'),('Ink on panel','ink','panel'),('Ink on raised control','ink','raised'),('Ink on hover fill','ink','hover'),('Ink on accent soft (selected row)','ink','accent_soft'),
       ('Muted on ground','muted','bg'),('Muted on panel','muted','panel'),('Muted on raised','muted','raised'),
       ('On-accent on accent (primary button)','on_accent','accent'),('On-accent on accent hover','on_accent','accent_hover'),('On-required on required (danger fill)','on_required','required'),
       ('Ground on ink (selected chip, tab, checkbox)','bg','ink'),
       ('Money on ground','money','bg'),('Money on panel','money','panel'),('Required on ground','required','bg'),('Required on panel','required','panel'),
       ('Aether on ground','aether','bg'),('Aether on panel','aether','panel'),('Decision ink on decision ground','decision_ink','decision_bg'),
       ('To buy on panel','needed','panel'),('Remove on panel','out','panel')]
MARK = [('Accent on ground (icons, large text)','accent','bg',3),('Accent on panel (the primary button edge)','accent','panel',3),
        ('In box glyph and bar on panel','owned','panel',3),('Ordered glyph and bar on panel','coming','panel',3),('Field line on panel (input edge)','field_line','panel',3),('Field line on raised','field_line','raised',3),
        ('Aether focus ring on panel','aether','panel',3),('Aether focus ring on raised','aether','raised',3),('Pull step on panel','owned2','panel',3),('Stand-in step on panel','needed2','panel',3),
        ('Faint (disabled) on panel','faint','panel',3),('Strong line on panel','line_strong','panel',2),('Line on ground','line','bg',1.3),('Line on panel','line','panel',1.3),
        ('Panel on ground (plane 2)','panel','bg',1.1),('Raised on panel (plane 3)','raised','panel',1.3)]
def rows(skin, reg):
    p = full(skin, reg); hc = skin == 'chalk-coal'; out = []
    for n, a, b in TXT:
        t = 7.0 if hc else 4.5; out.append((n, 'text', a, b, p[a], p[b], contrast(p[a], p[b]), t))
    for n, a, b, t in MARK:
        if n.startswith('Raised on panel') and reg == 'light': t = None   # carried by the 3:1 field line, see note
        out.append((n, 'mark' if t and t >= 3 else 'plane', a, b, p[a], p[b], contrast(p[a], p[b]), t))
    return out
summary = {}
for skin in PAL['order']:
    S = PAL['skins'][skin]; hc = skin == 'chalk-coal'
    secs = ''; csvbuf = io.StringIO(); w = csv.writer(csvbuf); w.writerow(['skin','register','pair','kind','fg','bg','fg_hex','bg_hex','ratio','target','pass'])
    fails = 0; total = 0
    for reg in ('dark', 'light'):
        rs = rows(skin, reg); p = full(skin, reg)
        tr = ''
        for n, kind, a, b, fa, fb, r, t in rs:
            ok = (t is None) or r >= t; total += 1; fails += (not ok)
            w.writerow([skin, reg, n, kind, a, b, fa, fb, f'{r:.2f}', t if t else 'n/a', 'yes' if ok else 'NO'])
            tt = f'≥ {t:g}' if t else 'border carries it'
            tr += f'<tr><td>{n}</td><td><span class="chip-sw" style="background:{fa}"></span><span class="mono">{fa}</span></td><td><span class="chip-sw" style="background:{fb}"></span><span class="mono">{fb}</span></td><td class="n">{r:.2f}:1</td><td class="n note">{tt}</td><td class="{"pass" if ok else "fail"}">{"pass" if ok else "fail"}</td></tr>'
        ladder = ''.join(f'<tr><td class="mono">{k}</td><td><span class="chip-sw" style="background:{p[k]}"></span><span class="mono">{p[k]}</span></td><td class="n">{hex_to_oklch(p[k])[0]:.3f}</td><td class="n">{hex_to_oklch(p[k])[1]:.3f}</td><td class="n">{hex_to_oklch(p[k])[2]:.0f}°</td></tr>'
                         for k in ['bg','panel','raised','hover','line','line_strong','field_line','faint','muted','ink','accent','on_accent','money','required','on_required','aether','owned','owned2','coming','needed','needed2'])
        cvd = ''
        for a, b in [('accent','money'),('accent','required'),('money','required'),('owned','out'),('owned','coming'),('accent','owned'),('accent','coming')]:
            vals = [delta_e(p[a], p[b])] + [delta_e(simulate(p[a], k), simulate(p[b], k)) for k in ('protan','deutan','tritan')]
            cvd += f'<tr><td>{a} vs {b}</td>' + ''.join(f'<td class="n {"pass" if v>=.08 else "fail"}">{v:.3f}</td>' for v in vals) + '</tr>'
        secs += f'''<section><h2>{reg.title()} register</h2><div class="grid" style="--min:520px;align-items:start">
<div style="display:grid;gap:10px"><table class="data"><tr><th>Pair</th><th>Foreground</th><th>Ground</th><th class="n">Ratio</th><th class="n">Target</th><th></th></tr>{tr}</table></div>
<div style="display:grid;gap:16px"><table class="data"><tr><th>Token</th><th>Hex</th><th class="n">L</th><th class="n">C</th><th class="n">h</th></tr>{ladder}</table>
<table class="data"><tr><th>Signals apart (oklab ΔE)</th><th class="n">Typical</th><th class="n">Protan</th><th class="n">Deutan</th><th class="n">Tritan</th></tr>{cvd}</table></div></div></section>'''
    summary[skin] = (total, fails)
    target = '7:1 for every text pair (the high-contrast skin)' if hc else '4.5:1 for text'
    html = (head(f'Contrast · {S["name"]}', root='..', skin_switch=False) + f'<body class="cm"><main class="doc"><header class="doc-head"><span class="cm-label">CrankMagic r4 · contrast, generated</span><h1>{S["name"]}</h1>'
            f'<p>{S["place"]} Every value below is computed from build/spec.py, the same source the token files are written from. Targets: {target}, 3:1 for marks, edges and the focus ring, 2:1 for the strong line, 1.3:1 for dividers and plane steps. {total - fails} of {total} pairs pass.</p>'
            f'<p class="note">In the light register a white control on a near-white panel cannot reach 1.3:1 by fill without graying the page; the control\'s 3:1 field line carries the plane instead, and that pair is in the table. Status chips set their word in ink and carry the hue in the glyph and the bar, so the owned and ordered hues are measured as marks at 3:1; to buy and remove share the money and required hues and are measured as text.</p><p class="note">Signals apart is the oklab distance between two signals for typical vision and the three simulated color vision types; 0.08 is the working floor. A pair under it is still told apart by the glyph and the word, never by hue alone (G9).</p></header>{secs}'
            '</main></body></html>')
    write(f'project/contrast/{skin}.html', html)
    write(f'project/contrast/{skin}.csv', csvbuf.getvalue())
print(summary)
