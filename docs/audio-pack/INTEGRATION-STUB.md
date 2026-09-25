# play-audio module stub (for Claude Code)

Suggested API (do not require this exact shape):

```js
// crankmagic-play-audio.js
export function createPlayAudio({ manifestUrl, basePath, prefs }) {
  return {
    ready: Promise,           // loads manifest + decodes clips lazily
    play(key, opts),          // Resolution Rules applied by caller or here
    playForCard(card, phase), // phase: 'cast'|'etb'
    playEvent(eventKey, opts),
    setVolume(bus /* 'sfx'|'bgm' */, value01),
    setMuted(boolean),
    startBgm(key),
    stopBgm({ fadeMs }),
    dispose(),
  };
}
```

Hook points (live game only):
- Spell/permanent cast or land play → `playForCard`
- Combat declare attackers/blockers/damage → `playEvent`
- Life/poison/wipe/tokens/proliferate/dies/exile → `playEvent`
- Match ready/playing → `startBgm('bgm_game_main')`
- Settings menu → Audio panel bound to setVolume / setMuted

Manifest: use `sound-index.json` from this pack; files live beside it as `{Filename slug}.ogg`.
