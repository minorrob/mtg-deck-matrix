-- The owner's AI settings (ROB-338; docs/program/admin-pane-contract.md). One row so far: key "model", the Claude model the AI
-- door calls. It outranks the AI_MODEL variable and falls back to it (and then to the default) when there is no row; a row whose
-- model is not in cloud/ai.mjs MODELS keeps the door shut. Written by the owner alone (PUT /api/admin/ai-model and its undo).
--
-- Numbered 0011: the next free number on origin/main at 2026-10-31 (0007 and 0008 are reserved for the engine lane, 0009 is
-- feedback, 0010 match results). The ROB-320 branch adds a migration too, so the integrator may renumber this file.
-- Until it is applied the Worker reads no row, so the model is AI_MODEL's, and the Admin pane says the storage is missing.

CREATE TABLE ai_settings (
  key TEXT PRIMARY KEY,                  -- "model"
  value TEXT NOT NULL,                   -- the model id now in force
  previous TEXT,                         -- the model in force before the last change: the one-press undo
  updated_at TEXT NOT NULL,              -- ISO time
  updated_by TEXT NOT NULL               -- the owner's address, lower-cased
);
