-- Who invited whom, when, into which group (ROB-320; docs/program/rob-320-invitations-contract.md §5).
-- Rob, 2026-10-30: "Cap: 5 invitees per user, and every invitation is recorded in a data table (who invited whom, when, which group)".
--
-- One row per invited address (UNIQUE): a person is invited once; a second person asking to invite them spends no slot. The row is
-- written BEFORE the address is admitted to Cloudflare Access (status 'pending') and flips to 'admitted' only after the policies
-- confirm it, so there is never an admission without a row. If admission fails the row stays 'pending' and the same invitation sent
-- again resumes it with no second slot. The cap counts every row of an inviter, whatever its status.
--
-- Number: the next free on origin/main when this was written (0001-0006, 0009 and 0010 exist). Claude · Engine owns migration numbers
-- (AGENTS.md, ROB-11); renumber at integration if another branch took 0011.
CREATE TABLE invitations (
  id TEXT PRIMARY KEY,
  invitee_email TEXT NOT NULL UNIQUE,                       -- lower-cased, as Access names the person
  invitee_name TEXT NOT NULL,
  inviter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  inviter_email TEXT NOT NULL,
  grp TEXT NOT NULL CHECK (grp IN ('general', 'insider')),  -- General: no AI. Game Theory Insider: AI (a row in ai_allowlist)
  source TEXT NOT NULL CHECK (source IN ('settings', 'game')),
  table_id TEXT,                                            -- the game that brought them, when one did
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'admitted')),
  created_at TEXT NOT NULL,
  admitted_at TEXT
);
CREATE INDEX invitations_by_inviter ON invitations (inviter_id, created_at);
