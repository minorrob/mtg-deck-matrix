# Who holds the work

| | |
| --- | --- |
| **Holder** | Claude Code (Fable 5.1), local session on Personal-HP |
| **Branch** | `claude/readiness-on-main` (the #268 → #269 → #270 stack merged with `main` at `ca782b4`), PR [#274](https://github.com/minorrob/mtg-deck-matrix/pull/274) |
| **Since** | 2026-09-19 |
| **Doing** | Merged #272 to `main` (data refresh + star-schema Live Load) after re-running its checks. Tied off the Live Load on [#273](https://github.com/minorrob/mtg-deck-matrix/pull/273): v22 resaved in Excel, upgrades priced from the catalog. Brought the readiness stack onto `main` here (7 conflicts, all asset pins and generated docs; 92 suites green). Now starting **F.1**: moving the lobby logic out of `crankmagic-game.js` into `crankmagic-lobby.js` behind its suite. |
| **Next for whoever picks this up** | F.1, then C.2 (connection panel) and C.1 (unknown-card swap UI) on top of it; E.4; C.6 needs a Forge build on this machine. The target table is any 2–4 seats in any mix of human and AI, including a seat driven by Claude through the Chrome extension that can also troubleshoot mid-game. §12 of `game/docs/readiness-plan-2026-09-18.md` steps 4–9 still need a person and a second browser. |

Update this file as your last act. Rules: `AGENTS.md`.
