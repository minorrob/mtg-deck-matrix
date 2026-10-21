# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The tabletop's renderer in a release (Linear ROB-144): tools/release-pages.mjs (RENDERERS, the families the stage
loads, the files a Play release must carry, the license that travels with Babylon's engine, and both families left out
where Play is off).

Run from the repository root, with nothing else editing the worktree:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-release-renderer.py
"""
SUITES = ['tests/release-pages.mjs']
R = 'tools/release-pages.mjs'
BREAKS = [
    # The families
    ('Babylon required as its engine alone', R,
     '  babylon: {engine: "vendor/babylon.min.js", files: ["crankmagic-stage-babylon.js", "crankmagic-stage-tables.js", "vendor/babylon.min.js", "vendor/BABYLON-LICENSE.txt"]},\n',
     '  babylon: {engine: "vendor/babylon.min.js", files: ["vendor/babylon.min.js"]},\n'),
    ('Babylon not left out where Play is off', R,
     '"crankmagic-stage.js", "crankmagic-stage.css", ...RENDERER_FILES];',
     '"crankmagic-stage.js", "crankmagic-stage.css", ...RENDERERS.pixi.files];'),
    # What the stage loads
    ('a renderer named in a comment taken for one the stage loads', R,
     '  const code = stripComments(String(text));\n',
     '  const code = String(text);\n'),
    ('a stage that loads both renderers let through', R,
     '          if (families.length !== 1) problems.push(',
     '          if (families.length === 0) problems.push('),
    ('a stage that loads no renderer let through', R,
     '          if (families.length !== 1) problems.push(',
     '          if (families.length > 1) problems.push('),
    # What the release must carry
    ('both families required of every Play release', R,
     '          for (const f of [...PLAY_CLOUD_BASE, ...(families.length === 1 ? RENDERERS[families[0]].files : [])]) if (!files.has(f))',
     '          for (const f of PLAY_CLOUD) if (!files.has(f))'),
    ('no renderer required at all', R,
     '          for (const f of [...PLAY_CLOUD_BASE, ...(families.length === 1 ? RENDERERS[families[0]].files : [])]) if (!files.has(f))',
     '          for (const f of PLAY_CLOUD_BASE) if (!files.has(f))'),
    ('Babylon\'s license left behind by the walk', R,
     '  if (file === "vendor/babylon.min.js") add("BABYLON-LICENSE.txt");\n',
     ''),
]
