#!/usr/bin/env bash
# PRODUCTION, ON ROB'S GO: origin/main built for crankmagic.com, walked, and committed to release/pages -- and never
# pushed by this script. The push is Rob's go (Part 7's G-F; docs/release-production.md), so it ends by printing it.
#
#   WRANGLER=<path to wrangler.js> bash tools/release-production.sh <profile> <release checkout> [work dir]
#
# <profile>           cloud-production-standby, then cloud-production. Production has never registered the table
#                     class, and Cloudflare rolls back across no class change: the first Play release is the standby,
#                     Play closed and the class registered, whose deployed version is then the recovery target; the
#                     second opens Play (docs/production-play-profile-2026-10-07.md).
# <release checkout>  a git worktree kept for releases, with node_modules. The script checks out origin/main there,
#                     detached, as tools/release-staging.sh does: the release is built by main's own rules.
# [work dir]          where the build, the commit tree and the logs go (default: a new temporary directory).
#
# It builds with tools/release-pages.mjs, serves the build on port 8797 and walks it with
# tests/uat/release-acceptance.mjs, and runs tests/uat/production-play-e2e.mjs (both production profiles under wrangler
# dev); only when both pass does it commit the build to the local release/pages. Staging is never touched.
set -euo pipefail
PROFILE="${1:?usage: WRANGLER=<wrangler.js> bash tools/release-production.sh <cloud-production-standby|cloud-production> <release checkout> [work dir]}"
case "$PROFILE" in
  cloud-production-standby|cloud-production) ;;
  *) echo "the profile is cloud-production-standby or cloud-production, not $PROFILE"; exit 2 ;;
esac
CHECKOUT="${2:?usage: WRANGLER=<wrangler.js> bash tools/release-production.sh <profile> <release checkout> [work dir]}"
WORK="${3:-$(mktemp -d)}"
: "${WRANGLER:?set WRANGLER to wrangler.js, for the Play walk}"
mkdir -p "$WORK"
export TMPDIR="$WORK"
unset UAT_CHROME UAT_PLAYWRIGHT
cd "$CHECKOUT"
git fetch -q origin
git checkout -q --detach origin/main
REF=$(git rev-parse HEAD)
echo "production release ($PROFILE) of main $REF; work in $WORK"
OUT="$WORK/build"; COMMIT="$WORK/commit"
rm -rf "$OUT" "$COMMIT"
node tools/release-pages.mjs --ref "$REF" --profile "$PROFILE" --out "$OUT"
node tools/serve-folder.mjs "$OUT" 8797 > "$WORK/serve.log" 2>&1 &
SERVER=$!
sleep 3
set +e
UAT_BASE=http://crankmagic.localhost:8797 UAT_STATIC=1 UAT_LIVE_NETWORK=1 node tests/uat/release-acceptance.mjs > "$WORK/acceptance.log" 2>&1
ACCEPTANCE=$?
WRANGLER="$WRANGLER" node tests/uat/production-play-e2e.mjs > "$WORK/play.log" 2>&1
PLAY=$?
kill "$SERVER" 2>/dev/null
set -e
tail -2 "$WORK/acceptance.log"; tail -2 "$WORK/play.log"
if [ $ACCEPTANCE -ne 0 ] || [ $PLAY -ne 0 ]; then echo "PRODUCTION NOT BUILT: acceptance=$ACCEPTANCE play=$PLAY (logs in $WORK)"; exit 1; fi
git branch -f release/pages origin/release/pages
node tools/release-pages.mjs --ref "$REF" --profile "$PROFILE" --commit --out "$COMMIT"
echo "release/pages $(git rev-parse --short release/pages) is built for main $REF ($PROFILE) and walked; it is NOT pushed."
echo "On Rob's go, and only then: git -C $CHECKOUT push origin release/pages"
