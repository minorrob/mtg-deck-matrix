"""Compiles tokens.json the way the format doc describes, then wraps previews in a harness for a local render check."""
import json, os, re
S = '/tmp/claude-0/-home-claude/be56a0b0-0e35-53a2-bcd9-d28c80a8623c/scratchpad/'
P = S + 'ds/project/'
T = json.load(open(P + 'tokens.json'))
themes = [t['id'] for t in T['color']['themes']]
def val(tok, th):
    v = tok['value']
    if isinstance(v, str): v = {themes[0]: v}
    x = v.get(th, v.get(themes[0]))
    if isinstance(x, str) and x.startswith('{'): x = f'var(--{x[1:-1]})'
    return x
css = ''
for i, th in enumerate(themes):
    sel = f':root, [data-theme="{th}"]' if i == 0 else f'[data-theme="{th}"]'
    decl = ''.join(f"--{t['name']}:{val(t, th)};" for t in T['color']['tokens'] if i == 0 or not isinstance(t['value'], str))
    decl += ''.join(f"--{t['name']}:{val(t, th)};" for t in T['shadow']['tokens'] if i == 0 or not isinstance(t['value'], str))
    css += f'{sel}{{{decl}}}\n'
other = ''.join(f"--{t['name']}:{t['value']};" for fam in ('spacing', 'radius', 'text', 'font', 'size') for t in T[fam]['tokens'])
other += ''.join(f"--font-{k}:{v};" for k, v in T['type']['families'].items())
css += f':root{{{other}}}\n'
for f in T['type']['fonts']:
    css += f"@font-face{{font-family:'{f['family']}';font-weight:{f['weight']};src:url('{f['file']}')}}\n"
open(P + '_test_tokens.css', 'w').write(css)
os.makedirs(P + '_harness', exist_ok=True)
for comp in os.listdir(P + 'components'):
    pv = P + f'components/{comp}/preview.html'
    if not os.path.exists(pv): continue
    h = open(pv).read()
    h = h.replace('<head>', '<head><link rel="stylesheet" href="../_test_tokens.css"><link rel="stylesheet" href="../components/bundle.css">', 1)
    for th in ('dark', 'light', 'bronze-dark', 'chalk-light'):
        open(P + f'_harness/{comp}-{th}.html', 'w').write(h.replace('<html', f'<html data-theme="{th}"', 1).replace("url('fonts/", "url('../fonts/"))
print('harness ok')
