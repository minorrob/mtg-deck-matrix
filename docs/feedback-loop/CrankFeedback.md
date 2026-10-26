# CrankFeedback@1: the report, the store and the loop's states

*The feedback loop, PR 1 (2026-10-26, the Claude · Engine lane, `claude/engine-feedback-store`). The plan is
`docs/feedback-loop/PLAN-2026-10-26.html`. This file is the contract the feedback sheet (PR 2, the Workshop shell and the
Play rail), the triage agent (PR 3) and the release notification (PR 5) build against.*

## The module both ends load

`feedback-schema.js`, at the repository root, loads as a classic script (it sets `globalThis.CrankFeedback`) and as a
module (`import schema from "../feedback-schema.js"`). The Worker bundles it (`cloud/feedback.mjs`); the pages fetch it
once PR 2 links it (and bump its `?v=`, the UI lane's rule).

| Export | For | Does |
| --- | --- | --- |
| `boundReport(draft)` | the sheet | Cuts a draft to the bounds: text to 2,000 characters, the console to its **last** 20 lines of 500, a screenshot over 1 MiB dropped, a field outside the schema dropped, a hashless build named `unreleased`. What it returns, the Worker takes. |
| `readReport(input)` | the Worker | Reads a report field by field; refuses anything over a bound or short a required field by name (`FeedbackInvalid`); drops unknown fields. Never reads who sent it. |
| `readPatch(input)` | the agent, the release workflow | Reads a change: `state` (one of the six), `issue` (a Linear key), `pr`, `release` (a commit), `messageId`. A move must carry what its state requires. |
| `STATES`, `nextState`, `mayMove`, `REQUIRES` | everyone | The loop's order and what each move must carry. |
| `LIMITS`, `KINDS`, `GROUPS`, `SCHEMA` | everyone | The bounds; `bug` and `enhancement`; `owner`, `insider`, `general`; `"CrankFeedback@1"`. |

## The report

```json
{
  "schema": "CrankFeedback@1",
  "kind": "bug",
  "text": "The attack question hid its Confirm button at 1366 wide.",
  "page": {"route": "#table/abc123de/game", "screen": "Play", "view": "Full"},
  "build": {"commit": "c567c581", "profile": "cloud-staging"},
  "game": {"tableId": "abc123de", "matchId": "abc123deg2", "turn": 7, "step": "declare attackers", "seat": "Rob", "decisionId": "d-41", "lastLine": "Maya attacks Rob with Fauna Shaman."},
  "deck": {"id": "deck-1", "name": "Krenko's Horde", "card": "Krenko, Mob Boss"},
  "device": {"viewport": {"width": 1366, "height": 768}, "pixelRatio": 1.5, "pointer": "fine", "browser": "Chrome", "reducedMotion": false, "theme": "dark"},
  "console": ["TypeError: x is not a function"],
  "screenshot": "data:image/webp;base64,..."
}
```

Required: `kind`, `text`, `page.route`, `build.commit` (a hash, or `unreleased`), `build.profile`, `device.viewport`.
Everything else is optional and dropped when empty. `game` and `deck` are what the sheet reads from the screen the person
is on; there is no field for a card in a hand or a zone, so the sheet cannot send another seat's cards. The sheet does not
send who the person is: the Worker takes the reporter from the Access token.

## The routes

| Route | Who | Answers |
| --- | --- | --- |
| `POST /api/feedback` with `x-crankmagic: feedback`, JSON | any signed-in person | `201 {feedback}` the row; `400` the bound or field, by name, nothing saved; `413` a body past a bounded report; `429` the eleventh in an hour, with `retryAfterSeconds`; `403` without the header or from another site; `401` signed out; `503` no database |
| `GET /api/admin/feedback?since=&state=&limit=` | the owner; the agent's service token | `200 {feedback: [...]}` oldest first, at most 200; `403` anyone else signed in; `401` signed out |
| `PATCH /api/admin/feedback/:id` with `x-crankmagic: feedback-admin`, JSON | the same two | `200 {feedback}`; `400` a bad field or a move short of what it must carry; `404` no such row; `409` a move that is not the next, with the row's `state` |

A row, as the admin routes answer it: the report's fields, plus `id`, `state`, `reporter` (the email), `group`,
`screenshot` (`null`: none sent; `"dropped"`: sent and not kept, R2 is not on; later an R2 key), `issue`, `pr`,
`release`, `messageId`, `createdAt`, `updatedAt`.

**The owner** is the administrator the release names (`INVITE_ADMIN_ID`, as `cloud/sharing.mjs` already reads it). The
access groups of the AI players plan (Owner, Insiders, General) replace that test when they are built; until then every
other person is `general`.

**The agent** is a Cloudflare Access service token for its own Access application, named to the Worker as
`FEEDBACK_AGENT_AUD`. The Worker admits a token for that audience with no email (a service token) as the agent, and a
person's token for the app's own application as a person. Unset, no agent is admitted. Setting up the application, its
Service Auth policy and the variable is a dashboard step of Rob's; the release profiles do not carry the variable yet.

## The states

`new` → `triaged` (carries `issue`) → `approved` → `in-progress` → `released` (carries `release`) → `notified` (carries
`messageId`). Each move is to the next state and no other: never a skip, never back. A PATCH without `state` attaches
`pr`, `issue`, `release` or `messageId` to the row as it is. The table itself refuses a state outside the six.

## The sheet (PR 2, `crankmagic-feedback.js`)

The control is one glyph, ✉ named "Send feedback": on every page's head (`pageHead`), beside More on a deck's page, in the
board's profile strip during a game and in its menu, and the Menu's Send Feedback. The sheet gathers everything but the
text and the kind: `C.board.held()` gives the game (the table, the match, the turn, the step, the seat's name, the
decision id, the last public history line, the view), `version.json` the build, the route and `C.route()` the page, the
deck page's `?deck=` and the card last under the pointer the deck, the window the device, and a ring of the last 20
console errors kept from the moment the script loads. A picture is the browser's own capture where it offers one, else
one chosen, encoded to WebP under 1 MiB. `C.feedback.draft({kind, text, screenshot})` is the report as it would go,
already bounded; a suite reads it. Signed out, the sheet refuses with Sign in and Email instead; with no account cloud,
the Menu's Send Feedback is the mailto it always was.

## The triage agent (PR 3, `tools/feedback-triage.mjs`, `.github/workflows/feedback-triage.yml`)

Hourly and on demand. It reads `GET /api/admin/feedback?state=new` with the agent's service token
(`CF-Access-Client-Id` and `CF-Access-Client-Secret` headers, the Access application `FEEDBACK_AGENT_AUD` names), groups
duplicates (the same screen and build, the words they share), picks the lane from the charter's file table by the route
and the files the console names, sets a severity (1 blocks play, 2 wrong result, 3 friction, 4 wish), files one Linear
issue per group (team ROB, the Lane label, `feedback`, the severity as the priority, the outcome project the route maps
to), and moves every row of the group with `PATCH {state: "triaged", issue}`. The issue's body lists every row id under
"Feedback rows", which PR 5 reads to move them on. The digest (fix now, batch, decline with the standing rule) is the
job summary and an artifact until PR 4 mails it. `node tools/feedback-triage.mjs --dry-run --fixtures
tests/fixtures/feedback-rows.json --out work/triage` runs the rules on the fixtures with nothing read or written
elsewhere.

## Proof

`node tests/feedback-store.mjs` (132 checks) and `python3 game/tools/batch/breaks.py tools/feedback-store-breaks.py`
(29 breaks, each caught). `tests/release-pages.mjs` proves the schema module and the migration ship with the Worker in
every cloud profile. The sheet: `GEOMETRY_REQUIRED=1 node tests/feedback-sheet.mjs` (38 checks) and
`tools/feedback-sheet-breaks.py` (18 breaks); the board's game context: `tests/table-board.mjs` and `tools/feedback-breaks.py`. The agent:
`node tests/feedback-triage.mjs` (75 checks) and `tools/feedback-triage-breaks.py` (24 breaks).
