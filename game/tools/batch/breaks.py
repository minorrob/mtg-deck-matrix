# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Break each change a batch makes, one at a time, and prove a suite catches every one.

A breaks file is Python that defines two names:

    SUITES = ['tests/engine-goad.mjs', 'tests/engine-cards.mjs']          # repository-relative
    BREAKS = [
        # (label, file, the exact text to find -- once, and only once -- and what to put in its place)
        ('goader offered', 'game/engine/rules/combat.mjs', '        if (elsewhere && goaders.includes(defender)) continue;\\n', ''),
    ]

The suites run unbroken first: a suite that already fails would "catch" every break, so the run stops there. Then each
break is applied, the suites run until one fails, and the file is put back. An anchor found other than once is
reported, never guessed at. Usage, from the repository root:

    python game/tools/batch/breaks.py <breaks-file.py> [label ...]

NODE names the node binary (default: node, from PATH). Write breaks files with an editor, not a shell heredoc: a
heredoc can drop a backslash from every "\\n" in an anchor.
"""
import os
import runpy
import shutil
import subprocess
import sys

if len(sys.argv) < 2:
    sys.exit(__doc__)
spec = runpy.run_path(sys.argv[1])
SUITES, BREAKS = spec['SUITES'], spec['BREAKS']
ONLY = set(sys.argv[2:])
ROOT = os.getcwd()
NODE = os.environ.get('NODE', 'node')


def first_failing():
    for suite in SUITES:
        try:
            run = subprocess.run([NODE, '--stack-size=4000', suite], cwd=ROOT, capture_output=True, text=True, timeout=600)
        except subprocess.TimeoutExpired:
            return suite + ' (timed out)'
        if run.returncode != 0:
            return suite
    return None


failing = first_failing()
if failing:
    sys.exit(f'BASELINE FAILS: {failing} -- fix it before breaking anything')
print('baseline: every suite passes unbroken')
missed = []
for label, rel, anchor, replacement in BREAKS:
    if ONLY and label not in ONLY:
        continue
    path = os.path.join(ROOT, rel)
    with open(path, encoding='utf-8') as f:
        source = f.read()
    if source.count(anchor) != 1:
        print(f'?? {label}: anchor found {source.count(anchor)} times')
        missed.append(label)
        continue
    shutil.copyfile(path, path + '.bak')
    try:
        with open(path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(source.replace(anchor, replacement))
        caught = first_failing()
        print(('caught' if caught else 'MISSED'), label, '--', caught or '')
        if not caught:
            missed.append(label)
    finally:
        shutil.copyfile(path + '.bak', path)
        os.remove(path + '.bak')
print('missed:', missed)
sys.exit(1 if missed else 0)
