# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES = ['tests/coach-layout.mjs']
BREAKS = [
 ('Coach header grows', 'crankmagic-coach.css', 'height:36px;min-height:36px;', 'height:49px;min-height:49px;'),
 ('questions lose upward overlay', 'crankmagic-coach.css', '.cm-coach-question-list{position:absolute;', '.cm-coach-question-list{position:static;'),
]
