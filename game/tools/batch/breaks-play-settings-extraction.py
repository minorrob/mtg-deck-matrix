# ROB-99: removing the extracted feature must break the rendered Settings page.
SUITES = ['tests/settings-r3.mjs']
BREAKS = [
    ('Play card registration is missing', 'crankmagic-settings-play.js',
     'C.settingsPlayCard=card=>{', 'C.settingsPlayCardMissing=card=>{'),
    ('step preference is not saved', 'crankmagic-settings-play.js',
     'play:{...play,stepByStep:on}', 'play:{...play,stepByStep:!on}'),
]
