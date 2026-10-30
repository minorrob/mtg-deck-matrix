# Admin pane (owner only): the contract (ROB-338, patch ROB-334)

Written before either half was built, 2026-10-31. Rob's words (ROB-338, 2026-10-30): the third group "is only for me ...
the administrative controls. That is the model settings. I would like to be able to change the model based on the models
available to us from the API in the admin pane ... and also it's the ability to run AI-only games and observe."

Nothing here is verified against the real Anthropic API. Every test fakes it.

## 1. Who: the owner, on every admin route

The owner is `groupOf(email, env, db) === "owner"` (`cloud/access.mjs`: the address in `OWNER_EMAIL`). The Worker decides, on
each request, before it reads a body or touches the database or the API. Anyone else (an Insider, General, a service token, a
request with no token) is refused with `403` and `{error: "Only CrankMagic's owner can change the AI model."}` (the sentence
names what the route does). The pane in the browser is a convenience: it draws the AI model and AI-only game sections only when
`/api/me` says `group: "owner"`, and it fetches nothing from the new routes before that.

The older read-only Admin routes (`GET /api/admin`, `/features`, `/spend`, `/health`, `/invites`) keep their own rule (the
administrator: `OWNER_EMAIL`, else `ADMIN_EMAIL`, else the invite admin). They are not changed here. See "Open questions".

## 2. The stored model setting

Migration `cloud/migrations/0011_ai_settings.sql` (numbering is the engine lane's; 0011 is the next free number on
`origin/main` at 2026-10-31, where 0007 and 0008 are reserved. ROB-320 also adds a migration, so the integrator may renumber;
nothing in the code names the number except the file name and the suites that read the file):

```sql
CREATE TABLE ai_settings (
  key TEXT PRIMARY KEY,        -- "model"
  value TEXT NOT NULL,         -- the model id now in force
  previous TEXT,               -- what was in force before the last change: the one-press undo
  updated_at TEXT NOT NULL,    -- ISO time
  updated_by TEXT NOT NULL     -- the owner's address, lower-cased
);
```

Which model a call uses, read at call time: the stored `model` row; else `AI_MODEL`; else `DEFAULT_MODEL`
(`claude-haiku-5-5`). `settings(env, stored)` in `cloud/ai.mjs` takes the stored value; `storedModel(db)` reads it
(a database without the table, or no database, reads as nothing stored). Every place that calls `settings` reads the row first:
the AI door (`aiDoor`), the meter, the seat's switch (`aiSeatOpen`) and the table's LLM seat (`cloud/game-room.mjs`). A stored
model that is not in `MODELS` keeps the door shut, as an `AI_MODEL` outside `MODELS` always has.

**Undo.** A change stores `previous` = the model in force before it (stored, env or default). `undo` sets `value` back to
`previous` and `previous` to the model it replaced, so a second press puts the change back. With nothing to go back to, undo
is refused and says so.

## 3. The list of models, and how the allow-list meets it

`GET https://api.anthropic.com/v1/models?limit=1000` with the Worker's `ANTHROPIC_API_KEY` (`x-api-key`,
`anthropic-version: 2023-06-01`), following `has_more` / `last_id` for at most five pages. Only `id` and `display_name`
are used.

`MODELS` in `cloud/ai.mjs` stays the allow-list (Rob, 2026-10-09: "We will always be using sonnet or other lowest cost
models"). A model may be chosen only if it is **both** reported by the API for this key **and** in `MODELS`:

| In the API's list | In `MODELS` | The pane shows | `PUT` |
| -- | -- | -- | -- |
| yes | yes | selectable | stored |
| yes | no | listed, not selectable: "CrankMagic does not use this model (it is dearer than the models Rob allows)" | `422`, nothing stored |
| no | either | not listed | `422`, nothing stored: "the API does not list that model for this key" |

The list is read on each open of the pane and on each `PUT` (no cache: it is the owner's occasional screen). If the API cannot be
reached, the pane says so, shows the model in force, and a `PUT` is refused (`502`, nothing changed): a model cannot be
checked against a list that did not load. Undo does not need the list (it returns to a model that was chosen when it was valid
and is still in `MODELS`).

## 4. Routes

| Route | Body | Answer |
| -- | -- | -- |
| `GET /api/admin/ai-model` | | `200 {owner: true, model: {id, source: "stored"\|"env"\|"default"}, previous: id\|null, default, updatedAt\|null, models: [{id, name, allowed, current, reason?}], listError?: string, storage: "ready"\|"missing"}` |
| `PUT /api/admin/ai-model` | `{model}` | `200` the same as GET after the change; `400` no model; `422` not allowed / not listed; `502` list did not load; `503` no database, no key, or migration 0011 not applied |
| `POST /api/admin/ai-model/undo` | `{}` | `200` as above; `409` nothing to undo |

Writes carry `x-crankmagic: sync` and `content-type: application/json`, as `PUT /api/admin/groups` does.

## 5. The AI-only table and the observer: reused, not invented

The table already has it (`docs/ui-lane/lounge-contract.md` §1 and §4; `game/room/lounge.mjs` `observe`;
`cloud/game-room.mjs`): `POST /api/tables` with `observe: true` is the owner's alone (`403` for anyone else), takes two to
four AI seats and no one else, seats no person, and its watcher is a spectator: `connect?watch=1`, whose view has no
decision, no hand, no mana sources, and whose every action frame answers `{type: "refused"}` and is not applied. The game files
no result. `tests/lounge-registry.mjs`, `tests/lounge-results.mjs` and `tests/lounge-watch.mjs` prove the pieces; this issue
adds one suite that proves them together from the owner's side, and refuses General and Insider at the same door.

The Admin pane's "AI-only game" section is a second way into that flow (the New game pop-up's Observe switch is the first):
it makes the table with `observe: true`, saves the rules, lets the browser pick decks for the AI seats
(`C.tableTools.finishTableSetup`), and opens the table. The owner starts it from the lobby, as any host does, and watches.

Defaults, the narrowest sensible, each an open question for Rob: **2** AI seats; level **Normal**; names and personas the
lobby gives; **private**; 40 life; any bracket; no house rules; no AI on Claude (the `llm` level is never offered here, so an
AI-only game spends nothing); speed is the room's own (no setting).

## 6. Files

New: `cloud/migrations/0011_ai_settings.sql`, `cloud/ai-model.mjs` (`storedModel`, `listModels`, `modelAdmin`),
`crankmagic-admin-ai.js` (the panes), this document, `tests/admin-ai-model.mjs`, `tests/admin-ai-table.mjs`,
`tests/admin-ai-ui.mjs`. Changed, minimally: `cloud/ai.mjs` (`settings(env, stored)`), `cloud/worker.mjs` (the routes, and the
stored model read at each `settings` call), `cloud/game-room.mjs` (the stored model read at its two `settings` calls),
`crankmagic-admin.js` (the owner flag and the hook the panes plug into: `C.adminOwnerPanes`, `C.ownerAllowed`),
`index.html`, `crankmagic.html`, `crankmagic-sw.js` (the new script), `tests/agent-seat-table.mjs` (one block: the table's AI
seat uses the stored model), `README.md`, `tests/fixtures/asset-versions.json` and the `?v=` bumps.

## Open questions for Rob

1. Should the owner be able to choose any model the API lists that CrankMagic can price (Opus included)? Built: no, only
   `MODELS` (Haiku 5.5 and Sonnet 5.5), because of the 2026-10-09 rule.
2. AI-only games: seats (2 to 4, default 2), decks (the browser picks for each AI seat, as in the lobby), speed (the room's own).
   Say which of these should be settings.
3. The older read-only Admin pages admit `ADMIN_EMAIL` and the invite admin as well as the owner. Should they be the owner's alone?
