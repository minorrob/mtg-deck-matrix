#!/usr/bin/env bash
# In the given checkout: generated files from the merged sources, and the README's suite count.
cd "$1" || exit 2
for f in game/engine/cards/definitions.mjs docs/engine/coverage.md docs/engine/catalog.md game/docs/engine-catalog.json; do
  if git diff --name-only --diff-filter=U | grep -qx "$f"; then git checkout --ours "$f"; fi
done
node game/tools/engine-definitions.mjs --write >/dev/null && node game/tools/engine-coverage.mjs --write >/dev/null || exit 1
node game/tools/engine-catalog.mjs --write >/dev/null 2>&1; node game/tools/engine-catalog.mjs --check || exit 1
n=$(ls tests/*.mjs | wc -l); sed -i -E "s/There are [0-9]+ Node suites here/There are $n Node suites here/" README.md
grep -o "There are [0-9]* Node suites" README.md
node tools/data-inventory.mjs --check
