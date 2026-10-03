#!/usr/bin/env bash
# STAGING, NEVER PRODUCTION: origin/main built for crankmagic's cloud staging, walked, committed and pushed.
#
#   WRANGLER=<path to wrangler.js> bash tools/release-staging.sh <release checkout> [work dir]
#
# <release checkout>  a git worktree kept for releases, with node_modules (on Windows, a junction to the main
#                     checkout's). The script checks out origin/main there, detached: tools/release-pages.mjs reads its
#                     rules from the checkout it runs in, so a release built from a feature branch would use that
#                     branch's rules, not main's.
# [work dir]          where the build, the commit tree and the logs go (default: a new temporary directory).
#
# It builds with `tools/release-pages.mjs --profile cloud-staging`, serves the build on port 8796 and walks it with
# tests/uat/release-acceptance.mjs and tests/uat/play-e2e.mjs; only when both pass does it commit the build to
# release/cloud-staging and push. Run it after each merge of a served change, as a tracked background task -- a shell
# `&` dies with its shell. Production (release/pages) is never released without Rob's go, and never by this script.
set -euo pipefail
CHECKOUT="${1:?usage: WRANGLER=<wrangler.js> bash tools/release-staging.sh <release checkout> [work dir]}"
WORK="${2:-$(mktemp -d)}"
: "${WRANGLER:?set WRANGLER to wrangler.js, for the Play walk}"
mkdir -p "$WORK"
export TMPDIR="$WORK"
unset UAT_CHROME UAT_PLAYWRIGHT
cd "$CHECKOUT"
git fetch -q origin
git checkout -q --detach origin/main
REF=$(git rev-parse HEAD)
echo "staging release of main $REF; work in $WORK"
OUT="$WORK/build"; COMMIT="$WORK/commit"
rm -rf "$OUT" "$COMMIT"
node tools/release-pages.mjs --ref "$REF" --profile cloud-staging --out "$OUT"
node tools/serve-folder.mjs "$OUT" 8796 > "$WORK/serve.log" 2>&1 &
SERVER=$!
sleep 3
set +e
UAT_BASE=http://crankmagic.localhost:8796 UAT_STATIC=1 UAT_LIVE_NETWORK=1 node tests/uat/release-acceptance.mjs > "$WORK/acceptance.log" 2>&1
ACCEPTANCE=$?
WRANGLER="$WRANGLER" node tests/uat/play-e2e.mjs > "$WORK/play.log" 2>&1
PLAY=$?
kill "$SERVER" 2>/dev/null
# Git Bash on Windows may leave the server holding the port; stop whatever still listens there.
command -v powershell.exe >/dev/null && powershell.exe -NoProfile -Command "Get-NetTCPConnection -LocalPort 8796 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force }" >/dev/null 2>&1
set -e
tail -2 "$WORK/acceptance.log"; tail -2 "$WORK/play.log"
if [ $ACCEPTANCE -ne 0 ] || [ $PLAY -ne 0 ]; then echo "STAGING NOT RELEASED: acceptance=$ACCEPTANCE play=$PLAY (logs in $WORK)"; exit 1; fi
git branch -f release/cloud-staging origin/release/cloud-staging
node tools/release-pages.mjs --ref "$REF" --profile cloud-staging --commit --out "$COMMIT"
git push origin release/cloud-staging 2>&1 | tail -2
echo "pushed release/cloud-staging for main $REF"
