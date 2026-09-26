-- The AI door (M6, docs/plan-to-100.md; docs/ai-door.md). Two tables, both empty until Rob fills the first.
--
-- ai_allowlist: who may use the AI features. Separate from the invite list on purpose: being able to keep a
-- library in the cloud does not make someone able to spend on the AI. Rob adds and removes rows himself
-- (docs/ai-door.md has the commands); the app has no screen that writes it.
--
-- ai_calls: every call the Worker makes to the AI provider, and every one it refused after spending: who, for
-- what, which model answered, the tokens, what it cost and how it ended. The spend caps are read from here, so
-- a call that is not logged is a call the cap cannot see -- the Worker logs before it answers.

CREATE TABLE ai_allowlist (
  email TEXT PRIMARY KEY,                -- lower-cased, as Cloudflare Access names the person
  added_at TEXT NOT NULL,
  note TEXT                              -- why they are on it, in Rob's words
);

CREATE TABLE ai_calls (
  id TEXT PRIMARY KEY,                   -- random UUID, minted by the Worker
  email TEXT NOT NULL,
  feature TEXT NOT NULL,                 -- "explain" (the score), and later the Coach and LLM seats
  model TEXT NOT NULL,                   -- the model that answered (a fallback, if one did)
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_micros INTEGER NOT NULL,          -- US dollars x 1,000,000, at the provider's list price
  outcome TEXT NOT NULL CHECK (outcome IN ('ok', 'refused', 'ungrounded', 'error')),
  at TEXT NOT NULL                       -- ISO time; the caps read a rolling 24 hours of it
);
CREATE INDEX ai_calls_by_email ON ai_calls (email, at);
CREATE INDEX ai_calls_by_time ON ai_calls (at);
