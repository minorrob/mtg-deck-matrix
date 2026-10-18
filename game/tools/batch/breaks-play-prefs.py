# ROB-124: My play preferences (confirmations, stops, auto-pass, camera and sound defaults).
# Each break is a mutation of the app code that the new test must catch.
# Run: python3 game/tools/batch/breaks.py game/tools/batch/breaks-play-prefs.py
# Expected: all breaks caught (missed: [])

SUITES = ['tests/settings-play-prefs.mjs']
BREAKS = [
    ('default tilt changed from 40° to 35°', 'crankmagic-settings-play.js',
     'const PLAY_DEFAULTS={stepByStep:false,overlay:60,confirmCast:false,autoPassScope:\'never\',camera:{tilt:40,zoom:100,cards:100},sound:{sfx:0.5,bgm:0.18,muted:false}};',
     'const PLAY_DEFAULTS={stepByStep:false,overlay:60,confirmCast:false,autoPassScope:\'never\',camera:{tilt:35,zoom:100,cards:100},sound:{sfx:0.5,bgm:0.18,muted:false}};'),
    ('default sfx changed from 0.5 to 0.4', 'crankmagic-settings-play.js',
     'const PLAY_DEFAULTS={stepByStep:false,overlay:60,confirmCast:false,autoPassScope:\'never\',camera:{tilt:40,zoom:100,cards:100},sound:{sfx:0.5,bgm:0.18,muted:false}};',
     'const PLAY_DEFAULTS={stepByStep:false,overlay:60,confirmCast:false,autoPassScope:\'never\',camera:{tilt:40,zoom:100,cards:100},sound:{sfx:0.4,bgm:0.18,muted:false}};'),
    ('default bgm changed from 0.18 to 0.2', 'crankmagic-settings-play.js',
     'const PLAY_DEFAULTS={stepByStep:false,overlay:60,confirmCast:false,autoPassScope:\'never\',camera:{tilt:40,zoom:100,cards:100},sound:{sfx:0.5,bgm:0.18,muted:false}};',
     'const PLAY_DEFAULTS={stepByStep:false,overlay:60,confirmCast:false,autoPassScope:\'never\',camera:{tilt:40,zoom:100,cards:100},sound:{sfx:0.5,bgm:0.2,muted:false}};'),
    ('confirmCast toggle removed', 'crankmagic-settings-play.js',
     'actions[\'set-confirm-cast\']=async()=>{const play=(C.state.preferences||{}).play||{},on=play.confirmCast!==true;await commit({type:\'preferences\',values:{play:{...play,confirmCast:on}}});notice(on?\'The board will ask before casting a spell.\':\'Chosen spells are cast at once again.\');};',
     ''),
    ('autoPassScope dropdown removed', 'crankmagic-settings-play.js',
     'document.addEventListener(\'change\',async ev=>{const el=ev.target.closest?.(\'[data-settings-autopass]\');if(!el)return;',
     'document.addEventListener(\'change\',async ev=>{const el=ev.target.closest?.(\'[data-NEVER-MATCHES]\');if(!el)return;'),
    ('camera tilt slider removed', 'crankmagic-settings-play.js',
     '<input type="range" min="0" max="60" step="1" value="${p.camera.tilt}" data-settings-camera="tilt"',
     '<input type="text" value="${p.camera.tilt}" data-settings-camera="tilt"'),
    ('camera zoom slider removed', 'crankmagic-settings-play.js',
     '<input type="range" min="60" max="120" step="1" value="${p.camera.zoom}" data-settings-camera="zoom"',
     '<input type="text" value="${p.camera.zoom}" data-settings-camera="zoom"'),
    ('sound sfx slider removed', 'crankmagic-settings-play.js',
     '<input type="range" min="0" max="100" step="1" value="${Math.round(p.sound.sfx*100)}" data-settings-sound="sfx"',
     '<input type="text" value="${Math.round(p.sound.sfx*100)}" data-settings-sound="sfx"'),
    ('sound bgm slider removed', 'crankmagic-settings-play.js',
     '<input type="range" min="0" max="100" step="1" value="${Math.round(p.sound.bgm*100)}" data-settings-sound="bgm"',
     '<input type="text" value="${Math.round(p.sound.bgm*100)}" data-settings-sound="bgm"'),
    ('sound mute toggle removed', 'crankmagic-settings-play.js',
     'actions[\'set-sound-muted\']=async()=>{const play=(C.state.preferences||{}).play||{},sound=play.sound||{},on=sound.muted!==true;await commit({type:\'preferences\',values:{play:{...play,sound:{...sound,muted:on}}}});notice(on?\'Sound muted.\':\'Sound on.\');};',
     ''),
]
