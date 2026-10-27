# The AI door (M6)

The Worker has one AI route, `POST /api/ai/explain`. It reads a deck's measured score back to its owner in plain
sentences (the design is `docs/ai-agents.md` §4). The code is `cloud/ai.mjs`, the tables are
`cloud/migrations/0002_ai.sql` and the proof is `tests/ai-door.mjs`.

**It is shut, and it stays shut until Rob opens it.** Each of the four M6 decisions (`docs/decisions-2026-09-25.md`,
row M6) is a gate that is closed while it is unset. None of them has a default that spends money. The browser does
not offer the feature yet.

## Three access groups (Rob, 2026-10-26)

Rob: *"a user group authorized for everything in CrankHub. We'll call them Game Theory Insiders. The second user group
will be General Access. General Access will never be able to run or cause token costs ... The third user group is me,
and I would have access to absolutely everything."* `cloud/access.mjs` `groupOf(email, env, db)` answers one of three,
and every spending route asks it through `createAi(...).allowed` (`cloud/ai.mjs`):

| Group | Who | At the door |
| --- | --- | --- |
| `owner` | The one address in `OWNER_EMAIL`, a Worker variable set in the dashboard (staging and production each), never written in this repository; matched in any letter case | Everything, and `/api/admin/*` |
| `insider` | A row in `ai_allowlist`, which is now **the Insiders roster** | Explain, the Coach, the advisor, an AI on Claude at a table, the meter |
| `general` | Everyone else Access admits | Refused at every one of those, with the switch `AI_EVERYONE` on or off; the library, decks, the generator and Play against the rules-only AI are theirs |

- **`AI_EVERYONE` now widens the sign-in only** (the app's own Access application opens the AI door, so an insider needs
  no second sign-in). It no longer makes everyone signed in an insider: that was Rob's 2026-10-14 word, and his
  2026-10-26 word supersedes it. Staging and production keep it on, and only the roster and the owner spend.
- **The roster is the owner's:** `GET /api/admin/groups` lists it; `PUT /api/admin/groups` with
  `{"email": "...", "group": "insider" | "general", "note": "..."}` adds a person or takes them off (a person is general by
  being on no list). Anyone else gets 403 saying only the owner may. The `wrangler d1 execute` commands below still work
  and write the same table.
- **`/api/me` carries `group`**, so the browser can hide the controls a group may not press (the Workshop lane's
  Settings card and the deck page's AI button; the Play lane's lobby already follows `/api/ai-seat`). The Worker is the
  gate either way.
- **Proof:** `node tests/ai-door.mjs` (General Access refused with the switch on or off, by either sign-in; an insider
  answered at the app's own sign-in; the owner answered on no list and refused when `OWNER_EMAIL` is unset; `/api/me`'s
  group; the roster read and set by the owner alone), `node tests/agent-seat-table.mjs` (a host not on the roster refused
  with the switch on; the owner seats an AI on Claude), `node tests/cloud-worker.mjs` (`/api/me` says general).

## Open to everyone signed in (Rob, 2026-10-14; the sign-in half still holds, the spending half is superseded above)

Rob: *"I want the AI door open on staging and production for anyone that can sign in (e.g. given I am manually adding
who can access, I'm fine with those I want everyone I add to be able to use the AI features)."*

- **The switch** is `AI_EVERYONE` (`ai.everyone` in a release profile). On, the allowlist is everyone Access lets in,
  so the invite list is the one list Rob keeps, and the door takes the app's own sign-in (`ACCESS_AUD`) as well as an
  AI application's. Off, the allowlist and the AI application hold as before. The key, the caps, the model and each
  feature's own switch are unchanged.
- **Staging:** on (`cloud-staging`), and its key is set. **One step is Rob's:** Access still puts
  `staging.crankmagic.com/api/ai/*` behind "CrankMagic AI (staging)", whose policy is the three AI testers, so anyone
  else is stopped at Cloudflare before the Worker sees them. Delete that application (Zero Trust › Access ›
  Applications), so that `/api/ai/*` falls under staging's own sign-in; or give its policy the same people as
  staging's. The door takes either sign-in.
- **Production:** on in `cloud-production`, with no AI application of its own: `/api/ai/*` is under "CrankMagic
  accounts" (`crankmagic.com/api/*`), whose policy is the invite list. Staging's caps, model and features: 300¢ in any
  24 hours for everyone together, the Coach's 150¢ inside it, 25¢ a game for an AI on Claude, and the deck advisor, on
  Claude Haiku 5.5. **Two steps are Rob's:** the key (`ANTHROPIC_API_KEY`, a secret on the `crankmagic` Worker, with a
  monthly limit in the Anthropic console; none at 2026-10-14), and the go for the production release that carries
  it. Until the key is set, the door answers 503. The pages release, without Play, keeps the door shut.
- **The privacy page** says "signed in" where it said "invited to AI features", and that each feature runs only when
  someone asks for it (an AI player, when a table's host seats one).
- **Proof:** `node tests/ai-door.mjs` (a person not on the allowlist answered only with the switch on; the app's
  sign-in opens the door only with it on; a token for any other application still refused; the advisor's offer and
  the meter follow it; a service token never let in), `node tests/agent-seat-table.mjs` (a host not on the list seats an AI on Claude only with it
  on), `node tests/release-pages.mjs` (staging and production's Play release set it; the pages release and the
  standby do not). Breaks: `tools/ai-everyone-breaks.py`, 13, each caught.

## Where it stood (2026-10-09)

| Gate | Staging | Production |
| --- | --- | --- |
| 1. Access application | **Done.** "CrankMagic AI (staging)" on `staging.crankmagic.com/api/ai/*`, Google sign-in, its "AI Testers" policy three emails. The AUD tag is in `tools/release-pages.mjs` | Shut until Rob's go |
| 2. Allowlist | **Rob's:** the same three emails in `crankmagic-staging`'s `ai_allowlist` (0 rows at last check) | Shut |
| 3. Key | **Rob's:** `ANTHROPIC_API_KEY` as a secret on `crankmagic-staging` (none at last check), and a monthly limit in the Anthropic console | Shut |
| 4. Caps | **Done.** One cap for everyone, **300¢ in any 24 hours** (Rob: "I only want a general spending cap, not per person"); the per-person cap is given the same number, so it never binds first | Shut |
| Model | **Claude Haiku 5.5** (`claude-haiku-5-5`). Rob, 2026-10-09: *"We will always be using sonnet or other lowest cost models,"* then *"change the model use to Haiku explicitly."* The door calls only Haiku 5.5 or, at most, Claude Sonnet 5.5 (`claude-sonnet-5-5`); `AI_MODEL` naming any other keeps it shut, and the release tool refuses one | — |
| 5. Privacy wording | **Done.** Approved by Rob and on `privacy.html`; `DELETE /api/account` now deletes the person's `ai_calls` rows | — |

Both steps left are Rob's and can be done in the Cloudflare dashboard, with no terminal: the secret under Workers &
Pages › crankmagic-staging › Settings › Variables and Secrets (type **Secret**, which a release keeps), and the rows
in D1 › crankmagic-staging › Console, one `INSERT` per email as in step 2 below. Once the release with these settings
is on staging, `GET https://staging.crankmagic.com/api/ai/explain` after Google sign-in answers 405, "Explain is a
POST.": every gate before the call is open.

## What Rob decides and does

Rob does these steps himself, in his own dashboards and terminal. The key never appears in chat, in this repository,
in a response or in the log.

| # | Gate | What to do | Until then |
| --- | --- | --- | --- |
| 1 | **Its own Access application** | In Cloudflare Zero Trust, add an application for `crankmagic.com/api/ai/*`. Use **Google only**, never the emailed one-time code, and passkey MFA if the plan offers it. Its policy is the people allowed to use AI. Copy the application's **AUD tag**. | 503, "AI features are not switched on here yet." A library sign-in never opens it, because its token is for another application. |
| 2 | **The allowlist** | Add each person with `wrangler d1 execute crankmagic --remote --command "INSERT INTO ai_allowlist (email, added_at, note) VALUES ('name@example.com', datetime('now'), 'why')"`. To remove someone, run `DELETE FROM ai_allowlist WHERE email = '…'`. Staging uses the `crankmagic-staging` database. | 403, "not on CrankMagic's list for AI features" |
| 3 | **The key** | Run `wrangler secret put ANTHROPIC_API_KEY` for the Worker, pasting the key only into the terminal's prompt. Set the key's own monthly limit in the Anthropic console too. | 503, "not switched on here yet" |
| 4 | **The spend caps** | Choose two numbers, in US cents over any 24 hours: **one person's** cap (`AI_CAP_PERSON_CENTS`) and **everyone's** together (`AI_CAP_TOTAL_CENTS`). One cap only is the same number for both. For scale, one explanation costs about a tenth of a cent on Claude Haiku 5.5 (about 1¢ on Sonnet 5.5). `AI_MODEL` is Haiku 5.5 unset, and may be Haiku 5.5 or Sonnet 5.5 only. | 503, "no spend cap set, so they stay off" |
| 5 | **The privacy wording** | Approve or edit the draft below. It goes on `privacy.html` before the app offers any AI feature. | The app shows nothing AI |

The release tool gives each profile's Worker the AUD tag, the caps and the model as variables
(`tools/release-pages.mjs`, `PROFILES`, the profile's `ai`), and refuses a release whose variables differ from its
profile's. A profile with no `ai` (production, until Rob's go) has none of them, so its door stays shut even with a
key in place.

## What the door does once it is open

- **Who:** a person signed in through the AI application (step 1) whose email is on the allowlist (step 2). The
  same per-person rate limit as the library applies.
- **What is sent:** only what the request carries. That is the deck's name, its commander(s), its card names (at most
  120), the score and up to 12 of its measures, and up to five strongest and five weakest cards, each with a short
  note. It never sends the person's email, library, collection or prices paid. The request is capped at 64 KB.
- **The call:** the Messages API over `fetch`, since the Worker has no npm dependencies. It asks for structured
  output and low effort, on Claude Haiku 5.5 or Claude Sonnet 5.5 only. It asks for no server-side fallback, since
  a fallback can re-run a declined request on a dearer model than Rob allows. There is a 30-second timeout.
- **What is shown:** only an answer in which every card named in `[[double brackets]]` was sent. Otherwise it says
  "named a card that is not in this deck" and shows nothing.
- **The log:** every call made goes in `ai_calls`, including errors (at no cost), refusals and ungrounded answers.
  Each row records who, the feature, the model that answered, the tokens, the cost and the outcome. Cost uses list
  prices per million tokens: $0.10 and $0.50 on Claude Haiku 5.5, $2 and $10 on Claude Sonnet 5.5. A response that
  itemizes its attempts is priced attempt by attempt, each at its own model's rate. A model the price list does not
  know is priced at the dearest rate, so the meter can only read high.
- **The caps** are read from the log over a rolling 24 hours, **before** anything is sent. The worst case (every
  input character a token, plus the whole output allowance) must fit under both caps. The answer carries the
  person's meter (spent against the cap).
- **Refusals the reader sees:**
  - 429: a cap has been reached;
  - 422: the model declined;
  - 502: the provider was busy or had a problem, and its own error text is never passed on;
  - 504: the provider did not answer in time.

## The privacy wording (step 5), approved by Rob 2026-10-09

It is the "AI features" section of `privacy.html`:

> **AI features.** If you are signed in, you can ask CrankMagic to explain a deck's measured score.
> When you do, CrankMagic sends Anthropic, the company that makes the Claude AI models, only what that
> explanation needs: the deck's name, its commander, its card names, and the score and figures the simulator
> measured. It does not send your email address, your library, your collection or what you paid. Anthropic
> processes the request to write the explanation and does not use it to train its models. CrankMagic keeps a
> record of each request (who asked, when, how large it was and what it cost) to hold spending to a limit, and
> deletes it with your account. AI features are open to everyone signed in to CrankMagic, and each runs only when
> you ask for it (an AI player, when a table's host seats one). Questions about them go to admin@crankmagic.com.

Rob approved it as written. `DELETE /api/account` deletes the person's `ai_calls` rows with the rest of the
account (`cloud/library.mjs`, `forget`; proved in `tests/cloud-worker.mjs`). The allowlist row stays, because the
list is Rob's. The training sentence stands on the terms of Anthropic's commercial API; it is worth reading again
before production's door opens.

## The Coach (X13), through the same door

`POST /api/ai/coach` with `{tableId, question}`. The gates are the same as explain's: the AI application, the
allowlist, the key, the caps and the model. Then the Coach has its own switch, `AI_COACH`, because it sends a person's
hand and board, which the privacy page must name before the Coach is offered.
- **The brief** is built by the table (`game/room/coach-brief.mjs`, `GET /table/brief`, which only the Worker's AI door
  asks for). It comes from the asking seat's own view, never from anything the browser sends.
  - It holds the person's own hand, with what each card can do now.
  - It holds the board as everyone at the table sees it: life, poison, commander damage, permanents, graveyards,
    face-up exile, command zones, the stack, the step and the history's recent lines.
  - It holds their deck as a list sorted by name, and the library's count.
  - It never holds another seat's hand or library, a face-down card that is not theirs, or a library's order, not even a
    top card a look showed them.
- **The call:** the brief and the question, on Claude Haiku 5.5 at low effort. The instruction is the length control:
  one to three very concise sentences, aiming for one (Rob, 2026-10-09). Nothing measures the answer afterward.
  `max_tokens` is a cost ceiling only (1,200).
- **What is shown** is an answer in which every card it names, every play's card, every id it would highlight and the
  seat it calls the threat is in the brief. Otherwise it is not shown and is logged as ungrounded. Its calls are logged
  as `coach`, on the same caps.
- **Its own daily cap,** inside the general one, for everyone together: `AI_CAP_COACH_CENTS`, 150 on staging (Rob,
  2026-10-10: *"$1.50 for the coach per day is good"*). Only calls logged as `coach` count toward it. Reached, the Coach
  answers 429, *"The Coach has reached its spend cap for the last 24 hours. Try again tomorrow."*, while Explain goes on
  under the general caps. The release profile sets it as `ai.coachCapCents`, and `tools/release-pages.mjs` refuses a
  release that switches the Coach on without it.
- **The board:** the Coach panel asks the route. It shows the answer, with its cards in bold. *Show me* lights the cards
  on the board, and *Why?* opens each play's reason. Signed in to the library only, the panel offers the AI door's
  sign-in, which comes back to the table (`GET /api/ai/login?to=#table?id=…`).

### The Coach's privacy wording (Rob approved it, 2026-10-09)

It is in the "AI features" section of `privacy.html`, and the staging profile has `ai.coach: true` (`AI_COACH` on).
`tools/release-pages.mjs` refuses a release that switches the Coach on where the privacy policy does not say this.

> **The Coach.** At a table, anyone signed in can ask the Coach about their game. When you ask,
> CrankMagic sends Anthropic your question and what you can see at that table: your own hand, the board as everyone
> at the table sees it (including the names players use there), the stack, the game's recent history, and your deck's
> card list. It never sends another player's hand, the order of any library, your email address, your library or your
> collection. Anthropic processes it to write the answer and does not use it to train its models. CrankMagic keeps the
> same record of each request as for other AI features, and deletes it with your account.


## An AI on Claude (AI-2), through the same door

Rob, 2026-10-10: *"Use Haiku 5.5. 0.25 per game is good"* and *"I do want to deliver on L0 as part of the LLM AI seat
capability"*. A host may seat **An AI · Claude** on New table where the door would let them spend on it: its own switch,
`AI_PILOT`, the door's key, caps and model set, and the host on the allowlist (`GET /api/ai-seat` says whether to offer
it; the table's object checks again as it seats one, and refuses otherwise).
- **The seat** plays L1 at Normal (`game/engine/pilots/scored-pilot.mjs`), except at its close calls. A close call is
  the spells it would cast, or an attack, when L1's two best plans score within a point of each other
  (`game/engine/pilots/agent-pilot.mjs`). There the room offers the seat that one decision as it would a person.
- **The table's object** answers it on its alarm, so no person's request waits on a model (`cloud/game-room.mjs`,
  `agentTurns`).
  - **The brief** (`game/room/agent-brief.mjs`) is built from the seat's own view: its hand, the board as everyone
    sees it, the stack, the turn and the decision's options. L1's own choice is included as the hint. Every person's
    name becomes their seat ("Seat 1"), in the brief and in the options' words. Never another hand or a library's
    order.
  - **The call** (`cloud/ai.mjs`, `pilot`) is Claude Haiku 5.5 at low effort, answering `{indices, why}`. It is logged
    as `pilot` under the host, on the day's caps, and within the game's own cap: `AI_CAP_PILOT_GAME_CENTS`, 25 unless
    a profile says otherwise. The object keeps what the game has spent.
  - **When the model cannot answer** (the cap reached, a failure, an index the decision does not have, an answer the
    rules refuse), the seat's own pilot answers (`room.houseAnswer`). Either answer goes through `act`, onto the tape,
    so a replay never asks the model.
- **On staging since 2026-10-12:** `tools/release-pages.mjs` sets `AI_PILOT` (with the game's cap) only for a profile
  whose `ai.pilot` is true, and staging's is. It refuses a release that does so where `privacy.html` does not say what
  the seat sends, or without the game's cap. Rob approved the wording below on 2026-10-12, and it is on `privacy.html`.

### The privacy wording for an AI on Claude (Rob approved it, 2026-10-12)

> **AI players on Claude.** At a table, its host may seat an AI that plays on Claude, Anthropic's AI model, if they are
> signed in. At some of that AI's decisions, CrankMagic sends Anthropic the AI seat's own view of the game:
> its hand, the board as every player at the table sees it, and the choices it has. It never sends a person's hand, the
> order of any library, or anyone's name: players are named by their seat. Each request is logged under the host's
> account with what it cost, the day's limits hold it, and each game is capped at 25¢. Anthropic does not use what it
> is sent to train its models.

## The deck advisor (AI-4), through the same door

The plan's AI-4: *"AI suggestions to update a deck ... from an agent that lets a very low-cost model be very good at
advising seasoned players."* **Ask the AI advisor** is under a deck's More menu where the door would answer the person:
its own switch, `AI_ADVISE`, the door's key, caps and model set, and the person on the allowlist (`GET /api/ai-advise`
says whether to offer it).
- **The page sends the deck's id and the person's goal** (at most 300 characters), nothing more (`crankmagic-advisor.js`).
- **The Worker builds the brief** from the person's latest version in the cloud (`cloud/advise.mjs`): the deck, its
  measured roles and curve, the hundred, the candidates the code finds among the person's own cards and lists (the bench,
  To buy, Watching, on order), and the constraints (`cloud/advise-brief.mjs`). Each card's facts come from the catalog,
  slimmed for the Worker (`cloud/advise-cards.mjs`, generated from `data/cards.json`). A deck not yet saved to the cloud is
  refused, saying so. It reads the person's AI Coach settings (AI-6) from the same library: cards they do not own only
  when they ask for them (then the catalog's, Commander-legal, ten places of their own), their own first unless they
  say otherwise, the bracket's game-changer cap unless they lift it, and the advice short or detailed.
- **The call** (`cloud/ai.mjs`, `advise`) is the door's model at low effort, with the advisor's instruction as a cached
  prefix and the answer's schema (`{changes: [{out, in, role, why}], keep, summary}`). The eval asks with the same body
  (`tests/ai-advise-eval/run.mjs`), so it measures what is shipped. Logged as `advise`, on the day's caps.
- **Grounding:** a swap is shown only when its card out is in the deck and not the commander or kept, and its card in is a
  candidate; the rest are dropped and counted, and an answer with none left is not shown.
- **The answer is a review, never a change.** Each swap is a row to tick; a ticked swap is saved as the deck's linked
  upgrade (the card in, for the card out's slot), and the person applies it from the Upgrades tab when they choose.
- **On staging since 2026-10-12:** `tools/release-pages.mjs` sets `AI_ADVISE` only for a profile whose `ai.advise` is
  true, and staging's is. It refuses a release that does so where `privacy.html` does not say what the advisor sends.
  Rob approved the wording below on 2026-10-12, and it is on `privacy.html`.
- **Rob's, as well:** the eval (`node tests/ai-advise-eval/run.mjs --yes`, with his key) and the swaps he would refuse,
  in `tests/ai-advise-eval/rubric.json` (*"the rubric is an afternoon of his, before AI-4 is judged"*).

### The privacy wording for the deck advisor (Rob approved it, 2026-10-12)

> **The deck advisor.** On a deck's page, if you are signed in, you may ask Claude, Anthropic's AI model, to
> suggest swaps. CrankMagic sends Anthropic that deck's list, each card with its roles, whether you own it, its market
> price and rank; the cards you own, have ordered, or have on your To buy and Watching lists that could go in it, and, if
> your AI Coach settings allow it, cards you don't own; the deck's own settings; and the goal you type, if any. It never sends your name or email, what you paid for a card, or another person's library. Each
> request is logged under your account with what it cost, and the day's limits hold it. A suggestion changes nothing until
> you save it, and Anthropic does not use what it is sent to train its models.
