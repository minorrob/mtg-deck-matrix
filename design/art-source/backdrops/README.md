# The 3D table's backdrop clips

The originals are in Rob's Google Drive folder **Backdrop videos** and are not committed: about 72 MB of video
that would sit in this public repository's history for good. What ships is `tools/stage-backdrops.mjs`'s output
under `assets/environments/`.

To change the backdrops, put every clip that should be offered here (the folder replaces the whole list; the
first by name is the default) and run:

    node tools/stage-backdrops.mjs

It needs ffmpeg and ffprobe (on Windows: `winget install Gyan.FFmpeg`). Each clip is framed at 16:9, looped
without a seam, and kept at 720, 1080 and 1440 lines up to its own size; the stage plays the height the
Graphics resolution calls for, 1440 (2K) at most.

| Clip (2026-10-26) | Source | Kept at |
| --- | --- | --- |
| Dwarven King | 2544×1456, 24 fps, 10.1 s | 720, 1080, 1440 |
| Goblin Stronghold | 2544×1456, 24 fps, 10.1 s | 720, 1080, 1440 |
| Golden Fields | 2544×1456, 24 fps, 10.1 s | 720, 1080, 1440 |
| Island | 1280×720, 24 fps, 10.0 s | 720 |
| Japanese Samurai | 2544×1456, 24 fps, 10.1 s | 720, 1080, 1440 |
| Studious Retreat | 2544×1456, 24 fps, 10.1 s | 720, 1080, 1440 |
