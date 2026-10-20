# ROB-18 prototype: layout assertions reject the old rotation and an obstructive hand overlay.
SUITES = ['ui-prototypes/phone-focus/preview.mjs']
BREAKS = [
    ('phone rotates to landscape again', 'ui-prototypes/phone-focus/phone-layout.css',
     'height:100dvh;transform:none;display:grid', 'height:100dvh;transform:rotate(90deg);display:grid'),
    ('hand overlay covers the turn controls', 'ui-prototypes/phone-focus/phone-layout.css',
     'inset:auto 0 0;max-height:min(65dvh,calc(100dvh - 116px))', 'inset:0;max-height:100dvh'),
]
