# The AI door (M6)

The Worker has one AI route, `POST /api/ai/explain`. It reads a deck's measured score back to its owner in plain
sentences (the design is `docs/ai-agents.md` §4). The code is `cloud/ai.mjs`, the tables are
`cloud/migrations/0002_ai.sql` and the proof is `tests/ai-door.mjs`.

**It is shut, and it stays shut until Rob opens it.** Each of the four M6 decisions (`docs/decisions-2026-09-25.md`,
row M6) is a gate that is closed while it is unset. None of them has a default that spends money. The browser does
not offer the feature yet. That comes after the privacy wording is approved (step 5).

## What Rob decides and does

Rob does these steps himself, in his own dashboards and terminal. The key never appears in chat, in this repository,
in a response or in the log.

| # | Gate | What to do | Until then |
| --- | --- | --- | --- |
| 1 | **Its own Access application** | In Cloudflare Zero Trust, add an application for `crankmagic.com/api/ai/*`. Use **Google only**, never the emailed one-time code, and passkey MFA if the plan offers it. Its policy is the people allowed to use AI. Copy the application's **AUD tag**. | 503, "AI features are not switched on here yet." A library sign-in never opens it, because its token is for another application. |
| 2 | **The allowlist** | Add each person with `wrangler d1 execute crankmagic --remote --command "INSERT INTO ai_allowlist (email, added_at, note) VALUES ('name@example.com', datetime('now'), 'why')"`. To remove someone, run `DELETE FROM ai_allowlist WHERE email = '…'`. Staging uses the `crankmagic-staging` database. | 403, "not on CrankMagic's list for AI features" |
| 3 | **The key** | Run `wrangler secret put ANTHROPIC_API_KEY` for the Worker, pasting the key only into the terminal's prompt. Set the key's own monthly limit in the Anthropic console too. | 503, "not switched on here yet" |
| 4 | **The spend caps** | Choose two numbers, in US cents over any 24 hours: **one person's** cap (`AI_CAP_PERSON_CENTS`) and **everyone's** together (`AI_CAP_TOTAL_CENTS`). For scale, one explanation costs about 1¢ to 2¢ on Claude Opus 5. Optionally choose `AI_MODEL`; unset, it is `claude-opus-5`. | 503, "no spend cap set, so they stay off" |
| 5 | **The privacy wording** | Approve or edit the draft below. It goes on `privacy.html` before the app offers any AI feature. | The app shows nothing AI |

After steps 1 and 4, the release tool needs the AUD tag, the two caps and the model as Worker variables for each
profile (`tools/release-pages.mjs`, `PROFILES`). That change is a small PR once the values exist. Until it lands,
the deployed Worker has none of them, so the door stays shut even with a key in place.

## What the door does once it is open

- **Who:** a person signed in through the AI application (step 1) whose email is on the allowlist (step 2). The
  same per-person rate limit as the library applies.
- **What is sent:** only what the request carries. That is the deck's name, its commander(s), its card names (at most
  120), the score and up to 12 of its measures, and up to five strongest and five weakest cards, each with a short
  note. It never sends the person's email, library, collection or prices paid. The request is capped at 64 KB.
- **The call:** the Messages API over `fetch`, since the Worker has no npm dependencies. It asks for structured
  output and low effort, with `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`), so a declined request
  is re-run server-side on the model Anthropic recommends instead of coming back as a refusal. There is a 30-second
  timeout.
- **What is shown:** only an answer in which every card named in `[[double brackets]]` was sent. Otherwise it says
  "named a card that is not in this deck" and shows nothing.
- **The log:** every call made goes in `ai_calls`, including errors (at no cost), refusals and ungrounded answers.
  Each row records who, the feature, the model that answered, the tokens, the cost and the outcome. Cost uses list
  prices of $5 and $25 per million tokens on Claude Opus 5. After a fallback, each attempt is priced at its own
  model's rate. A model the price list does not know is priced at the dearest rate, so the meter can only read high.
- **The caps** are read from the log over a rolling 24 hours, **before** anything is sent. The worst case (every
  input character a token, plus the whole output allowance) must fit under both caps. The answer carries the
  person's meter (spent against the cap).
- **Refusals the reader sees:**
  - 429: a cap has been reached;
  - 422: the model declined even after the fallback;
  - 502: the provider was busy or had a problem, and its own error text is never passed on;
  - 504: the provider did not answer in time.

## Draft privacy wording, for Rob to approve (step 5)

This would replace the "AI features" section of `privacy.html`:

> **AI features.** Some people, invited to them separately, can ask CrankMagic to explain a deck's measured score.
> When you do, CrankMagic sends Anthropic, the company that makes the Claude AI models, only what that
> explanation needs: the deck's name, its commander, its card names, and the score and figures the simulator
> measured. It does not send your email address, your library, your collection or what you paid. Anthropic
> processes the request to write the explanation and does not use it to train its models. CrankMagic keeps a
> record of each request (who asked, when, how large it was and what it cost) to hold spending to a limit, and
> deletes it with your account. AI features are off unless you have been invited to them, and you can ask to be
> removed at admin@crankmagic.com.

Two points in it are Rob's to confirm, not the code's:
- the training sentence, against the terms of Anthropic's commercial API at the time he switches the feature on;
- that `DELETE /api/account` should also delete the person's `ai_calls` rows. It does not yet; that follows once the
  wording is approved.
