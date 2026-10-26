-- The feedback loop, PR 1 (docs/feedback-loop/PLAN-2026-10-26.html, section 2): a report from any page or mid-game, kept
-- here before anything else sees it, and every later step of the loop written back to the same row (the Linear issue,
-- the PR, the release, the message that thanked the person). Written by cloud/feedback.mjs; the record's shape is
-- CrankFeedback@1 (feedback-schema.js). 0007 and 0008 are reserved (docs/ACTIVE.md, the engine lane), so this is 0009.
--
-- The reporter is the signed-in person Access named, never what the sheet typed. No column, and no field of the
-- report, holds a card, a hand or a zone: a report says where the person was and what they saw.
CREATE TABLE feedback (
  id TEXT PRIMARY KEY,                       -- random UUID, minted by the Worker
  reporter TEXT NOT NULL,                    -- the person's email, lower-cased, from the Access token
  reporter_group TEXT NOT NULL CHECK (reporter_group IN ('owner', 'insider', 'general')),
  kind TEXT NOT NULL CHECK (kind IN ('bug', 'enhancement')),
  state TEXT NOT NULL CHECK (state IN ('new', 'triaged', 'approved', 'in-progress', 'released', 'notified')),
  route TEXT NOT NULL,                       -- the hash route the report came from, for the agent's grouping
  build_commit TEXT NOT NULL,                -- version.json's commit, or 'unreleased'
  build_profile TEXT NOT NULL,               -- version.json's profile: cloud-staging, cloud-production, ...
  report TEXT NOT NULL,                      -- the CrankFeedback@1 record as JSON, without its screenshot
  screenshot TEXT,                           -- NULL: none sent; 'dropped': sent and not kept (R2 is not on); later an R2 key
  issue TEXT,                                -- the Linear issue key, from triage on
  pr INTEGER,                                -- the pull request's number, once there is one
  release_commit TEXT,                       -- the commit of main that released the fix
  message_id TEXT,                           -- the thank-you email's message id, once sent
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX feedback_by_state ON feedback (state, created_at);
CREATE INDEX feedback_by_reporter ON feedback (reporter, created_at);
