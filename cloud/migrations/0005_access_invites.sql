-- Serialize invitation updates across Worker instances. Expired holders cannot release a newer lease.
CREATE TABLE access_invite_locks (
  id TEXT PRIMARY KEY, holder TEXT NOT NULL, expires_at TEXT NOT NULL
);
