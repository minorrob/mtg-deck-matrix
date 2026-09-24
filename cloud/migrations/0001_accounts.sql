-- Account Cloud, Stage 2 (docs/plan-account-cloud.md). One row per person who has signed in; each
-- person's library as a chain of saved versions (snapshots); and a head pointing at the version every
-- device should converge on. A snapshot's body is the app's own checksummed backup (the file Menu ->
-- Save a backup writes), gzipped by the browser and stored as base64 TEXT: D1 returns a BLOB as a
-- JavaScript array of numbers, which a Worker on a 10 ms CPU budget should never have to build.

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,            -- lower-cased, from the Cloudflare Access token
  created_at TEXT NOT NULL,
  seen_at TEXT NOT NULL
);

CREATE TABLE snapshots (
  id TEXT PRIMARY KEY,                   -- random UUID, minted by the Worker
  user_id INTEGER NOT NULL REFERENCES users(id),
  parent_id TEXT,                        -- the version the device started from; NULL for a first save
  kind TEXT NOT NULL CHECK (kind IN ('sync', 'displaced', 'kept')),
  revision INTEGER NOT NULL,             -- the device's local revision when it saved (for the reader)
  device TEXT NOT NULL,                  -- "Chrome on Windows", as the device describes itself
  checksum TEXT NOT NULL,                -- the backup's own SHA-256; the browser verifies it on the way back
  size INTEGER NOT NULL,                 -- length of body, in characters
  body TEXT NOT NULL,                    -- base64 of the gzipped backup
  created_at TEXT NOT NULL
);
CREATE INDEX snapshots_by_user ON snapshots (user_id, created_at DESC);

CREATE TABLE heads (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id),
  updated_at TEXT NOT NULL
);
