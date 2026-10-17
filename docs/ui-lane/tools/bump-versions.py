"""The asset-version cascade (docs/ui-lane/README.md): bump the changed files' ?v= in both pages and the service worker,
then the service worker's in the app, then the app's in the pages and the worker. Run from the repository root, then
`node tests/asset-versions.mjs --update`."""
import re, sys, pathlib
ROOT = pathlib.Path.cwd()
CHANGED = ["crankmagic-stage.css", "crankmagic-stage.js"]   # the files this change ships; edit before each run
PAGES = ["index.html", "crankmagic.html", "crankmagic-sw.js"]

def bump(files, asset):
    pat = re.compile(re.escape(asset) + r"\?v=(\d+)")
    seen = set()
    for f in files:
        p = ROOT / f
        s = p.read_text()
        def rep(m):
            seen.add(int(m.group(1)))
            return f"{asset}?v={int(m.group(1)) + 1}"
        n = pat.sub(rep, s)
        if n != s:
            p.write_text(n)
    print(asset, sorted(seen), "->", [v + 1 for v in sorted(seen)])
    if len(seen) > 1:
        sys.exit(f"{asset}: versions disagree across files: {sorted(seen)}")

for a in CHANGED:
    bump(PAGES, a)
bump(["crankmagic-app.js"], "crankmagic-sw.js")
bump(PAGES, "crankmagic-app.js")
