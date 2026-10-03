# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Print cards' type line, cost, power and toughness, and oracle text, from the committed oracle data -- what a batch's
definitions are written from. Usage, from the repository root:

    python game/tools/batch/oracle-show.py "Leonin Warleader" "Parhelion II"
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cardlib import Batch  # noqa: E402

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
batch = Batch(os.getcwd())
for name in sys.argv[1:]:
    c = batch.card(name)
    pt = f" {c['power']}/{c['toughness']}" if c.get('power') is not None else ''
    print(f"== {name} | {c['type']} | {c['mana'] or 'no cost'}{pt}")
    print(c['text'])
