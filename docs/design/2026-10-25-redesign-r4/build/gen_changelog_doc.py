import os as _os
from pathlib import Path as _P
PACK = str(_P(__file__).resolve().parents[1]) + '/'
REPO = _os.environ.get('CM_REPO', str(_P(__file__).resolve().parents[4])) + '/'
SCRATCH = _os.environ.get('CM_SCRATCH', '/tmp/cm-r4') + '/'
import re, subprocess
S=PACK
t=open(S+'build/changelog.tmpl.md').read()
tm=open(S+'pr/token-map.md').read(); sm=open(S+'pr/skin-map.md').read()
statuses=re.findall(r'\| (changed|new|same|gone)', tm)
counts=', '.join(f"{statuses.count(k)} {k}" for k in ('changed','new','same','gone'))
test=subprocess.run(['node','tests/design-tokens.mjs'],cwd=SCRATCH+'sandbox',capture_output=True,text=True).stdout.strip().splitlines()[-1]
files=len([l for l in open(S+'pr/apply-r4.mjs').read().splitlines() if l.strip().startswith('set(') or 'set("tests/' in l])
n_checks=re.search(r'(\d+) checks', test).group(1)
t=t.replace('{{N_CHECKS}}',n_checks).replace('{{TOKEN_MAP}}',tm).replace('{{SKIN_MAP}}',sm).replace('{{COUNTS}}',f'{counts}.').replace('{{TEST}}',test).replace('{{FILES}}','thirteen')
assert '{{' not in t
open(S+'pr/CHANGELOG-tokens.md','w').write(t); print('changelog ok', counts)
