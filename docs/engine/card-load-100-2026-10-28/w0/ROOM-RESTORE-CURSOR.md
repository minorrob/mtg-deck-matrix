# Restored room event cursor

The actual Scepter committed-choice room exposed an existing cursor error after reload. Before its eventless private
input, default Watch had no events; afterward it re-emitted the already committed Scepter tap (`event:91`). Engine
state, RNG, journal and the native pending question were unchanged. The independent fixed-client-cursor privacy test
still passed; the error was in the default batch boundary, not new private card information.

Journal IDs start at one. A checkpoint's `sequence` is the last written ID; normal `write` already sets `nextSeq` to
that ID plus one. Restore instead used the last ID itself. The fix changes only restore's `nextSeq` initialization
to `point.sequence + 1`. It never resets or renumbers the journal, drops history/events, changes retention floors,
or hides the old event from a client explicitly requesting it.

`tests/room-restore-cursor.mjs` first failed on a real native checkpoint with `eventsMark` 118 instead of 119.
It now passes 31 checks: accepted/refused/retried eventless inputs, private Cancel, JSON reload, unchanged engine and
journal facts, preserved retained events/floor, normal next write IDs, exactly one next batch, and full native replay.
A fresh native zero-journal fixture checks no phantom event or reset; no existing journal is erased to make that case.
Repeated decks and the fresh boundary fixture are diagnostics, not Commander-load evidence.

Original readers remain intact: `room-events` 32 (including actual retention-floor/reset behavior and public/secret
delivery), `engine-projection` 93 (three full games with no leaks), and `game-replay` 14. The causal mutation driver
keeps all three in its baseline with the new regression; its restore-line reversion is caught with `missed: []`.
Full wave acceptance and UI gates remain with root.
