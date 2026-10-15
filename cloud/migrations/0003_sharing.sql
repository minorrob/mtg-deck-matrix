-- Permissions refer to the owner's live library; no private backup is published.
CREATE TABLE profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '', avatar TEXT NOT NULL DEFAULT '', email TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE shares (
  id TEXT PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('deck','library')), source_id TEXT NOT NULL,
  public_role TEXT CHECK(public_role IN ('reviewer','collaborator')), revision INTEGER NOT NULL DEFAULT 1,
  UNIQUE(owner_id,kind,source_id)
);
CREATE TABLE share_grants (
  share_id TEXT NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('reviewer','collaborator')), PRIMARY KEY(share_id,user_id)
);
CREATE TABLE share_mail (
  id TEXT PRIMARY KEY, actor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient TEXT NOT NULL, subject TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed')),
  message_id TEXT, attempts INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE account_invitations (
  email TEXT PRIMARY KEY, name TEXT NOT NULL, invited_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','admitted'))
);
CREATE TABLE profile_email_changes (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE TABLE share_cas_guard (id TEXT PRIMARY KEY, ok INTEGER NOT NULL CHECK(ok=1));
CREATE TABLE account_identities (
  email TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  active INTEGER NOT NULL CHECK(active IN (0,1))
);
