# Ready / Not ready — Grok live UAT 2026-09-22 (evening)

**Surfaces:** Personal-HP tip `claude/uat-r0-r1b` @ `8b76c69` · Pages `https://minorrob.github.io/mtg-deck-matrix/` · host `http://127.0.0.1:8768`

## Ready for use (personal / workshop)

- **Build and browse decks** on Pages or local (`#decks`, New deck control present)
- **Library acquire shell** on Pages or local (Library / To buy / Orders + List/Sheet/Table + status filters)
- **Explore** entry chooser + catalog count (~31,830 cards) on Pages or local
- **Local game setup UI** at `http://127.0.0.1:8768/review` (Prepare decks / Launch game / bracket & AI counts)
- **Personal Commander workshop loop** Decks → Library → Explore on your own machine or Pages (empty UAT profile ≠ your Chrome library)

## Not ready for production use

- **Cloud `#game` as live multiplayer** — same seat mock as local app lobby; does **not** mirror a live host table (U-05)
- **Remote guests / friends over the internet** — table rules showed **Remote guests off**; no verified public tunnel this run
- **Pages Start as a real game start** — **Start stays enabled with nobody seated** and a click did nothing observable (standing-rule miss)
- **Automation Host+3AI → Forge → mid-game** — `/api/setup` returned **403 Invalid local session** from this harness; full Start→Forge→R3 **not reconfirmed** tonight
- **Shipping tip remediations as “live on Pages”** — treat Pages and tip `8b76c69` as **different trains** until you merge/deploy; local tip holds R0/R1 in source
- **Guest first-minutes polish & product calls** still open (U-13 remainder, U-09 10s self-start, U-07 board chrome)
