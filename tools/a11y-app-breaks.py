# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
# Run with: GEOMETRY_REQUIRED=1 python game/tools/batch/breaks.py tools/a11y-app-breaks.py
# Words on the accent across the app (WCAG 2.1 1.4.3): each rule back on the raw accent is caught.
SUITES = ['tests/a11y-app.mjs']
APP, DESIGN = 'crankmagic.css', 'crankmagic-design.css'
BREAKS = [
    ('the primary button on the raw accent', APP, '#matrix-v2 .v-button.primary{background:var(--accent-fill)', '#matrix-v2 .v-button.primary{background:var(--v-accent)'),
    ('the skip link on the raw accent', APP, '.cm-skip{position:fixed;left:10px;top:-60px;z-index:30;background:var(--accent-fill)', '.cm-skip{position:fixed;left:10px;top:-60px;z-index:30;background:var(--v-accent)'),
    ('the graph mode on the raw accent', APP, '.cm-graph-modes .v-button.is-on{background:var(--accent-fill)', '.cm-graph-modes .v-button.is-on{background:var(--v-accent)'),
    ('the landing step on the raw accent', APP, 'width:26px;height:26px;border-radius:50%;background:var(--accent-fill)', 'width:26px;height:26px;border-radius:50%;background:var(--v-accent)'),
    ('the landing panel on the raw accent', APP, '.cm-landing-close{padding:40px;border-radius:26px;background:var(--accent-fill)', '.cm-landing-close{padding:40px;border-radius:26px;background:var(--v-accent)'),
    ('the build step on the raw accent', APP, '.cm-build-steps li[aria-current=step]{background:var(--accent-fill)', '.cm-build-steps li[aria-current=step]{background:var(--v-accent)'),
    ('the v-primary on the raw accent', DESIGN, '#matrix-v2 .v-primary{background:var(--accent-fill)', '#matrix-v2 .v-primary{background:var(--v-accent)'),
    ('the shop tab on the raw accent', DESIGN, '#matrix-v2 .v-shop-tabs [aria-pressed=true]{background:var(--accent-fill)', '#matrix-v2 .v-shop-tabs [aria-pressed=true]{background:var(--v-accent)'),
    ('the fill not darkened in light themes', DESIGN, '{--accent-fill:color-mix(in oklab,var(--color-accent) 80%,black)}', '{--accent-fill:var(--color-accent)}'),
]
