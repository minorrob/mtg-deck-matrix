#!/bin/sh
# Every Node suite, with an exit code you can trust.
#
# The obvious one-liner --  for f in tests/*.mjs; do node "$f" || echo "FAIL $f"; done  --
# exits 0 no matter what, because the exit code belongs to the last `echo`. A red suite
# scrolls past under a thousand green lines and the run ends looking like a pass. That
# happened, and something got pushed on the strength of it. So: count the failures, name
# them again at the end where they cannot be missed, and exit non-zero.
#
#   ./runtests.sh            every suite
#   ./runtests.sh -q         one line per suite, output only from the ones that fail
#
# BOTH TREES, ONE RUNNER. game/tests/ holds the CrankMagic Online suites -- the table
# lifecycle, the broker, the guest gateway, the pilots. They lived outside this loop for
# long enough that a green run here said nothing about whether a game could be played,
# and the one suite that had the stale-asset drift pinned went unrun while guests were
# handed dead invitations. A suite nobody runs is a suite that does not exist.
#
# SEVERAL AT A TIME, NONE FOREVER. tools/run-suites.mjs runs them: SUITE_JOBS at once (the
# cores less one, at most four), the browser suites one at a time among themselves, and a
# suite still running after SUITE_TIMEOUT_MINUTES (20) stopped and failed -- one that
# waited on a page for good held the whole gate on 2026-10-03. The report is in the
# suites' order and ends as it always did.
set -u
exec node tools/run-suites.mjs "$@"
