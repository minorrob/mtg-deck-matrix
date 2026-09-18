# Blocker: lobby-start is still G0 stub

## Observed (from game.js actions["lobby-start"])
On Ready+legal pod, Start only shows a notice:

> N seats, bracket B, NAME on the play. The board is the next thing to build. This lobby is G0.

No `/api/prepare`, `/api/start`, or Forge launch.

## CONFIDENT criterion impact
Matrix harness will classify this as `blocker:G0_STUB` (exit 2), not CONFIDENT.

## Minimal HP-only direction (do not tip-merge yet)
Wire `actions["lobby-start"]` after `allReadyForStart(t)` to either:

1. **Online host path** (preferred if host on :8768 is up):
   - POST `/api/prepare` with seats derived from `activeSeats()` / table seating
   - POST `/api/start` with prepare id
   - Poll `/api/live` until `starting` → `ready`/`playing`
   - Navigate/hash to live table UI (or show “Forge is loading…” notice)

2. **Interim**: keep G0 notice but change copy only if Start must remain stubbed — harness will still fail CONFIDENT until real handoff exists.

## Keep
- createDeck fallback when `ensureLobbyDraft` missing
- Archidekt hidden
- seatMappedOk / Ready Up gates

## HOLD
START-TEST full productization / Facelift / tip merge
