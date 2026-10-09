# The AI door (M6)

The Worker has one AI route, `POST /api/ai/explain`. It reads a deck's measured score back to its owner in plain
sentences (the design is `docs/ai-agents.md` §4). The code is `cloud/ai.mjs`, the tables are
`cloud/migrations/0002_ai.sql` and the proof is `tests/ai-door.mjs`.

**It is shut, and it stays shut until Rob opens it.** Each of the four M6 decisions (`docs/decisions-2026-09-25.md`,
row M6) is a gate that is closed while it is unset. None of them has a default that spends money. The browser does
not offer the feature yet.

## Where it stands (2026-10-09)

| Gate | Staging | Production |
| --- | --- | --- |
| 1. Access application | **Done.** "CrankMagic AI (staging)" on `staging.crankmagic.com/api/ai/*`, Google sign-in, its "AI Testers" policy three emails. The AUD tag is in `tools/release-pages.mjs` | Shut until Rob's go |
| 2. Allowlist | **Rob's:** the same three emails in `crankmagic-staging`'s `ai_allowlist` (0 rows at last check) | Shut |
| 3. Key | **Rob's:** `ANTHROPIC_API_KEY` as a secret on `crankmagic-staging` (none at last check), and a monthly limit in the Anthropic console | Shut |
| 4. Caps | **Done.** One cap for everyone, **300¢ in any 24 hours** (Rob: "I only want a general spending cap, not per person"); the per-person cap is given the same number, so it never binds first | Shut |
| Model | **Claude Sonnet 5.5** (`claude-sonnet-5-5`). Rob, 2026-10-09: *"We will always be using sonnet or other lowest cost models."* The door calls only Sonnet 5.5 or Claude Haiku 5.5 (`claude-haiku-5-5`); `AI_MODEL` naming any other keeps it shut, and the release tool refuses one | — |
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
| 4 | **The spend caps** | Choose two numbers, in US cents over any 24 hours: **one person's** cap (`AI_CAP_PERSON_CENTS`) and **everyone's** together (`AI_CAP_TOTAL_CENTS`). One cap only is the same number for both. For scale, one explanation costs about 1¢ on Claude Sonnet 5.5. `AI_MODEL` is Sonnet 5.5 unset, and may be Sonnet 5.5 or Haiku 5.5 only. | 503, "no spend cap set, so they stay off" |
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
  output and low effort, on Claude Sonnet 5.5 or Claude Haiku 5.5 only. It asks for no server-side fallback, since
  a fallback can re-run a declined request on a dearer model than Rob allows. There is a 30-second timeout.
- **What is shown:** only an answer in which every card named in `[[double brackets]]` was sent. Otherwise it says
  "named a card that is not in this deck" and shows nothing.
- **The log:** every call made goes in `ai_calls`, including errors (at no cost), refusals and ungrounded answers.
  Each row records who, the feature, the model that answered, the tokens, the cost and the outcome. Cost uses list
  prices per million tokens: $2 and $10 on Claude Sonnet 5.5, $0.10 and $0.50 on Claude Haiku 5.5. A response that
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

> **AI features.** Some people, invited to them separately, can ask CrankMagic to explain a deck's measured score.
> When you do, CrankMagic sends Anthropic, the company that makes the Claude AI models, only what that
> explanation needs: the deck's name, its commander, its card names, and the score and figures the simulator
> measured. It does not send your email address, your library, your collection or what you paid. Anthropic
> processes the request to write the explanation and does not use it to train its models. CrankMagic keeps a
> record of each request (who asked, when, how large it was and what it cost) to hold spending to a limit, and
> deletes it with your account. AI features are off unless you have been invited to them, and you can ask to be
> removed at admin@crankmagic.com.

Rob approved it as written. `DELETE /api/account` deletes the person's `ai_calls` rows with the rest of the
account (`cloud/library.mjs`, `forget`; proved in `tests/cloud-worker.mjs`). The allowlist row stays, because the
list is Rob's. The training sentence stands on the terms of Anthropic's commercial API; it is worth reading again
before production's door opens.
