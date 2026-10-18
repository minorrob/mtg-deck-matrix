# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The program readout's feeds (2026-10-18, Linear ROB-138): tests/readout-feeds.mjs holds the rules in
docs/readout/README.md so a malformed feed never reaches Rob's page. These breaks prove each class of rule can fail:
a done item that still claims hours, an outcome renamed under the feeds that cite it, and a personal address planted
in a note. From the repository root:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-readout-feeds.py
"""
SUITES = ['tests/readout-feeds.mjs']
BREAKS = [
    ('a done item still claiming hours', 'docs/readout/feeds/claude-engine.json',
     '"feature": "Auto-pass when a player has no meaningful response; an explicit Yield turn", "status": "done", "remaining_hours": 0}',
     '"feature": "Auto-pass when a player has no meaningful response; an explicit Yield turn", "status": "done", "remaining_hours": 5}'),
    ('an outcome renamed under the feeds', 'docs/readout/north-star.json',
     '"key": "share",',
     '"key": "sharing",'),
    ('a status the page does not know', 'docs/readout/feeds/grok.json',
     '"status": "backlog", "remaining_hours": 2}',
     '"status": "started", "remaining_hours": 2}'),
    ('an address planted in a note', 'docs/readout/feeds/codex-play.json',
     '"note": "Waits on Rob\'s decision."',
     '"note": "Waits on Rob\'s decision; mail someone@example.com."'),
]
