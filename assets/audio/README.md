# The board's sound

Rob's audio pack (`crankmagic2-play-audio-generated`: 5 beds and 83 effects, 5.3 MB, with `sound-index.json`, the
index its rows are named by), as `docs/plan-play-audio.md` describes it. It was first served by the local game host
from `game/ui/assets/audio/`. This is the same pack, copied unchanged for the cloud board (B8,
`docs/plan-to-done-2026-09-30.md`), so that it outlives the local host.

`crankmagic-audio.js` is the only thing that reaches it: the index, `bgm/<slug>.mp3` for a bed and `sfx/<slug>.mp3`
for an effect. That script is Play in the cloud (`PLAY_CLOUD` in `tools/release-pages.mjs`), so a release without Play
ships none of these files.
