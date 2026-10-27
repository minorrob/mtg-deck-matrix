import os as _os
from pathlib import Path as _P
PACK = str(_P(__file__).resolve().parents[1]) + '/'
REPO = _os.environ.get('CM_REPO', str(_P(__file__).resolve().parents[4])) + '/'
SCRATCH = _os.environ.get('CM_SCRATCH', '/tmp/cm-r4') + '/'
import re, csv
from spec import full
from colormath import contrast
S=PACK
t=open(S+'build/readme.tmpl.md').read()
d,l=full('sapphire-obsidian','dark'),full('sapphire-obsidian','light')
row=lambda lbl,keys: f"| {lbl} | " + ' '.join(f'`{d[k]}`' for k in keys) + ' | ' + ' '.join(f'`{l[k]}`' for k in keys) + ' |'
table='\n'.join(['| | Dark | Light |','|---|---|---|',row('Ground, panel, raised',['bg','panel','raised']),row('Line, strong line, field line',['line','line_strong','field_line']),
  row('Ink, muted, faint',['ink','muted','faint']),row('Accent, on-accent',['accent','on_accent']),row('Money, required, aether',['money','required','aether']),row('Owned, ordered, on-required',['owned','coming','on_required'])])
t=t.replace('{{PALETTE_TABLE}}',table)
t=re.sub(r'\{\{R:(\w+):(\w+):(dark|light)\}\}',lambda m:f"{contrast(full('sapphire-obsidian',m.group(3))[m.group(1)],full('sapphire-obsidian',m.group(3))[m.group(2)]):.2f}:1",t)
from colormath import delta_e, simulate
t=re.sub(r'\{\{CVD:([\w-]+):(dark|light):(\w+):(\w+)\}\}',lambda m:(lambda p:f"{min(delta_e(simulate(p[m.group(3)],k),simulate(p[m.group(4)],k)) for k in ('protan','deutan','tritan')):.3f}")(full(m.group(1),m.group(2))),t)
rows=list(csv.DictReader(open(S+'project/contrast/sapphire-obsidian.csv')))
t=t.replace('{{PASS}}',f"{sum(r['pass']=='yes' for r in rows)} of {len(rows)}")
assert '{{' not in t
open(S+'project/readme.md','w').write(t); print('readme ok')

# skin readmes, numbers computed
from spec import SKINS
BODY = {
 'bronze-basalt': "The same sapphire, gold, crimson and emerald on warm stone instead of cold. Use it when someone wants the table to feel like a hall rather than a night sky. Only the neutrals change, so every hue keeps its job.",
 'chalk-coal': "The high-contrast skin: every text pair at 7:1 or better, lines at 2:1 or better, edges at 3:1. Use it on a TV across the room, in bright light, or for anyone who wants XAG 102's high-contrast mode.",
}
for skin in ('bronze-basalt', 'chalk-coal'):
    d, l = full(skin, 'dark'), full(skin, 'light'); s = SKINS[skin]
    rows = list(csv.DictReader(open(S + f'project/contrast/{skin}.csv')))
    txt = f"""# {s['name']}

{s['place']}

{BODY[skin]}

A skin of the CrankMagic r4 system: this folder sets colors only. Type, shape, motion and every component are the governing system's (../../readme.md).

| | Dark | Light |
|---|---|---|
| Ground, panel, raised | `{d['bg']}` `{d['panel']}` `{d['raised']}` | `{l['bg']}` `{l['panel']}` `{l['raised']}` |
| Ink, muted | `{d['ink']}` `{d['muted']}` | `{l['ink']}` `{l['muted']}` |
| Accent, on-accent | `{d['accent']}` `{d['on_accent']}` | `{l['accent']}` `{l['on_accent']}` |
| Aether | `{d['aether']}` | `{l['aether']}` |

- On-accent text {contrast(d['on_accent'], d['accent']):.2f}:1 dark, {contrast(l['on_accent'], l['accent']):.2f}:1 light.
- Muted on panel {contrast(d['muted'], d['panel']):.2f}:1 dark, {contrast(l['muted'], l['panel']):.2f}:1 light.
- {sum(r['pass']=='yes' for r in rows)} of {len(rows)} pairs pass (../../contrast/{skin}.html).

Money, required and the status families keep the governing hues, tuned only in lightness.
"""
    open(S + f'project/design-systems/{skin}/readme.md', 'w').write(txt)
print('skin readmes ok')
