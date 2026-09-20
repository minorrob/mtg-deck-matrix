# Who holds the work

| | |
| --- | --- |
| **Holder** | Claude Code (Fable 5.1), local session on Personal-HP |
| **Branch** | `claude/c1-unknown-card-swap`, off `main` at `f9a6e4f` (#277, #278 merged 2026-09-19) |
| **Since** | 2026-09-19 |
| **Doing** | **C.1 done**: `game/ui/unresolved.mjs` turns B.2's refusal into a swap (a row per unknown card, Forge's suggestion prefilled, a catalog search with type line and art on hover, one button that re-submits with `replacements`); the seat builder applies the pairs before the Forge check (`applyReplacements`, never mutating a shared list); drawn on the guest seat lobby, the host's Prepare and the host's next-deck panel. 5 tests from the refusal's real shape. 96 suites green. Next: W.2 (reload prompt for a waiting worker), then W.3. |
| **Next for whoever picks this up** | The shared queue is `docs/app-walkthrough-plan-2026-09-19.md` §4: W.1 → C.1 → W.2 → W.3 → W.4 → E.4 → W.5 → W.6 → C.6 → W.7. Online items keep their definitions in `game/docs/readiness-plan-2026-09-18.md`. The target table is any 2–4 seats in any mix of human and AI, including a seat driven by Claude through the Chrome extension that can also troubleshoot mid-game. §12 steps 4–9 of the readiness plan still need a person and a second browser. |

Update this file as your last act. Rules: `AGENTS.md`.
