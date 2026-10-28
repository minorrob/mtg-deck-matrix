#!/bin/bash
# Rebuilds the whole r4 pack from build/spec.py: token files, app blocks, guidelines, frames, contrast pages, readmes,
# the token map and the changelog. It applies the change to a scratch copy of the repo and runs the token test there,
# so the numbers in the docs are the ones the test sees.
#
#   bash build/build_all.sh            # everything but the renders
#   bash build/build_all.sh renders    # and every frame in every skin and register (needs Playwright)
#
# CM_REPO     the repo checkout to compare against (default: three folders up from this pack)
# CM_SCRATCH  where the scratch copy goes (default /tmp/cm-r4)
set -e
PACK=$(cd "$(dirname "$0")/.." && pwd)
export CM_REPO=${CM_REPO:-$(cd "$PACK/../../.." && pwd)}
export CM_SCRATCH=${CM_SCRATCH:-/tmp/cm-r4}
cd "$PACK/build"
python3 gen_app.py "$PACK" > /dev/null
python3 glyphs.py "$PACK/project/glyphs.js" > /dev/null
python3 page_directions.py > /dev/null
python3 gen_guidelines.py > /dev/null
python3 gen_guidelines2.py > /dev/null
python3 gen_warmth.py > /dev/null
python3 gen_frames.py > /dev/null
python3 gen_contrast.py
# scratch copy of the repo: apply r4 and run the token test
rm -rf "$CM_SCRATCH/sandbox" && mkdir -p "$CM_SCRATCH/sandbox"
(cd "$CM_REPO" && tar --exclude=node_modules --exclude=.git --exclude=docs -cf - .) | (cd "$CM_SCRATCH/sandbox" && tar -xf -)
D="$CM_SCRATCH/sandbox/docs/design/2026-10-25-redesign-r4" && mkdir -p "$D" && cp -r "$PACK/project" "$PACK/pr" "$D/"
(cd "$CM_SCRATCH/sandbox" && node docs/design/2026-10-25-redesign-r4/pr/apply-r4.mjs && node --check crankmagic-app.js && node --check crankmagic-graph.js && node --check crankmagic-sw.js && node --check tests/type-final.mjs && node tests/design-tokens.mjs | tail -1)
mkdir -p "$PACK/pr/diffs"
for f in assets/crankmagic/README.md crankmagic-design.css crankmagic.css crankmagic-stage.css crankmagic-app.js crankmagic-graph.js crankmagic-sw.js index.html privacy.html terms.html THIRD-PARTY-NOTICES.md tests/design-tokens.mjs tests/a11y-app.mjs tests/type-final.mjs; do
  git diff --no-index --no-color "$CM_REPO/$f" "$CM_SCRATCH/sandbox/$f" | sed -e "s#a$CM_REPO/#a/#" -e "s#b$CM_SCRATCH/sandbox/#b/#" > "$PACK/pr/diffs/$(echo $f | tr / _).diff" || true
done
python3 gen_changelog.py && python3 gen_readme.py && python3 gen_changelog_doc.py
if [ "$1" = "renders" ]; then
  (cd "$PACK" && python3 -m http.server 8765 >/dev/null 2>&1 &) ; sleep 1
  PACK_DIR="$PACK" python3 - <<'PY'
import json, os
P = os.environ['PACK_DIR']; B = 'http://localhost:8765/project/frames/'; R = P + '/renders/'
jobs = []
for skin in ['sapphire-obsidian', 'bronze-basalt', 'chalk-coal']:
    for reg in ['dark', 'light']:
        os.makedirs(R + f'{skin}-{reg}', exist_ok=True)
        for f in ['decks-hub', 'deck-overview', 'deck-hundred', 'play-lobby', 'play-fullscreen']:
            for w in (1440, 390):
                jobs.append({"url": B + f + f".html?skin={skin}&theme={reg}", "out": R + f"{skin}-{reg}/{f}-{w}.png", "w": w, "h": 900 if w > 400 else 844,
                             "full": f != 'play-fullscreen' or w < 400, "fit": w < 400 and f != 'play-fullscreen'})
os.makedirs(R + 'before-after', exist_ok=True)
jobs.append({"url": B + "decks-hub.html?skin=sapphire-obsidian&theme=dark", "out": R + "before-after/after-decks-hub-1920.png", "w": 1920, "h": 1080, "full": True})
json.dump(jobs, open('/tmp/cm-r4-jobs.json', 'w'))
PY
  node shoot.js /tmp/cm-r4-jobs.json && python3 gen_before_after.py && python3 gen_gallery.py
fi
echo BUILD-OK
