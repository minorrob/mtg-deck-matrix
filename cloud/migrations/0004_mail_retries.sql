-- Provider idempotency lasts 24 hours. Never repeat an uncertain send beyond that window.
ALTER TABLE share_mail ADD COLUMN first_attempt_at TEXT;
ALTER TABLE share_mail ADD COLUMN last_attempt_at TEXT;
