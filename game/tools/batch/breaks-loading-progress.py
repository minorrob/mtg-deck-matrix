"""
Mutations that tests/loading-progress.mjs must catch.

Each mutation breaks the loading progress feature in a specific way.
The test suite must fail on each one, then pass when restored.
Run with: python3 game/tools/batch/breaks.py game/tools/batch/breaks-loading-progress.py
"""

breaks = [
    {
        'name': 'Remove progressbar role',
        'file': 'crankmagic-progress.js',
        'find': 'role="progressbar"',
        'replace': 'role="status"',
        'should_fail': 'progress component shows during card catalog load',
    },
    {
        'name': 'Remove aria-valuenow',
        'file': 'crankmagic-progress.js',
        'find': 'aria-valuenow="${indeterminate ? \'\' : \'0\'}"',
        'replace': 'aria-valuenow=""',
        'should_fail': 'progress is monotonic (never decreases)',
    },
    {
        'name': 'Remove aria-valuemax',
        'file': 'crankmagic-progress.js',
        'find': 'aria-valuemax="100"',
        'replace': 'aria-valuemax="0"',
        'should_fail': 'progress component shows during card catalog load',
    },
    {
        'name': 'Break monotonic check',
        'file': 'crankmagic-progress.js',
        'find': '// Monotonic only - never go backwards\n      if (value < lastValue) return;',
        'replace': '// Monotonic disabled\n      // if (value < lastValue) return;',
        'should_fail': 'progress is monotonic (never decreases)',
    },
    {
        'name': 'Never complete',
        'file': 'crankmagic-progress.js',
        'find': 'element.remove();',
        'replace': '// element.remove();',
        'should_fail': 'progress hides on completion',
    },
    {
        'name': 'Break percentage formatting',
        'file': 'crankmagic-progress.js',
        'find': 'const formatted = value.toLocaleString(\'en-US\');',
        'replace': 'const formatted = String(value);',
        'should_fail': 'uses en-US number formatting',
    },
    {
        'name': 'Remove indeterminate class',
        'file': 'crankmagic-progress.js',
        'find': '${indeterminate ? \' cm-progress-indeterminate\' : \'\'}',
        'replace': '',
        'should_fail': 'indeterminate mode without Content-Length',
    },
    {
        'name': 'Remove reduced motion class',
        'file': 'crankmagic-progress.js',
        'find': '${reducedMotion ? \' cm-progress-static\' : \'\'}',
        'replace': '',
        'should_fail': 'reduced motion disables animation',
    },
    {
        'name': 'Break error state class',
        'file': 'crankmagic-progress.js',
        'find': 'element.classList.add(\'cm-progress-has-error\');',
        'replace': '// element.classList.add(\'cm-progress-has-error\');',
        'should_fail': 'error state shows message and instructions',
    },
    {
        'name': 'Remove progress bar element',
        'file': 'crankmagic-progress.js',
        'find': '<div class="cm-progress-bar',
        'replace': '<div class="cm-progress-hidden',
        'should_fail': 'mutation: progress bar exists',
    },
    {
        'name': 'Clamp to 98% instead of 99%',
        'file': 'card-catalog.js',
        'find': 'options.onProgress(Math.min(99,',
        'replace': 'options.onProgress(Math.min(98,',
        'should_fail': 'progress shows percentage that reaches 100',
    },
    {
        'name': 'Never reach 100%',
        'file': 'card-catalog.js',
        'find': 'if(options.onProgress){Object.keys(progress).forEach(k=>progress[k]=1);options.onProgress(100,100);}',
        'replace': 'if(options.onProgress){Object.keys(progress).forEach(k=>progress[k]=0.99);}',
        'should_fail': 'progress shows percentage that reaches 100',
    },
]
