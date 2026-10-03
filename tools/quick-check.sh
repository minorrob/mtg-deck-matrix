#!/bin/sh
# Before a push, while GitHub Actions can run: the scan and the clean merge with main (tools/local-ci.sh HEAD 0), then
# only the suites the change touches. The whole suite is the Actions run's (AGENTS.md, "No run twice what another run
# already proved").
#
#   tools/quick-check.sh tests/engine-goad.mjs tests/engine-cards.mjs tests/engine-catalog.mjs
#
# Run from the root of the branch's worktree, with the workflow's Node first on PATH (on Personal-HP:
# C:/Users/robmi/CrankMagic/workbench/node22/node_modules/node-win-x64/bin). Exits non-zero if the scan or a suite fails.
unset UAT_CHROME UAT_PLAYWRIGHT
sh tools/local-ci.sh HEAD 0 || { echo "quick-check: FAIL -- the scan or the merge with main"; exit 1; }
status=0
for suite in "$@"; do
  started=$(date +%s)
  out=$(node --stack-size=4000 "$suite" 2>&1); rc=$?
  if [ $rc -eq 0 ]; then echo "  ok   $suite ($(( $(date +%s) - started ))s)"; else echo "  FAIL $suite"; printf '%s\n' "$out" | tail -15; status=1; fi
done
if [ $status -eq 0 ]; then echo "quick-check: PASS on $(git rev-parse --short HEAD)"; else echo "quick-check: FAIL on $(git rev-parse --short HEAD)"; fi
exit $status
