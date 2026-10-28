-- The lounge's results (docs/ui-lane/lounge-contract.md, sections 1 and 6). One row per PERSON's seat in a game the server
-- finished, written by the table's Durable Object when the game ends (game/room/lounge.mjs, cloud/lounge.mjs recordResults);
-- never a row for an AI seat. The Pre-lobby's Leaderboard (GET /api/leaderboard) reads it. Until this migration is applied
-- the leaderboard answers {rows: []} and the table keeps its rows to retry, so nothing is lost by applying it late.
--
-- Numbered 0010: 0007 and 0008 stay reserved for the engine lane (docs/ACTIVE.md, "Migration numbers"), 0009 is feedback.
-- The AI-players branch plans its own `games` table; this one is `match_results` so the two never meet.
--
-- outcome: win | loss | tie | unfinished. A conceded game is a loss; a game ended by "End game" or the host's Quit before a
-- result, or a person who ran out of time, is unfinished; every seat of a drawn game is a tie.

CREATE TABLE match_results (
  match_id TEXT NOT NULL,                -- the table's match id (<tableId>g<n>)
  seat_id TEXT NOT NULL,                 -- "s0".."s3": one row per person's seat in the match
  email TEXT NOT NULL,                   -- lower-cased, as Cloudflare Access names the person; never returned by any route
  name TEXT NOT NULL,                    -- the display name the seat bore at the table
  outcome TEXT NOT NULL CHECK (outcome IN ('win', 'loss', 'tie', 'unfinished')),
  humans INTEGER NOT NULL,               -- people at the table
  ai INTEGER NOT NULL,                   -- AI seats at the table
  turns INTEGER,                         -- the game's turn count when it ended
  ended_at TEXT NOT NULL,                -- ISO time
  PRIMARY KEY (match_id, seat_id)        -- a retry writes nothing twice
);
CREATE INDEX match_results_by_email ON match_results (email, ended_at);
