# Session F2 · Workshop: acquire, box, share, play home and lobby, results, settings, admin

Repo minorrob/mtg-deck-matrix. Branch `claude/r4-f2-own-results` from `integration/r4`. PR against `integration/r4`; do not merge. Starts when S0 has merged; fully parallel with everything else. CH-86's results panel reads E's game record (CH-59): build it against the contract and rebase when E lands.

Read first: `00-task-list.md`, `01-unified-change-set.md` §0–§2 and §3.9, §4, §1 (RQ-12 for the Confirmations dialog), `AGENTS.md`, `docs/ACTIVE.md`, Design System READMEs `Dialog`, `Toast`, `TableRow`, `FormControls`, `AccountMenu`, `Button`, `StatusChip`, `NeonCallout`, and `project/frames/play-lobby.html`. Audit: walkthrough pages P25–P40, P51, P52, P57–P67; remediations R-18 (if present), R-19 … R-24, R-29, R-32, R-33; the Admin Panel brainstorm named in R-32.

## Scope

CH-80 … CH-89. Files: Acquire / Library / box modules, the deck "More" menu and Share, Play home and the lobby (`crankmagic-play*.js` lobby parts, not the board), Log a game, Settings and its dialogs, Invite, the Help panel, tours door. Not: the deck journey (F1), the board (D1/A/B/C/D2).

## Change

1. **CH-80 One to-buy number (R-19, P1).** Acquire, Library › To buy and the deck header read one rung count source; TableRow per DS (48px, quantity, name, pips, price in `color-money` tabular, status chip, trailing verb, overflow); group rows under an h3 with a count and caption.
2. **CH-81 Share Deck (R-20, P0).** The "Share deck" menu item opens a DS Dialog (link, visibility, copy link primary) instead of an error toast; the toast after copying is the DS success toast; a share failure is a DS error toast that never times out and offers retry.
3. **CH-82 Lock feedback (R-21, P1).** Lock list shows an immediate busy state on the button and ends with a success toast "Locked · 46 to buy" with Undo while it applies.
4. **CH-83 Pull sheet (R-22).** "Do all available (53)" confirms in a DS dialog naming the count; stats collapse; a "box done" moment with "Take it to the table" as the primary; row text rewritten per the content rules.
5. **CH-84 New table (R-23, F-076 P1).** Inline validation under the field (required marker, error with the alert glyph); the layout does not shift when a deck is chosen; "Choose a deck" stays inside Play; one door from Play home.
6. **CH-85 Lobby (R-24).** One primary (Ready, then Start for the host); the AI seat picks its deck on seating (host override kept); one deck list (no duplicate names); the countdown uses D1's callout helper (table dims, 72px figure, sound).
7. **CH-86 Results loop (R-29, F-095/F-097 P1).** Play home with a table in progress: the hero is the table card (both commanders, turn, life) with Resume primary and Leave table secondary; game over: a results panel from E's record with Rematch / Back to lobby / Review this game (opens the deck's Record card at that game); Log a game: Outcome and Card that won it first, Bracket prefilled from the deck, pod and seat from the last record, no "Not recorded" defaults; saving with a dead card offers "Mark <card> for replacement" (an Upgrade Path row + Explore with replace=<card>).
8. **CH-87 Settings (R-33).** Switches with visible state (ink inversion); Clear all data behind a danger-fill confirm like Delete account; history filters out "Saved view preferences"; one label "Settings" from the menu, the pill and the board; the Confirmations dialog lists the RQ-12 way-back classes (cancel on choices, undo after a play, confirm before concede/end) as read-only rows until they are switchable; Side Drawer Modules matrix shows the real controls or none.
9. **CH-88 Admin v1 (R-32, F-105 P1).** Gate (`admin: true` in `/api/me`, Cloudflare Access on `/api/admin/*`, the page hiding a button is never the lock), home, People and invites (the Invite form gets a list of invitees and a sent state), Feature switches with code defaults and a change log with reset. Scope to the brainstorm's first slice.
10. **CH-89 Tours door.** "Take a tour" on the Help ? panel and a quiet link on the landing page (coordinate the landing line with F1 by placing it in the Help panel only if F1's PR already touched the hero).

## Acceptance

- The to-buy count is identical on Acquire, To buy and the deck header for the same deck (test fixture with one owned/ordered/to-buy mix).
- Share deck opens a dialog with a copyable link; no error toast on the happy path.
- Lock: busy state within 100ms; success toast with Undo.
- New table: empty name shows the error under the field and does not toast; choosing a deck does not move the Set the table button.
- Lobby: at most one `.cm-btn--primary`; the AI seat is never "Choosing a deck" after seating.
- Results: a finished fixture game shows the panel with three actions; Log a game with a dead card offers the replacement action and it creates an Upgrade Path row.
- Settings: switches expose `aria-checked`; Clear all data requires the typed confirm; the literal "Settings" label appears once per surface.
- Admin: `/api/admin/*` refuses without the gate; the admin home renders for the owner; invites list shows a sent row.
- All in three themes at 1440 and 390.

Test: the suites named in R-19 … R-24, R-29, R-32, R-33 (`tests/game-record.mjs` new, settings/library/acquire suites), extended; breaks scripts; `tools/local-ci.sh`; one green Actions run. PR title `r4 F2: one to-buy number, share dialog, lock feedback, pull sheet, lobby, results loop, settings, admin v1`. Stop.
