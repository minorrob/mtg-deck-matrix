# Who holds the work

| | |
| --- | --- |
| **Holder** | Claude Code (Fable 5.1), local session on Personal-HP |
| **Branch** | `claude/w1-walkthrough-fixes`, stacked on `claude/walkthrough-plan-2026-09-19` (PR #277), off `main` at `3a03f2a` |
| **Since** | 2026-09-19 |
| **Doing** | **W.1 done**: D1 (New deck's three doors threw "dialog is not defined"), D2 (Play help printed `undefined`), D4 (user-facing dates were UTC; `M.today()` now), D9 (compare ticks went through the serialized save; in memory now). `tests/feature-wiring.mjs` holds all four shut by reading the source; it was red on each before the fix. 95 suites green. Next: C.1. |
| **Next for whoever picks this up** | The shared queue is `docs/app-walkthrough-plan-2026-09-19.md` §4: W.1 → C.1 → W.2 → W.3 → W.4 → E.4 → W.5 → W.6 → C.6 → W.7. Online items keep their definitions in `game/docs/readiness-plan-2026-09-18.md`. The target table is any 2–4 seats in any mix of human and AI, including a seat driven by Claude through the Chrome extension that can also troubleshoot mid-game. §12 steps 4–9 of the readiness plan still need a person and a second browser. |

Update this file as your last act. Rules: `AGENTS.md`.
