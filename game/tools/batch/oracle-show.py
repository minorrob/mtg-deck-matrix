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
    # A double-faced card's text is its faces' (CR 712.8): each face, front first.
    for face in batch.faces(name) or [c]:
        pt = f" {face['power']}/{face['toughness']}" if face.get('power') is not None else ''
        label = name if face is c else f"{name} -- {'front' if face is batch.faces(name)[0] else 'back'} face, {face['name']}"
        print(f"== {label} | {face['type']} | {face['mana'] or 'no cost'}{pt}")
        print(face['text'])
