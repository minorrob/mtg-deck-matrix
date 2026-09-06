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
set -u

quiet=0
[ "${1:-}" = "-q" ] && quiet=1

failed=""
count=0
for f in tests/*.mjs; do
  count=$((count + 1))
  if [ "$quiet" -eq 1 ]; then
    out=$(node "$f" 2>&1)
    status=$?
    if [ $status -eq 0 ]; then
      printf '  ok   %s\n' "$f"
    else
      printf '  FAIL %s\n%s\n' "$f" "$out"
      failed="$failed $f"
    fi
  else
    printf '\n===== %s =====\n' "$f"
    node "$f" || failed="$failed $f"
  fi
done

echo
if [ -n "$failed" ]; then
  echo "FAILED:$failed"
  exit 1
fi
echo "$count suites passed."
