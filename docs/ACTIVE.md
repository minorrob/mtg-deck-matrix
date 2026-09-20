# Who holds the work

| | |
| --- | --- |
| **Holder** | Claude Code (Fable 5.1), local session on Personal-HP |
| **Branch** | `claude/f1-lobby-logic`, PR [#275](https://github.com/minorrob/mtg-deck-matrix/pull/275), stacked on `claude/readiness-on-main`, PR [#274](https://github.com/minorrob/mtg-deck-matrix/pull/274) (the #268 → #269 → #270 stack merged with `main` at `ca782b4`) |
| **Since** | 2026-09-19 |
| **Doing** | Merged #272 to `main` (data refresh + star-schema Live Load) after re-running its checks. Tied off the Live Load on [#273](https://github.com/minorrob/mtg-deck-matrix/pull/273): v22 resaved in Excel, upgrades priced from the catalog. Brought the readiness stack onto `main` here (7 conflicts, all asset pins and generated docs; 92 suites green). **F.1 done** on #275: seat shaping, the paste parser, the strip and backfill, Ready Up's catalog checks, the saved lobby shape, server seat ids, Start's gate and the prepare body moved from `crankmagic-game.js` into `crankmagic-lobby.js` behind `tests/crankmagic-lobby.mjs` (188 checks), with a guard that fails if any of it comes back. The move exposed that the paste parser never split on line feeds, so the paste path had never seated a deck; fixed test-first. Lobby rendered before and after: identical text, only commander art differs run to run. 92 suites green. |
| **Next for whoever picks this up** | Merge order is #274 then #275 (or #275 rebased onto `main` once #274 lands). Then C.2 (connection panel) and C.1 (unknown-card swap UI), both now buildable against the lobby module; E.4; C.6 needs a Forge build on this machine. The target table is any 2–4 seats in any mix of human and AI, including a seat driven by Claude through the Chrome extension that can also troubleshoot mid-game. §12 of `game/docs/readiness-plan-2026-09-18.md` steps 4–9 still need a person and a second browser. |

Update this file as your last act. Rules: `AGENTS.md`.
