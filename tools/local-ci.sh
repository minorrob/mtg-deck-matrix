#!/bin/sh
# The Tests workflow, on this machine, for a commit -- when GitHub Actions cannot run it.
#
#   tools/local-ci.sh              the checked-out commit, run twice
#   tools/local-ci.sh <ref> [runs] any commit, run <runs> times (default 2)
#   tools/local-ci.sh <ref> 0      before a push: the scan and the clean merge with main, no suites
#
# WHY. The repository is private and on GitHub's free plan, so Actions has a monthly
# allowance of minutes and a $0 budget: once the allowance is spent, every job refuses to
# start until the next billing cycle. That happened on 2026-09-27. Rob chose not to wait:
# while Actions is out, a PR merges on this gate instead (AGENTS.md, "Merging to main").
#
# WHEN ACTIONS CAN RUN, the Actions run is the gate and this full run is not repeated on
# the builder's machine (Rob, 2026-10-01: "decrease the # of scans avoiding those that are
# redundant ... Prefer to leave with github"). Before a push the builder runs the suites the
# change touches, and `tools/local-ci.sh <ref> 0`: the scan below, which must happen before
# anything reaches GitHub, and the merge with main, in seconds.
#
# WHAT MAKES IT THE SAME RUN, NOT "IT PASSED ON MY MACHINE".
#   - A clean checkout of the exact commit (a throwaway git worktree), so an uncommitted
#     file, a stray build output or an unstaged fix can neither help nor hide anything.
#   - When main has moved past the commit's base, the merge of main into it: the tree
#     that would land, not the tree that was pushed.
#   - The workflow's own toolchain, checked rather than assumed: Node 22, Playwright
#     1.56.0 with its Chromium, Python with openpyxl. A missing one fails the gate; it
#     never lets a suite skip itself.
#   - Both of the workflow's steps with its environment: runtests.sh -q under
#     GEOMETRY_REQUIRED=1 PAGE_BUDGET_REQUIRED=1, then node --test game/tests/*.test.mjs.
#   - Every step twice by default. CI ran twice per pushed PR commit (push and
#     pull_request); a suite that passes once and fails once is caught here the same way.
#   - A scan of what the commit adds on top of main for anything that must never be
#     committed: private keys, cloud keys and tokens, and personal email addresses.
#
# The last lines are the record: paste them into the PR before merging.
set -u

ROOT=$(git rev-parse --show-toplevel) || exit 2
cd "$ROOT" || exit 2
REF=${1:-HEAD}
RUNS=${2:-2}
SHA=$(git rev-parse --verify "$REF^{commit}") || { echo "local-ci: no such commit: $REF"; exit 2; }

fail() { echo "local-ci: FAIL -- $*"; exit 1; }

case "$RUNS" in ''|*[!0-9]*) echo "local-ci: runs must be a whole number, got: $RUNS"; exit 2 ;; esac

# The toolchain the workflow installs (not needed for the scan alone).
if [ "$RUNS" -gt 0 ]; then
node_major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)
[ "$node_major" = "22" ] || fail "Node 22 is required (the workflow's), found $(node --version 2>/dev/null || echo none)"
pw=$(node -p 'require("playwright/package.json").version' 2>/dev/null)
[ "$pw" = "1.56.0" ] || fail "Playwright 1.56.0 is required (the workflow's), found ${pw:-none}; npm install --no-save --no-package-lock playwright@1.56.0"
node -e 'const {chromium}=require("playwright"); require("fs").accessSync(chromium.executablePath())' 2>/dev/null ||
  fail "Playwright's Chromium is not installed"
python3 -c 'import openpyxl' 2>/dev/null || fail "Python's openpyxl is required (tests/generators.mjs reads the workbook with it)"
fi

git fetch -q origin main 2>/dev/null || echo "local-ci: could not fetch main; using the local origin/main"
MAIN=$(git rev-parse --verify origin/main^{commit}) || fail "no origin/main"

WORK=$(mktemp -d "${TMPDIR:-/tmp}/local-ci.XXXXXX")
cleanup() { git worktree remove --force "$WORK" >/dev/null 2>&1; rm -rf "$WORK"; }
trap cleanup EXIT INT TERM
git worktree add -q --detach "$WORK" "$SHA" || fail "could not check out $SHA"

TREE_NOTE="the commit itself (main $(git rev-parse --short "$MAIN") is its ancestor)"
if ! git merge-base --is-ancestor "$MAIN" "$SHA"; then
  ( cd "$WORK" && git -c user.name=local-ci -c user.email=local-ci@localhost merge -q --no-edit "$MAIN" >/dev/null 2>&1 ) ||
    fail "$SHA does not merge cleanly with main $(git rev-parse --short "$MAIN")"
  TREE_NOTE="the merge of main $(git rev-parse --short "$MAIN") into it"
fi

# The workflow installs Playwright into its checkout; the worktree borrows this one's.
[ "$RUNS" -gt 0 ] && [ -d "$ROOT/node_modules" ] && ln -s "$ROOT/node_modules" "$WORK/node_modules"

# What the commit adds on top of main, scanned. Only added lines count: a line the commit
# removes is the commit fixing something, not leaking it.
BASE=$(git merge-base "$MAIN" "$SHA")
added=$(git diff --no-color -U0 "$BASE" "$SHA" -- . ':(exclude)*.xlsx' ':(exclude)*.png' ':(exclude)*.jpg' ':(exclude)*.webp' ':(exclude)*.woff2' | grep '^+' | grep -v '^+++')
leaks=$(printf '%s\n' "$added" | grep -n -E -i \
  -e '-----BEGIN [A-Z ]*PRIVATE KEY-----' \
  -e 'AKIA[0-9A-Z]{16}' \
  -e 'gh[pousr]_[A-Za-z0-9]{36,}' \
  -e 'github_pat_[A-Za-z0-9_]{40,}' \
  -e 'sk-ant-[A-Za-z0-9_-]{20,}' \
  -e 'xox[abpr]-[A-Za-z0-9-]{10,}' \
  -e '(api[_-]?key|api[_-]?token|secret|password)["'"'"' ]*[:=] *["'"'"'][A-Za-z0-9_/+=-]{16,}["'"'"']' \
  -e '[A-Za-z0-9._%+-]+@(gmail|googlemail|outlook|hotmail|yahoo|icloud|me|live|aol|proton|protonmail)\.[a-z]{2,}' |
  cut -c1-160)
[ -z "$leaks" ] || { printf '%s\n' "$leaks"; fail "the commit adds what looks like a secret or a personal address (above)"; }

# Before a push, when Actions will run the suites: the scan and the merge are the whole check.
if [ "$RUNS" -eq 0 ]; then
  echo "local-ci: SCAN PASS"
  echo "  commit    $SHA"
  echo "  merge     $TREE_NOTE: clean"
  echo "  scan      no secrets or personal addresses added on top of main"
  echo "  suites    none here: the Actions run is the gate"
  exit 0
fi

started=$(date +%s)
i=1
while [ "$i" -le "$RUNS" ]; do
  echo "local-ci: run $i of $RUNS on $(git rev-parse --short "$SHA")"
  ( cd "$WORK" && GEOMETRY_REQUIRED=1 PAGE_BUDGET_REQUIRED=1 bash runtests.sh -q ) > "$WORK.run$i.log" 2>&1
  status=$?
  tail -n 3 "$WORK.run$i.log"
  [ $status -eq 0 ] || { grep -E '^  FAIL|^FAILED' "$WORK.run$i.log"; fail "runtests.sh, run $i (log: $WORK.run$i.log)"; }
  ( cd "$WORK" && GEOMETRY_REQUIRED=1 PAGE_BUDGET_REQUIRED=1 node --test game/tests/*.test.mjs ) > "$WORK.node$i.log" 2>&1 ||
    { tail -n 30 "$WORK.node$i.log"; fail "node --test game/tests, run $i (log: $WORK.node$i.log)"; }
  grep -E '^# (tests|pass|fail) ' "$WORK.node$i.log" | tr '\n' ' '; echo
  i=$((i + 1))
done
suites=$(grep -o '[0-9]* suites passed' "$WORK.run1.log")
rm -f "$WORK".run*.log "$WORK".node*.log

echo
echo "local-ci: PASS"
echo "  commit    $SHA"
echo "  tested    $TREE_NOTE, from a clean checkout"
echo "  toolchain Node $(node --version), Playwright $pw + Chromium, $(python3 -c 'import openpyxl; print("openpyxl " + openpyxl.__version__)')"
echo "  runs      $RUNS x (runtests.sh -q: $suites; node --test game/tests), GEOMETRY_REQUIRED=1 PAGE_BUDGET_REQUIRED=1"
echo "  scan      no secrets or personal addresses added on top of main"
echo "  time      $(( $(date +%s) - started ))s"
