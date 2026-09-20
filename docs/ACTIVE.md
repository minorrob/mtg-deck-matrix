# Who holds the work

| | |
| --- | --- |
| **Holder** | Claude Code (Fable 5.1), local session on Personal-HP |
| **Branch** | `claude/c2-connection-panel`, PR [#276](https://github.com/minorrob/mtg-deck-matrix/pull/276), off `main` at `dc316b4` (#273, #274, #275 merged 2026-09-19) |
| **Since** | 2026-09-19 |
| **Doing** | **C.2 done** on #276: `game/ui/connection.mjs` draws who the table is waiting on (state per seat, going-quiet warning, countdown, launch stage) on the host live table, the guest seat lobby and the workshop Play lobby, from the readiness object C.3 already carried; 8 tests built from real table transitions. On the way: `game/ui/setup.mjs` had not parsed since 2026-09-17 (one missing parenthesis), so the host's Game setup page could not load; fixed, and `ui-modules-parse.test.mjs` now parses every online UI module. 94 suites green. Panel rendered in both stylesheets for Rob's review. |
| **Next for whoever picks this up** | Merge #276. Then C.1 (unknown-card swap UI: B.2 already returns `{name, quantity, reason, suggestions}` through both APIs; the page is not written), then E.4 (server-side 99-engine repair loop in `setup-catalog.mjs`), then C.6 (needs a Forge build here). The target table is any 2–4 seats in any mix of human and AI, including a seat driven by Claude through the Chrome extension that can also troubleshoot mid-game. §12 of `game/docs/readiness-plan-2026-09-18.md` steps 4–9 still need a person and a second browser; the host setup page now loads, which step 4 depends on. |

Update this file as your last act. Rules: `AGENTS.md`.
