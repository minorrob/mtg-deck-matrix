/* A PERSON'S LIBRARY IN THE CLOUD: a chain of saved versions and a head.
 *
 * A version is the app's own backup -- the checksummed file Menu -> Save a backup writes -- gzipped and
 * base64'd by the browser. The Worker never opens it: it stores the text, hands it back, and the browser
 * verifies the checksum and the schema on the way in, exactly as Restore does.
 *
 * THE HEAD MOVES ONLY FROM WHERE THE DEVICE LEFT IT. A save names the version the device started from
 * (`parent`); the head moves to the new version only if it still points at that parent. If another device
 * saved in between, the save is refused with the current head, and the device asks its person which to keep
 * (Rob, 2026-09-24: "Ask me which to keep"). Keeping this device's version is a save with `force`, which
 * marks the version it replaces `displaced`; keeping the cloud's first files this device's version as
 * `kept`. Both are held for thirty days, so neither choice loses anything.
 */
export const LIMITS = Object.freeze({body: 1_900_000, keepSync: 20, keepDays: 30, device: 80});

export class Conflict extends Error {
  constructor(head) {super("the library in the cloud has changed since this device last saw it"); this.name = "Conflict"; this.head = head;}
}
export class Invalid extends Error {
  constructor(why) {super(why); this.name = "Invalid";}
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const COLUMNS = "s.id, s.parent_id, s.kind, s.revision, s.device, s.checksum, s.size, s.created_at";
const describe = (row) => row ? {id: row.id, parent: row.parent_id ?? null, kind: row.kind, revision: row.revision,
  device: row.device, checksum: row.checksum, size: row.size, savedAt: row.created_at} : null;

/* What a device sends, checked before anything is written. `body` must be base64 of gzip ("H4sI" is how the
   gzip magic number reads in base64) and small enough for one D1 row. */
export function checkUpload(input, {requireParent = true} = {}) {
  const {parent = null, revision, device, checksum, body} = input || {};
  if (typeof body !== "string" || !body.startsWith("H4sI") || !/^[A-Za-z0-9+/]+={0,2}$/.test(body)) throw new Invalid("the library must arrive gzipped and base64-encoded");
  if (body.length > LIMITS.body) throw new Invalid(`the library is ${body.length.toLocaleString("en-US")} characters compressed; the cloud holds up to ${LIMITS.body.toLocaleString("en-US")}`);
  if (typeof checksum !== "string" || !/^[0-9a-f]{64}$/.test(checksum)) throw new Invalid("the backup's checksum is missing");
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Invalid("the device's revision is missing");
  if (requireParent && parent !== null && !UUID.test(parent)) throw new Invalid("the version this device started from is not one the cloud issued");
  const label = typeof device === "string" ? device.trim().slice(0, LIMITS.device) : "";
  return {parent, revision, device: label || "A device", checksum, body};
}

export function createLibrary(db, {now = () => new Date().toISOString(), newId = () => crypto.randomUUID()} = {}) {
  /* Seen-at moves at most hourly: every request passes through here, and D1's free plan counts writes. */
  async function user(email) {
    const at = now(), hourAgo = new Date(Date.parse(at) - 3_600_000).toISOString();
    await db.prepare("INSERT INTO users (email, created_at, seen_at) VALUES (?1, ?2, ?2) ON CONFLICT(email) DO UPDATE SET seen_at = excluded.seen_at WHERE users.seen_at < ?3").bind(email, at, hourAgo).run();
    return db.prepare("SELECT id, email, created_at AS createdAt FROM users WHERE email = ?1").bind(email).first();
  }

  async function head(userId) {
    return describe(await db.prepare(`SELECT ${COLUMNS} FROM heads h JOIN snapshots s ON s.id = h.snapshot_id WHERE h.user_id = ?1`).bind(userId).first());
  }

  /* Only the asking person's own versions are ever found: the user id is part of every lookup. */
  async function version(userId, id) {
    if (!UUID.test(String(id))) return null;
    const row = await db.prepare(`SELECT ${COLUMNS}, s.body FROM snapshots s WHERE s.id = ?1 AND s.user_id = ?2`).bind(id, userId).first();
    return row ? {...describe(row), body: row.body} : null;
  }

  async function history(userId, limit = 30) {
    const {results} = await db.prepare(`SELECT ${COLUMNS} FROM snapshots s WHERE s.user_id = ?1 ORDER BY s.created_at DESC, s.rowid DESC LIMIT ?2`).bind(userId, Math.min(Math.max(1, limit | 0), 100)).all();
    return results.map(describe);
  }

  const insert = (userId, id, kind, upload, at) => db.prepare(
    "INSERT INTO snapshots (id, user_id, parent_id, kind, revision, device, checksum, size, body, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)")
    .bind(id, userId, upload.parent, kind, upload.revision, upload.device, upload.checksum, upload.body.length, upload.body, at);

  /* Move the head, from `parent` only -- or, with `force`, from wherever it is, keeping what it replaces. */
  async function save(userId, input, {force = false} = {}) {
    const upload = checkUpload(input), id = newId(), at = now();
    const moveHead = "INSERT INTO heads (user_id, snapshot_id, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(user_id) DO UPDATE SET snapshot_id = excluded.snapshot_id, updated_at = excluded.updated_at";
    if (force) {
      await db.batch([
        insert(userId, id, "sync", upload, at),
        db.prepare("UPDATE snapshots SET kind = 'displaced' WHERE user_id = ?1 AND id = (SELECT snapshot_id FROM heads WHERE user_id = ?1)").bind(userId),
        db.prepare(moveHead).bind(userId, id, at),
      ]);
    } else {
      /* A first save (no parent) succeeds only where there is no head yet: '' never matches a version id. */
      const results = await db.batch([
        insert(userId, id, "sync", upload, at),
        db.prepare(`${moveHead} WHERE heads.snapshot_id = ?4`).bind(userId, id, at, upload.parent ?? ""),
      ]);
      if (!results[1].meta.changes) {
        await db.prepare("DELETE FROM snapshots WHERE id = ?1 AND user_id = ?2").bind(id, userId).run();
        throw new Conflict(await head(userId));
      }
    }
    await prune(userId);
    return head(userId);
  }

  /* This device's version, filed without moving the head -- what "use the cloud's copy" leaves behind. */
  async function keep(userId, input) {
    const upload = checkUpload(input), id = newId(), at = now();
    await insert(userId, id, "kept", upload, at).run();
    return describe({id, parent_id: upload.parent, kind: "kept", revision: upload.revision, device: upload.device, checksum: upload.checksum, size: upload.body.length, created_at: at});
  }

  /* The newest twenty everyday versions stay, and the head always does; a displaced or kept version stays
     thirty days, which is the promise the conflict dialog makes. */
  async function prune(userId) {
    const cutoff = new Date(Date.parse(now()) - LIMITS.keepDays * 86_400_000).toISOString();
    await db.batch([
      db.prepare(`DELETE FROM snapshots WHERE user_id = ?1 AND kind = 'sync'
        AND id NOT IN (SELECT snapshot_id FROM heads WHERE user_id = ?1)
        AND id NOT IN (SELECT id FROM snapshots WHERE user_id = ?1 AND kind = 'sync' ORDER BY created_at DESC, rowid DESC LIMIT ?2)`).bind(userId, LIMITS.keepSync),
      db.prepare("DELETE FROM snapshots WHERE user_id = ?1 AND kind IN ('displaced', 'kept') AND created_at < ?2 AND id NOT IN (SELECT snapshot_id FROM heads WHERE user_id = ?1)").bind(userId, cutoff),
    ]);
  }

  /* DELETE ACCOUNT (R3.3b; privacy.html promises it). Everything the cloud holds for one person -- the head,
     every version of every kind, the user row, and the record of each AI request they made (privacy.html, "AI
     features": "deletes it with your account"; Rob approved the wording 2026-10-09) -- in one batch, so it is all
     gone or none of it is. The head goes first because it points at a version. What it counts is what the person
     is told. The AI allowlist is Rob's, not the person's, and stays. */
  async function forget(userId, email) {
    const {versions} = await db.prepare("SELECT COUNT(*) AS versions FROM snapshots WHERE user_id = ?1").bind(userId).first();
    const {calls} = await db.prepare("SELECT COUNT(*) AS calls FROM ai_calls WHERE email = ?1").bind(email).first();
    await db.batch([
      db.prepare("DELETE FROM heads WHERE user_id = ?1").bind(userId),
      db.prepare("DELETE FROM snapshots WHERE user_id = ?1").bind(userId),
      db.prepare("DELETE FROM users WHERE id = ?1").bind(userId),
      db.prepare("DELETE FROM ai_calls WHERE email = ?1").bind(email),
    ]);
    return {versions: Number(versions), aiRequests: Number(calls)};
  }

  return {user, head, version, history, save, keep, prune, forget};
}
