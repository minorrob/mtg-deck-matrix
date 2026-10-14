#!/usr/bin/env bash
# Run the given node suites in checkout $1, four at a time, each with its own log; print a tally and the failures.
cd "$1" || exit 2; shift
OUT=$1; shift; mkdir -p $OUT; rm -f $OUT/*.log $OUT/_results
printf '%s\n' "$@" | xargs -P 4 -I{} bash -c 'n=$(basename {} .mjs); node --stack-size=4000 {} > '"$OUT"'/$n.log 2>&1; echo "$? $n" >> '"$OUT"'/_results'
echo "passed $(grep -c '^0 ' $OUT/_results) of $(wc -l < $OUT/_results)"; grep -v '^0 ' $OUT/_results || true
