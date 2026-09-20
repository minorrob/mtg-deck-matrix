# Who holds the work

| | |
| --- | --- |
| **Holder** | Claude Code (Fable 5.1), local session on Personal-HP |
| **Branch** | `claude/w3-fingerprint`, off `main` at `6f38c3e` (#279, #280, #281 merged 2026-09-20) |
| **Since** | 2026-09-19 |
| **Doing** | **W.3 done**: the model's `fingerprint(deck, state)` is now the engine's lineup hash over names, quantities and the commander flag (the sim already filed reports under it), with `tests/collection-model.mjs` holding the model's copy equal to `deck-measure.js`'s and pinning that an identity re-key does not move it; every reader passes state; the lobby draft's third fingerprint is gone. Rob's decisions on M-02 and M-15 are recorded in the plan (W.3b). 96 suites green. Next: W.3b (M-02 catalog figures shown as approximate; M-15 lobby decks behind a toggle with Save to Decks). |
| **Next for whoever picks this up** | §9.5 of the plan: W.2 → W.3 (B-13 fingerprint) → Rob decides M-02 and M-15 → W.4 → W.5 → E.4 → W.6 → C.6. Merge #279 (C.1) first. The target table is any 2–4 seats in any mix of human and AI, including a Claude-driven seat through the Chrome extension that can also troubleshoot mid-game. Readiness plan §12 steps 4–9 still need a person and a second browser. |

Update this file as your last act. Rules: `AGENTS.md`.
