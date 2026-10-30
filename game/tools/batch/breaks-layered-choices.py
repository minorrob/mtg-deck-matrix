"""Prove the conditional-choice assertions fail when their guarantees are broken."""
from pathlib import Path
import subprocess
import json

root = Path(__file__).resolve().parents[3]
target = root / 'crankmagic-choice-flow.js'
original = target.read_text(encoding='utf-8')
mutations = [
    ('stale context accepted', 'JSON.stringify(context)!==flow.context || ', ''),
    ('legal alternatives lost', 'rows=group.rows;', 'rows=group.rows.slice(0,1);'),
    ('back retains dependent choice', 'selections:flow.selections.slice(0,-1)', 'selections:flow.selections'),
]
missed = []
try:
    for label, before, after in mutations:
        assert before in original, label
        target.write_text(original.replace(before, after, 1), encoding='utf-8')
        result = subprocess.run(['node', 'tests/choice-flow.mjs'], cwd=root, capture_output=True, timeout=30)
        if result.returncode == 0:
            missed.append(label)
finally:
    target.write_text(original, encoding='utf-8')
print(json.dumps({'mutations': len(mutations), 'missed': missed}))
assert not missed
