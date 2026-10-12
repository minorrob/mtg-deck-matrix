# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Check that every break in the repository still breaks something: each anchor is found once, and only once.

A break is a (label, file, find, replace) tuple in a breaks file (breaks.py's docstring). Later merges move code, so an
anchor that once matched can match nothing -- the break then changes nothing and "proves" nothing -- or match twice, and
breaks.py refuses it. This finds every breaks file (a .py under game/tools/batch or tools that assigns BREAKS) and
reports, without running a suite:

    not once      the anchor is found 0 or 2+ times in its file
    no file       the file a break names does not exist
    no change     the replacement is the anchor itself
    no suite      a suite in SUITES does not exist
    bad shape     an entry is not (label, file, find, replace) strings

Usage, from the repository root (or name the root): python3 game/tools/batch/anchors.py [root]
Prints a JSON summary; exits 1 when anything is reported. tests/engine-breaks-anchors.mjs runs it.
"""
import json
import os
import re
import runpy
import sys

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.getcwd())
DIRS = ('game/tools/batch', 'tools')
ASSIGNS = re.compile(r'^BREAKS\s*=', re.M)


def breaks_files():
    found = []
    for d in DIRS:
        base = os.path.join(ROOT, d)
        if not os.path.isdir(base):
            continue
        for name in sorted(os.listdir(base)):
            path = os.path.join(base, name)
            if name.endswith('.py') and os.path.isfile(path):
                with open(path, encoding='utf-8') as f:
                    if ASSIGNS.search(f.read()):
                        found.append(os.path.relpath(path, ROOT).replace(os.sep, '/'))
    return found


def check(rel):
    problems, count = [], 0
    spec = runpy.run_path(os.path.join(ROOT, rel))
    for suite in spec.get('SUITES', []):
        if not os.path.isfile(os.path.join(ROOT, suite)):
            problems.append({'kind': 'no suite', 'file': rel, 'suite': suite})
    texts = {}
    for entry in spec['BREAKS']:
        count += 1
        if not (isinstance(entry, (tuple, list)) and len(entry) >= 4 and all(isinstance(x, str) for x in entry[:4])):
            problems.append({'kind': 'bad shape', 'file': rel, 'entry': repr(entry)[:120]})
            continue
        label, target, find, replace = entry[:4]
        if find == replace:
            problems.append({'kind': 'no change', 'file': rel, 'label': label})
        path = os.path.join(ROOT, target)
        if target not in texts:
            texts[target] = open(path, encoding='utf-8').read() if os.path.isfile(path) else None
        if texts[target] is None:
            problems.append({'kind': 'no file', 'file': rel, 'label': label, 'target': target})
            continue
        n = texts[target].count(find)
        if n != 1:
            problems.append({'kind': 'not once', 'file': rel, 'label': label, 'target': target, 'found': n})
    return problems, count


files = breaks_files()
problems, total = [], 0
for rel in files:
    p, n = check(rel)
    problems += p
    total += n
print(json.dumps({'files': len(files), 'breaks': total, 'problems': problems}, indent=1))
sys.exit(1 if problems else 0)
